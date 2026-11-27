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

    // Subcategorías de Recámaras por tamaño (Camas/Bases/Cabeceras) que permanecen agrupadas dentro de su categoría;
    // Salas y Exterior se muestran agrupadas en TODOS y desagrupadas pieza por pieza dentro de su categoría.
    const GROUPED_SUBCATEGORIES = new Set([
        'CAMAS',
        'BASES',
        'CABECERAS'
    ]);

    const MODULE_GROUPABLE_TYPE_KEYS = new Set([
        'SALA_MODULAR',
        'SALA_EN_L',
        'SOFA_LOVESEAT',
        'SOFA_CAMA',
        'FUTON',
        'SALA',
        'SOFA',
        'LOVE_SEAT',
        'EXT_SALA_MODULAR',
        'EXT_SALA_EN_L',
        'EXT_SOFA_LOVESEAT',
        'EXT_SOFA_CAMA',
        'EXT_SALA',
        'EXT_SOFA',
        'EXT_LOVE_SEAT'
    ]);

    const BED_GROUPABLE_TYPE_KEYS = new Set([
        'CAMA_CONJUNTO',
        'CAMA',
        'BASE_CAMA',
        'CABECERA'
    ]);

    function resolveItemModuleBucket(it) {
        if (!it) return null;
        const tpTok = plainModelToken(stripDimensionsFromProductText(it.tp));
        const nomTok = plainModelToken(stripDimensionsFromProductText(it.n));
        const vrTok = plainModelToken(stripDimensionsFromProductText(it.vr));
        const prodTok = (tpTok + ' ' + nomTok).trim();
        const fullTok = (prodTok + ' ' + vrTok).trim();

        const hasRight = /\b(BRAZO\s+DER(?:ECHO|EHO)?|CON\s+BRAZO\s+DER(?:ECHO|EHO)?|B\/DER|DERECHO|DEREHO|DERECHA|DER)\b/.test(fullTok);
        const hasLeft = /\b(BRAZO\s+IZQ(?:UIERDO)?|CON\s+BRAZO\s+IZQ(?:UIERDO)?|B\/IZQ|IZQUIERDO|IZQUIERDA|IZQ)\b/.test(fullTok);
        const hasArmless = /\b(SIN\s+BRAZOS?|S\/BRAZOS?|CENTRAL)\b/.test(fullTok);

        if (/\b(SOFAS?\s*CAMAS?|SOFA-CAMA)\b/.test(prodTok)) {
            if (hasRight && !hasLeft) return { key: 'SOFA_CAMA_DER', label: 'SOFÁ CAMA BRAZO DERECHO', rank: 10, stripTokens: ['SOFA', 'SOFAS', 'CAMA', 'CAMAS', 'CON', 'BRAZO', 'DERECHO', 'DEREHO', 'DER'] };
            if (hasLeft && !hasRight) return { key: 'SOFA_CAMA_IZQ', label: 'SOFÁ CAMA BRAZO IZQUIERDO', rank: 10.5, stripTokens: ['SOFA', 'SOFAS', 'CAMA', 'CAMAS', 'CON', 'BRAZO', 'IZQUIERDO', 'IZQ'] };
            return { key: 'SOFA_CAMA', label: 'SOFÁ CAMA', rank: 10, stripTokens: ['SOFA', 'SOFAS', 'CAMA', 'CAMAS'] };
        }
        if (/\b(FUTON(?:ES)?|FUTTON(?:ES)?|DAYBED)\b/.test(prodTok)) {
            return { key: 'FUTON', label: 'FUTÓN', rank: 12, stripTokens: ['FUTON', 'FUTTON', 'DAYBED'] };
        }
        if (/\b(ESQUINEROS?|ESQUINERAS?|RINCONERAS?)\b/.test(prodTok) && !/\bSALAS?\s+EN\s+L\b/.test(prodTok)) {
            return { key: 'ESQUINERO', label: 'ESQUINERO', rank: 40, stripTokens: ['ESQUINERO', 'ESQUINERA', 'RINCONERA', 'MODULAR', 'MODULO'] };
        }
        if (/\bCHAISE(?:\s+LONGUE)?\b/.test(prodTok)) {
            if (hasRight && !hasLeft) return { key: 'CHAISE_DER', label: 'CHAISE LONGUE DERECHO', rank: 50, stripTokens: ['CHAISE', 'LONGUE', 'DERECHO', 'DEREHO', 'DER', 'BRAZO', 'CON'] };
            if (hasLeft && !hasRight) return { key: 'CHAISE_IZQ', label: 'CHAISE LONGUE IZQUIERDO', rank: 51, stripTokens: ['CHAISE', 'LONGUE', 'IZQUIERDO', 'IZQ', 'BRAZO', 'CON'] };
            return { key: 'CHAISE', label: 'CHAISE LONGUE', rank: 52, stripTokens: ['CHAISE', 'LONGUE'] };
        }
        if (/\bREMATES?\b/.test(prodTok)) {
            if (hasRight && !hasLeft) return { key: 'REMATE_DER', label: 'REMATE DERECHO', rank: 60, stripTokens: ['REMATE', 'DERECHO', 'DEREHO', 'DER', 'BRAZO', 'CON'] };
            if (hasLeft && !hasRight) return { key: 'REMATE_IZQ', label: 'REMATE IZQUIERDO', rank: 61, stripTokens: ['REMATE', 'IZQUIERDO', 'IZQ', 'BRAZO', 'CON'] };
            return { key: 'REMATE', label: 'REMATE', rank: 62, stripTokens: ['REMATE'] };
        }
        if (/\b(OTTOMAN|OTOMAN|POUF|PUFF?|TABURETE)\b/.test(prodTok)) {
            return { key: 'OTTOMAN', label: 'OTOMÁN', rank: 70, stripTokens: ['OTTOMAN', 'OTOMAN', 'POUF', 'PUFF', 'TABURETE'] };
        }
        if (/\b(LOVE\s*SEATS?|LOVESEATS?|LOVE\s+CON\s+BRAZO|LOVE\s+BRAZO)\b/.test(prodTok) || /^LOVE\b/.test(tpTok)) {
            if (hasArmless) return { key: 'LOVE_SEAT_SIN_BRAZOS', label: 'LOVE SEAT SIN BRAZOS', rank: 23, stripTokens: ['LOVE', 'SEAT', 'LOVESEAT', 'SIN', 'BRAZO', 'BRAZOS', 'CENTRAL'] };
            if (hasRight && !hasLeft) return { key: 'LOVE_SEAT_DER', label: 'LOVE SEAT DERECHO', rank: 21, stripTokens: ['LOVE', 'SEAT', 'LOVESEAT', 'CON', 'BRAZO', 'DERECHO', 'DEREHO', 'DER'] };
            if (hasLeft && !hasRight) return { key: 'LOVE_SEAT_IZQ', label: 'LOVE SEAT IZQUIERDO', rank: 22, stripTokens: ['LOVE', 'SEAT', 'LOVESEAT', 'CON', 'BRAZO', 'IZQUIERDO', 'IZQ'] };
            return { key: 'LOVE_SEAT', label: 'LOVE SEAT', rank: 20, stripTokens: ['LOVE', 'SEAT', 'LOVESEAT'] };
        }
        if (/\bSILLON(?:ES)?\b/.test(prodTok) && !/\bSALAS?\s+EN\s+L\b/.test(prodTok)) {
            if (hasArmless) return { key: 'SILLON_SIN_BRAZOS', label: 'SILLÓN SIN BRAZOS', rank: 32, stripTokens: ['SILLON', 'SILLONES', 'SIN', 'BRAZO', 'BRAZOS', 'CENTRAL', 'MODULAR'] };
            if (hasRight && !hasLeft) return { key: 'SILLON_BRAZO_DER', label: 'SILLÓN BRAZO DERECHO', rank: 30, stripTokens: ['SILLON', 'SILLONES', 'CON', 'BRAZO', 'DERECHO', 'DEREHO', 'DER', 'MODULAR'] };
            if (hasLeft && !hasRight) return { key: 'SILLON_BRAZO_IZQ', label: 'SILLÓN BRAZO IZQUIERDO', rank: 31, stripTokens: ['SILLON', 'SILLONES', 'CON', 'BRAZO', 'IZQUIERDO', 'IZQ', 'MODULAR'] };
            if (/\bMODULAR\b/.test(prodTok)) return { key: 'SILLON_MODULAR', label: 'SILLÓN MODULAR', rank: 33, stripTokens: ['SILLON', 'SILLONES', 'MODULAR'] };
            return { key: 'SILLON', label: 'SILLÓN', rank: 34, stripTokens: ['SILLON', 'SILLONES'] };
        }
        if (/\bSOFAS?\b/.test(prodTok) && !/\bSALAS?\s+EN\s+L\b/.test(prodTok)) {
            if (hasArmless) return { key: 'SOFA_SIN_BRAZOS', label: 'SOFÁ SIN BRAZOS', rank: 18, stripTokens: ['SOFA', 'SOFAS', 'SIN', 'BRAZO', 'BRAZOS', 'CENTRAL'] };
            if (hasRight && !hasLeft) return { key: 'SOFA_DER', label: 'SOFÁ BRAZO DERECHO', rank: 16, stripTokens: ['SOFA', 'SOFAS', 'CON', 'BRAZO', 'DERECHO', 'DEREHO', 'DER'] };
            if (hasLeft && !hasRight) return { key: 'SOFA_IZQ', label: 'SOFÁ BRAZO IZQUIERDO', rank: 17, stripTokens: ['SOFA', 'SOFAS', 'CON', 'BRAZO', 'IZQUIERDO', 'IZQ'] };
            return { key: 'SOFA', label: 'SOFÁ', rank: 15, stripTokens: ['SOFA', 'SOFAS'] };
        }
        if (/\bMODULOS?\b/.test(prodTok)) {
            if (hasArmless) return { key: 'MODULO_SIN_BRAZOS', label: 'MÓDULO SIN BRAZOS', rank: 37, stripTokens: ['MODULO', 'MODULOS', 'SIN', 'BRAZO', 'BRAZOS', 'CENTRAL'] };
            if (hasRight && !hasLeft) return { key: 'MODULO_DER', label: 'MÓDULO DERECHO', rank: 35, stripTokens: ['MODULO', 'MODULOS', 'CON', 'BRAZO', 'DERECHO', 'DEREHO', 'DER'] };
            if (hasLeft && !hasRight) return { key: 'MODULO_IZQ', label: 'MÓDULO IZQUIERDO', rank: 36, stripTokens: ['MODULO', 'MODULOS', 'CON', 'BRAZO', 'IZQUIERDO', 'IZQ'] };
            if (/\bCURVO\b/.test(fullTok)) return { key: 'MODULO_CURVO', label: 'MÓDULO CURVO', rank: 38, stripTokens: ['MODULO', 'MODULOS', 'CURVO'] };
            return { key: 'MODULO', label: 'MÓDULO', rank: 39, stripTokens: ['MODULO', 'MODULOS'] };
        }
        if (/\bSALAS?\s+EN\s+L\b/.test(prodTok)) {
            if (hasRight && !hasLeft) return { key: 'SALA_EN_L_DER', label: 'SALA EN L DERECHA', rank: 5, stripTokens: ['SALA', 'SALAS', 'EN', 'L', 'DERECHA', 'DERECHO', 'DEREHO', 'DER'] };
            if (hasLeft && !hasRight) return { key: 'SALA_EN_L_IZQ', label: 'SALA EN L IZQUIERDA', rank: 6, stripTokens: ['SALA', 'SALAS', 'EN', 'L', 'IZQUIERDA', 'IZQUIERDO', 'IZQ'] };
            return { key: 'SALA_COMPLETA', label: 'SALA EN L', rank: 4, stripTokens: ['SALA', 'SALAS', 'EN', 'L'] };
        }
        if (/\bSALAS?\b/.test(prodTok)) {
            if (hasRight && !hasLeft) return { key: 'SALA_DER', label: 'SALA DERECHA', rank: 7, stripTokens: ['SALA', 'SALAS', 'DERECHA', 'DERECHO', 'DER'] };
            if (hasLeft && !hasRight) return { key: 'SALA_IZQ', label: 'SALA IZQUIERDA', rank: 8, stripTokens: ['SALA', 'SALAS', 'IZQUIERDA', 'IZQUIERDO', 'IZQ'] };
            return { key: 'SALA_COMPLETA', label: 'SALA COMPLETA', rank: 4, stripTokens: ['SALA', 'SALAS', 'MODULAR'] };
        }
        return null;
    }

    function countDistinctModulesForGroup(typeKey, items) {
        if (!typeKey || !MODULE_GROUPABLE_TYPE_KEYS.has(typeKey) || !Array.isArray(items) || items.length < 2) {
            return 0;
        }
        const keys = new Set();
        for (let i = 0; i < items.length; i++) {
            const b = resolveItemModuleBucket(items[i]);
            if (b && b.key) keys.add(b.key);
        }
        return keys.size;
    }

    function resolveItemBedSize(it) {
        if (!it) return { key: 'UNSPECIFIED', label: 'ESTÁNDAR', rank: 99 };
        const primary = plainModelToken(stripDimensionsFromProductText((it.n || '') + ' ' + (it.vr || '')));
        const fallback = plainModelToken(it.m || '');
        const matchText = function (txt) {
            if (!txt) return null;
            if (/\b(?:SUPER\s*KING(?:\s*SIZE)?|SKS)\b/.test(txt)) {
                return { key: 'SUPER_KING', label: 'SUPER KING', rank: 6 };
            }
            if (/\b(?:MATRIMONIAL\s*[\/\-]\s*QUEEN(?:\s*SIZE)?|MAT\s*[\/\-]\s*QUEEN(?:\s*SIZE)?|QUEEN\s*[\/\-]\s*MAT(?:RIMONIAL)?|MATRIMONIAL\s+QUEEN(?:\s*SIZE)?)\b/.test(txt)) {
                return { key: 'MATRIMONIAL_QUEEN', label: 'MAT / QUEEN', rank: 3 };
            }
            if (/\b(?:KING\s*SIZE|KING|KS)\b/.test(txt)) {
                return { key: 'KING_SIZE', label: 'KING SIZE', rank: 5 };
            }
            if (/\b(?:QUEEN\s*SIZE|QUEEN|QS)\b/.test(txt)) {
                return { key: 'QUEEN_SIZE', label: 'QUEEN SIZE', rank: 4 };
            }
            if (/\b(?:MATRIMONIAL|MAT|MTR)\b/.test(txt)) {
                return { key: 'MATRIMONIAL', label: 'MATRIMONIAL', rank: 2 };
            }
            if (/\b(?:INDIVIDUAL|INDIV\.?|IND)\b/.test(txt)) {
                return { key: 'INDIVIDUAL', label: 'INDIVIDUAL', rank: 1 };
            }
            return null;
        };
        return matchText(primary) || matchText(fallback) || { key: 'UNSPECIFIED', label: 'ESTÁNDAR', rank: 99 };
    }

    function resolveItemBedPieceInfo(it) {
        if (!it) return { key: 'PIEZA', label: 'PIEZA', shortLabel: 'Pieza', rank: 50 };
        const tpTok = plainModelToken(stripDimensionsFromProductText(it.tp));
        const nomTok = plainModelToken(stripDimensionsFromProductText(it.n));
        const prodTok = (tpTok + ' ' + nomTok).trim();
        if (tpTok === 'EXTENSIONES DE CABECERA' || /\bEXTENSIONES?\b/.test(prodTok)) {
            return { key: 'EXTENSION_CABECERA', label: 'EXTENSIONES DE CABECERA', shortLabel: 'Extensiones', rank: 35 };
        }
        const subCat = it._cat || resolveItemSubcategory(it, resolveItemCategory(it));
        if (subCat === 'CAMAS' && tpTok !== 'LITERA' && tpTok !== 'CUNA') {
            return { key: 'CAMA', label: 'CAMA', shortLabel: 'Cama', rank: 10 };
        }
        if (subCat === 'BASES') {
            return { key: 'BASE_CAMA', label: 'BASE DE CAMA', shortLabel: 'Base de Cama', rank: 20 };
        }
        if (subCat === 'CABECERAS') {
            return { key: 'CABECERA', label: 'CABECERA', shortLabel: 'Cabecera', rank: 30 };
        }
        return { key: 'PIEZA', label: tpTok || 'PIEZA', shortLabel: 'Pieza', rank: 50 };
    }

    function cleanFabricVariationName(rawText) {
        let s = plainModelToken(stripDimensionsFromProductText(rawText || ''));
        if (!s) return '';
        // Unificar telas coordinadas y vivos bajo la tela principal (ej. "ISMALIA LINEN / COORD ALANIS BEIGE" -> "ISMALIA LINEN")
        s = s.replace(/\s*(?:\/|\||·)?\s*\b(?:COORD\.?|VIVO)\b[\s\S]*$/i, '').trim();
        // Limpiar prefijos de pieza/dirección que a veces llegan en `tl` o `vr`
        s = s.replace(/^(?:(?:CON|SIN)\s+BRAZOS?\s+|BRAZO\s+(?:DER(?:ECHO|EHO)?|IZQ(?:UIERDO)?)\s+|(?:DERECHO|DEREHO|IZQUIERDO|DER|IZQ|CENTRAL|MODULAR|IND|INV|TELA|3P|2P|1P)\s+)+/i, '').trim();
        // Eliminar tokens de tamaño de cama para que jamás se emitan como tela/color
        s = s.replace(/\b(?:SUPER\s*KING(?:\s*SIZE)?|MATRIMONIAL\s*[\/\-]\s*QUEEN(?:\s*SIZE)?|MAT\s*[\/\-]\s*QUEEN(?:\s*SIZE)?|QUEEN\s*[\/\-]\s*MAT(?:RIMONIAL)?|MATRIMONIAL\s+QUEEN(?:\s*SIZE)?|KING\s*SIZE|QUEEN\s*SIZE|MATRIMONIAL|INDIVIDUAL|INDIV\.?|KING|QUEEN|SKS|KS|QS|MAT|MTR|IND)\b/gi, ' ');
        s = s.replace(/^[\s\/\-·|]+|[\s\/\-·|]+$/g, '').replace(/\s+/g, ' ').trim();
        if (!s) return '';
        s = stripFabricGradeAndVendorNoise(s);
        s = canonicalizeFabricAliases(s);
        s = s.replace(/^(?:DE|DEL|EN|CON|LA|EL)\s+/i, '').trim();
        s = s.replace(/^[\s\/\-·|]+|[\s\/\-·|]+$/g, '').replace(/\s+/g, ' ').trim();
        return s;
    }

    function resolveItemFabricVariation(it, groupObj) {
        if (!it) return { key: 'ESTANDAR', label: 'ESTÁNDAR', colorHint: '' };
        const colorHint = cleanStr(it.ct).toUpperCase();
        const isPureDirection = txt => /^(?:(?:CON|SIN)\s+BRAZOS?|BRAZO\s+(?:DER(?:ECHO|EHO)?|IZQ(?:UIERDO)?)|DER(?:ECHO|EHO)?|IZQ(?:UIERDO)?|CENTRAL|MODULAR|IND|INDIV|INV|1P|2P|3P|4P|5P|SALA|SOFA|LOVE\s*SEAT|SILLON|ESQUINERO|CHAISE(?:\s+LONGUE)?|OTTOMAN|OTOMAN|TABURETE|REMATE|CAMA|CAMAS|BASE|BASES|CABECERA|CABECERAS|BOX|SKS|KS|QS|MAT|MTR|KING(?:\s+SIZE)?|QUEEN(?:\s+SIZE)?|MATRIMONIAL|INDIVIDUAL|SUPER\s+KING|CON\s+COSTADOS(?:\s+SIN\s+ESTOPEROLES)?|SIN\s+COSTADOS|SET\s+\d+PZS?\s+PARA|PROTECTOR)$/.test(txt);

        // 1) Prioridad: campo Tela (`it.tl`)
        let candidate = cleanFabricVariationName(it.tl);
        if (candidate && isPureDirection(candidate)) candidate = '';

        // 2) Respaldo: campo Variación (`it.vr`) separado por ·
        if (!candidate && cleanStr(it.vr)) {
            const parts = String(it.vr).split(/\s*[·|\/]\s*/).map(cleanFabricVariationName).filter(Boolean);
            for (let i = 0; i < parts.length; i++) {
                if (!isPureDirection(parts[i])) {
                    candidate = parts[i];
                    break;
                }
            }
        }

        // 3) Respaldo: color de tela (`it.ct`) o madera + acabado (`it.md` + `it.cm`)
        if (!candidate) {
            const ctClean = cleanFabricVariationName(it.ct);
            if (ctClean && !isPureDirection(ctClean)) candidate = ctClean;
        }
        if (!candidate) {
            const mdClean = cleanFabricVariationName(it.md);
            const cmClean = cleanFabricVariationName(it.cm);
            let woodCandidate = '';
            if (mdClean && cmClean) {
                if (cmClean.indexOf(mdClean) !== -1) woodCandidate = cmClean;
                else if (mdClean.indexOf(cmClean) !== -1) woodCandidate = mdClean;
                else woodCandidate = (mdClean + ' ' + cmClean).trim();
            } else {
                woodCandidate = mdClean || cmClean;
            }
            if (woodCandidate && !isPureDirection(woodCandidate)) candidate = woodCandidate;
        }

        // 4) Último respaldo: extraer tela/acabado desde el nombre eliminando título y palabras del módulo/pieza
        if (!candidate) {
            const modB = resolveItemModuleBucket(it);
            const skipSet = new Set();
            const addSkip = txt => plainModelToken(txt).split(/\s+/).filter(Boolean).forEach(w => skipSet.add(w));
            if (groupObj && groupObj.title) addSkip(groupObj.title);
            if (it.mo) addSkip(it.mo);
            if (it.tp) addSkip(it.tp);
            if (modB && Array.isArray(modB.stripTokens)) modB.stripTokens.forEach(w => skipSet.add(plainModelToken(w)));
            if (it._cat === 'CAMAS' || it._cat === 'BASES' || it._cat === 'CABECERAS') {
                ['CAMA', 'CAMAS', 'BASE', 'BASES', 'CABECERA', 'CABECERAS', 'BOX', 'COSTADOS', 'INFERIOR', 'SET', 'EXTENSIONES'].forEach(w => skipSet.add(w));
            }
            const rem = plainModelToken(stripDimensionsFromProductText(it.n))
                .split(/\s+/)
                .filter(w => w && !skipSet.has(w) && !/^(?:DE|DEL|LA|EL|CON|SIN|EN|PARA|Y)$/.test(w));
            candidate = cleanFabricVariationName(rem.join(' '));
            if (candidate && isPureDirection(candidate)) candidate = '';
        }

        if (!candidate) {
            return { key: 'ESTANDAR', label: 'ESTÁNDAR', colorHint: colorHint };
        }
        return {
            key: candidate,
            label: candidate,
            colorHint: (colorHint && plainModelToken(colorHint) !== candidate) ? colorHint : ''
        };
    }

    function resolveItemBedColorOrFinish(it, groupObj) {
        const base = resolveItemFabricVariation(it, groupObj || null);
        const hasRealTextile = !!(cleanFabricVariationName(it && it.tl) || cleanStr(it && it.ct));
        const hasWoodInfo = !!(cleanStr(it && it.md) || cleanStr(it && it.cm));
        const isWood = !hasRealTextile && hasWoodInfo && base.key !== 'ESTANDAR';
        return {
            key: base.key,
            label: base.label,
            colorHint: isWood ? '' : base.colorHint,
            isWood: isWood
        };
    }

    function countDistinctBedSizesForGroup(typeKey, items) {
        if (!typeKey || !BED_GROUPABLE_TYPE_KEYS.has(typeKey) || !Array.isArray(items) || items.length < 2) {
            return 0;
        }
        const keys = new Set();
        for (let i = 0; i < items.length; i++) {
            const sz = resolveItemBedSize(items[i]);
            if (sz && sz.key) keys.add(sz.key);
        }
        return keys.size;
    }

    function countDistinctBedColorsForGroup(typeKey, items) {
        if (!typeKey || !BED_GROUPABLE_TYPE_KEYS.has(typeKey) || !Array.isArray(items) || items.length < 2) {
            return 0;
        }
        const keys = new Set();
        for (let i = 0; i < items.length; i++) {
            const c = resolveItemBedColorOrFinish(items[i], null);
            if (c && c.key) keys.add(c.key);
        }
        return keys.size;
    }

    function isBedGroupWoodOnly(items) {
        if (!Array.isArray(items) || items.length === 0) return false;
        let sawWood = false;
        for (let i = 0; i < items.length; i++) {
            const c = resolveItemBedColorOrFinish(items[i], null);
            if (!c.isWood) return false;
            sawWood = true;
        }
        return sawWood;
    }

    function countDistinctFabricsForGroup(typeKey, items) {
        if (!typeKey || !MODULE_GROUPABLE_TYPE_KEYS.has(typeKey) || !Array.isArray(items) || items.length < 2) {
            return 0;
        }
        const keys = new Set();
        for (let i = 0; i < items.length; i++) {
            const f = resolveItemFabricVariation(items[i], null);
            if (f && f.key) keys.add(f.key);
        }
        return keys.size;
    }

    // ------------------------------------------------------------------------
    // FOTOS VISUALES (SOLO PORTADA DE INICIO Y MUESTRA DE TELA POR COLOR)
    // Persistidas en _INV_PRODUCT_OVERRIDES sin tocar SKUs ni Hoja 1
    // ------------------------------------------------------------------------
    function compactVisualOverrideKey(prefix, rawKey) {
        const clean = String(rawKey || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toUpperCase()
            .replace(/[^A-Z0-9_ -]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
        if (!clean) return '';
        const full = prefix + clean;
        if (full.length <= 58) return full;
        let h = 2166136261;
        for (let i = 0; i < clean.length; i++) {
            h ^= clean.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        const hash8 = (h >>> 0).toString(36).toUpperCase().padStart(7, '0').slice(0, 7);
        const maxStem = Math.max(8, 50 - prefix.length);
        return prefix + clean.slice(0, maxStem).trim() + '_' + hash8;
    }

    function buildVisualCoverOverrideKey(groupKey) {
        return compactVisualOverrideKey('VCOV:', groupKey);
    }

    function buildFabricSwatchOverrideKey(fabricKey) {
        return compactVisualOverrideKey('VFAB:', fabricKey);
    }

    function buildWoodSwatchOverrideKey(woodKey) {
        return compactVisualOverrideKey('VWOD:', woodKey);
    }

    const DEFAULT_WOOD_SWATCHES_CATALOG = (function buildDefaultWoodSwatchesCatalog() {
        const pairs = [
            ['BELLOTA ARTEX', '1jmUL8QeEN7ZneS0Od9zd2O89yn1HJeNV'],
            ['CAMEL ARTC', '1tvAuI_UncBB5g_gioiblyOkL7VxAVC0y'],
            ['ESPIGA ATX', '1x7MiM15EuEDZ1JOiO3sg7Bm_xDefsR7n'],
            ['GINGER SKANOR', '1hOlPkHT9G6snRpcCs83Vqj8x7ZkAvglY'],
            ['HABANO ATX', '17wdbsUu5c2oIXGLFCmZ2_ijL9AXPzjtn'],
            ['MADERA KASAM', '1lregsGb_cffKVFOO9INpSCUzTmv96Dnr'],
            ['NOCHE ATX', '1rtGHK0czW7DIEX3uW-eTAb9wUt2347FW'],
            ['NOGAL CHAVOYA', '1g79_faoLRWwXT-Xo3va33E8LqceOdK71'],
            ['NOGAL SKANOR', '1S63fCXcQnciqACYzX4_c2O6GWjJDTnrM'],
            ['NOGAL YOI', '1oV-AD6PW9KrZvSNHRcUDTkedcIEO_1I2'],
            ['NUEZ MOBEL INN', '1bYK_yd_FxB068b6xa5lPnWywr7qKsrZS'],
            ['PALO DE ROSA SKANOR', '17EPrJrIXuW8JiUajsZJXlyHgGt8Ur5dT'],
            ['PAROTA BARSA', '1pTmpK3UJhRwVILV9jnwhfDM7VUG57fQ5'],
            ['PAROTA BLOQUEART', '1_MqpkKNHRxTY60Q7z_yHe6mLSMMGAs0X'],
            ['PAROTA CASA AURA', '1jzVG_TQb0vo3wqDVK_rG3eOpJPOfgD9k'],
            ['PAROTA MOBEL INN', '1xe8pC3qjn6PwRMuOWuEvAAEGqsXS61gS'],
            ['PAROTA REVICA', '15MFirKRhBxEI5a95ORFpPc5d3cFlImh3'],
            ['PAROTA SKANOR', '1IIS0teeWDXTAvOjt_9wad16hgdKBr21L'],
            ['PAROTA VANGARDI', '1ZNz_5OyESFMDTEGDCsSA9VajsJ_20niR'],
            ['PAROTA YOI', '1PyY2qKpl0DcWSb-z9Ro0XHHGnhE-i61E'],
            ['ROSA MORADA ACEITE WHITE LUX', '1F8BXPaq8c7hsHsceNBKcBn4qibtSfX-5'],
            ['ROSA MORADA BARSA', '11mtWQdUDna0NY7H8ByqsDcirfM0vlc7J'],
            ['ROSA MORADA CHAVOYA', '1VPiMBn-fkzTWUDXOfkZiflVpopMHB7A0'],
            ['ROSA MORADA CLARA LUIS PEDRO', '1HsvWAhnrYYmh4onu1_MKaLCdq_ttvbEg'],
            ['ROSA MORADA LUX FACTORI', '1bQAXEl8vKmHCNZrojNgiFpo1lYXtZEqT'],
            ['ROSA MORADA MR FURNITURE', '1zwJMUcnJ-6HaL3YkfmTHBy9vEBnk4a2U'],
            ['ROSA MORADA YOI', '1q9h-KKXsLWV1ayMsjnalnsGA5j5OVU-W'],
            ['TABACO ARTEX', '1vmrA0h1ZS1fYHMCAgBuKX13jBvMowaK1'],
            ['TABACO CLARO BARSA', '1MdGLIMP-TdIyuqUgCpflwO7K_8SXUA4V'],
            ['TACUBA ARTEX', '1z6v5DsNBTui5-tqj8u17sj8H_bVRcnkm'],
            ['TECA ENTINTADO SKANOR', '1ZnbTMhNvEKRLDst1qnvJD-gunLHeHlaF'],
            ['TECA SKANOR', '1V-79ezpoTDDAd8cDwzp89lfoSMJoN9Ox'],
            ['TZALAM BARSA', '1Ssl8rC2jS1geqEG_monA6EzjZ_1XNC-_'],
            ['TZALAM CHAVOYA', '1GcCznfI3-X62IiV1Cz1wnE5H2hAuGZ7i']
        ];
        const map = {};
        for (let i = 0; i < pairs.length; i++) {
            const name = pairs[i][0];
            const fid = pairs[i][1];
            const key = compactVisualOverrideKey('VWOD:', name);
            if (!key) continue;
            map[key] = {
                sku: key,
                status: 'VISIBLE',
                name: name,
                category: 'WOOD_SWATCH',
                note: 'https://drive.google.com/file/d/' + fid + '/view?usp=sharing'
            };
        }
        return map;
    })();

    const WOOD_SPECIES_CORE_RE = /\b(ROSA\s+MORADA|PAROTA|TZALAM|NOGAL|TECA|ENCINO|ROBLE|CEDRO|PINO|CAOBA|FRESNO|HAYA|OKUME|MAPLE|ABEDUL|PALO\s+DE\s+ROSA|MADERA|CHAPA|MELAMINA|MDF|TRIPLAY|ALAMO|BANAK|PRIMAVERA|CEREZO|EBANO|WENGUE|BAMBU)\b/i;
    const WOOD_FINISH_NAME_RE = /\b(TABACO|TACUBA|BELLOTA|ESPIGA|HABANO|CAMEL|GINGER|NOCHE|NUEZ)\b/i;
    const WOOD_PROVIDER_RE = /\b(BARSA|YOI|SKANOR|CHAVOYA|ARTEX|ATX|ARTC|KASAM|MOBEL\s+INN|BLOQUEART|CASA\s+AURA|REVICA|VANGARDI|LUX\s+FACTOR[IY]|LUIS\s+PEDRO|MR\s+FURNITURE)\b/i;
    const WOOD_DESCRIPTOR_ALLOWED_TOKENS = new Set([
        'ROSA', 'MORADA', 'PAROTA', 'TZALAM', 'NOGAL', 'TECA', 'ENCINO', 'ROBLE', 'CEDRO', 'PINO',
        'CAOBA', 'FRESNO', 'HAYA', 'OKUME', 'MAPLE', 'ABEDUL', 'PALO', 'TABACO', 'TACUBA', 'BELLOTA',
        'ESPIGA', 'HABANO', 'MADERA', 'CHAPA', 'MELAMINA', 'MDF', 'TRIPLAY', 'ALAMO', 'BANAK',
        'PRIMAVERA', 'CEREZO', 'EBANO', 'WENGUE', 'BAMBU', 'CAMEL', 'GINGER', 'NOCHE', 'NUEZ',
        'TONO', 'NATURAL', 'CLARO', 'CLARA', 'OSCURO', 'OSCURA', 'MATE', 'SEMI', 'BRILLANTE',
        'SATIN', 'SATINADO', 'SATINADA', 'ENTINTADO', 'ENTINTADA', 'ACEITE', 'WHITE', 'BLANCO',
        'BLANCA', 'NEGRO', 'NEGRA', 'CAFE', 'CHOCOLATE', 'MIEL', 'AHUMADO', 'AHUMADA', 'NOGALADO',
        'AVELLANA', 'CARAMELO', 'CENIZA', 'GRIS', 'BEIGE', 'DORADO', 'LACA', 'BARNIZ', 'ACABADO',
        'CEPILLADO', 'RUSTICO', 'RUSTICA', 'SOLIDA', 'SOLIDO', 'MACIZA', 'MACIZO', 'EN', 'CON',
        'SIN', 'DE', 'AL', 'DEL', 'LA', 'EL', 'Y', 'BASE', 'PATAS', 'CUBIERTA',
        'BARSA', 'YOI', 'SKANOR', 'CHAVOYA', 'ARTEX', 'ATX', 'ARTC', 'KASAM', 'MOBEL', 'INN',
        'BLOQUEART', 'CASA', 'AURA', 'REVICA', 'VANGARDI', 'LUX', 'FACTORI', 'FACTORY', 'LUIS',
        'PEDRO', 'MR', 'FURNITURE', 'HAKO', 'KAI', 'CREATA', 'MOBA', 'MONTE'
    ]);

    function isPureWoodDescriptor(rawText) {
        const norm = plainModelToken(rawText);
        if (!norm) return false;
        const hasCoreWood = WOOD_SPECIES_CORE_RE.test(norm) || (WOOD_FINISH_NAME_RE.test(norm) && WOOD_PROVIDER_RE.test(norm));
        if (!hasCoreWood) return false;
        const toks = norm.split(/\s+/).filter(Boolean);
        if (!toks.length) return false;
        for (let i = 0; i < toks.length; i++) {
            if (!WOOD_DESCRIPTOR_ALLOWED_TOKENS.has(toks[i])) return false;
        }
        return true;
    }

    function isWoodOnlyProductForFabricGuard(it) {
        if (!it) return false;
        const tlClean = cleanStr(it.tl);
        const ctClean = cleanStr(it.ct);
        const hasFabricCols = Boolean(
            (tlClean && !isPureWoodDescriptor(tlClean)) ||
            (ctClean && !isPureWoodDescriptor(ctClean))
        );
        if (hasFabricCols) return false;
        const catNorm = plainModelToken(it.c);
        const typeNameNorm = plainModelToken(cleanStr(it.tp) + ' ' + cleanStr(it.n));
        const hasUpholsteredHint = /\b(SILLA|SILLON|SOFA|SALA|LOVESEAT|LOVE\s+SEAT|MODULAR|CHAISE|COJIN|COJINES|CABECERA|CAMA|BANCO|TABURETE|PERIQUERA|POUF|PUF|OTTOMAN|OTOMAN|CAMASTRO|TAPIZ|TELA|PIEL|LINO|BOUCLE|VELVET|TERCIOPELO|CHENILLE|RECLINABLE|POLTRONA|BUTACA|BAUL)\b/i.test(typeNameNorm);
        if (hasUpholsteredHint) return false;
        if (catNorm === 'MESAS' || catNorm === 'MESAS DE CENTRO LATERALES' || catNorm === 'BUFETERAS CREDENZAS' || catNorm === 'ILUMINACION' || catNorm === 'ESPEJOS ARTE') return true;
        return /\b(MESA|COMEDOR|CREDENZA|BUFETERA|BURO|CONSOLA|ESCRITORIO|LIBRERO|MUEBLE\s+TV|PEDESTAL|BASE|CUBIERTA|ESPEJO|CUADRO|CAJONERA|COMODA|TOCADOR|VITRINA|CANTINA|BARRA|PERCHERO|REPISA|LAMPARA|CANDIL|ARBOTANTE|MACETA|FLORERO|JARRON|FOLLAJE|BOTELLA|ESCULTURA|RELOJ)\b/i.test(typeNameNorm);
    }

    function getVisualOverridePhotoUrl(overrideKey) {
        const k = String(overrideKey || '').trim().toUpperCase();
        if (!k) return '';
        if (invProductOverridesMap && typeof invProductOverridesMap === 'object' && Object.prototype.hasOwnProperty.call(invProductOverridesMap, k)) {
            const ovr = invProductOverridesMap[k];
            if (!ovr || ovr.status === 'ELIMINADO' || ovr.status === 'ARCHIVADO') return '';
            return sanitizeVisualOverrideUrl(cleanStr(ovr.note));
        }
        if (k.indexOf('VWOD:') === 0 && DEFAULT_WOOD_SWATCHES_CATALOG[k]) {
            return sanitizeVisualOverrideUrl(cleanStr(DEFAULT_WOOD_SWATCHES_CATALOG[k].note));
        }
        return '';
    }

    function getGroupVisualCoverPhotoUrl(groupKey) {
        return getVisualOverridePhotoUrl(buildVisualCoverOverrideKey(groupKey));
    }

    let _vfabIndexMapRef = null;
    let _vfabIndexEntries = [];
    const VFAB_GENERIC_SINGLE_TOKENS = new Set([
        'TELA', 'COLOR', 'ESTANDAR', 'MODULAR', 'SALA', 'SOFA', 'SILLON', 'SILLA',
        'DERECHO', 'IZQUIERDO', 'CENTRAL', 'CON', 'SIN', 'BRAZO', 'BRAZOS',
        'CLARO', 'OSCURO', 'NATURAL', 'MEDIO', 'NUEVO', 'NUEVA', 'LINO', 'PIEL'
    ]);
    // Colores/materiales genéricos que nunca deben quedar como 1 solo token en un VFAB (ej. "TELA BEIGE - LEONI" -> nunca colapsar a "BEIGE")
    const VFAB_GENERIC_SINGLE_COLOR_TOKENS = new Set([
        'BEIGE', 'BLANCO', 'BLANCA', 'WHITE', 'NEGRO', 'NEGRA', 'BLACK',
        'GRIS', 'GREY', 'GRAY', 'AZUL', 'BLUE', 'VERDE', 'GREEN',
        'ROJO', 'ROJA', 'RED', 'CAFE', 'BROWN', 'MARRON', 'ARENA', 'SAND',
        'CREMA', 'CREAM', 'HUESO', 'BONE', 'IVORY', 'MARFIL',
        'DORADO', 'ORO', 'GOLD', 'PLATA', 'SILVER', 'BRONCE', 'ROSA', 'PINK',
        'TERRACOTA', 'TAUPE', 'CAMEL', 'CHOCOLATE', 'OLIVO', 'OLIVE',
        'MOSTAZA', 'MUSTARD', 'OCRE', 'CRUDO', 'PERLA', 'PEARL',
        'SNOW', 'FLAX', 'ECRU', 'OAT', 'TOAST', 'ALABASTER',
        'PIEDRA', 'STONE', 'LINEN', 'COTTON', 'ALGODON', 'CUERDA',
        'CHARCOAL', 'PUTTY', 'DOVE', 'MINERAL'
    ]);

    function isGenericSingleFabricToken(tok) {
        return VFAB_GENERIC_SINGLE_TOKENS.has(tok) || VFAB_GENERIC_SINGLE_COLOR_TOKENS.has(tok);
    }

    function stripWoodNoiseFromFabricSwatchNorm(normText) {
        if (!normText) return '';
        const cleaned = String(normText)
            .replace(/\bROSA\s+MORADA(?:\s+(?:TONO\s+)?(?:NATURAL|BARSA|YOI|CHAVOYA|CLARA|OSCURA|NOGAL))?\b/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        return cleaned || normText;
    }

    function getUploadedFabricSwatchEntries() {
        if (!invProductOverridesMap || typeof invProductOverridesMap !== 'object') return [];
        if (_vfabIndexMapRef === invProductOverridesMap) return _vfabIndexEntries;
        const entries = [];
        const keys = Object.keys(invProductOverridesMap);
        for (let i = 0; i < keys.length; i++) {
            const k = String(keys[i] || '').trim().toUpperCase();
            if (k.indexOf('VFAB:') !== 0) continue;
            const ovr = invProductOverridesMap[k];
            if (!ovr || ovr.status === 'ELIMINADO' || ovr.status === 'ARCHIVADO') continue;
            const url = sanitizeVisualOverrideUrl(cleanStr(ovr.note));
            if (!url) continue;
            const rawLabel = cleanStr(ovr.name) || k.slice(5);
            const rawNorm = canonicalizeFabricAliases(plainModelToken(rawLabel));
            let normName = normalizeFabricLookupKey(rawLabel) || rawNorm;
            const rawTokens = rawNorm.split(/\s+/).filter(t => t.length >= 2);
            const normTokens = normName.split(/\s+/).filter(t => t.length >= 2);
            // Guardia de proveedor/modelo para telas o colores genéricos (ej. "VFAB:PIEL YOI" o "VFAB:TELA BEIGE - LEONI")
            if (normTokens.length === 1 && isGenericSingleFabricToken(normTokens[0]) && rawTokens.length >= 2) {
                normName = rawNorm;
            }
            // Limpiar ruido de madera incrustado en claves VFAB mixtas (ej. "OCASIONAL SAND 07 ROSA MORADA TONO NATURAL")
            normName = stripWoodNoiseFromFabricSwatchNorm(normName);
            const tokens = normName.split(/\s+/).filter(t => t.length >= 2);
            if (!normName || !tokens.length) continue;
            const sortedSig = tokens.slice().sort().join(' ');
            entries.push({
                overrideKey: k,
                label: rawLabel.toUpperCase(),
                normName: normName,
                tokens: tokens,
                sortedSig: sortedSig,
                url: url
            });
        }
        // Prefer more specific (more tokens / longer) fabric names first
        entries.sort((a, b) => (b.tokens.length - a.tokens.length) || (b.normName.length - a.normName.length));
        _vfabIndexMapRef = invProductOverridesMap;
        _vfabIndexEntries = entries;
        return entries;
    }

    function matchFabricTextAgainstUploadedSwatches(rawCandidateText) {
        if (isPureWoodDescriptor(rawCandidateText)) return null;
        const rawNorm = canonicalizeFabricAliases(plainModelToken(rawCandidateText));
        let cleanCand = normalizeFabricLookupKey(rawCandidateText) || rawNorm;
        if (isPureWoodDescriptor(cleanCand)) return null;
        const rawToks = rawNorm.split(/\s+/).filter(t => t.length >= 2);
        const cleanToks = cleanCand.split(/\s+/).filter(t => t.length >= 2);
        if (cleanToks.length === 1 && isGenericSingleFabricToken(cleanToks[0]) && rawToks.length >= 2) {
            cleanCand = rawNorm;
        }
        if (!cleanCand || cleanCand === 'ESTANDAR') return null;

        // 1) Exact override key match (both raw and canonical)
        const exactCandidates = [buildFabricSwatchOverrideKey(rawCandidateText), buildFabricSwatchOverrideKey(cleanCand)];
        for (let eIdx = 0; eIdx < exactCandidates.length; eIdx++) {
            const exactKey = exactCandidates[eIdx];
            if (!exactKey) continue;
            const exactUrl = getVisualOverridePhotoUrl(exactKey);
            if (exactUrl) {
                const ovr = invProductOverridesMap[exactKey];
                return {
                    overrideKey: exactKey,
                    label: cleanStr(ovr && ovr.name) ? cleanStr(ovr.name).toUpperCase() : cleanCand,
                    url: exactUrl
                };
            }
        }

        const entries = getUploadedFabricSwatchEntries();
        if (!entries.length) return null;

        const candTokens = cleanCand.split(/\s+/).filter(t => t.length >= 2);
        if (!candTokens.length) return null;
        const candSet = new Set(candTokens);
        const candSortedSig = candTokens.slice().sort().join(' ');

        // 2) Same token set regardless of word order (e.g. "IVORY LUXOR" == "LUXOR IVORY")
        for (let i = 0; i < entries.length; i++) {
            const e = entries[i];
            if (e.normName === cleanCand || e.sortedSig === candSortedSig) {
                return { overrideKey: e.overrideKey, label: e.label, url: e.url };
            }
        }

        // 3) Uploaded fabric tokens appear as a complete whole-word subset inside the candidate text
        for (let i = 0; i < entries.length; i++) {
            const e = entries[i];
            if (e.tokens.length === 1 && isGenericSingleFabricToken(e.tokens[0])) continue;
            if (e.tokens.every(tok => candSet.has(tok))) {
                return { overrideKey: e.overrideKey, label: e.label, url: e.url };
            }
        }

        // 4) Candidate is a specific multi-word fabric name contained within an uploaded fabric name
        // Guardia anti-falso positivo: nunca emparejar si todos los tokens del candidato son de madera/acabado/colores genéricos
        if (candTokens.length >= 2 && !candTokens.every(tok => WOOD_DESCRIPTOR_ALLOWED_TOKENS.has(tok) || isGenericSingleFabricToken(tok))) {
            for (let i = 0; i < entries.length; i++) {
                const e = entries[i];
                const eSet = new Set(e.tokens);
                if (candTokens.every(tok => eSet.has(tok))) {
                    return { overrideKey: e.overrideKey, label: e.label, url: e.url };
                }
            }
        }

        return null;
    }

    function getFabricSwatchPhotoUrl(fabricKey, itemOpt) {
        if (isPureWoodDescriptor(fabricKey)) return '';
        const directUrl = getVisualOverridePhotoUrl(buildFabricSwatchOverrideKey(fabricKey));
        if (directUrl) return directUrl;
        const canonKey = normalizeFabricLookupKey(fabricKey);
        if (canonKey && !isPureWoodDescriptor(canonKey)) {
            const canonUrl = getVisualOverridePhotoUrl(buildFabricSwatchOverrideKey(canonKey));
            if (canonUrl) return canonUrl;
        }
        const matched = matchFabricTextAgainstUploadedSwatches(fabricKey);
        if (matched && matched.url) return matched.url;
        if (itemOpt) {
            const fromItem = findMatchingFabricSwatchForItem(itemOpt, null);
            if (fromItem && fromItem.url) return fromItem.url;
        }
        return '';
    }

    function findMatchingFabricSwatchForItem(it, groupObj) {
        if (!it) return null;
        if (isWoodOnlyProductForFabricGuard(it)) return null;
        const entries = getUploadedFabricSwatchEntries();
        if (!entries.length) return null;

        const tl = cleanStr(it.tl);
        const ct = cleanStr(it.ct);
        const prov = plainModelToken(cleanStr(it.p));
        const combinedTlCt = (tl && ct && plainModelToken(tl).indexOf(plainModelToken(ct)) === -1)
            ? (tl + ' ' + ct)
            : (tl || ct);

        const candidates = [];
        if (tl && prov && plainModelToken(tl) === 'PIEL') {
            candidates.push('PIEL ' + prov);
        }
        if (combinedTlCt && !isPureWoodDescriptor(combinedTlCt)) candidates.push(combinedTlCt);
        if (tl && tl !== combinedTlCt && !isPureWoodDescriptor(tl)) candidates.push(tl);
        if (cleanStr(it.vr)) {
            const vrParts = String(it.vr).split(/\s*[·|\/]\s*/).map(cleanStr).filter(Boolean);
            for (let i = 0; i < vrParts.length; i++) {
                if (!isPureWoodDescriptor(vrParts[i])) candidates.push(vrParts[i]);
            }
            if (!isPureWoodDescriptor(it.vr)) candidates.push(cleanStr(it.vr));
        }
        if (ct && ct !== combinedTlCt && !isPureWoodDescriptor(ct)) candidates.push(ct);
        const resolvedFab = resolveItemFabricVariation(it, groupObj || null);
        if (resolvedFab && resolvedFab.key && resolvedFab.key !== 'ESTANDAR' && !isPureWoodDescriptor(resolvedFab.key)) {
            candidates.push(resolvedFab.key);
        }

        const tried = new Set();
        for (let i = 0; i < candidates.length; i++) {
            const c = cleanStr(candidates[i]);
            if (!c || tried.has(c)) continue;
            tried.add(c);
            const hit = matchFabricTextAgainstUploadedSwatches(c);
            if (hit && hit.url) return hit;
        }

        // Último respaldo: buscar tela ya subida (de >=2 palabras o nombre específico) dentro del nombre completo del producto
        const nameNorm = canonicalizeFabricAliases(plainModelToken(stripDimensionsFromProductText(it.n)));
        if (nameNorm) {
            const nameSet = new Set(nameNorm.split(/\s+/).filter(Boolean));
            for (let i = 0; i < entries.length; i++) {
                const e = entries[i];
                if (isPureWoodDescriptor(e.normName)) continue;
                if (e.tokens.length < 2 && (e.tokens[0].length < 5 || isGenericSingleFabricToken(e.tokens[0]))) continue;
                if (e.tokens.every(tok => nameSet.has(tok))) {
                    return { overrideKey: e.overrideKey, label: e.label, url: e.url };
                }
            }
        }
        return null;
    }

    // ------------------------------------------------------------------------
    // MUESTRAS DE MADERA (VWOD:) — Pre-cargadas de Drive MADERAS + Overrides en vivo
    // ------------------------------------------------------------------------
    let _vwodIndexMapRef = null;
    let _vwodIndexEntries = [];
    const NON_WOOD_MATERIAL_ONLY_RE = /^(MARMOL|MARBOL|TRAVERTINO|ONIX|PIEDRA|GRANITO|CUARZO|CRISTAL|VIDRIO|ESPEJO|METAL|ACERO|ALUMINIO|HIERRO|HERRERIA|LATON|BRONCE|COBRE|CERAMICA|PORCELANA|PORCELANATO|RESINA|PLASTICO|POLIPROPILENO|RATAN|RATTAN|MIMBRE|CUERDA|SOGA|FIBRA|CONCRETO|CEMENTO|PINO|PINO\s+ESTUFADO|MADERA\s+DE\s+PINO|MDF|TRIPLAY|CONTRACHAPADO|AGLOMERADO|POLIESTER|ESPUMA|DELCRON|N\/A|NA|NO APLICA|NINGUNA|NINGUNO|SIN MADERA|-)$/i;
    const WOOD_FILLER_TOKENS = new Set(['MADERA', 'DE', 'EN', 'CON', 'TONO', 'NATURAL', 'ACABADO', 'LACA', 'BARNIZ', 'BASE', 'PATAS', 'CUBIERTA', 'SOLIDA', 'SOLIDO', 'MACIZA', 'MACIZO', 'CHAPA', 'LAMINADO', 'LAMINADA', 'ENCHAPADO', 'ENCHAPADA']);
    const WOOD_SPECIAL_FINISH_TOKENS = new Set(['ENTINTADO', 'ENTINTADA', 'ACEITE', 'WHITE', 'CLARA', 'CLARO', 'OSCURO', 'OSCURA']);
    // Modificadores/adjetivos solos nunca deben emparejar una muestra de madera (ej. "CLARO" != "TABACO CLARO BARSA")
    const WOOD_MODIFIER_ONLY_TOKENS = new Set([
        'CLARO', 'CLARA', 'OSCURO', 'OSCURA', 'OBSCURO', 'OBSCURA',
        'ENTINTADO', 'ENTINTADA', 'ACEITE', 'WHITE', 'BLANCO', 'BLANCA',
        'NEGRO', 'NEGRA', 'GRIS', 'BEIGE', 'CAFE', 'NATURAL', 'TONO',
        'LACA', 'MATTE', 'MATE', 'BARNIZ', 'BRILLANTE', 'SEMI', 'CARDEADO', 'BLANQUEADO'
    ]);
    const SALA_SOFA_WOOD_GUARD_RE = /\b(SALA|SALAS|SOFA|SOFAS|SOFACAMA|SOFA\s+CAMA|MODULAR|SECCIONAL|ESCUADRA|LOVESEAT|LOVE\s+SEAT|CHAISE|ESQUINERO|FUTON|FUTTON)\b/i;
    const NON_WOOD_TEXTILE_CAT_RE = /^(COJINES\s+TEXTILES|TEXTILES|ROPA\s+DE\s+CAMA|TAPETES|ALFOMBRAS|COLCHONES|BLANCOS)$/i;
    const VISIBLE_WOOD_IN_NAME_RE = /\b(ROSA\s+MORADA|PALO\s+DE\s+ROSA|PAROTA|TZALAM|NOGAL|TECA|TEKA|TEAK|ENCINO|ROBLE|FRESNO|CEDRO|CAOBA|OLMO|HAYA|TABACO|TACUBA|BELLOTA|HABANO|ESPIGA|GINGER|CAMEL|NOCHE|NUEZ|MADERA|PATA(?:S)?\s+DE\s+MADERA|BASE\s+(?:EN\s+)?MADERA)\b/i;

    function expandWoodProviderAliases(provRaw) {
        const p = plainModelToken(provRaw);
        if (!p) return [];
        const out = new Set(p.split(/\s+/).filter(t => t.length >= 2));
        if (p.indexOf('ARTEX') !== -1 || p === 'ATX' || p === 'ARTC') {
            out.add('ARTEX');
            out.add('ATX');
            out.add('ARTC');
        }
        if (p.indexOf('LUX') !== -1) {
            out.add('LUX');
            out.add('FACTORI');
            out.add('FACTORY');
        }
        if (p.indexOf('MOBEL') !== -1) {
            out.add('MOBEL');
            out.add('INN');
        }
        return Array.from(out);
    }

    function normalizeWoodCanonicalText(raw) {
        return plainModelToken(raw)
            .replace(/\bFACTORY\b/g, 'FACTORI')
            .replace(/\b(?:TEKA|TEAK)\b/g, 'TECA')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function getUploadedWoodSwatchEntries() {
        if (_vwodIndexMapRef === invProductOverridesMap && _vwodIndexEntries.length > 0) {
            return _vwodIndexEntries;
        }
        const mergedByKey = new Map();
        const defKeys = Object.keys(DEFAULT_WOOD_SWATCHES_CATALOG);
        for (let i = 0; i < defKeys.length; i++) {
            const k = defKeys[i];
            const ovr = (invProductOverridesMap && Object.prototype.hasOwnProperty.call(invProductOverridesMap, k))
                ? invProductOverridesMap[k]
                : null;
            if (ovr && (ovr.status === 'ELIMINADO' || ovr.status === 'ARCHIVADO')) continue;
            const effective = (ovr && sanitizeVisualOverrideUrl(cleanStr(ovr.note))) ? ovr : DEFAULT_WOOD_SWATCHES_CATALOG[k];
            mergedByKey.set(k, { ovr: effective, isDefault: !ovr });
        }
        if (invProductOverridesMap && typeof invProductOverridesMap === 'object') {
            const ovKeys = Object.keys(invProductOverridesMap);
            for (let i = 0; i < ovKeys.length; i++) {
                const k = String(ovKeys[i] || '').trim().toUpperCase();
                if (k.indexOf('VWOD:') !== 0 || mergedByKey.has(k)) continue;
                const ovr = invProductOverridesMap[k];
                if (!ovr || ovr.status === 'ELIMINADO' || ovr.status === 'ARCHIVADO') continue;
                const url = sanitizeVisualOverrideUrl(cleanStr(ovr.note));
                if (!url) continue;
                mergedByKey.set(k, { ovr: ovr, isDefault: false });
            }
        }
        const entries = [];
        mergedByKey.forEach((meta, k) => {
            const ovr = meta.ovr;
            const url = sanitizeVisualOverrideUrl(cleanStr(ovr.note));
            if (!url) return;
            const rawLabel = cleanStr(ovr.name) || k.slice(5);
            const normName = normalizeWoodCanonicalText(rawLabel);
            const tokens = normName.split(/\s+/).filter(t => t.length >= 2);
            if (!normName || !tokens.length) return;
            const coreTokens = tokens.filter(t => !WOOD_FILLER_TOKENS.has(t));
            entries.push({
                overrideKey: k,
                label: rawLabel.toUpperCase(),
                normName: normName,
                tokens: tokens,
                tokenSet: new Set(tokens),
                coreTokens: coreTokens.length ? coreTokens : tokens,
                sortedSig: tokens.slice().sort().join(' '),
                url: url,
                isDefault: meta.isDefault
            });
        });
        entries.sort((a, b) => (a.isDefault === b.isDefault ? 0 : (a.isDefault ? 1 : -1)) || (b.tokens.length - a.tokens.length) || a.label.localeCompare(b.label));
        _vwodIndexMapRef = invProductOverridesMap;
        _vwodIndexEntries = entries;
        return entries;
    }

    function matchWoodTextAgainstUploadedSwatches(rawCandidateText, provHint) {
        const cleanRaw = cleanStr(rawCandidateText);
        if (!cleanRaw || NON_WOOD_MATERIAL_ONLY_RE.test(plainModelToken(cleanRaw))) return null;
        const normCand = normalizeWoodCanonicalText(cleanRaw);
        if (!normCand || normCand === 'ESTANDAR' || normCand === 'MADERA' || normCand === 'NATURAL' || normCand === 'TONO NATURAL') return null;

        const provAliases = expandWoodProviderAliases(provHint);
        const provNorm = plainModelToken(provHint);

        // 1) Coincidencia directa por clave VWOD: (primero con proveedor si existe, luego directa)
        const directTries = [];
        if (provNorm && normCand.indexOf(provNorm) === -1) {
            directTries.push(normCand + ' ' + provNorm);
        }
        directTries.push(cleanRaw, normCand);
        for (let d = 0; d < directTries.length; d++) {
            const dKey = buildWoodSwatchOverrideKey(directTries[d]);
            if (!dKey) continue;
            const dUrl = getVisualOverridePhotoUrl(dKey);
            if (dUrl) {
                const ovr = (invProductOverridesMap && invProductOverridesMap[dKey]) || DEFAULT_WOOD_SWATCHES_CATALOG[dKey];
                return {
                    overrideKey: dKey,
                    label: cleanStr(ovr && ovr.name) ? cleanStr(ovr.name).toUpperCase() : normCand,
                    url: dUrl
                };
            }
        }

        const entries = getUploadedWoodSwatchEntries();
        if (!entries.length) return null;

        const candTokens = normCand.split(/\s+/).filter(t => t.length >= 2);
        const coreCandTokens = candTokens.filter(t => !WOOD_FILLER_TOKENS.has(t));
        if (!coreCandTokens.length) return null;
        const nonProvCoreTokens = coreCandTokens.filter(t => !provAliases.includes(t) && !WOOD_PROVIDER_RE.test(t));
        if (!nonProvCoreTokens.length) return null;
        // Nunca permitir que solo modificadores genéricos (ej. "CLARO", "CLARA", "ENTINTADO", "OSCURO", "WHITE") emparejen una madera
        if (nonProvCoreTokens.every(t => WOOD_MODIFIER_ONLY_TOKENS.has(t))) return null;
        const candSet = new Set(candTokens);
        const candSortedSig = candTokens.slice().sort().join(' ');
        const candWantsSpecial = candTokens.some(t => WOOD_SPECIAL_FINISH_TOKENS.has(t));

        // 2) Igualdad exacta por nombre normalizado o conjunto de tokens (ej. "ROSA MORADA BARSA")
        for (let i = 0; i < entries.length; i++) {
            const e = entries[i];
            if (e.normName === normCand || e.sortedSig === candSortedSig) {
                return { overrideKey: e.overrideKey, label: e.label, url: e.url };
            }
        }

        // 3) Todos los tokens de la muestra están contenidos en el candidato (ej. candidato "ROSA MORADA BARSA NATURAL" -> "ROSA MORADA BARSA")
        const subsetOfCand = [];
        for (let i = 0; i < entries.length; i++) {
            const e = entries[i];
            if (e.tokens.every(tok => candSet.has(tok))) {
                subsetOfCand.push(e);
            }
        }
        if (subsetOfCand.length) {
            subsetOfCand.sort((a, b) => {
                const aProv = provAliases.some(p => a.tokenSet.has(p)) ? 0 : 1;
                const bProv = provAliases.some(p => b.tokenSet.has(p)) ? 0 : 1;
                if (aProv !== bProv) return aProv - bProv;
                return b.tokens.length - a.tokens.length;
            });
            const best = subsetOfCand[0];
            return { overrideKey: best.overrideKey, label: best.label, url: best.url };
        }

        // 4) Todos los tokens núcleo del candidato están contenidos en la muestra (con prioridad de proveedor y acabado estándar)
        const matchingEntries = [];
        for (let i = 0; i < entries.length; i++) {
            const e = entries[i];
            if (coreCandTokens.every(tok => e.tokenSet.has(tok))) {
                matchingEntries.push(e);
            }
        }
        if (matchingEntries.length) {
            matchingEntries.sort((a, b) => {
                const aProv = provAliases.length && provAliases.some(p => a.tokenSet.has(p)) ? 0 : 1;
                const bProv = provAliases.length && provAliases.some(p => b.tokenSet.has(p)) ? 0 : 1;
                if (aProv !== bProv) return aProv - bProv;
                const aHasSpecial = a.tokens.some(t => WOOD_SPECIAL_FINISH_TOKENS.has(t));
                const bHasSpecial = b.tokens.some(t => WOOD_SPECIAL_FINISH_TOKENS.has(t));
                const aSpecPenalty = (!candWantsSpecial && aHasSpecial) ? 1 : 0;
                const bSpecPenalty = (!candWantsSpecial && bHasSpecial) ? 1 : 0;
                if (aSpecPenalty !== bSpecPenalty) return aSpecPenalty - bSpecPenalty;
                return (a.isDefault === b.isDefault ? 0 : (a.isDefault ? 1 : -1)) || (a.tokens.length - b.tokens.length);
            });
            const best = matchingEntries[0];
            return { overrideKey: best.overrideKey, label: best.label, url: best.url };
        }

        // 5) Si el candidato tenía proveedor no presente en la muestra (ej. "PAROTA HAKO"), reintentar solo especie
        if (coreCandTokens.length >= 2) {
            const speciesOnly = coreCandTokens.filter(t => !provAliases.includes(t) && !WOOD_PROVIDER_RE.test(t));
            if (speciesOnly.length > 0 && speciesOnly.length < coreCandTokens.length) {
                return matchWoodTextAgainstUploadedSwatches(speciesOnly.join(' '), provHint);
            }
        }

        return null;
    }

    function getWoodSwatchPhotoUrl(woodKey, itemOpt) {
        const prov = itemOpt ? cleanStr(itemOpt.p) : '';
        const directUrl = getVisualOverridePhotoUrl(buildWoodSwatchOverrideKey(woodKey));
        if (directUrl) return directUrl;
        const matched = matchWoodTextAgainstUploadedSwatches(woodKey, prov);
        if (matched && matched.url) return matched.url;
        if (itemOpt) {
            const fromItem = findMatchingWoodSwatchForItem(itemOpt, null);
            if (fromItem && fromItem.url) return fromItem.url;
        }
        return '';
    }

    function findMatchingWoodSwatchForItem(it, groupObj) {
        if (!it) return null;
        const catNorm = plainModelToken(cleanStr(it._cat || it.c));
        const nameNorm = plainModelToken(stripDimensionsFromProductText(it.n));
        const typeNameNorm = plainModelToken(cleanStr(it.tp) + ' ' + cleanStr(it.n));

        // 1) Nunca mostrar madera en textiles/accesorios no maderables (cojines, fundas, hilos, tapetes, colchones)
        if (NON_WOOD_TEXTILE_CAT_RE.test(catNorm) || /\b(COJIN|COJINES|FUNDA|FUNDAS|ALMOHADON|SABANA|DUVET|MANTEL|HILO|CONO\s+DE\s+HILO|TOALLA|TAPETE|ALFOMBRA|COLCHON|CORTINA)\b/i.test(typeNameNorm)) {
            return null;
        }

        // 2) REGLA SALAS / SOFÁS: las salas tapizadas NO muestran madera de casco interno (ej. "PINO ESTUFADO" / "CLARO")
        //    SOLO muestran muestra de madera si el NOMBRE del producto menciona explícitamente madera/acabado visible.
        const isSalaOrSofa = SALA_SOFA_WOOD_GUARD_RE.test(catNorm + ' ' + typeNameNorm);
        if (isSalaOrSofa && !VISIBLE_WOOD_IN_NAME_RE.test(nameNorm)) {
            return null;
        }

        const md = cleanStr(it.md);
        const cm = cleanStr(it.cm);
        const prov = cleanStr(it.p);
        const mdNorm = plainModelToken(md);
        const cmNorm = plainModelToken(cm);
        if (mdNorm && NON_WOOD_MATERIAL_ONLY_RE.test(mdNorm) && (!cmNorm || NON_WOOD_MATERIAL_ONLY_RE.test(cmNorm))) {
            return null;
        }
        // Si el producto especifica explícitamente pata negra / laca negra / laca blanca en el nombre sin especie visible, no mostrar madera natural
        if (/^(?:LACA\s+)?(?:NEGR[OA]|BLANC[OA])$/i.test(cmNorm) && /\b(?:PATA(?:S)?\s+NEGR[OA]S?|LACA\s+(?:NEGR[OA]|BLANC[OA]))\b/i.test(nameNorm) && !VISIBLE_WOOD_IN_NAME_RE.test(nameNorm)) {
            return null;
        }

        const candidates = [];
        const mdOk = Boolean(md && !NON_WOOD_MATERIAL_ONLY_RE.test(mdNorm));
        const cmOk = Boolean(cm && !NON_WOOD_MATERIAL_ONLY_RE.test(cmNorm));
        // Priorizar combinación especie + acabado (ej. "TECA ENTINTADO", "ROSA MORADA CLARA") antes de sueltos
        if (mdOk && cmOk && cmNorm.indexOf(mdNorm) === -1) {
            if (prov && (mdNorm + ' ' + cmNorm).indexOf(plainModelToken(prov)) === -1) candidates.push(md + ' ' + cm + ' ' + prov);
            candidates.push(md + ' ' + cm);
        }
        if (cmOk) {
            if (prov && cmNorm.indexOf(plainModelToken(prov)) === -1) candidates.push(cm + ' ' + prov);
            candidates.push(cm);
        }
        if (mdOk) {
            if (prov && mdNorm.indexOf(plainModelToken(prov)) === -1) candidates.push(md + ' ' + prov);
            candidates.push(md);
        }
        if (cleanStr(it.vr)) {
            const vrParts = String(it.vr).split(/\s*[·|\/]\s*/).map(cleanStr).filter(Boolean);
            for (let i = 0; i < vrParts.length; i++) {
                if (isPureWoodDescriptor(vrParts[i])) candidates.push(vrParts[i]);
            }
            if (isPureWoodDescriptor(it.vr)) candidates.push(cleanStr(it.vr));
        }

        const tried = new Set();
        for (let i = 0; i < candidates.length; i++) {
            const c = cleanStr(candidates[i]);
            if (!c || tried.has(c)) continue;
            tried.add(c);
            const hit = matchWoodTextAgainstUploadedSwatches(c, prov);
            if (hit && hit.url) return hit;
        }

        // Respaldo conservador: si no venían columnas MADERA/COLOR MADERA, buscar únicamente especies inequívocas en el nombre
        if (!md && !cm && nameNorm) {
            const spMatch = nameNorm.match(/\b(ROSA\s+MORADA|PALO\s+DE\s+ROSA|PAROTA|TZALAM|NOGAL|TECA|TEKA|TEAK|ENCINO|ROBLE)\b/i);
            if (spMatch && spMatch[1]) {
                const hit = matchWoodTextAgainstUploadedSwatches(spMatch[1], prov);
                if (hit && hit.url) return hit;
            }
        }
        return null;
    }

    function resolveVisualImgSrc(rawUrl, sizePx) {
        const clean = cleanStr(rawUrl);
        if (!clean || /^blob:/i.test(clean)) return '';
        const allowed = sanitizeVisualOverrideUrl(clean, { allowDataImage: true });
        if (!allowed) return '';
        if (/^data:image\//i.test(allowed)) return allowed;
        const fid = extractDriveFileId(allowed);
        if (fid) {
            return 'https://lh3.googleusercontent.com/d/' + fid + '=w' + (Number(sizePx) || 400);
        }
        return allowed;
    }

    function isVisualPhotoEditorAllowed() {
        try {
            return typeof isEffectiveAdminSession === 'function' && isEffectiveAdminSession() &&
                typeof hasAdminPerm === 'function' && hasAdminPerm('fotosApp');
        } catch (e) {
            return false;
        }
    }

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
        'ASPEN', 'AVALANCHE', 'AVENZANO', 'GALARDI', 'KASSIA', 'PONZETTA', 'TRENTO', 'SANTHOMAS',
        'ALTEA', 'BAIKAL', 'CALGARY', 'HARRIS', 'MILAN', 'TESSA', 'TORINO', 'VERSELLI', 'WEMBLEY', 'WILLIAMS'
    ]);

    const SALA_EN_L_MODELS = new Set([
        'DONATI', 'MATERA', 'AMARETO', 'DOVELLI', 'GALES', 'IBIZA',
        'LEXY', 'MAWI', 'PIERO', 'TEREANI', 'VALENTI', 'VARENA',
        'LUNA', 'MELODY', 'MEMPHIS', 'PERRY',
        'CAPRI', 'CHELSEA', 'OXFORD', 'VANCOUVER'
    ]);

    const SOFA_CAMA_MODELS = new Set(['CITY', 'ASHA']);

    const MANUAL_SUBCATEGORY_ALIAS_MAP = (function buildManualSubcategoryAliasMap() {
        const normKey = (s) => String(s || '')
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
        const m = Object.create(null);
        Object.keys(MAIN_OF_SUB).forEach((sub) => {
            if (sub && sub !== 'OTROS') m[normKey(sub)] = sub;
        });
        const aliases = {
            'SOFA CAMA': 'FUTONES & SOFÁ CAMAS',
            'SOFA CAMAS': 'FUTONES & SOFÁ CAMAS',
            'SOFACAMA': 'FUTONES & SOFÁ CAMAS',
            'SOFACAMAS': 'FUTONES & SOFÁ CAMAS',
            'FUTON': 'FUTONES & SOFÁ CAMAS',
            'FUTONES': 'FUTONES & SOFÁ CAMAS',
            'FUTTON': 'FUTONES & SOFÁ CAMAS',
            'FUTTONES': 'FUTONES & SOFÁ CAMAS',
            'FUTONES Y SOFA CAMAS': 'FUTONES & SOFÁ CAMAS',
            'FUTONES SOFA CAMAS': 'FUTONES & SOFÁ CAMAS',
            'SOFA CAMA Y FUTTONES': 'FUTONES & SOFÁ CAMAS',
            'SALA MODULAR': 'SALAS MODULARES',
            'SALA EN L': 'SALAS EN L',
            'ESCUADRA': 'SALAS EN L',
            'SOFA': 'SOFAS & LOVESEATS',
            'SOFAS': 'SOFAS & LOVESEATS',
            'LOVESEAT': 'SOFAS & LOVESEATS',
            'LOVE SEAT': 'SOFAS & LOVESEATS',
            'SOFAS Y LOVESEATS': 'SOFAS & LOVESEATS',
            'SILLON': 'SILLONES',
            'MESA DE CENTRO': 'MESAS DE CENTRO',
            'MESA CENTRO': 'MESAS DE CENTRO',
            'MESA LATERAL': 'MESAS LATERALES',
            'MESA AUXILIAR': 'MESAS LATERALES',
            'MESAS AUXILIARES': 'MESAS LATERALES',
            'MESA': 'MESAS',
            'MESAS DE COMEDOR': 'MESAS',
            'MESA DE COMEDOR': 'MESAS',
            'SILLA': 'SILLAS',
            'SILLAS COMEDOR': 'SILLAS',
            'SILLAS COMEDORES': 'SILLAS',
            'BANCO': 'BANCOS & BANCAS',
            'BANCOS': 'BANCOS & BANCAS',
            'BANCA': 'BANCOS & BANCAS',
            'BANCAS': 'BANCOS & BANCAS',
            'BANCOS Y BANCAS': 'BANCOS & BANCAS',
            'BUFETERA': 'BUFETERAS',
            'CAMA': 'CAMAS',
            'CABECERA': 'CABECERAS',
            'COLCHON': 'COLCHONES',
            'BASE': 'BASES',
            'BASE DE CAMA': 'BASES',
            'BURO': 'BURÓS',
            'COMODA': 'COMODAS Y TOCADORES',
            'COMODAS': 'COMODAS Y TOCADORES',
            'TOCADOR': 'COMODAS Y TOCADORES',
            'TOCADORES': 'COMODAS Y TOCADORES',
            'MUEBLE PARA TV': 'MUEBLES PARA TV',
            'MUEBLE DE TV': 'MUEBLES PARA TV',
            'MESA DE TV': 'MUEBLES PARA TV',
            'CREDENZA': 'CREDENZAS',
            'MUEBLE DE BAR': 'MUEBLES DE BAR',
            'BAR': 'MUEBLES DE BAR',
            'CAVA': 'MUEBLES DE BAR',
            'LIBRERO': 'LIBREROS',
            'ESCRITORIO': 'ESCRITORIOS',
            'OFICINA': 'ESCRITORIOS',
            'EXTERIOR Y TERRAZA': 'EXTERIOR',
            'EXTERIOR TERRAZA': 'EXTERIOR',
            'TERRAZA': 'EXTERIOR',
            'ESPEJO': 'ESPEJOS',
            'CUADRO': 'CUADROS',
            'LAMPARA': 'LÁMPARAS',
            'ILUMINACION': 'LÁMPARAS',
            'COJIN': 'COJINES & TEXTILES',
            'COJINES': 'COJINES & TEXTILES',
            'TEXTILES': 'COJINES & TEXTILES',
            'COJINES Y TEXTILES': 'COJINES & TEXTILES',
            'ACCESORIO': 'ACCESORIOS DECORATIVOS',
            'ACCESORIOS': 'ACCESORIOS DECORATIVOS'
        };
        Object.keys(aliases).forEach((k) => { m[normKey(k)] = aliases[k]; });
        return m;
    })();

    function resolveManualSubcategoryOverride(rawCat) {
        const s = cleanStr(rawCat);
        if (!s || /^(?:VISUAL_COVER|FABRIC_SWATCH|WOOD_SWATCH)$/i.test(s)) return '';
        const normKey = s
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
        return MANUAL_SUBCATEGORY_ALIAS_MAP[normKey] || '';
    }

    function isExteriorFurnitureItem(it, allTxt, prodTxt, mo, tp, nom, cat) {
        if (/\bINTERIOR\b/.test(nom) || /\bCUADRO\b/.test(prodTxt)) return false;
        const prov = String(cleanStr(it && it.p)).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
        if (/\b(EXTERIOR|CAMASTRO|COLUMPIO|SOMBRILLA|POLYRATAN|POLYRATTAN|TERRAZA|INTEMPERIE|SUNBRELLA|ALBERCA)\b/.test(allTxt)) {
            return true;
        }
        // Proveedores y materiales exclusivos de mobiliario de exterior (HANGKAI Teka/Cuerda y G&C Aluminio/Polvo Alumbre)
        if (prov === 'HANGKAI' || /^HAK/i.test(cleanStr(it && it.s))) {
            return true;
        }
        if (prov === 'G&C' && !/^(COJIN|MACETA|ACCESORIO)$/.test(tp)) {
            return true;
        }
        if (/\b(POLVO\s+ALUMBRE|TUBO\s+DE\s+ALUMINIO|CUERDA\s+SINTETICA|TELA\s+REPELENTE)\b/.test(prodTxt)) {
            return true;
        }
        // Colecciones de exterior conocidas sin la palabra "EXTERIOR" en el nombre ERP
        if (mo === 'ALTEA' && /\b(TEKA|TECA|GLACIER\s+ICE|ESQUINERO|OTTOMAN|SILLON|MESA)\b/.test(prodTxt)) {
            return true;
        }
        if (mo === 'SANTHOMAS' && !/\b(BUFETERA|COMODA|SILLA)\b/.test(prodTxt) && /\b(TECA|TEKA|LOVE\s*SEAT|MODULAR|EXTERIOR)\b/.test(prodTxt)) {
            return true;
        }
        if (mo === 'SANTA MONICA' && /^MIN/i.test(cleanStr(it && it.s))) {
            return true;
        }
        if (cat === 'EXTERIOR & TERRAZA') {
            return true;
        }
        return false;
    }

    function isModularOrSectionalSalaPiece(prodTxt, nomHeadSub, mo, moFirst, tp) {
        // Sillas de comedor o sillones explícitamente ocasionales/individuales sin brazo direccional ni modularidad NO son módulos
        if (/\bSILLAS?\b/.test(nomHeadSub) && !/\bSILLON(?:ES)?\b/.test(nomHeadSub)) return false;
        const isExplicitModularText = /\b(MODULAR(?:ES)?|MODULOS?|ESQUINEROS?|REMATES?|SIN\s+BRAZOS?|CON\s+BRAZO\s+(?:DER(?:ECHO|EHO)?|IZQ(?:UIERDO)?)|BRAZO\s+(?:DER(?:ECHO|EHO)?|IZQ(?:UIERDO)?)|B\/DER|B\/IZQ|(?:SILLON|SOFA|LOVE\s*SEAT|LOVESEAT|LOVE)\s+(?:CURVO\s+)?(?:DER(?:ECHO|EHO)?|IZQ(?:UIERDO)?|CENTRAL|MODULAR))\b/.test(prodTxt);
        if (isExplicitModularText) return true;
        // Piezas de modelos modulares conocidos (excepto SILLON OCASIONAL como ARIA SILLON OCASIONAL)
        const isOccasionalChair = /\b(OCASIONAL|MECEDORA|RECLINABLE|BERGERE|BUTACA)\b/.test(prodTxt);
        if (!isOccasionalChair && (MODULAR_SALA_MODELS.has(mo) || MODULAR_SALA_MODELS.has(moFirst))) {
            if (/\b(SILLON(?:ES)?|SOFAS?|LOVE\s*SEATS?|LOVESEATS?|ESQUINEROS?|CHAISE|OTTOMAN|OTOMAN|TABURETES?|REMATE)\b/.test(tp + ' ' + nomHeadSub)) {
                return true;
            }
        }
        return false;
    }

    function classifyItemSubcategory(it) {
        const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
        // Prioridad 0: categoría editada manualmente por Kevin en _INV_PRODUCT_OVERRIDES (ej. "Sofa camas" -> "FUTONES & SOFÁ CAMAS")
        const manualOvr = getProductOverrideForSku(it && it.s);
        if (manualOvr && manualOvr.category) {
            const manualSub = resolveManualSubcategoryOverride(manualOvr.category);
            if (manualSub) return manualSub;
        }
        const cat = norm(cleanStr(it && it.c));
        const tp = norm(cleanStr(it && it.tp));
        const mo = norm(cleanStr(it && it.mo));
        const moFirst = mo.split(/\s+/)[0] || '';
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
        if (isExteriorFurnitureItem(it, allTxt, prodTxt, mo, tp, nom, cat)) {
            return 'EXTERIOR';
        }
        if (/\b(LAMPARA|CANDIL|ARBOTANTE|LUMINARIA|PLAFON)\b/.test(prodTxt) || cat === 'ILUMINACION') {
            return 'LÁMPARAS';
        }
        // Textiles de cama (cubrecamas, juegos de sábanas, sets de blancos 11 pzas) NO son muebles de cama
        if (
            /\b(CUBRE\s*CAMAS?|JUEGO\s+(?:DE\s+)?SABANAS?|JGO\.?\s+SABANAS?|SABANAS?|COLCHAS?|EDREDON(?:ES)?|DUVET)\b/.test(prodTxt) ||
            (
                /\bSET\b/.test(nom) &&
                /\(\s*(?:[4-9]|[1-9]\d)\s*PZAS?\s*\)/.test(nom) &&
                /\b(KING(?:\s+SIZE)?|QUEEN(?:\s+SIZE)?|MATRIMONIAL|MAT\/QUEEN|INDIVIDUAL|KS|QS)\b/.test(nom) &&
                !/\b(CABECERA|BASE\s+DE\s+CAMA|PATAS?|EXTENSIONES?|BURO|COMODA|CAJONERA)\b/.test(nom)
            )
        ) {
            return 'COJINES & TEXTILES';
        }
        const isFurniturePiece = /\b(SALAS?|SOFAS?|LOVE\s*SEATS?|LOVESEATS?|LOVE\s+CON\s+BRAZO|SILLON(?:ES)?|BUTACAS?|CHAISE|ESQUINEROS?|FUTTON(?:ES)?|FUTON(?:ES)?|OTTOMAN|OTOMAN|POUF|PUFF?|MESAS?\s+(?:DE\s+)?(?:COMEDOR|CENTRO|CENTRAL|LATERAL|AUXILIAR|BAR|TV)|ANTECOMEDOR(?:ES)?|COMEDOR(?:ES)?|SILLAS?|BANCOS?|BANCAS?|TABURETES?|BUFETERAS?|CREDENZAS?|CONSOLAS?|CAVAS?|LIBREROS?|ESCRITORIOS?|CAMAS?|CABECERAS?|BASES?\s+(?:DE\s+)?CAMA|BUROS?|COMODAS?|TOCADOR(?:ES)?|CAJONERAS?|LITERAS?|CUNAS?|COLCHON(?:ES)?|PIE\s+DE\s+CAMA|CAMASTROS?|COLUMPIOS?)\b/.test(tp + ' ' + nom) ||
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
        if (/\bPROTECTOR(?:ES)?\s+SAFETY\b/.test(prodTxt) || (/^PROTECTOR(?:ES)?\b/.test(nom) && !/\bCOLCHON\b/.test(nom))) {
            return 'ACCESORIOS DECORATIVOS';
        }
        if (/\bESPEJOS?\b/.test(tp) || (/^ESPEJO\b/.test(nom) && !/\b(TOCADOR|COMODA)\b/.test(prodTxt))) {
            return 'ESPEJOS';
        }
        if (/\b(CUADRO|ARTE\s+OBJETO|DECORATIVO\s+(?:DE\s+)?PARED|PINTURA|LIENZO|GICLEE)\b/.test(prodTxt)) {
            return 'CUADROS';
        }
        // Pieza de sala mal etiquetada como ACCESORIO DECORATIVO en ERP (ej. HARRIS LOVE CON BRAZO DERECHO)
        const isMislabelledSalaModule = /\b(LOVE\s+CON\s+BRAZO|BRAZO\s+(?:DER|IZQ))\b/.test(nom) && (MODULAR_SALA_MODELS.has(mo) || SALA_EN_L_MODELS.has(mo));
        if (
            !isMislabelledSalaModule && (
                /^(?:ACCESORIOS?(?:\s+DECORATIVOS?)?|ACCECORIO|FLORERO|JARRON|ESCULTURA|CHAROLA|BANDEJA|FRUTERO|ENSALADERA|CANDELABRO|PORTAVELAS?|PORTARRETRATO|MACETA|PLANTA(?:\s+DECORATIVA)?|FOLLAJE|VELAS?|LIBRO(?:\s+DECORATIVO)?|BOTELLA|BOTELLON|PLATO(?:\s+HONDO)?(?:\s+DECORATIVO)?|PLATON|SET\s+PLATO|TAZON|BATEA|BOLSA|CANAST[OA]|CESTA|LINTERNA|FAROL|CORAL|CONCHA|BOWL|CORDON\s+DECORATIVO|DECORATIVO\s+NAVIDAD|PERCHERO|MAMPARA|BIOMBO|PAPEL\s+TAPIZ|LAMBRIN(?:\s+DECORATIVO)?|LAMINA\s+DE\s+PVC|PISOS?\s+MODULARES?|ARCHIVERO|PEDESTAL|GARANTIA|MAQFOR|PRODUCTO\s+ESPECIAL|BAUL)$/.test(tp) ||
                /\b(CENTRO\s+DE\s+MESA|RELOJ\s+DE\s+MESA|ADORNO\s+DE\s+MESA|LIBRO\s+DECORATIVO|PLANTA\s+DECORATIVA)\b/.test(prodTxt) ||
                (tp === 'ESCUADRA' && /\b(PATA|CARPINTERIA)\b/.test(allTxt))
            )
        ) {
            return 'ACCESORIOS DECORATIVOS';
        }

        // 2) Subcategorías de RECÁMARAS, COMEDORES, SALAS y COMPLEMENTOS
        if (/\bPIE\s+DE\s+CAMA\b/.test(prodTxt) || (/\bBANCAS?\b/.test(prodTxt) && /\bPIE\s+DE\s+CAMA\b/.test(allTxt))) {
            return 'PIE DE CAMA';
        }
        const isSalaModularTaburete = /\bTABURETES?\b/.test(prodTxt) && (
            MODULAR_SALA_MODELS.has(mo) || MODULAR_SALA_MODELS.has(moFirst) ||
            SALA_EN_L_MODELS.has(mo) || SALA_EN_L_MODELS.has(moFirst)
        );
        if (!isSalaModularTaburete && /\b(BANCOS?|BANCAS?|TABURETES?)\b/.test(prodTxt) && !/\bSALA\b/.test(tp)) {
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
        if (
            /\b(SOFAS?\s*CAMAS?|SOFA-CAMA|FUTON(?:ES)?|FUTTON(?:ES)?|DAYBED)\b/.test(prodTxt) ||
            ((SOFA_CAMA_MODELS.has(mo) || dynamicSofaCamaModels.has(extractPlainModelKeyForPairing(it))) && /\b(CHAISE|SOFA|LOVE\s*SEAT|SALA|OTTOMAN)\b/.test(prodTxt))
        ) {
            return 'FUTONES & SOFÁ CAMAS';
        }
        if (/\bCABECERAS?\b/.test(prodTxt) && tp !== 'CAMA') {
            return 'CABECERAS';
        }
        if (
            tp !== 'CAMA' && (
                /\b(BASES?\s+(?:DE\s+)?CAMA|BASES?\s+(?:PARA\s+)?COLCHON|BASES?\s+(?:KS|QS|MAT|MTR|IND|KING(?:\s+SIZE)?|QUEEN(?:\s+SIZE)?|MATRIMONIAL|INDIVIDUAL)|BOX\s*SPRING)\b/.test(prodTxt) ||
                tp === 'BOX' ||
                (/^BASES?\b/.test(tp) && !/\b(COMEDOR|MESA|CUBIERTA|CRISTAL|MARMOL|LAMPARA)\b/.test(allTxt))
            )
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
        const nomHeadSub = nom.split(/\b(?:INCLUYE|INCL|CON\s+\d|CON\s+MESAS?\b|CON\s+SILLAS?\b|C\/\s*FUNDAS)\b/)[0].trim();
        const isModularPiece = isModularOrSectionalSalaPiece(prodTxt, nomHeadSub, mo, moFirst, tp);
        if (
            !isModularPiece &&
            /\b(SILLON(?:ES)?|BUTACAS?|MECEDORAS?|RECLINABLES?|BERGERE)\b/.test(nomHeadSub) &&
            !/\bSILLAS?\b/.test(nomHeadSub) &&
            !/^(?:SALA|SOFA\s+CAMA|FUTTON|FUTON)\b/.test(nomHeadSub)
        ) {
            return 'SILLONES';
        }
        if (
            /\bSILLAS?\b/.test(nomHeadSub) &&
            !/\b(SILLON(?:ES)?|MESAS?|COLGANTES?|COLUMPIOS?)\b/.test(nomHeadSub) &&
            !/^SALA\b/.test(nomHeadSub)
        ) {
            return 'SILLAS';
        }
        if (/^SILLAS?\b/.test(tp) && !/\bSILLON(?:ES)?\b/.test(nomHeadSub)) {
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
            if (!isModularPiece && /\b(SILLON(?:ES)?|BUTACAS?|MECEDORAS?|RECLINABLES?|BERGERE)\b/.test(prodTxt)) {
                return 'SILLONES';
            }
            if (/\bSILLAS?\b/.test(prodTxt)) {
                return 'SILLAS';
            }
        }
        if (
            isModularPiece ||
            isMislabelledSalaModule ||
            /\b(SALAS?|SOFAS?|LOVE\s*SEATS?|LOVESEATS?|MODULOS?|MODULAR(?:ES)?|ESQUINEROS?|ESQUINERAS?|RINCONERAS?|CHAISE(?:\s+LONGUE)?|OTTOMAN|OTOMAN|POUF|PUFF?|SECCIONAL(?:ES)?|REMATES?)\b/.test(prodTxt)
        ) {
            if (/\b(SALAS?\s+EN\s+L|SECCIONAL(?:ES)?\s+EN\s+L|EN\s+ESCUADRA)\b/.test(prodTxt)) {
                return 'SALAS EN L';
            }
            if (SALA_EN_L_MODELS.has(mo) || SALA_EN_L_MODELS.has(moFirst)) {
                return 'SALAS EN L';
            }
            if (
                isModularPiece ||
                isMislabelledSalaModule ||
                /\b(MODULAR(?:ES)?|MODULOS?|ESQUINEROS?|REMATES?)\b/.test(prodTxt) ||
                MODULAR_SALA_MODELS.has(mo) ||
                MODULAR_SALA_MODELS.has(moFirst)
            ) {
                return 'SALAS MODULARES';
            }
            if (
                /\b(CHAISE(?:\s+LONGUE)?|EN\s+L|ESQUINERAS?|SECCIONAL(?:ES)?)\b/.test(prodTxt) ||
                (/\b(SOFAS?|LOVE\s*SEATS?|LOVESEATS?|SALAS?)\b/.test(prodTxt) && /\b(BRAZO\s+DER(?:ECHO|EHO)?|BRAZO\s+IZQ(?:UIERDO)?|B\/DER|B\/IZQ|DERECHO|DEREHO|IZQUIERDO|DER|IZQ)\b/.test(prodTxt))
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
