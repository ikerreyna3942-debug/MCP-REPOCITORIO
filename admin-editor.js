async function extractImageFromDropEvent(e) {
            // 1. Archivos locales desde explorador de archivos (Windows / Mac / Linux)
            if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                for (let i = 0; i < e.dataTransfer.files.length; i++) {
                    const f = e.dataTransfer.files[i];
                    const isImg = (f.type && f.type.startsWith('image/')) ||
                                  /\.(jpe?g|png|webp|gif|bmp|avif|jfif|svg)$/i.test(f.name) ||
                                  (!f.type && f.size > 0);
                    if (isImg) return f;
                }
            }

            // 2. DataTransfer items (archivos arrastrados de apps modernas)
            if (e.dataTransfer && e.dataTransfer.items && e.dataTransfer.items.length > 0) {
                for (let i = 0; i < e.dataTransfer.items.length; i++) {
                    const item = e.dataTransfer.items[i];
                    if (item.kind === 'file') {
                        const f = item.getAsFile();
                        if (f) return f;
                    }
                }
            }

            // 3. Arrastre desde otra pestaña, navegador o Drive (URL)
            if (e.dataTransfer) {
                const uri = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('URL') || e.dataTransfer.getData('text/plain');
                if (uri && (uri.startsWith('http://') || uri.startsWith('https://') || uri.startsWith('data:image/'))) {
                    return uri.trim();
                }

                // 4. Fragmento HTML con <img src="...">
                const html = e.dataTransfer.getData('text/html');
                if (html) {
                    const m = html.match(/src=["'](.*?)["']/i);
                    if (m && m[1]) return m[1].trim();
                }
            }

            return null;
        }

        // ==========================================================================
        // NORMALIZACIÓN AUTOMÁTICA DEL TAMAÑO VISUAL DEL MUEBLE AL SUBIR CUALQUIER FOTO
        // ==========================================================================
        function autocropAndNormalizeImage(imgElement, targetWidth = 1200, targetHeight = 1200, scalePadding = 0.84) {
            try {
                const tempCanvas = document.createElement('canvas');
                const srcW = imgElement.naturalWidth || imgElement.width;
                const srcH = imgElement.naturalHeight || imgElement.height;
                if (!srcW || !srcH) return null;
                tempCanvas.width = srcW;
                tempCanvas.height = srcH;
                const tempCtx = tempCanvas.getContext('2d');
                tempCtx.drawImage(imgElement, 0, 0);

                const imgData = tempCtx.getImageData(0, 0, srcW, srcH);
                const data = imgData.data;

                let minX = srcW, minY = srcH, maxX = 0, maxY = 0;
                let nonWhiteCount = 0;

                for (let y = 0; y < srcH; y++) {
                    for (let x = 0; x < srcW; x++) {
                        const idx = (y * srcW + x) * 4;
                        const r = data[idx];
                        const g = data[idx + 1];
                        const b = data[idx + 2];
                        const a = data[idx + 3];
                        if (a > 30 && (r < 246 || g < 246 || b < 246)) {
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
                if (nonWhiteCount < 100 || boxW < 20 || boxH < 20) {
                    return null;
                }

                const padX = Math.round(boxW * 0.02);
                const padY = Math.round(boxH * 0.02);
                const cropX = Math.max(0, minX - padX);
                const cropY = Math.max(0, minY - padY);
                const cropW = Math.min(srcW - cropX, boxW + (padX * 2));
                const cropH = Math.min(srcH - cropY, boxH + (padY * 2));

                const outCanvas = document.createElement('canvas');
                outCanvas.width = targetWidth;
                outCanvas.height = targetHeight;
                const outCtx = outCanvas.getContext('2d');
                outCtx.clearRect(0, 0, targetWidth, targetHeight);

                const maxTargetDimW = targetWidth * scalePadding;
                const maxTargetDimH = targetHeight * scalePadding;
                const scale = Math.min(maxTargetDimW / cropW, maxTargetDimH / cropH);

                const drawW = Math.round(cropW * scale);
                const drawH = Math.round(cropH * scale);
                const drawX = Math.round((targetWidth - drawW) / 2);
                const drawY = Math.round((targetHeight - drawH) / 2);

                outCtx.drawImage(tempCanvas, cropX, cropY, cropW, cropH, drawX, drawY, drawW, drawH);
                return outCanvas.toDataURL('image/webp', 0.90);
            } catch (e) {
                console.warn('Autocrop skipped:', e);
                return null;
            }
        }

        const __slotBgSessionBackup = {};
        function getBgBackupKey_(prod, varIdx, slotKey) {
            const pid = (prod && (prod.id || prod.model_name)) || 'item';
            return `${pid}::${varIdx || 0}::${slotKey}`;
        }
        function hasSlotBgRestoreAvailable(prod, varIdx, slotKey) {
            const entry = __slotBgSessionBackup[getBgBackupKey_(prod, varIdx, slotKey)];
            return !!(entry && entry.origSrc && entry.isRemoved);
        }
        window.hasSlotBgRestoreAvailable = hasSlotBgRestoreAvailable;

        function getEditorBgMode() {
            try {
                const saved = localStorage.getItem('creata_editor_bg_mode');
                if (saved === 'keep' || saved === 'cutout') return saved;
            } catch (_) {}
            return 'cutout';
        }

        function syncEditorBgModeButtons_() {
            const mode = getEditorBgMode();
            document.querySelectorAll('[data-bg-mode-btn]').forEach((btn) => {
                const btnMode = btn.getAttribute('data-bg-mode-btn');
                btn.classList.toggle('active', btnMode === mode);
            });
        }

        function setEditorBgMode(mode) {
            const cleanMode = mode === 'keep' ? 'keep' : 'cutout';
            try { localStorage.setItem('creata_editor_bg_mode', cleanMode); } catch (_) {}
            syncEditorBgModeButtons_();
            if (typeof showAdminToast === 'function') {
                showAdminToast(
                    cleanMode === 'keep'
                        ? 'Modo manual: conservar fondo en vistas (Ambiente y Acabado siempre se conservan)'
                        : 'Modo automático IA activo: Portada y Vistas sin fondo · Ambiente y Acabado intactos',
                    cleanMode === 'keep' ? '🖼️' : '✨'
                );
            }
        }
        window.setEditorBgMode = setEditorBgMode;
        window.getEditorBgMode = getEditorBgMode;

        // Asegurar que al abrir el editor siempre inicie en modo automático IA ('cutout') para no arrastrar 'keep' accidentalmente
        try { localStorage.setItem('creata_editor_bg_mode', 'cutout'); } catch (_) {}

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', syncEditorBgModeButtons_);
        } else {
            setTimeout(syncEditorBgModeButtons_, 0);
        }

        function getSlotCompressionOptions(slotType) {
            if (slotType === 'finish' || slotType === 'fabric') return { mode: 'swatch' };
            if (slotType === 'ambiente') return { mode: 'keep' };
            return { mode: 'cutout' };
        }

        // Convertir cualquier fuente de imagen (File, Blob, DataURL, URL externa) a WebP transparente/optimizado
        function imageSourceToBase64(src, maxWidth = 1000, maxHeight = 750, quality = 0.92, options = {}) {
            if (window.CreataCloud && window.CreataCloud.compressImageFast) {
                return window.CreataCloud.compressImageFast(src, maxWidth, maxHeight, quality, options);
            }
            if (window.CreataImg && window.CreataImg.compressImageFast) {
                return window.CreataImg.compressImageFast(src, maxWidth, maxHeight, quality, options);
            }
            return Promise.resolve(typeof src === 'string' ? src : null);
        }

        function compressImage(file, maxWidth = 1000, maxHeight = 750, quality = 0.92, options = {}) {
            return imageSourceToBase64(file, maxWidth, maxHeight, quality, options);
        }

        // Manejadores de Drag & Drop para slots del modal
        function handleSlotDragOver(e) {
            e.preventDefault();
            e.stopPropagation();
            if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
            e.currentTarget.classList.add('drag-over');
        }

        function handleSlotDragLeave(e) {
            e.preventDefault();
            e.stopPropagation();
            if (!e.currentTarget.contains(e.relatedTarget)) {
                e.currentTarget.classList.remove('drag-over');
            }
        }

        // Regla automática obligatoria por tipo de recuadro:
        // - finish / fabric -> conserva textura de acabado/color al 100%
        // - ambiente        -> conserva habitación/escena completa al 100% (NUNCA quita fondo)
        // - hero / view1..4 -> SIEMPRE quita fondo con IA neuronal y centra/escala uniforme en 1000x750
        async function processUploadSourceForSlot_(rawSource, slotType) {
            const p = products[currentProdIndex];
            const isFinish = slotType === 'finish' || slotType === 'fabric';
            if (isFinish) {
                return imageSourceToBase64(rawSource, 700, 700, 0.92, { mode: 'swatch' });
            }
            if (slotType === 'ambiente') {
                const ambB64 = await imageSourceToBase64(rawSource, 1280, 960, 0.92, { mode: 'keep' });
                if (p && ambB64) {
                    const key = getBgBackupKey_(p, currentVariantIndex, 'ambiente');
                    __slotBgSessionBackup[key] = { origSrc: ambB64, isRemoved: false };
                }
                return ambB64;
            }
            const keepB64 = await imageSourceToBase64(rawSource, 1200, 900, 0.90, { mode: 'keep' });
            const cutoutB64 = await imageSourceToBase64(rawSource, 1000, 750, 0.92, { mode: 'cutout' });
            if (p && keepB64) {
                const key = getBgBackupKey_(p, currentVariantIndex, slotType);
                __slotBgSessionBackup[key] = { origSrc: keepB64, isRemoved: true };
            }
            return cutoutB64 || keepB64;
        }

        async function handleSlotDrop(e, slotType) {
            e.preventDefault();
            e.stopPropagation();
            e.currentTarget.classList.remove('drag-over');

            try {
                const isFinish = slotType === 'finish' || slotType === 'fabric';
                const isAmb = slotType === 'ambiente';
                showAdminToast(
                    isFinish
                        ? 'Procesando muestra de color / acabado (conservando textura)...'
                        : (isAmb ? 'Cargando Foto de Ambiente completa (conservando escenario)...' : '✨ IA quitando fondo y centrando mueble a escala...'),
                    isFinish ? '🧵' : (isAmb ? '🖼️' : '✨')
                );
                const rawItem = await extractImageFromDropEvent(e);
                if (!rawItem) {
                    showAdminToast('Por favor suelta un archivo de imagen válido', '⚠️');
                    return;
                }
                const b64 = await processUploadSourceForSlot_(rawItem, slotType);
                if (!b64) {
                    showAdminToast('No se pudo leer la imagen', '❌');
                    return;
                }
                await assignImageToSlot(b64, slotType);
            } catch (err) {
                console.error('Error en slot drop:', err);
                showAdminToast('Error al procesar la foto', '❌');
            }
        }

        async function uploadSlotPhotoToCloudIfConfigured(prod, varIdx, slotType, b64) {
            let finalSrc = b64;
            let cloudMsg = '';
            if (window.CreataCloud && window.CreataCloud.config.isConfigured()) {
                const upRes = await window.CreataCloud.cloudUploadPhoto(prod, varIdx, slotType, b64);
                if (upRes && upRes.ok && upRes.url) {
                    finalSrc = upRes.url;
                    cloudMsg = ' ☁️ (en vivo)';
                } else if (upRes && upRes.error) {
                    showAdminToast(`Aviso nube: ${upRes.error} (guardada localmente)`, '⚠️');
                }
            }
            return { finalSrc, cloudMsg };
        }

        async function assignImageToSlot(b64, slotType) {
            const p = products[currentProdIndex];
            if (!p) return;
            if (!p.variants || p.variants.length === 0) {
                p.variants = [{ name: p.model_name, finish_type: 'TELA', color_label: 'ACABADO OFICIAL', swatch_hex: '#B8893E', hero_b64: '' }];
                currentVariantIndex = 0;
            }
            const v = p.variants[currentVariantIndex] || p.variants[0];
            if (!v.gallery) v.gallery = {};
            if (!Array.isArray(v.gallery.all_views)) v.gallery.all_views = [];
            if (!v.slot_scales || typeof v.slot_scales !== 'object') v.slot_scales = {};
            if (!v.slot_pos || typeof v.slot_pos !== 'object') v.slot_pos = {};

            const { finalSrc, cloudMsg } = await uploadSlotPhotoToCloudIfConfigured(p, currentVariantIndex, slotType, b64);

            if (slotType === 'ambiente') {
                v.gallery.ambiente = finalSrc;
                delete v.slot_scales.ambiente;
                delete v.slot_pos.ambiente;
                // NO sobreescribir hero_b64 con foto de ambiente (Portada lleva recorte limpio)
                showAdminToast(`Foto de Ambiente actualizada intacta${cloudMsg}`, '🖼️');
            } else if (slotType === 'finish') {
                // Vinculación bidireccional 100%: recuadro Tela/Acabado <-> botón circular de muestra de tela
                v.swatch_img = finalSrc;
                v.gallery.finish = finalSrc;
                v.gallery.fabric = finalSrc;
                v.gallery.finishes = [finalSrc];
                delete v.slot_scales.finish;
                delete v.slot_pos.finish;
                showAdminToast(`Foto de Tela / Acabado vinculada${cloudMsg}`, '🧵');
            } else if (slotType.startsWith('view')) {
                const vIdx = parseInt(slotType.replace('view', ''), 10) - 1;
                v.gallery.all_views[vIdx] = finalSrc;
                v.gallery[slotType] = finalSrc;
                delete v.slot_scales[slotType];
                delete v.slot_pos[slotType];
                // Si aún no hay foto de portada limpia (o tenía por error una de ambiente/acabado), usar esta vista recortada
                if (!v.hero_b64 || v.hero_b64 === v.swatch_img || v.hero_b64 === v.gallery.ambiente || /-(finish|ambiente)-\d+\./i.test(v.hero_b64)) {
                    v.hero_b64 = finalSrc;
                    v.hero_scale = 1;
                    delete v.hero_pos;
                }
                showAdminToast(`Vista ${vIdx + 1} recortada y centrada${cloudMsg}`, '✨');
            } else if (slotType === 'hero') {
                v.hero_b64 = finalSrc;
                v.hero_scale = 1;
                delete v.hero_pos;
                // NO sobreescribir v.gallery.ambiente con un recorte sin fondo
                showAdminToast(`Portada recortada y centrada${cloudMsg}`, '✨');
            }

            updateModalView(false);
            await saveCatalogData();
            if (window.CreataCloud && window.CreataCloud.config.isConfigured()) {
                await window.CreataCloud.cloudPost('save_product', { product: p });
            }
            filterCatalog();
        }

        async function toggleSlotBackgroundManual(slotType) {
            const p = products[currentProdIndex];
            if (!p) return;
            if (slotType === 'ambiente' || slotType === 'finish' || slotType === 'fabric') {
                showAdminToast('Las fotos de Ambiente y Acabado siempre conservan su fondo original por regla del catálogo', 'ℹ️');
                return;
            }
            const v = (p.variants && p.variants[currentVariantIndex]) ? p.variants[currentVariantIndex] : (p.variants ? p.variants[0] : null);
            if (!v || !v.gallery) return;
            let currentSrc = '';
            if (slotType === 'hero') currentSrc = v.hero_b64 || '';
            else if (slotType.startsWith('view')) {
                const vIdx = parseInt(slotType.replace('view', ''), 10) - 1;
                currentSrc = v.gallery[slotType] || (Array.isArray(v.gallery.all_views) ? v.gallery.all_views[vIdx] : '') || '';
            }
            if (!currentSrc) {
                showAdminToast('Primero sube una foto en este espacio', '⚠️');
                return;
            }
            const backupKey = getBgBackupKey_(p, currentVariantIndex, slotType);
            const existingBackup = __slotBgSessionBackup[backupKey];

            if (existingBackup && existingBackup.origSrc && existingBackup.isRemoved) {
                try {
                    showAdminToast('Restaurando foto con su fondo original...', '🖼️');
                    existingBackup.isRemoved = false;
                    await assignImageToSlot(existingBackup.origSrc, slotType);
                    showAdminToast('Foto restaurada con su fondo original', '🖼️');
                } catch (err) {
                    console.error('Error restaurando fondo:', err);
                }
                return;
            }

            try {
                if (!existingBackup || !existingBackup.origSrc) {
                    __slotBgSessionBackup[backupKey] = { origSrc: currentSrc, isRemoved: false };
                }
                showAdminToast('✨ IA quitando fondo y normalizando escala...', '⏳');
                const cleanB64 = await imageSourceToBase64(currentSrc, 1000, 750, 0.92, { mode: 'cutout', forceAi: true });
                if (cleanB64) {
                    __slotBgSessionBackup[backupKey].isRemoved = true;
                    await assignImageToSlot(cleanB64, slotType);
                    showAdminToast('¡Fondo eliminado y mueble centrado con IA!', '✨');
                }
            } catch (err) {
                console.error('Error quitando fondo IA:', err);
                showAdminToast('No se pudo quitar el fondo de esta imagen', '❌');
            }
        }
        const removeSlotBackgroundManual = toggleSlotBackgroundManual;

        async function uploadSlotImage(event, slotType) {
            const file = event.target.files[0];
            event.target.value = '';
            if (!file) return;
            try {
                const isFinish = slotType === 'finish' || slotType === 'fabric';
                const isAmb = slotType === 'ambiente';
                showAdminToast(
                    isFinish
                        ? 'Procesando muestra de tela/acabado (conservando textura)...'
                        : (isAmb ? 'Cargando Foto de Ambiente completa (conservando escenario)...' : '✨ IA quitando fondo y centrando mueble a escala...'),
                    isFinish ? '🧵' : (isAmb ? '🖼️' : '✨')
                );
                const b64 = await processUploadSourceForSlot_(file, slotType);
                if (b64) {
                    await assignImageToSlot(b64, slotType);
                }
            } catch (err) {
                console.error(err);
                showAdminToast('Error al procesar la imagen', '❌');
            }
        }

        async function handleGalleryDrop(e) {
            e.preventDefault();
            e.stopPropagation();
            e.currentTarget.classList.remove('drag-over');

            try {
                if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    await processMultipleGalleryFiles(e.dataTransfer.files);
                    return;
                }
                const rawItem = await extractImageFromDropEvent(e);
                if (rawItem) {
                    let role = 'cutout';
                    if (window.CreataImg && typeof window.CreataImg.classifyPhotoRoleWithGemini === 'function') {
                        role = await window.CreataImg.classifyPhotoRoleWithGemini(rawItem, '');
                    }
                    const p = products[currentProdIndex];
                    const v = (p && p.variants && p.variants[currentVariantIndex]) ? p.variants[currentVariantIndex] : {};
                    const g = v.gallery || {};
                    let targetSlot = findNextFreeGallerySlot();
                    if (role === 'ambiente' && (!g.ambiente || !g.ambiente.trim())) targetSlot = 'ambiente';
                    else if (role === 'finish' && (!g.finish || !g.finish.trim())) targetSlot = 'finish';
                    const b64 = await processUploadSourceForSlot_(rawItem, targetSlot);
                    if (b64) {
                        await assignImageToSlot(b64, targetSlot);
                    }
                }
            } catch (err) {
                console.error('Error en gallery drop:', err);
            }
        }

        function findNextFreeGallerySlot() {
            const p = products[currentProdIndex];
            const v = (p && p.variants && p.variants[currentVariantIndex]) ? p.variants[currentVariantIndex] : {};
            const g = v.gallery || {};
            const slots = ['view1', 'view2', 'view3', 'view4'];
            for (let i = 0; i < slots.length; i++) {
                const val = g[slots[i]] || (Array.isArray(g.all_views) ? g.all_views[i] : '');
                if (!val || !val.trim()) return slots[i];
            }
            return 'view4';
        }

        function inferGallerySlotFromFileName_(fileName) {
            if (!fileName || typeof fileName !== 'string') return '';
            const base = fileName.toLowerCase().replace(/\.[a-z0-9]+$/i, '').trim();
            if (/(?:^|[\s_\-.])(portada|inicio|hero|cover|principal|01)(?:$|[\s_\-.])/i.test(base)) return 'hero';
            if (/(?:^|[\s_\-.])(ambiente|amb|lifestyle|escena|02)(?:$|[\s_\-.])/i.test(base)) return 'ambiente';
            if (/(?:^|[\s_\-.])(tela|acabado|finish|swatch|textura|madera|muestra)(?:$|[\s_\-.])/i.test(base)) return 'finish';
            if (/(?:^|[\s_\-.])(vista\s*1|view\s*1|v1|angulo\s*1|03)(?:$|[\s_\-.])/i.test(base)) return 'view1';
            if (/(?:^|[\s_\-.])(vista\s*2|view\s*2|v2|angulo\s*2|04)(?:$|[\s_\-.])/i.test(base)) return 'view2';
            if (/(?:^|[\s_\-.])(vista\s*3|view\s*3|v3|angulo\s*3|05)(?:$|[\s_\-.])/i.test(base)) return 'view3';
            if (/(?:^|[\s_\-.])(vista\s*4|view\s*4|v4|angulo\s*4|06)(?:$|[\s_\-.])/i.test(base)) return 'view4';
            return '';
        }

        function getSlotDomElement_(targetKey) {
            const imgMap = {
                ambiente: 'slotImgAmbiente',
                finish: 'slotImgFinish',
                view1: 'slotImgView1',
                view2: 'slotImgView2',
                view3: 'slotImgView3',
                view4: 'slotImgView4'
            };
            return document.getElementById(imgMap[targetKey] || '');
        }

        function syncSlotVisualTransform_(v, targetKey) {
            if (!v) return;
            if (targetKey === 'hero') {
                const sc = Number(v.hero_scale) || 1;
                const hp = (v.hero_pos && typeof v.hero_pos === 'object') ? v.hero_pos : { x: 0, y: 0 };
                const lbl = document.getElementById('lblScale_hero');
                if (lbl) lbl.textContent = `${Math.round(sc * 100)}%`;
                const cardImg = document.getElementById(`grid_card_img_${currentProdIndex}`);
                if (cardImg) {
                    cardImg.style.setProperty('--img-scale', String(sc));
                    cardImg.style.setProperty('--img-x', `${Number(hp.x) || 0}%`);
                    cardImg.style.setProperty('--img-y', `${Number(hp.y) || 0}%`);
                }
                return;
            }
            const sc = Number(v.slot_scales && v.slot_scales[targetKey]) || 1;
            const sp = (v.slot_pos && v.slot_pos[targetKey]) ? v.slot_pos[targetKey] : { x: 0, y: 0 };
            const px = Number(sp.x) || 0;
            const py = Number(sp.y) || 0;
            const lbl = document.getElementById(`lblScale_${targetKey}`);
            if (lbl) lbl.textContent = `${Math.round(sc * 100)}%`;
            const slotEl = getSlotDomElement_(targetKey);
            if (slotEl) {
                if (targetKey === 'finish') {
                    if (sc < 0.995) {
                        slotEl.style.objectFit = 'contain';
                        slotEl.style.objectPosition = '50% 50%';
                        slotEl.style.transformOrigin = '50% 50%';
                        slotEl.style.transform = `translate(${px}%, ${py}%) scale(${sc})`;
                    } else {
                        const objX = Math.max(0, Math.min(100, Math.round((50 - px * 1.4) * 10) / 10));
                        const objY = Math.max(0, Math.min(100, Math.round((50 - py * 1.4) * 10) / 10));
                        slotEl.style.objectFit = 'cover';
                        slotEl.style.objectPosition = `${objX}% ${objY}%`;
                        slotEl.style.transformOrigin = `${objX}% ${objY}%`;
                        slotEl.style.transform = sc > 1.005 ? `scale(${sc})` : '';
                    }
                } else {
                    slotEl.style.objectPosition = '50% 50%';
                    slotEl.style.transformOrigin = '50% 50%';
                    slotEl.style.transform = (px !== 0 || py !== 0 || sc !== 1)
                        ? `translate(${px}%, ${py}%) scale(${sc})`
                        : '';
                }
            }
            // Sincronizar automáticamente la Portada si usa la misma foto que Ambiente o Vista 1
            if (targetKey === 'ambiente' || targetKey === 'view1') {
                const g = v.gallery || {};
                const slotSrc = g[targetKey] || '';
                if (slotSrc && v.hero_b64 === slotSrc) {
                    v.hero_scale = sc;
                    v.hero_pos = { x: px, y: py };
                    const cardImg = document.getElementById(`grid_card_img_${currentProdIndex}`);
                    if (cardImg) {
                        cardImg.style.setProperty('--img-scale', String(sc));
                        cardImg.style.setProperty('--img-x', `${px}%`);
                        cardImg.style.setProperty('--img-y', `${py}%`);
                    }
                }
            }
        }

        async function adjustPhotoScale(targetKey, delta) {
            const p = products[currentProdIndex];
            if (!p) return;
            const v = (p.variants && p.variants[currentVariantIndex]) ? p.variants[currentVariantIndex] : (p.variants ? p.variants[0] : null);
            if (!v) return;
            if (!v.slot_scales || typeof v.slot_scales !== 'object') v.slot_scales = {};

            if (targetKey === 'hero') {
                const cur = Number(v.hero_scale) || 1;
                v.hero_scale = Math.max(0.25, Math.min(2.5, Math.round((cur + delta) * 100) / 100));
            } else {
                const cur = Number(v.slot_scales[targetKey]) || 1;
                v.slot_scales[targetKey] = Math.max(0.25, Math.min(2.5, Math.round((cur + delta) * 100) / 100));
            }
            syncSlotVisualTransform_(v, targetKey);

            await saveCatalogData();
            if (typeof scheduleVariantCloudSave_ === 'function') {
                scheduleVariantCloudSave_(p);
            }
        }

        async function toggleFitFinishPhoto() {
            const p = products[currentProdIndex];
            if (!p) return;
            const v = (p.variants && p.variants[currentVariantIndex]) ? p.variants[currentVariantIndex] : (p.variants ? p.variants[0] : null);
            if (!v) return;
            if (!v.slot_scales || typeof v.slot_scales !== 'object') v.slot_scales = {};
            if (!v.slot_pos || typeof v.slot_pos !== 'object') v.slot_pos = {};
            const cur = Number(v.slot_scales.finish) || 1;
            if (cur >= 0.995) {
                v.slot_scales.finish = 0.92;
                v.slot_pos.finish = { x: 0, y: 0 };
                showAdminToast('Foto ajustada completa (sin recorte)', '⊡');
            } else {
                v.slot_scales.finish = 1;
                v.slot_pos.finish = { x: 0, y: 0 };
                showAdminToast('Foto llenando recuadro al 100%', '🖼️');
            }
            syncSlotVisualTransform_(v, 'finish');
            await saveCatalogData();
            if (typeof scheduleVariantCloudSave_ === 'function') {
                scheduleVariantCloudSave_(p);
            }
        }

        async function adjustPhotoPosition(targetKey, dx, dy) {
            const p = products[currentProdIndex];
            if (!p) return;
            const v = (p.variants && p.variants[currentVariantIndex]) ? p.variants[currentVariantIndex] : (p.variants ? p.variants[0] : null);
            if (!v) return;
            const clampPos = (val) => Math.max(-80, Math.min(80, Math.round(val * 10) / 10));
            if (targetKey === 'hero') {
                const cur = (v.hero_pos && typeof v.hero_pos === 'object') ? v.hero_pos : { x: 0, y: 0 };
                v.hero_pos = { x: clampPos((Number(cur.x) || 0) + dx), y: clampPos((Number(cur.y) || 0) + dy) };
            } else {
                if (!v.slot_pos || typeof v.slot_pos !== 'object') v.slot_pos = {};
                const cur = (v.slot_pos[targetKey] && typeof v.slot_pos[targetKey] === 'object') ? v.slot_pos[targetKey] : { x: 0, y: 0 };
                v.slot_pos[targetKey] = { x: clampPos((Number(cur.x) || 0) + dx), y: clampPos((Number(cur.y) || 0) + dy) };
            }
            syncSlotVisualTransform_(v, targetKey);
            await saveCatalogData();
            if (typeof scheduleVariantCloudSave_ === 'function') {
                scheduleVariantCloudSave_(p);
            }
        }

        function handleSlotWheelZoom(e, slotKey) {
            const el = getSlotDomElement_(slotKey);
            if (!el || el.style.display === 'none' || !el.getAttribute('src')) return;
            e.preventDefault();
            e.stopPropagation();
            const step = e.deltaY < 0 ? 0.06 : -0.06;
            adjustPhotoScale(slotKey, step);
        }

        async function resetPhotoScale(targetKey) {
            const p = products[currentProdIndex];
            if (!p) return;
            const v = (p.variants && p.variants[currentVariantIndex]) ? p.variants[currentVariantIndex] : (p.variants ? p.variants[0] : null);
            if (!v) return;
            if (targetKey === 'hero') {
                v.hero_scale = 1;
                delete v.hero_pos;
            } else {
                if (v.slot_scales) delete v.slot_scales[targetKey];
                if (v.slot_pos) delete v.slot_pos[targetKey];
            }
            updateModalView(false);
            filterCatalog();
            await saveCatalogData();
            if (typeof scheduleVariantCloudSave_ === 'function') {
                scheduleVariantCloudSave_(p);
            }
            showAdminToast('Foto centrada y restaurada al 100%', '↺');
        }

        // ARRASTRAR CON EL MOUSE / TÁCTIL PARA ACOMODAR CUALQUIER FOTO DE LA GALERÍA
        (function initSlotDragToPan_() {
            let activePan = null;
            document.addEventListener('pointerdown', (e) => {
                if (e.button !== undefined && e.button !== 0) return;
                const imgEl = e.target && e.target.closest ? e.target.closest('.slot-pannable-img[data-pan-slot]') : null;
                if (!imgEl || imgEl.style.display === 'none' || !imgEl.getAttribute('src')) return;
                const slotKey = imgEl.getAttribute('data-pan-slot');
                const p = products[currentProdIndex];
                const v = (p && p.variants) ? (p.variants[currentVariantIndex] || p.variants[0]) : null;
                if (!v || !slotKey) return;
                if (!v.slot_pos || typeof v.slot_pos !== 'object') v.slot_pos = {};
                const startPos = v.slot_pos[slotKey] || { x: 0, y: 0 };
                const box = imgEl.parentElement ? imgEl.parentElement.getBoundingClientRect() : imgEl.getBoundingClientRect();
                activePan = {
                    imgEl,
                    slotKey,
                    prod: p,
                    variant: v,
                    startClientX: e.clientX,
                    startClientY: e.clientY,
                    startX: Number(startPos.x) || 0,
                    startY: Number(startPos.y) || 0,
                    boxW: Math.max(80, box.width || 200),
                    boxH: Math.max(80, box.height || 200),
                    moved: false
                };
                imgEl.classList.add('is-panning');
                try { imgEl.setPointerCapture(e.pointerId); } catch (_) {}
                e.preventDefault();
            });

            document.addEventListener('pointermove', (e) => {
                if (!activePan) return;
                const dxPx = e.clientX - activePan.startClientX;
                const dyPx = e.clientY - activePan.startClientY;
                if (Math.abs(dxPx) > 1.5 || Math.abs(dyPx) > 1.5) activePan.moved = true;
                const nx = Math.max(-80, Math.min(80, Math.round((activePan.startX + (dxPx / activePan.boxW) * 100) * 10) / 10));
                const ny = Math.max(-80, Math.min(80, Math.round((activePan.startY + (dyPx / activePan.boxH) * 100) * 10) / 10));
                activePan.variant.slot_pos[activePan.slotKey] = { x: nx, y: ny };
                syncSlotVisualTransform_(activePan.variant, activePan.slotKey);
            });

            const finishPan = async (e) => {
                if (!activePan) return;
                const finished = activePan;
                activePan = null;
                finished.imgEl.classList.remove('is-panning');
                try { if (e && e.pointerId !== undefined) finished.imgEl.releasePointerCapture(e.pointerId); } catch (_) {}
                if (finished.moved) {
                    await saveCatalogData();
                    if (typeof scheduleVariantCloudSave_ === 'function') {
                        scheduleVariantCloudSave_(finished.prod);
                    }
                }
            };
            document.addEventListener('pointerup', finishPan);
            document.addEventListener('pointercancel', finishPan);

            document.addEventListener('dblclick', (e) => {
                const imgEl = e.target && e.target.closest ? e.target.closest('.slot-pannable-img[data-pan-slot]') : null;
                if (!imgEl || imgEl.style.display === 'none') return;
                const slotKey = imgEl.getAttribute('data-pan-slot');
                if (slotKey) {
                    e.preventDefault();
                    resetPhotoScale(slotKey);
                }
            });
        })();

        async function handleGalleryMultiUpload(e) {
            const files = e.target.files;
            if (!files || files.length === 0) return;
            await processMultipleGalleryFiles(files);
            e.target.value = '';
        }

        async function processMultipleGalleryFiles(files) {
            const p = products[currentProdIndex];
            if (!p) return;
            showAdminToast(`✨ Agente IA revisando ${files.length} foto(s) (Ambiente / Acabado / Recortes)...`, '✨');
            let addedCount = 0;
            for (let i = 0; i < files.length; i++) {
                const f = files[i];
                let targetSlot = inferGallerySlotFromFileName_(f && f.name);
                if (!targetSlot) {
                    let role = 'cutout';
                    if (window.CreataImg && typeof window.CreataImg.classifyPhotoRoleWithGemini === 'function') {
                        role = await window.CreataImg.classifyPhotoRoleWithGemini(f, (f && f.name) || '');
                    }
                    const v = (p.variants && p.variants[currentVariantIndex]) ? p.variants[currentVariantIndex] : (p.variants && p.variants[0]) || {};
                    const g = v.gallery || {};
                    if (role === 'ambiente' && (!g.ambiente || !String(g.ambiente).trim())) {
                        targetSlot = 'ambiente';
                    } else if (role === 'finish' && (!g.finish || !String(g.finish).trim())) {
                        targetSlot = 'finish';
                    } else if (!v.hero_b64 || !String(v.hero_b64).trim() || v.hero_b64 === g.ambiente || v.hero_b64 === v.swatch_img) {
                        targetSlot = 'hero';
                    } else {
                        targetSlot = findNextFreeGallerySlot();
                    }
                }
                const b64 = await processUploadSourceForSlot_(f, targetSlot);
                if (b64) {
                    await assignImageToSlot(b64, targetSlot);
                    addedCount++;
                }
            }
            if (addedCount > 1) {
                showAdminToast(`¡${addedCount} foto(s) clasificadas, recortadas y organizadas automáticamente!`, '✨');
            }
        }

        // Agente 1-clic: revisa y recorta todas las vistas y portada del producto (respetando Ambiente y Acabado intactos)
        async function auditAndCleanProductPhotos() {
            const p = products[currentProdIndex];
            if (!p) return;
            const v = (p.variants && p.variants[currentVariantIndex]) ? p.variants[currentVariantIndex] : (p.variants && p.variants[0]);
            if (!v) return;
            if (!v.gallery) v.gallery = {};
            if (!v.slot_scales || typeof v.slot_scales !== 'object') v.slot_scales = {};
            if (!v.slot_pos || typeof v.slot_pos !== 'object') v.slot_pos = {};

            const slotsToClean = [];
            if (v.hero_b64 && v.hero_b64 !== v.gallery.ambiente && v.hero_b64 !== v.swatch_img) {
                slotsToClean.push({ slot: 'hero', src: v.hero_b64 });
            }
            ['view1', 'view2', 'view3', 'view4'].forEach((sk, idx) => {
                const sUrl = v.gallery[sk] || (Array.isArray(v.gallery.all_views) ? v.gallery.all_views[idx] : '') || '';
                if (sUrl && sUrl !== v.gallery.ambiente && sUrl !== v.swatch_img) {
                    slotsToClean.push({ slot: sk, src: sUrl });
                }
            });
            if (slotsToClean.length === 0) {
                showAdminToast('No hay vistas ni portada pendientes de limpiar (Ambiente y Acabado se conservan intactos)', 'ℹ️');
                return;
            }
            showAdminToast(`✨ IA limpiando fondo y normalizando ${slotsToClean.length} foto(s) (sin tocar Ambiente ni Acabado)...`, '⏳');
            let okCount = 0;
            for (let i = 0; i < slotsToClean.length; i++) {
                const item = slotsToClean[i];
                try {
                    const cleanB64 = await imageSourceToBase64(item.src, 1000, 750, 0.92, { mode: 'cutout', forceAi: true });
                    if (!cleanB64) continue;
                    const { finalSrc } = await uploadSlotPhotoToCloudIfConfigured(p, currentVariantIndex, item.slot, cleanB64);
                    if (item.slot === 'hero') {
                        v.hero_b64 = finalSrc;
                        v.hero_scale = 1;
                        delete v.hero_pos;
                    } else {
                        const vIdx = parseInt(item.slot.replace('view', ''), 10) - 1;
                        if (!Array.isArray(v.gallery.all_views)) v.gallery.all_views = [];
                        v.gallery.all_views[vIdx] = finalSrc;
                        v.gallery[item.slot] = finalSrc;
                        delete v.slot_scales[item.slot];
                        delete v.slot_pos[item.slot];
                    }
                    okCount++;
                } catch (err) {
                    console.warn('[Creata Audit Slot Error]', item.slot, err);
                }
            }
            updateModalView(false);
            await saveCatalogData();
            if (window.CreataCloud && window.CreataCloud.config.isConfigured()) {
                await window.CreataCloud.cloudPost('save_product', { product: p });
            }
            filterCatalog();
            showAdminToast(`¡${okCount} foto(s) recortadas y niveladas! Ambiente y Acabado intactos`, '✨');
        }
        window.auditAndCleanProductPhotos = auditAndCleanProductPhotos;

        async function deleteSlotPhoto(slotType) {
            const p = products[currentProdIndex];
            if (!p) return;
            const v = (p.variants && p.variants[currentVariantIndex]) ? p.variants[currentVariantIndex] : (p.variants ? p.variants[0] : {});
            if (!v || !v.gallery) return;

            if (!confirm('¿Eliminar esta foto?')) return;

            let deletedSrc = '';
            if (slotType === 'ambiente') {
                deletedSrc = v.gallery.ambiente || '';
                v.gallery.ambiente = '';
                showAdminToast('Foto de Ambiente eliminada', '🗑️');
            } else if (slotType === 'finish') {
                deletedSrc = v.gallery.finish || v.gallery.fabric || v.swatch_img || '';
                v.swatch_img = '';
                v.gallery.finish = '';
                v.gallery.fabric = '';
                v.gallery.finishes = [];
                showAdminToast('Foto de Tela / Acabado desvinculada', '🗑️');
            } else if (slotType.startsWith('view')) {
                const vIdx = parseInt(slotType.replace('view', ''), 10) - 1;
                deletedSrc = v.gallery[slotType] || (Array.isArray(v.gallery.all_views) ? v.gallery.all_views[vIdx] : '') || '';
                v.gallery[slotType] = '';
                if (!Array.isArray(v.gallery.all_views)) v.gallery.all_views = [];
                v.gallery.all_views[vIdx] = '';
                showAdminToast(`Vista ${vIdx + 1} eliminada`, '🗑️');
            }

            if (deletedSrc && v.hero_b64 === deletedSrc) {
                // Priorizar siempre vistas recortadas antes de caer en ambiente
                const fallback = v.gallery.view1 || v.gallery.view2 || v.gallery.view3 || v.gallery.view4 || v.gallery.ambiente || '';
                v.hero_b64 = fallback;
            }

            updateModalView(false);
            await saveCatalogData();
            if (window.CreataCloud && window.CreataCloud.config.isConfigured()) {
                await window.CreataCloud.cloudPost('save_product', { product: p });
            }
            filterCatalog();
        }

        // Drag & Drop en tarjetas de inicio
        function handleCardDragOver(e) {
            e.preventDefault();
            e.stopPropagation();
            if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
            e.currentTarget.classList.add('drag-over');
        }

        function handleCardDragLeave(e) {
            e.preventDefault();
            e.stopPropagation();
            if (!e.currentTarget.contains(e.relatedTarget)) {
                e.currentTarget.classList.remove('drag-over');
            }
        }

        async function handleCardWheelZoom(e, realIdx) {
            const p = products[realIdx];
            if (!p || !p.variants || !p.variants[0]) return;
            const cardImg = document.getElementById(`grid_card_img_${realIdx}`);
            if (!cardImg || !cardImg.getAttribute('src')) return;
            e.preventDefault();
            e.stopPropagation();
            const v = p.variants[0];
            const step = e.deltaY < 0 ? 0.06 : -0.06;
            const cur = Number(v.hero_scale) || 1;
            const next = Math.max(0.25, Math.min(2.5, Math.round((cur + step) * 100) / 100));
            v.hero_scale = next;
            const hp = (v.hero_pos && typeof v.hero_pos === 'object') ? v.hero_pos : { x: 0, y: 0 };
            cardImg.style.setProperty('--img-scale', String(next));
            cardImg.style.setProperty('--img-x', `${Number(hp.x) || 0}%`);
            cardImg.style.setProperty('--img-y', `${Number(hp.y) || 0}%`);
            if (currentProdIndex === realIdx && currentVariantIndex === 0) {
                const lbl = document.getElementById('lblScale_hero');
                if (lbl) lbl.textContent = `${Math.round(next * 100)}%`;
            }
            await saveCatalogData();
            if (typeof scheduleVariantCloudSave_ === 'function') {
                scheduleVariantCloudSave_(p);
            }
        }

        async function applyCardHeroImage(realIdx, b64) {
            const p = products[realIdx];
            if (!p || !b64) return;
            if (!p.variants || p.variants.length === 0) {
                p.variants = [{ name: p.model_name, finish_type: 'TELA', color_label: 'ACABADO OFICIAL', swatch_hex: '#B8893E', hero_b64: '' }];
            }
            const v = p.variants[0];
            if (!v.gallery) v.gallery = {};
            if (!Array.isArray(v.gallery.all_views)) v.gallery.all_views = [];

            const { finalSrc, cloudMsg } = await uploadSlotPhotoToCloudIfConfigured(p, 0, 'hero', b64);
            v.hero_b64 = finalSrc;
            v.hero_scale = 1;
            delete v.hero_pos;
            // NO sobreescribir v.gallery.ambiente con el recorte de portada

            await saveCatalogData();
            if (window.CreataCloud && window.CreataCloud.config.isConfigured()) {
                await window.CreataCloud.cloudPost('save_product', { product: p });
            }
            filterCatalog();
            updateAdminBadge();
            showAdminToast(`¡Portada recortada y centrada para "${p.model_name}"${cloudMsg}!`, '✨');
        }

        async function handleCardDrop(e, realIdx) {
            e.preventDefault();
            e.stopPropagation();
            e.currentTarget.classList.remove('drag-over');

            try {
                const p = products[realIdx];
                if (!p) return;
                showAdminToast(`✨ IA quitando fondo y centrando portada para "${p.model_name}"...`, '✨');
                const rawItem = await extractImageFromDropEvent(e);
                if (!rawItem) {
                    showAdminToast('Por favor suelta un archivo de imagen válido', '⚠️');
                    return;
                }
                // Portada de tarjeta SIEMPRE elimina fondo con IA y centra el mueble
                const b64 = await imageSourceToBase64(rawItem, 1000, 750, 0.92, { mode: 'cutout' });
                if (!b64) {
                    showAdminToast('No se pudo procesar la foto', '❌');
                    return;
                }
                await applyCardHeroImage(realIdx, b64);
            } catch (err) {
                console.error('Error en card drop:', err);
                showAdminToast('Error al cargar la foto', '❌');
            }
        }

        async function uploadCardHeroImage(e, realIdx) {
            const file = e.target.files[0];
            e.target.value = '';
            if (!file) return;
            try {
                const p = products[realIdx];
                if (!p) return;
                showAdminToast(`✨ IA quitando fondo y centrando portada para "${p.model_name}"...`, '✨');
                // Portada de tarjeta SIEMPRE elimina fondo con IA y centra el mueble
                const b64 = await imageSourceToBase64(file, 1000, 750, 0.92, { mode: 'cutout' });
                if (!b64) {
                    showAdminToast('No se pudo procesar la foto', '❌');
                    return;
                }
                await applyCardHeroImage(realIdx, b64);
            } catch (err) {
                console.error('Error al subir foto de portada:', err);
                showAdminToast('Error al cargar la foto', '❌');
            }
        }

        async function applyFabricPhoto(b64) {
            const p = products[currentProdIndex];
            if (!p || !b64) return;
            if (!p.variants || p.variants.length === 0) {
                p.variants = [{ name: p.model_name, finish_type: 'TELA', color_label: 'ACABADO OFICIAL', swatch_hex: '#B8893E', hero_b64: '' }];
                currentVariantIndex = 0;
            }
            const v = p.variants[currentVariantIndex] || p.variants[0];
            if (!v.gallery) v.gallery = {};
            if (!Array.isArray(v.gallery.all_views)) v.gallery.all_views = [];

            const { finalSrc, cloudMsg } = await uploadSlotPhotoToCloudIfConfigured(p, currentVariantIndex, 'finish', b64);
            // Vinculación bidireccional 100%: muestra circular de tela <-> recuadro Tela/Acabado (sin sobreescribir la foto del mueble)
            v.swatch_img = finalSrc;
            v.gallery.finish = finalSrc;
            v.gallery.fabric = finalSrc;
            v.gallery.finishes = [finalSrc];
            if (v.hero_b64 && /-finish-\d+\./i.test(v.hero_b64) && !v.gallery.ambiente) {
                v.hero_b64 = '';
            }

            await saveCatalogData();
            if (window.CreataCloud && window.CreataCloud.config.isConfigured()) {
                await window.CreataCloud.cloudPost('save_product', { product: p });
            }
            updateModalView(false);
            filterCatalog();
            showAdminToast(`Foto de tela "${v.color_label}" vinculada al botón y al recuadro${cloudMsg}`, '🧵');
        }

        async function handleFabricPhotoUpload(e) {
            const file = e.target.files[0];
            e.target.value = '';
            if (!file) return;
            try {
                showAdminToast('Vinculando foto de tela / acabado...', '⏳');
                const b64 = await imageSourceToBase64(file, 700, 700, 0.92, { mode: 'swatch' });
                if (b64) await applyFabricPhoto(b64);
            } catch (err) {
                console.error('Error en carga de foto de tela:', err);
                showAdminToast('Error al procesar la foto de acabado', '❌');
            }
        }

        async function handleFabricPhotoDrop(e) {
            e.preventDefault();
            e.stopPropagation();
            try {
                showAdminToast('Vinculando foto de tela / acabado...', '⏳');
                const rawItem = await extractImageFromDropEvent(e);
                if (!rawItem) return;
                const b64 = await imageSourceToBase64(rawItem, 700, 700, 0.92, { mode: 'swatch' });
                if (b64) await applyFabricPhoto(b64);
            } catch (err) {
                console.error('Error en drop de foto de tela:', err);
                showAdminToast('Error al procesar la foto de acabado', '❌');
            }
        }

        // PREVENCIÓN GLOBAL DE COMPORTAMIENTO POR DEFECTO DEL NAVEGADOR
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            window.addEventListener(eventName, (e) => {
                e.preventDefault();
            }, false);
        });

        function cycleMainPhoto() {
            const p = products[currentProdIndex];
            const v = p.variants[currentVariantIndex];
            const g = v.gallery || {};
            const allViews = g.all_views || [];
            if (allViews.length === 0) return;

            mainPhotoCycleIndex = (mainPhotoCycleIndex + 1) % (allViews.length + 1);
            const mainImg = document.getElementById('slotImgAmbiente');
            if (mainPhotoCycleIndex === -1 || mainPhotoCycleIndex >= allViews.length) {
                mainImg.src = g.ambiente || v.hero_b64;
                mainPhotoCycleIndex = -1;
            } else {
                mainImg.src = allViews[mainPhotoCycleIndex];
            }
        }

        // FUNCIONES DE ORIENTACIÓN, ESPEJO (FLIP) SOPORTANDO TANTO DATA-URLS COMO URLS EN LA NUBE (HTTPS)
        function flipBase64Image(srcUrl) {
            return new Promise((resolve) => {
                if (!srcUrl || typeof srcUrl !== 'string') {
                    resolve(srcUrl);
                    return;
                }
                const drawMirrored = (img) => {
                    try {
                        const canvas = document.createElement('canvas');
                        canvas.width = img.naturalWidth || img.width;
                        canvas.height = img.naturalHeight || img.height;
                        const ctx = canvas.getContext('2d');
                        ctx.clearRect(0, 0, canvas.width, canvas.height);
                        ctx.translate(canvas.width, 0);
                        ctx.scale(-1, 1);
                        ctx.drawImage(img, 0, 0);
                        try {
                            const webp = canvas.toDataURL('image/webp', 0.92);
                            if (webp && webp.startsWith('data:image/webp')) {
                                resolve(webp);
                                return;
                            }
                        } catch (_) {}
                        resolve(canvas.toDataURL('image/png'));
                    } catch (err) {
                        console.error('Error al voltear en canvas:', err);
                        resolve(srcUrl);
                    }
                };
                const img = new Image();
                if (srcUrl.startsWith('https://') || srcUrl.startsWith('http://')) {
                    img.crossOrigin = 'anonymous';
                }
                img.onload = () => drawMirrored(img);
                img.onerror = () => {
                    if (srcUrl.startsWith('https://') || srcUrl.startsWith('http://')) {
                        fetch(srcUrl, { mode: 'cors', cache: 'reload' })
                            .then((r) => (r.ok ? r.blob() : null))
                            .then((b) => {
                                if (!b) { resolve(srcUrl); return; }
                                const objUrl = URL.createObjectURL(b);
                                const img2 = new Image();
                                img2.onload = () => { URL.revokeObjectURL(objUrl); drawMirrored(img2); };
                                img2.onerror = () => { URL.revokeObjectURL(objUrl); resolve(srcUrl); };
                                img2.src = objUrl;
                            })
                            .catch(() => resolve(srcUrl));
                        return;
                    }
                    resolve(srcUrl);
                };
                img.src = srcUrl;
            });
        }

        async function flipMainPhoto() {
            const p = products[currentProdIndex];
            if (!p) return;
            const v = (p.variants && p.variants[currentVariantIndex]) ? p.variants[currentVariantIndex] : (p.variants ? p.variants[0] : null);
            if (!v) return;
            const g = v.gallery || (v.gallery = {});
            const currentSrc = (g.ambiente || v.hero_b64 || '');
            if (!currentSrc) {
                showAdminToast('No hay foto activa para voltear', '⚠️');
                return;
            }
            showAdminToast('Volteando foto (espejo) y guardando en nube...', '⏳');
            const flippedB64 = await flipBase64Image(currentSrc);
            const targetSlot = g.ambiente ? 'ambiente' : 'hero';
            const { finalSrc } = await uploadSlotPhotoToCloudIfConfigured(p, currentVariantIndex, targetSlot, flippedB64);
            const oldSrc = currentSrc;
            if (g.ambiente === oldSrc) g.ambiente = finalSrc;
            if (v.hero_b64 === oldSrc) v.hero_b64 = finalSrc;
            v.orientation = (v.orientation === 'left') ? 'right' : 'left';
            updateOrientationButtons(v.orientation);
            updateModalView(false);
            await saveCatalogData();
            if (window.CreataCloud && window.CreataCloud.config.isConfigured()) {
                await window.CreataCloud.cloudPost('save_product', { product: p });
            }
            filterCatalog();
            showAdminToast(`¡Foto orientada hacia la ${v.orientation === 'left' ? 'Izquierda ⬅️' : 'Derecha ➡️'}!`, '↔️');
        }

        async function setMainPhotoOrientation(targetDir) {
            const p = products[currentProdIndex];
            if (!p) return;
            const v = (p.variants && p.variants[currentVariantIndex]) ? p.variants[currentVariantIndex] : (p.variants ? p.variants[0] : null);
            if (!v) return;
            if (v.orientation === targetDir) {
                showAdminToast(`La foto ya está orientada hacia la ${targetDir === 'left' ? 'Izquierda ⬅️' : 'Derecha ➡️'}`, 'ℹ️');
                return;
            }
            await flipMainPhoto();
        }

        function updateOrientationButtons(orient) {
            const btnLeft = document.getElementById('btnOrientLeft');
            const btnRight = document.getElementById('btnOrientRight');
            if (btnLeft && btnRight) {
                if (orient === 'left') {
                    btnLeft.classList.add('orient-active');
                    btnRight.classList.remove('orient-active');
                } else if (orient === 'right') {
                    btnRight.classList.add('orient-active');
                    btnLeft.classList.remove('orient-active');
                } else {
                    btnLeft.classList.remove('orient-active');
                    btnRight.classList.remove('orient-active');
                }
            }
        }

        async function setMainPhotoAsHero() {
            const p = products[currentProdIndex];
            if (!p) return;
            const v = (p.variants && p.variants[currentVariantIndex]) ? p.variants[currentVariantIndex] : (p.variants ? p.variants[0] : null);
            if (!v) return;
            const currentSrc = (v.gallery && v.gallery.ambiente) ? v.gallery.ambiente : (v.hero_b64 || '');
            if (!currentSrc) {
                showAdminToast('No hay foto para establecer como portada', '⚠️');
                return;
            }
            showAdminToast('✨ Quitando fondo para fijar como Portada limpia...', '⏳');
            const cleanHero = await imageSourceToBase64(currentSrc, 1000, 750, 0.92, { mode: 'cutout', forceAi: true });
            const { finalSrc } = await uploadSlotPhotoToCloudIfConfigured(p, currentVariantIndex, 'hero', cleanHero || currentSrc);
            v.hero_b64 = finalSrc;
            v.hero_scale = 1;
            delete v.hero_pos;
            await saveCatalogData();
            if (window.CreataCloud && window.CreataCloud.config.isConfigured()) {
                await window.CreataCloud.cloudPost('save_product', { product: p });
            }
            filterCatalog();
            showAdminToast('¡Foto recortada y fijada como Portada de Inicio!', '⭐');
        }

        async function setMainPhotoAsAmbiente() {
            const p = products[currentProdIndex];
            if (!p) return;
            const v = (p.variants && p.variants[currentVariantIndex]) ? p.variants[currentVariantIndex] : (p.variants ? p.variants[0] : null);
            if (!v) return;
            const mainImg = document.getElementById('slotImgAmbiente');
            const currentSrc = (mainImg && mainImg.src) ? mainImg.src : (v.hero_b64 || '');
            if (!currentSrc) {
                showAdminToast('No hay foto para fijar como ambiente', '⚠️');
                return;
            }
            if (!v.gallery) v.gallery = {};
            v.gallery.ambiente = currentSrc;
            updateModalView(false);
            await saveCatalogData();
            if (window.CreataCloud && window.CreataCloud.config.isConfigured()) {
                await window.CreataCloud.cloudPost('save_product', { product: p });
            }
            showAdminToast('¡Foto fijada como Ambiente Principal!', '🖼️');
        }

        async function flipSlotPhoto(slotType) {
            const p = products[currentProdIndex];
            if (!p) return;
            const v = (p.variants && p.variants[currentVariantIndex]) ? p.variants[currentVariantIndex] : (p.variants ? p.variants[0] : null);
            if (!v || !v.gallery) return;

            let targetSrc = '';
            if (slotType === 'ambiente') {
                targetSrc = v.gallery.ambiente || v.hero_b64 || '';
            } else if (slotType === 'finish') {
                targetSrc = (v.gallery.finishes && v.gallery.finishes.length > 0) ? v.gallery.finishes[0] : (v.gallery.fabric || '');
            } else if (slotType.startsWith('view')) {
                const vIdx = parseInt(slotType.replace('view', ''), 10) - 1;
                const allViews = v.gallery.all_views || [];
                targetSrc = v.gallery[slotType] || allViews[vIdx] || '';
            }

            if (!targetSrc) {
                showAdminToast('No hay foto en este recuadro para voltear', '⚠️');
                return;
            }

            showAdminToast('Volteando foto y sincronizando en nube...', '⏳');
            const flippedB64 = await flipBase64Image(targetSrc);
            const { finalSrc } = await uploadSlotPhotoToCloudIfConfigured(p, currentVariantIndex, slotType, flippedB64);

            if (slotType === 'ambiente') {
                v.gallery.ambiente = finalSrc;
                if (v.hero_b64 === targetSrc) v.hero_b64 = finalSrc;
            } else if (slotType === 'finish') {
                v.swatch_img = finalSrc;
                v.gallery.finish = finalSrc;
                v.gallery.fabric = finalSrc;
                v.gallery.finishes = [finalSrc];
            } else if (slotType.startsWith('view')) {
                const vIdx = parseInt(slotType.replace('view', ''), 10) - 1;
                if (!Array.isArray(v.gallery.all_views)) v.gallery.all_views = [];
                v.gallery.all_views[vIdx] = finalSrc;
                v.gallery[slotType] = finalSrc;
                if (v.hero_b64 === targetSrc) v.hero_b64 = finalSrc;
            }

            updateModalView(false);
            await saveCatalogData();
            if (window.CreataCloud && window.CreataCloud.config.isConfigured()) {
                await window.CreataCloud.cloudPost('save_product', { product: p });
            }
            filterCatalog();
            showAdminToast('¡Foto volteada horizontalmente y guardada!', '↔️');
        }

        async function setSlotAsHero(slotType) {
            const p = products[currentProdIndex];
            if (!p) return;
            const v = (p.variants && p.variants[currentVariantIndex]) ? p.variants[currentVariantIndex] : (p.variants ? p.variants[0] : null);
            if (!v || !v.gallery) return;
            if (slotType === 'finish' || slotType === 'fabric') {
                showAdminToast('La muestra de tela/acabado no debe usarse como portada del mueble', '⚠️');
                return;
            }

            let targetSrc = '';
            if (slotType === 'ambiente') {
                targetSrc = v.gallery.ambiente || '';
            } else if (slotType.startsWith('view')) {
                const vIdx = parseInt(slotType.replace('view', ''), 10) - 1;
                const allViews = v.gallery.all_views || [];
                targetSrc = v.gallery[slotType] || allViews[vIdx] || '';
            }

            if (!targetSrc) {
                showAdminToast('No hay foto en este recuadro para poner de portada', '⚠️');
                return;
            }

            let heroUrl = targetSrc;
            if (slotType === 'ambiente') {
                showAdminToast('✨ Quitando fondo de la foto de ambiente para usarla como Portada limpia...', '⏳');
                const cleanB64 = await imageSourceToBase64(targetSrc, 1000, 750, 0.92, { mode: 'cutout', forceAi: true });
                if (cleanB64) {
                    const up = await uploadSlotPhotoToCloudIfConfigured(p, currentVariantIndex, 'hero', cleanB64);
                    heroUrl = up.finalSrc;
                }
            }

            v.hero_b64 = heroUrl;
            v.hero_scale = 1;
            delete v.hero_pos;
            await saveCatalogData();
            if (window.CreataCloud && window.CreataCloud.config.isConfigured()) {
                await window.CreataCloud.cloudPost('save_product', { product: p });
            }
            filterCatalog();
            showAdminToast('¡Foto colocada como Portada de Inicio!', '⭐');
        }

        async function setSlotAsAmbiente(slotType) {
            const p = products[currentProdIndex];
            if (!p) return;
            const v = (p.variants && p.variants[currentVariantIndex]) ? p.variants[currentVariantIndex] : (p.variants ? p.variants[0] : null);
            if (!v || !v.gallery) return;

            let targetSrc = '';
            if (slotType === 'finish') {
                showAdminToast('La muestra de acabado pertenece exclusivamente a su recuadro de color/tela', '⚠️');
                return;
            } else if (slotType.startsWith('view')) {
                const vIdx = parseInt(slotType.replace('view', ''), 10) - 1;
                const allViews = v.gallery.all_views || [];
                targetSrc = v.gallery[slotType] || allViews[vIdx] || '';
            }

            if (!targetSrc) {
                showAdminToast('No hay foto en este recuadro para fijar', '⚠️');
                return;
            }

            v.gallery.ambiente = targetSrc;
            updateModalView(false);
            await saveCatalogData();
            if (window.CreataCloud && window.CreataCloud.config.isConfigured()) {
                await window.CreataCloud.cloudPost('save_product', { product: p });
            }
            filterCatalog();
            showAdminToast('¡Foto colocada como Foto Principal (Ambiente)!', '🖼️');
        }

        async function flipCardHeroImage(realIdx) {
            const p = products[realIdx];
            if (!p) return;
            const v = (p.variants && p.variants.length > 0) ? p.variants[0] : null;
            if (!v || !v.hero_b64) {
                showAdminToast('No hay foto de portada para voltear', '⚠️');
                return;
            }
            showAdminToast(`Volteando portada de "${p.model_name}"...`, '⏳');
            const oldHero = v.hero_b64;
            const flippedB64 = await flipBase64Image(oldHero);
            const { finalSrc } = await uploadSlotPhotoToCloudIfConfigured(p, 0, 'hero', flippedB64);
            v.hero_b64 = finalSrc;
            if (v.gallery && v.gallery.view1 === oldHero) {
                v.gallery.view1 = finalSrc;
                if (Array.isArray(v.gallery.all_views)) v.gallery.all_views[0] = finalSrc;
            }
            await saveCatalogData();
            if (window.CreataCloud && window.CreataCloud.config.isConfigured()) {
                await window.CreataCloud.cloudPost('save_product', { product: p });
            }
            const imgEl = document.getElementById(`grid_card_img_${realIdx}`);
            if (imgEl) imgEl.src = finalSrc;
            showAdminToast(`¡Portada de "${p.model_name}" orientada y guardada!`, '↔️');
        }

        async function swapToMain(slotName) {
            const p = products[currentProdIndex];
            if (!p) return;
            const v = (p.variants && p.variants[currentVariantIndex]) ? p.variants[currentVariantIndex] : (p.variants ? p.variants[0] : null);
            if (!v) return;
            if (slotName === 'finish' || slotName === 'fabric') return;
            const g = v.gallery || (v.gallery = {});
            const allViews = g.all_views || [];
            let chosen = '';
            if (slotName.startsWith('view')) {
                const targetIdx = parseInt(slotName.replace('view', ''), 10) - 1;
                chosen = g[slotName] || allViews[targetIdx] || '';
            }
            if (chosen) {
                g.ambiente = chosen;
                updateModalView(false);
                await saveCatalogData();
                if (window.CreataCloud && window.CreataCloud.config.isConfigured()) {
                    await window.CreataCloud.cloudPost('save_product', { product: p });
                }
                filterCatalog();
                showAdminToast('Foto colocada como Foto Principal (Ambiente)', '🖼️');
            }
        }
