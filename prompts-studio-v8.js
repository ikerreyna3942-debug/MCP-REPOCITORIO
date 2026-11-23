(function () {
    'use strict';

    const GEMINI_KEY_STORAGE = 'creata_prompts_gemini_key_v1';
    const PREFS_STORAGE = 'creata_prompts_studio_prefs_v8';
    const GEMINI_MODEL = 'gemini-2.5-flash';
    const CANONICAL_STUDIO_PX = 2048;

    const IMAGE_MODELS = [
        {
            id: 'gemini-nano-banana-2.1',
            label: '🍌 Nano Banana 2.1 (2K · 2048×2048)',
            short: 'Nano Banana 2.1',
            imageSize: '2K',
            supportsThinkingLevel: true,
            thinkingLevels: ['minimal', 'medium', 'high'],
            defaultThinking: 'medium',
            aspectRatios: ['1:1', '4:3', '3:2', '16:9', '3:4', '2:3', '4:5', '5:4', '9:16', '21:9']
        },
        {
            id: 'gemini-3-pro-image',
            label: '💎 Gemini 3 Pro Image (Nano Banana Pro · 2K)',
            short: 'Gemini 3 Pro Image',
            imageSize: '2K',
            supportsThinkingLevel: false,
            thinkingLevels: [],
            defaultThinking: '',
            aspectRatios: ['1:1', '4:3', '3:2', '16:9', '3:4', '2:3', '4:5', '5:4', '9:16', '21:9']
        }
    ];

    const ASPECT_RATIO_OPTIONS = [
        { id: '1:1', label: '1:1 · 2048×2048 (Cuadrado CREATA · Sin deformar)' },
        { id: '4:3', label: '4:3 · 2K (Sofá ancho / Ambiente)' },
        { id: '3:2', label: '3:2 · 2K (Editorial)' },
        { id: '16:9', label: '16:9 · 2K (Panorámico)' }
    ];

    const ANTI_MIRROR_HANDEDNESS_LOCK =
        'ANTI-MIRROR HANDEDNESS LOCK (3D ORBIT ONLY): NEVER horizontally mirror or flip [IMAGE 1]. ' +
        'Orbit the camera physically in 3D space around the real furniture piece so asymmetric components ' +
        '(chaise longue side, L-sectional corner, single armrest, offset drawers) preserve 100% of their true physical handedness.';

    const CANONICAL_34_RIGHT_PROMPT =
        'STRICT 3/4 VIEW FACING TOWARD THE RIGHT (viewer\'s screen-right orientation, CREATA Master Catalog standard): ' +
        'Orbit the camera horizontally in 3D space so the furniture is angled ~35°–40° with its FRONT facade/seat ' +
        'opening and pointing unmistakably toward the RIGHT edge of the image frame. ' +
        'The BACKREST / rear mass sits on the LEFT side of the frame, the furniture\'s left flank visible on the LEFT side ' +
        'recedes cleanly toward the left-rear, and the front edge projects forward toward the RIGHT edge of the frame. ' +
        'Eye-level studio camera height (~110 cm), 85mm rectilinear studio lens (zero wide-angle distortion). ' +
        'CAMERA ORBIT OVERRIDE: If [IMAGE 1] is shot straight-on (0°) or oriented the opposite way, physically orbit the camera ' +
        'around the piece to achieve this exact right-facing 3/4 view (do NOT preserve an opposite or flat-frontal pose). ' +
        ANTI_MIRROR_HANDEDNESS_LOCK;

    const CANONICAL_34_RIGHT_EXCLUDE =
        'NEVER facing left, NEVER pointing toward left edge of frame, backrest on right edge, NEVER flat 0-degree frontal view, horizontally mirrored or flipped geometry';

    const CANONICAL_34_LEFT_PROMPT =
        'STRICT 3/4 VIEW FACING TOWARD THE LEFT (viewer\'s screen-left orientation): ' +
        'Orbit the camera horizontally in 3D space so the furniture is angled ~35°–40° with its FRONT facade/seat ' +
        'opening and pointing unmistakably toward the LEFT edge of the image frame. ' +
        'The BACKREST / rear mass sits on the RIGHT side of the frame, the furniture\'s right flank visible on the RIGHT side ' +
        'recedes cleanly toward the right-rear, and the front edge projects forward toward the LEFT edge of the frame. ' +
        'Eye-level studio camera height (~110 cm), 85mm rectilinear studio lens (zero wide-angle distortion). ' +
        'CAMERA ORBIT OVERRIDE: If [IMAGE 1] is shot straight-on (0°) or oriented the opposite way, physically orbit the camera ' +
        'to the opposite side to achieve this exact left-facing 3/4 view (do NOT copy an opposite or flat-frontal pose). ' +
        ANTI_MIRROR_HANDEDNESS_LOCK;

    const CANONICAL_34_LEFT_EXCLUDE =
        'NEVER facing right, NEVER pointing toward right edge of frame, backrest on left edge, NEVER flat 0-degree frontal view, horizontally mirrored or flipped geometry';

    const VERSIONS = [
        { id: 'V8', label: 'V8 · CREATA Pro', badge: 'NUEVA', desc: 'Exclusiva CREATA: Paquete Cotizador 2048×2048 · 78% parejo sin deformar · #FFFFFF · 0% sombras · Nano Banana 2.1 / Gemini 3 Pro.' },
        { id: 'V7', label: 'V7 · Estudio 9 Modos', badge: '9 MODOS', desc: 'Estudio fotográfico completo con 9 modos, 11 ángulos (3/4 Der. / Izq. diferenciados) y 2048×2048 sin deformar.' },
        { id: 'V1', label: 'V1 · Clásica Original', badge: 'CLÁSICA', desc: 'Versión clásica directa con salida separada para AI Studio / Gemini, Flux / Midjourney y ChatGPT / DALL-E.' }
    ];

    const V8_MODES = [
        { id: 'PACK_CREATA', label: '📦 Paquete Cotizador CREATA', short: 'Paquete CREATA', hint: 'Genera 3 prompts listos: Foto Catálogo 2048×2048 (#FFFFFF · 0% sombras · sin deformar), Portada Ambiente y Plano CAD.' },
        { id: 'SEVEN_VIEWS', label: '📸 7 Vistas + 3/4 Derecha', short: '7 Vistas', hint: 'Serie completa de 7 ángulos consistentes (3/4 Derecha y 3/4 Izquierda diferenciados) en 2048×2048.' },
        { id: 'SINGLE_VIEW', label: '🎯 1 Vista Específica (11 ángulos)', short: '1 Vista', hint: 'Genera un ángulo puntual exacto (incluyendo 3/4 mirando a la Derecha vs. 3/4 mirando a la Izquierda) manteniendo proporciones intactas.' },
        { id: 'MATERIAL_SWAP', label: '🧵🪵 Cambio Material (100% Casco)', short: 'Tela / Madera', hint: 'Retapiza 100% el casco y/o cambia madera usando muestras de Drive (solo lectura) con micro-escala realista.' },
        { id: 'ENVIRONMENT', label: '🛋️ Escenario / Ambiente CREATA', short: 'Ambiente', hint: 'Coloca el mueble real en una habitación editorial CREATA sin modificar una sola costura ni pata.' },
        { id: 'CAD_HD', label: '📐 Plano CAD + Restaurar HD 8K', short: 'CAD / HD 8K', hint: 'Ficha técnica ortográfica con medidas exactas en cm + restauración limpia de estudio 8K en 2048×2048.' }
    ];

    const V7_MODES = [
        { id: '7_VISTAS', label: '📸 7 Vistas de Estudio' },
        { id: '1_VISTA', label: '🎯 1 Vista Específica (11 ángulos)' },
        { id: 'CAMBIO_TELA', label: '🧵 Cambio de Tela' },
        { id: 'CAMBIO_MADERA', label: '🪵 Cambio de Madera' },
        { id: 'CAMBIO_DUAL', label: '🧵🪵 Cambio Dual (Tela + Madera)' },
        { id: 'ENTORNO', label: '🛋️ Entorno / Habitación (7 ambientes)' },
        { id: 'PLANO_CAD', label: '📐 Plano Técnico CAD' },
        { id: 'FONDO_BLANCO', label: '⬜ Extraer Fondo Blanco #FFFFFF' },
        { id: 'HD_8K_LOTE', label: '✨ Restaurar HD 8K / Clonar Color' }
    ];

    const V1_MODES = [
        { id: 'RESTAURAR_HD', label: '✨ Restaurar Foto HD' },
        { id: 'EXTRAER_BLANCO', label: '⬜ Extraer en Fondo Blanco' },
        { id: 'CAMBIO_MATERIAL', label: '🧵🪵 Cambio de Material (Tela / Madera)' },
        { id: 'MULTI_PERSPECTIVA', label: '🔄 Multi-Perspectiva (Frontal / 3/4 / Lateral)' }
    ];

    const SINGLE_ANGLES = [
        { id: 'THREE_QUARTER_RIGHT', label: '↘️ 3/4 Mirando a la Derecha (2048×2048 · Catálogo)', en: CANONICAL_34_RIGHT_PROMPT, exclude: CANONICAL_34_RIGHT_EXCLUDE },
        { id: 'FRONT', label: '⬆️ Frontal Recta (0°)', en: 'Dead-center straight front elevation (0°, eye-level ~110 cm, 85mm rectilinear studio lens, perfectly level orthographic-style studio framing)', exclude: 'angled 3/4 perspective, tilted horizon, off-center framing' },
        { id: 'THREE_QUARTER_LEFT', label: '↙️ 3/4 Mirando a la Izquierda (2048×2048 · 35°)', en: CANONICAL_34_LEFT_PROMPT, exclude: CANONICAL_34_LEFT_EXCLUDE },
        { id: 'SIDE_RIGHT', label: '➡️ Perfil Lateral Derecho (90°)', en: 'Pure 90° orthogonal right side profile view (furniture facing right edge in strict flat side profile, showing exact armrest depth and silhouette; zero 3/4 rotation)', exclude: '3/4 front perspective, flat frontal view' },
        { id: 'SIDE_LEFT', label: '⬅️ Perfil Lateral Izquierdo (-90°)', en: 'Pure -90° orthogonal left side profile view (furniture facing left edge in strict flat side profile, showing exact armrest depth and backrest rake; zero 3/4 rotation)', exclude: '3/4 front perspective, flat frontal view' },
        { id: 'BACK', label: '⬇️ Vista Trasera (180°)', en: 'Clean straight back elevation view (180°, eye-level 85mm rectilinear lens) showing full continuous rear upholstery/panel finish', exclude: 'front seat facing camera, 3/4 front view' },
        { id: 'TOP_DOWN', label: '🛰️ Cenital / Aérea (90° arriba)', en: 'Strict 90° top-down orthogonal overhead plan view pointing vertically straight down showing exact footprint and seat layout', exclude: 'eye-level angle, front elevation' },
        { id: 'HIGH_ANGLE', label: '📐 Picada 45° (Tres Cuartos Superior)', en: 'Elevated 45° high-angle 3/4 studio view highlighting seat cushions and top surfaces while preserving true physical proportions', exclude: 'low-angle view, flat 0-degree front elevation' },
        { id: 'LOW_HERO', label: '🏛️ Contrapicada Editorial', en: 'Subtle low-angle architectural hero perspective (~45 cm height, 85mm rectilinear lens) emphasizing base/legs and grounded stance without lens distortion', exclude: 'top-down view, fish-eye distortion' },
        { id: 'DETAIL_TEXTURE', label: '🔍 Macro Textura y Costura', en: 'Close-up 100mm macro detail of fabric weave, piping, stitching, and wood grain transition at realistic physical scale', exclude: 'distant room view, blurry weave, flat plastic texture' },
        { id: 'DETAIL_BASE', label: '🪵 Detalle Patas / Base / Estructura', en: 'Close-up studio detail of legs, plinth, joinery, and lower frame craftsmanship', exclude: 'top-down view, blurry base, altered leg design' }
    ];

    const ROOM_ENVIRONMENTS = [
        { id: 'RIVIERA_TULUM', label: '🌴 Sala Riviera Maya / Lujo Orgánico', en: 'Sunlit luxury Riviera Maya living room with smooth chukum limestone plaster walls, pale travertine floor, warm architectural daylight, linen sheer curtains, minimal ceramic accent' },
        { id: 'SHOWROOM_CREATA', label: '🏛️ Showroom Casa Creata Minimalista', en: 'High-end contemporary Mexican design showroom, honed beige limestone flooring, warm matte off-white plaster walls, soft diffused architectural skylight, clean gallery aesthetic' },
        { id: 'COMEDOR_EDITORIAL', label: '🍽️ Comedor Editorial Contemporáneo', en: 'Editorial contemporary dining space with pale oak wall paneling, microcement floor, warm indirect cove lighting, minimalist sculptural centerpiece' },
        { id: 'RECAMARA_BOUTIQUE', label: '🛏️ Recámara Hotel Boutique', en: 'Serene luxury boutique hotel suite in warm neutral sand and travertine tones, soft morning daylight through floor-to-ceiling sheer drapes, understated organic styling' },
        { id: 'TERRAZA_CUBIERTA', label: '☀️ Terraza Cubierta Arquitectura Tropical', en: 'Architectural covered tropical terrace overlooking lush greenery, natural coralina stone floor, warm wood pergola ceiling, soft afternoon natural sunlight' },
        { id: 'ESTUDIO_EJECUTIVO', label: '💼 Estudio / Sala Ejecutiva', en: 'Refined architectural lounge with warm walnut slatted backdrop, honed stone floor, gallery-grade diffused daylight, calm uncluttered styling' },
        { id: 'PENTHOUSE_MAR', label: '🌊 Penthouse Moderno Vista Mar', en: 'Bright modern coastal penthouse with floor-to-ceiling glass, soft ocean horizon light, creamy honed stone floor, crisp contemporary architecture' }
    ];

    const CATEGORIES = [
        { id: 'AUTO', label: '🤖 Automático (detectar por nombre/SKU)' },
        { id: 'SALA_SOFA', label: '🛋️ Sala / Sofá / Modular / Chaise' },
        { id: 'SILLON', label: '🪑 Sillón Individual / Love Seat / Poltrona' },
        { id: 'COMEDOR_MESA', label: '🪵 Mesa (Comedor / Centro / Lateral)' },
        { id: 'SILLA_BANCO', label: '🪑 Silla / Banco / Taburete' },
        { id: 'RECAMARA', label: '🛏️ Recámara / Cama / Cabecera / Buró' },
        { id: 'EXTERIOR', label: '☀️ Exterior / Camastro / Sala Jardín' },
        { id: 'AUXILIAR', label: '🗄️ Consola / Credenza / Librero / Mueble TV' },
        { id: 'ACCESORIO', label: '🪞 Accesorio / Espejo / Tapete / Lámpara' }
    ];

    const CATEGORY_RULES = {
        SALA_SOFA: 'Preserve exact seat-module count, cushion divisions, armrest width/height, backrest pillows (NEVER add or remove throw pillows), piping, seam lines, and leg/plinth geometry. NEVER compress horizontally or distort sofa proportions to fit square canvas.',
        SILLON: 'Preserve exact single-seat silhouette, armrest curvature, backrest slope, cushion thickness, swivel/fixed base or leg count and angle without horizontal/vertical stretching.',
        COMEDOR_MESA: 'Preserve exact tabletop shape (round/oval/rectangular/organic), edge bevel profile, thickness, pedestal/leg count, and wood grain direction across top and aprons.',
        SILLA_BANCO: 'Preserve exact backrest openness/slats, seat pad thickness, footrest bar height (if stool), leg taper, and structural joinery.',
        RECAMARA: 'Preserve exact headboard height/paneling/tufting, bed-frame rail thickness, leg clearance, and clean tailored neutral bedding without covering the frame.',
        EXTERIOR: 'Preserve exact outdoor frame material (teak, aluminum, rope, rattan), slatted construction, outdoor cushion piping, and reclining mechanism if present.',
        AUXILIAR: 'Preserve exact door/drawer count, handle/pull hardware, shelf spacing, mitered corners, and exact leg or recessed-plinth base.',
        ACCESORIO: 'Preserve exact proportions, frame bezel width, reflective/matte surface finish, and subtle artisan details without inventing extra props.'
    };

    const state = {
        version: 'V8',
        v8Mode: 'PACK_CREATA',
        v7Mode: '7_VISTAS',
        v1Mode: 'RESTAURAR_HD',
        angleId: 'THREE_QUARTER_RIGHT',
        roomId: 'RIVIERA_TULUM',
        category: 'AUTO',
        materialTarget: 'DUAL', // TELA | MADERA | DUAL
        targetModel: 'gemini-nano-banana-2.1', // gemini-nano-banana-2.1 | gemini-3-pro-image
        aspectRatio: '1:1', // 1:1 (2048x2048) | 4:3 | 3:2 | 16:9
        thinkingLevel: 'medium', // minimal | medium | high (solo Nano Banana 2.1)
        forceCreataSpec: true, // 2048x2048 · 78% parejo sin deformar · #FFFFFF · 0% sombras
        forceThreeQuarterRight: true,
        includeSpanishNotes: true,
        sku: '',
        productName: '',
        dimensions: '',
        extraNotes: '',
        visionAnalysis: '',
        visionLoading: false,
        furniturePhoto: null, // { id?, name, previewUrl, dataUri?, source, fileId? }
        fabricSwatch: null,   // { id?, name, previewUrl, dataUri?, source, fileId?, subfolder? }
        woodSwatch: null,     // { id?, name, previewUrl, dataUri?, source, fileId?, subfolder? }
        materialsLoaded: false,
        materialsLoading: false,
        materialsError: '',
        telasList: [],
        maderasList: [],
        activeMaterialPicker: '', // '' | 'TELA' | 'MADERA'
        materialSearch: '',
        activeSourceTab: '', // '' | 'SM_MUEBLERIA' | 'COTIZACION' | 'SUBIR_PROPT'
        sourceFiles: [],
        sourceLoading: false,
        sourceError: '',
        generatedBlocks: [] // [{ id, title, badge, prompt }]
    };

    let rootEl = null;
    let initialized = false;

    function byId(id) {
        return typeof document !== 'undefined' ? document.getElementById(id) : null;
    }

    function cleanStr(v) {
        return v === null || v === undefined ? '' : String(v).trim();
    }

    function escapeHtml(s) {
        return String(s === null || s === undefined ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function normSearch(s) {
        return cleanStr(s)
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase();
    }

    function stripFileExt(name) {
        return cleanStr(name).replace(/\.(jpe?g|png|webp|gif|avif|bmp)$/i, '').replace(/[_-]+/g, ' ').trim();
    }

    function getBridge() {
        return (typeof window !== 'undefined' && window.__CREATA_PROMPTS_BRIDGE__) || null;
    }

    function getTargetModelObj(modelId) {
        return IMAGE_MODELS.find((m) => m.id === modelId) || IMAGE_MODELS[0];
    }

    function loadSavedPrefs() {
        try {
            const raw = localStorage.getItem(PREFS_STORAGE);
            if (!raw) return;
            const p = JSON.parse(raw);
            if (!p || typeof p !== 'object') return;
            if (p.version === 'V8' || p.version === 'V7' || p.version === 'V1') state.version = p.version;
            if (p.v8Mode && V8_MODES.some((m) => m.id === p.v8Mode)) state.v8Mode = p.v8Mode;
            if (p.v7Mode && V7_MODES.some((m) => m.id === p.v7Mode)) state.v7Mode = p.v7Mode;
            if (p.v1Mode && V1_MODES.some((m) => m.id === p.v1Mode)) state.v1Mode = p.v1Mode;
            if (p.angleId && SINGLE_ANGLES.some((a) => a.id === p.angleId)) state.angleId = p.angleId;
            if (p.roomId && ROOM_ENVIRONMENTS.some((r) => r.id === p.roomId)) state.roomId = p.roomId;
            if (p.category && CATEGORIES.some((c) => c.id === p.category)) state.category = p.category;
            if (p.materialTarget === 'TELA' || p.materialTarget === 'MADERA' || p.materialTarget === 'DUAL') state.materialTarget = p.materialTarget;
            if (p.targetModel && IMAGE_MODELS.some((m) => m.id === p.targetModel)) state.targetModel = p.targetModel;
            if (p.aspectRatio && ASPECT_RATIO_OPTIONS.some((a) => a.id === p.aspectRatio)) state.aspectRatio = p.aspectRatio;
            if (p.thinkingLevel === 'minimal' || p.thinkingLevel === 'medium' || p.thinkingLevel === 'high') state.thinkingLevel = p.thinkingLevel;
            if (typeof p.forceCreataSpec === 'boolean') state.forceCreataSpec = p.forceCreataSpec;
            if (typeof p.forceThreeQuarterRight === 'boolean') state.forceThreeQuarterRight = p.forceThreeQuarterRight;
        } catch (e) {}
    }

    function savePrefs() {
        try {
            localStorage.setItem(PREFS_STORAGE, JSON.stringify({
                version: state.version,
                v8Mode: state.v8Mode,
                v7Mode: state.v7Mode,
                v1Mode: state.v1Mode,
                angleId: state.angleId,
                roomId: state.roomId,
                category: state.category,
                materialTarget: state.materialTarget,
                targetModel: state.targetModel,
                aspectRatio: state.aspectRatio,
                thinkingLevel: state.thinkingLevel,
                forceCreataSpec: state.forceCreataSpec,
                forceThreeQuarterRight: state.forceThreeQuarterRight
            }));
        } catch (e) {}
    }

    function getSavedGeminiKey() {
        try {
            return cleanStr(localStorage.getItem(GEMINI_KEY_STORAGE));
        } catch (e) {
            return '';
        }
    }

    function saveGeminiKey(val) {
        const clean = cleanStr(val);
        try {
            if (clean) localStorage.setItem(GEMINI_KEY_STORAGE, clean);
            else localStorage.removeItem(GEMINI_KEY_STORAGE);
        } catch (e) {}
    }

    function detectCategoryFromInputs(name, sku, manualCat) {
        if (manualCat && manualCat !== 'AUTO' && CATEGORY_RULES[manualCat]) return manualCat;
        const txt = normSearch((name || '') + ' ' + (sku || ''));
        if (/\b(sala|sofa|modular|seccional|chaise|futon|sofa cama|esquinero|loveseat|love seat)\b/.test(txt)) return 'SALA_SOFA';
        if (/\b(sillon|poltrona|butaca|reclinable|ottoman|otoman|puf|pouf)\b/.test(txt)) return 'SILLON';
        if (/\b(mesa|comedor|cubierta|nido|centro|lateral|escritorio)\b/.test(txt)) return 'COMEDOR_MESA';
        if (/\b(silla|banco|taburete|periquera)\b/.test(txt)) return 'SILLA_BANCO';
        if (/\b(cama|cabecera|recamara|buro|comoda|tocador|king|queen|matrimonial)\b/.test(txt)) return 'RECAMARA';
        if (/\b(camastro|exterior|jardin|terraza|alberca|sombrilla)\b/.test(txt)) return 'EXTERIOR';
        if (/\b(consola|credenza|bufetera|librero|mueble tv|vitrina|bar|cantina|auxiliar)\b/.test(txt)) return 'AUXILIAR';
        if (/\b(espejo|tapete|alfombra|lampara|cuadro|cojin|maceta|escultura|accesorio)\b/.test(txt)) return 'ACCESORIO';
        return 'SALA_SOFA';
    }

    function buildSlotMap(cfg) {
        const slots = [];
        const furnName = cleanStr(cfg.furniturePhoto && cfg.furniturePhoto.name) || 'furniture_reference.jpg';
        slots.push({
            idx: 1,
            role: 'PRIMARY FURNITURE PIECE',
            fileName: furnName,
            desc: 'Original furniture product geometry, proportions, cushions, silhouette, and base to preserve with 100% fidelity.'
        });
        let nextIdx = 2;
        if (cfg.includeFabric && cfg.fabricSwatch) {
            slots.push({
                idx: nextIdx++,
                role: 'FABRIC / UPHOLSTERY SWATCH (READ-ONLY REFERENCE)',
                fileName: cleanStr(cfg.fabricSwatch.name) || 'fabric_swatch.jpg',
                cleanName: stripFileExt(cfg.fabricSwatch.name),
                desc: 'Target upholstery textile color, weave density, fiber grain, and matte/sheen response.'
            });
        }
        if (cfg.includeWood && cfg.woodSwatch) {
            slots.push({
                idx: nextIdx++,
                role: 'WOOD / BASE FINISH SWATCH (READ-ONLY REFERENCE)',
                fileName: cleanStr(cfg.woodSwatch.name) || 'wood_swatch.jpg',
                cleanName: stripFileExt(cfg.woodSwatch.name),
                desc: 'Target wood/base tone, natural grain direction, open/closed pore finish, and satin level.'
            });
        }
        return slots;
    }

    function formatSlotMapText(slots) {
        const lines = ['ATTACHED IMAGE SLOT MAPPING (STRICT ORDER):'];
        for (let i = 0; i < slots.length; i++) {
            const s = slots[i];
            lines.push('- [IMAGE ' + s.idx + ': "' + s.fileName + '"] -> ' + s.role + ': ' + s.desc);
        }
        return lines.join('\n');
    }

    function getAngleObj(angleId) {
        return SINGLE_ANGLES.find((a) => a.id === angleId) || SINGLE_ANGLES[0];
    }

    function getRoomObj(roomId) {
        return ROOM_ENVIRONMENTS.find((r) => r.id === roomId) || ROOM_ENVIRONMENTS[0];
    }

    function buildModelTargetBlock(cfg) {
        const modelObj = getTargetModelObj(cfg.targetModel);
        const ar = cfg.aspectRatio || '1:1';
        const pxLabel = ar === '1:1' ? '2048x2048 px (1:1 square, image_size="2K")' : (ar + ' at 2K resolution (image_size="2K")');
        const lines = [
            'AI STUDIO / GEMINI MODEL TARGET PROFILE:',
            '- Model: ' + modelObj.id + ' (' + modelObj.short + ')',
            '- Output Config: aspect_ratio="' + ar + '", image_size="' + modelObj.imageSize + '" -> ' + pxLabel
        ];
        if (modelObj.supportsThinkingLevel) {
            lines.push('- Thinking: thinking_level="' + (cfg.thinkingLevel || modelObj.defaultThinking || 'medium') + '" (do NOT override temperature/top_p/seed).');
        } else {
            lines.push('- Thinking: built-in always-on Pro reasoning (omit thinking_config).');
        }
        return lines.join('\n');
    }

    function buildProductHeader(cfg, catKey) {
        const parts = [];
        if (cfg.productName) parts.push('Product: ' + cfg.productName);
        if (cfg.sku) parts.push('SKU: ' + cfg.sku.toUpperCase());
        if (cfg.dimensions) parts.push('Exact Dimensions: ' + cfg.dimensions);
        parts.push('Category Profile: ' + catKey);
        if (cfg.visionAnalysis) parts.push('Verified Visual Anatomy:\n' + cfg.visionAnalysis);
        if (cfg.extraNotes) parts.push('Special Instructions: ' + cfg.extraNotes);
        return parts.join('\n');
    }

    function buildCreataCatalogSpecBlock(forceSpec, force34Right, aspectRatioOpt, explicitAngleObj) {
        const ar = aspectRatioOpt || '1:1';
        const dimLine = ar === '1:1'
            ? '- Output canvas: exact 1:1 square, 2048x2048 px (image_size="2K") ultra-sharp commercial studio quality.'
            : '- Output canvas: ' + ar + ' commercial 2K studio quality (2048 px long edge, image_size="2K").';
        if (!forceSpec) {
            return 'STUDIO LIGHTING & FRAMING: Crisp commercial catalog lighting, clean seamless pure white background (#FFFFFF), centered balanced proportional framing (zero distortion).';
        }
        const angleLine = explicitAngleObj
            ? ('- Camera Angle: ' + explicitAngleObj.en + (explicitAngleObj.exclude ? ('\n- STRICT ORIENTATION EXCLUSIONS: ' + explicitAngleObj.exclude + '.') : ''))
            : (force34Right
                ? ('- Camera Angle: ' + CANONICAL_34_RIGHT_PROMPT + '\n- STRICT ORIENTATION EXCLUSIONS: ' + CANONICAL_34_RIGHT_EXCLUDE + '.')
                : '- Camera Angle: rectilinear 85mm commercial studio lens with zero wide-angle distortion.');
        return [
            'CREATA MASTER CATALOG SPECIFICATION (NON-NEGOTIABLE · 2048×2048 ANTI-DISTORTION):',
            dimLine,
            '- Framing & Anti-Distortion Lock: scale the complete furniture piece UNIFORMLY (1:1 aspect-locked, NEVER stretch, compress, or warp wide sofas/armchairs/tables) so its LONGEST axis occupies ~78% of the 2048x2048 canvas centered evenly with clean balanced #FFFFFF white padding on all 4 sides (NEVER crop legs, armrests, or corners).',
            '- Background: 100% uniform pure solid white #FFFFFF seamless infinity sweep from edge to edge (RGB 255,255,255 — zero gray tint, zero horizon line, zero vignette).',
            '- Shadows: ZERO cast shadows, ZERO drop shadows, ZERO dark ambient occlusion smudges on the white floor (pure isolated 0% shadow e-commerce cutout look, preserving crisp natural 3D volume ONLY on the furniture itself).',
            angleLine
        ].join('\n');
    }

    function buildCascoMaterialRules(slots, includeFabric, includeWood) {
        const lines = [];
        const fabSlot = slots.find((s) => s.role.indexOf('FABRIC') === 0);
        const woodSlot = slots.find((s) => s.role.indexOf('WOOD') === 0);
        if (includeFabric) {
            const fabRef = fabSlot
                ? ('[IMAGE ' + fabSlot.idx + ': "' + fabSlot.fileName + '"] (' + (fabSlot.cleanName || fabSlot.fileName) + ')')
                : 'the attached fabric swatch';
            lines.push(
                '100% FULL-BODY CASCO UPHOLSTERY RULE (' + fabRef + '):\n' +
                '- Reupholster 100% of EVERY upholstered surface of the furniture in [IMAGE 1]: main seat cushions, backrests, armrests, inner/outer side panels, lower deck/apron, front/back casco body, welt/piping, and any included matching cushions — zero leftover patches of the original color.\n' +
                '- MICRO-SCALE TEXTURE REALISM (~97% authentic scale): keep the textile weave, bouclé/linen/velvet grain, and yarn scale realistic relative to full-size furniture (never blown-up giant macro fibers and never flat plastic color).\n' +
                '- Preserve realistic fabric tension, natural subtle creases, seams, and light falloff across curves while locking the exact hue and brightness of ' + fabRef + '.'
            );
        }
        if (includeWood) {
            const woodRef = woodSlot
                ? ('[IMAGE ' + woodSlot.idx + ': "' + woodSlot.fileName + '"] (' + (woodSlot.cleanName || woodSlot.fileName) + ')')
                : 'the attached wood swatch';
            lines.push(
                'WOOD & SOLID STRUCTURE FINISH RULE (' + woodRef + '):\n' +
                '- Apply the exact tone, wood grain species, open/closed pore texture, and matte/satin finish from ' + woodRef + ' to ALL exposed wood/base elements of [IMAGE 1] (legs, plinth, exposed frame, tabletop, aprons, arms).\n' +
                '- Keep grain direction anatomically accurate along structural rails and legs without altering thickness or joinery.'
            );
        }
        return lines.join('\n\n');
    }

    // =========================================================================
    // MOTOR DETERMINÍSTICO DE GENERACIÓN: V8 CREATA Pro · V7 Estudio · V1 Clásica
    // =========================================================================
    function generatePrompts(inputCfg) {
        const cfg = Object.assign({
            version: state.version,
            v8Mode: state.v8Mode,
            v7Mode: state.v7Mode,
            v1Mode: state.v1Mode,
            angleId: state.angleId,
            roomId: state.roomId,
            category: state.category,
            materialTarget: state.materialTarget,
            targetModel: state.targetModel,
            aspectRatio: state.aspectRatio,
            thinkingLevel: state.thinkingLevel,
            forceCreataSpec: state.forceCreataSpec,
            forceThreeQuarterRight: state.forceThreeQuarterRight,
            sku: state.sku,
            productName: state.productName,
            dimensions: state.dimensions,
            extraNotes: state.extraNotes,
            visionAnalysis: state.visionAnalysis,
            furniturePhoto: state.furniturePhoto,
            fabricSwatch: state.fabricSwatch,
            woodSwatch: state.woodSwatch
        }, inputCfg || {});

        const catKey = detectCategoryFromInputs(cfg.productName, cfg.sku, cfg.category);
        const catRule = CATEGORY_RULES[catKey] || CATEGORY_RULES.SALA_SOFA;
        const angleObj = getAngleObj(cfg.angleId);
        const roomObj = getRoomObj(cfg.roomId);
        const headerText = buildProductHeader(cfg, catKey);
        const modelBlock = buildModelTargetBlock(cfg);

        const wantsFabric = Boolean(cfg.fabricSwatch) && (cfg.materialTarget === 'TELA' || cfg.materialTarget === 'DUAL');
        const wantsWood = Boolean(cfg.woodSwatch) && (cfg.materialTarget === 'MADERA' || cfg.materialTarget === 'DUAL');

        // ---------------------------------------------------------------------
        // VERSIÓN 8 · CREATA Pro (2048×2048 · Nano Banana 2.1 / Gemini 3 Pro)
        // ---------------------------------------------------------------------
        if (cfg.version === 'V8') {
            const mode = cfg.v8Mode || 'PACK_CREATA';
            const includeFab = mode === 'MATERIAL_SWAP' ? (cfg.materialTarget === 'TELA' || cfg.materialTarget === 'DUAL') : wantsFabric;
            const includeWood = mode === 'MATERIAL_SWAP' ? (cfg.materialTarget === 'MADERA' || cfg.materialTarget === 'DUAL') : wantsWood;
            const slots = buildSlotMap(Object.assign({}, cfg, { includeFabric: includeFab, includeWood: includeWood }));
            const slotBlock = formatSlotMapText(slots);
            const matBlock = (includeFab || includeWood) ? buildCascoMaterialRules(slots, includeFab, includeWood) : '';
            const antiHallucination = [
                'STRICT ANTI-HALLUCINATION & GEOMETRY LOCK:',
                '- Treat [IMAGE 1] as the single source of truth for silhouette, proportions, dimensions, and part count.',
                '- ' + catRule,
                '- NEVER add decorative pillows, throws, rugs, plants, logos, watermarks, price tags, or text overlays unless explicitly requested.',
                '- Remove all background clutter, store tags, cords, reflections, dust, and camera lens distortion.'
            ].join('\n');

            if (mode === 'PACK_CREATA') {
                const catalogPrompt = [
                    'ROLE: Senior CREATA Luxury Furniture Studio Retoucher & CGI Product Photographer (V8 Pro).',
                    modelBlock,
                    headerText,
                    slotBlock,
                    'OBJECTIVE: Produce the FINAL MASTER CATALOG PHOTO for the CREATA Cotizador & Inventory System.',
                    buildCreataCatalogSpecBlock(cfg.forceCreataSpec, cfg.forceThreeQuarterRight, cfg.aspectRatio),
                    matBlock,
                    antiHallucination
                ].filter(Boolean).join('\n\n');

                const coverPrompt = [
                    'ROLE: Editorial Architectural Interior Photographer for CREATA Catalog Model Covers (V8 Pro).',
                    modelBlock,
                    headerText,
                    slotBlock,
                    'OBJECTIVE: Place the EXACT furniture piece from [IMAGE 1] as the unmistakable hero centerpiece inside an aspirational interior scene for the CREATA Model Cover.',
                    'ENVIRONMENT: ' + roomObj.en + '.',
                    'COMPOSITION: ' + (cfg.aspectRatio || '1:1') + ' editorial 2K framing (2048px long edge), furniture occupying ~60–65% of the scene with true real-world proportions (zero distortion), natural architectural sunlight matching the piece, realistic floor contact and soft ambient shadows ONLY in this lifestyle scene.',
                    matBlock,
                    antiHallucination
                ].filter(Boolean).join('\n\n');

                const cadPrompt = [
                    'ROLE: Industrial Furniture Technical Draftsman (V8 Pro CAD Spec Sheet).',
                    modelBlock,
                    headerText,
                    slotBlock,
                    'OBJECTIVE: Create a clean, high-contrast 2D orthographic architectural CAD dimension sheet of the EXACT furniture piece from [IMAGE 1].',
                    'LAYOUT: 2048x2048 pure white background (#FFFFFF), crisp charcoal technical vector linework (#1E293B), showing 3 aligned views: Front Elevation, Side Profile, and Top Plan View.',
                    cfg.dimensions
                        ? ('DIMENSION CALLOUTS (EXACT — DO NOT INVENT OTHER NUMBERS): Label clean metric arrow lines clearly with "' + cfg.dimensions + '".')
                        : 'DIMENSION CALLOUTS: Draw clean proportional metric dimension arrows (Width, Depth, Height, Seat Height if applicable) with subtle placeholder guides.',
                    'STYLE: Ultra-clean furniture specification sheet, zero clutter, zero photoreal shading, exact silhouette fidelity to [IMAGE 1].'
                ].filter(Boolean).join('\n\n');

                return [
                    { id: 'v8_catalog', title: '1. Foto Catálogo CREATA (2048×2048 · #FFFFFF · 0% Sombras)', badge: 'COTIZADOR', prompt: catalogPrompt },
                    { id: 'v8_cover', title: '2. Portada Ambiente Editorial (' + roomObj.label.replace(/^[^\s]+\s/, '') + ')', badge: 'PORTADA', prompt: coverPrompt },
                    { id: 'v8_cad', title: '3. Plano Técnico CAD Ortográfico', badge: 'FICHA CAD', prompt: cadPrompt }
                ];
            }

            if (mode === 'SEVEN_VIEWS') {
                const prompt = [
                    'ROLE: CREATA Luxury E-Commerce Studio CGI Director (V8 Pro — 7-View Series).',
                    modelBlock,
                    headerText,
                    slotBlock,
                    'OBJECTIVE: Generate a cohesive 7-VIEW COMMERCIAL CATALOG SET of the EXACT furniture piece from [IMAGE 1] with 100% structural, proportional, and color consistency across every view.',
                    buildCreataCatalogSpecBlock(cfg.forceCreataSpec, true, cfg.aspectRatio),
                    'REQUIRED 7 VIEWS (generate clean individual 2048x2048 studio frames maintaining identical ~78% proportional major-axis scale without stretching or mirroring):',
                    '1) HERO 3/4 FACING RIGHT (screen-right: front opens toward RIGHT edge, backrest on LEFT, 35°–40°, 2048×2048, #FFFFFF, 0% shadows) — Primary CREATA Catalog View.',
                    '2) STRAIGHT FRONT ELEVATION (0°, perfectly level).',
                    '3) 3/4 FACING LEFT (screen-left: OPPOSITE orbit to View 1 — front opens toward LEFT edge, backrest on RIGHT, 35°–40°; NEVER mirrored).',
                    '4) RIGHT SIDE PROFILE (90° strict flat profile showing full depth & armrest line).',
                    '5) LEFT SIDE PROFILE (-90° strict flat opposite profile).',
                    '6) STRAIGHT BACK VIEW (180° showing full continuous rear upholstery/panel).',
                    '7) MACRO TEXTURE & CRAFTSMANSHIP DETAIL (100mm close-up of weave, stitching, and base/legs).',
                    matBlock,
                    antiHallucination
                ].filter(Boolean).join('\n\n');
                return [{ id: 'v8_7views', title: 'V8 Pro · Serie 7 Vistas + 3/4 Der./Izq. (2048×2048)', badge: '7 VISTAS', prompt: prompt }];
            }

            if (mode === 'SINGLE_VIEW') {
                const prompt = [
                    'ROLE: CREATA Studio Furniture Photographer (V8 Pro — Precision Single Angle).',
                    modelBlock,
                    headerText,
                    slotBlock,
                    'TARGET CAMERA ANGLE (STRICT): ' + angleObj.en,
                    angleObj.exclude ? ('NEGATIVE ORIENTATION GUARD (STRICTLY FORBIDDEN): ' + angleObj.exclude + '.') : '',
                    buildCreataCatalogSpecBlock(cfg.forceCreataSpec, false, cfg.aspectRatio, angleObj),
                    matBlock,
                    antiHallucination
                ].filter(Boolean).join('\n\n');
                return [{ id: 'v8_single', title: 'V8 Pro · ' + angleObj.label, badge: '1 VISTA', prompt: prompt }];
            }

            if (mode === 'MATERIAL_SWAP') {
                const targetLabel = cfg.materialTarget === 'TELA'
                    ? 'Solo Tela (100% Casco)'
                    : (cfg.materialTarget === 'MADERA' ? 'Solo Madera / Base' : 'Dual (Tela 100% Casco + Madera)');
                const prompt = [
                    'ROLE: Master Furniture Re-Upholstery & Finish Visualization Artist (V8 Pro).',
                    modelBlock,
                    headerText,
                    slotBlock,
                    'OBJECTIVE: Perform a photorealistic material swap on the EXACT furniture piece in [IMAGE 1] WITHOUT altering a single millimeter of its shape, scale, seam layout, or camera perspective.',
                    matBlock || 'Apply the attached material reference faithfully across 100% of the target surfaces with realistic micro-scale grain.',
                    buildCreataCatalogSpecBlock(cfg.forceCreataSpec, cfg.forceThreeQuarterRight, cfg.aspectRatio),
                    antiHallucination
                ].filter(Boolean).join('\n\n');
                return [{ id: 'v8_material', title: 'V8 Pro · Cambio de Material — ' + targetLabel, badge: '100% CASCO', prompt: prompt }];
            }

            if (mode === 'ENVIRONMENT') {
                const prompt = [
                    'ROLE: Architectural Digest / CREATA Interior Lifestyle Photographer (V8 Pro).',
                    modelBlock,
                    headerText,
                    slotBlock,
                    'OBJECTIVE: Integrate the EXACT furniture piece from [IMAGE 1] naturally into the specified luxury interior environment.',
                    'SCENE: ' + roomObj.en + '.',
                    'PHOTOGRAPHY: Full-frame 50mm architectural lens, 2K output (' + (cfg.aspectRatio || '1:1') + '), natural soft directional daylight, accurate perspective floor-plane integration, realistic soft contact shadow under legs, rich editorial color grading while keeping the furniture fabric/wood color and real proportions 100% true to reference.',
                    matBlock,
                    antiHallucination
                ].filter(Boolean).join('\n\n');
                return [{ id: 'v8_env', title: 'V8 Pro · Ambiente — ' + roomObj.label, badge: 'AMBIENTE', prompt: prompt }];
            }

            // CAD_HD
            const hdPrompt = [
                'ROLE: Commercial Studio Furniture Retoucher — 8K HD Restoration (V8 Pro).',
                modelBlock,
                headerText,
                slotBlock,
                'OBJECTIVE: Restore and upscale [IMAGE 1] into an ultra-crisp 2048x2048 (2K) commercial studio product photograph without distorting proportions.',
                'RESTORATION RULES: Eliminate noise, compression artifacts, store clutter, uneven showroom lighting, glare, wrinkled floor mats, and skewed verticals. Sharpen stitching, fabric weave, and wood grain naturally without synthetic AI over-smoothing.',
                buildCreataCatalogSpecBlock(cfg.forceCreataSpec, cfg.forceThreeQuarterRight, cfg.aspectRatio),
                matBlock,
                antiHallucination
            ].filter(Boolean).join('\n\n');

            const cadOnlyPrompt = [
                'ROLE: Furniture Technical Draftsman (V8 Pro CAD).',
                modelBlock,
                headerText,
                slotBlock,
                'OBJECTIVE: Produce a crisp 2048x2048 2D orthographic technical CAD drawing (Front, Side, Top views) on pure #FFFFFF white background matching [IMAGE 1] 100%.',
                cfg.dimensions ? ('EXACT MEASUREMENTS: ' + cfg.dimensions + '.') : 'Include clean proportional metric dimension arrows.',
                'Thin architectural charcoal lines, legible sans-serif metric numbers, zero background clutter.'
            ].filter(Boolean).join('\n\n');

            return [
                { id: 'v8_hd8k', title: '1. Restauración Estudio HD 8K (2048×2048 · #FFFFFF)', badge: 'HD 8K', prompt: hdPrompt },
                { id: 'v8_cad2', title: '2. Plano Técnico CAD Ortográfico', badge: 'PLANO CAD', prompt: cadOnlyPrompt }
            ];
        }

        // ---------------------------------------------------------------------
        // VERSIÓN 7 · ESTUDIO 9 MODOS + 2048×2048 + 3/4 DER/IZQ DIFERENCIADOS
        // ---------------------------------------------------------------------
        if (cfg.version === 'V7') {
            const m7 = cfg.v7Mode || '7_VISTAS';
            const includeFab7 = m7 === 'CAMBIO_TELA' || m7 === 'CAMBIO_DUAL' || wantsFabric;
            const includeWood7 = m7 === 'CAMBIO_MADERA' || m7 === 'CAMBIO_DUAL' || wantsWood;
            const slots7 = buildSlotMap(Object.assign({}, cfg, { includeFabric: includeFab7, includeWood: includeWood7 }));
            const slotBlock7 = formatSlotMapText(slots7);
            const matBlock7 = (includeFab7 || includeWood7) ? buildCascoMaterialRules(slots7, includeFab7, includeWood7) : '';
            const base2048Format = 'FORMAT & ANTI-DISTORTION: 2048x2048 px 1:1 square (image_size="2K"), furniture scaled proportionally with longest axis at ~78% centered evenly (NEVER stretch/squash sofas or armchairs), pure solid #FFFFFF background, 0% cast shadows, rectilinear 85mm lens.';
            const hero34 = cfg.forceThreeQuarterRight
                ? (base2048Format + '\nORIENTATION: ' + CANONICAL_34_RIGHT_PROMPT + '\nEXCLUDE: ' + CANONICAL_34_RIGHT_EXCLUDE + '.')
                : base2048Format;

            let modeBody = '';
            let badge7 = 'V7';
            let title7 = (V7_MODES.find((x) => x.id === m7) || V7_MODES[0]).label;

            if (m7 === '7_VISTAS') {
                badge7 = '7 VISTAS';
                modeBody = 'TASK (V7 — 7 STUDIO VIEWS): Generate the complete 7-angle studio series of [IMAGE 1] (3/4 Facing Right, Front 0°, 3/4 Facing Left [opposite orbit, NEVER mirrored], Right Side 90°, Left Side -90°, Back 180°, Texture Close-up) keeping identical structure, proportions, seams, and finishes.\n' + hero34;
            } else if (m7 === '1_VISTA') {
                badge7 = '1 VISTA';
                title7 = 'V7 · 1 Vista — ' + angleObj.label;
                modeBody = 'TASK (V7 — SINGLE VIEW): Render ONLY this exact camera view of [IMAGE 1]:\n' + angleObj.en +
                    (angleObj.exclude ? ('\nSTRICTLY EXCLUDE: ' + angleObj.exclude + '.') : '') +
                    '\n' + base2048Format;
            } else if (m7 === 'CAMBIO_TELA' || m7 === 'CAMBIO_MADERA' || m7 === 'CAMBIO_DUAL') {
                badge7 = m7.replace('CAMBIO_', '');
                modeBody = 'TASK (V7 — MATERIAL SWAP): Replace the target material(s) on [IMAGE 1] with 100% fidelity to the attached swatch(es), covering 100% of the casco/frame with realistic micro-scale texture while locking exact furniture geometry.\n' + hero34;
            } else if (m7 === 'ENTORNO') {
                badge7 = 'ENTORNO';
                title7 = 'V7 · Entorno — ' + roomObj.label;
                modeBody = 'TASK (V7 — LIFESTYLE ROOM): Place [IMAGE 1] unaltered inside this interior: ' + roomObj.en + '. Match natural daylight and subtle floor contact shadows while keeping the furniture design, real proportions, and colors 100% faithful.';
            } else if (m7 === 'PLANO_CAD') {
                badge7 = 'CAD';
                modeBody = 'TASK (V7 — TECHNICAL CAD SHEET): Generate a 2048x2048 orthographic technical CAD blueprint of [IMAGE 1] (Front, Side, Top views) on pure #FFFFFF white with crisp black architectural linework' + (cfg.dimensions ? (' and exact dimensions: ' + cfg.dimensions + '.') : ' and proportional metric dimension callouts.');
            } else if (m7 === 'FONDO_BLANCO') {
                badge7 = '#FFFFFF';
                modeBody = 'TASK (V7 — PURE WHITE EXTRACTION): Extract [IMAGE 1] cleanly onto a 2048x2048 100% solid pure white #FFFFFF background without distorting proportions, removing all store clutter, floor reflections, and cast shadows.\n' + hero34;
            } else {
                badge7 = 'HD 8K';
                modeBody = 'TASK (V7 — HD 8K RESTORATION / COLOR CLONE): Restore sharpness, remove noise/compression artifacts, clean lighting to studio quality, and unify exact finish color across [IMAGE 1].\n' + hero34;
            }

            const prompt7 = [
                'STUDIO ENGINE V7 · CREATA FURNITURE PHOTOGRAPHY.',
                modelBlock,
                headerText,
                slotBlock7,
                modeBody,
                matBlock7,
                'GEOMETRY LOCK: ' + catRule + ' Never invent extra pillows, props, logos, or text.'
            ].filter(Boolean).join('\n\n');

            return [{ id: 'v7_main', title: title7, badge: badge7, prompt: prompt7 }];
        }

        // ---------------------------------------------------------------------
        // VERSIÓN 1 · CLÁSICA ORIGINAL (AI Studio + Flux/Midjourney + ChatGPT)
        // ---------------------------------------------------------------------
        const m1 = cfg.v1Mode || 'RESTAURAR_HD';
        const prodDesc = cfg.productName || 'luxury furniture piece shown in the reference photo';
        const fabLabel = cfg.fabricSwatch ? stripFileExt(cfg.fabricSwatch.name) : '';
        const woodLabel = cfg.woodSwatch ? stripFileExt(cfg.woodSwatch.name) : '';
        const matClause = [
            fabLabel ? ('upholstered 100% in "' + fabLabel + '" fabric from the attached swatch') : '',
            woodLabel ? ('with "' + woodLabel + '" wood finish from the attached swatch') : ''
        ].filter(Boolean).join(' and ');

        let taskEn = '';
        if (m1 === 'RESTAURAR_HD') {
            taskEn = 'Restore and enhance this photograph of ' + prodDesc + ' to ultra-sharp 2048x2048 (2K) commercial furniture catalog quality, keeping exact silhouette, proportions (zero distortion), and craftsmanship.';
        } else if (m1 === 'EXTRAER_BLANCO') {
            taskEn = 'Extract ' + prodDesc + ' cleanly onto a pure solid white #FFFFFF studio background (2048x2048, ~78% proportional centered framing without warping, zero cast shadows, no background clutter).';
        } else if (m1 === 'CAMBIO_MATERIAL') {
            taskEn = 'Keep the exact geometry and design of ' + prodDesc + ', re-rendering it ' + (matClause || 'with the attached material swatch applied uniformly across 100% of the target surface') + ' on a 2048x2048 pure white #FFFFFF studio background.';
        } else {
            taskEn = 'Generate clean matching 2048x2048 studio catalog perspectives (Front 0°, 3/4 Facing Right, 3/4 Facing Left [opposite orbit, never mirrored], and Side Profile 90°) of ' + prodDesc + (matClause ? (' ' + matClause) : '') + ' on a pure white #FFFFFF background with zero shadows.';
        }

        const aiStudioV1 = [
            modelBlock,
            'Using the attached reference image(s), ' + taskEn,
            cfg.dimensions ? ('Maintain exact proportions for dimensions: ' + cfg.dimensions + '.') : '',
            'Studio rules: 2048x2048 (1:1, 2K), 85mm rectilinear lens, pure #FFFFFF seamless background, balanced 78% proportional framing (never deform sofa/armchair), zero drop shadows, ' + catRule,
            cfg.extraNotes ? ('Additional notes: ' + cfg.extraNotes) : ''
        ].filter(Boolean).join('\n');

        const fluxMjV1 = [
            'Commercial studio furniture photography of ' + prodDesc + (matClause ? (', ' + matClause) : '') + ',',
            m1 === 'MULTI_PERSPECTIVA' ? '3/4 front-right hero angle (front facing right edge) and matching elevations,' : '3/4 front-right studio hero view (front facing right edge, backrest left),',
            '2048x2048 square pure solid white #FFFFFF seamless infinity background, zero cast shadows, 85mm rectilinear lens, true undistorted furniture proportions, ultra-detailed realistic fabric weave and wood grain, crisp softbox lighting, centered 78% catalog framing --ar 1:1 --stylize 100'
        ].join(' ');

        const dalleV1 = [
            'Please edit/generate a 2048x2048 studio e-commerce catalog photograph based on the uploaded furniture photo.',
            taskEn,
            'Keep every structural detail and physical proportion identical to the original piece (do not stretch/compress sofas, do not add extra cushions, props, or text). Center the furniture proportionally at ~78% of a square 1:1 (2048x2048) pure white (#FFFFFF) canvas with zero floor shadows and crisp natural studio lighting.'
        ].join('\n\n');

        return [
            { id: 'v1_aistudio', title: 'V1 · Google AI Studio / Nano Banana 2.1 · Gemini 3 Pro', badge: 'AI STUDIO', prompt: aiStudioV1 },
            { id: 'v1_flux', title: 'V1 · Flux / Midjourney', badge: 'FLUX / MJ', prompt: fluxMjV1 },
            { id: 'v1_dalle', title: 'V1 · ChatGPT / DALL-E', badge: 'CHATGPT', prompt: dalleV1 }
        ];
    }

    // =========================================================================
    // UTILIDADES DE ARCHIVOS, DRIVE SOLO LECTURA, COPIA PNG Y GEMINI OPCIONAL
    // =========================================================================
    function fileToResizedDataUri(file, maxEdge) {
        const limit = maxEdge || 1600;
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
            reader.onload = () => {
                const rawUri = String(reader.result || '');
                if (typeof Image === 'undefined' || typeof document === 'undefined') {
                    resolve(rawUri);
                    return;
                }
                const img = new Image();
                img.onload = () => {
                    try {
                        const w = img.naturalWidth || img.width || 1;
                        const h = img.naturalHeight || img.height || 1;
                        if (w <= limit && h <= limit) {
                            resolve(rawUri);
                            return;
                        }
                        const scale = Math.min(limit / w, limit / h);
                        const c = document.createElement('canvas');
                        c.width = Math.max(1, Math.round(w * scale));
                        c.height = Math.max(1, Math.round(h * scale));
                        const ctx = c.getContext('2d');
                        ctx.drawImage(img, 0, 0, c.width, c.height);
                        resolve(c.toDataURL('image/jpeg', 0.92));
                    } catch (eC) {
                        resolve(rawUri);
                    }
                };
                img.onerror = () => resolve(rawUri);
                img.src = rawUri;
            };
            reader.readAsDataURL(file);
        });
    }

    async function loadFurnitureFile(file, sourceLabel) {
        if (!file || !/^image\//i.test(file.type || 'image/jpeg')) return;
        const dataUri = await fileToResizedDataUri(file, 1800);
        state.furniturePhoto = {
            name: cleanStr(file.name) || ('mueble_' + Date.now() + '.jpg'),
            previewUrl: dataUri,
            dataUri: dataUri,
            source: sourceLabel || 'local',
            fileId: ''
        };
        state.visionAnalysis = '';
        renderStudio();
        showStudioToast('📸 Foto de mueble cargada (' + state.furniturePhoto.name + ').', 'ok');
    }

    async function loadLocalSwatchFile(file, kind) {
        if (!file || !/^image\//i.test(file.type || 'image/jpeg')) return;
        const dataUri = await fileToResizedDataUri(file, 1400);
        const item = {
            name: cleanStr(file.name) || ((kind === 'MADERA' ? 'madera_' : 'tela_') + Date.now() + '.jpg'),
            previewUrl: dataUri,
            dataUri: dataUri,
            source: 'local',
            fileId: ''
        };
        if (kind === 'MADERA') state.woodSwatch = item;
        else state.fabricSwatch = item;
        renderStudio();
        showStudioToast('✅ Muestra cargada: ' + item.name, 'ok');
    }

    async function fetchReadOnlyMaterials(forceRefresh) {
        const bridge = getBridge();
        if (!bridge || typeof bridge.callScript !== 'function') {
            state.materialsError = 'Conecta primero AppsScript_Prompts_Odoo.gs en ☁️ Odoo / Sheet (arriba) para leer Maderas y Telas desde Drive.';
            renderStudio();
            return;
        }
        state.materialsLoading = true;
        state.materialsError = '';
        renderStudio();
        try {
            const res = await bridge.callScript('prompts_materials_list', { forceRefresh: !!forceRefresh });
            if (res && res.ok) {
                state.telasList = Array.isArray(res.telas) ? res.telas : [];
                state.maderasList = Array.isArray(res.maderas) ? res.maderas : [];
                state.materialsLoaded = true;
                state.materialsError = '';
            } else {
                state.materialsError = (res && res.error) || 'No se pudieron leer las carpetas TELAS y MADERAS.';
            }
        } catch (err) {
            state.materialsError = (err && err.message) || 'Configura primero la URL /exec y PIN en ☁️ Odoo / Sheet.';
        } finally {
            state.materialsLoading = false;
            renderStudio();
        }
    }

    async function fetchDriveSource(sourceKey) {
        const bridge = getBridge();
        state.activeSourceTab = sourceKey;
        state.sourceFiles = [];
        state.sourceError = '';
        if (!bridge || typeof bridge.callScript !== 'function') {
            state.sourceError = 'Conecta AppsScript_Prompts_Odoo.gs en ☁️ Odoo / Sheet para leer carpetas de Drive.';
            renderStudio();
            return;
        }
        state.sourceLoading = true;
        renderStudio();
        try {
            const res = await bridge.callScript('prompts_sources_list', { sourceKey: sourceKey });
            if (res && res.ok && Array.isArray(res.files)) {
                state.sourceFiles = res.files;
                if (!res.files.length) state.sourceError = 'No se encontraron imágenes en esta carpeta.';
            } else {
                state.sourceError = (res && res.error) || 'No se pudo leer la carpeta.';
            }
        } catch (err) {
            state.sourceError = (err && err.message) || 'Configura la URL /exec y PIN en ☁️ Odoo / Sheet.';
        } finally {
            state.sourceLoading = false;
            renderStudio();
        }
    }

    async function lookupSkuInStudio() {
        const skuVal = cleanStr(state.sku);
        if (skuVal.length < 3) {
            showStudioToast('Escribe al menos 3 caracteres del SKU.', 'err');
            return;
        }
        const bridge = getBridge();
        if (!bridge || typeof bridge.callScript !== 'function') {
            showStudioToast('Conecta AppsScript_Prompts_Odoo.gs en ☁️ Odoo / Sheet.', 'err');
            return;
        }
        showStudioToast('🔎 Buscando SKU ' + skuVal.toUpperCase() + '...', 'ok');
        try {
            const res = await bridge.callScript('prompts_sku_lookup', { sku: skuVal });
            if (res && res.ok && res.found && res.match) {
                const m = res.match;
                state.sku = cleanStr(m.sku || skuVal).toUpperCase();
                state.productName = cleanStr(m.nombre_nuevo || m.modelo || m.tipo_mueble || state.productName);
                state.dimensions = cleanStr(m.medidas || state.dimensions);
                const detCat = detectCategoryFromInputs((m.categoria || '') + ' ' + (m.tipo_mueble || '') + ' ' + state.productName, state.sku, 'AUTO');
                state.category = detCat;
                const notesParts = [];
                if (m.foto_tela_nom) notesParts.push('Tela sugerida Sheet: ' + m.foto_tela_nom);
                if (m.foto_madera_nom) notesParts.push('Madera sugerida Sheet: ' + m.foto_madera_nom);
                if (notesParts.length && !state.extraNotes) {
                    state.extraNotes = notesParts.join(' · ');
                }
                renderStudio();
                showStudioToast('✅ SKU cargado: ' + state.sku + (state.dimensions ? (' · ' + state.dimensions) : ''), 'ok');
            } else {
                showStudioToast((res && res.error) || 'SKU no encontrado en Base de Datos Generales.', 'err');
            }
        } catch (err) {
            showStudioToast((err && err.message) || 'Error consultando SKU.', 'err');
        }
    }

    async function copySlotImageAsPng(slotKey, btnEl) {
        const item = slotKey === 'FURNITURE'
            ? state.furniturePhoto
            : (slotKey === 'TELA' ? state.fabricSwatch : state.woodSwatch);
        if (!item) return false;
        const bridge = getBridge();
        if (btnEl) { btnEl.disabled = true; btnEl.textContent = '⏳ Copiando…'; }
        let ok = false;
        try {
            if (item.dataUri && bridge && typeof bridge.copyDataUriImage === 'function') {
                ok = await bridge.copyDataUriImage(item.dataUri);
            } else if (item.fileId && typeof window.copyProptDrivePhotoImage === 'function') {
                ok = await window.copyProptDrivePhotoImage(item.fileId, item.name, null);
            } else if (item.previewUrl && bridge && typeof bridge.copyDataUriImage === 'function') {
                ok = await bridge.copyDataUriImage(item.previewUrl);
            }
            if (ok) {
                if (btnEl) btnEl.textContent = '✅ Imagen copiada';
                showStudioToast('🖼️ Foto copiada al portapapeles como imagen PNG (' + item.name + ').', 'ok');
            } else {
                if (btnEl) btnEl.textContent = '⚠️ Reintentar';
                showStudioToast('No se pudo copiar la imagen. Verifica permisos del navegador o conecta Apps Script.', 'err');
            }
            return ok;
        } finally {
            setTimeout(() => {
                if (btnEl) { btnEl.disabled = false; btnEl.textContent = '🖼️ Copiar foto'; }
            }, 1800);
        }
    }

    async function analyzeFurnitureWithGeminiVision() {
        const apiKey = getSavedGeminiKey();
        if (!apiKey) {
            showStudioToast('Agrega tu API Key de Gemini en "⚙️ Gemini Vision (opcional)" primero.', 'err');
            return;
        }
        if (!state.furniturePhoto) {
            showStudioToast('Carga primero una foto de mueble para analizarla.', 'err');
            return;
        }
        state.visionLoading = true;
        renderStudio();
        try {
            let dataUri = cleanStr(state.furniturePhoto.dataUri);
            if (!dataUri && state.furniturePhoto.fileId) {
                const bridge = getBridge();
                if (bridge && typeof bridge.callScript === 'function') {
                    const b64Res = await bridge.callScript('prompts_fetch_image_b64', { fileId: state.furniturePhoto.fileId });
                    if (b64Res && b64Res.ok && b64Res.dataUri) {
                        dataUri = b64Res.dataUri;
                        state.furniturePhoto.dataUri = dataUri;
                    }
                }
            }
            const m = dataUri.match(/^data:([^;]+);base64,(.+)$/);
            if (!m) throw new Error('No se pudo obtener la imagen en base64 para Gemini Vision.');

            const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_MODEL + ':generateContent?key=' + encodeURIComponent(apiKey);
            const resp = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            {
                                text: 'Analyze this furniture photograph strictly as an industrial furniture product photographer for catalog accuracy. Return 5 concise bullet points in English describing ONLY verified physical anatomy: (1) Exact furniture type & module/seat count, (2) Armrest & backrest shape/cushion count, (3) Stitching/piping/tufting details, (4) Base/legs material & count, (5) Overall silhouette proportions. Zero marketing fluff.'
                            },
                            { inline_data: { mime_type: m[1], data: m[2] } }
                        ]
                    }]
                })
            });
            const json = await resp.json();
            const text = json && json.candidates && json.candidates[0] && json.candidates[0].content &&
                Array.isArray(json.candidates[0].content.parts)
                ? json.candidates[0].content.parts.map((p) => p.text || '').join('\n').trim()
                : '';
            if (!text) {
                throw new Error((json && json.error && json.error.message) || 'Gemini no devolvió análisis.');
            }
            state.visionAnalysis = text;
            state.generatedBlocks = generatePrompts();
            showStudioToast('✨ Anatomía verificada con Gemini Vision e integrada al prompt V8.', 'ok');
        } catch (err) {
            showStudioToast('⚠️ Error Gemini Vision: ' + ((err && err.message) || 'revisa tu API Key.'), 'err');
        } finally {
            state.visionLoading = false;
            renderStudio();
        }
    }

    async function copyPromptText(text, btnEl) {
        let copied = false;
        try {
            if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
                await navigator.clipboard.writeText(text);
                copied = true;
            }
        } catch (e) {}
        if (!copied && typeof document !== 'undefined') {
            try {
                const ta = document.createElement('textarea');
                ta.value = text;
                ta.style.position = 'fixed';
                ta.style.opacity = '0';
                document.body.appendChild(ta);
                ta.select();
                copied = document.execCommand('copy');
                document.body.removeChild(ta);
            } catch (e2) {}
        }
        if (btnEl) {
            const orig = btnEl.textContent;
            btnEl.textContent = copied ? '✅ Copiado' : '⚠️ Error';
            setTimeout(() => { btnEl.textContent = orig; }, 1600);
        }
        showStudioToast(copied ? '📋 Prompt copiado al portapapeles.' : 'No se pudo copiar automáticamente.', copied ? 'ok' : 'err');
        return copied;
    }

    function clearPhotosOnlyKeepSettings() {
        // NUNCA reinicia versión (V8/V7/V1), modo, ángulo, habitación ni checkboxes
        state.furniturePhoto = null;
        state.fabricSwatch = null;
        state.woodSwatch = null;
        state.sku = '';
        state.productName = '';
        state.dimensions = '';
        state.extraNotes = '';
        state.visionAnalysis = '';
        state.generatedBlocks = [];
        renderStudio();
        showStudioToast('🧹 Fotos y textos limpiados (tu versión ' + state.version + ' y opciones siguen iguales).', 'ok');
    }

    function showStudioToast(msg, kind) {
        const el = byId('studioToastBanner');
        if (!el) return;
        el.textContent = msg;
        el.className = 'studio-toast ' + (kind === 'err' ? 'is-err' : 'is-ok');
        clearTimeout(el._hideTimer);
        el._hideTimer = setTimeout(() => {
            el.className = 'studio-toast hidden';
        }, 3600);
    }

    // =========================================================================
    // RENDERIZADO DE LA INTERFAZ NATIVA (MÓVIL + PC)
    // =========================================================================
    function renderVersionTabs() {
        return VERSIONS.map((v) => {
            const act = state.version === v.id;
            return '<button type="button" class="st-ver-btn' + (act ? ' is-active' : '') + '" data-ver="' + v.id + '" onclick="CreataPromptsStudio.setVersion(\'' + v.id + '\')">' +
                '<span class="st-ver-title">' + escapeHtml(v.label) + '</span>' +
                '<span class="st-ver-badge">' + escapeHtml(v.badge) + '</span>' +
            '</button>';
        }).join('');
    }

    function renderModeControls() {
        if (state.version === 'V8') {
            const modeBtns = V8_MODES.map((m) =>
                '<button type="button" class="st-mode-pill' + (state.v8Mode === m.id ? ' is-active' : '') + '" onclick="CreataPromptsStudio.setMode(\'' + m.id + '\')">' +
                    escapeHtml(m.label) +
                '</button>'
            ).join('');
            const curMode = V8_MODES.find((m) => m.id === state.v8Mode) || V8_MODES[0];
            return '<div class="st-mode-grid">' + modeBtns + '</div>' +
                '<p class="st-mode-hint">' + escapeHtml(curMode.hint) + '</p>';
        }
        if (state.version === 'V7') {
            const modeBtns = V7_MODES.map((m) =>
                '<button type="button" class="st-mode-pill' + (state.v7Mode === m.id ? ' is-active' : '') + '" onclick="CreataPromptsStudio.setMode(\'' + m.id + '\')">' +
                    escapeHtml(m.label) +
                '</button>'
            ).join('');
            return '<div class="st-mode-grid">' + modeBtns + '</div>';
        }
        const modeBtns = V1_MODES.map((m) =>
            '<button type="button" class="st-mode-pill' + (state.v1Mode === m.id ? ' is-active' : '') + '" onclick="CreataPromptsStudio.setMode(\'' + m.id + '\')">' +
                escapeHtml(m.label) +
            '</button>'
        ).join('');
        return '<div class="st-mode-grid">' + modeBtns + '</div>';
    }

    function renderContextualOptions() {
        const showAngle = (state.version === 'V8' && state.v8Mode === 'SINGLE_VIEW') || (state.version === 'V7' && state.v7Mode === '1_VISTA');
        const showRoom = (state.version === 'V8' && (state.v8Mode === 'ENVIRONMENT' || state.v8Mode === 'PACK_CREATA')) || (state.version === 'V7' && state.v7Mode === 'ENTORNO');
        const showMatTarget = (state.version === 'V8' && state.v8Mode === 'MATERIAL_SWAP') || (state.version === 'V1' && state.v1Mode === 'CAMBIO_MATERIAL');

        const parts = [];
        if (showAngle) {
            parts.push(
                '<div class="st-field-group">' +
                    '<label class="st-label" for="stAngleSelect">🎯 Ángulo exacto</label>' +
                    '<select id="stAngleSelect" class="st-input" onchange="CreataPromptsStudio.setField(\'angleId\', this.value)">' +
                        SINGLE_ANGLES.map((a) => '<option value="' + a.id + '"' + (state.angleId === a.id ? ' selected' : '') + '>' + escapeHtml(a.label) + '</option>').join('') +
                    '</select>' +
                '</div>'
            );
        }
        if (showRoom) {
            parts.push(
                '<div class="st-field-group">' +
                    '<label class="st-label" for="stRoomSelect">🛋️ Habitación / Ambiente CREATA</label>' +
                    '<select id="stRoomSelect" class="st-input" onchange="CreataPromptsStudio.setField(\'roomId\', this.value)">' +
                        ROOM_ENVIRONMENTS.map((r) => '<option value="' + r.id + '"' + (state.roomId === r.id ? ' selected' : '') + '>' + escapeHtml(r.label) + '</option>').join('') +
                    '</select>' +
                '</div>'
            );
        }
        if (showMatTarget) {
            parts.push(
                '<div class="st-field-group">' +
                    '<span class="st-label">🧵🪵 Qué material cambiar</span>' +
                    '<div class="st-seg-row">' +
                        ['TELA', 'MADERA', 'DUAL'].map((t) => {
                            const lbl = t === 'TELA' ? '🧵 Solo Tela' : (t === 'MADERA' ? '🪵 Solo Madera' : '🧵🪵 Dual (Ambos)');
                            return '<button type="button" class="st-seg-btn' + (state.materialTarget === t ? ' is-active' : '') + '" onclick="CreataPromptsStudio.setField(\'materialTarget\', \'' + t + '\')">' + lbl + '</button>';
                        }).join('') +
                    '</div>' +
                '</div>'
            );
        }

        const curModel = getTargetModelObj(state.targetModel);
        parts.push(
            '<div class="st-field-group">' +
                '<label class="st-label" for="stModelSelect">🤖 Modelo IA (Google AI Studio / Gemini)</label>' +
                '<select id="stModelSelect" class="st-input" onchange="CreataPromptsStudio.setField(\'targetModel\', this.value)">' +
                    IMAGE_MODELS.map((m) => '<option value="' + m.id + '"' + (state.targetModel === m.id ? ' selected' : '') + '>' + escapeHtml(m.label) + '</option>').join('') +
                '</select>' +
            '</div>'
        );

        parts.push(
            '<div class="st-two-col">' +
                '<div class="st-field-group">' +
                    '<label class="st-label" for="stAspectSelect">📐 Formato / Lienzo</label>' +
                    '<select id="stAspectSelect" class="st-input" onchange="CreataPromptsStudio.setField(\'aspectRatio\', this.value)">' +
                        ASPECT_RATIO_OPTIONS.map((a) => '<option value="' + a.id + '"' + (state.aspectRatio === a.id ? ' selected' : '') + '>' + escapeHtml(a.label) + '</option>').join('') +
                    '</select>' +
                '</div>' +
                (curModel.supportsThinkingLevel
                    ? ('<div class="st-field-group">' +
                        '<label class="st-label" for="stThinkingSelect">🧠 Thinking (Nano Banana 2.1)</label>' +
                        '<select id="stThinkingSelect" class="st-input" onchange="CreataPromptsStudio.setField(\'thinkingLevel\', this.value)">' +
                            curModel.thinkingLevels.map((lvl) => '<option value="' + lvl + '"' + (state.thinkingLevel === lvl ? ' selected' : '') + '>' + escapeHtml(lvl.toUpperCase()) + '</option>').join('') +
                        '</select>' +
                      '</div>')
                    : '<div class="st-field-group"><span class="st-label">🧠 Thinking</span><div class="st-mode-hint">Gemini 3 Pro Image usa razonamiento Pro automático.</div></div>') +
            '</div>'
        );

        if (state.version !== 'V1') {
            parts.push(
                '<div class="st-toggles-row">' +
                    '<label class="st-check-pill">' +
                        '<input type="checkbox" ' + (state.forceCreataSpec ? 'checked' : '') + ' onchange="CreataPromptsStudio.setBool(\'forceCreataSpec\', this.checked)">' +
                        '<span>📐 2048×2048 · 78% parejo sin deformar · #FFFFFF · 0% sombras</span>' +
                    '</label>' +
                    (!showAngle
                        ? ('<label class="st-check-pill">' +
                            '<input type="checkbox" ' + (state.forceThreeQuarterRight ? 'checked' : '') + ' onchange="CreataPromptsStudio.setBool(\'forceThreeQuarterRight\', this.checked)">' +
                            '<span>↘️ 3/4 Mirando a la Derecha</span>' +
                          '</label>')
                        : '') +
                '</div>'
            );
        }
        return parts.join('');
    }

    function renderSelectedPhotoSlot(slotKey, item, emptyLabel) {
        if (!item) {
            return '<div class="st-slot-empty">' + escapeHtml(emptyLabel) + '</div>';
        }
        return '<div class="st-slot-filled">' +
            '<div class="st-slot-preview-wrap">' +
                '<img src="' + escapeHtml(item.previewUrl) + '" alt="' + escapeHtml(item.name) + '" class="st-slot-img" referrerpolicy="no-referrer">' +
            '</div>' +
            '<div class="st-slot-meta">' +
                '<div class="st-slot-name" title="' + escapeHtml(item.name) + '">' + escapeHtml(item.name) + '</div>' +
                '<div class="st-slot-actions">' +
                    '<button type="button" class="st-mini-btn is-accent" onclick="CreataPromptsStudio.copySlotPhoto(\'' + slotKey + '\', this)">🖼️ Copiar foto</button>' +
                    '<button type="button" class="st-mini-btn" onclick="CreataPromptsStudio.clearSlot(\'' + slotKey + '\')">✕ Quitar</button>' +
                '</div>' +
            '</div>' +
        '</div>';
    }

    function renderMaterialPickerDrawer() {
        if (!state.activeMaterialPicker) return '';
        const isWood = state.activeMaterialPicker === 'MADERA';
        const rawList = isWood ? state.maderasList : state.telasList;
        const q = normSearch(state.materialSearch);
        const filtered = q
            ? rawList.filter((f) => normSearch((f.name || '') + ' ' + (f.subfolder || '')).indexOf(q) !== -1)
            : rawList;

        let bodyHtml = '';
        if (state.materialsLoading) {
            bodyHtml = '<div class="st-empty-msg">Cargando muestras desde Google Drive (solo lectura)...</div>';
        } else if (state.materialsError) {
            bodyHtml = '<div class="st-empty-msg is-warn">' + escapeHtml(state.materialsError) +
                ' <button type="button" class="st-mini-btn is-accent" onclick="toggleProptDrawer(true)">⚙️ Abrir configuración</button></div>';
        } else if (!filtered.length) {
            bodyHtml = '<div class="st-empty-msg">Sin coincidencias en ' + (isWood ? 'MADERAS' : 'TELAS / FOTOS TELAS') + '.</div>';
        } else {
            bodyHtml = '<div class="st-swatch-grid">' + filtered.slice(0, 120).map((f) => {
                const fid = escapeHtml(f.id);
                const fname = escapeHtml(f.name || 'muestra.jpg');
                const thumb = escapeHtml(f.thumbUrl || ('https://lh3.googleusercontent.com/d/' + f.id + '=w400'));
                return '<div class="st-swatch-card">' +
                    '<button type="button" class="st-swatch-pick" onclick="CreataPromptsStudio.pickDriveMaterial(\'' + state.activeMaterialPicker + '\', \'' + fid + '\')">' +
                        '<img src="' + thumb + '" alt="' + fname + '" loading="lazy" decoding="async" referrerpolicy="no-referrer">' +
                        '<span class="st-swatch-lbl">' + fname + '</span>' +
                    '</button>' +
                    '<button type="button" class="st-swatch-cp" title="Copiar foto PNG" onclick="copyProptDrivePhotoImage(\'' + fid + '\', \'' + fname.replace(/'/g, '') + '\', this)">🖼️</button>' +
                '</div>';
            }).join('') + '</div>';
        }

        return '<div class="st-picker-panel">' +
            '<div class="st-picker-head">' +
                '<div>' +
                    '<strong>' + (isWood ? '🪵 Catálogo MADERAS' : '🧵 Catálogo TELAS + FOTOS TELAS') + ' (' + filtered.length + ')</strong>' +
                    '<span class="st-ro-badge">🔒 Solo lectura · nunca borra ni modifica</span>' +
                '</div>' +
                '<div class="st-picker-head-btns">' +
                    '<button type="button" class="st-mini-btn" onclick="CreataPromptsStudio.refreshMaterials()" title="Recargar de Drive">↻</button>' +
                    '<button type="button" class="st-mini-btn" onclick="CreataPromptsStudio.closeMaterialPicker()">✕</button>' +
                '</div>' +
            '</div>' +
            '<input type="search" id="stMaterialSearchInp" class="st-input st-picker-search" placeholder="Buscar por nombre o color..." value="' + escapeHtml(state.materialSearch) + '" oninput="CreataPromptsStudio.setMaterialSearch(this.value)">' +
            bodyHtml +
        '</div>';
    }

    function renderDriveSourcePanel() {
        if (!state.activeSourceTab) return '';
        let body = '';
        if (state.sourceLoading) {
            body = '<div class="st-empty-msg">Leyendo carpeta de Drive (solo lectura)...</div>';
        } else if (state.sourceError) {
            body = '<div class="st-empty-msg is-warn">' + escapeHtml(state.sourceError) + '</div>';
        } else {
            body = '<div class="st-swatch-grid">' + state.sourceFiles.slice(0, 60).map((f) => {
                const fid = escapeHtml(f.id);
                const fname = escapeHtml(f.name || 'foto.jpg');
                const thumb = escapeHtml(f.thumbUrl || ('https://lh3.googleusercontent.com/d/' + f.id + '=w400'));
                return '<div class="st-swatch-card">' +
                    '<button type="button" class="st-swatch-pick" onclick="CreataPromptsStudio.pickDriveFurniture(\'' + fid + '\')">' +
                        '<img src="' + thumb + '" alt="' + fname + '" loading="lazy" decoding="async" referrerpolicy="no-referrer">' +
                        '<span class="st-swatch-lbl">' + fname + '</span>' +
                    '</button>' +
                    '<button type="button" class="st-swatch-cp" title="Copiar foto PNG" onclick="copyProptDrivePhotoImage(\'' + fid + '\', \'' + fname.replace(/'/g, '') + '\', this)">🖼️</button>' +
                '</div>';
            }).join('') + '</div>';
        }
        return '<div class="st-picker-panel">' +
            '<div class="st-picker-head">' +
                '<strong>📂 Carpeta Drive · ' + escapeHtml(state.activeSourceTab) + ' (' + state.sourceFiles.length + ')</strong>' +
                '<button type="button" class="st-mini-btn" onclick="CreataPromptsStudio.closeSourcePanel()">✕</button>' +
            '</div>' +
            body +
        '</div>';
    }

    function renderGeneratedOutputs() {
        if (!state.generatedBlocks.length) {
            return '<div class="st-out-empty">Configura tus fotos o datos y pulsa <strong>⚡ Generar Prompt</strong>. Tu resultado aparecerá aquí en menos de 0.1 segundos, listo para pegar en AI Studio, Gemini o ChatGPT.</div>';
        }
        return state.generatedBlocks.map((b, idx) => {
            return '<article class="st-out-card">' +
                '<div class="st-out-head">' +
                    '<div>' +
                        '<span class="st-out-badge">' + escapeHtml(b.badge) + '</span>' +
                        '<h3 class="st-out-title">' + escapeHtml(b.title) + '</h3>' +
                    '</div>' +
                    '<button type="button" class="st-btn-primary st-btn-sm" onclick="CreataPromptsStudio.copyGenerated(' + idx + ', this)">📋 Copiar</button>' +
                '</div>' +
                '<textarea class="st-out-textarea" readonly rows="9">' + escapeHtml(b.prompt) + '</textarea>' +
            '</article>';
        }).join('');
    }

    function renderStudio() {
        if (!rootEl) return;
        const verObj = VERSIONS.find((v) => v.id === state.version) || VERSIONS[0];
        const hasGeminiKey = Boolean(getSavedGeminiKey());

        rootEl.innerHTML =
            '<div class="st-wrap">' +
                '<div id="studioToastBanner" class="studio-toast hidden" role="status" aria-live="polite"></div>' +

                '<!-- BARRA DE VERSIONES: SOLO V8 PRO · V7 · V1 -->' +
                '<section class="st-card st-ver-card">' +
                    '<div class="st-ver-row">' + renderVersionTabs() + '</div>' +
                    '<div class="st-ver-subrow">' +
                        '<p class="st-ver-desc">' + escapeHtml(verObj.desc) + '</p>' +
                        '<div class="st-ver-quick-actions">' +
                            '<button type="button" class="st-mini-btn" onclick="CreataPromptsStudio.clearPhotos()" title="Limpia fotos y textos sin reiniciar tu versión ni modo">🧹 Borrar fotos</button>' +
                            '<button type="button" class="st-mini-btn is-odoo" onclick="switchPromptsWorkspace(\'odoo\')" title="Abrir Render dedicado a Alta de Odoo">🚀 Alta de Odoo (Render)</button>' +
                        '</div>' +
                    '</div>' +
                '</section>' +

                '<div class="st-grid">' +
                    '<!-- COLUMNA IZQUIERDA: FOTOS + MATERIALES SOLO LECTURA + SKU -->' +
                    '<div class="st-col-left">' +
                        '<!-- 1. FOTO DEL MUEBLE -->' +
                        '<section class="st-card">' +
                            '<div class="st-card-head">' +
                                '<h2>1. Foto del mueble (IMAGE 1)</h2>' +
                                '<span class="st-hint-chip">Ctrl+V · Arrastra · Cámara · Drive</span>' +
                            '</div>' +
                            renderSelectedPhotoSlot('FURNITURE', state.furniturePhoto, 'Sube, pega (Ctrl+V) o elige una foto del mueble desde Drive.') +
                            '<div class="st-upload-actions">' +
                                '<label class="st-btn-secondary st-btn-sm">📷 Cámara<input type="file" accept="image/*" capture="environment" class="hidden" onchange="CreataPromptsStudio.onFurnitureFileInput(this)"></label>' +
                                '<label class="st-btn-primary st-btn-sm">🖼️ Archivo / Galería<input type="file" accept="image/*" class="hidden" onchange="CreataPromptsStudio.onFurnitureFileInput(this)"></label>' +
                            '</div>' +
                            '<div class="st-drive-src-bar">' +
                                '<span class="st-mini-lbl">Drive (solo lectura):</span>' +
                                '<button type="button" class="st-mini-btn' + (state.activeSourceTab === 'SM_MUEBLERIA' ? ' is-accent' : '') + '" onclick="CreataPromptsStudio.openDriveSource(\'SM_MUEBLERIA\')">SM S Mueblería</button>' +
                                '<button type="button" class="st-mini-btn' + (state.activeSourceTab === 'COTIZACION' ? ' is-accent' : '') + '" onclick="CreataPromptsStudio.openDriveSource(\'COTIZACION\')">Cotización</button>' +
                                '<button type="button" class="st-mini-btn' + (state.activeSourceTab === 'SUBIR_PROPT' ? ' is-accent' : '') + '" onclick="CreataPromptsStudio.openDriveSource(\'SUBIR_PROPT\')">SUBIR PROPT</button>' +
                            '</div>' +
                            renderDriveSourcePanel() +
                        '</section>' +

                        '<!-- 2. TELAS Y MADERAS (DRIVE SOLO LECTURA) -->' +
                        '<section class="st-card">' +
                            '<div class="st-card-head">' +
                                '<h2>2. Telas y Maderas (Solo Lectura)</h2>' +
                                '<span class="st-ro-badge">🔒 Nunca borra ni modifica</span>' +
                            '</div>' +
                            '<div class="st-mat-dual-grid">' +
                                '<div class="st-mat-box">' +
                                    '<div class="st-mat-box-head">' +
                                        '<strong>🧵 Tela (IMAGE 2)</strong>' +
                                        '<div class="st-mat-box-btns">' +
                                            '<button type="button" class="st-mini-btn is-accent" onclick="CreataPromptsStudio.openMaterialPicker(\'TELA\')">📂 Drive Telas</button>' +
                                            '<label class="st-mini-btn">+ Local<input type="file" accept="image/*" class="hidden" onchange="CreataPromptsStudio.onSwatchFileInput(\'TELA\', this)"></label>' +
                                        '</div>' +
                                    '</div>' +
                                    renderSelectedPhotoSlot('TELA', state.fabricSwatch, 'Opcional · elige muestra de TELAS / FOTOS TELAS') +
                                '</div>' +
                                '<div class="st-mat-box">' +
                                    '<div class="st-mat-box-head">' +
                                        '<strong>🪵 Madera (IMAGE 3)</strong>' +
                                        '<div class="st-mat-box-btns">' +
                                            '<button type="button" class="st-mini-btn is-accent" onclick="CreataPromptsStudio.openMaterialPicker(\'MADERA\')">📂 Drive Maderas</button>' +
                                            '<label class="st-mini-btn">+ Local<input type="file" accept="image/*" class="hidden" onchange="CreataPromptsStudio.onSwatchFileInput(\'MADERA\', this)"></label>' +
                                        '</div>' +
                                    '</div>' +
                                    renderSelectedPhotoSlot('MADERA', state.woodSwatch, 'Opcional · elige muestra de MADERAS') +
                                '</div>' +
                            '</div>' +
                            renderMaterialPickerDrawer() +
                        '</section>' +

                        '<!-- 3. DATOS DEL PRODUCTO Y SKU -->' +
                        '<section class="st-card">' +
                            '<div class="st-card-head">' +
                                '<h2>3. Producto, SKU y Medidas</h2>' +
                            '</div>' +
                            '<div class="st-sku-lookup-row">' +
                                '<input type="text" class="st-input" placeholder="SKU (ej. HAK1PLUM...)" value="' + escapeHtml(state.sku) + '" oninput="CreataPromptsStudio.setFieldSilent(\'sku\', this.value)" onkeydown="if(event.key===\'Enter\') CreataPromptsStudio.lookupSku()">' +
                                '<button type="button" class="st-btn-secondary st-btn-sm" onclick="CreataPromptsStudio.lookupSku()">🔎 Autocompletar SKU</button>' +
                            '</div>' +
                            '<div class="st-two-col">' +
                                '<input type="text" class="st-input" placeholder="Nombre del mueble (ej. Sala Modular Milán)" value="' + escapeHtml(state.productName) + '" oninput="CreataPromptsStudio.setFieldSilent(\'productName\', this.value)">' +
                                '<input type="text" class="st-input" placeholder="Medidas (ej. 240 x 95 x 82 cm)" value="' + escapeHtml(state.dimensions) + '" oninput="CreataPromptsStudio.setFieldSilent(\'dimensions\', this.value)">' +
                            '</div>' +
                            '<div class="st-two-col">' +
                                '<select class="st-input" onchange="CreataPromptsStudio.setField(\'category\', this.value)">' +
                                    CATEGORIES.map((c) => '<option value="' + c.id + '"' + (state.category === c.id ? ' selected' : '') + '>' + escapeHtml(c.label) + '</option>').join('') +
                                '</select>' +
                                '<input type="text" class="st-input" placeholder="Notas extra (ej. patas negras, sin cojines)" value="' + escapeHtml(state.extraNotes) + '" oninput="CreataPromptsStudio.setFieldSilent(\'extraNotes\', this.value)">' +
                            '</div>' +
                            '<details class="st-gemini-details">' +
                                '<summary>⚙️ Gemini Vision opcional (' + (hasGeminiKey ? '✅ API Key guardada solo en este dispositivo' : 'Sin clave · generación instantánea offline') + ')</summary>' +
                                '<div class="st-gemini-body">' +
                                    '<p class="st-mode-hint">Tu clave se guarda únicamente en este navegador (nunca en el repositorio). Si la agregas, puedes analizar la foto real del mueble con Gemini Vision antes de generar el prompt.</p>' +
                                    '<div class="st-sku-lookup-row">' +
                                        '<input type="password" id="stGeminiKeyInput" class="st-input" placeholder="AIza..." value="' + escapeHtml(getSavedGeminiKey()) + '">' +
                                        '<button type="button" class="st-btn-secondary st-btn-sm" onclick="CreataPromptsStudio.saveKeyFromInput()">Guardar clave</button>' +
                                    '</div>' +
                                    (hasGeminiKey
                                        ? ('<button type="button" class="st-btn-secondary st-btn-sm" ' + (state.visionLoading ? 'disabled' : '') + ' onclick="CreataPromptsStudio.runGeminiVision()">' + (state.visionLoading ? '⏳ Analizando foto...' : '✨ Analizar foto con Gemini Vision') + '</button>')
                                        : '') +
                                    (state.visionAnalysis
                                        ? ('<pre class="st-vision-pre">' + escapeHtml(state.visionAnalysis) + '</pre>')
                                        : '') +
                                '</div>' +
                            '</details>' +
                        '</section>' +
                    '</div>' +

                    '<!-- COLUMNA DERECHA: MODO + GENERAR + RESULTADOS -->' +
                    '<div class="st-col-right">' +
                        '<section class="st-card">' +
                            '<div class="st-card-head">' +
                                '<h2>4. Modo y Opciones (' + escapeHtml(state.version) + ')</h2>' +
                            '</div>' +
                            renderModeControls() +
                            renderContextualOptions() +
                            '<div class="st-generate-row">' +
                                '<button type="button" id="btnGeneratePromptsNow" class="st-btn-generate" onclick="CreataPromptsStudio.generateNow()">⚡ Generar Prompt ' + escapeHtml(state.version) + '</button>' +
                            '</div>' +
                            '<div class="st-launch-bar">' +
                                '<a class="st-launch-pill" href="https://aistudio.google.com/prompts/new_chat" target="_blank" rel="noopener">✨ Abrir AI Studio</a>' +
                                '<a class="st-launch-pill" href="https://gemini.google.com/app" target="_blank" rel="noopener">💎 Abrir Gemini</a>' +
                                '<a class="st-launch-pill" href="https://chatgpt.com/" target="_blank" rel="noopener">🤖 Abrir ChatGPT</a>' +
                            '</div>' +
                        '</section>' +

                        '<section class="st-card st-results-card">' +
                            '<div class="st-card-head">' +
                                '<h2>5. Prompts Generados</h2>' +
                                (state.generatedBlocks.length ? ('<span class="st-out-badge">' + state.generatedBlocks.length + ' listo(s)</span>') : '') +
                            '</div>' +
                            renderGeneratedOutputs() +
                        '</section>' +
                    '</div>' +
                '</div>' +
            '</div>';
    }

    function bindGlobalPasteHandler() {
        if (typeof window === 'undefined' || window.__creataPromptsPasteBound) return;
        window.__creataPromptsPasteBound = true;
        window.addEventListener('paste', (ev) => {
            if (!rootEl || rootEl.classList.contains('hidden')) return;
            const items = ev && ev.clipboardData && ev.clipboardData.items;
            if (!items) return;
            for (let i = 0; i < items.length; i++) {
                if (items[i] && items[i].type && items[i].type.indexOf('image/') === 0) {
                    const file = items[i].getAsFile();
                    if (file) {
                        ev.preventDefault();
                        loadFurnitureFile(file, 'clipboard');
                        break;
                    }
                }
            }
        });
    }

    const api = {
        CANONICAL_STUDIO_PX: CANONICAL_STUDIO_PX,
        IMAGE_MODELS: IMAGE_MODELS,
        ASPECT_RATIO_OPTIONS: ASPECT_RATIO_OPTIONS,
        SINGLE_ANGLES: SINGLE_ANGLES,
        VERSIONS: VERSIONS,
        V8_MODES: V8_MODES,
        V7_MODES: V7_MODES,
        V1_MODES: V1_MODES,
        init: function (containerEl) {
            rootEl = containerEl || byId('promptsNativeStudio');
            if (!rootEl) return false;
            if (!initialized) {
                loadSavedPrefs();
                bindGlobalPasteHandler();
                initialized = true;
            }
            renderStudio();
            return true;
        },
        setVersion: function (ver) {
            if (ver !== 'V8' && ver !== 'V7' && ver !== 'V1') return;
            state.version = ver;
            savePrefs();
            if (state.generatedBlocks.length) {
                state.generatedBlocks = generatePrompts();
            }
            renderStudio();
        },
        setMode: function (modeId) {
            if (state.version === 'V8' && V8_MODES.some((m) => m.id === modeId)) state.v8Mode = modeId;
            else if (state.version === 'V7' && V7_MODES.some((m) => m.id === modeId)) state.v7Mode = modeId;
            else if (state.version === 'V1' && V1_MODES.some((m) => m.id === modeId)) state.v1Mode = modeId;
            savePrefs();
            if (state.generatedBlocks.length) {
                state.generatedBlocks = generatePrompts();
            }
            renderStudio();
        },
        setField: function (key, val) {
            state[key] = cleanStr(val);
            savePrefs();
            if (state.generatedBlocks.length) {
                state.generatedBlocks = generatePrompts();
            }
            renderStudio();
        },
        setFieldSilent: function (key, val) {
            state[key] = String(val || '');
        },
        setBool: function (key, val) {
            state[key] = Boolean(val);
            savePrefs();
            if (state.generatedBlocks.length) {
                state.generatedBlocks = generatePrompts();
            }
            renderStudio();
        },
        onFurnitureFileInput: function (inputEl) {
            const f = inputEl && inputEl.files && inputEl.files[0];
            if (f) loadFurnitureFile(f, 'local');
            if (inputEl) inputEl.value = '';
        },
        onSwatchFileInput: function (kind, inputEl) {
            const f = inputEl && inputEl.files && inputEl.files[0];
            if (f) loadLocalSwatchFile(f, kind);
            if (inputEl) inputEl.value = '';
        },
        openMaterialPicker: function (kind) {
            state.activeMaterialPicker = kind === 'MADERA' ? 'MADERA' : 'TELA';
            state.materialSearch = '';
            renderStudio();
            if (!state.materialsLoaded && !state.materialsLoading) {
                fetchReadOnlyMaterials(false);
            }
        },
        closeMaterialPicker: function () {
            state.activeMaterialPicker = '';
            renderStudio();
        },
        refreshMaterials: function () {
            fetchReadOnlyMaterials(true);
        },
        setMaterialSearch: function (val) {
            state.materialSearch = String(val || '');
            const scrollTop = rootEl ? rootEl.scrollTop : 0;
            renderStudio();
            const inp = byId('stMaterialSearchInp');
            if (inp) {
                inp.focus();
                try { inp.setSelectionRange(inp.value.length, inp.value.length); } catch (e) {}
            }
            if (rootEl) rootEl.scrollTop = scrollTop;
        },
        pickDriveMaterial: function (kind, fileId) {
            const list = kind === 'MADERA' ? state.maderasList : state.telasList;
            const found = list.find((f) => f && f.id === fileId);
            if (!found) return;
            const item = {
                id: found.id,
                fileId: found.id,
                name: found.name || 'muestra.jpg',
                previewUrl: found.thumbUrl || ('https://lh3.googleusercontent.com/d/' + found.id + '=w800'),
                dataUri: '',
                source: 'drive_readonly',
                subfolder: found.subfolder || ''
            };
            if (kind === 'MADERA') state.woodSwatch = item;
            else state.fabricSwatch = item;
            state.activeMaterialPicker = '';
            renderStudio();
            showStudioToast('🔒 Muestra seleccionada (solo lectura): ' + item.name, 'ok');
        },
        openDriveSource: function (sourceKey) {
            fetchDriveSource(sourceKey);
        },
        closeSourcePanel: function () {
            state.activeSourceTab = '';
            renderStudio();
        },
        pickDriveFurniture: function (fileId) {
            const found = state.sourceFiles.find((f) => f && f.id === fileId);
            if (!found) return;
            state.furniturePhoto = {
                id: found.id,
                fileId: found.id,
                name: found.name || 'mueble.jpg',
                previewUrl: found.thumbUrl || ('https://lh3.googleusercontent.com/d/' + found.id + '=w1000'),
                dataUri: '',
                source: 'drive_readonly'
            };
            if (!state.productName) {
                state.productName = stripFileExt(found.name);
            }
            state.visionAnalysis = '';
            state.activeSourceTab = '';
            renderStudio();
            showStudioToast('📸 Foto cargada desde Drive (solo lectura): ' + found.name, 'ok');
        },
        clearSlot: function (slotKey) {
            if (slotKey === 'FURNITURE') { state.furniturePhoto = null; state.visionAnalysis = ''; }
            else if (slotKey === 'TELA') state.fabricSwatch = null;
            else if (slotKey === 'MADERA') state.woodSwatch = null;
            renderStudio();
        },
        clearPhotos: clearPhotosOnlyKeepSettings,
        copySlotPhoto: copySlotImageAsPng,
        lookupSku: lookupSkuInStudio,
        saveKeyFromInput: function () {
            const inp = byId('stGeminiKeyInput');
            saveGeminiKey(inp ? inp.value : '');
            renderStudio();
            showStudioToast(getSavedGeminiKey() ? '🔑 Clave de Gemini guardada solo en este dispositivo.' : 'Clave eliminada.', 'ok');
        },
        runGeminiVision: analyzeFurnitureWithGeminiVision,
        generateNow: function () {
            state.generatedBlocks = generatePrompts();
            renderStudio();
            showStudioToast('⚡ ' + state.generatedBlocks.length + ' prompt(s) ' + state.version + ' listos.', 'ok');
            return state.generatedBlocks;
        },
        copyGenerated: function (idx, btnEl) {
            const blk = state.generatedBlocks[idx];
            if (!blk) return Promise.resolve(false);
            return copyPromptText(blk.prompt, btnEl);
        },
        generatePrompts: generatePrompts,
        detectCategoryFromInputs: detectCategoryFromInputs,
        getState: function () { return state; }
    };

    if (typeof window !== 'undefined') {
        window.CreataPromptsStudio = api;
    }
})();
