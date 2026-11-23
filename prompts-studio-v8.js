(function () {
    'use strict';

    const GEMINI_KEY_STORAGE = 'creata_prompts_gemini_key_v1';
    const PREFS_STORAGE = 'creata_prompts_studio_prefs_v9';
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
        'ANTI-MIRROR HANDEDNESS LOCK (3D ORBIT ONLY): NEVER mirror/flip [IMAGE 1]; physically orbit camera in 3D so asymmetric parts (chaise, L-corner, single arm, drawers) keep 100% true handedness.';

    const CANONICAL_34_RIGHT_PROMPT =
        '3/4 VIEW FACING TOWARD THE RIGHT (~35°–40°, 85mm rectilinear eye-level): front/seat opens toward RIGHT edge, backrest/left flank on LEFT. If [IMAGE 1] faces differently, physically orbit camera to achieve right-facing 3/4. ' +
        ANTI_MIRROR_HANDEDNESS_LOCK;

    const CANONICAL_34_RIGHT_EXCLUDE =
        'NEVER facing left, backrest on right, flat 0° frontal, mirrored/flipped';

    const CANONICAL_34_LEFT_PROMPT =
        '3/4 VIEW FACING TOWARD THE LEFT (~35°–40°, 85mm rectilinear eye-level): front/seat opens toward LEFT edge, backrest/right flank on RIGHT. If [IMAGE 1] faces differently, physically orbit camera to achieve left-facing 3/4. ' +
        ANTI_MIRROR_HANDEDNESS_LOCK;

    const CANONICAL_34_LEFT_EXCLUDE =
        'NEVER facing right, backrest on left, flat 0° frontal, mirrored/flipped';

    const VERSIONS = [
        { id: 'V8', label: 'V8 · CREATA Pro', badge: 'NUEVA', desc: 'Exclusiva CREATA: Paquete Cotizador 2048×2048 · 78% parejo sin deformar · #FFFFFF · 0% sombras · ángulo opcional · indicaciones especiales.' },
        { id: 'V7', label: 'V7 · Estudio 9 Modos', badge: '9 MODOS', desc: 'Estudio fotográfico completo con 9 modos, selector opcional de ángulo y 2048×2048 sin deformar.' },
        { id: 'V1', label: 'V1 · Clásica Original', badge: 'CLÁSICA', desc: 'Versión clásica directa con salida separada para AI Studio / Gemini, Flux / Midjourney y ChatGPT / DALL-E.' }
    ];

    const V8_MODES = [
        { id: 'PACK_CREATA', label: '📦 Paquete Cotizador CREATA', short: 'Paquete CREATA', hint: 'Genera 3 prompts listos: Foto Catálogo 2048×2048 (#FFFFFF · 0% sombras · sin deformar), Portada Ambiente y Plano CAD.' },
        { id: 'SEVEN_VIEWS', label: '📸 7 Vistas de Estudio', short: '7 Vistas', hint: 'Serie completa de 7 ángulos consistentes (3/4 Derecha y 3/4 Izquierda diferenciados) en 2048×2048.' },
        { id: 'SINGLE_VIEW', label: '🎯 1 Vista Específica (11 ángulos)', short: '1 Vista', hint: 'Genera un ángulo puntual exacto manteniendo proporciones intactas.' },
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

    const CAMERA_ANGLE_OPTIONS = [
        { id: 'ORIGINAL', label: '📷 Original de la foto (sin forzar 3/4)', en: '', exclude: '' },
        { id: 'THREE_QUARTER_RIGHT', label: '↘️ 3/4 Mirando a la Derecha', en: CANONICAL_34_RIGHT_PROMPT, exclude: CANONICAL_34_RIGHT_EXCLUDE },
        { id: 'THREE_QUARTER_LEFT', label: '↙️ 3/4 Mirando a la Izquierda', en: CANONICAL_34_LEFT_PROMPT, exclude: CANONICAL_34_LEFT_EXCLUDE },
        { id: 'FRONT', label: '⬆️ Frontal Recta (0°)', en: SINGLE_ANGLES[1].en, exclude: SINGLE_ANGLES[1].exclude },
        { id: 'SIDE_RIGHT', label: '➡️ Perfil Derecho (90°)', en: SINGLE_ANGLES[3].en, exclude: SINGLE_ANGLES[3].exclude },
        { id: 'SIDE_LEFT', label: '⬅️ Perfil Izquierdo (-90°)', en: SINGLE_ANGLES[4].en, exclude: SINGLE_ANGLES[4].exclude },
        { id: 'BACK', label: '⬇️ Vista Trasera (180°)', en: SINGLE_ANGLES[5].en, exclude: SINGLE_ANGLES[5].exclude },
        { id: 'TOP_DOWN', label: '🛰️ Cenital / Aérea (90°)', en: SINGLE_ANGLES[6].en, exclude: SINGLE_ANGLES[6].exclude },
        { id: 'HIGH_ANGLE', label: '📐 Picada 45°', en: SINGLE_ANGLES[7].en, exclude: SINGLE_ANGLES[7].exclude },
        { id: 'LOW_HERO', label: '🏛️ Contrapicada Editorial', en: SINGLE_ANGLES[8].en, exclude: SINGLE_ANGLES[8].exclude }
    ];

    const SPECIAL_DIRECTIVE_PRESETS = [
        { id: 'ONLY_ONE_MODULE', label: '🧩 Solo 1 módulo', text: 'Dejar ÚNICAMENTE 1 módulo individual aislado (eliminar los demás módulos adjuntos y reconstruir limpiamente el costado expuesto con la misma tapicería y costuras).' },
        { id: 'LARGER_SCALE', label: '🔍 Más grande', text: 'Colocar el mueble más grande y cercano ocupando ~88% del encuadre sin recortar ningún borde ni deformar proporciones.' },
        { id: 'SMALLER_SCALE', label: '📐 Más chico / aire', text: 'Colocar el mueble más pequeño (~65% del encuadre) con mayor margen blanco limpio alrededor.' },
        { id: 'NO_PILLOWS', label: '🛋️ Sin cojines', text: 'Quitar todos los cojines decorativos sueltos y mostrar el respaldo y asiento limpios con la misma tapicería.' },
        { id: 'LEGS_ONLY', label: '🪵 Solo cambiar patas', text: 'Modificar únicamente el acabado/color de las patas o base manteniendo 100% intacto el resto del mueble.' },
        { id: 'REMOVE_EXTRAS', label: '✂️ Quitar extras', text: 'Eliminar cualquier objeto alrededor (mesas, tapetes, lámparas, plantas o fondos) dejando solo el mueble principal.' }
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
        cameraAngle: 'ORIGINAL', // ORIGINAL (sin forzar 3/4) | THREE_QUARTER_RIGHT | THREE_QUARTER_LEFT | FRONT | ...
        roomId: 'RIVIERA_TULUM',
        category: 'AUTO',
        materialTarget: 'DUAL', // TELA | MADERA | DUAL
        targetModel: 'gemini-nano-banana-2.1', // gemini-nano-banana-2.1 | gemini-3-pro-image
        aspectRatio: '1:1', // 1:1 (2048x2048) | 4:3 | 3:2 | 16:9
        thinkingLevel: 'medium', // minimal | medium | high (solo Nano Banana 2.1)
        forceCreataSpec: true, // 2048x2048 · 78% parejo sin deformar · #FFFFFF · 0% sombras
        forceThreeQuarterRight: false,
        includeSpanishNotes: true,
        sku: '',
        productName: '',
        outputName: '',
        dimensions: '',
        extraNotes: '',
        specialDirectives: '',
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
        geminiOpen: false,
        advancedOpen: false,
        activeOutTab: 0,
        generatedBlocks: [] // [{ id, title, badge, prompt, outputStem, outputFileName }]
    };

    let rootEl = null;
    let initialized = false;

    function byId(id) {
        return typeof document !== 'undefined' ? document.getElementById(id) : null;
    }

    function cleanStr(v) {
        return v === null || v === undefined ? '' : String(v).trim();
    }

    function isValidDriveId(id) {
        return /^[a-zA-Z0-9_-]{10,}$/.test(cleanStr(id));
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
        return cleanStr(name).replace(/\.(jpe?g|png|webp|gif|avif|bmp|heic|heif)$/i, '').replace(/[_-]+/g, ' ').trim();
    }

    function sanitizeOutputStem(raw) {
        return cleanStr(raw)
            .replace(/\.(jpe?g|png|webp|gif|avif|bmp|heic|heif)$/i, '')
            .replace(/[\\/:*?"<>|]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function resolveExactOutputStem(cfg) {
        const c = cfg || state;
        const fromExplicit = sanitizeOutputStem(c.outputName);
        if (fromExplicit) return fromExplicit;
        const fromProduct = sanitizeOutputStem(c.productName);
        if (fromProduct) return fromProduct;
        const fromSku = sanitizeOutputStem(c.sku);
        if (fromSku) return fromSku.toUpperCase();
        const fromPhoto = sanitizeOutputStem(c.furniturePhoto && c.furniturePhoto.name);
        if (fromPhoto) return fromPhoto;
        return 'MUEBLE_CREATA';
    }

    function buildExactOutputNameLine(outputFileName) {
        return 'OUTPUT FILE / ASSET NAME (EXACT): "' + outputFileName + '" (use this exact name when saving/exporting the file — NEVER render text inside the image).';
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
            if (p.cameraAngle && CAMERA_ANGLE_OPTIONS.some((a) => a.id === p.cameraAngle)) state.cameraAngle = p.cameraAngle;
            if (p.roomId && ROOM_ENVIRONMENTS.some((r) => r.id === p.roomId)) state.roomId = p.roomId;
            if (p.category && CATEGORIES.some((c) => c.id === p.category)) state.category = p.category;
            if (p.materialTarget === 'TELA' || p.materialTarget === 'MADERA' || p.materialTarget === 'DUAL') state.materialTarget = p.materialTarget;
            if (p.targetModel && IMAGE_MODELS.some((m) => m.id === p.targetModel)) state.targetModel = p.targetModel;
            if (p.aspectRatio && ASPECT_RATIO_OPTIONS.some((a) => a.id === p.aspectRatio)) state.aspectRatio = p.aspectRatio;
            if (p.thinkingLevel === 'minimal' || p.thinkingLevel === 'medium' || p.thinkingLevel === 'high') state.thinkingLevel = p.thinkingLevel;
            if (typeof p.forceCreataSpec === 'boolean') state.forceCreataSpec = p.forceCreataSpec;
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
                cameraAngle: state.cameraAngle,
                roomId: state.roomId,
                category: state.category,
                materialTarget: state.materialTarget,
                targetModel: state.targetModel,
                aspectRatio: state.aspectRatio,
                thinkingLevel: state.thinkingLevel,
                forceCreataSpec: state.forceCreataSpec
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
        return 'IMAGES: ' + slots.map((s) => '[IMAGE ' + s.idx + ': "' + s.fileName + '"] = ' + s.role).join(' | ');
    }

    function getAngleObj(angleId) {
        return SINGLE_ANGLES.find((a) => a.id === angleId) || SINGLE_ANGLES[0];
    }

    function getCameraAngleObj(cameraAngleId) {
        const found = CAMERA_ANGLE_OPTIONS.find((a) => a.id === cameraAngleId);
        return (found && found.id !== 'ORIGINAL') ? found : null;
    }

    function getRoomObj(roomId) {
        return ROOM_ENVIRONMENTS.find((r) => r.id === roomId) || ROOM_ENVIRONMENTS[0];
    }

    function hasCustomScaleDirective(specialText) {
        const n = normSearch(specialText);
        if (!n) return false;
        return /\b(grande|chico|chica|pequen|acerc|alej|zoom|tamano|escala|larger|bigger|smaller|closer|scale)\b|\b(8[0-9]|9[0-9]|6[0-9]|5[0-9])%/i.test(n);
    }

    function buildSpecialDirectivesBlock(cfg) {
        const txt = cleanStr(cfg && cfg.specialDirectives);
        if (!txt) return '';
        return 'SPECIAL USER DIRECTIVES (HIGHEST PRIORITY — OVERRIDE DEFAULT LOCKS WHERE REQUESTED): ' + txt +
            ' Execute these custom requests faithfully (e.g., isolate only 1 module, enlarge/shrink framing scale, remove/modify specific parts) while keeping photorealistic quality and everything else 100% faithful to [IMAGE 1].';
    }

    function buildModelTargetBlock(cfg) {
        const modelObj = getTargetModelObj(cfg.targetModel);
        const ar = cfg.aspectRatio || '1:1';
        const pxLabel = ar === '1:1' ? '2048x2048' : (ar + ' 2K');
        const thinkPart = modelObj.supportsThinkingLevel
            ? (' | thinking_level="' + (cfg.thinkingLevel || modelObj.defaultThinking || 'medium') + '"')
            : '';
        return 'MODEL: ' + modelObj.id + ' | aspect_ratio="' + ar + '", image_size="' + modelObj.imageSize + '" (' + pxLabel + ')' + thinkPart;
    }

    function buildProductHeader(cfg, catKey) {
        const parts = [];
        if (cfg.productName) parts.push('Product: ' + cfg.productName);
        if (cfg.sku) parts.push('SKU: ' + cfg.sku.toUpperCase());
        if (cfg.dimensions) parts.push('Dimensions: ' + cfg.dimensions);
        parts.push('Category: ' + catKey);
        if (cfg.extraNotes) parts.push('Notes: ' + cfg.extraNotes);
        let line = parts.join(' | ');
        if (cfg.visionAnalysis) line += '\nAnatomy:\n' + cfg.visionAnalysis;
        return line;
    }

    function buildCreataCatalogSpecBlock(forceSpec, force34Right, aspectRatioOpt, explicitAngleObj, specialDirectivesText) {
        const ar = aspectRatioOpt || '1:1';
        const dimTxt = ar === '1:1' ? '2048x2048 (1:1, 2K)' : (ar + ' 2K (2048px)');
        const customScale = hasCustomScaleDirective(specialDirectivesText);
        if (!forceSpec) {
            const angleNote = explicitAngleObj
                ? (' Angle: ' + explicitAngleObj.en + (explicitAngleObj.exclude ? (' | EXCLUDE: ' + explicitAngleObj.exclude + '.') : ''))
                : (force34Right
                    ? (' Angle: ' + CANONICAL_34_RIGHT_PROMPT + ' | EXCLUDE: ' + CANONICAL_34_RIGHT_EXCLUDE + '.')
                    : ' Keep exact original camera angle of [IMAGE 1] (do NOT force 3/4 rotation).');
            return 'STUDIO: Crisp catalog lighting, pure white #FFFFFF background, centered proportional framing (zero distortion).' + angleNote;
        }
        const framingLine = customScale
            ? '- Framing: uniform aspect-locked proportions (HONOR SPECIAL USER DIRECTIVES scale/size override; balanced #FFFFFF margins, zero stretching/cropping).'
            : '- Framing: uniform 1:1 aspect-locked scale (~78% longest axis centered, balanced #FFFFFF margins, zero stretching/cropping).';
        const angleLine = explicitAngleObj
            ? ('- Angle: ' + explicitAngleObj.en + (explicitAngleObj.exclude ? (' | EXCLUDE: ' + explicitAngleObj.exclude + '.') : ''))
            : (force34Right
                ? ('- Angle: ' + CANONICAL_34_RIGHT_PROMPT + ' | EXCLUDE: ' + CANONICAL_34_RIGHT_EXCLUDE + '.')
                : '- Angle: Keep exact original camera angle and viewing perspective of [IMAGE 1] (85mm rectilinear; do NOT force 3/4 rotation).');
        return [
            'CREATA CATALOG SPEC (NON-NEGOTIABLE · ' + dimTxt + '):',
            framingLine,
            '- Background & Shadows: 100% solid pure white #FFFFFF edge-to-edge, ZERO cast shadows / 0% shadow cutout on floor (keep natural 3D volume only on furniture).',
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
                : 'attached fabric swatch';
            lines.push('100% FULL-BODY CASCO UPHOLSTERY (' + fabRef + '): Reupholster 100% of cushions, backrests, arms, side panels, deck, piping, and casco with exact hue and realistic micro-scale weave (~97% natural scale, zero leftover original color).');
        }
        if (includeWood) {
            const woodRef = woodSlot
                ? ('[IMAGE ' + woodSlot.idx + ': "' + woodSlot.fileName + '"] (' + (woodSlot.cleanName || woodSlot.fileName) + ')')
                : 'attached wood swatch';
            lines.push('WOOD FINISH (' + woodRef + '): Apply exact tone, natural wood grain direction, and matte/satin pore finish to ALL exposed wood/legs/plinth/top without altering thickness or joinery.');
        }
        return lines.join('\n');
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
            cameraAngle: state.cameraAngle,
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
            outputName: state.outputName,
            dimensions: state.dimensions,
            extraNotes: state.extraNotes,
            specialDirectives: state.specialDirectives,
            visionAnalysis: state.visionAnalysis,
            furniturePhoto: state.furniturePhoto,
            fabricSwatch: state.fabricSwatch,
            woodSwatch: state.woodSwatch
        }, inputCfg || {});

        const outStem = resolveExactOutputStem(cfg);
        function makeOutBlock(id, title, badge, promptBody, suffixOpt, appendAtEnd) {
            const outputStem = outStem + (suffixOpt || '');
            const outputFileName = outputStem + '.png';
            const directive = buildExactOutputNameLine(outputFileName);
            const prompt = appendAtEnd
                ? (promptBody + '\n\n' + directive)
                : (directive + '\n\n' + promptBody);
            return {
                id: id,
                title: title,
                badge: badge,
                outputStem: outputStem,
                outputFileName: outputFileName,
                prompt: prompt
            };
        }

        const catKey = detectCategoryFromInputs(cfg.productName || cfg.outputName, cfg.sku, cfg.category);
        const catRule = CATEGORY_RULES[catKey] || CATEGORY_RULES.SALA_SOFA;
        const angleObj = getAngleObj(cfg.angleId);
        const roomObj = getRoomObj(cfg.roomId);
        const headerText = buildProductHeader(cfg, catKey);
        const modelBlock = buildModelTargetBlock(cfg);

        // Optional camera angle: ORIGINAL by default (NEVER forces 3/4 unless explicitly selected or requested)
        const selectedCameraObj = (cfg.cameraAngle && cfg.cameraAngle !== 'ORIGINAL')
            ? getCameraAngleObj(cfg.cameraAngle)
            : (cfg.forceThreeQuarterRight === true ? getCameraAngleObj('THREE_QUARTER_RIGHT') : null);
        const optionalCameraLine = selectedCameraObj
            ? ('CAMERA ANGLE: ' + selectedCameraObj.en + (selectedCameraObj.exclude ? (' | EXCLUDE: ' + selectedCameraObj.exclude + '.') : ''))
            : '';
        const multiViewAngleObj = {
            en: 'Consistent 85mm rectilinear studio lens across all 7 requested camera angles. ' + ANTI_MIRROR_HANDEDNESS_LOCK,
            exclude: ''
        };

        // Special user directives (highest priority — overrides default locks where explicitly requested)
        const specialBlock = buildSpecialDirectivesBlock(cfg);
        const hasSpecial = Boolean(specialBlock);
        const customScale = hasCustomScaleDirective(cfg.specialDirectives);
        const specialLockNote = hasSpecial ? ' (Except where explicitly modified by SPECIAL USER DIRECTIVES above.)' : '';

        const usesMaterialTarget =
            (cfg.version === 'V8' && (cfg.v8Mode || 'PACK_CREATA') === 'MATERIAL_SWAP') ||
            (cfg.version === 'V1' && (cfg.v1Mode || 'RESTAURAR_HD') === 'CAMBIO_MATERIAL');
        const wantsFabric = Boolean(cfg.fabricSwatch) && (!usesMaterialTarget || cfg.materialTarget === 'TELA' || cfg.materialTarget === 'DUAL');
        const wantsWood = Boolean(cfg.woodSwatch) && (!usesMaterialTarget || cfg.materialTarget === 'MADERA' || cfg.materialTarget === 'DUAL');

        // ---------------------------------------------------------------------
        // VERSIÓN 8 · CREATA Pro (Resumida · 2048×2048 · Nano Banana 2.1 / Gemini 3 Pro)
        // ---------------------------------------------------------------------
        if (cfg.version === 'V8') {
            const mode = cfg.v8Mode || 'PACK_CREATA';
            const includeFab = mode === 'MATERIAL_SWAP' ? (cfg.materialTarget === 'TELA' || cfg.materialTarget === 'DUAL') : wantsFabric;
            const includeWood = mode === 'MATERIAL_SWAP' ? (cfg.materialTarget === 'MADERA' || cfg.materialTarget === 'DUAL') : wantsWood;
            const slots = buildSlotMap(Object.assign({}, cfg, { includeFabric: includeFab, includeWood: includeWood }));
            const slotBlock = formatSlotMapText(slots);
            const matBlock = (includeFab || includeWood) ? buildCascoMaterialRules(slots, includeFab, includeWood) : '';
            const lockLine = 'GEOMETRY LOCK: [IMAGE 1] is 100% source of truth. ' + catRule + ' No extra pillows, props, logos, text, or clutter.' + specialLockNote;

            if (mode === 'PACK_CREATA') {
                const catalogPrompt = [
                    'TASK: CREATA Master Catalog Photo (V8 Pro).',
                    modelBlock,
                    headerText,
                    slotBlock,
                    specialBlock,
                    buildCreataCatalogSpecBlock(cfg.forceCreataSpec, false, cfg.aspectRatio, selectedCameraObj, cfg.specialDirectives),
                    matBlock,
                    lockLine
                ].filter(Boolean).join('\n');

                const coverFraming = customScale ? 'honor SPECIAL USER DIRECTIVES scale override' : '~62% frame';
                const coverPrompt = [
                    'TASK: CREATA Editorial Cover Scene (V8 Pro). Place [IMAGE 1] as hero centerpiece (' + coverFraming + ', ' + (cfg.aspectRatio || '1:1') + ' 2K, true proportions, natural daylight & soft floor contact shadows).',
                    modelBlock,
                    headerText,
                    slotBlock,
                    specialBlock,
                    optionalCameraLine,
                    'SCENE: ' + roomObj.en + '.',
                    matBlock,
                    lockLine
                ].filter(Boolean).join('\n');

                const cadPrompt = [
                    'TASK: 2D Orthographic Technical CAD Sheet (V8 Pro) of [IMAGE 1] — Front, Side, Top views on pure #FFFFFF white with crisp #1E293B charcoal vector lines (2048x2048).',
                    modelBlock,
                    headerText,
                    slotBlock,
                    specialBlock,
                    cfg.dimensions
                        ? ('DIMENSIONS (EXACT): Label metric arrows with "' + cfg.dimensions + '" only.')
                        : 'DIMENSIONS: Clean proportional metric arrows (Width, Depth, Height).',
                    'STYLE: Zero shading, zero clutter, exact silhouette fidelity.'
                ].filter(Boolean).join('\n');

                return [
                    makeOutBlock('v8_catalog', '📦 Catálogo (2048×2048)', 'CATÁLOGO', catalogPrompt, ''),
                    makeOutBlock('v8_cover', '🛋️ Portada (' + roomObj.label.replace(/^[^\s]+\s/, '') + ')', 'PORTADA', coverPrompt, '_PORTADA'),
                    makeOutBlock('v8_cad', '📐 Plano CAD', 'CAD', cadPrompt, '_CAD')
                ];
            }

            if (mode === 'SEVEN_VIEWS') {
                const prompt = [
                    'TASK: Cohesive 7-View CREATA Studio Set of [IMAGE 1] (100% consistent structure, scale, and finish).',
                    modelBlock,
                    headerText,
                    slotBlock,
                    specialBlock,
                    buildCreataCatalogSpecBlock(cfg.forceCreataSpec, false, cfg.aspectRatio, multiViewAngleObj, cfg.specialDirectives),
                    'VIEWS (2048x2048, ~78% proportional scale, NEVER mirrored): 1) 3/4 Right (front→right, backrest left) · 2) Front 0° · 3) 3/4 Left (opposite orbit, front→left) · 4) Right Profile 90° · 5) Left Profile -90° · 6) Back 180° · 7) Macro Texture/Stitching Detail.',
                    matBlock,
                    lockLine
                ].filter(Boolean).join('\n');
                return [makeOutBlock('v8_7views', '📸 7 Vistas (2048×2048)', '7 VISTAS', prompt, '')];
            }

            if (mode === 'SINGLE_VIEW') {
                const prompt = [
                    'TASK: Precision Single Studio View of [IMAGE 1] (V8 Pro).',
                    modelBlock,
                    headerText,
                    slotBlock,
                    specialBlock,
                    'ANGLE: ' + angleObj.en,
                    angleObj.exclude ? ('FORBIDDEN: ' + angleObj.exclude + '.') : '',
                    buildCreataCatalogSpecBlock(cfg.forceCreataSpec, false, cfg.aspectRatio, angleObj, cfg.specialDirectives),
                    matBlock,
                    lockLine
                ].filter(Boolean).join('\n');
                return [makeOutBlock('v8_single', '🎯 ' + angleObj.label, '1 VISTA', prompt, '')];
            }

            if (mode === 'MATERIAL_SWAP') {
                const targetLabel = cfg.materialTarget === 'TELA'
                    ? 'Solo Tela'
                    : (cfg.materialTarget === 'MADERA' ? 'Solo Madera' : 'Dual Tela + Madera');
                const prompt = [
                    'TASK: Photorealistic Material Swap on [IMAGE 1] — ' + targetLabel + ' (keep 100% geometry, seams, and perspective' + (hasSpecial ? ' except where SPECIAL USER DIRECTIVES apply' : '') + ').',
                    modelBlock,
                    headerText,
                    slotBlock,
                    specialBlock,
                    matBlock || 'Apply attached material swatch faithfully across 100% of target surfaces at natural micro-scale.',
                    buildCreataCatalogSpecBlock(cfg.forceCreataSpec, false, cfg.aspectRatio, selectedCameraObj, cfg.specialDirectives),
                    lockLine
                ].filter(Boolean).join('\n');
                return [makeOutBlock('v8_material', '🧵🪵 Material — ' + targetLabel, 'MATERIAL', prompt, '')];
            }

            if (mode === 'ENVIRONMENT') {
                const prompt = [
                    'TASK: Editorial Interior Integration of [IMAGE 1] (' + (cfg.aspectRatio || '1:1') + ' 2K, 50mm lens, natural daylight, soft floor contact shadow, true proportions).',
                    modelBlock,
                    headerText,
                    slotBlock,
                    specialBlock,
                    optionalCameraLine,
                    'SCENE: ' + roomObj.en + '.',
                    matBlock,
                    lockLine
                ].filter(Boolean).join('\n');
                return [makeOutBlock('v8_env', '🛋️ Ambiente — ' + roomObj.label.replace(/^[^\s]+\s/, ''), 'AMBIENTE', prompt, '')];
            }

            // CAD_HD
            const hdPrompt = [
                'TASK: 8K Studio HD Restoration of [IMAGE 1] (2048x2048, remove noise/glare/clutter, sharpen weave & grain naturally).',
                modelBlock,
                headerText,
                slotBlock,
                specialBlock,
                buildCreataCatalogSpecBlock(cfg.forceCreataSpec, false, cfg.aspectRatio, selectedCameraObj, cfg.specialDirectives),
                matBlock,
                lockLine
            ].filter(Boolean).join('\n');

            const cadOnlyPrompt = [
                'TASK: 2D Orthographic CAD Drawing of [IMAGE 1] (Front, Side, Top views, 2048x2048, pure #FFFFFF white, crisp charcoal lines).',
                modelBlock,
                headerText,
                slotBlock,
                specialBlock,
                cfg.dimensions ? ('EXACT MEASUREMENTS: ' + cfg.dimensions + '.') : 'Clean proportional metric arrows.'
            ].filter(Boolean).join('\n');

            return [
                makeOutBlock('v8_hd8k', '✨ Restaurar HD 8K', 'HD 8K', hdPrompt, ''),
                makeOutBlock('v8_cad2', '📐 Plano CAD', 'CAD', cadOnlyPrompt, '_CAD')
            ];
        }

        // ---------------------------------------------------------------------
        // VERSIÓN 7 · ESTUDIO 9 MODOS + 2048×2048 + ÁNGULO OPCIONAL
        // ---------------------------------------------------------------------
        if (cfg.version === 'V7') {
            const m7 = cfg.v7Mode || '7_VISTAS';
            const includeFab7 = m7 === 'CAMBIO_TELA' || m7 === 'CAMBIO_DUAL' || wantsFabric;
            const includeWood7 = m7 === 'CAMBIO_MADERA' || m7 === 'CAMBIO_DUAL' || wantsWood;
            const slots7 = buildSlotMap(Object.assign({}, cfg, { includeFabric: includeFab7, includeWood: includeWood7 }));
            const slotBlock7 = formatSlotMapText(slots7);
            const matBlock7 = (includeFab7 || includeWood7) ? buildCascoMaterialRules(slots7, includeFab7, includeWood7) : '';
            const ar7 = cfg.aspectRatio || '1:1';
            const heroSpec = buildCreataCatalogSpecBlock(cfg.forceCreataSpec, false, ar7, selectedCameraObj, cfg.specialDirectives);

            let modeBody = '';
            let badge7 = 'V7';
            let title7 = (V7_MODES.find((x) => x.id === m7) || V7_MODES[0]).label;

            if (m7 === '7_VISTAS') {
                badge7 = '7 VISTAS';
                modeBody = 'TASK (V7 — 7 STUDIO VIEWS): Generate the complete 7-angle studio series of [IMAGE 1] (3/4 Facing Right, Front 0°, 3/4 Facing Left [opposite orbit, NEVER mirrored], Right Side 90°, Left Side -90°, Back 180°, Texture Close-up) keeping identical structure, proportions, seams, and finishes.\n' +
                    buildCreataCatalogSpecBlock(cfg.forceCreataSpec, false, ar7, multiViewAngleObj, cfg.specialDirectives);
            } else if (m7 === '1_VISTA') {
                badge7 = '1 VISTA';
                title7 = 'V7 · 1 Vista — ' + angleObj.label;
                modeBody = 'TASK (V7 — SINGLE VIEW): Render ONLY this exact camera view of [IMAGE 1]:\n' + angleObj.en +
                    (angleObj.exclude ? ('\nSTRICTLY EXCLUDE: ' + angleObj.exclude + '.') : '') +
                    '\n' + buildCreataCatalogSpecBlock(cfg.forceCreataSpec, false, ar7, angleObj, cfg.specialDirectives);
            } else if (m7 === 'CAMBIO_TELA' || m7 === 'CAMBIO_MADERA' || m7 === 'CAMBIO_DUAL') {
                badge7 = m7.replace('CAMBIO_', '');
                modeBody = 'TASK (V7 — MATERIAL SWAP): Replace the target material(s) on [IMAGE 1] with 100% fidelity to the attached swatch(es), covering 100% of the casco/frame with realistic micro-scale texture while locking exact furniture geometry.\n' + heroSpec;
            } else if (m7 === 'ENTORNO') {
                badge7 = 'ENTORNO';
                title7 = 'V7 · Entorno — ' + roomObj.label;
                modeBody = 'TASK (V7 — LIFESTYLE ROOM): Place [IMAGE 1] inside this interior (' + ar7 + ' 2K): ' + roomObj.en + '. Match natural daylight and subtle floor contact shadows while keeping the furniture design, real proportions, and colors 100% faithful.' +
                    (optionalCameraLine ? ('\n' + optionalCameraLine) : '');
            } else if (m7 === 'PLANO_CAD') {
                badge7 = 'CAD';
                modeBody = 'TASK (V7 — TECHNICAL CAD SHEET): Generate a ' + (ar7 === '1:1' ? '2048x2048' : (ar7 + ' 2K')) + ' orthographic technical CAD blueprint of [IMAGE 1] (Front, Side, Top views) on pure #FFFFFF white with crisp black architectural linework' + (cfg.dimensions ? (' and exact dimensions: ' + cfg.dimensions + '.') : ' and proportional metric dimension callouts.');
            } else if (m7 === 'FONDO_BLANCO') {
                badge7 = '#FFFFFF';
                modeBody = 'TASK (V7 — PURE WHITE EXTRACTION): Extract [IMAGE 1] cleanly onto a 100% solid pure white #FFFFFF background without distorting proportions, removing all store clutter, floor reflections, and cast shadows.\n' + heroSpec;
            } else {
                badge7 = 'HD 8K';
                modeBody = 'TASK (V7 — HD 8K RESTORATION / COLOR CLONE): Restore sharpness, remove noise/compression artifacts, clean lighting to studio quality, and unify exact finish color across [IMAGE 1].\n' + heroSpec;
            }

            const prompt7 = [
                'STUDIO ENGINE V7 · CREATA FURNITURE PHOTOGRAPHY.',
                modelBlock,
                headerText,
                slotBlock7,
                specialBlock,
                modeBody,
                matBlock7,
                'GEOMETRY LOCK: ' + catRule + ' Never invent extra pillows, props, logos, or text.' + specialLockNote
            ].filter(Boolean).join('\n\n');

            return [makeOutBlock('v7_main', title7, badge7, prompt7, '')];
        }

        // ---------------------------------------------------------------------
        // VERSIÓN 1 · CLÁSICA ORIGINAL (AI Studio + Flux/Midjourney + ChatGPT)
        // ---------------------------------------------------------------------
        const m1 = cfg.v1Mode || 'RESTAURAR_HD';
        const ar1 = cfg.aspectRatio || '1:1';
        const dim1 = ar1 === '1:1' ? '2048x2048' : (ar1 + ' 2K (2048px long edge)');
        const prodDesc = cfg.productName || cfg.outputName || 'luxury furniture piece shown in the reference photo';
        const fabLabel = wantsFabric && cfg.fabricSwatch ? stripFileExt(cfg.fabricSwatch.name) : '';
        const woodLabel = wantsWood && cfg.woodSwatch ? stripFileExt(cfg.woodSwatch.name) : '';
        const matClause = [
            fabLabel ? ('upholstered 100% in "' + fabLabel + '" fabric from the attached swatch') : '',
            woodLabel ? ('with "' + woodLabel + '" wood finish from the attached swatch') : ''
        ].filter(Boolean).join(' and ');

        const v1AngleRule = selectedCameraObj
            ? ('Camera angle: ' + selectedCameraObj.en + (selectedCameraObj.exclude ? (' | EXCLUDE: ' + selectedCameraObj.exclude + '.') : ''))
            : 'Camera angle: Keep exact original camera angle and viewing perspective of the reference photo (do NOT force 3/4 rotation).';
        const v1FluxAngle = selectedCameraObj
            ? (selectedCameraObj.en.split('.')[0] + ',')
            : (m1 === 'MULTI_PERSPECTIVA' ? 'matching multi-angle studio elevations,' : 'exact original camera angle from the reference photo (no forced rotation),');
        const v1FramingRule = customScale
            ? 'honor SPECIAL USER DIRECTIVES scale/size override without distorting proportions'
            : 'balanced 78% proportional framing (never deform sofa/armchair)';
        const v1SpecialShort = cleanStr(cfg.specialDirectives);

        let taskEn = '';
        if (m1 === 'RESTAURAR_HD') {
            taskEn = 'Restore and enhance this photograph of ' + prodDesc + ' to ultra-sharp ' + dim1 + ' commercial furniture catalog quality, keeping exact silhouette, proportions (zero distortion), and craftsmanship.';
        } else if (m1 === 'EXTRAER_BLANCO') {
            taskEn = 'Extract ' + prodDesc + ' cleanly onto a pure solid white #FFFFFF studio background (' + dim1 + ', ' + (customScale ? 'custom scale per SPECIAL USER DIRECTIVES' : '~78% proportional centered framing') + ' without warping, zero cast shadows, no background clutter).';
        } else if (m1 === 'CAMBIO_MATERIAL') {
            const targetFallback = cfg.materialTarget === 'TELA'
                ? 'with the attached fabric swatch upholstered across 100% of the casco/body'
                : (cfg.materialTarget === 'MADERA'
                    ? 'with the attached wood finish applied across all exposed wood/base elements'
                    : 'with the attached material swatches applied uniformly across 100% of the target surfaces');
            taskEn = 'Keep the exact geometry and design of ' + prodDesc + ', re-rendering it ' + (matClause || targetFallback) + ' on a ' + dim1 + ' pure white #FFFFFF studio background.';
        } else {
            taskEn = 'Generate clean matching ' + dim1 + ' studio catalog perspectives (Front 0°, 3/4 Facing Right, 3/4 Facing Left [opposite orbit, never mirrored], and Side Profile 90°) of ' + prodDesc + (matClause ? (' ' + matClause) : '') + ' on a pure white #FFFFFF background with zero shadows.';
        }

        const aiStudioV1 = [
            modelBlock,
            'Using the attached reference image(s), ' + taskEn,
            specialBlock,
            cfg.dimensions ? ('Maintain exact proportions for dimensions: ' + cfg.dimensions + '.') : '',
            v1AngleRule,
            'Studio rules: ' + dim1 + ' (' + ar1 + ', 2K), 85mm rectilinear lens, pure #FFFFFF seamless background, ' + v1FramingRule + ', zero drop shadows, ' + catRule + specialLockNote,
            cfg.extraNotes ? ('Additional notes: ' + cfg.extraNotes) : ''
        ].filter(Boolean).join('\n');

        const fluxMjV1 = [
            'Commercial studio furniture photography of ' + prodDesc + (matClause ? (', ' + matClause) : '') + ',',
            v1SpecialShort ? ('SPECIAL USER DIRECTIVES (HIGHEST PRIORITY): ' + v1SpecialShort + ',') : '',
            v1FluxAngle,
            dim1 + ' pure solid white #FFFFFF seamless infinity background, zero cast shadows, 85mm rectilinear lens, true undistorted furniture proportions, ultra-detailed realistic fabric weave and wood grain, crisp softbox lighting, ' + (customScale ? 'custom framing per special directives' : 'centered 78% catalog framing') + ' --ar ' + ar1 + ' --stylize 100'
        ].filter(Boolean).join(' ');

        const dalleV1 = [
            'Please edit/generate a ' + dim1 + ' studio e-commerce catalog photograph based on the uploaded furniture photo.',
            taskEn,
            specialBlock,
            v1AngleRule,
            'Keep every structural detail and physical proportion identical to the original piece (do not stretch/compress sofas, do not add extra cushions, props, or text)' + specialLockNote + ' Center the furniture proportionally ' + (customScale ? '(honoring SPECIAL USER DIRECTIVES scale/size)' : 'at ~78%') + ' of a ' + ar1 + ' (' + dim1 + ') pure white (#FFFFFF) canvas with zero floor shadows and crisp natural studio lighting.'
        ].filter(Boolean).join('\n\n');

        return [
            makeOutBlock('v1_aistudio', 'V1 · Google AI Studio / Nano Banana 2.1 · Gemini 3 Pro', 'AI STUDIO', aiStudioV1, ''),
            makeOutBlock('v1_flux', 'V1 · Flux / Midjourney', 'FLUX / MJ', fluxMjV1, '', true),
            makeOutBlock('v1_dalle', 'V1 · ChatGPT / DALL-E', 'CHATGPT', dalleV1, '')
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
            if (forceRefresh) showStudioToast(state.materialsError, 'err');
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
                if (forceRefresh) {
                    showStudioToast('🔄 Catálogo actualizado: ' + state.telasList.length + ' telas y ' + state.maderasList.length + ' maderas.', 'ok');
                }
            } else {
                state.materialsError = (res && res.error) || 'No se pudieron leer las carpetas TELAS y MADERAS.';
                if (forceRefresh) showStudioToast(state.materialsError, 'err');
            }
        } catch (err) {
            state.materialsError = (err && err.message) || 'Configura primero la URL /exec y PIN en ☁️ Odoo / Sheet.';
            if (forceRefresh) showStudioToast(state.materialsError, 'err');
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
                state.productName = cleanStr(m.nombre || m.nombre_nuevo || m.modelo || m.tipo_mueble || state.productName);
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

    async function copyPromptText(text, btnEl, toastMsg) {
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
            if (!btnEl.dataset) btnEl.dataset = {};
            if (!btnEl.dataset.origLabel) btnEl.dataset.origLabel = btnEl.textContent || '📋 Copiar';
            const orig = btnEl.dataset.origLabel;
            btnEl.textContent = copied ? '✅ Copiado' : '⚠️ Error';
            clearTimeout(btnEl._copyResetTimer);
            btnEl._copyResetTimer = setTimeout(() => { btnEl.textContent = orig; }, 1600);
        }
        showStudioToast(copied ? (toastMsg || '📋 Prompt copiado al portapapeles.') : 'No se pudo copiar automáticamente.', copied ? 'ok' : 'err');
        return copied;
    }

    function clearPhotosOnlyKeepSettings() {
        // NUNCA reinicia versión (V8/V7/V1), modo, ángulo, habitación ni checkboxes
        state.furniturePhoto = null;
        state.fabricSwatch = null;
        state.woodSwatch = null;
        state.sku = '';
        state.productName = '';
        state.outputName = '';
        state.dimensions = '';
        state.extraNotes = '';
        state.specialDirectives = '';
        state.visionAnalysis = '';
        state.activeOutTab = 0;
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
    // RENDERIZADO DE LA INTERFAZ NATIVA — ESTÉTICA V7 ULTRA-RESUMIDA (1 PANTALLA)
    // =========================================================================
    function renderVersionPills() {
        return '<div class="st-v7-ver-seg" role="tablist" aria-label="Versión">' +
            VERSIONS.map((v) => {
                const act = state.version === v.id;
                return '<button type="button" class="st-v7-ver-pill' + (act ? ' is-active' : '') + '" data-ver="' + v.id + '" onclick="CreataPromptsStudio.setVersion(\'' + v.id + '\')" title="' + escapeHtml(v.desc) + '">' +
                    escapeHtml(v.id === 'V8' ? '✨ V8' : v.id) +
                '</button>';
            }).join('') +
        '</div>';
    }

    function getCurrentModeList() {
        if (state.version === 'V8') return { list: V8_MODES, active: state.v8Mode };
        if (state.version === 'V7') return { list: V7_MODES, active: state.v7Mode };
        return { list: V1_MODES, active: state.v1Mode };
    }

    function getActiveModeShortLabel() {
        const cur = getCurrentModeList();
        const found = cur.list.find((m) => m.id === cur.active) || cur.list[0];
        return (found && (found.short || found.label)) || 'Prompt';
    }

    function renderModeSelectHtml() {
        const cur = getCurrentModeList();
        return '<select id="stModeSelect" class="st-input st-v7-select" aria-label="Modo" onchange="CreataPromptsStudio.setMode(this.value)">' +
            cur.list.map((m) => '<option value="' + m.id + '"' + (cur.active === m.id ? ' selected' : '') + '>' + escapeHtml(m.label) + '</option>').join('') +
        '</select>';
    }

    function renderSubOptionSelectHtml() {
        const showAngle = (state.version === 'V8' && state.v8Mode === 'SINGLE_VIEW') || (state.version === 'V7' && state.v7Mode === '1_VISTA');
        const showRoom = (state.version === 'V8' && (state.v8Mode === 'ENVIRONMENT' || state.v8Mode === 'PACK_CREATA')) || (state.version === 'V7' && state.v7Mode === 'ENTORNO');
        const showMatTarget = (state.version === 'V8' && state.v8Mode === 'MATERIAL_SWAP') || (state.version === 'V1' && state.v1Mode === 'CAMBIO_MATERIAL');

        if (showAngle) {
            return '<select id="stAngleSelect" class="st-input st-v7-select" aria-label="Ángulo" onchange="CreataPromptsStudio.setField(\'angleId\', this.value)">' +
                SINGLE_ANGLES.map((a) => '<option value="' + a.id + '"' + (state.angleId === a.id ? ' selected' : '') + '>' + escapeHtml(a.label) + '</option>').join('') +
            '</select>';
        }
        if (showRoom) {
            return '<select id="stRoomSelect" class="st-input st-v7-select" aria-label="Ambiente" onchange="CreataPromptsStudio.setField(\'roomId\', this.value)">' +
                ROOM_ENVIRONMENTS.map((r) => '<option value="' + r.id + '"' + (state.roomId === r.id ? ' selected' : '') + '>' + escapeHtml(r.label) + '</option>').join('') +
            '</select>';
        }
        if (showMatTarget) {
            const opts = [
                { id: 'TELA', label: '🧵 Solo Tela' },
                { id: 'MADERA', label: '🪵 Solo Madera' },
                { id: 'DUAL', label: '🧵🪵 Dual (Ambos)' }
            ];
            return '<select id="stMatTargetSelect" class="st-input st-v7-select" aria-label="Material" onchange="CreataPromptsStudio.setField(\'materialTarget\', this.value)">' +
                opts.map((o) => '<option value="' + o.id + '"' + (state.materialTarget === o.id ? ' selected' : '') + '>' + o.label + '</option>').join('') +
            '</select>';
        }
        return '';
    }

    function renderCameraAngleRowHtml() {
        const showSingleAngle = (state.version === 'V8' && state.v8Mode === 'SINGLE_VIEW') || (state.version === 'V7' && state.v7Mode === '1_VISTA');
        if (showSingleAngle) return '';
        return '<div class="st-v7-row">' +
            '<span class="st-v7-row-lbl">📷 Ángulo</span>' +
            '<select id="stCameraAngleSelect" class="st-input st-v7-select st-v7-angle-select" aria-label="Ángulo opcional de cámara" onchange="CreataPromptsStudio.setField(\'cameraAngle\', this.value)">' +
                CAMERA_ANGLE_OPTIONS.map((a) => '<option value="' + a.id + '"' + (state.cameraAngle === a.id ? ' selected' : '') + '>' + escapeHtml(a.label) + '</option>').join('') +
            '</select>' +
        '</div>';
    }

    function renderSpecialDirectivesBoxHtml() {
        const current = cleanStr(state.specialDirectives);
        const currentNorm = normSearch(current);
        return '<div id="stSpecialDirectivesBox" class="st-special-box">' +
            '<div class="st-special-head">' +
                '<label class="st-special-title" for="stSpecialDirectivesInput">⚡ Indicaciones especiales (fuera de lo común)</label>' +
                (current
                    ? '<button type="button" class="st-mini-btn" onclick="CreataPromptsStudio.clearSpecialDirectives()" title="Limpiar indicaciones especiales">✕ Limpiar</button>'
                    : '<span class="st-v7-preview-chip">Prioridad máxima</span>') +
            '</div>' +
            '<div class="st-special-chips">' +
                SPECIAL_DIRECTIVE_PRESETS.map((p) => {
                    const active = currentNorm.indexOf(normSearch(p.text)) !== -1;
                    return '<button type="button" class="st-special-chip' + (active ? ' is-active' : '') + '" data-preset-id="' + p.id + '" onclick="CreataPromptsStudio.toggleSpecialPreset(\'' + p.id + '\')">' + escapeHtml(p.label) + '</button>';
                }).join('') +
            '</div>' +
            '<textarea id="stSpecialDirectivesInput" class="st-input st-special-textarea" rows="2" placeholder="Ej. Solo dejar 1 módulo, colocarlo más grande, quitar cojines, cambiar solo patas, quitar extras..." oninput="CreataPromptsStudio.setSpecialDirectives(this.value)">' + escapeHtml(state.specialDirectives) + '</textarea>' +
        '</div>';
    }

    function renderAdvancedOptionsHtml(hasGeminiKey) {
        const curModel = getTargetModelObj(state.targetModel);
        return '<details class="st-adv-details"' + (state.advancedOpen ? ' open' : '') + ' ontoggle="CreataPromptsStudio.setAdvancedOpen(this.open)">' +
            '<summary>⚙️ Opciones (' + escapeHtml(curModel.short) + ' · ' + escapeHtml(state.aspectRatio) + (state.forceCreataSpec ? ' · 2048 #FFF' : '') + (hasGeminiKey ? ' · Vision ✅' : '') + ')</summary>' +
            '<div class="st-adv-body">' +
                '<div class="st-two-col">' +
                    '<input type="text" class="st-input" placeholder="Nombre del mueble" value="' + escapeHtml(state.productName) + '" oninput="CreataPromptsStudio.setFieldSilent(\'productName\', this.value)">' +
                    '<select class="st-input" onchange="CreataPromptsStudio.setField(\'category\', this.value)">' +
                        CATEGORIES.map((c) => '<option value="' + c.id + '"' + (state.category === c.id ? ' selected' : '') + '>' + escapeHtml(c.label) + '</option>').join('') +
                    '</select>' +
                '</div>' +
                '<div class="st-two-col">' +
                    '<select id="stModelSelect" class="st-input" onchange="CreataPromptsStudio.setField(\'targetModel\', this.value)">' +
                        IMAGE_MODELS.map((m) => '<option value="' + m.id + '"' + (state.targetModel === m.id ? ' selected' : '') + '>' + escapeHtml(m.label) + '</option>').join('') +
                    '</select>' +
                    '<select id="stAspectSelect" class="st-input" onchange="CreataPromptsStudio.setField(\'aspectRatio\', this.value)">' +
                        ASPECT_RATIO_OPTIONS.map((a) => '<option value="' + a.id + '"' + (state.aspectRatio === a.id ? ' selected' : '') + '>' + escapeHtml(a.label) + '</option>').join('') +
                    '</select>' +
                '</div>' +
                (curModel.supportsThinkingLevel
                    ? ('<div class="st-adv-inline">' +
                        '<label class="st-mini-lbl" for="stThinkingSelect">🧠 Thinking:</label>' +
                        '<select id="stThinkingSelect" class="st-input st-v7-select-sm" onchange="CreataPromptsStudio.setField(\'thinkingLevel\', this.value)">' +
                            curModel.thinkingLevels.map((lvl) => '<option value="' + lvl + '"' + (state.thinkingLevel === lvl ? ' selected' : '') + '>' + escapeHtml(lvl.toUpperCase()) + '</option>').join('') +
                        '</select>' +
                      '</div>')
                    : '') +
                (state.version !== 'V1'
                    ? ('<div class="st-toggles-row">' +
                        '<label class="st-check-pill">' +
                            '<input type="checkbox" ' + (state.forceCreataSpec ? 'checked' : '') + ' onchange="CreataPromptsStudio.setBool(\'forceCreataSpec\', this.checked)">' +
                            '<span>2048×2048 · 78% · #FFFFFF · 0% sombras</span>' +
                        '</label>' +
                      '</div>')
                    : '') +
                '<div class="st-gemini-compact">' +
                    '<div class="st-sku-lookup-row">' +
                        '<input type="password" id="stGeminiKeyInput" class="st-input" placeholder="Gemini API Key opcional (AIza...)" value="' + escapeHtml(getSavedGeminiKey()) + '">' +
                        '<button type="button" class="st-mini-btn" onclick="CreataPromptsStudio.saveKeyFromInput()">🔑 Guardar</button>' +
                        (hasGeminiKey
                            ? ('<button type="button" class="st-mini-btn is-accent" ' + (state.visionLoading ? 'disabled' : '') + ' onclick="CreataPromptsStudio.runGeminiVision()">' + (state.visionLoading ? '⏳' : '✨ Vision') + '</button>')
                            : '') +
                    '</div>' +
                    (state.visionAnalysis ? ('<pre class="st-vision-pre">' + escapeHtml(state.visionAnalysis) + '</pre>') : '') +
                '</div>' +
            '</div>' +
        '</details>';
    }

    function renderSelectedThumbsStrip() {
        const items = [];
        if (state.furniturePhoto) items.push({ key: 'FURNITURE', badge: '🛋️ Mueble', item: state.furniturePhoto });
        if (state.fabricSwatch) items.push({ key: 'TELA', badge: '🧵 Tela', item: state.fabricSwatch });
        if (state.woodSwatch) items.push({ key: 'MADERA', badge: '🪵 Madera', item: state.woodSwatch });
        if (!items.length) return '';
        return '<div class="st-v7-thumbs-row">' +
            items.map((x) =>
                '<div class="st-v7-thumb-card">' +
                    '<div class="st-v7-thumb-img-wrap">' +
                        '<img src="' + escapeHtml(x.item.previewUrl) + '" alt="' + escapeHtml(x.item.name) + '" class="st-v7-thumb-img" referrerpolicy="no-referrer">' +
                        '<span class="st-v7-thumb-tag">' + x.badge + '</span>' +
                        '<button type="button" class="st-v7-thumb-del" title="Quitar" onclick="CreataPromptsStudio.clearSlot(\'' + x.key + '\')">✕</button>' +
                    '</div>' +
                    '<div class="st-v7-thumb-name" title="' + escapeHtml(x.item.name) + '">' + escapeHtml(x.item.name) + '</div>' +
                    '<button type="button" class="st-mini-btn is-accent st-v7-thumb-cp" onclick="CreataPromptsStudio.copySlotPhoto(\'' + x.key + '\', this)">🖼️ Copiar foto</button>' +
                '</div>'
            ).join('') +
        '</div>';
    }

    function getFilteredMaterialsForPicker() {
        const isWood = state.activeMaterialPicker === 'MADERA';
        const rawList = isWood ? state.maderasList : state.telasList;
        const q = normSearch(state.materialSearch);
        return q
            ? rawList.filter((f) => normSearch((f.name || '') + ' ' + (f.subfolder || '')).indexOf(q) !== -1)
            : rawList;
    }

    function renderMaterialPickerBodyHtml(isWood, filtered) {
        if (state.materialsLoading) {
            return '<div class="st-empty-msg">Cargando muestras desde Google Drive (solo lectura)...</div>';
        }
        if (state.materialsError) {
            return '<div class="st-empty-msg is-warn">' + escapeHtml(state.materialsError) +
                ' <button type="button" class="st-mini-btn is-accent" onclick="toggleProptDrawer(true)">⚙️ Abrir configuración</button></div>';
        }
        if (!filtered.length) {
            return '<div class="st-empty-msg">Sin coincidencias en ' + (isWood ? 'MADERAS' : 'TELAS / FOTOS TELAS') + '.</div>';
        }
        return '<div class="st-swatch-grid">' + filtered.filter((f) => f && isValidDriveId(f.id)).slice(0, 120).map((f) => {
            const rawId = cleanStr(f.id);
            const fid = escapeHtml(rawId);
            const fname = escapeHtml(f.name || 'muestra.jpg');
            const thumb = escapeHtml(f.thumbUrl || ('https://lh3.googleusercontent.com/d/' + rawId + '=w400'));
            const fbThumb = escapeHtml('https://drive.google.com/thumbnail?id=' + rawId + '&sz=w480');
            return '<div class="st-swatch-card">' +
                '<button type="button" class="st-swatch-pick" data-pick-kind="' + escapeHtml(state.activeMaterialPicker) + '" data-pick-id="' + fid + '" onclick="CreataPromptsStudio.pickDriveMaterial(this.getAttribute(\'data-pick-kind\'), this.getAttribute(\'data-pick-id\'))">' +
                    '<img src="' + thumb + '" data-fb-src="' + fbThumb + '" alt="' + fname + '" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="if(!this.dataset.fb){this.dataset.fb=\'1\';this.src=this.getAttribute(\'data-fb-src\')||\'\';}">' +
                    '<span class="st-swatch-lbl">' + fname + '</span>' +
                '</button>' +
                '<button type="button" class="st-swatch-cp" title="Copiar foto PNG" data-cp-id="' + fid + '" data-cp-name="' + fname + '" onclick="copyProptDrivePhotoImage(this.getAttribute(\'data-cp-id\'), this.getAttribute(\'data-cp-name\'), this)">🖼️</button>' +
            '</div>';
        }).join('') + '</div>';
    }

    function renderMaterialPickerDrawer() {
        if (!state.activeMaterialPicker) return '';
        const isWood = state.activeMaterialPicker === 'MADERA';
        const filtered = getFilteredMaterialsForPicker();
        const bodyHtml = renderMaterialPickerBodyHtml(isWood, filtered);

        return '<div class="st-picker-panel">' +
            '<div class="st-picker-head">' +
                '<div>' +
                    '<strong id="stMaterialPickerTitle">' + (isWood ? '🪵 MADERAS' : '🧵 TELAS') + ' (' + filtered.length + ')</strong>' +
                    ' <span class="st-ro-badge">🔒 Solo lectura</span>' +
                '</div>' +
                '<div class="st-picker-head-btns">' +
                    '<button type="button" class="st-mini-btn" onclick="CreataPromptsStudio.refreshMaterials()" title="Recargar de Drive">↻</button>' +
                    '<button type="button" class="st-mini-btn" onclick="CreataPromptsStudio.closeMaterialPicker()">✕</button>' +
                '</div>' +
            '</div>' +
            '<input type="search" id="stMaterialSearchInp" class="st-input st-picker-search" placeholder="Buscar por nombre o color..." value="' + escapeHtml(state.materialSearch) + '" oninput="CreataPromptsStudio.setMaterialSearch(this.value)">' +
            '<div id="stMaterialPickerBody">' + bodyHtml + '</div>' +
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
            body = '<div class="st-swatch-grid">' + state.sourceFiles.filter((f) => f && isValidDriveId(f.id)).slice(0, 60).map((f) => {
                const rawId = cleanStr(f.id);
                const fid = escapeHtml(rawId);
                const fname = escapeHtml(f.name || 'foto.jpg');
                const thumb = escapeHtml(f.thumbUrl || ('https://lh3.googleusercontent.com/d/' + rawId + '=w400'));
                const fbThumb = escapeHtml('https://drive.google.com/thumbnail?id=' + rawId + '&sz=w480');
                return '<div class="st-swatch-card">' +
                    '<button type="button" class="st-swatch-pick" data-pick-id="' + fid + '" onclick="CreataPromptsStudio.pickDriveFurniture(this.getAttribute(\'data-pick-id\'))">' +
                        '<img src="' + thumb + '" data-fb-src="' + fbThumb + '" alt="' + fname + '" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="if(!this.dataset.fb){this.dataset.fb=\'1\';this.src=this.getAttribute(\'data-fb-src\')||\'\';}">' +
                        '<span class="st-swatch-lbl">' + fname + '</span>' +
                    '</button>' +
                    '<button type="button" class="st-swatch-cp" title="Copiar foto PNG" data-cp-id="' + fid + '" data-cp-name="' + fname + '" onclick="copyProptDrivePhotoImage(this.getAttribute(\'data-cp-id\'), this.getAttribute(\'data-cp-name\'), this)">🖼️</button>' +
                '</div>';
            }).join('') + '</div>';
        }
        return '<div class="st-picker-panel">' +
            '<div class="st-picker-head">' +
                '<strong>📂 Drive · ' + escapeHtml(state.activeSourceTab) + ' (' + state.sourceFiles.length + ')</strong>' +
                '<button type="button" class="st-mini-btn" onclick="CreataPromptsStudio.closeSourcePanel()">✕</button>' +
            '</div>' +
            body +
        '</div>';
    }

    function renderGeneratedOutputs() {
        if (!state.generatedBlocks.length) {
            return '<div class="st-out-empty">👈 Elige o sube la foto del mueble (arrastra o <strong>Ctrl+V</strong>), opcionalmente Tela/Madera, ángulo o indicaciones especiales, escribe el <strong>Nombre de salida</strong> y pulsa <strong>🚀 Generar</strong>.</div>';
        }
        const safeIdx = Math.min(Math.max(0, Number(state.activeOutTab) || 0), state.generatedBlocks.length - 1);
        const activeBlk = state.generatedBlocks[safeIdx];
        const outFile = cleanStr(activeBlk.outputFileName) || (resolveExactOutputStem(state) + '.png');

        const tabsHtml = state.generatedBlocks.length > 1
            ? ('<div class="st-v7-out-tabs" role="tablist">' +
                state.generatedBlocks.map((b, i) =>
                    '<button type="button" role="tab" aria-selected="' + (i === safeIdx ? 'true' : 'false') + '" class="st-v7-out-tab' + (i === safeIdx ? ' is-active' : '') + '" onclick="CreataPromptsStudio.setActiveOutTab(' + i + ')">' +
                        escapeHtml(b.title || b.badge) +
                    '</button>'
                ).join('') +
              '</div>')
            : '';

        return '<div class="st-v7-out-header">' +
                '<span class="st-out-filename-pill" title="Nombre exacto de salida">🏷️ ' + escapeHtml(outFile) + '</span>' +
                '<div class="st-out-actions">' +
                    '<button type="button" class="st-btn-primary st-v7-btn-xs" onclick="CreataPromptsStudio.copyGenerated(' + safeIdx + ', this)">📋 Copiar Prompt</button>' +
                    '<button type="button" class="st-mini-btn is-accent" onclick="CreataPromptsStudio.copyOutputName(' + safeIdx + ', this)">🏷️ Nombre</button>' +
                    '<button type="button" class="st-mini-btn is-odoo" onclick="CreataPromptsStudio.sendNameToOdooUpload(' + safeIdx + ')">☁️ Subir</button>' +
                '</div>' +
            '</div>' +
            tabsHtml +
            '<textarea class="st-out-textarea" readonly rows="13">' + escapeHtml(activeBlk.prompt) + '</textarea>';
    }

    function renderStudio() {
        if (!rootEl) return;
        const hasGeminiKey = Boolean(getSavedGeminiKey());
        const livePreviewStem = resolveExactOutputStem(state);
        const subOptHtml = renderSubOptionSelectHtml();
        const modeBtnLabel = getActiveModeShortLabel();

        rootEl.innerHTML =
            '<div class="st-wrap st-v7-wrap">' +
                '<div id="studioToastBanner" class="studio-toast hidden" role="status" aria-live="polite"></div>' +

                '<!-- ENCABEZADO COMPACTO V7 (1 SOLA LÍNEA: VERSIÓN + MODO + SUB-OPCIÓN + SKU + ENLACES) -->' +
                '<section class="st-card st-v7-topbar">' +
                    '<div class="st-v7-top-controls">' +
                        renderVersionPills() +
                        renderModeSelectHtml() +
                        subOptHtml +
                        '<div class="st-v7-sku-inline">' +
                            '<input type="text" class="st-input" placeholder="SKU (autocompletar)" value="' + escapeHtml(state.sku) + '" oninput="CreataPromptsStudio.setFieldSilent(\'sku\', this.value)" onkeydown="if(event.key===\'Enter\') CreataPromptsStudio.lookupSku()">' +
                            '<button type="button" class="st-mini-btn" title="Buscar SKU en Sheet" onclick="CreataPromptsStudio.lookupSku()">🔎</button>' +
                        '</div>' +
                    '</div>' +
                    '<div class="st-v7-top-links">' +
                        '<a class="st-v7-link-pill is-folder" href="https://aistudio.google.com/prompts/new_chat" target="_blank" rel="noopener">⚡ AI Studio</a>' +
                        '<a class="st-v7-link-pill" href="https://gemini.google.com/app" target="_blank" rel="noopener">♊ Gemini</a>' +
                        '<a class="st-v7-link-pill" href="https://chatgpt.com/" target="_blank" rel="noopener">🤖 ChatGPT</a>' +
                        '<button type="button" class="st-v7-link-pill is-folder" onclick="switchPromptsWorkspace(\'render\')" title="Abrir Prompts Render (V7 Streamlit)">🤖 Render</button>' +
                        '<button type="button" class="st-v7-link-pill" onclick="switchPromptsWorkspace(\'odoo\')" title="Abrir Alta de Odoo">🚀 Odoo</button>' +
                    '</div>' +
                '</section>' +

                '<!-- WORKSPACE V7: 2 COLUMNAS COMPACTAS (INSUMOS IZQ | PROMPTS DER) -->' +
                '<div class="st-grid st-v7-grid">' +
                    '<section id="stFurnitureDropCard" class="st-card st-v7-work-card">' +
                        '<!-- 1) MUEBLE (1 FILA) -->' +
                        '<div class="st-v7-row">' +
                            '<span class="st-v7-row-lbl">🛋️ Mueble</span>' +
                            '<div class="st-v7-row-btns">' +
                                '<button type="button" class="st-mini-btn' + (state.activeSourceTab === 'SM_MUEBLERIA' ? ' is-accent' : '') + '" onclick="CreataPromptsStudio.openDriveSource(\'SM_MUEBLERIA\')">SM</button>' +
                                '<button type="button" class="st-mini-btn' + (state.activeSourceTab === 'COTIZACION' ? ' is-accent' : '') + '" onclick="CreataPromptsStudio.openDriveSource(\'COTIZACION\')">Cotiz.</button>' +
                                '<button type="button" class="st-mini-btn' + (state.activeSourceTab === 'SUBIR_PROPT' ? ' is-accent' : '') + '" onclick="CreataPromptsStudio.openDriveSource(\'SUBIR_PROPT\')">PROPT</button>' +
                                '<label class="st-mini-btn" title="Tomar foto">📷<input type="file" accept="image/*" capture="environment" class="hidden" onchange="CreataPromptsStudio.onFurnitureFileInput(this)"></label>' +
                                '<label class="st-mini-btn is-accent">🖼️ Subir<input type="file" accept="image/*" class="hidden" onchange="CreataPromptsStudio.onFurnitureFileInput(this)"></label>' +
                            '</div>' +
                        '</div>' +
                        renderDriveSourcePanel() +

                        '<!-- 2) TELA Y MADERA (2 FILAS COMPACTAS SOLO LECTURA) -->' +
                        '<div class="st-v7-mat-rows">' +
                            '<div class="st-v7-row">' +
                                '<span class="st-v7-row-lbl">🧵 Tela' + (state.fabricSwatch ? (' <span class="st-v7-ok-dot" title="' + escapeHtml(state.fabricSwatch.name) + '">✓</span>') : '') + '</span>' +
                                '<div class="st-v7-row-btns">' +
                                    '<button type="button" class="st-mini-btn is-accent" onclick="CreataPromptsStudio.openMaterialPicker(\'TELA\')">📂 Drive Telas</button>' +
                                    '<label class="st-mini-btn">+ Local<input type="file" accept="image/*" class="hidden" onchange="CreataPromptsStudio.onSwatchFileInput(\'TELA\', this)"></label>' +
                                '</div>' +
                            '</div>' +
                            '<div class="st-v7-row">' +
                                '<span class="st-v7-row-lbl">🪵 Madera' + (state.woodSwatch ? (' <span class="st-v7-ok-dot" title="' + escapeHtml(state.woodSwatch.name) + '">✓</span>') : '') + '</span>' +
                                '<div class="st-v7-row-btns">' +
                                    '<button type="button" class="st-mini-btn is-accent" onclick="CreataPromptsStudio.openMaterialPicker(\'MADERA\')">📂 Drive Maderas</button>' +
                                    '<label class="st-mini-btn">+ Local<input type="file" accept="image/*" class="hidden" onchange="CreataPromptsStudio.onSwatchFileInput(\'MADERA\', this)"></label>' +
                                '</div>' +
                            '</div>' +
                        '</div>' +
                        renderMaterialPickerDrawer() +

                        '<!-- 3) ÁNGULO OPCIONAL (SIN FORZAR 3/4 POR DEFECTO) -->' +
                        renderCameraAngleRowHtml() +

                        '<!-- 4) NOMBRE DE SALIDA + NOTAS / MEDIDAS -->' +
                        '<div class="st-output-name-box">' +
                            '<div class="st-v7-name-head">' +
                                '<label class="st-output-name-label" for="stOutputNameInput">🏷️ Nombre de salida</label>' +
                                '<span id="stOutputNamePreview" class="st-v7-preview-chip">' + escapeHtml(livePreviewStem + '.png') + '</span>' +
                            '</div>' +
                            '<input type="text" id="stOutputNameInput" class="st-input" placeholder="Ej. MESA SANTORINI 8P ROSA MORADA" value="' + escapeHtml(state.outputName) + '" oninput="CreataPromptsStudio.setOutputName(this.value)">' +
                        '</div>' +

                        '<!-- 5) INDICACIONES ESPECIALES / FUERA DE LO COMÚN (PRIORIDAD MÁXIMA) -->' +
                        renderSpecialDirectivesBoxHtml() +

                        '<div class="st-two-col">' +
                            '<input type="text" class="st-input" placeholder="📝 Notas opcionales" value="' + escapeHtml(state.extraNotes) + '" oninput="CreataPromptsStudio.setFieldSilent(\'extraNotes\', this.value)">' +
                            '<input type="text" class="st-input" placeholder="📐 Medidas (ej. 180x110x75 cm)" value="' + escapeHtml(state.dimensions) + '" oninput="CreataPromptsStudio.setFieldSilent(\'dimensions\', this.value)">' +
                        '</div>' +

                        renderAdvancedOptionsHtml(hasGeminiKey) +

                        '<!-- 6) ACCIONES PRINCIPALES ESTILO V7 (GENERAR | BORRAR) -->' +
                        '<div class="st-v7-action-bar">' +
                            '<button type="button" id="btnGeneratePromptsNow" class="st-btn-generate" onclick="CreataPromptsStudio.generateNow()">🚀 ' + escapeHtml(modeBtnLabel) + '</button>' +
                            '<button type="button" class="st-btn-secondary st-v7-btn-clr" onclick="CreataPromptsStudio.clearPhotos()" title="Borrar fotos y textos sin mover versión ni modo">🗑️ Borrar</button>' +
                        '</div>' +

                        '<!-- 7) MINIATURAS CARGADAS (SOLO SI HAY FOTOS) -->' +
                        renderSelectedThumbsStrip() +
                    '</section>' +

                    '<section class="st-card st-results-card st-v7-out-card">' +
                        '<div id="stGeneratedOutputsWrap">' + renderGeneratedOutputs() + '</div>' +
                    '</section>' +
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

    function bindFurnitureDragAndDrop() {
        if (!rootEl || rootEl.__creataDropBound || typeof rootEl.addEventListener !== 'function') return;
        rootEl.__creataDropBound = true;
        const getDropCard = (ev) => {
            const t = ev && ev.target;
            if (t && typeof t.closest === 'function') return t.closest('#stFurnitureDropCard');
            return byId('stFurnitureDropCard');
        };
        rootEl.addEventListener('dragover', (ev) => {
            const card = getDropCard(ev);
            if (!card) return;
            ev.preventDefault();
            if (card.classList) card.classList.add('is-drop-active');
        });
        rootEl.addEventListener('dragleave', (ev) => {
            const card = getDropCard(ev);
            if (!card) return;
            if (!ev.relatedTarget || (typeof card.contains === 'function' && !card.contains(ev.relatedTarget))) {
                if (card.classList) card.classList.remove('is-drop-active');
            }
        });
        rootEl.addEventListener('drop', (ev) => {
            const card = getDropCard(ev);
            if (!card) return;
            ev.preventDefault();
            if (card.classList) card.classList.remove('is-drop-active');
            const files = ev && ev.dataTransfer && ev.dataTransfer.files;
            if (!files || !files.length) return;
            for (let i = 0; i < files.length; i++) {
                const f = files[i];
                if (f && (/^image\//i.test(f.type || '') || /\.(jpe?g|png|webp|gif|avif|bmp|heic|heif)$/i.test(f.name || ''))) {
                    loadFurnitureFile(f, 'drop');
                    break;
                }
            }
        });
    }

    const api = {
        CANONICAL_STUDIO_PX: CANONICAL_STUDIO_PX,
        IMAGE_MODELS: IMAGE_MODELS,
        ASPECT_RATIO_OPTIONS: ASPECT_RATIO_OPTIONS,
        SINGLE_ANGLES: SINGLE_ANGLES,
        CAMERA_ANGLE_OPTIONS: CAMERA_ANGLE_OPTIONS,
        SPECIAL_DIRECTIVE_PRESETS: SPECIAL_DIRECTIVE_PRESETS,
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
                bindFurnitureDragAndDrop();
                initialized = true;
            }
            renderStudio();
            return true;
        },
        setVersion: function (ver) {
            if (ver !== 'V8' && ver !== 'V7' && ver !== 'V1') return;
            state.version = ver;
            savePrefs();
            state.activeOutTab = 0;
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
            state.activeOutTab = 0;
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
            if (key === 'productName' || key === 'sku' || key === 'outputName') {
                const prevEl = byId('stOutputNamePreview');
                if (prevEl) prevEl.textContent = resolveExactOutputStem(state) + '.png';
            }
        },
        setOutputName: function (val) {
            state.outputName = String(val || '');
            const prevEl = byId('stOutputNamePreview');
            if (prevEl) prevEl.textContent = resolveExactOutputStem(state) + '.png';
            if (state.generatedBlocks.length) {
                state.generatedBlocks = generatePrompts();
                const outWrap = byId('stGeneratedOutputsWrap');
                if (outWrap) outWrap.innerHTML = renderGeneratedOutputs();
            }
        },
        setSpecialDirectives: function (val) {
            state.specialDirectives = String(val || '');
            const box = byId('stSpecialDirectivesBox');
            if (box && typeof box.querySelectorAll === 'function') {
                const curNorm = normSearch(state.specialDirectives);
                const chips = box.querySelectorAll('.st-special-chip');
                for (let i = 0; i < chips.length; i++) {
                    const pid = chips[i].getAttribute('data-preset-id');
                    const preset = SPECIAL_DIRECTIVE_PRESETS.find((p) => p.id === pid);
                    if (preset && chips[i].classList) {
                        chips[i].classList.toggle('is-active', curNorm.indexOf(normSearch(preset.text)) !== -1);
                    }
                }
            }
            if (state.generatedBlocks.length) {
                state.generatedBlocks = generatePrompts();
                const outWrap = byId('stGeneratedOutputsWrap');
                if (outWrap) outWrap.innerHTML = renderGeneratedOutputs();
            }
        },
        toggleSpecialPreset: function (presetId) {
            const preset = SPECIAL_DIRECTIVE_PRESETS.find((p) => p.id === presetId);
            if (!preset) return;
            const cur = cleanStr(state.specialDirectives);
            const lines = cur ? cur.split(/\r?\n/).map((l) => cleanStr(l)).filter(Boolean) : [];
            const targetNorm = normSearch(preset.text);
            const idx = lines.findIndex((l) => normSearch(l) === targetNorm || normSearch(l).indexOf(targetNorm) !== -1);
            if (idx !== -1) {
                lines.splice(idx, 1);
            } else {
                lines.push(preset.text);
            }
            state.specialDirectives = lines.join('\n');
            if (state.generatedBlocks.length) {
                state.generatedBlocks = generatePrompts();
            }
            renderStudio();
        },
        clearSpecialDirectives: function () {
            state.specialDirectives = '';
            if (state.generatedBlocks.length) {
                state.generatedBlocks = generatePrompts();
            }
            renderStudio();
        },
        setBool: function (key, val) {
            state[key] = Boolean(val);
            savePrefs();
            if (state.generatedBlocks.length) {
                state.generatedBlocks = generatePrompts();
            }
            renderStudio();
        },
        setGeminiOpen: function (isOpen) {
            state.geminiOpen = Boolean(isOpen);
        },
        setAdvancedOpen: function (isOpen) {
            state.advancedOpen = Boolean(isOpen);
        },
        setActiveOutTab: function (idx) {
            const n = Number(idx) || 0;
            state.activeOutTab = Math.min(Math.max(0, n), Math.max(0, state.generatedBlocks.length - 1));
            const outWrap = byId('stGeneratedOutputsWrap');
            if (outWrap) {
                outWrap.innerHTML = renderGeneratedOutputs();
            } else {
                renderStudio();
            }
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
            if (typeof window !== 'undefined' && window.__CREATA_PROMPTS_BACK_NAV__ && typeof window.__CREATA_PROMPTS_BACK_NAV__.syncDepthOnUserAction === 'function') {
                window.__CREATA_PROMPTS_BACK_NAV__.syncDepthOnUserAction('studio_picker');
            }
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
            const bodyEl = byId('stMaterialPickerBody');
            const titleEl = byId('stMaterialPickerTitle');
            if (bodyEl && state.activeMaterialPicker) {
                const isWood = state.activeMaterialPicker === 'MADERA';
                const filtered = getFilteredMaterialsForPicker();
                if (titleEl) {
                    titleEl.textContent = (isWood ? '🪵 MADERAS' : '🧵 TELAS') + ' (' + filtered.length + ')';
                }
                bodyEl.innerHTML = renderMaterialPickerBodyHtml(isWood, filtered);
                return;
            }
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
            if (typeof window !== 'undefined' && window.__CREATA_PROMPTS_BACK_NAV__ && typeof window.__CREATA_PROMPTS_BACK_NAV__.syncDepthOnUserAction === 'function') {
                window.__CREATA_PROMPTS_BACK_NAV__.syncDepthOnUserAction('studio_picker');
            }
        },
        closeSourcePanel: function () {
            state.activeSourceTab = '';
            renderStudio();
        },
        hasActivePicker: function () {
            return Boolean(state.activeMaterialPicker || state.activeSourceTab);
        },
        closeActivePickers: function () {
            if (state.activeMaterialPicker) {
                state.activeMaterialPicker = '';
                renderStudio();
                return true;
            }
            if (state.activeSourceTab) {
                state.activeSourceTab = '';
                renderStudio();
                return true;
            }
            return false;
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
            state.activeOutTab = 0;
            state.generatedBlocks = generatePrompts();
            renderStudio();
            showStudioToast('⚡ ' + state.generatedBlocks.length + ' prompt(s) ' + state.version + ' listos.', 'ok');
            return state.generatedBlocks;
        },
        generateQuick34Right: function () {
            state.activeOutTab = 0;
            state.generatedBlocks = generatePrompts({
                version: 'V8',
                v8Mode: 'SINGLE_VIEW',
                angleId: 'THREE_QUARTER_RIGHT',
                aspectRatio: '1:1',
                forceCreataSpec: true,
                forceThreeQuarterRight: true
            });
            renderStudio();
            showStudioToast('↘️ Prompt 3/4 Derecha (2048×2048 · #FFFFFF · 0% sombra) listo.', 'ok');
            return state.generatedBlocks;
        },
        copyGenerated: function (idx, btnEl) {
            const blk = state.generatedBlocks[idx];
            if (!blk) return Promise.resolve(false);
            return copyPromptText(blk.prompt, btnEl);
        },
        copyOutputName: function (idx, btnEl) {
            const blk = state.generatedBlocks[idx];
            const outFile = (blk && blk.outputFileName) || (resolveExactOutputStem(state) + '.png');
            return copyPromptText(outFile, btnEl, '🏷️ Nombre exacto copiado: ' + outFile);
        },
        sendNameToOdooUpload: function (idx) {
            const blk = state.generatedBlocks[idx];
            const stem = (blk && blk.outputStem) || resolveExactOutputStem(state);
            if (typeof window !== 'undefined' && typeof window.openProptUploadWithName === 'function') {
                window.openProptUploadWithName(stem, state.sku);
                return stem;
            }
            showStudioToast('🏷️ Nombre listo: ' + stem + '.png', 'ok');
            return stem;
        },
        resolveExactOutputStem: resolveExactOutputStem,
        generatePrompts: generatePrompts,
        detectCategoryFromInputs: detectCategoryFromInputs,
        getState: function () { return state; }
    };

    if (typeof window !== 'undefined') {
        window.CreataPromptsStudio = api;
    }
})();
