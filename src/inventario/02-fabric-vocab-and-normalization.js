    // ------------------------------------------------------------------------
    // VALIDACIÓN Y RECONCILIACIÓN DE TELA Y COLOR DE TELA CONTRA NOMBRE (REQ 2A)
    // ------------------------------------------------------------------------
    const FABRIC_SINGLE_COLOR_WORDS = new Set([
        'BLANCO', 'BLANCA', 'WHITE', 'NEGRO', 'NEGRA', 'BLACK', 'GRIS', 'GREY', 'GRAY',
        'CAFE', 'BROWN', 'COFFE', 'COFFEE', 'CHOCOLATE', 'CREMA', 'CREAM', 'BEIGE', 'ARENA', 'SAND',
        'HUESO', 'BONE', 'MARFIL', 'IVORY', 'CRUDO', 'ECRU', 'NATURAL', 'TOPO', 'TAUPE',
        'AZUL', 'BLUE', 'MARINO', 'NAVY', 'SKY', 'CELESTE', 'AQUA', 'TEAL', 'TURQUESA',
        'VERDE', 'GREEN', 'OLIVO', 'OLIVA', 'OLIVE', 'MUSGO', 'MOSS', 'ESMERALDA',
        'ROJO', 'ROJA', 'RED', 'CORAL', 'TERRACOTA', 'BRICK', 'OXIDO', 'NARANJA', 'ORANGE', 'CALABAZA',
        'AMARILLO', 'AMARILLA', 'YELLOW', 'MOSTAZA', 'MUSTARD', 'ORO', 'DORADO', 'GOLD',
        'ROSA', 'PINK', 'MORADO', 'MORADA', 'PURPLE', 'LILA', 'VIOLETA', 'PLATA', 'SILVER', 'CARBÓN', 'CARBON', 'CHARCOAL', 'OXFORD', 'AVENA', 'OATMEAL'
    ]);

    const COLOR_FAMILY_RULES = [
        // WHITE / OFF-WHITE / BONE / IVORY / PEARL / OYSTER / SNOW / COTTON / ALABASTER / RICE
        [/\b(?:BLANC[OA]|WHITE|SNOW|NIEVE|COTTON|ALGODON|MARFIL|IVORY|PORCELAIN|PORCELANA|ALABASTER|ALABASTRO|CHALK|TIZA|PERLA|PEARL|HIELO|ICE|ARROZ|RICE|TUSK|HUESO|BONE|CREMA|CREAM|BUTTERMILK|VAINILLA|OSTRA|OSTION|OYSTER|GLACIER|CRUDO|ECRU)\b/, 'WHITE'],
        // BEIGE / LINEN / FLAX / SAND / NATURAL / OAT / CREAM / BONE / KHAKI / CASHMERE / DUNE / PUTTY / JUTE
        [/\b(?:BEIGE|ARENA|SAND|LINO|LINEN|FLAX|NATURAL|AVENA|OAT|OATMEAL|CREMA|CREAM|HUESO|BONE|MARFIL|IVORY|CRUDO|ECRU|KHAKI|CAQUI|DUNE|PUTTY|YUTE|JUTE|CACHEMIRA|CASHMERE|TOSTADO|TOAST|PERLA|VAINILLA)\b/, 'BEIGE'],
        // TAUPE / TOPO / MUSHROOM / PEYOTE / STONE / GREIGE / GRAYGE
        [/\b(?:TAUPE|TOPO|MUSHROOM|PEYOTE|GREIGE|GRAYGE|PIEDRA|STONE|TOSTADO|TOAST|VISON|MINK|FOSSIL|FOSIL)\b/, 'TAUPE'],
        // BROWN / CAFE / COFFEE / CHOCOLATE / CARAMEL / CAMEL / TERRACOTTA / BRICK / NOGAL / TABACO
        [/\b(?:CAFE|COFFE|COFFEE|BROWN|CHOCOLATE|CAMEL|CARAMELO|CANELA|BRONCE|COBRE|TERRACOTA|BRICK|OXIDO|RUST|NUEZ|TABACO|HABANO|TOSTADO|TOAST|AUTUMN)\b/, 'BROWN'],
        // GREY / GRIS / SILVER / PLATINUM / CHARCOAL / OXFORD / DOVE / OYSTER / SLATE / METAL / MINERAL / FOSIL / NIEBLA
        [/\b(?:GRIS|GREY|GRAY|GRAYGE|PLATA|SILVER|PLATINO|PLATINUM|CHARCOAL|CARBON|OXFORD|DOVE|PALOMA|OSTRA|OSTION|OYSTER|FOSIL|FOSSIL|MINERAL|METAL|METALICO|NIEBLA|MIST|CENIZO|ASH|SLATE|GRAFITO|ANTRACITA|PLOMO|HUMO|SMOKE)\b/, 'GREY'],
        // BLACK / NEGRO / ONYX / DOMINO / JET
        [/\b(?:NEGR[OA]|BLACK|ONIX|ONYX|DOMINO|JET|CARBON|CHARCOAL)\b/, 'BLACK'],
        // BLUE / AZUL / NAVY / MARINO / MIDNIGHT / SKY / TEAL / AQUA / PETROL / DENIM / INDIGO
        [/\b(?:AZUL|BLUE|MARINO|NAVY|MIDNIGHT|MEDIANOCHE|SKY|CIELO|CELESTE|TURQUESA|AQUA|TEAL|PETROLEO|DENIM|INDIGO|COBALTO|ZAFIRO)\b/, 'BLUE'],
        // GREEN / VERDE / OLIVE / OLIVO / MOSS / PINO / SAGE / EMERALD / APPLE / MINT / TEAL
        [/\b(?:VERDE|GREEN|OLIV[OA]|OLIVE|MUSGO|MOSS|PINO|SAGE|SALVIA|ESMERALDA|EMERALD|MENTA|MINT|MANZANA|APPLE|BOSQUE|FOREST|JADE|TEAL|AQUA)\b/, 'GREEN'],
        // CORAL / RED / TERRACOTTA / ORANGE / CALABAZA / PINK / ROSA / BRICK / SALMON / BURGUNDY
        [/\b(?:CORAL|ROJ[OA]|RED|TERRACOTA|BRICK|NARANJA|ORANGE|CALABAZA|SALMON|VINO|BURGUNDY|BORGOÑA|CARMESI|ROSA|PINK|MELOCOTON|DURAZNO|OXIDO)\b/, 'CORAL'],
        // YELLOW / AMARILLO / MUSTARD / CURRY / GOLD / ORO / DORADO
        [/\b(?:AMARILL[OA]|YELLOW|MOSTAZA|MUSTARD|CURRY|ORO|DORAD[OA]|GOLD|OCRE|MIEL|HONEY|AMBAR|AMBER)\b/, 'YELLOW'],
        // PURPLE / MORADO / LILA / VIOLETA / LAVANDA / CIRUELA
        [/\b(?:MORAD[OA]|PURPLE|LILA|VIOLETA|LAVANDA|CIRUELA|PLUM|UVA|MALVA)\b/, 'PURPLE']
    ];

    const EXPLICIT_COLOR_CUE_TABLE = [
        [/\bGRIS\s+CLARO\b/, 'GRIS CLARO', ['GREY']],
        [/\bGRIS\s+OSCURO\b|\bDARK\s+GREY\b|\bDARK\s+GRAY\b/, 'GRIS OSCURO', ['GREY']],
        [/\bBEIGE\s+CLARO\b/, 'BEIGE CLARO', ['BEIGE']],
        [/\bAZUL\s+MARINO\b|\bMARINO\b|\bNAVY\b/, 'AZUL MARINO', ['BLUE']],
        [/\bAZUL\s+MEDIANOCHE\b|\bMIDNIGHT\b/, 'AZUL MEDIANOCHE', ['BLUE']],
        [/\bAZUL\s+CIELO\b|\bSKY\b/, 'AZUL CIELO', ['BLUE']],
        [/\bAZUL\b|\bBLUE\b/, 'AZUL', ['BLUE']],
        [/\bTEAL\b|\bAQUA\b|\bTURQUESA\b/, 'AQUA / TEAL', ['BLUE', 'GREEN']],
        [/\bVERDE\s+OLIV[OA]\b|\bOLIV[OA]\b|\bOLIVE\b/, 'VERDE OLIVO', ['GREEN']],
        [/\bVERDE\s+PINO\b/, 'VERDE PINO', ['GREEN']],
        [/\bVERDE\s+MANZANA\b|\bAPPLE\b/, 'VERDE MANZANA', ['GREEN']],
        [/\bVERDE\b|\bGREEN\b/, 'VERDE', ['GREEN']],
        [/\bCORAL\b/, 'CORAL', ['CORAL']],
        [/\bTERRACOTA\b|\bBRICK\b/, 'TERRACOTA', ['BROWN', 'CORAL']],
        [/\bCALABAZA\b|\bNARANJA\b|\bORANGE\b/, 'NARANJA', ['CORAL']],
        [/\bTOPO\b|\bTAUPE\b/, 'TAUPE / TOPO', ['TAUPE']],
        [/\bMOSTAZA\b|\bMUSTARD\b|\bCURRY\b/, 'MOSTAZA', ['YELLOW']],
        [/\bAMARILL[OA]\b|\bYELLOW\b/, 'AMARILLO', ['YELLOW']],
        [/\bMORAD[OA]\b|\bPURPLE\b|\bVIOLETA\b/, 'MORADO', ['PURPLE']],
        [/\bROJ[OA]\b|\bRED\b/, 'ROJO', ['CORAL']],
        [/\bROSA\b|\bPINK\b/, 'ROSA', ['CORAL']],
        [/\bGRIS\b|\bGREY\b|\bGRAY\b/, 'GRIS', ['GREY']],
        [/\bNEGR[OA]\b|\bBLACK\b/, 'NEGRO', ['BLACK']],
        [/\bBLANC[OA]\b|\bWHITE\b/, 'BLANCO', ['WHITE']],
        [/\bCREMA\b|\bCREAM\b/, 'CREMA', ['WHITE', 'BEIGE']],
        [/\bBEIGE\b/, 'BEIGE', ['BEIGE']],
        [/\bARENA\b|\bSAND\b/, 'ARENA', ['BEIGE']],
        [/\bCAFE\b|\bCOFFE\b|\bCOFFEE\b|\bBROWN\b|\bCHOCOLATE\b/, 'CAFÉ', ['BROWN']],
        [/\bHUESO\b|\bBONE\b/, 'HUESO', ['WHITE', 'BEIGE']],
        [/\bMARFIL\b|\bIVORY\b/, 'MARFIL', ['WHITE', 'BEIGE']],
        [/\bCRUD[OA]\b|\bECRU\b/, 'CRUDO', ['WHITE', 'BEIGE']]
    ];

    function getColorFamilies(rawText) {
        const s = canonicalizeFabricAliases(rawText);
        const fams = new Set();
        if (!s) return fams;
        for (let i = 0; i < COLOR_FAMILY_RULES.length; i++) {
            if (COLOR_FAMILY_RULES[i][0].test(s)) {
                fams.add(COLOR_FAMILY_RULES[i][1]);
            }
        }
        return fams;
    }

    function colorFamiliesOverlap(textA, textB) {
        const a = getColorFamilies(textA);
        const b = getColorFamilies(textB);
        if (a.size === 0 || b.size === 0) return true;
        let hit = false;
        a.forEach(f => { if (b.has(f)) hit = true; });
        return hit;
    }

    function isWoodOrLacquerColorText(rawCt, itOpt) {
        const c = plainModelToken(rawCt);
        if (!c) return false;
        if (/^(?:LACA\s+(?:BELLOTA|TACUBA|BLANCA|NEGRA)|BELLOTA|TACUBA|ROSA\s+MORADA(?:\s+\w+)?|PAROTA(?:\s+\w+)?|ENCINO(?:\s+\w+)?|NOGAL(?:\s+\w+)?|TECA(?:\s+\w+)?|PINO(?:\s+\w+)?|CARDEADO(?:\s+\w+)?|NATURAL\s+BARNIZ\s+MATTE)$/.test(c)) {
            return true;
        }
        if (itOpt && c === 'HABANO' && plainModelToken(itOpt.cm) === 'HABANO') {
            const tlFams = getColorFamilies(itOpt.tl);
            if (tlFams.size > 0 && !tlFams.has('BROWN')) return true;
        }
        return false;
    }

    function isPollutedNonFabricText(rawTl) {
        const t = plainModelToken(rawTl);
        if (!t) return false;
        if (/(?:^|\b)(?:3P\s+)?CARDEADO\s+BLANQUEADO\b/.test(t)) return true;
        if (/\bSOTTANA\s+STONE\b/.test(t)) return true;
        if (/\bCON\s+BEJUCO\b|\bSOLIDA\s+PANEL\b|\bACEITE\s+WHITE\b|\bTRAPO\s+ANTIQUE\b/.test(t)) return true;
        if (/^\d+\s+ROSA\s+MORADA$|^ROSA\s+MORADA\b/.test(t)) return true;
        if (/\bPROTECTOR\s+(?:QUEEN|KING|MATRIMONIAL|INDIVIDUAL|SAFETY)\b/.test(t)) return true;
        if (/^(?:CON\s+COSTADOS(?:\s+SIN\s+ESTOPEROLES)?|SET\s+\d+PZS?\s+PARA|TELA\s+DE|TELA\s+[A-Z]|ACABADO\s+MATT?E|COPA\s+(?:ALTA|BAJA)|\/\s*BOLSENA\b.*)$/.test(t)) return true;
        if (/^OCASIONAL\b.*\bROSA\s+MORADA\b/.test(t)) return true;
        return false;
    }

    function isNonTextileProduct(it) {
        if (!it) return false;
        const tp = plainModelToken(stripDimensionsFromProductText(it.tp));
        const nPlain = plainModelToken(stripDimensionsFromProductText(it.n));
        const isHardGoodType = /^(?:ACCESORIOS?(?:\s+DECORATIVOS?)?|ACCECORIO|ESCULTURA|FLORERO|JARRON|BOTELLA|BOTELLON|CHAROLA|BANDEJA|FRUTERO|ENSALADERA|PLATO(?:\s+\w+)*|PLATON|SET\s+PLATO|BOWL|TAZON|MACETA|PLANTA(?:\s+\w+)*|FOLLAJE|CANDELABRO|PORTAVELAS?|PORTARRETRATO|VELAS?|LIBRO(?:\s+\w+)*|LINTERNA|FAROL|CORAL|CONCHA|LAMPARA(?:\s+\w+)*|CANDIL|ARBOTANTE|LUMINARIA|PLAFON|ESPEJO|CUADRO|ARTE\s+OBJETO|DECORATIVO\s+(?:DE\s+)?PARED|MESA(?:\s+\w+)*|CREDENZA|BUFETERA|BUFETERO|CONSOLA|RECIBIDOR|CAVA|BAR|MUEBLE\s+(?:DE|PARA)\s+TV|CENTRO\s+DE\s+(?:TV|ENTRETENIMIENTO|ENCETRENIMIENTO)|PTV|ESCRITORIO|LIBRERO|ESTANTERIA|VITRINA|ARCHIVERO|BURO|COMODA|CAJONERA|TOCADOR|PISOS?\s+MODULARES?|CRISTAL|LAMINA\s+DE\s+PVC|LAMBRIN(?:\s+\w+)*|PAPEL\s+TAPIZ|PEDESTAL|RELOJ(?:\s+\w+)*|ADORNOS?|PERCHERO|BIOMBO|MAMPARA|BAUL|CUBIERTA(?:\s+\w+)*)$/.test(tp);
        if (!isHardGoodType) return false;
        // Eximir muebles/textiles reales mal etiquetados como accesorio en ERP
        const hasTextileProductNoun = /\b(?:SILLON(?:ES)?|SILLAS?|SOFAS?|SOFACAMAS?|SOFA\s+CAMA|LOVE\s*SEAT|LOVE\s+CON\s+BRAZO|CHAISE|POUF|PUFF|OTTOMAN|OTOMAN|COJIN(?:ES)?|FUNDAS?|TAPETES?|SABANAS?|DUVET|COLCHAS?|EDREDON|CUBRECAMA|CORTINAS?|PERSIANAS?|MANTEL(?:ES)?|CAMINO\s+DE\s+MESA|TORTILLERO|INDIVIDUALES|SERVILLETAS?|TOALLAS?|BRAZO\s+(?:BALI|DER|IZQ)|TELA\b)\b/.test(nPlain);
        return !hasTextileProductNoun;
    }

    function wordBoundaryMatch(haystack, needle) {
        if (!haystack || !needle) return false;
        return (' ' + haystack + ' ').indexOf(' ' + needle + ' ') !== -1;
    }

    function isReversedTwoWordMatch(a, b) {
        if (!a || !b) return false;
        const pa = a.split(' ').filter(Boolean);
        const pb = b.split(' ').filter(Boolean);
        return pa.length === 2 && pb.length === 2 && pa[0] === pb[1] && pa[1] === pb[0];
    }

    function findLongestKnownFabricInText(canonText, preferCuratedOnly) {
        if (!canonText || liveFabricsListSorted.length === 0) return null;
        const padded = ' ' + canonText + ' ';
        let bestCurated = null;
        let bestAny = null;
        for (let i = 0; i < liveFabricsListSorted.length; i++) {
            const fk = liveFabricsListSorted[i];
            if (fk.indexOf(' ') === -1 || LIVE_BAD_FABRICS.has(fk)) continue;
            if (padded.indexOf(' ' + fk + ' ') !== -1) {
                const info = liveKnownFabrics.get(fk);
                if (!info) continue;
                const entry = { key: fk, tl: info.tl, ct: info.ct || '', curated: !!info.curated };
                if (entry.curated && !bestCurated) bestCurated = entry;
                if (!bestAny) bestAny = entry;
                if (bestCurated) break;
            }
        }
        if (bestCurated) return bestCurated;
        if (preferCuratedOnly) return null;
        if (bestAny) return bestAny;
        // Comprobar forma invertida de 2 palabras para telas curadas (ej. "GREY ELITE" <-> "ELITE GREY")
        const words = canonText.split(' ').filter(Boolean);
        for (let w = 0; w < words.length - 1; w++) {
            const rev = words[w + 1] + ' ' + words[w];
            if (liveCuratedFabrics.has(rev)) {
                const info = liveKnownFabrics.get(rev);
                if (info) return { key: rev, tl: info.tl, ct: info.ct || '', curated: true, inverted: true };
            }
        }
        return null;
    }

    function buildColorSearchScope(nCanon, tlOpt) {
        if (!nCanon) return '';
        let s = nCanon;
        // Preferir cláusula explícita después de "TELA (DE COJINES)?" cuando contiene color (ej. GC555006, ADSGC8720043, GC555007C)
        const mAfterTela = s.match(/\bTELA\s+(?:DE\s+COJINES\s+)?(.+)$/);
        if (mAfterTela && mAfterTela[1]) {
            const tail = mAfterTela[1].trim();
            for (let i = 0; i < EXPLICIT_COLOR_CUE_TABLE.length; i++) {
                if (EXPLICIT_COLOR_CUE_TABLE[i][0].test(tail)) {
                    s = tail;
                    break;
                }
            }
        }
        // Quitar contextos de color que NO corresponden a la tela (mecanismos, patas, tubos, maderas, mesa de café)
        s = s
            .replace(/\bMEC\s+SKY\b/g, ' ')
            .replace(/\bMESA\s+(?:DE\s+)?CAFE\b/g, ' ')
            .replace(/\bPALO\s+DE\s+ROSA\b/g, ' ')
            .replace(/\bROSA\s+MORADA(?:\s+(?:CAFE|CLAR[OA]|SOLID[OA]|TONO\s+NATURAL))?\b/g, ' ')
            .replace(/\bLACA\s+(?:BELLOTA|TACUBA|BLANC[OA]|NEGR[OA])\b/g, ' ')
            .replace(/\bPATA(?:S)?\s+(?:DE\s+)?(?:NEGR[OA]S?|BLANC[OA]S?|GREY(?:-GOLD)?|GRIS(?:-GOLD)?|NOGAL|TECA|TEKA|ORO|DORAD[OA]S?|MADERA|METAL|PAROTA|NATURAL)\b/g, ' ')
            .replace(/\bBASE\s+(?:COLOR\s+|ACABADO\s+)?(?:POLVO\s+ALUMBRE\s+|ALUMINIO\s+)?(?:BLANC[OA]|NEGR[OA]|PAROTA|NATURAL|DORAD[OA]|ORO)\b/g, ' ')
            .replace(/\bTUBO\s+(?:DE\s+ALUMINIO\s+|ACABADO\s+POLVO\s+ALUMBRE\s+)?(?:BLANC[OA]|NEGR[OA]|GRIS)\b/g, ' ')
            .replace(/\bMARCO\s+(?:NEGR[OA]|BLANC[OA]|DORAD[OA]|ORO|PLATA|MADERA)\b/g, ' ')
            .replace(/\bACABADO\s+(?:TEKA|TECA|POLVO\s+ALUMBRE\s+BLANC[OA]|NATURAL|MATT?E|NEGR[OA]|BLANC[OA])\b/g, ' ');
        if (!/^CUERDA\b/i.test(plainModelToken(tlOpt || ''))) {
            s = s.replace(/\bCUERDA\s+(?:VERDE|GRIS|NEGR[OA]|BLANC[OA]|CAFE|BEIGE|NATURAL)\b/g, ' ');
        }
        return s.replace(/\s+/g, ' ').trim();
    }

    function extractExplicitColorCues(text) {
        if (!text) return [];
        const found = [];
        const usedRanges = [];
        for (let i = 0; i < EXPLICIT_COLOR_CUE_TABLE.length; i++) {
            const re = EXPLICIT_COLOR_CUE_TABLE[i][0];
            const label = EXPLICIT_COLOR_CUE_TABLE[i][1];
            const fams = EXPLICIT_COLOR_CUE_TABLE[i][2];
            const m = re.exec(text);
            if (!m) continue;
            const start = m.index;
            const end = start + m[0].length;
            const overlaps = usedRanges.some(r => start < r[1] && end > r[0]);
            if (overlaps) continue;
            usedRanges.push([start, end]);
            found.push({ index: start, label: label, families: fams, raw: m[0] });
        }
        found.sort((a, b) => a.index - b.index);
        return found;
    }

    function validateAndNormalizeFabricColorAgainstName(item, opts) {
        const mutate = !!(opts && opts.mutate === true);
        const out = mutate ? item : Object.assign({}, item);
        const sku = String((out && out.s) || '').trim().toUpperCase();
        const before = {
            tl: cleanStr(out && out.tl),
            ct: cleanStr(out && out.ct),
            cm: cleanStr(out && out.cm)
        };
        const issues = [];
        const addIssue = code => { if (issues.indexOf(code) === -1) issues.push(code); };

        if (!out) {
            return { item: out, report: { sku: '', changed: false, issues: [], before: before, after: before } };
        }

        let tl = before.tl;
        let ct = before.ct;
        let cm = before.cm;

        const nPlain = plainModelToken(stripDimensionsFromProductText(out.n || ''));
        const nCanon = canonicalizeFabricAliases(nPlain);
        const nonTextile = isNonTextileProduct(out);

        // Rescate previo a Etapa 1: tela curada envuelta en ruido de tipo/madera (ej. "OCASIONAL SAND 07 ROSA MORADA TONO NATURAL")
        if (tl && /^OCASIONAL\b.*\bROSA\s+MORADA\b/i.test(plainModelToken(tl))) {
            const rescued = findLongestKnownFabricInText(canonicalizeFabricAliases(tl), true);
            if (rescued) {
                tl = rescued.tl;
                addIssue('NON_TEXTILE_FABRIC_POLLUTION');
            }
        }

        // ETAPA 1A: Patrones incondicionales de contaminación no textil en `tl`
        if (tl) {
            const tlPlain = plainModelToken(tl);
            if (/(?:^|\b)(?:3P\s+)?CARDEADO\s+BLANQUEADO\b/.test(tlPlain)) {
                tl = '';
                if (!cm || plainModelToken(cm) === 'CARDEADO') cm = 'CARDEADO BLANQUEADO';
                addIssue('NON_TEXTILE_FABRIC_POLLUTION');
            } else if (/\bSOTTANA\s+STONE\b/.test(tlPlain)) {
                tl = '';
                ct = '';
                addIssue('NON_TEXTILE_FABRIC_POLLUTION');
            } else if (isPollutedNonFabricText(tlPlain)) {
                const clearCtToo = nonTextile || /^(?:ACABADO\s+MATT?E|COPA\s+(?:ALTA|BAJA))$/.test(tlPlain);
                tl = '';
                if (clearCtToo) ct = '';
                addIssue('NON_TEXTILE_FABRIC_POLLUTION');
            }
        }

        // ETAPA 1B: Productos estrictamente no textiles (mesas, accesorios, lámparas, conectores, relojes, credenzas)
        if (nonTextile && tl) {
            const tlCanonCheck = canonicalizeFabricAliases(tl);
            const mLegitMat = tlCanonCheck.match(/\b(PIEL|VINIL|YUTE|LINO|CUERDA|NOSTALGIA\s+BONE\s+BROWN)\b/);
            const legitInName = !!(mLegitMat && wordBoundaryMatch(nCanon, mLegitMat[1]));
            if (!legitInName) {
                tl = '';
                ct = '';
                addIssue('NON_TEXTILE_FABRIC_POLLUTION');
            }
        }

        // ETAPA 1C: Madera / laca filtrada dentro de `ct` (COLOR DE TELA) + limpiar `cm` corrupto (ej. nombre completo o medidas pegadas en COLOR DE MADERA)
        const isSalaNoWoodName = /\b(SALA|SALAS|SOFA|SOFAS|SOFACAMA|SOFA\s+CAMA|MODULAR|SECCIONAL|ESCUADRA|LOVESEAT|LOVE\s+SEAT|CHAISE|ESQUINERO|FUTON|FUTTON)\b/i.test(plainModelToken((out.tp || '') + ' ' + (out.n || ''))) &&
            !/\b(ROSA\s+MORADA|PALO\s+DE\s+ROSA|PAROTA|TZALAM|NOGAL|TECA|TEKA|TEAK|ENCINO|ROBLE|FRESNO|CEDRO|CAOBA|OLMO|HAYA|TABACO|TACUBA|BELLOTA|HABANO|ESPIGA|GINGER|CAMEL|NOCHE|NUEZ|MADERA)\b/i.test(nPlain);
        if (cm) {
            const cmPlain = plainModelToken(cm);
            if ((/\d+\s*CM\b/i.test(cm) && cm.length > 18) || (nPlain.length >= 10 && cmPlain.indexOf(nPlain) !== -1)) {
                cm = '';
                addIssue('CORRUPTED_WOOD_COLOR_CLEARED');
            }
        }
        if (ct && isWoodOrLacquerColorText(ct, { tl: tl, cm: cm })) {
            if (!cm && !isSalaNoWoodName) cm = ct;
            ct = '';
            addIssue('WOOD_IN_COLOR_POLLUTION');
        }

        // ETAPA 1D: Falso parseo "MESA DE CAFE" y `tl` de un solo color en contradicción directa con `n`
        if (tl && plainModelToken(tl) === 'CAFE' && /\bMESA\s+(?:DE\s+)?CAFE\b/.test(nPlain)) {
            tl = '';
            if (plainModelToken(ct) === 'PERLA / CRUDO') ct = '';
            addIssue('NON_TEXTILE_FABRIC_POLLUTION');
        }
        if (tl && !nonTextile) {
            const tlSingle = canonicalizeFabricAliases(tl);
            if (tlSingle.indexOf(' ') === -1 && FABRIC_SINGLE_COLOR_WORDS.has(tlSingle)) {
                const ctSingle = canonicalizeFabricAliases(ct);
                const tlInName = wordBoundaryMatch(nCanon, tlSingle);
                const nameCues = extractExplicitColorCues(buildColorSearchScope(nCanon));
                if (!tlInName && ctSingle && nameCues.length > 0) {
                    const ctMatchesName = nameCues.some(c => colorFamiliesOverlap(ctSingle, c.label));
                    const tlMatchesName = nameCues.some(c => colorFamiliesOverlap(tlSingle, c.label));
                    if (ctMatchesName && !tlMatchesName) {
                        tl = '';
                        addIssue('FABRIC_MISMATCH_WITH_NAME');
                    }
                } else if (tlInName && ctSingle && ctSingle.indexOf(' ') === -1 && FABRIC_SINGLE_COLOR_WORDS.has(ctSingle) &&
                    wordBoundaryMatch(nCanon, ctSingle) && !colorFamiliesOverlap(tlSingle, ctSingle)) {
                    // Ej. POUF CREMA NEGRO FLECOS (tl="NEGRO", ct="CREMA") -> tl="", ct="CREMA / NEGRO"
                    const posTl = (' ' + nCanon + ' ').indexOf(' ' + tlSingle + ' ');
                    const posCt = (' ' + nCanon + ' ').indexOf(' ' + ctSingle + ' ');
                    const firstLbl = posCt <= posTl ? ctSingle : tlSingle;
                    const secondLbl = posCt <= posTl ? tlSingle : ctSingle;
                    tl = '';
                    ct = firstLbl + ' / ' + secondLbl;
                    addIssue('COLOR_CONTRADICTION_FIXED');
                }
            }
        }

        // ETAPA 2: Prefijos de grado (G2/G3/G4/GG), "TELA ", sufijo proveedor y aliases canónicos en `tl`
        if (tl) {
            const cleanSegment = seg => {
                const rawSeg = cleanStr(seg);
                if (!rawSeg) return '';
                const plainSeg = plainModelToken(rawSeg);
                const afterGrade = plainSeg
                    .replace(/^(?:(?:G[1-9]|GG)\s+)+/i, '')
                    .replace(/^TELA(?:\s+DE)?\s+(?!(?:ARTELL|MANTEL|REPELENTE|ECOLOGICA)$)/i, '')
                    .replace(/^([A-Z0-9][A-Z0-9\s]{1,40}?)\s+-\s+[A-Z0-9]{3,}$/, '$1')
                    .trim();
                if (afterGrade !== plainSeg) addIssue('GRADE_PREFIX_STRIPPED');
                const afterVendor = stripFabricGradeAndVendorNoise(afterGrade);
                if (afterVendor !== afterGrade) addIssue('VENDOR_SUFFIX_STRIPPED');
                const afterAlias = canonicalizeFabricAliases(afterVendor);
                if (afterAlias !== afterVendor) addIssue('FABRIC_ALIAS_CANONICALIZED');
                // Preservar acentos legítimos en frases genéricas (ej. "ALGODÓN SATÍN") si nada cambió
                return (afterAlias === plainSeg) ? rawSeg : afterAlias;
            };
            if (tl.indexOf('/') !== -1) {
                const segs = tl.split(/\s*\/\s*/);
                const cleanedPrimary = cleanSegment(segs[0]);
                const cleanedRest = segs.slice(1).map(sPart => {
                    const pNorm = plainModelToken(sPart);
                    const pAlias = canonicalizeFabricAliases(pNorm);
                    if (pAlias !== pNorm) addIssue('FABRIC_ALIAS_CANONICALIZED');
                    return pAlias === pNorm ? cleanStr(sPart) : pAlias;
                }).filter(Boolean);
                tl = cleanedRest.length > 0 ? (cleanedPrimary + ' / ' + cleanedRest.join(' / ')) : cleanedPrimary;
            } else {
                tl = cleanSegment(tl);
            }
        }

        // ETAPA 3: Preservar tela principal del cuerpo antes de COORD / VIVO (ej. KIRBY FLAX / COORD MOHAIR COFFE, OSI IVORY / VIVO ALANIS BEIGE)
        const mCoordOrVivo = nCanon.match(/\b(COORD\.?|VIVO)\b/);
        const hasCoordInName = !!mCoordOrVivo;
        const coordTag = (mCoordOrVivo && /^VIVO$/i.test(mCoordOrVivo[1])) ? 'VIVO' : 'COORD';
        let beforeCoord = nCanon;
        let afterCoord = '';
        if (hasCoordInName) {
            const splitIdx = mCoordOrVivo.index;
            beforeCoord = nCanon.slice(0, splitIdx).trim();
            afterCoord = nCanon.slice(splitIdx + mCoordOrVivo[0].length).trim();
        }
        if (hasCoordInName && !nonTextile && beforeCoord) {
            const primaryFab = findLongestKnownFabricInText(beforeCoord, false);
            const tlPrimaryNow = canonicalizeFabricAliases((tl || '').split(/\s*\/\s*/)[0]);
            if (primaryFab && tlPrimaryNow.indexOf(primaryFab.key) === -1 &&
                (!tlPrimaryNow || wordBoundaryMatch(afterCoord, tlPrimaryNow))) {
                tl = primaryFab.tl + (tlPrimaryNow ? (' / ' + coordTag + ' ' + tlPrimaryNow) : '');
                if (primaryFab.ct && (!ct || !colorFamiliesOverlap(ct, primaryFab.ct + ' ' + primaryFab.key))) {
                    ct = primaryFab.ct;
                }
                addIssue('COORD_PRIMARY_RESTORED');
            }
        }

        // ETAPA 4: Contradicción directa `tl` vs `n` y refinamiento de `tl` truncada/genérica
        const nameScope = hasCoordInName ? beforeCoord : nCanon;
        const nameFab = !nonTextile ? findLongestKnownFabricInText(nameScope, false) : null;
        if (nameFab && tl && !nonTextile) {
            const hasSlash = tl.indexOf('/') !== -1;
            const tlPrimaryRaw = hasSlash ? tl.split(/\s*\/\s*/)[0].trim() : tl;
            const coordSuffix = hasSlash ? (' / ' + tl.split(/\s*\/\s*/).slice(1).join(' / ').trim()) : '';
            const tlPrimary = canonicalizeFabricAliases(tlPrimaryRaw);
            const isExactOrInverted = tlPrimary === nameFab.key || isReversedTwoWordMatch(tlPrimary, nameFab.key);
            const isTruncatedOrGeneric = LIVE_BAD_FABRICS.has(tlPrimary) || tlPrimary === 'LINEN' ||
                (nameFab.key.indexOf(tlPrimary) !== -1 && nameFab.key.length > tlPrimary.length);
            const isSuperset = tlPrimary.indexOf(nameFab.key) !== -1;

            if (!isExactOrInverted && !isSuperset) {
                if (isTruncatedOrGeneric) {
                    tl = nameFab.tl + coordSuffix;
                    addIssue('FABRIC_BACKFILLED_FROM_NAME');
                    if (nameFab.ct) {
                        if (!ct) {
                            ct = nameFab.ct;
                            addIssue('COLOR_BACKFILLED_FROM_NAME');
                        } else if (!colorFamiliesOverlap(ct, nameFab.ct + ' ' + nameFab.key)) {
                            ct = nameFab.ct;
                            addIssue('COLOR_CONTRADICTION_FIXED');
                        }
                    }
                } else {
                    const oldTlPrimary = tlPrimaryRaw;
                    tl = nameFab.tl + coordSuffix;
                    if (nameFab.ct && (!ct || !colorFamiliesOverlap(ct, nameFab.ct + ' ' + nameFab.key))) {
                        ct = nameFab.ct;
                    }
                    if (cleanStr(out.vr) && oldTlPrimary) {
                        const escOld = oldTlPrimary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        const vrRe = new RegExp('\\b' + escOld + '\\b', 'i');
                        if (vrRe.test(out.vr)) {
                            out.vr = out.vr.replace(vrRe, nameFab.tl);
                        }
                    }
                    addIssue('FABRIC_MISMATCH_WITH_NAME');
                }
            }
        }

        // ETAPA 5: Completar `tl` / `ct` faltantes desde pistas explícitas en `n` o catálogo curado
        if (!nonTextile) {
            if (!tl && nameFab) {
                tl = nameFab.tl;
                addIssue('FABRIC_BACKFILLED_FROM_NAME');
                if (nameFab.ct) {
                    if (!ct) {
                        ct = nameFab.ct;
                        addIssue('COLOR_BACKFILLED_FROM_NAME');
                    } else if (!colorFamiliesOverlap(ct, nameFab.ct + ' ' + nameFab.key)) {
                        ct = nameFab.ct;
                        addIssue('COLOR_CONTRADICTION_FIXED');
                    }
                }
            } else if (!tl) {
                const mTelaCue = nCanon.match(/\bTELA\s+(?:DE\s+COJINES\s+)?([A-Z]{4,}(?:\s+(?:CLARO|OSCURO|ICE|NATURAL))?)\b/);
                if (mTelaCue && mTelaCue[1]) {
                    const cueTok = mTelaCue[1].trim();
                    const isColorPhraseOnly = /^(?:GRIS|BEIGE|BLANC[OA]|NEGR[OA]|AZUL|VERDE|CAFE|ARENA|CREMA|ROSA|ROJ[OA])(?:\s+(?:CLARO|OSCURO))?$/.test(cueTok);
                    if (isColorPhraseOnly) {
                        const cues = extractExplicitColorCues(cueTok);
                        if (cues.length > 0 && (!ct || !colorFamiliesOverlap(ct, cues[0].label))) {
                            const hadCt = !!ct;
                            ct = cues[0].label;
                            addIssue(hadCt ? 'COLOR_CONTRADICTION_FIXED' : 'COLOR_BACKFILLED_FROM_NAME');
                        }
                    } else if (!LIVE_BAD_FABRICS.has(cueTok) && !/^(?:COJINES|DECORATIV[OA]|TAPICERIA|PARA)$/.test(cueTok)) {
                        tl = cueTok;
                        addIssue('FABRIC_BACKFILLED_FROM_NAME');
                        if (!ct) {
                            if (cueTok === 'OATMEAL') {
                                ct = 'AVENA / OATMEAL';
                                addIssue('COLOR_BACKFILLED_FROM_NAME');
                            } else {
                                const cues = extractExplicitColorCues(cueTok);
                                if (cues.length > 0) {
                                    ct = cues[0].label;
                                    addIssue('COLOR_BACKFILLED_FROM_NAME');
                                }
                            }
                        }
                    }
                }
            }
            if (tl && !ct) {
                const tlPrimaryKey = canonicalizeFabricAliases(tl.split(/\s*\/\s*/)[0]);
                let fInfo = liveKnownFabrics.get(tlPrimaryKey);
                if (!fInfo) {
                    const pWords = tlPrimaryKey.split(' ').filter(Boolean);
                    if (pWords.length === 2) fInfo = liveKnownFabrics.get(pWords[1] + ' ' + pWords[0]);
                }
                if (fInfo && fInfo.ct) {
                    ct = fInfo.ct;
                    addIssue('COLOR_BACKFILLED_FROM_NAME');
                }
            }
        }

        // ETAPA 6: Reconciliación estricta de contradicción de color `ct` vs `n` (segura para traducciones al español)
        if (!nonTextile) {
            const colorScope = buildColorSearchScope(nCanon, tl);
            // Caso multi-color explícito (ej. "FUNDA AMARILLO LINEA BLANCA" con ct="BLANCO")
            const mStripe = colorScope.match(/\b(AMARILL[OA]|AZUL|ROJ[OA]|VERDE|CORAL|NEGR[OA]|GRIS|ROSA|MORAD[OA]|NARANJA|TERRACOTA|TURQUESA)\s+(?:LINEA|RAYA|BORDE|FILO)\s+(BLANC[OA]|NEGR[OA]|DORAD[OA]|ORO|GRIS|BEIGE|CREMA)\b/);
            if (mStripe) {
                const c1 = extractExplicitColorCues(mStripe[1])[0];
                const c2 = extractExplicitColorCues(mStripe[2])[0];
                if (c1 && c2 && ct && !colorFamiliesOverlap(ct, c1.label)) {
                    ct = c1.label + ' / ' + c2.label;
                    addIssue('COLOR_CONTRADICTION_FIXED');
                }
            }

            const cuesInScope = extractExplicitColorCues(colorScope);
            if (cuesInScope.length > 0) {
                if (!ct && issues.indexOf('NON_TEXTILE_FABRIC_POLLUTION') !== -1) {
                    // Ej. VASESETSI1450 tras limpiar "CAFE" de "MESA DE CAFE" -> tomar "COLOR GREY" -> "GRIS"
                    ct = cuesInScope[0].label;
                    addIssue('COLOR_CONTRADICTION_FIXED');
                } else if (ct) {
                    const tlPrimaryKey = canonicalizeFabricAliases((tl || '').split(/\s*\/\s*/)[0]);
                    const tlInfo = tlPrimaryKey ? liveKnownFabrics.get(tlPrimaryKey) : null;
                    const confirmedByCuratedFabric = !!(
                        tlInfo && tlInfo.ct &&
                        (wordBoundaryMatch(nCanon, tlPrimaryKey) || (nameFab && nameFab.key === tlPrimaryKey)) &&
                        colorFamiliesOverlap(ct, tlInfo.ct)
                    );
                    if (!confirmedByCuratedFabric) {
                        const ctFams = getColorFamilies(ct);
                        if (ctFams.size > 0) {
                            const scopeFams = new Set();
                            for (let cIdx = 0; cIdx < cuesInScope.length; cIdx++) {
                                cuesInScope[cIdx].families.forEach(f => scopeFams.add(f));
                            }
                            let anyOverlap = false;
                            ctFams.forEach(f => { if (scopeFams.has(f)) anyOverlap = true; });
                            if (!anyOverlap) {
                                ct = cuesInScope[0].label;
                                addIssue('COLOR_CONTRADICTION_FIXED');
                            }
                        }
                    }
                }
            }
        }

        // ETAPA 7: Firma de idempotencia y retorno (NUNCA mutar it.n, it.tp, it.mo ni títulos exteriores)
        out.tl = tl;
        out.ct = ct;
        out.cm = cm;
        const after = { tl: tl, ct: ct, cm: cm };
        const changed = (before.tl !== after.tl) || (before.ct !== after.ct) || (before.cm !== after.cm) || issues.length > 0;
        out._fabValSig = [out.n || '', out.tp || '', out.tl || '', out.ct || '', out.cm || ''].join('\x1f');
        return {
            item: out,
            report: { sku: sku, changed: changed, issues: issues, before: before, after: after }
        };
    }

    function runInventoryFabricColorAudit(items) {
        const list = Array.isArray(items) ? items : allItems;
        const countsByCode = {};
        const anomalies = [];
        let itemsWithFabric = 0;
        let itemsWithColor = 0;
        for (let i = 0; i < list.length; i++) {
            const it = list[i];
            if (!it) continue;
            if (cleanStr(it.tl)) itemsWithFabric++;
            if (cleanStr(it.ct)) itemsWithColor++;
            const res = validateAndNormalizeFabricColorAgainstName(it, { mutate: false });
            if (res && res.report && res.report.changed) {
                anomalies.push(res.report);
                for (let j = 0; j < res.report.issues.length; j++) {
                    const code = res.report.issues[j];
                    countsByCode[code] = (countsByCode[code] || 0) + 1;
                }
            }
        }
        return {
            totalItems: list.length,
            itemsWithFabric: itemsWithFabric,
            itemsWithColor: itemsWithColor,
            affectedCount: anomalies.length,
            countsByCode: countsByCode,
            anomalies: anomalies
        };
    }

    function seedBaseLiveVocab() {
        Object.keys(LIVE_EXTRA_FABRICS).forEach(k => {
            const kn = canonicalizeFabricAliases(k);
            if (!kn) return;
            liveCuratedFabrics.add(kn);
            liveKnownFabrics.set(kn, { tl: kn, ct: LIVE_EXTRA_FABRICS[k], curated: true });
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
            const rawTl = cleanStr(it.tl);
            const rawCt = cleanStr(it.ct);
            if (rawTl && rawTl.length >= 4 && rawTl.indexOf('/') === -1 && !/\bCOORD\.?\b/i.test(rawTl) &&
                !isNonTextileProduct(it) && !isPollutedNonFabricText(rawTl)) {
                const tln = canonicalizeFabricAliases(stripFabricGradeAndVendorNoise(rawTl));
                if (tln && tln.length >= 4 && !LIVE_BAD_FABRICS.has(tln) && tln.indexOf(' ') !== -1 &&
                    !isPollutedNonFabricText(tln)) {
                    const nCanon = canonicalizeFabricAliases(stripDimensionsFromProductText(it.n || ''));
                    const tlConfirmedInName = wordBoundaryMatch(nCanon, tln);
                    const safeCt = (rawCt && !isWoodOrLacquerColorText(rawCt, it) && tlConfirmedInName) ? rawCt.toUpperCase() : '';
                    const prev = liveKnownFabrics.get(tln);
                    if (!prev) {
                        if (tlConfirmedInName) {
                            liveKnownFabrics.set(tln, { tl: tln, ct: safeCt, curated: false });
                        }
                    } else if (!prev.curated && safeCt && !prev.ct) {
                        liveKnownFabrics.set(tln, { tl: prev.tl, ct: safeCt, curated: false });
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
        const isLiveSheetRow = !!it._fromLiveInvSheet;
        const erpRef = (!isLiveSheetRow && skuUpper) ? liveErpCatalogBySku.get(skuUpper) : null;

        let nom = cleanStr(it.n);
        let mo = cleanStr(it.mo) || (erpRef && erpRef.mo) || '';
        let tp = cleanStr(it.tp);
        let vr = cleanStr(it.vr);
        let med = cleanStr(it.m);
        let cat = cleanStr(it.c);

        // Si el registro proviene directamente de CONTROL DE PRODUCTOS PRESENTACIÓN (INVENTARIO_EN_VIVO),
        // respetar fielmente el NOMBRE y los datos exactos de su propia fila sin recortar, adivinar ni mezclar.
        if (isLiveSheetRow) {
            if (!nom || nom.toUpperCase() === skuUpper) {
                const liveErpRef = skuUpper ? liveErpCatalogBySku.get(skuUpper) : null;
                if (liveErpRef && liveErpRef.n) nom = liveErpRef.n;
            }
            if (/^(?:MEDIDAS?\s*:|[\d\s.,xX*×]+(?:CM|MTS?|M)?\.?$)/i.test(nom)) {
                const badParsed = stripDimensionsAndExtractLive(nom);
                if (!med && badParsed.med) med = badParsed.med;
                const liveErpRef = skuUpper ? liveErpCatalogBySku.get(skuUpper) : null;
                const erpClean = liveErpRef && liveErpRef.n && !/^(?:MEDIDAS?\s*:|[\d\s.,xX*×]+(?:CM|MTS?|M)?\.?$)/i.test(liveErpRef.n)
                    ? liveErpRef.n
                    : '';
                nom = erpClean || mo || sku;
            }
            if (!tp) tp = deduceProductTypeLive(nom, cat, mo) || 'ACCESORIO DECORATIVO';
            if (!cat || /\d.*x.*\d/i.test(cat)) cat = deduceCategoryLive(tp, nom, cat);
            it.n = nom || sku;
            it.tp = tp;
            it.mo = mo;
            it.vr = vr;
            it.m = med;
            it.c = cat;
            it.tl = cleanStr(it.tl);
            it.ct = cleanStr(it.ct);
            it.md = cleanStr(it.md);
            it.cm = cleanStr(it.cm);
            it.mt = cleanStr(it.mt);
            it.p = cleanStr(it.p);
            it.f = cleanStr(it.f);
            if (!cleanStr(it.pr)) {
                const liveErpRef = skuUpper ? liveErpCatalogBySku.get(skuUpper) : null;
                if (liveErpRef && liveErpRef.pr) it.pr = liveErpRef.pr;
            }
            validateAndNormalizeFabricColorAgainstName(it, { mutate: true });
            return it;
        }

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

        // 2) Quitar medidas numéricas incrustadas en NOMBRE (solo si existían) y guardarlas en MEDIDAS si estaba vacío
        const parsedNom = stripDimensionsAndExtractLive(nom);
        if (parsedNom.med && parsedNom.text && /[A-Za-zÁÉÍÓÚáéíóúÑñ]{2,}/.test(parsedNom.text)) {
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
        const nomHeadLive = plainUpper(nom).split(/\b(?:INCLUYE|INCL|CON\s+\d|CON\s+MESAS?\b|CON\s+SILLAS?\b|C\/\s*FUNDAS)\b/)[0].trim();
        if (/^SALA\b/.test(nomHeadLive) && !/^SALA\s+(?:DE\s+)?COMEDOR\b/.test(nomHeadLive)) {
            tp = 'SALA';
        } else if (/^RECAMARA\b/.test(nomHeadLive)) {
            tp = 'RECÁMARA';
        } else if (
            /\b(SILLON(?:ES)?|BUTACAS?|MECEDORAS?|RECLINABLES?|BERGERE)\b/.test(nomHeadLive) &&
            !/\bSILLAS?\b/.test(nomHeadLive) &&
            !/^(?:SALA|SOFA\s+CAMA|FUTTON|FUTON)\b/.test(nomHeadLive)
        ) {
            if (!/\bSILLON\b/.test(plainUpper(tp))) {
                tp = /\bOCASIONAL\b/.test(nomHeadLive) ? 'SILLON OCASIONAL' : 'SILLON';
            }
        } else if (
            /\bSILLAS?\b/.test(nomHeadLive) &&
            !/\b(SILLON(?:ES)?|MESAS?|COLGANTES?|COLUMPIOS?)\b/.test(nomHeadLive)
        ) {
            if (!/^SILLA\b/.test(plainUpper(tp))) {
                tp = 'SILLA';
            }
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
        const isHardGoodAuto = isNonTextileProduct({ tp: tp, n: nom });
        const isSalaNoWoodAuto = SALA_SOFA_WOOD_GUARD_RE.test(plainUpper(cat + ' ' + tp + ' ' + nom)) && !VISIBLE_WOOD_IN_NAME_RE.test(searchBlob);
        const isTextileNoWoodAuto = NON_WOOD_TEXTILE_CAT_RE.test(plainUpper(cat)) || /\b(COJIN|COJINES|FUNDA|FUNDAS|ALMOHADON|SABANA|DUVET|MANTEL|HILO|TOALLA|TAPETE|ALFOMBRA|COLCHON|CORTINA)\b/i.test(plainUpper(tp + ' ' + nom));

        if (tp === 'TELA' && !tl && mo) tl = mo;
        if (!tl && !isHardGoodAuto && liveFabricsListSorted.length > 0) {
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

        if (!md && !isSalaNoWoodAuto && !isTextileNoWoodAuto) {
            for (let w = 0; w < LIVE_WOOD_PATTERNS.length; w++) {
                if (LIVE_WOOD_PATTERNS[w][1] === 'PINO' && !/\bMADERA\s+DE\s+PINO\b/.test(searchBlob)) continue;
                if (LIVE_WOOD_PATTERNS[w][0].test(searchBlob)) {
                    md = LIVE_WOOD_PATTERNS[w][1];
                    break;
                }
            }
        }
        if (!cm && !isSalaNoWoodAuto && !isTextileNoWoodAuto) {
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
            if (vrParsed.med && vrParsed.text && /[A-Za-z]{2,}/.test(vrParsed.text)) vr = vrParsed.text;
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
        validateAndNormalizeFabricColorAgainstName(it, { mutate: true });
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
        'benzio iii': 'benzio',
        'fossano': 'fossenzo'
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
        if (tok === 'NIDO' && (domName === 'SALAS_TAPIZ' || domName === 'COMEDORES' || domName === 'EXTERIOR')) return true;
        if (tok === 'YUTE' && domName === 'RECAMARAS_MUEBLE') return true;
        if (tok === 'MARINA' && /^(MESAS_SALA|COMEDORES|SALAS_TAPIZ|RECAMARAS_MUEBLE|EXTERIOR)$/.test(domName)) return true;
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

    // Conjuntos dinámicos calculados en indexItemsAndGroups() para modelos que combinan Sofá + Love Seat, sets de exterior o Sofá Cama + Chaise
    let sofaAndLoveseatModels = new Set();
    let exteriorSofaAndLoveseatModels = new Set();
    let exteriorSalaSetModels = new Set();
    let exteriorModularModels = new Set();
    let dynamicSofaCamaModels = new Set();
    let bedUnifiedModels = new Set();

    function resolveBedUnifiedTitlePrefix(items) {
        if (!Array.isArray(items) || items.length === 0) return 'CAMA';
        let hasCama = false;
        let hasBase = false;
        let hasCabecera = false;
        for (let i = 0; i < items.length; i++) {
            const x = items[i];
            if (!x) continue;
            const cat = x._cat || '';
            const tpTok = plainModelToken(stripDimensionsFromProductText(x.tp));
            if (cat === 'CAMAS' && tpTok !== 'LITERA' && tpTok !== 'CUNA') hasCama = true;
            else if (cat === 'BASES') hasBase = true;
            else if (cat === 'CABECERAS') hasCabecera = true;
        }
        if (hasCama && hasBase && hasCabecera) return 'CAMA, BASE Y CABECERA';
        if (hasBase && hasCabecera && !hasCama) return 'BASE Y CABECERA';
        if (hasCama && hasBase && !hasCabecera) return 'CAMA Y BASE';
        if (hasCama && hasCabecera && !hasBase) return 'CAMA Y CABECERA';
        if (hasCama) return 'CAMA';
        if (hasBase) return 'BASE DE CAMA';
        if (hasCabecera) return 'CABECERA';
        return 'CAMA';
    }

    function extractPlainModelKeyForPairing(it) {
        const rawMo = plainModelToken(it && it.mo);
        if (!rawMo) return '';
        let norm = normalizePlain(rawMo);
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
        const prodTok = (tpTok + ' ' + nomTok).trim();
        const pairMoKey = extractPlainModelKeyForPairing(it);

        if (mainCat === 'SALAS') {
            if (subCat === 'MESAS DE CENTRO') {
                return { domain: 'MESAS_SALA', typeKey: 'MESA_CENTRO', typeLabel: 'MESA DE CENTRO', typeRank: 50 };
            }
            if (subCat === 'MESAS LATERALES') {
                return { domain: 'MESAS_SALA', typeKey: 'MESA_LATERAL', typeLabel: 'MESA LATERAL', typeRank: 55 };
            }
            if (subCat === 'FUTONES & SOFÁ CAMAS') {
                if (/\b(FUTTON|FUTON)\b/.test(prodTok)) {
                    return { domain: 'SALAS_TAPIZ', typeKey: 'FUTON', typeLabel: 'FUTÓN', typeRank: 42 };
                }
                return { domain: 'SALAS_TAPIZ', typeKey: 'SOFA_CAMA', typeLabel: 'SOFÁ CAMA', typeRank: 40 };
            }
            if (subCat === 'SALAS MODULARES') {
                return { domain: 'SALAS_TAPIZ', typeKey: 'SALA_MODULAR', typeLabel: 'SALA MODULAR', typeRank: 10 };
            }
            if (subCat === 'SALAS EN L') {
                return { domain: 'SALAS_TAPIZ', typeKey: 'SALA_EN_L', typeLabel: 'SALA EN L', typeRank: 14 };
            }
            if (subCat === 'SILLONES') {
                return { domain: 'SALAS_TAPIZ', typeKey: 'SILLON', typeLabel: 'SILLÓN', typeRank: 30 };
            }
            // SOFAS & LOVESEATS: si el modelo tiene tanto Sofá como Love Seat, agrupar juntos como "SOFÁ Y LOVE SEAT [MODELO]"
            if (subCat === 'SOFAS & LOVESEATS' && pairMoKey && sofaAndLoveseatModels.has(pairMoKey)) {
                const isLs = /^(LOVE\s*SEAT|LOVESEAT)\b/.test(tpTok) || /\b(LOVE\s*SEATS?|LOVESEATS?)\b/.test(prodTok);
                return {
                    domain: 'SALAS_TAPIZ',
                    typeKey: 'SOFA_LOVESEAT',
                    typeLabel: 'SOFÁ Y LOVE SEAT',
                    typeRank: 18,
                    ownPieceTypeKey: isLs ? 'LOVE_SEAT' : 'SOFA',
                    ownPieceTypeLabel: isLs ? 'LOVE SEAT' : 'SOFÁ'
                };
            }
            if (/^(OTTOMAN|OTOMAN|POUF|PUFF|TABURETE)$/.test(tpTok)) {
                return { domain: 'SALAS_TAPIZ', typeKey: 'OTTOMAN', typeLabel: 'OTOMÁN', typeRank: 45 };
            }
            if (/^(LOVE\s*SEAT|LOVESEAT)\b/.test(tpTok)) {
                return { domain: 'SALAS_TAPIZ', typeKey: 'LOVE_SEAT', typeLabel: 'LOVE SEAT', typeRank: 25 };
            }
            if (/^SOFA\b/.test(tpTok)) {
                return { domain: 'SALAS_TAPIZ', typeKey: 'SOFA', typeLabel: 'SOFÁ', typeRank: 20 };
            }
            return { domain: 'SALAS_TAPIZ', typeKey: 'SALA', typeLabel: 'SALA', typeRank: 16 };
        }

        if (mainCat === 'COMEDORES') {
            if (/\bSILLON(?:ES)?\b/.test(tpTok + ' ' + nomTok) && !/\bSILLAS?\b/.test(nomTok)) {
                return { domain: 'SALAS_TAPIZ', typeKey: 'SILLON', typeLabel: 'SILLÓN', typeRank: 30 };
            }
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
            if ((subCat === 'CAMAS' || subCat === 'BASES' || subCat === 'CABECERAS') && pairMoKey && bedUnifiedModels.has(pairMoKey)) {
                const ownPieceTypeKey = subCat === 'CABECERAS' ? 'CABECERA' : (subCat === 'BASES' ? 'BASE_CAMA' : 'CAMA');
                const ownPieceTypeLabel = subCat === 'CABECERAS' ? 'CABECERA' : (subCat === 'BASES' ? 'BASE DE CAMA' : 'CAMA');
                return {
                    domain: 'RECAMARAS_MUEBLE',
                    typeKey: 'CAMA_CONJUNTO',
                    typeLabel: 'CAMA, BASE Y CABECERA',
                    typeRank: 80,
                    ownPieceTypeKey: ownPieceTypeKey,
                    ownPieceTypeLabel: ownPieceTypeLabel
                };
            }
            if (subCat === 'CABECERAS') {
                return { domain: 'RECAMARAS_MUEBLE', typeKey: 'CABECERA', typeLabel: 'CABECERA', typeRank: 82 };
            }
            if (subCat === 'BASES') {
                return { domain: 'RECAMARAS_MUEBLE', typeKey: 'BASE_CAMA', typeLabel: 'BASE DE CAMA', typeRank: 84 };
            }
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

            // EXTERIOR: misma lógica que Salas (Tipo de mueble + Modelo + Módulos + Variaciones)
            if (tpTok === 'CAMASTRO' || /\bCAMASTRO\b/.test(prodTok)) {
                return { domain: 'EXTERIOR', typeKey: 'EXT_CAMASTRO', typeLabel: 'CAMASTRO EXTERIOR', typeRank: 112 };
            }
            if (tpTok === 'COLUMPIO' || /\bCOLUMPIO\b/.test(prodTok)) {
                return { domain: 'EXTERIOR', typeKey: 'EXT_COLUMPIO', typeLabel: 'COLUMPIO EXTERIOR', typeRank: 113 };
            }
            if (/\bSOMBRILLA\b/.test(prodTok)) {
                return { domain: 'EXTERIOR', typeKey: 'EXT_SOMBRILLA', typeLabel: 'SOMBRILLA EXTERIOR', typeRank: 114 };
            }
            if (/^SILLA\b/.test(tpTok)) {
                return { domain: 'EXTERIOR', typeKey: 'EXT_SILLA', typeLabel: 'SILLA EXTERIOR', typeRank: 117 };
            }
            if (/^(BANCO|BANCA)\b/.test(tpTok)) {
                return { domain: 'EXTERIOR', typeKey: 'EXT_BANCO', typeLabel: 'BANCO EXTERIOR', typeRank: 117.5 };
            }
            const isExtSalaExplicit = /^SALA\b/.test(tpTok) || /^SILLON\b/.test(tpTok);
            if (!isExtSalaExplicit && /\bMESA\s+(?:DE\s+)?CENTRO\b/.test(prodTok)) {
                return { domain: 'EXTERIOR', typeKey: 'EXT_MESA_CENTRO', typeLabel: 'MESA DE CENTRO EXTERIOR', typeRank: 115 };
            }
            if (!isExtSalaExplicit && /\bMESA\s+(?:LATERAL|AUXILIAR)\b/.test(prodTok)) {
                return { domain: 'EXTERIOR', typeKey: 'EXT_MESA_LATERAL', typeLabel: 'MESA LATERAL EXTERIOR', typeRank: 115.5 };
            }
            if (!isExtSalaExplicit && /\bMESA\s+(?:DE\s+)?COMEDOR\b/.test(prodTok)) {
                return { domain: 'EXTERIOR', typeKey: 'EXT_MESA_COMEDOR', typeLabel: 'MESA DE COMEDOR EXTERIOR', typeRank: 114.5 };
            }
            if (!isExtSalaExplicit && /\bMESA\b/.test(prodTok)) {
                return { domain: 'EXTERIOR', typeKey: 'EXT_MESA', typeLabel: 'MESA EXTERIOR', typeRank: 116 };
            }
            if (/\b(SOFAS?\s*CAMAS?|FUTON|FUTTON|DAYBED)\b/.test(prodTok)) {
                return { domain: 'EXTERIOR', typeKey: 'EXT_SOFA_CAMA', typeLabel: 'SOFÁ CAMA EXTERIOR', typeRank: 110.4 };
            }
            const isExtSalaPiece = /\b(SALAS?|SOFAS?|LOVE\s*SEATS?|LOVESEATS?|ESQUINEROS?|CHAISE|OTTOMAN|OTOMAN|MODULAR|MODULO|REMATE|SILLON(?:ES)?)\b/.test(prodTok) && !/\bSILLAS?\b/.test(tpTok);
            if (isExtSalaPiece) {
                if (/\b(SALAS?\s+EN\s+L|SECCIONAL(?:ES)?\s+EN\s+L|EN\s+ESCUADRA)\b/.test(prodTok)) {
                    return { domain: 'EXTERIOR', typeKey: 'EXT_SALA_EN_L', typeLabel: 'SALA EN L EXTERIOR', typeRank: 110.2 };
                }
                if (
                    (pairMoKey && exteriorModularModels.has(pairMoKey)) ||
                    /\b(MODULAR(?:ES)?|MODULOS?|ESQUINEROS?|REMATES?|SIN\s+BRAZOS?|BRAZO\s+(?:DER|IZQ)|DERECHO|DEREHO|IZQUIERDO)\b/.test(prodTok)
                ) {
                    return { domain: 'EXTERIOR', typeKey: 'EXT_SALA_MODULAR', typeLabel: 'SALA MODULAR EXTERIOR', typeRank: 110 };
                }
                if (pairMoKey && exteriorSofaAndLoveseatModels.has(pairMoKey)) {
                    const isExtLs = /^LOVE\s*SEAT\b|^LOVESEAT\b/.test(tpTok) || /\b(LOVE\s*SEATS?|LOVESEATS?)\b/.test(prodTok);
                    const isExtSil = !isExtLs && (/^SILLON\b/.test(tpTok) || /\bSILLON(?:ES)?\b/.test(prodTok));
                    return {
                        domain: 'EXTERIOR',
                        typeKey: 'EXT_SOFA_LOVESEAT',
                        typeLabel: 'SOFÁ Y LOVE SEAT EXTERIOR',
                        typeRank: 110.5,
                        ownPieceTypeKey: isExtLs ? 'EXT_LOVE_SEAT' : (isExtSil ? 'EXT_SILLON' : 'EXT_SOFA'),
                        ownPieceTypeLabel: isExtLs ? 'LOVE SEAT EXTERIOR' : (isExtSil ? 'SILLÓN EXTERIOR' : 'SOFÁ EXTERIOR')
                    };
                }
                if (pairMoKey && exteriorSalaSetModels.has(pairMoKey)) {
                    return { domain: 'EXTERIOR', typeKey: 'EXT_SALA', typeLabel: 'SALA EXTERIOR', typeRank: 110.6 };
                }
                if (/^LOVE\s*SEAT\b|^LOVESEAT\b/.test(tpTok)) {
                    return { domain: 'EXTERIOR', typeKey: 'EXT_LOVE_SEAT', typeLabel: 'LOVE SEAT EXTERIOR', typeRank: 110.8 };
                }
                if (/^SOFA\b/.test(tpTok)) {
                    return { domain: 'EXTERIOR', typeKey: 'EXT_SOFA', typeLabel: 'SOFÁ EXTERIOR', typeRank: 110.7 };
                }
                if (/^SILLON\b/.test(tpTok)) {
                    return { domain: 'EXTERIOR', typeKey: 'EXT_SILLON', typeLabel: 'SILLÓN EXTERIOR', typeRank: 111 };
                }
                return { domain: 'EXTERIOR', typeKey: 'EXT_SALA', typeLabel: 'SALA EXTERIOR', typeRank: 110.5 };
            }
            return { domain: 'EXTERIOR', typeKey: 'EXT_' + (tpTok || 'MUEBLE'), typeLabel: (tpTok ? tpTok + ' EXTERIOR' : 'MUEBLE EXTERIOR'), typeRank: 118 };
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
        'SALA_MODULAR': ['SALA', 'SALAS', 'MODULAR', 'MODULARES'],
        'SALA_EN_L': ['SALA', 'SALAS', 'EN', 'L', 'SECCIONAL', 'ESCUADRA'],
        'SOFA_LOVESEAT': ['SALA', 'SALAS'],
        'SILLON': ['SILLON', 'SILLONES'],
        'SOFA': ['SOFA', 'SOFAS'],
        'LOVE_SEAT': ['LOVE', 'SEAT', 'LOVESEAT', 'LOVESEATS'],
        'SOFA_CAMA': ['SOFA', 'CAMA'],
        'FUTON': ['FUTTON', 'FUTON'],
        'OTTOMAN': ['OTTOMAN', 'OTOMAN', 'POUF', 'PUFF', 'TABURETE'],
        'EXT_SALA_MODULAR': ['SALA', 'SALAS', 'MODULAR', 'MODULARES', 'EXTERIOR'],
        'EXT_SALA_EN_L': ['SALA', 'SALAS', 'EN', 'L', 'EXTERIOR'],
        'EXT_SOFA_CAMA': ['SOFA', 'CAMA', 'EXTERIOR'],
        'EXT_SOFA_LOVESEAT': ['SALA', 'EXTERIOR'],
        'EXT_SALA': ['SALA', 'EXTERIOR'],
        'EXT_SOFA': ['SOFA', 'EXTERIOR'],
        'EXT_LOVE_SEAT': ['LOVE', 'SEAT', 'LOVESEAT', 'EXTERIOR'],
        'EXT_SILLON': ['SILLON', 'SILLONES', 'EXTERIOR'],
        'EXT_CAMASTRO': ['CAMASTRO', 'EXTERIOR'],
        'EXT_COLUMPIO': ['COLUMPIO', 'EXTERIOR'],
        'EXT_SOMBRILLA': ['SOMBRILLA', 'EXTERIOR'],
        'EXT_MESA_CENTRO': ['MESA', 'MESAS', 'CENTRO', 'CENTRAL', 'EXTERIOR'],
        'EXT_MESA_LATERAL': ['MESA', 'MESAS', 'LATERAL', 'LATERALES', 'AUXILIAR', 'EXTERIOR'],
        'EXT_MESA_COMEDOR': ['MESA', 'MESAS', 'COMEDOR', 'EXTERIOR'],
        'EXT_MESA': ['MESA', 'MESAS', 'EXTERIOR'],
        'EXT_SILLA': ['SILLA', 'SILLAS', 'COMEDOR', 'EXTERIOR'],
        'EXT_BANCO': ['BANCO', 'BANCOS', 'BANCA', 'BAR', 'EXTERIOR'],
        'MESA_CENTRO': ['MESA', 'MESAS', 'CENTRO', 'CENTRAL'],
        'MESA_LATERAL': ['MESA', 'MESAS', 'LATERAL', 'LATERALES', 'AUXILIAR'],
        'MESA_COMEDOR': ['MESA', 'MESAS', 'COMEDOR'],
        'SILLA_COMEDOR': ['SILLA', 'SILLAS', 'COMEDOR'],
        'BUFETERA': ['BUFETERA', 'BUFETERO', 'BUFERETERA'],
        'CAMA_CONJUNTO': ['CAMA', 'CAMAS', 'BASE', 'BASES', 'CABECERA', 'CABECERAS'],
        'CAMA': ['CAMA', 'CAMAS'],
        'CABECERA': ['CABECERA', 'CABECERAS'],
        'COLCHON': ['COLCHON'],
        'COMODA': ['COMODA', 'CAJONERA'],
        'BASE_CAMA': ['BASE', 'BASES', 'CAMA'],
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
            if (/^G[1-6]$/.test(nw)) continue;
            if (nw === 'GRADO' && i + 1 < rawTokens.length && /^[1-6]$/.test(normTok(rawTokens[i + 1]))) {
                i++;
                continue;
            }
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
            const singleFurnInfo = furnInfo.ownPieceTypeLabel
                ? Object.assign({}, furnInfo, { typeKey: furnInfo.ownPieceTypeKey, typeLabel: furnInfo.ownPieceTypeLabel })
                : furnInfo;
            return {
                key: 'type_' + normalizePlain(furnInfo.typeKey) + '__mo_' + (canonMoKey || normalizePlain(distinctMo)),
                title: title,
                singleTitle: formatStructuredSingleTitle(it, singleFurnInfo, distinctMo),
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
