    // ========================================================================
    // GESTOR DE PORTADAS VISUALES (INICIO), TELAS Y MADERAS (SOLO APP DE FOTOS)
    // Persistido en _INV_PRODUCT_OVERRIDES (VCOV:... / VFAB:... / VWOD:...) sin tocar SKUs ni Hoja 1
    // ========================================================================
    const VISUAL_OVERRIDES_STORAGE_KEY = 'creata_inv_product_overrides_v1';
    const VISUAL_TARGETS_INDEX_STORAGE_KEY = 'creata_visual_targets_index_v1';
    const VISUAL_UPLOAD_DRIVE_FOLDER_ID = '1rPFbjvovC5fSDPHS29yYpbLwM90c-5L9';

    const visualState = {
        workMode: 'SKU', // 'SKU' | 'COVER' | 'FABRIC' | 'WOOD'
        filterMode: 'ALL', // 'ALL' | 'NO_PHOTO' | 'HAS_PHOTO'
        searchQuery: '',
        overridesMap: {},
        covers: [],
        fabrics: [],
        woods: [],
        selectedOverrideKey: '',
        busy: false
    };

    function compactVisualOverrideKeyFotos(prefix, rawKey) {
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

    const DEFAULT_WOOD_SWATCHES_FOTOS = (function buildDefaultWoodSwatchesFotos() {
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
            const key = compactVisualOverrideKeyFotos('VWOD:', name);
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

    const FOTOS_WOOD_SPECIES_CORE_RE = /\b(ROSA\s+MORADA|PAROTA|TZALAM|NOGAL|TECA|ENCINO|ROBLE|CEDRO|PINO|CAOBA|FRESNO|HAYA|OKUME|MAPLE|ABEDUL|PALO\s+DE\s+ROSA|MADERA|CHAPA|MELAMINA|MDF|TRIPLAY|ALAMO|BANAK|PRIMAVERA|CEREZO|EBANO|WENGUE|BAMBU)\b/i;
    const FOTOS_WOOD_FINISH_RE = /\b(TABACO|TACUBA|BELLOTA|ESPIGA|HABANO|CAMEL|GINGER|NOCHE|NUEZ)\b/i;
    const FOTOS_WOOD_PROVIDER_RE = /\b(BARSA|YOI|SKANOR|CHAVOYA|ARTEX|ATX|ARTC|KASAM|MOBEL\s+INN|BLOQUEART|CASA\s+AURA|REVICA|VANGARDI|LUX\s+FACTOR[IY]|LUIS\s+PEDRO|MR\s+FURNITURE)\b/i;
    const FOTOS_NON_WOOD_ONLY_RE = /^(MARMOL|MARBOL|TRAVERTINO|ONIX|PIEDRA|GRANITO|CUARZO|CRISTAL|VIDRIO|ESPEJO|METAL|ACERO|ALUMINIO|HIERRO|HERRERIA|LATON|BRONCE|COBRE|CERAMICA|PORCELANA|PORCELANATO|RESINA|PLASTICO|POLIPROPILENO|RATAN|RATTAN|MIMBRE|CUERDA|SOGA|FIBRA|CONCRETO|CEMENTO|N\/A|NA|NO APLICA|NINGUNA|NINGUNO|SIN MADERA|-)$/i;
    const FOTOS_WOOD_ALLOWED_TOKENS = new Set([
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

    function isPureWoodDescriptorFotos(rawText) {
        const norm = plainVisToken(rawText);
        if (!norm) return false;
        const hasCore = FOTOS_WOOD_SPECIES_CORE_RE.test(norm) || (FOTOS_WOOD_FINISH_RE.test(norm) && FOTOS_WOOD_PROVIDER_RE.test(norm));
        if (!hasCore) return false;
        const toks = norm.split(/\s+/).filter(Boolean);
        return toks.length > 0 && toks.every((t) => FOTOS_WOOD_ALLOWED_TOKENS.has(t));
    }

    function plainVisToken(raw) {
        return String(raw || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toUpperCase()
            .replace(/[^A-Z0-9]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function normalizePlainLowerVis(raw) {
        return String(raw || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function cleanFabricVariationNameFotos(rawText) {
        let s = plainVisToken(String(rawText || '').replace(/\b\d+(?:\.\d+)?\s*(?:X|×)\s*\d+(?:\.\d+)?(?:\s*(?:X|×)\s*\d+(?:\.\d+)?)?\s*(?:CM|MM|M|MTS)?\b/gi, ' '));
        if (!s) return '';
        s = s.replace(/\s*(?:\/|\||·)?\s*\bCOORD\.?\b[\s\S]*$/i, '').trim();
        s = s.replace(/^(?:(?:CON|SIN)\s+BRAZOS?\s+|BRAZO\s+(?:DER(?:ECHO|EHO)?|IZQ(?:UIERDO)?)\s+|(?:DERECHO|DEREHO|IZQUIERDO|DER|IZQ|CENTRAL|MODULAR|IND|INV|TELA|3P|2P|1P)\s+)+/i, '').trim();
        s = s.replace(/^(?:DE|DEL|EN|CON|LA|EL)\s+/i, '').trim();
        return s.replace(/\s+/g, ' ').trim();
    }

    function loadVisualOverridesFromLocalStorage() {
        try {
            const raw = localStorage.getItem(VISUAL_OVERRIDES_STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                    visualState.overridesMap = parsed;
                    return;
                }
            }
        } catch (e) {}
        visualState.overridesMap = {};
    }

    function saveVisualOverridesToLocalStorage() {
        try {
            localStorage.setItem(VISUAL_OVERRIDES_STORAGE_KEY, JSON.stringify(visualState.overridesMap || {}));
        } catch (eQuota) {
            try {
                const slim = {};
                const src = visualState.overridesMap || {};
                Object.keys(src).forEach((k) => {
                    const entry = src[k];
                    if (!entry) return;
                    const note = String(entry.note || '');
                    slim[k] = note.indexOf('data:image/') === 0
                        ? Object.assign({}, entry, { note: entry.localFileId || '' })
                        : entry;
                });
                localStorage.setItem(VISUAL_OVERRIDES_STORAGE_KEY, JSON.stringify(slim));
            } catch (e2) {}
        }
    }

    function getVisualOverridePhotoUrlInFotos(overrideKey) {
        const k = String(overrideKey || '').trim().toUpperCase();
        if (!k) return '';
        if (visualState.overridesMap && Object.prototype.hasOwnProperty.call(visualState.overridesMap, k)) {
            const ovr = visualState.overridesMap[k];
            if (!ovr || ovr.status === 'ELIMINADO' || ovr.status === 'ARCHIVADO') return '';
            const rawUrl = cleanStr(ovr.note);
            if (!rawUrl) return '';
            return (/^https?:\/\//i.test(rawUrl) || /^data:image\//i.test(rawUrl)) ? rawUrl : '';
        }
        if (k.indexOf('VWOD:') === 0 && DEFAULT_WOOD_SWATCHES_FOTOS[k]) {
            return cleanStr(DEFAULT_WOOD_SWATCHES_FOTOS[k].note);
        }
        return '';
    }

    function resolveVisualThumbSrcInFotos(rawUrl, sizePx) {
        const u = cleanStr(rawUrl);
        if (!u) return '';
        if (/^data:image\//i.test(u)) return u;
        const fid = extractDriveFileId(u);
        if (fid) {
            const rev = extractDrivePhotoRevInFotos(u);
            return 'https://lh3.googleusercontent.com/d/' + fid + '=w' + (Number(sizePx) || 400) + (rev ? ('?v=' + encodeURIComponent(rev)) : '');
        }
        return /^https?:\/\//i.test(u) ? u : '';
    }

    function broadcastVisualOverrideUpdateToCotizador(overrideKey, overrideObj, deleted) {
        const msg = {
            type: 'CREATA_VISUAL_OVERRIDE_SAVED',
            source: 'fotos',
            tabId: FOTOS_TAB_ID,
            overrideKey: String(overrideKey || '').trim().toUpperCase(),
            override: deleted ? null : (overrideObj || null),
            deleted: !!deleted,
            ts: Date.now()
        };
        try {
            if (window.parent && window.parent !== window && typeof window.parent.postMessage === 'function') {
                window.parent.postMessage(msg, '*');
            }
        } catch (e) {}
        try {
            const splitFrame = document.getElementById('fotosSplitCotizadorFrame');
            if (splitFrame && splitFrame.contentWindow && typeof splitFrame.contentWindow.postMessage === 'function') {
                splitFrame.contentWindow.postMessage(msg, '*');
            }
        } catch (e2) {}
        try {
            if (_fotosSyncChannel) _fotosSyncChannel.postMessage(msg);
        } catch (e3) {}
    }

    const FOTOS_VFAB_GENERIC_SINGLE_TOKENS = new Set([
        'TELA', 'COLOR', 'ESTANDAR', 'CLARO', 'OSCURO', 'NATURAL', 'MEDIO', 'LINO', 'PIEL',
        'BEIGE', 'BLANCO', 'BLANCA', 'WHITE', 'NEGRO', 'NEGRA', 'BLACK',
        'GRIS', 'GREY', 'GRAY', 'AZUL', 'BLUE', 'VERDE', 'GREEN',
        'ROJO', 'ROJA', 'RED', 'CAFE', 'BROWN', 'MARRON', 'ARENA', 'SAND',
        'CREMA', 'CREAM', 'HUESO', 'BONE', 'IVORY', 'MARFIL',
        'DORADO', 'ORO', 'GOLD', 'PLATA', 'SILVER', 'BRONCE', 'ROSA', 'PINK',
        'TERRACOTA', 'TAUPE', 'CAMEL', 'CHOCOLATE', 'OLIVO', 'OLIVE',
        'MOSTAZA', 'MUSTARD', 'OCRE', 'CRUDO', 'PERLA', 'PEARL',
        'SNOW', 'FLAX', 'ECRU', 'OAT', 'TOAST', 'ALABASTER', 'PIEDRA', 'STONE'
    ]);

    function getUploadedFabricEntriesInFotos() {
        const out = [];
        const map = visualState.overridesMap || {};
        const keys = Object.keys(map);
        for (let i = 0; i < keys.length; i++) {
            const k = String(keys[i] || '').trim().toUpperCase();
            if (!k || k.indexOf('VFAB:') !== 0) continue;
            const ovr = map[keys[i]];
            if (!ovr || ovr.status === 'ELIMINADO' || ovr.status === 'ARCHIVADO') continue;
            const rawUrl = cleanStr(ovr.note);
            if (!rawUrl || (!/^https?:\/\//i.test(rawUrl) && !/^data:image\//i.test(rawUrl))) continue;
            const rawName = cleanStr(ovr.name || k.slice(5));
            let label = cleanFabricVariationNameFotos(rawName) || rawName;
            const rawTokens = plainVisToken(rawName).split(' ').filter((w) => w.length >= 2);
            let tokens = plainVisToken(label).split(' ').filter((w) => w.length >= 2);
            if (tokens.length === 1 && FOTOS_VFAB_GENERIC_SINGLE_TOKENS.has(tokens[0]) && rawTokens.length >= 2) {
                label = rawName;
                tokens = rawTokens;
            }
            const strippedWood = plainVisToken(label)
                .replace(/\bROSA\s+MORADA(?:\s+(?:TONO\s+)?(?:NATURAL|BARSA|YOI|CHAVOYA|CLARA|OSCURA|NOGAL))?\b/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
            if (strippedWood) {
                tokens = strippedWood.split(' ').filter((w) => w.length >= 2);
            }
            if (!tokens.length) continue;
            out.push({
                overrideKey: k,
                label: rawName.toUpperCase(),
                url: rawUrl,
                plain: tokens.join(' '),
                sortedKey: tokens.slice().sort().join(' '),
                tokens: tokens
            });
        }
        return out;
    }

    function findMatchingUploadedFabricForProduct(prod) {
        if (!prod) return null;
        const tlClean = cleanStr(prod.tl);
        const ctClean = cleanStr(prod.ct);
        const hasRealFabricCols = Boolean(
            (tlClean && !isPureWoodDescriptorFotos(tlClean)) ||
            (ctClean && !isPureWoodDescriptorFotos(ctClean))
        );
        if (!hasRealFabricCols) {
            const catTok = plainVisToken(prod.categoria || '');
            const typeNameTok = plainVisToken(cleanStr(prod.tipo || '') + ' ' + cleanStr(prod.displayName || prod.colBName || ''));
            const hasUph = /\b(SILLA|SILLON|SOFA|SALA|LOVESEAT|LOVE\s+SEAT|MODULAR|CHAISE|COJIN|COJINES|CABECERA|CAMA|BANCO|TABURETE|PERIQUERA|POUF|PUF|OTTOMAN|OTOMAN|CAMASTRO|TAPIZ|TELA|PIEL|LINO|BOUCLE|VELVET|TERCIOPELO|CHENILLE|BAUL)\b/i.test(typeNameTok);
            if (!hasUph && (catTok === 'MESAS' || catTok === 'MESAS DE CENTRO LATERALES' || catTok === 'BUFETERAS CREDENZAS' || catTok === 'ILUMINACION' || catTok === 'ESPEJOS ARTE' || /\b(MESA|COMEDOR|CREDENZA|BUFETERA|BURO|CONSOLA|ESCRITORIO|LIBRERO|MUEBLE\s+TV|PEDESTAL|BASE|CUBIERTA|ESPEJO|CUADRO|LAMPARA|CANDIL|ARBOTANTE|MACETA|FLORERO|JARRON|FOLLAJE|BOTELLA|ESCULTURA|RELOJ)\b/i.test(typeNameTok))) {
                return null;
            }
        }
        const entries = getUploadedFabricEntriesInFotos();
        if (!entries.length) return null;

        const candidates = [];
        const addCand = (raw) => {
            if (isPureWoodDescriptorFotos(raw)) return;
            const c = cleanFabricVariationNameFotos(raw);
            if (c && !isPureWoodDescriptorFotos(c) && candidates.indexOf(c) === -1) candidates.push(c);
        };
        if (prod.tl && prod.ct) addCand(prod.tl + ' ' + prod.ct);
        addCand(prod.tl);
        if (prod.variante) {
            String(prod.variante).split(/\s*[·|\/]\s*/).forEach(addCand);
        }
        if (prod.acabado) {
            String(prod.acabado).split(/\s*[·|\/]\s*/).forEach(addCand);
        }
        addCand(prod.ct);
        if (!candidates.length) return null;

        // 1) Exact VFAB override key match
        for (let i = 0; i < candidates.length; i++) {
            const k = compactVisualOverrideKeyFotos('VFAB:', candidates[i]);
            const exact = entries.find((e) => e.overrideKey === k);
            if (exact) return exact;
        }
        // 2) Exact plain or word-order-independent match
        for (let i = 0; i < candidates.length; i++) {
            const cTokens = plainVisToken(candidates[i]).split(' ').filter((w) => w.length >= 2);
            if (!cTokens.length) continue;
            const cPlain = cTokens.join(' ');
            const cSorted = cTokens.slice().sort().join(' ');
            const hit = entries.find((e) => e.plain === cPlain || e.sortedKey === cSorted);
            if (hit) return hit;
        }
        // 3) Subset match (uploaded fabric tokens contained in product fabric or vice-versa)
        let best = null;
        let bestScore = 0;
        for (let i = 0; i < candidates.length; i++) {
            const cTokens = plainVisToken(candidates[i]).split(' ').filter((w) => w.length >= 2);
            if (!cTokens.length) continue;
            if (cTokens.every((t) => FOTOS_WOOD_ALLOWED_TOKENS.has(t))) continue;
            const cSet = new Set(cTokens);
            for (let j = 0; j < entries.length; j++) {
                const e = entries[j];
                if (e.tokens.length === 1 && FOTOS_VFAB_GENERIC_SINGLE_TOKENS.has(e.tokens[0])) continue;
                const eSet = new Set(e.tokens);
                const allEntryInCand = e.tokens.every((t) => cSet.has(t));
                const allCandInEntry = cTokens.length >= 2 && cTokens.every((t) => eSet.has(t));
                if (allEntryInCand || allCandInEntry) {
                    const score = (allEntryInCand ? e.tokens.length * 10 : cTokens.length * 8) - Math.abs(e.tokens.length - cTokens.length);
                    if (score > bestScore) {
                        bestScore = score;
                        best = e;
                    }
                }
            }
        }
        return best;
    }

    const NON_WOOD_MATERIAL_ONLY_RE_FOTOS = /^(MARMOL|MARBOL|TRAVERTINO|ONIX|PIEDRA|GRANITO|CUARZO|CRISTAL|VIDRIO|ESPEJO|METAL|ACERO|ALUMINIO|HIERRO|HERRERIA|LATON|BRONCE|COBRE|CERAMICA|PORCELANA|PORCELANATO|RESINA|PLASTICO|POLIPROPILENO|RATAN|RATTAN|MIMBRE|CUERDA|SOGA|FIBRA|CONCRETO|CEMENTO|PINO|PINO\s+ESTUFADO|MADERA\s+DE\s+PINO|MDF|TRIPLAY|CONTRACHAPADO|AGLOMERADO|POLIESTER|ESPUMA|DELCRON|N\/A|NA|NO APLICA|NINGUNA|NINGUNO|SIN MADERA|-)$/i;
    const WOOD_PROVIDER_RE_FOTOS = /^(?:BARSA|ARTEX|ATX|ARTC|BGA|COSTA|CRISS|DIANA|DILU|DISE|DUKE|HAKO|HEMA|INHABIT|KASA|KUA|LUX|FACTORI|FACTORY|MARMOL|MOBEL|INN|MUEBLES|NORDICO|NOVO|OAXACA|PACIFICO|PALMA|QUINTA|RIVIERA|SOLARIS|TULUM|VALENCIA|VENECIA)$/i;
    const WOOD_FILLER_TOKENS_FOTOS = new Set(['MADERA', 'DE', 'EN', 'CON', 'TONO', 'NATURAL', 'ACABADO', 'LACA', 'BARNIZ', 'BASE', 'PATAS', 'CUBIERTA', 'SOLIDA', 'SOLIDO', 'MACIZA', 'MACIZO', 'CHAPA', 'LAMINADO', 'LAMINADA', 'ENCHAPADO', 'ENCHAPADA']);
    const WOOD_SPECIAL_FINISH_TOKENS_FOTOS = new Set(['ENTINTADO', 'ENTINTADA', 'ACEITE', 'WHITE', 'CLARA', 'CLARO', 'OSCURO', 'OSCURA']);
    const WOOD_MODIFIER_ONLY_TOKENS_FOTOS = new Set([
        'CLARO', 'CLARA', 'OSCURO', 'OSCURA', 'OBSCURO', 'OBSCURA',
        'ENTINTADO', 'ENTINTADA', 'ACEITE', 'WHITE', 'BLANCO', 'BLANCA',
        'NEGRO', 'NEGRA', 'GRIS', 'BEIGE', 'CAFE', 'NATURAL', 'TONO',
        'LACA', 'MATTE', 'MATE', 'BARNIZ', 'BRILLANTE', 'SEMI', 'CARDEADO', 'BLANQUEADO'
    ]);

    function expandWoodProviderAliasesFotos(provRaw) {
        const p = plainVisToken(provRaw);
        if (!p) return [];
        const out = new Set(p.split(/\s+/).filter((t) => t.length >= 2));
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

    function normalizeWoodCanonicalTextFotos(raw) {
        return plainVisToken(raw)
            .replace(/\bFACTORY\b/g, 'FACTORI')
            .replace(/\b(?:TEKA|TEAK)\b/g, 'TECA')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function findMatchingUploadedWoodForProduct(prod) {
        if (!prod) return null;
        const catTok = plainVisToken(prod.categoria || '');
        const nameTok = plainVisToken(prod.displayName || prod.colBName || '');
        const typeNameTok = plainVisToken(cleanStr(prod.tipo || '') + ' ' + nameTok);
        const visibleWoodInNameRe = /\b(ROSA\s+MORADA|PALO\s+DE\s+ROSA|PAROTA|TZALAM|NOGAL|TECA|TEKA|TEAK|ENCINO|ROBLE|FRESNO|CEDRO|CAOBA|OLMO|HAYA|TABACO|TACUBA|BELLOTA|HABANO|ESPIGA|GINGER|CAMEL|NOCHE|NUEZ|MADERA|PATA(?:S)?\s+DE\s+MADERA|BASE\s+(?:EN\s+)?MADERA)\b/i;
        if (/^(COJINES\s+TEXTILES|TEXTILES|ROPA\s+DE\s+CAMA|TAPETES|ALFOMBRAS|COLCHONES|BLANCOS)$/i.test(catTok) || /\b(COJIN|COJINES|FUNDA|FUNDAS|ALMOHADON|SABANA|DUVET|MANTEL|HILO|CONO\s+DE\s+HILO|TOALLA|TAPETE|ALFOMBRA|COLCHON|CORTINA)\b/i.test(typeNameTok)) {
            return null;
        }
        if (/\b(SALA|SALAS|SOFA|SOFAS|SOFACAMA|SOFA\s+CAMA|MODULAR|SECCIONAL|ESCUADRA|LOVESEAT|LOVE\s+SEAT|CHAISE|ESQUINERO|FUTON|FUTTON)\b/i.test(catTok + ' ' + typeNameTok) && !visibleWoodInNameRe.test(nameTok)) {
            return null;
        }

        const md = cleanStr(prod.md);
        const cm = cleanStr(prod.cm);
        const prov = cleanStr(prod.proveedor || prod.p);
        const mdNorm = plainVisToken(md);
        const cmNorm = plainVisToken(cm);
        if (mdNorm && NON_WOOD_MATERIAL_ONLY_RE_FOTOS.test(mdNorm) && (!cmNorm || NON_WOOD_MATERIAL_ONLY_RE_FOTOS.test(cmNorm))) {
            return null;
        }
        if (/^(?:LACA\s+)?(?:NEGR[OA]|BLANC[OA])$/i.test(cmNorm) && /\b(?:PATA(?:S)?\s+NEGR[OA]S?|LACA\s+(?:NEGR[OA]|BLANC[OA]))\b/i.test(nameTok) && !visibleWoodInNameRe.test(nameTok)) {
            return null;
        }

        const map = visualState.overridesMap || {};
        const woodEntries = [];
        const seenKeys = new Set();
        const addWoodEntry = (k, ovr, isDefault) => {
            if (!k || seenKeys.has(k)) return;
            if (!ovr || ovr.status === 'ELIMINADO' || ovr.status === 'ARCHIVADO') return;
            const rawUrl = cleanStr(ovr.note);
            if (!rawUrl || (!/^https?:\/\//i.test(rawUrl) && !/^data:image\//i.test(rawUrl))) return;
            const label = cleanStr(ovr.name || k.slice(5)).toUpperCase();
            const normName = normalizeWoodCanonicalTextFotos(label);
            const tokens = normName.split(/\s+/).filter((w) => w.length >= 2);
            if (!normName || !tokens.length) return;
            seenKeys.add(k);
            woodEntries.push({
                overrideKey: k,
                label: label,
                url: rawUrl,
                normName: normName,
                tokens: tokens,
                tokenSet: new Set(tokens),
                sortedSig: tokens.slice().sort().join(' '),
                isDefault: !!isDefault
            });
        };
        Object.keys(map).forEach((rk) => {
            const k = String(rk || '').trim().toUpperCase();
            if (k.indexOf('VWOD:') === 0) addWoodEntry(k, map[rk], false);
        });
        Object.keys(DEFAULT_WOOD_SWATCHES_FOTOS).forEach((dk) => {
            const ovr = Object.prototype.hasOwnProperty.call(map, dk) ? map[dk] : null;
            if (ovr && (ovr.status === 'ELIMINADO' || ovr.status === 'ARCHIVADO')) return;
            addWoodEntry(dk, (ovr && cleanStr(ovr.note)) ? ovr : DEFAULT_WOOD_SWATCHES_FOTOS[dk], !ovr);
        });
        if (!woodEntries.length) return null;
        woodEntries.sort((a, b) => (a.isDefault === b.isDefault ? 0 : (a.isDefault ? 1 : -1)) || (b.tokens.length - a.tokens.length) || a.label.localeCompare(b.label));

        const provAliases = expandWoodProviderAliasesFotos(prov);
        const provNorm = plainVisToken(prov);

        const matchCandidate = (rawCand) => {
            const cleanRaw = cleanStr(rawCand);
            if (!cleanRaw || NON_WOOD_MATERIAL_ONLY_RE_FOTOS.test(plainVisToken(cleanRaw))) return null;
            const normCand = normalizeWoodCanonicalTextFotos(cleanRaw);
            if (!normCand || normCand === 'ESTANDAR' || normCand === 'MADERA' || normCand === 'NATURAL' || normCand === 'TONO NATURAL') return null;

            const directTries = [];
            if (provNorm && normCand.indexOf(provNorm) === -1) directTries.push(normCand + ' ' + provNorm);
            directTries.push(cleanRaw, normCand);
            for (let d = 0; d < directTries.length; d++) {
                const dk = compactVisualOverrideKeyFotos('VWOD:', directTries[d]);
                const exact = woodEntries.find((e) => e.overrideKey === dk);
                if (exact) return exact;
            }

            const candTokens = normCand.split(/\s+/).filter((t) => t.length >= 2);
            const coreCandTokens = candTokens.filter((t) => !WOOD_FILLER_TOKENS_FOTOS.has(t));
            if (!coreCandTokens.length) return null;
            const nonProvCore = coreCandTokens.filter((t) => !provAliases.includes(t) && !WOOD_PROVIDER_RE_FOTOS.test(t));
            if (!nonProvCore.length || nonProvCore.every((t) => WOOD_MODIFIER_ONLY_TOKENS_FOTOS.has(t))) return null;

            const candSet = new Set(candTokens);
            const candSortedSig = candTokens.slice().sort().join(' ');
            const candWantsSpecial = candTokens.some((t) => WOOD_SPECIAL_FINISH_TOKENS_FOTOS.has(t));

            for (let i = 0; i < woodEntries.length; i++) {
                const e = woodEntries[i];
                if (e.normName === normCand || e.sortedSig === candSortedSig) return e;
            }

            const subsetOfCand = woodEntries.filter((e) => e.tokens.every((tok) => candSet.has(tok)));
            if (subsetOfCand.length) {
                subsetOfCand.sort((a, b) => {
                    const aProv = provAliases.some((p) => a.tokenSet.has(p)) ? 0 : 1;
                    const bProv = provAliases.some((p) => b.tokenSet.has(p)) ? 0 : 1;
                    if (aProv !== bProv) return aProv - bProv;
                    return b.tokens.length - a.tokens.length;
                });
                return subsetOfCand[0];
            }

            const matchingEntries = woodEntries.filter((e) => coreCandTokens.every((tok) => e.tokenSet.has(tok)));
            if (matchingEntries.length) {
                matchingEntries.sort((a, b) => {
                    const aProv = provAliases.length && provAliases.some((p) => a.tokenSet.has(p)) ? 0 : 1;
                    const bProv = provAliases.length && provAliases.some((p) => b.tokenSet.has(p)) ? 0 : 1;
                    if (aProv !== bProv) return aProv - bProv;
                    const aSpec = (!candWantsSpecial && a.tokens.some((t) => WOOD_SPECIAL_FINISH_TOKENS_FOTOS.has(t))) ? 1 : 0;
                    const bSpec = (!candWantsSpecial && b.tokens.some((t) => WOOD_SPECIAL_FINISH_TOKENS_FOTOS.has(t))) ? 1 : 0;
                    if (aSpec !== bSpec) return aSpec - bSpec;
                    return (a.isDefault === b.isDefault ? 0 : (a.isDefault ? 1 : -1)) || (a.tokens.length - b.tokens.length);
                });
                return matchingEntries[0];
            }

            if (coreCandTokens.length >= 2) {
                const speciesOnly = coreCandTokens.filter((t) => !provAliases.includes(t) && !WOOD_PROVIDER_RE_FOTOS.test(t));
                if (speciesOnly.length > 0 && speciesOnly.length < coreCandTokens.length) {
                    return matchCandidate(speciesOnly.join(' '));
                }
            }
            return null;
        };

        const cands = [];
        const mdOk = Boolean(md && !NON_WOOD_MATERIAL_ONLY_RE_FOTOS.test(mdNorm));
        const cmOk = Boolean(cm && !NON_WOOD_MATERIAL_ONLY_RE_FOTOS.test(cmNorm));
        if (mdOk && cmOk && cmNorm.indexOf(mdNorm) === -1) {
            if (provNorm && (mdNorm + ' ' + cmNorm).indexOf(provNorm) === -1) cands.push(md + ' ' + cm + ' ' + prov);
            cands.push(md + ' ' + cm);
        }
        if (cmOk) {
            if (provNorm && cmNorm.indexOf(provNorm) === -1) cands.push(cm + ' ' + prov);
            cands.push(cm);
        }
        if (mdOk) {
            if (provNorm && mdNorm.indexOf(provNorm) === -1) cands.push(md + ' ' + prov);
            cands.push(md);
        }
        if (prod.variante) String(prod.variante).split(/\s*[·|\/]\s*/).forEach((p) => { if (isPureWoodDescriptorFotos(p)) cands.push(p); });
        if (prod.acabado) String(prod.acabado).split(/\s*[·|\/]\s*/).forEach((p) => { if (isPureWoodDescriptorFotos(p)) cands.push(p); });

        const tried = new Set();
        for (let i = 0; i < cands.length; i++) {
            const c = cleanStr(cands[i]);
            if (!c || tried.has(c)) continue;
            tried.add(c);
            const hit = matchCandidate(c);
            if (hit && hit.url) return hit;
        }

        if (!md && !cm && nameTok) {
            const spMatch = nameTok.match(/\b(ROSA\s+MORADA|PALO\s+DE\s+ROSA|PAROTA|TZALAM|NOGAL|TECA|TEKA|TEAK|ENCINO|ROBLE)\b/i);
            if (spMatch && spMatch[1]) {
                const hit = matchCandidate(spMatch[1]);
                if (hit && hit.url) return hit;
            }
        }
        return null;
    }

    async function syncVisualOverridesFromCloudInFotos(opts) {
        const isSilent = !!(opts && opts.silent);
        if (!isSilent) loadVisualOverridesFromLocalStorage();
        if (!state.unlocked) return;
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
        try {
            const auth = buildOwnerAuthPayload();
            const res = await callWebAppPost('inv_product_overrides_get', Object.assign({}, auth), 18000);
            if (res && res.ok && res.overrides && typeof res.overrides === 'object') {
                const pendingVis = {};
                readFotosOfflineOutbox().forEach((entry) => {
                    if (entry && entry.type === 'visual_override_upload' && entry.overrideKey) {
                        const k = String(entry.overrideKey).trim().toUpperCase();
                        if (visualState.overridesMap && visualState.overridesMap[k]) {
                            pendingVis[k] = visualState.overridesMap[k];
                        }
                    }
                });
                const nextMap = Object.assign({}, res.overrides, pendingVis);
                const nextVisFp = computeVisualFingerprint(nextMap);
                const visChanged = !isSilent || !_lastVisualFingerprint || nextVisFp !== _lastVisualFingerprint;
                _lastVisualFingerprint = nextVisFp;
                visualState.overridesMap = nextMap;
                if (visChanged) {
                    saveVisualOverridesToLocalStorage();
                    invalidateLoadedPhotosCache();
                    if (visualState.workMode !== 'SKU') {
                        renderVisualTargetsList();
                        renderVisualTargetStage();
                    } else if (state.selectedSku) {
                        renderSelectedProductStage();
                    }
                    if (state.galleryMode === 'LOADED') {
                        renderInboxGallery();
                    } else {
                        renderRecentUploadedStrip();
                    }
                }
            }
        } catch (e) {}
    }

    function buildFallbackVisualTargetsFromProducts() {
        const coversMap = new Map();
        const fabricsMap = new Map();
        const woodsMap = new Map();
        const packItems = [];
        try {
            if (typeof window !== 'undefined' && Array.isArray(window.CREATA_INV_DATA)) {
                for (let i = 0; i < window.CREATA_INV_DATA.length; i++) {
                    const it = window.CREATA_INV_DATA[i];
                    if (it && it.s) packItems.push(it);
                }
            }
        } catch (e) {}

        const sourceList = [];
        const seenSkus = new Set();
        for (let i = 0; i < state.products.length; i++) {
            const p = state.products[i];
            if (!p || !p.sku) continue;
            seenSkus.add(p.sku.toUpperCase());
            sourceList.push({
                s: p.sku,
                n: p.displayName || p.colBName || p.sku,
                c: p.categoria || '',
                tp: p.tipo || '',
                mo: p.modelo || '',
                p: p.proveedor || '',
                vr: p.variante || '',
                tl: p.tl || '',
                ct: p.ct || '',
                md: p.md || '',
                cm: p.cm || '',
                f: p.photoUrl || ''
            });
        }
        for (let i = 0; i < packItems.length; i++) {
            const it = packItems[i];
            const k = String(it.s || '').toUpperCase();
            if (!k || seenSkus.has(k)) continue;
            sourceList.push(it);
        }

        const isPureDirection = (txt) => /^(?:(?:CON|SIN)\s+BRAZOS?|BRAZO\s+(?:DER(?:ECHO|EHO)?|IZQ(?:UIERDO)?)|DER(?:ECHO|EHO)?|IZQ(?:UIERDO)?|CENTRAL|MODULAR|IND|INV|1P|2P|3P|4P|5P|SALA|SOFA|LOVE\s*SEAT|SILLON|ESQUINERO|CHAISE(?:\s+LONGUE)?|OTTOMAN|OTOMAN|TABURETE|REMATE)$/.test(txt);

        const registerWoodEntry = (woodRaw, colorHintRaw, modelKey, modelTitle) => {
            const cleanWood = plainVisToken(woodRaw);
            if (!cleanWood || cleanWood.length < 3 || FOTOS_NON_WOOD_ONLY_RE.test(cleanWood) || cleanWood === 'MADERA' || cleanWood === 'NATURAL') return '';
            const woodOvKey = compactVisualOverrideKeyFotos('VWOD:', cleanWood);
            if (!woodOvKey) return '';
            if (!woodsMap.has(woodOvKey)) {
                woodsMap.set(woodOvKey, {
                    woodKey: cleanWood,
                    overrideKey: woodOvKey,
                    label: cleanWood,
                    colorHint: cleanStr(colorHintRaw).toUpperCase(),
                    modelCount: 0,
                    moduleCount: 0,
                    sampleModels: [],
                    _models: new Set()
                });
            }
            const wRec = woodsMap.get(woodOvKey);
            if (modelKey) {
                wRec.moduleCount++;
                if (!wRec._models.has(modelKey)) {
                    wRec._models.add(modelKey);
                    wRec.modelCount++;
                    if (modelTitle && wRec.sampleModels.length < 4) wRec.sampleModels.push(modelTitle);
                }
            }
            return cleanWood;
        };

        // Pre-sembrar las 34 muestras verificadas de la carpeta Drive MADERAS + cualquier VWOD: guardado en la nube
        Object.keys(DEFAULT_WOOD_SWATCHES_FOTOS).forEach((wk) => {
            const def = DEFAULT_WOOD_SWATCHES_FOTOS[wk];
            if (def && def.name) registerWoodEntry(def.name, '', '', '');
        });
        const ovMapNow = visualState.overridesMap || {};
        Object.keys(ovMapNow).forEach((ok) => {
            const ku = String(ok || '').trim().toUpperCase();
            if (ku.indexOf('VWOD:') !== 0) return;
            const ov = ovMapNow[ok];
            if (!ov || ov.status === 'ELIMINADO' || ov.status === 'ARCHIVADO') return;
            registerWoodEntry(ov.name || ku.slice(5), '', '', '');
        });

        const registerFabricEntry = (fabRaw, colorRaw, modelKey, modelTitle) => {
            if (isPureWoodDescriptorFotos(fabRaw)) return '';
            const fab = cleanFabricVariationNameFotos(fabRaw);
            if (!fab || fab.length < 2 || isPureDirection(fab) || isPureWoodDescriptorFotos(fab)) return '';
            const fabOvKey = compactVisualOverrideKeyFotos('VFAB:', fab);
            if (!fabOvKey) return '';
            if (!fabricsMap.has(fabOvKey)) {
                fabricsMap.set(fabOvKey, {
                    fabricKey: fab,
                    overrideKey: fabOvKey,
                    label: fab,
                    colorHint: cleanStr(colorRaw).toUpperCase(),
                    modelCount: 0,
                    moduleCount: 0,
                    sampleModels: [],
                    _models: new Set()
                });
            }
            const fRec = fabricsMap.get(fabOvKey);
            fRec.moduleCount++;
            if (modelKey && !fRec._models.has(modelKey)) {
                fRec._models.add(modelKey);
                fRec.modelCount++;
                if (modelTitle && fRec.sampleModels.length < 4) fRec.sampleModels.push(modelTitle);
            }
            return fab;
        };

        for (let i = 0; i < sourceList.length; i++) {
            const it = sourceList[i];
            const mo = cleanStr(it.mo).toUpperCase();
            const catTok = plainVisToken(it.c);
            const tpTok = plainVisToken(it.tp);
            const nomTok = plainVisToken(it.n);
            const fullTok = (catTok + ' ' + tpTok + ' ' + nomTok).trim();

            const isExt = /\bEXTERIOR\b/.test(fullTok);
            const isSala = /\b(SALA|SOFA|LOVE\s*SEAT|LOVESEAT|ESQUINERO|CHAISE|MODULAR|FUTON|FUTTON|SILLON)\b/.test(fullTok);

            // Registrar maderas de todos los productos con MADERA o COLOR DE MADERA
            const mdClean = cleanStr(it.md);
            const cmClean = cleanStr(it.cm);
            const provClean = cleanStr(it.p);
            if (mdClean || cmClean) {
                const woodTitle = (cleanStr(it.tp) || cleanStr(it.c) || 'MUEBLE') + (mo ? (' ' + mo) : '');
                const woodModelKey = plainVisToken(woodTitle) || cleanStr(it.s);
                const mdTok = plainVisToken(mdClean);
                const cmTok = plainVisToken(cmClean);
                let woodCand = '';
                if (cmTok && !FOTOS_NON_WOOD_ONLY_RE.test(cmTok) && cmTok !== 'NATURAL' && cmTok !== 'TONO NATURAL') {
                    woodCand = (mdTok && !FOTOS_NON_WOOD_ONLY_RE.test(mdTok) && cmTok.indexOf(mdTok) === -1 && mdTok !== 'MADERA')
                        ? (mdTok + ' ' + cmTok)
                        : cmTok;
                } else if (mdTok && !FOTOS_NON_WOOD_ONLY_RE.test(mdTok)) {
                    woodCand = provClean ? (mdTok + ' ' + plainVisToken(provClean)) : mdTok;
                }
                if (woodCand) {
                    registerWoodEntry(woodCand, mdClean, woodModelKey, woodTitle.toUpperCase());
                }
            }

            // Registrar telas de TODOS los productos tapizados (Sillones, Sillas, Camas, Sofás, Salas, Exterior, etc.)
            if (cleanStr(it.tl)) {
                const genericModelTitle = (cleanStr(it.tp) || cleanStr(it.c) || 'MUEBLE') + (mo ? (' ' + mo) : '');
                const genericModelKey = plainVisToken(genericModelTitle) || cleanStr(it.s);
                registerFabricEntry(it.tl, it.ct, genericModelKey, genericModelTitle.toUpperCase());
            }

            if (!mo || mo.length < 2) continue;
            if (!isSala && !isExt) continue;

            let typeKey = 'SALA_MODULAR';
            let typeLabel = 'SALA MODULAR';
            if (isExt) {
                if (/\bSALAS?\s+EN\s+L\b/.test(fullTok)) { typeKey = 'EXT_SALA_EN_L'; typeLabel = 'SALA EN L EXTERIOR'; }
                else if (/\bSOFA\s*CAMA\b/.test(fullTok)) { typeKey = 'EXT_SOFA_CAMA'; typeLabel = 'SOFÁ CAMA EXTERIOR'; }
                else { typeKey = 'EXT_SALA_MODULAR'; typeLabel = 'SALA MODULAR EXTERIOR'; }
            } else if (/\bSALAS?\s+EN\s+L\b/.test(fullTok)) {
                typeKey = 'SALA_EN_L'; typeLabel = 'SALA EN L';
            } else if (/\bSOFA\s*CAMAS?\b/.test(fullTok) || mo === 'ASHA' || mo === 'CITY') {
                typeKey = 'SOFA_CAMA'; typeLabel = 'SOFÁ CAMA';
            } else if (/\b(FUTON|FUTTON)\b/.test(fullTok)) {
                typeKey = 'FUTON'; typeLabel = 'FUTÓN';
            } else if (!/\b(MODULAR|MODULO|ESQUINERO|CHAISE|SIN\s+BRAZOS?|BRAZO\s+(?:DER|IZQ)|DERECHO|IZQUIERDO|REMATE)\b/.test(fullTok)) {
                if (/^LOVE\s*SEAT\b|^LOVESEAT\b/.test(tpTok)) { typeKey = 'LOVE_SEAT'; typeLabel = 'LOVE SEAT'; }
                else if (/^SOFA\b/.test(tpTok)) { typeKey = 'SOFA'; typeLabel = 'SOFÁ'; }
                else continue;
            }

            const gKey = 'type_' + normalizePlainLowerVis(typeKey) + '__mo_' + normalizePlainLowerVis(mo);
            const ovKey = compactVisualOverrideKeyFotos('VCOV:', gKey);
            const title = (typeLabel + ' ' + mo).toUpperCase();
            if (!coversMap.has(ovKey)) {
                coversMap.set(ovKey, {
                    groupKey: gKey,
                    overrideKey: ovKey,
                    title: title,
                    subCat: isExt ? 'EXTERIOR' : typeLabel,
                    mainCat: isExt ? 'COMPLEMENTOS' : 'SALAS',
                    isModular: 1,
                    itemCount: 0,
                    fabricCount: 0,
                    samplePhoto: it.f || '',
                    _fabrics: new Set()
                });
            }
            const cov = coversMap.get(ovKey);
            cov.itemCount++;
            if (!cov.samplePhoto && it.f) cov.samplePhoto = it.f;

            let fab = cleanFabricVariationNameFotos(it.tl);
            if (fab && (isPureDirection(fab) || isPureWoodDescriptorFotos(fab))) fab = '';
            if (!fab && cleanStr(it.vr)) {
                const parts = String(it.vr).split(/\s*[·|\/]\s*/).map(cleanFabricVariationNameFotos).filter(Boolean);
                for (let pIdx = 0; pIdx < parts.length; pIdx++) {
                    if (!isPureDirection(parts[pIdx]) && !isPureWoodDescriptorFotos(parts[pIdx])) { fab = parts[pIdx]; break; }
                }
            }
            if (!fab) {
                const ctC = cleanFabricVariationNameFotos(it.ct);
                if (ctC && !isPureDirection(ctC) && !isPureWoodDescriptorFotos(ctC)) fab = ctC;
            }
            if (fab) {
                cov._fabrics.add(fab);
                if (!cleanStr(it.tl)) {
                    registerFabricEntry(fab, it.ct, ovKey, title);
                }
            }
        }

        const covers = Array.from(coversMap.values())
            .filter((c) => c.itemCount >= 2)
            .map((c) => ({
                groupKey: c.groupKey,
                overrideKey: c.overrideKey,
                title: c.title,
                subCat: c.subCat,
                mainCat: c.mainCat,
                isModular: c.isModular,
                itemCount: c.itemCount,
                fabricCount: c._fabrics.size,
                samplePhoto: c.samplePhoto
            }))
            .sort((a, b) => (b.itemCount - a.itemCount) || a.title.localeCompare(b.title, 'es'));

        const fabrics = Array.from(fabricsMap.values())
            .map((f) => ({
                fabricKey: f.fabricKey,
                overrideKey: f.overrideKey,
                label: f.label,
                colorHint: (f.colorHint && plainVisToken(f.colorHint) !== f.fabricKey) ? f.colorHint : '',
                modelCount: f.modelCount,
                moduleCount: f.moduleCount,
                sampleModels: f.sampleModels
            }))
            .sort((a, b) => (b.moduleCount - a.moduleCount) || a.label.localeCompare(b.label, 'es'));

        const woods = Array.from(woodsMap.values())
            .map((w) => ({
                woodKey: w.woodKey,
                overrideKey: w.overrideKey,
                label: w.label,
                colorHint: (w.colorHint && plainVisToken(w.colorHint) !== w.woodKey) ? w.colorHint : '',
                modelCount: w.modelCount,
                moduleCount: w.moduleCount,
                sampleModels: w.sampleModels
            }))
            .sort((a, b) => {
                const aHas = getVisualOverridePhotoUrlInFotos(a.overrideKey) ? 0 : 1;
                const bHas = getVisualOverridePhotoUrlInFotos(b.overrideKey) ? 0 : 1;
                return (b.moduleCount - a.moduleCount) || (aHas - bHas) || a.label.localeCompare(b.label, 'es');
            });

        return { covers: covers, fabrics: fabrics, woods: woods };
    }

    function rebuildVisualTargetsCatalog() {
        let covers = [];
        let fabrics = [];
        let woods = [];
        try {
            const raw = localStorage.getItem(VISUAL_TARGETS_INDEX_STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && Array.isArray(parsed.covers) && parsed.covers.length > 0) {
                    covers = parsed.covers.slice();
                }
                if (parsed && Array.isArray(parsed.fabrics) && parsed.fabrics.length > 0) {
                    fabrics = parsed.fabrics.slice();
                }
                if (parsed && Array.isArray(parsed.woods) && parsed.woods.length > 0) {
                    woods = parsed.woods.slice();
                }
            }
        } catch (e) {}

        if (!covers.length || !fabrics.length || !woods.length) {
            const fb = buildFallbackVisualTargetsFromProducts();
            if (!covers.length) covers = fb.covers;
            if (!fabrics.length) fabrics = fb.fabrics;
            if (!woods.length) woods = fb.woods;
        }

        // Priorizar Salas Modulares, Salas en L, Sofá Camas y Exterior primero en Portadas
        covers.sort((a, b) =>
            ((b.isModular || 0) - (a.isModular || 0)) ||
            ((b.itemCount || 0) - (a.itemCount || 0)) ||
            String(a.title || '').localeCompare(String(b.title || ''), 'es')
        );

        visualState.covers = covers;
        visualState.fabrics = fabrics;
        visualState.woods = woods;

        if (visualState.workMode !== 'SKU') {
            renderVisualTargetsList();
            renderVisualTargetStage();
        }
    }

    function getActiveVisualTargetsList() {
        if (visualState.workMode === 'FABRIC') return visualState.fabrics;
        if (visualState.workMode === 'WOOD') return visualState.woods;
        return visualState.covers;
    }

    function getSelectedVisualTargetObj() {
        const list = getActiveVisualTargetsList();
        const key = String(visualState.selectedOverrideKey || '').trim().toUpperCase();
        if (!key) return null;
        return list.find((it) => String(it.overrideKey || '').toUpperCase() === key) || null;
    }

    function showVisualStageFeedback(msg, isOk) {
        const box = document.getElementById('visualStageFeedbackBox');
        if (!box) return;
        const clean = cleanStr(msg);
        if (!clean) {
            box.textContent = '';
            box.className = 'assign-feedback-banner hidden';
            return;
        }
        box.textContent = clean;
        box.className = 'assign-feedback-banner ' + (isOk ? 'is-ok' : 'is-err');
    }

    window.clearSelectedVisualTarget = function () {
        if (!visualState.selectedOverrideKey) return;
        visualState.selectedOverrideKey = '';
        showVisualStageFeedback('', true);
        renderVisualTargetsList();
        renderVisualTargetStage();
    };

    window.setFotosWorkMode = function (modeRaw) {
        const nextMode = (modeRaw === 'COVER' || modeRaw === 'FABRIC' || modeRaw === 'WOOD') ? modeRaw : 'SKU';
        visualState.workMode = nextMode;
        visualState.selectedOverrideKey = '';
        showVisualStageFeedback('', true);

        document.querySelectorAll('#fotosWorkModeBar .fotos-work-mode-btn').forEach((btn) => {
            const active = btn.getAttribute('data-work-mode') === nextMode;
            btn.classList.toggle('active', active);
            btn.setAttribute('aria-selected', active ? 'true' : 'false');
        });

        const isSku = nextMode === 'SKU';
        const skuControls = document.getElementById('skuFinderSkuControls');
        const visControls = document.getElementById('visualTargetsFinderWrap');
        const skuStage = document.getElementById('skuStageContentWrap');
        const visStage = document.getElementById('visualStageContentWrap');
        const finderTitle = document.getElementById('skuFinderPanelTitle');
        const stageTitle = document.getElementById('productStagePanelTitle');
        const modeHint = document.getElementById('fotosWorkModeHint');
        const galHint = document.getElementById('galleryQuickHint');
        const directUploadLbl = document.getElementById('btnDirectUploadLabel');
        const openCotBtn = document.getElementById('btnOpenInCotizadorStage');
        const rowBadge = document.getElementById('selectedRowBadge');
        const visSearchInp = document.getElementById('visualTargetSearchInput');

        if (skuControls) skuControls.classList.toggle('hidden', !isSku);
        if (visControls) visControls.classList.toggle('hidden', isSku);
        if (skuStage) skuStage.classList.toggle('hidden', !isSku);
        if (visStage) visStage.classList.toggle('hidden', isSku);
        if (directUploadLbl) directUploadLbl.classList.toggle('hidden', !isSku);
        if (openCotBtn && !isSku) openCotBtn.classList.add('hidden');

        if (finderTitle) {
            finderTitle.textContent = nextMode === 'COVER'
                ? 'Portadas'
                : (nextMode === 'FABRIC' ? 'Telas' : (nextMode === 'WOOD' ? 'Maderas' : 'Buscar SKU'));
        }
        if (stageTitle) {
            stageTitle.textContent = nextMode === 'COVER'
                ? 'Portada'
                : (nextMode === 'FABRIC' ? 'Tela' : (nextMode === 'WOOD' ? 'Madera' : 'Producto'));
        }
        if (modeHint) {
            modeHint.textContent = '';
            modeHint.classList.add('hidden');
        }
        if (galHint) {
            galHint.textContent = '';
            galHint.classList.add('hidden');
        }
        if (visSearchInp) {
            visSearchInp.placeholder = nextMode === 'COVER'
                ? 'Buscar modelo...'
                : (nextMode === 'WOOD' ? 'Buscar madera...' : 'Buscar tela...');
        }

        const jumpFirstBtn = document.querySelector('#mobileFotosJumpBar .mobile-jump-btn[data-jump="secSkuFinder"]');
        if (jumpFirstBtn) {
            jumpFirstBtn.textContent = nextMode === 'COVER'
                ? 'Portadas'
                : (nextMode === 'FABRIC' ? 'Telas' : (nextMode === 'WOOD' ? 'Maderas' : 'SKU'));
        }

        if (isSku) {
            applySkuFiltersAndRender();
            renderSelectedProductStage();
        } else {
            if (rowBadge) rowBadge.textContent = nextMode === 'COVER' ? 'PORTADA' : (nextMode === 'WOOD' ? 'MADERA' : 'TELA');
            loadVisualOverridesFromLocalStorage();
            rebuildVisualTargetsCatalog();
            // Seguridad: nunca pre-seleccionar automáticamente el primer elemento
            visualState.selectedOverrideKey = '';
            renderVisualTargetsList();
            renderVisualTargetStage();
            syncFotosBackNav('visual_work_mode');
        }
        updateAssignButtonState();
    };

    window.selectNextMissingPhotoTarget = function () {
        if (visualState.workMode === 'SKU') {
            const pool = (Array.isArray(state.filteredProducts) && state.filteredProducts.length)
                ? state.filteredProducts
                : state.products;
            if (!pool.length) return false;
            const curIdx = state.selectedSku
                ? pool.findIndex((p) => p && p.sku === state.selectedSku)
                : -1;
            for (let step = 1; step <= pool.length; step++) {
                const cand = pool[(curIdx + step) % pool.length];
                if (cand && !cand.photoUrl) {
                    window.selectSkuProduct(cand.sku);
                    return true;
                }
            }
            showAssignFeedback('✅ Todo con foto.', true);
            return false;
        }

        const list = getActiveVisualTargetsList();
        if (!list.length) return false;
        const curKey = String(visualState.selectedOverrideKey || '').toUpperCase();
        const curIdx = list.findIndex((it) => String(it.overrideKey || '').toUpperCase() === curKey);
        for (let step = 1; step <= list.length; step++) {
            const cand = list[(curIdx + step) % list.length];
            if (cand && !getVisualOverridePhotoUrlInFotos(cand.overrideKey)) {
                window.selectVisualTarget(cand.overrideKey);
                return true;
            }
        }
        showVisualStageFeedback('✅ Todo con foto.', true);
        return false;
    };

    window.setVisualTargetFilter = function (filterMode) {
        visualState.filterMode = (filterMode === 'NO_PHOTO' || filterMode === 'HAS_PHOTO') ? filterMode : 'ALL';
        document.querySelectorAll('#visualTargetsFinderWrap [data-visual-filter]').forEach((btn) => {
            btn.classList.toggle('active', btn.getAttribute('data-visual-filter') === visualState.filterMode);
        });
        renderVisualTargetsList();
    };

    window.clearVisualTargetSearch = function () {
        visualState.searchQuery = '';
        const inp = document.getElementById('visualTargetSearchInput');
        const clr = document.getElementById('visualTargetSearchClearBtn');
        if (inp) inp.value = '';
        if (clr) clr.classList.add('hidden');
        renderVisualTargetsList();
    };

    function renderVisualTargetsList() {
        const listEl = document.getElementById('visualTargetsList');
        const countBadge = document.getElementById('skuListCountBadge');
        if (!listEl) return;

        const isFabric = visualState.workMode === 'FABRIC';
        const isWood = visualState.workMode === 'WOOD';
        const isSwatch = isFabric || isWood;
        const rawList = getActiveVisualTargetsList();
        const qNorm = normalizeSearchText(visualState.searchQuery || '');

        const filtered = rawList.filter((item) => {
            const hasPhoto = !!getVisualOverridePhotoUrlInFotos(item.overrideKey);
            if (visualState.filterMode === 'HAS_PHOTO' && !hasPhoto) return false;
            if (visualState.filterMode === 'NO_PHOTO' && hasPhoto) return false;
            if (qNorm) {
                const hay = normalizeSearchText(
                    (item.title || item.label || '') + ' ' +
                    (item.subCat || item.colorHint || '') + ' ' +
                    (Array.isArray(item.sampleModels) ? item.sampleModels.join(' ') : '')
                );
                if (hay.indexOf(qNorm) === -1) return false;
            }
            return true;
        });

        if (countBadge && visualState.workMode !== 'SKU') {
            countBadge.textContent = String(filtered.length);
        }

        if (!filtered.length) {
            listEl.innerHTML = '<div class="empty-list-msg">Sin resultados</div>';
            return;
        }

        const prevScrollTop = Number(listEl.scrollTop) || 0;
        const selKey = String(visualState.selectedOverrideKey || '').toUpperCase();
        listEl.innerHTML = filtered.slice(0, 220).map((item) => {
            const ovKey = String(item.overrideKey || '').toUpperCase();
            const active = ovKey === selKey;
            const photoUrl = getVisualOverridePhotoUrlInFotos(ovKey);
            const thumbSrc = photoUrl ? resolveVisualThumbSrcInFotos(photoUrl, 160) : '';
            const fid = extractDriveFileId(photoUrl);
            const title = isSwatch ? (item.label || item.fabricKey || item.woodKey) : (item.title || item.groupKey);
            const sub = isSwatch
                ? ((item.colorHint ? (item.colorHint + ' · ') : '') + (item.moduleCount ? (item.moduleCount + ' pzas') : (isWood ? 'Drive Maderas' : '0 pzas')))
                : ((item.subCat ? (item.subCat + ' · ') : '') + item.itemCount + ' pzas');

            const thumbInner = thumbSrc
                ? ('<img width="44" height="44" src="' + escapeHtml(thumbSrc) + '" alt="' + escapeHtml(title) + '" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-drive-id="' + escapeHtml(fid) + '" onerror="handlePhotoImgError(this)">')
                : ('<span aria-hidden="true">' + (isFabric ? '🧵' : (isWood ? '🪵' : '🖼️')) + '</span>');

            return (
                '<button type="button" class="visual-target-item' + (active ? ' active' : '') + '" data-visual-key="' + escapeHtml(ovKey) + '" data-fotos-act="select-visual">' +
                    '<div class="visual-target-thumb' + (isSwatch ? '' : ' is-cover') + '">' + thumbInner + '</div>' +
                    '<div class="visual-target-info">' +
                        '<div class="visual-target-title">' + escapeHtml(title) + '</div>' +
                        '<div class="visual-target-sub">' + escapeHtml(sub) + '</div>' +
                    '</div>' +
                    '<span class="visual-target-pill ' + (photoUrl ? 'has-photo' : 'no-photo') + '">' + (photoUrl ? 'Foto' : 'Sin foto') + '</span>' +
                '</button>'
            );
        }).join('');
        if (prevScrollTop > 0) listEl.scrollTop = prevScrollTop;
    }

    function syncVisualStageSelectedGalleryPreview() {
        if (visualState.workMode === 'SKU') return;
        const btn = document.getElementById('btnAssignVisualGalleryPhoto');
        const curCanvas = document.getElementById('visualCurPhotoCanvas');
        const badgeEl = document.getElementById('visualPreviewBadge');
        const selPhoto = getActiveSelectedPhotoObject();
        const target = getSelectedVisualTargetObj();
        const isSwatch = visualState.workMode === 'FABRIC' || visualState.workMode === 'WOOD';

        const canAssignGallery = !!(selPhoto && target);
        if (btn) {
            btn.classList.toggle('hidden', !canAssignGallery);
            btn.disabled = !(canAssignGallery && !visualState.busy);
        }

        if (canAssignGallery && curCanvas) {
            const previewSrc = selPhoto.localDataUrl || selPhoto.thumbDataUrl || buildPhotoThumbUrl(selPhoto.id || selPhoto.viewUrl, 700);
            const fid = extractDriveFileId(selPhoto.id || selPhoto.viewUrl || '');
            if (badgeEl) badgeEl.textContent = 'Lista';
            curCanvas.onclick = null;
            curCanvas.innerHTML =
                '<img width="360" height="270" decoding="async" fetchpriority="high" src="' + escapeHtml(previewSrc) + '" alt="' + escapeHtml(selPhoto.name || 'Vista') + '" referrerpolicy="no-referrer" ' +
                'data-drive-id="' + escapeHtml(fid) + '" onerror="handlePhotoImgError(this)" ' +
                'style="' + (isSwatch ? 'width:100%;height:100%;object-fit:cover;' : 'width:auto;height:auto;max-width:100%;max-height:100%;object-fit:contain;') + '">';
        } else if (!canAssignGallery) {
            renderVisualTargetStage(true);
        }
    }

    function renderVisualTargetStage(skipGallerySync) {
        const eyebrow = document.getElementById('visualStageEyebrow');
        const titleEl = document.getElementById('visualStageTitle');
        const subEl = document.getElementById('visualStageSub');
        const badgeEl = document.getElementById('visualPreviewBadge');
        const curCanvas = document.getElementById('visualCurPhotoCanvas');
        const delBtn = document.getElementById('visualCurDeleteBtn');
        const clearBtn = document.getElementById('btnClearSelectedVisual');
        const urlInp = document.getElementById('visualTargetUrlInput');
        const isFabric = visualState.workMode === 'FABRIC';
        const isWood = visualState.workMode === 'WOOD';
        const isSwatch = isFabric || isWood;
        const target = getSelectedVisualTargetObj();

        if (!target) {
            if (eyebrow) eyebrow.textContent = isFabric ? 'Tela' : (isWood ? 'Madera' : 'Portada');
            if (titleEl) titleEl.textContent = isFabric ? 'Elige tela' : (isWood ? 'Elige madera' : 'Elige modelo');
            if (subEl) subEl.textContent = isFabric ? 'Tela' : (isWood ? 'Madera' : 'Solo inicio');
            if (badgeEl) badgeEl.textContent = 'Foto';
            if (curCanvas) {
                curCanvas.onclick = null;
                curCanvas.innerHTML = '<div class="photo-empty-placeholder">Toca o arrastra</div>';
            }
            if (delBtn) delBtn.classList.add('hidden');
            if (clearBtn) clearBtn.classList.add('hidden');
            if (urlInp) urlInp.value = '';
            if (!skipGallerySync) syncVisualStageSelectedGalleryPreview();
            return;
        }

        if (clearBtn) clearBtn.classList.remove('hidden');
        const label = isSwatch ? (target.label || target.fabricKey || target.woodKey) : (target.title || target.groupKey);
        const curUrl = getVisualOverridePhotoUrlInFotos(target.overrideKey);
        const curThumb = curUrl ? resolveVisualThumbSrcInFotos(curUrl, 700) : '';
        const curFid = extractDriveFileId(curUrl);

        if (eyebrow) {
            eyebrow.textContent = isFabric ? 'Tela' : (isWood ? 'Madera' : 'Portada');
        }
        if (titleEl) titleEl.textContent = label;
        if (subEl) {
            if (isSwatch) {
                subEl.textContent = target.moduleCount
                    ? (target.moduleCount + ' pzas · ' + target.modelCount + (target.modelCount === 1 ? ' modelo' : ' modelos'))
                    : (isWood ? 'Catálogo Maderas Drive' : '0 pzas');
            } else {
                subEl.textContent = (target.subCat ? (target.subCat + ' · ') : '') + target.itemCount + ' pzas';
            }
        }
        if (curCanvas) {
            if (curThumb) {
                if (badgeEl) badgeEl.textContent = 'Foto';
                curCanvas.onclick = null;
                curCanvas.innerHTML =
                    '<img width="360" height="270" decoding="async" fetchpriority="high" src="' + escapeHtml(curThumb) + '" alt="' + escapeHtml(label) + '" referrerpolicy="no-referrer" ' +
                    'data-drive-id="' + escapeHtml(curFid) + '" onerror="handlePhotoImgError(this)" ' +
                    'style="' + (isSwatch ? 'width:100%;height:100%;object-fit:cover;' : 'width:auto;height:auto;max-width:100%;max-height:100%;object-fit:contain;') + '" ' +
                    'data-fotos-act="lightbox" data-lightbox-src="' + escapeHtml(curThumb) + '">';
            } else {
                if (badgeEl) badgeEl.textContent = 'Sin foto';
                curCanvas.innerHTML = '<div class="photo-empty-placeholder">Toca o arrastra</div>';
                curCanvas.onclick = function () {
                    const inp = document.getElementById('visualTargetFileInput');
                    if (inp) inp.click();
                };
            }
        }
        if (delBtn) delBtn.classList.toggle('hidden', !curUrl);
        if (urlInp) urlInp.value = curUrl || '';
        if (!skipGallerySync) syncVisualStageSelectedGalleryPreview();
    }

    window.selectVisualTarget = function (overrideKey) {
        visualState.selectedOverrideKey = String(overrideKey || '').trim().toUpperCase();
        showVisualStageFeedback('', true);
        renderVisualTargetsList();
        renderVisualTargetStage();
    };

    function optimizeVisualFileForMode(file, isFabric) {
        if (!isFabric) {
            return readFileAsOptimizedDataUrl(file);
        }
        // Tela / Swatch: conservar textura completa (sin recortar bordes blancos) hasta 640px
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
            reader.onload = () => {
                const rawResult = String(reader.result || '');
                const isHeic = isHeicImageFile(file);
                const rawUrl = normalizeImageDataUrl(rawResult, (file && file.name) || 'tela.jpg');
                if (typeof Image === 'undefined') { resolve(rawUrl); return; }
                const img = new Image();
                img.onerror = () => {
                    if (isHeic) {
                        const heicMime = /\.heif$/i.test(cleanStr(file && file.name)) ? 'image/heif' : 'image/heic';
                        const safeHeic = rawUrl.replace(/^data:[^;]*;base64,/i, 'data:' + heicMime + ';base64,');
                        showVisualStageFeedback('⚠️ Imagen HEIC sin decodificar en este navegador; se enviará original (' + heicMime + ').', false);
                        resolve(safeHeic);
                        return;
                    }
                    resolve(rawUrl);
                };
                img.onload = () => {
                    let c = null;
                    try {
                        const nw = img.naturalWidth || img.width || 1;
                        const nh = img.naturalHeight || img.height || 1;
                        const cap = 640;
                        const sc = Math.min(1, cap / Math.max(nw, nh));
                        const tw = Math.max(1, Math.round(nw * sc));
                        const th = Math.max(1, Math.round(nh * sc));
                        c = document.createElement('canvas');
                        c.width = tw;
                        c.height = th;
                        const ctx = c.getContext('2d');
                        ctx.fillStyle = '#FFFFFF';
                        ctx.fillRect(0, 0, tw, th);
                        ctx.imageSmoothingEnabled = true;
                        ctx.imageSmoothingQuality = 'high';
                        ctx.drawImage(img, 0, 0, tw, th);
                        resolve(c.toDataURL('image/jpeg', 0.84));
                    } catch (eC) {
                        resolve(rawUrl);
                    } finally {
                        if (c) {
                            try { c.width = 0; c.height = 0; } catch (eRel) {}
                        }
                    }
                };
                img.src = rawUrl;
            };
            reader.readAsDataURL(file);
        });
    }

    async function persistVisualPhotoOverrideFromFotos(target, photoUrl, opMode) {
        if (!target || !target.overrideKey) return { ok: false, error: 'Elige primero.' };
        const isFabric = visualState.workMode === 'FABRIC';
        const isWood = visualState.workMode === 'WOOD';
        const isSwatch = isFabric || isWood;
        const ovKey = String(target.overrideKey).trim().toUpperCase();
        const op = opMode === 'DELETE' ? 'DELETE' : 'SAVE';
        const nextUrl = op === 'DELETE' ? '' : cleanStr(photoUrl);
        if (op === 'SAVE' && /^blob:/i.test(nextUrl)) {
            return { ok: false, error: 'URL temporal inválida; vuelve a subir la imagen.' };
        }
        const label = isSwatch ? (target.label || target.fabricKey || target.woodKey) : (target.title || target.groupKey);
        const categoryTag = isFabric ? 'FABRIC_SWATCH' : (isWood ? 'WOOD_SWATCH' : 'VISUAL_COVER');
        const targetKindTag = isFabric ? 'TELA' : (isWood ? 'MADERA' : 'PORTADA');
        const destFolderTag = isFabric ? 'Tela' : (isWood ? 'Madera' : 'Portada');

        const localEntry = op === 'DELETE' ? null : {
            sku: ovKey,
            status: 'VISIBLE',
            name: cleanStr(label).slice(0, 140),
            category: categoryTag,
            price: null,
            note: nextUrl,
            updatedBy: OWNER_EMAIL,
            updatedAt: new Date().toLocaleString('es-MX')
        };

        if (op === 'DELETE') {
            const deletedPrev = visualState.overridesMap[ovKey];
            const deletedPrevUrl = deletedPrev ? cleanStr(deletedPrev.note) : '';
            const deletedPrevFid = deletedPrev ? (cleanStr(deletedPrev.localFileId) || extractDriveFileId(deletedPrevUrl)) : '';
            if (isWood && DEFAULT_WOOD_SWATCHES_FOTOS[ovKey]) {
                visualState.overridesMap[ovKey] = {
                    sku: ovKey,
                    status: 'ELIMINADO',
                    name: cleanStr(label).slice(0, 140),
                    category: 'WOOD_SWATCH',
                    price: null,
                    note: '',
                    updatedBy: OWNER_EMAIL,
                    updatedAt: new Date().toLocaleString('es-MX')
                };
            } else {
                delete visualState.overridesMap[ovKey];
            }
            const cleanedQ = readFotosOfflineOutbox().filter((it) => {
                if (!it) return false;
                if (it.type === 'visual_override_upload' && cleanStr(it.overrideKey).toUpperCase() === ovKey) {
                    if (it.localFileId) deleteOfflinePhotoBlobIdb(it.localFileId);
                    return false;
                }
                return true;
            });
            writeFotosOfflineOutbox(cleanedQ);
            const cleanedRecents = readRecentUploadsStore().filter((it) => {
                if (!it) return false;
                if (cleanStr(it.targetKey).toUpperCase() === ovKey) return false;
                if (deletedPrevFid && cleanStr(it.id) === deletedPrevFid) return false;
                return true;
            });
            writeRecentUploadsStore(cleanedRecents);
            if (typeof renderRecentUploadedStrip === 'function') {
                renderRecentUploadedStrip();
            }
        } else {
            visualState.overridesMap[ovKey] = localEntry;
        }
        saveVisualOverridesToLocalStorage();
        invalidateLoadedPhotosCache();
        broadcastVisualOverrideUpdateToCotizador(ovKey, localEntry, op === 'DELETE');
        renderVisualTargetsList();
        renderVisualTargetStage();
        if (op === 'SAVE' && nextUrl) {
            recordRecentUploadedPhoto({
                viewUrl: nextUrl,
                targetKey: ovKey,
                targetLabel: label,
                targetKind: targetKindTag,
                destFolderName: destFolderTag,
                ts: Date.now()
            });
        } else {
            renderInboxGallery();
        }

        const isOfflineNow = typeof navigator !== 'undefined' && navigator.onLine === false;
        if (isOfflineNow && op === 'SAVE' && nextUrl) {
            enqueueFotosOfflineOutbox({
                id: 'op_vis_' + Date.now() + '_' + ovKey,
                type: 'visual_override_upload',
                overrideKey: ovKey,
                label: label,
                categoryTag: categoryTag,
                directUrl: nextUrl,
                queuedAt: Date.now()
            });
            return { ok: true, offlineQueued: true };
        }

        try {
            const auth = buildOwnerAuthPayload();
            const res = await callWebAppPost('inv_product_override_save', Object.assign({
                sku: ovKey,
                op: op === 'DELETE' ? 'DELETE' : 'RESTORE',
                name: cleanStr(label).slice(0, 140),
                category: categoryTag,
                price: '',
                note: nextUrl
            }, auth), 22000);
            if (res && res.ok) {
                if (op !== 'DELETE' && res.override) {
                    visualState.overridesMap[ovKey] = res.override;
                    saveVisualOverridesToLocalStorage();
                    invalidateLoadedPhotosCache();
                    broadcastVisualOverrideUpdateToCotizador(ovKey, res.override, false);
                    renderInboxGallery();
                }
                return { ok: true };
            }
            if (res && res.unavailable && op === 'SAVE' && nextUrl) {
                enqueueFotosOfflineOutbox({
                    id: 'op_vis_' + Date.now() + '_' + ovKey,
                    type: 'visual_override_upload',
                    overrideKey: ovKey,
                    label: label,
                    categoryTag: categoryTag,
                    directUrl: nextUrl,
                    queuedAt: Date.now()
                });
                return { ok: true, offlineQueued: true };
            }
            return { ok: false, error: (res && res.error) || 'Guardado local.' };
        } catch (err) {
            return { ok: false, error: (err && err.message) || 'Guardado local.' };
        }
    }

    window.uploadVisualTargetPhotoFile = async function (inputEl) {
        const file = inputEl && inputEl.files && inputEl.files[0];
        if (!file || visualState.busy) return;
        const target = getSelectedVisualTargetObj();
        if (!target) {
            showVisualStageFeedback('Elige primero de la lista.', false);
            if (inputEl) inputEl.value = '';
            return;
        }
        const isFabric = visualState.workMode === 'FABRIC';
        const isWood = visualState.workMode === 'WOOD';
        const isSwatch = isFabric || isWood;
        const label = isSwatch ? (target.label || target.fabricKey || target.woodKey) : (target.title || target.groupKey);
        const ovKey = String(target.overrideKey).trim().toUpperCase();
        const categoryTag = isFabric ? 'FABRIC_SWATCH' : (isWood ? 'WOOD_SWATCH' : 'VISUAL_COVER');
        const kindParam = isFabric ? 'fabric' : (isWood ? 'wood' : 'cover');
        const targetKindTag = isFabric ? 'TELA' : (isWood ? 'MADERA' : 'PORTADA');
        const destFolderTag = isFabric ? 'Tela' : (isWood ? 'Madera' : 'Portada');
        const safeFileName = cleanStr(file.name) || ((isFabric ? 'tela_' : (isWood ? 'madera_' : 'portada_')) + Date.now() + '.jpg');
        const localVisId = 'local_vis_' + Date.now() + '_' + Math.floor(Math.random() * 9000 + 1000);
        const hasPrevOverride = Object.prototype.hasOwnProperty.call(visualState.overridesMap, ovKey);
        const prevOverrideBeforeSave = hasPrevOverride ? visualState.overridesMap[ovKey] : null;
        const rollbackVisualUpload = () => {
            if (hasPrevOverride && prevOverrideBeforeSave) {
                visualState.overridesMap[ovKey] = prevOverrideBeforeSave;
            } else {
                delete visualState.overridesMap[ovKey];
            }
            saveVisualOverridesToLocalStorage();
            invalidateLoadedPhotosCache();
            broadcastVisualOverrideUpdateToCotizador(ovKey, prevOverrideBeforeSave, !hasPrevOverride);
            renderVisualTargetsList();
            renderVisualTargetStage();
            renderInboxGallery();
        };

        visualState.busy = true;
        showVisualStageFeedback('⚡ Subiendo ' + label + '...', true);

        try {
            const dataUrl = await optimizeVisualFileForMode(file, isSwatch);
            const optimisticEntry = {
                sku: ovKey,
                status: 'VISIBLE',
                name: cleanStr(label).slice(0, 140),
                category: categoryTag,
                price: null,
                note: dataUrl,
                localFileId: localVisId,
                updatedBy: OWNER_EMAIL,
                updatedAt: new Date().toLocaleString('es-MX')
            };

            // Actualización optimista inmediata en Cotizador + quitar selección para no sobrescribir por error
            visualState.overridesMap[ovKey] = optimisticEntry;
            saveVisualOverridesToLocalStorage();
            broadcastVisualOverrideUpdateToCotizador(ovKey, optimisticEntry, false);
            visualState.selectedOverrideKey = '';
            state.selectedInboxFileId = '';
            state.selectedPhotoItem = null;
            renderVisualTargetsList();
            renderVisualTargetStage();
            updateGallerySelectionInDom();

            const isOfflineNow = typeof navigator !== 'undefined' && navigator.onLine === false;
            if (isOfflineNow) {
                await putOfflinePhotoBlobIdb(localVisId, dataUrl, safeFileName);
                enqueueFotosOfflineOutbox({
                    id: 'op_vis_' + Date.now() + '_' + ovKey,
                    type: 'visual_override_upload',
                    overrideKey: ovKey,
                    label: label,
                    categoryTag: categoryTag,
                    fileName: safeFileName,
                    localFileId: localVisId,
                    queuedAt: Date.now()
                });
                showVisualStageFeedback('⚡ En cola offline: ' + label + ' (se subirá al volver la red).', true);
                return;
            }

            const auth = buildOwnerAuthPayload();
            let res = await callWebAppPost('fotos_upload_visual_override', Object.assign({
                overrideKey: ovKey,
                kind: kindParam,
                label: label,
                categoryTag: categoryTag,
                fileName: safeFileName,
                dataUrl: dataUrl
            }, auth), 45000);

            if (res && !res.ok && /Acci[óo]n no reconocida/i.test(cleanStr(res.error))) {
                const upRes = await callWebAppPost('inv_upload_product_photo', Object.assign({
                    advisorName: 'Kevin Reyna',
                    sku: ovKey,
                    fileName: safeFileName,
                    productName: (isFabric ? 'TELA ' : (isWood ? 'MADERA ' : 'PORTADA ')) + label,
                    categoria: isFabric ? 'TELAS' : (isWood ? 'MADERAS' : 'SALAS'),
                    tipo: targetKindTag,
                    targetFolderId: VISUAL_UPLOAD_DRIVE_FOLDER_ID,
                    driveOnly: true,
                    skipSheetWrite: true,
                    skipCategoryCopy: true,
                    dataUrl: dataUrl
                }, auth), 40000);
                const fidFb = cleanStr((upRes && upRes.fileId) || (upRes && upRes.driveUrl && extractDriveFileId(upRes.driveUrl)));
                const urlFb = cleanStr(upRes && upRes.driveUrl) || (fidFb ? ('https://drive.google.com/file/d/' + fidFb + '/view?usp=sharing') : '');
                if (upRes && upRes.ok && urlFb) {
                    const saveFb = await persistVisualPhotoOverrideFromFotos(target, urlFb, 'SAVE');
                    res = saveFb.ok ? { ok: true, driveUrl: urlFb, fileId: fidFb } : { ok: false, error: saveFb.error };
                } else {
                    res = upRes;
                }
            }

            if (!res || !res.ok) {
                if (res && res.authRequired && !res.rateLimited) {
                    rollbackVisualUpload();
                    window.lockFotosPortal();
                    return;
                }
                if (res && (res.unavailable || res.rateLimited)) {
                    if (res.rateLimited) {
                        _inboxRateLimitBackoffUntilMs = Date.now() + RATE_LIMIT_BACKOFF_MS;
                        setFotosLiveStatus('syncing', 'Sincronizando...');
                    }
                    await putOfflinePhotoBlobIdb(localVisId, dataUrl, safeFileName);
                    enqueueFotosOfflineOutbox({
                        id: 'op_vis_' + Date.now() + '_' + ovKey,
                        type: 'visual_override_upload',
                        overrideKey: ovKey,
                        label: label,
                        categoryTag: categoryTag,
                        fileName: safeFileName,
                        localFileId: localVisId,
                        queuedAt: Date.now()
                    });
                    showVisualStageFeedback(
                        res.rateLimited
                            ? ('⏳ Sincronizando en segundo plano: ' + label + '.')
                            : ('⚡ Sin red · en cola: ' + label + '.'),
                        true
                    );
                    return;
                }
                rollbackVisualUpload();
                showVisualStageFeedback('❌ ' + ((res && res.error) || 'Error al subir.'), false);
                return;
            }
            const finalDriveUrl = cleanStr(res.driveUrl || res.newUrl);
            const finalOverride = res.override || Object.assign({}, optimisticEntry, { note: finalDriveUrl || dataUrl });
            visualState.overridesMap[ovKey] = finalOverride;
            if (res.fileId) {
                state.loadedFileNamesById[res.fileId] = cleanStr(res.fileName || safeFileName);
            }
            if (typeof res.rev === 'string' && res.rev) {
                state.inboxRev = cleanStr(res.rev);
            }
            if (Array.isArray(res.recentUploads)) {
                mergeSharedRecentUploadsFromServer(res.recentUploads);
            }
            recordRecentUploadedPhoto({
                fileId: cleanStr(res.fileId || extractDriveFileId(finalDriveUrl) || localVisId),
                viewUrl: finalDriveUrl,
                fileName: cleanStr(res.fileName || safeFileName),
                targetKey: ovKey,
                targetLabel: label,
                targetKind: targetKindTag,
                localDataUrl: dataUrl,
                destFolderName: destFolderTag,
                ts: Date.now()
            });
            saveVisualOverridesToLocalStorage();
            invalidateLoadedPhotosCache();
            broadcastVisualOverrideUpdateToCotizador(ovKey, finalOverride, false);
            notifyFotosInboxChanged('upload_visual');
            renderVisualTargetsList();
            renderInboxGallery();
            showVisualStageFeedback('✅ ' + label + ' guardada.', true);
        } catch (err) {
            rollbackVisualUpload();
            showVisualStageFeedback('❌ ' + ((err && err.message) || 'Error al subir.'), false);
        } finally {
            visualState.busy = false;
            if (inputEl) {
                try { inputEl.value = ''; } catch (eClr) {}
            }
            syncVisualStageSelectedGalleryPreview();
        }
    };

    window.assignGalleryPhotoToVisualTarget = async function () {
        if (visualState.busy) return;
        const target = getSelectedVisualTargetObj();
        const selPhoto = getActiveSelectedPhotoObject();
        if (!target || !selPhoto) return;

        const isFabric = visualState.workMode === 'FABRIC';
        const isWood = visualState.workMode === 'WOOD';
        const isSwatch = isFabric || isWood;
        const label = isSwatch ? (target.label || target.fabricKey || target.woodKey) : (target.title || target.groupKey);
        const ovKey = String(target.overrideKey).trim().toUpperCase();
        const categoryTag = isFabric ? 'FABRIC_SWATCH' : (isWood ? 'WOOD_SWATCH' : 'VISUAL_COVER');
        const kindParam = isFabric ? 'fabric' : (isWood ? 'wood' : 'cover');
        const targetKindTag = isFabric ? 'TELA' : (isWood ? 'MADERA' : 'PORTADA');
        const destFolderTag = isFabric ? 'Tela' : (isWood ? 'Madera' : 'Portada');
        const fromLoaded = !!selPhoto.fromLoaded;
        const rawPhotoId = cleanStr(selPhoto.id);
        let activePhotoId = rawPhotoId;
        let isLocal = isLocalTempPhotoId(activePhotoId);
        let directUrl = cleanStr(selPhoto.viewUrl) || (!isLocal && activePhotoId ? ('https://drive.google.com/file/d/' + activePhotoId + '/view?usp=sharing') : '');
        const optimisticPreview = (selPhoto.localDataUrl && String(selPhoto.localDataUrl).indexOf('data:image/') === 0)
            ? String(selPhoto.localDataUrl)
            : directUrl;

        const hasPrevOverride = Object.prototype.hasOwnProperty.call(visualState.overridesMap, ovKey);
        const prevOverrideBeforeSave = hasPrevOverride ? visualState.overridesMap[ovKey] : null;
        const prevRawInboxItem = (!fromLoaded && rawPhotoId) ? (state.rawInboxFromDrive.find((f) => f && f.id === rawPhotoId) || null) : null;
        const prevInboxItem = (!fromLoaded && rawPhotoId) ? (state.inboxFiles.find((f) => f && f.id === rawPhotoId) || null) : null;
        const prevNuevasItem = (!fromLoaded && rawPhotoId) ? (state.fotosNuevasSheetItems.find((f) => f && f.id === rawPhotoId) || null) : null;
        const rollbackVisualAssign = () => {
            if (hasPrevOverride && prevOverrideBeforeSave) {
                visualState.overridesMap[ovKey] = prevOverrideBeforeSave;
            } else {
                delete visualState.overridesMap[ovKey];
            }
            if (prevRawInboxItem && !state.rawInboxFromDrive.some((f) => f && f.id === rawPhotoId)) {
                state.rawInboxFromDrive = [prevRawInboxItem].concat(state.rawInboxFromDrive);
            }
            if (prevInboxItem && !state.inboxFiles.some((f) => f && f.id === rawPhotoId)) {
                state.inboxFiles = [prevInboxItem].concat(state.inboxFiles);
            }
            if (prevNuevasItem && !state.fotosNuevasSheetItems.some((f) => f && f.id === rawPhotoId)) {
                state.fotosNuevasSheetItems = [prevNuevasItem].concat(state.fotosNuevasSheetItems);
            }
            saveVisualOverridesToLocalStorage();
            invalidateLoadedPhotosCache();
            broadcastVisualOverrideUpdateToCotizador(ovKey, prevOverrideBeforeSave, !hasPrevOverride);
            renderInboxGallery();
            renderVisualTargetsList();
            renderVisualTargetStage();
        };

        visualState.busy = true;
        showVisualStageFeedback('⚡ Guardando ' + label + '...', true);

        try {
            const optimisticEntry = {
                sku: ovKey,
                status: 'VISIBLE',
                name: cleanStr(label).slice(0, 140),
                category: categoryTag,
                price: null,
                note: optimisticPreview || directUrl,
                localFileId: isLocal ? activePhotoId : '',
                updatedBy: OWNER_EMAIL,
                updatedAt: new Date().toLocaleString('es-MX')
            };

            if (optimisticPreview || directUrl) {
                visualState.overridesMap[ovKey] = optimisticEntry;
                saveVisualOverridesToLocalStorage();
                broadcastVisualOverrideUpdateToCotizador(ovKey, optimisticEntry, false);
            }

            // Remover de bandeja SUBIR PREN si venía de extracción + limpiar selección para evitar errores
            if (!fromLoaded && rawPhotoId) {
                state.rawInboxFromDrive = state.rawInboxFromDrive.filter((f) => f.id !== rawPhotoId);
                state.inboxFiles = state.inboxFiles.filter((f) => f.id !== rawPhotoId);
                state.fotosNuevasSheetItems = state.fotosNuevasSheetItems.filter((f) => f.id !== rawPhotoId);
            }
            visualState.selectedOverrideKey = '';
            state.selectedInboxFileId = '';
            state.selectedPhotoItem = null;
            renderInboxGallery();
            renderVisualTargetsList();
            renderVisualTargetStage();

            if (isLocal && pendingUploadPromises.has(rawPhotoId)) {
                try {
                    const pendingUp = await pendingUploadPromises.get(rawPhotoId);
                    if (pendingUp && pendingUp.ok && pendingUp.file && pendingUp.file.id) {
                        activePhotoId = cleanStr(pendingUp.file.id);
                        isLocal = isLocalTempPhotoId(activePhotoId);
                        directUrl = cleanStr(pendingUp.file.viewUrl) || ('https://drive.google.com/file/d/' + activePhotoId + '/view?usp=sharing');
                    }
                } catch (eWait) {}
            }

            const isOfflineNow = typeof navigator !== 'undefined' && navigator.onLine === false;
            if (isOfflineNow) {
                let localVisId = isLocal ? activePhotoId : '';
                if (!localVisId && optimisticPreview && optimisticPreview.indexOf('data:image/') === 0) {
                    localVisId = 'local_vis_' + Date.now() + '_' + Math.floor(Math.random() * 9000 + 1000);
                    await putOfflinePhotoBlobIdb(localVisId, optimisticPreview, cleanStr(selPhoto.name));
                }
                enqueueFotosOfflineOutbox({
                    id: 'op_vis_' + Date.now() + '_' + ovKey,
                    type: 'visual_override_upload',
                    overrideKey: ovKey,
                    label: label,
                    categoryTag: categoryTag,
                    fileName: cleanStr(selPhoto.name),
                    localFileId: localVisId,
                    sourceInboxFileId: activePhotoId,
                    shortcutId: cleanStr(selPhoto.shortcutId),
                    fromLoaded: fromLoaded,
                    directUrl: isLocal ? '' : directUrl,
                    queuedAt: Date.now()
                });
                showVisualStageFeedback('⚡ En cola offline: ' + label + '.', true);
                return;
            }

            const auth = buildOwnerAuthPayload();
            let res = await callWebAppPost('fotos_upload_visual_override', Object.assign({
                overrideKey: ovKey,
                kind: kindParam,
                label: label,
                categoryTag: categoryTag,
                fileName: cleanStr(selPhoto.name),
                sourceInboxFileId: isLocal ? '' : activePhotoId,
                shortcutId: cleanStr(selPhoto.shortcutId),
                fromLoaded: fromLoaded,
                dataUrl: isLocal ? cleanStr(selPhoto.localDataUrl) : ''
            }, auth), 45000);

            if (res && !res.ok && /Acci[óo]n no reconocida/i.test(cleanStr(res.error))) {
                let finalUrl = directUrl;
                if (!finalUrl && selPhoto.localDataUrl) {
                    const upRes = await callWebAppPost('inv_upload_product_photo', Object.assign({
                        advisorName: 'Kevin Reyna',
                        sku: ovKey,
                        fileName: cleanStr(selPhoto.name),
                        productName: (isFabric ? 'TELA ' : (isWood ? 'MADERA ' : 'PORTADA ')) + label,
                        categoria: isFabric ? 'TELAS' : (isWood ? 'MADERAS' : 'SALAS'),
                        tipo: targetKindTag,
                        targetFolderId: VISUAL_UPLOAD_DRIVE_FOLDER_ID,
                        driveOnly: true,
                        skipSheetWrite: true,
                        skipCategoryCopy: true,
                        dataUrl: selPhoto.localDataUrl
                    }, auth), 40000);
                    const fidFb = cleanStr((upRes && upRes.fileId) || (upRes && upRes.driveUrl && extractDriveFileId(upRes.driveUrl)));
                    finalUrl = cleanStr(upRes && upRes.driveUrl) || (fidFb ? ('https://drive.google.com/file/d/' + fidFb + '/view?usp=sharing') : '');
                }
                if (finalUrl) {
                    const saveFb = await persistVisualPhotoOverrideFromFotos(target, finalUrl, 'SAVE');
                    res = saveFb.ok ? { ok: true, driveUrl: finalUrl } : { ok: false, error: saveFb.error };
                }
            }

            if (!res || !res.ok) {
                if (res && res.authRequired && !res.rateLimited) {
                    rollbackVisualAssign();
                    window.lockFotosPortal();
                    return;
                }
                if (res && (res.unavailable || res.rateLimited)) {
                    if (res.rateLimited) {
                        _inboxRateLimitBackoffUntilMs = Date.now() + RATE_LIMIT_BACKOFF_MS;
                        setFotosLiveStatus('syncing', 'Sincronizando...');
                    }
                    let localVisId = isLocal ? activePhotoId : '';
                    if (!localVisId && optimisticPreview && optimisticPreview.indexOf('data:image/') === 0) {
                        localVisId = 'local_vis_' + Date.now() + '_' + Math.floor(Math.random() * 9000 + 1000);
                        await putOfflinePhotoBlobIdb(localVisId, optimisticPreview, cleanStr(selPhoto.name));
                    }
                    enqueueFotosOfflineOutbox({
                        id: 'op_vis_' + Date.now() + '_' + ovKey,
                        type: 'visual_override_upload',
                        overrideKey: ovKey,
                        label: label,
                        categoryTag: categoryTag,
                        fileName: cleanStr(selPhoto.name),
                        localFileId: localVisId,
                        sourceInboxFileId: activePhotoId,
                        shortcutId: cleanStr(selPhoto.shortcutId),
                        fromLoaded: fromLoaded,
                        directUrl: isLocal ? '' : directUrl,
                        queuedAt: Date.now()
                    });
                    showVisualStageFeedback(
                        res.rateLimited
                            ? ('⏳ Sincronizando en segundo plano: ' + label + '.')
                            : ('⚡ Sin red · en cola: ' + label + '.'),
                        true
                    );
                    return;
                }
                rollbackVisualAssign();
                showVisualStageFeedback('❌ ' + ((res && res.error) || 'Error al guardar.'), false);
                return;
            }
            const finalDriveUrl = cleanStr(res.driveUrl || res.newUrl || directUrl);
            const finalOverride = res.override || Object.assign({}, optimisticEntry, { note: finalDriveUrl });
            visualState.overridesMap[ovKey] = finalOverride;
            if (res.fileId) {
                state.loadedFileNamesById[res.fileId] = cleanStr(res.fileName || selPhoto.name);
            }
            if (typeof res.rev === 'string' && res.rev) {
                state.inboxRev = cleanStr(res.rev);
            }
            if (Array.isArray(res.recentUploads)) {
                mergeSharedRecentUploadsFromServer(res.recentUploads);
            }
            recordRecentUploadedPhoto({
                fileId: cleanStr(res.fileId || extractDriveFileId(finalDriveUrl) || activePhotoId),
                viewUrl: finalDriveUrl,
                fileName: cleanStr(res.fileName || selPhoto.name),
                targetKey: ovKey,
                targetLabel: label,
                targetKind: targetKindTag,
                localDataUrl: cleanStr(selPhoto.localDataUrl || ''),
                destFolderName: destFolderTag,
                ts: Date.now()
            });
            saveVisualOverridesToLocalStorage();
            invalidateLoadedPhotosCache();
            broadcastVisualOverrideUpdateToCotizador(ovKey, finalOverride, false);
            notifyFotosInboxChanged('assign_visual');
            renderVisualTargetsList();
            renderInboxGallery();
            showVisualStageFeedback('✅ ' + label + ' guardada.', true);
        } catch (err) {
            rollbackVisualAssign();
            showVisualStageFeedback('❌ ' + ((err && err.message) || 'Error.'), false);
        } finally {
            visualState.busy = false;
            syncVisualStageSelectedGalleryPreview();
        }
    };

    window.saveVisualTargetPhotoUrl = async function () {
        if (visualState.busy) return;
        const target = getSelectedVisualTargetObj();
        const urlInp = document.getElementById('visualTargetUrlInput');
        const url = cleanStr(urlInp && urlInp.value);
        if (!target) {
            showVisualStageFeedback('Elige primero.', false);
            return;
        }
        if (!/^https?:\/\//i.test(url)) {
            showVisualStageFeedback('Link inválido.', false);
            return;
        }
        visualState.busy = true;
        showVisualStageFeedback('Guardando...', true);
        try {
            const saveRes = await persistVisualPhotoOverrideFromFotos(target, url, 'SAVE');
            visualState.selectedOverrideKey = '';
            renderVisualTargetsList();
            renderVisualTargetStage();
            showVisualStageFeedback(saveRes.ok ? '✅ Guardado.' : (saveRes.error || 'Guardado local.'), true);
        } finally {
            visualState.busy = false;
            syncVisualStageSelectedGalleryPreview();
        }
    };

    window.deleteSelectedVisualPhotoOverride = async function () {
        if (visualState.busy) return;
        const target = getSelectedVisualTargetObj();
        if (!target) return;
        visualState.busy = true;
        showVisualStageFeedback('Quitando...', true);
        try {
            const saveRes = await persistVisualPhotoOverrideFromFotos(target, '', 'DELETE');
            showVisualStageFeedback(saveRes.ok ? '✅ Eliminada.' : (saveRes.error || 'Eliminada local.'), true);
        } finally {
            visualState.busy = false;
            syncVisualStageSelectedGalleryPreview();
        }
    };

    window.__CREATA_FOTOS_VISUAL_TEST__ = {
        compactVisualOverrideKeyFotos: compactVisualOverrideKeyFotos,
        cleanFabricVariationNameFotos: cleanFabricVariationNameFotos,
        isPureWoodDescriptorFotos: isPureWoodDescriptorFotos,
        DEFAULT_WOOD_SWATCHES_FOTOS: DEFAULT_WOOD_SWATCHES_FOTOS,
        getVisualOverridePhotoUrlInFotos: getVisualOverridePhotoUrlInFotos,
        buildFallbackVisualTargetsFromProducts: buildFallbackVisualTargetsFromProducts,
        findMatchingUploadedFabricForProduct: findMatchingUploadedFabricForProduct,
        rebuildVisualTargetsCatalog: rebuildVisualTargetsCatalog,
        recordRecentUploadedPhoto: recordRecentUploadedPhoto,
        getRecentUploadedPhotosList: getRecentUploadedPhotosList,
        getLoadedPhotosList: getLoadedPhotosList,
        isTransientLockError: isTransientLockError,
        getVisualState: function () { return visualState; }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initFotosApp);
    } else {
        initFotosApp();
    }
