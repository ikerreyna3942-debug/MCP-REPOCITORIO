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
                outCtx.fillStyle = '#FFFFFF';
                outCtx.fillRect(0, 0, targetWidth, targetHeight);

                const maxTargetDimW = targetWidth * scalePadding;
                const maxTargetDimH = targetHeight * scalePadding;
                const scale = Math.min(maxTargetDimW / cropW, maxTargetDimH / cropH);

                const drawW = Math.round(cropW * scale);
                const drawH = Math.round(cropH * scale);
                const drawX = Math.round((targetWidth - drawW) / 2);
                const drawY = Math.round((targetHeight - drawH) / 2);

                outCtx.drawImage(tempCanvas, cropX, cropY, cropW, cropH, drawX, drawY, drawW, drawH);
                return outCanvas.toDataURL('image/jpeg', 0.88);
            } catch (e) {
                console.warn('Autocrop skipped:', e);
                return null;
            }
        }

        // Convertir cualquier fuente de imagen (File, Blob, DataURL, URL externa) a WebP/JPEG optimizado
        function imageSourceToBase64(src, maxWidth = 1000, maxHeight = 1000, quality = 0.85) {
            if (window.CreataCloud && window.CreataCloud.compressImageFast) {
                return window.CreataCloud.compressImageFast(src, maxWidth, maxHeight, quality);
            }
            return Promise.resolve(typeof src === 'string' ? src : null);
        }

        function compressImage(file, maxWidth = 1000, maxHeight = 1000, quality = 0.85) {
            return imageSourceToBase64(file, maxWidth, maxHeight, quality);
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

        async function handleSlotDrop(e, slotType) {
            e.preventDefault();
            e.stopPropagation();
            e.currentTarget.classList.remove('drag-over');

            try {
                showAdminToast('Procesando foto...', '⏳');
                const rawItem = await extractImageFromDropEvent(e);
                if (!rawItem) {
                    showAdminToast('Por favor suelta un archivo de imagen válido', '⚠️');
                    return;
                }
                const b64 = await imageSourceToBase64(rawItem);
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
                p.variants = [{ name: p.model_name, color_label: 'Opción 1', swatch_hex: '#B8893E', hero_b64: '' }];
                currentVariantIndex = 0;
            }
            const v = p.variants[currentVariantIndex] || p.variants[0];
            if (!v.gallery) v.gallery = {};
            if (!Array.isArray(v.gallery.all_views)) v.gallery.all_views = [];

            const { finalSrc, cloudMsg } = await uploadSlotPhotoToCloudIfConfigured(p, currentVariantIndex, slotType, b64);

            if (slotType === 'ambiente') {
                v.gallery.ambiente = finalSrc;
                if (!v.hero_b64) v.hero_b64 = finalSrc;
                showAdminToast(`Foto de Ambiente actualizada${cloudMsg}`, '📸');
            } else if (slotType === 'finish') {
                v.gallery.finish = finalSrc;
                v.gallery.fabric = finalSrc;
                v.gallery.finishes = [finalSrc];
                if (!v.hero_b64) v.hero_b64 = finalSrc;
                showAdminToast(`Foto de Acabado actualizada${cloudMsg}`, '📸');
            } else if (slotType.startsWith('view')) {
                const vIdx = parseInt(slotType.replace('view', ''), 10) - 1;
                v.gallery.all_views[vIdx] = finalSrc;
                v.gallery[slotType] = finalSrc;
                if (!v.hero_b64) v.hero_b64 = finalSrc;
                showAdminToast(`Vista ${vIdx + 1} actualizada${cloudMsg}`, '📸');
            } else if (slotType === 'hero') {
                v.hero_b64 = finalSrc;
                if (!v.gallery.ambiente || !v.gallery.ambiente.trim()) {
                    v.gallery.ambiente = finalSrc;
                }
                showAdminToast(`Foto de Inicio actualizada${cloudMsg}`, '📸');
            }

            updateModalView(false);
            await saveCatalogData();
            if (window.CreataCloud && window.CreataCloud.config.isConfigured()) {
                window.CreataCloud.cloudPost('save_product', { product: p });
            }
            filterCatalog();
        }

        async function uploadSlotImage(event, slotType) {
            const file = event.target.files[0];
            event.target.value = '';
            if (!file) return;
            try {
                showAdminToast('Procesando imagen...', '⏳');
                const b64 = await imageSourceToBase64(file);
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
                    const b64 = await imageSourceToBase64(rawItem);
                    if (b64) {
                        const targetSlot = findNextFreeGallerySlot();
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

        async function handleGalleryMultiUpload(e) {
            const files = e.target.files;
            if (!files || files.length === 0) return;
            await processMultipleGalleryFiles(files);
        }

        async function processMultipleGalleryFiles(files) {
            const p = products[currentProdIndex];
            if (!p) return;
            showAdminToast(`Procesando ${files.length} foto(s)...`, '⏳');
            let addedCount = 0;
            for (let i = 0; i < files.length; i++) {
                const b64 = await imageSourceToBase64(files[i]);
                if (b64) {
                    const targetSlot = findNextFreeGallerySlot();
                    await assignImageToSlot(b64, targetSlot);
                    addedCount++;
                }
            }
            if (addedCount > 1) {
                showAdminToast(`¡${addedCount} foto(s) agregadas a la galería!`, '📸');
            }
        }

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
                deletedSrc = v.gallery.finish || v.gallery.fabric || '';
                v.gallery.finish = '';
                v.gallery.fabric = '';
                v.gallery.finishes = [];
                showAdminToast('Foto de Acabado eliminada', '🗑️');
            } else if (slotType.startsWith('view')) {
                const vIdx = parseInt(slotType.replace('view', ''), 10) - 1;
                deletedSrc = v.gallery[slotType] || (Array.isArray(v.gallery.all_views) ? v.gallery.all_views[vIdx] : '') || '';
                v.gallery[slotType] = '';
                if (!Array.isArray(v.gallery.all_views)) v.gallery.all_views = [];
                v.gallery.all_views[vIdx] = '';
                showAdminToast(`Vista ${vIdx + 1} eliminada`, '🗑️');
            }

            if (deletedSrc && v.hero_b64 === deletedSrc) {
                const fallback = v.gallery.ambiente || v.gallery.view1 || v.gallery.view2 || v.gallery.view3 || v.gallery.view4 || '';
                v.hero_b64 = fallback;
            }

            updateModalView(false);
            await saveCatalogData();
            if (window.CreataCloud && window.CreataCloud.config.isConfigured()) {
                window.CreataCloud.cloudPost('save_product', { product: p });
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

        async function applyCardHeroImage(realIdx, b64) {
            const p = products[realIdx];
            if (!p || !b64) return;
            if (!p.variants || p.variants.length === 0) {
                p.variants = [{ name: p.model_name, color_label: 'Opción 1', swatch_hex: '#B8893E', hero_b64: '' }];
            }
            const v = p.variants[0];
            if (!v.gallery) v.gallery = {};
            if (!Array.isArray(v.gallery.all_views)) v.gallery.all_views = [];

            const { finalSrc, cloudMsg } = await uploadSlotPhotoToCloudIfConfigured(p, 0, 'hero', b64);
            v.hero_b64 = finalSrc;
            if (!v.gallery.ambiente || !String(v.gallery.ambiente).trim()) {
                v.gallery.ambiente = finalSrc;
            }

            await saveCatalogData();
            if (window.CreataCloud && window.CreataCloud.config.isConfigured()) {
                window.CreataCloud.cloudPost('save_product', { product: p });
            }
            filterCatalog();
            updateAdminBadge();
            showAdminToast(`¡Foto de inicio de "${p.model_name}" actualizada${cloudMsg}!`, '📸');
        }

        async function handleCardDrop(e, realIdx) {
            e.preventDefault();
            e.stopPropagation();
            e.currentTarget.classList.remove('drag-over');

            try {
                const p = products[realIdx];
                if (!p) return;
                showAdminToast(`Cargando foto de inicio para "${p.model_name}"...`, '⏳');
                const rawItem = await extractImageFromDropEvent(e);
                if (!rawItem) {
                    showAdminToast('Por favor suelta un archivo de imagen válido', '⚠️');
                    return;
                }
                const b64 = await imageSourceToBase64(rawItem);
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
                showAdminToast(`Cargando foto de inicio para "${p.model_name}"...`, '⏳');
                const b64 = await imageSourceToBase64(file);
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
                p.variants = [{ name: p.model_name, color_label: 'Opción 1', swatch_hex: '#B8893E', hero_b64: '' }];
                currentVariantIndex = 0;
            }
            const v = p.variants[currentVariantIndex] || p.variants[0];
            if (!v.gallery) v.gallery = {};
            if (!Array.isArray(v.gallery.all_views)) v.gallery.all_views = [];

            const { finalSrc, cloudMsg } = await uploadSlotPhotoToCloudIfConfigured(p, currentVariantIndex, 'finish', b64);
            v.swatch_img = finalSrc;
            v.gallery.finish = finalSrc;
            v.gallery.fabric = finalSrc;
            v.gallery.finishes = [finalSrc];
            if (!v.hero_b64) v.hero_b64 = finalSrc;

            await saveCatalogData();
            if (window.CreataCloud && window.CreataCloud.config.isConfigured()) {
                window.CreataCloud.cloudPost('save_product', { product: p });
            }
            updateModalView(false);
            filterCatalog();
            showAdminToast(`Foto de muestra para "${v.color_label}" guardada${cloudMsg}`, '📸');
        }

        async function handleFabricPhotoUpload(e) {
            const file = e.target.files[0];
            e.target.value = '';
            if (!file) return;
            try {
                const b64 = await imageSourceToBase64(file);
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
                const rawItem = await extractImageFromDropEvent(e);
                if (!rawItem) return;
                const b64 = await imageSourceToBase64(rawItem);
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

        // FUNCIONES DE ORIENTACIÓN, ESPEJO (FLIP) Y COLOCACIÓN DE FOTOS 3/4
        function flipBase64Image(b64) {
            return new Promise((resolve) => {
                if (!b64 || typeof b64 !== 'string' || !b64.startsWith('data:image')) {
                    resolve(b64);
                    return;
                }
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => {
                    try {
                        const canvas = document.createElement('canvas');
                        canvas.width = img.naturalWidth || img.width;
                        canvas.height = img.naturalHeight || img.height;
                        const ctx = canvas.getContext('2d');
                        ctx.translate(canvas.width, 0);
                        ctx.scale(-1, 1);
                        ctx.drawImage(img, 0, 0);
                        const mime = b64.startsWith('data:image/jpeg') ? 'image/jpeg' : 'image/png';
                        resolve(canvas.toDataURL(mime, 0.95));
                    } catch (err) {
                        console.error('Error al voltear en canvas:', err);
                        resolve(b64);
                    }
                };
                img.onerror = () => resolve(b64);
                img.src = b64;
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
            showAdminToast('Volteando foto (espejo)...', '⏳');
            const flipped = await flipBase64Image(currentSrc);
            const oldSrc = currentSrc;
            g.ambiente = flipped;
            if (v.hero_b64 === oldSrc) {
                v.hero_b64 = flipped;
            }
            v.orientation = (v.orientation === 'left') ? 'right' : 'left';
            updateOrientationButtons(v.orientation);
            updateModalView(false);
            await saveCatalogData();
            renderGrid(products);
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
            v.hero_b64 = currentSrc;
            await saveCatalogData();
            renderGrid(products);
            showAdminToast('¡Foto fijada como Portada de Inicio en el catálogo!', '⭐');
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
                const vIdx = parseInt(slotType.replace('view', '')) - 1;
                const allViews = v.gallery.all_views || [];
                const actualIdx = (currentViewOffset + vIdx) % allViews.length;
                targetSrc = allViews[actualIdx] || '';
            }

            if (!targetSrc) {
                showAdminToast('No hay foto en este recuadro para voltear', '⚠️');
                return;
            }

            showAdminToast('Volteando foto...', '⏳');
            const flipped = await flipBase64Image(targetSrc);

            if (slotType === 'ambiente') {
                v.gallery.ambiente = flipped;
                if (v.hero_b64 === targetSrc) v.hero_b64 = flipped;
            } else if (slotType === 'finish') {
                if (v.gallery.finishes && v.gallery.finishes.length > 0) v.gallery.finishes[0] = flipped;
                v.gallery.fabric = flipped;
            } else if (slotType.startsWith('view')) {
                const vIdx = parseInt(slotType.replace('view', '')) - 1;
                const allViews = v.gallery.all_views || [];
                const actualIdx = (currentViewOffset + vIdx) % allViews.length;
                allViews[actualIdx] = flipped;
                if (v.gallery.ambiente === targetSrc) v.gallery.ambiente = flipped;
                if (v.hero_b64 === targetSrc) v.hero_b64 = flipped;
            }

            updateModalView(false);
            await saveCatalogData();
            renderGrid(products);
            showAdminToast('¡Foto volteada horizontalmente!', '↔️');
        }

        async function setSlotAsHero(slotType) {
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
                const vIdx = parseInt(slotType.replace('view', '')) - 1;
                const allViews = v.gallery.all_views || [];
                const actualIdx = (currentViewOffset + vIdx) % allViews.length;
                targetSrc = allViews[actualIdx] || '';
            }

            if (!targetSrc) {
                showAdminToast('No hay foto en este recuadro para poner de portada', '⚠️');
                return;
            }

            v.hero_b64 = targetSrc;
            await saveCatalogData();
            renderGrid(products);
            showAdminToast('¡Foto colocada como Portada de Inicio!', '⭐');
        }

        async function setSlotAsAmbiente(slotType) {
            const p = products[currentProdIndex];
            if (!p) return;
            const v = (p.variants && p.variants[currentVariantIndex]) ? p.variants[currentVariantIndex] : (p.variants ? p.variants[0] : null);
            if (!v || !v.gallery) return;

            let targetSrc = '';
            if (slotType === 'finish') {
                targetSrc = (v.gallery.finishes && v.gallery.finishes.length > 0) ? v.gallery.finishes[0] : (v.gallery.fabric || '');
            } else if (slotType.startsWith('view')) {
                const vIdx = parseInt(slotType.replace('view', '')) - 1;
                const allViews = v.gallery.all_views || [];
                const actualIdx = (currentViewOffset + vIdx) % allViews.length;
                targetSrc = allViews[actualIdx] || '';
            }

            if (!targetSrc) {
                showAdminToast('No hay foto en este recuadro para fijar', '⚠️');
                return;
            }

            v.gallery.ambiente = targetSrc;
            updateModalView(false);
            await saveCatalogData();
            renderGrid(products);
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
            showAdminToast(`Volteando foto de "${p.model_name}"...`, '⏳');
            const flipped = await flipBase64Image(v.hero_b64);
            const oldHero = v.hero_b64;
            v.hero_b64 = flipped;
            if (v.gallery) {
                if (v.gallery.ambiente === oldHero) v.gallery.ambiente = flipped;
                if (v.gallery.all_views && v.gallery.all_views.length > 0 && v.gallery.all_views[0] === oldHero) {
                    v.gallery.all_views[0] = flipped;
                }
            }
            await saveCatalogData();
            const imgEl = document.getElementById(`grid_card_img_${realIdx}`);
            if (imgEl) imgEl.src = flipped;
            showAdminToast(`¡Portada de "${p.model_name}" orientada!`, '↔️');
        }

        async function swapToMain(slotName) {
            const p = products[currentProdIndex];
            if (!p) return;
            const v = (p.variants && p.variants[currentVariantIndex]) ? p.variants[currentVariantIndex] : (p.variants ? p.variants[0] : null);
            if (!v) return;
            const g = v.gallery || (v.gallery = {});
            const allViews = g.all_views || [];
            let chosen = '';
            if (slotName === 'finish') {
                chosen = (g.finishes && g.finishes.length > 0) ? g.finishes[0] : (g.fabric || '');
            } else if (slotName.startsWith('view')) {
                const targetIdx = parseInt(slotName.replace('view', '')) - 1;
                chosen = allViews[(currentViewOffset + targetIdx) % allViews.length] || '';
            }
            if (chosen) {
                g.ambiente = chosen;
                updateModalView(false);
                await saveCatalogData();
                renderGrid(products);
                showAdminToast('Foto colocada como Foto Principal (Ambiente)', '🖼️');
            }
        }
