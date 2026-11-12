function updateModalView(resetOffset = true) {
            const p = products[currentProdIndex];
            if (!p) return;
            const v = (p.variants && p.variants[currentVariantIndex]) ? p.variants[currentVariantIndex] : (p.variants ? p.variants[0] : {});
            if (resetOffset) {
                currentViewOffset = 0;
                mainPhotoCycleIndex = -1;
            }

            // REQUERIMIENTO 2: TÍTULO EXACTO AL NOMBRE DE LA TARJETA PRINCIPAL
            document.getElementById('modalProviderCat').innerText = `${p.provider_abbr} · ${p.category}`;
            const titleEl = document.getElementById('modalTitle');
            if (titleEl) {
                if (isEditMode) {
                    const existingInp = document.getElementById('edit_title');
                    if (!existingInp) {
                        titleEl.innerHTML = `<input type="text" id="edit_title" class="editable-field-input text-base font-bold uppercase" value="${(p.model_name || '').replace(/"/g, '&quot;')}">`;
                    }
                } else {
                    titleEl.innerText = p.model_name;
                }
            }
            const skuInput = document.getElementById('inputAutoSku');
            if (skuInput) {
                skuInput.value = p.sku || p.id || '';
            }
            populateSkuDatalist();

            const g = v.gallery || {};
            const slotScales = (v && v.slot_scales && typeof v.slot_scales === 'object') ? v.slot_scales : {};
            const slotPos = (v && v.slot_pos && typeof v.slot_pos === 'object') ? v.slot_pos : {};
            const heroScaleVal = Number(v && v.hero_scale) || 1;
            const heroScaleLbl = document.getElementById('lblScale_hero');
            if (heroScaleLbl) heroScaleLbl.textContent = `${Math.round(heroScaleVal * 100)}%`;

            const renderSlot = (imgId, phId, slotPrefix, src) => {
                const imgEl = document.getElementById(imgId);
                const phEl = document.getElementById(phId);
                const slotBox = imgEl ? imgEl.closest('.gallery-slot') : null;
                const valid = !!(src && typeof src === 'string' && src.trim().length > 0);
                const sc = Number(slotScales[slotPrefix]) || 1;
                const pos = (slotPos[slotPrefix] && typeof slotPos[slotPrefix] === 'object') ? slotPos[slotPrefix] : { x: 0, y: 0 };
                const px = Number(pos.x) || 0;
                const py = Number(pos.y) || 0;
                if (slotBox) slotBox.classList.toggle('has-photo', valid);
                if (imgEl) {
                    if (valid) {
                        imgEl.src = src;
                        imgEl.style.display = 'block';
                        if (slotPrefix === 'finish') {
                            if (sc < 0.995) {
                                imgEl.style.objectFit = 'contain';
                                imgEl.style.objectPosition = '50% 50%';
                                imgEl.style.transformOrigin = '50% 50%';
                                imgEl.style.transform = `translate(${px}%, ${py}%) scale(${sc})`;
                            } else {
                                const objX = Math.max(0, Math.min(100, Math.round((50 - px * 1.4) * 10) / 10));
                                const objY = Math.max(0, Math.min(100, Math.round((50 - py * 1.4) * 10) / 10));
                                imgEl.style.objectFit = 'cover';
                                imgEl.style.objectPosition = `${objX}% ${objY}%`;
                                imgEl.style.transformOrigin = `${objX}% ${objY}%`;
                                imgEl.style.transform = sc > 1.005 ? `scale(${sc})` : '';
                            }
                        } else {
                            imgEl.style.objectPosition = '50% 50%';
                            imgEl.style.transformOrigin = '50% 50%';
                            imgEl.style.transform = (px !== 0 || py !== 0 || sc !== 1)
                                ? `translate(${px}%, ${py}%) scale(${sc})`
                                : '';
                        }
                    } else {
                        imgEl.removeAttribute('src');
                        imgEl.style.display = 'none';
                        imgEl.style.transform = '';
                        imgEl.style.objectPosition = '50% 50%';
                        imgEl.style.transformOrigin = '50% 50%';
                        if (slotPrefix === 'finish') imgEl.style.objectFit = 'cover';
                    }
                }
                if (phEl) phEl.style.display = valid ? 'none' : 'flex';
                const delBtn = document.getElementById(`btnDelete_${slotPrefix}`);
                if (delBtn) delBtn.style.display = valid ? 'inline-flex' : 'none';
            };

            const ajMatch = (window.CreataCloud && window.CreataCloud.resolveAjFinish)
                ? window.CreataCloud.resolveAjFinish(p.id, p.model_name, p.sku)
                : null;

            if (!v.color_label || /^(ACABADO FICHA T[EÉ]CNICA|ACABADO OFICIAL|OPCI[OÓ]N\s*\d+|EST[AÁ]NDAR|ACABADO)$/i.test(v.color_label)) {
                if (ajMatch && ajMatch.label) {
                    v.color_label = ajMatch.label;
                } else if (window.CreataCloud && window.CreataCloud.inferColorLabelFromData) {
                    v.color_label = window.CreataCloud.inferColorLabelFromData(v.color_label, v.materials || p.materials, '');
                }
            }
            if (window.CreataCloud && window.CreataCloud.cleanFinishLabel && v.color_label) {
                const cleaned = window.CreataCloud.cleanFinishLabel(v.color_label, p.model_name);
                if (cleaned) v.color_label = cleaned;
            }
            if (!v.finish_type) {
                v.finish_type = (window.CreataCloud && window.CreataCloud.inferFinishType)
                    ? window.CreataCloud.inferFinishType(v.color_label, v.materials || p.materials)
                    : ((v.color_label && /MADERA|ROBLE|NOGAL|TZALAM|PAROTA|ENCINO/i.test(v.color_label)) ? 'MADERA' : 'TELA');
            }

            // 1. Vinculación bidireccional 100%: recuadro Muestra de Acabado <-> botón circular de muestra
            const finishSrc = (g.finish && g.finish.trim())
                ? g.finish.trim()
                : ((g.finishes && g.finishes.length > 0 && g.finishes[0])
                    ? g.finishes[0].trim()
                    : ((g.fabric && g.fabric.trim())
                        ? g.fabric.trim()
                        : ((v.swatch_img && v.swatch_img.trim())
                            ? v.swatch_img.trim()
                            : ((currentVariantIndex === 0 && ajMatch && ajMatch.img) ? ajMatch.img : ''))));
            if (finishSrc) {
                v.swatch_img = finishSrc;
                if (!v.gallery) v.gallery = {};
                v.gallery.finish = finishSrc;
                v.gallery.fabric = finishSrc;
                v.gallery.finishes = [finishSrc];
            }
            renderSlot('slotImgFinish', 'ph_finish', 'finish', finishSrc);

            // 2. Ambiente (nunca usar foto de muestra de tela como portada/ambiente)
            const hasFurnitureViews = !!(g.view1 || g.view2 || g.view3 || g.view4 ||
                (Array.isArray(g.all_views) && g.all_views.some(x => x && x.trim().length > 0)));
            const isCleanHero = v.hero_b64 && v.hero_b64 !== finishSrc && !/-finish-\d+\./i.test(v.hero_b64);
            const ambienteSrc = (g.ambiente && g.ambiente.trim())
                ? g.ambiente
                : (!hasFurnitureViews && isCleanHero ? v.hero_b64 : '');
            renderSlot('slotImgAmbiente', 'ph_ambiente', 'ambiente', ambienteSrc);

            // 3. Vistas 1 a 4 (slots 100% independientes sin repetición ni ciclo)
            const getSlotView = (slotKey, idx) => {
                if (g[slotKey] && typeof g[slotKey] === 'string' && g[slotKey].trim()) return g[slotKey];
                if (g.all_views && g.all_views.length > idx && g.all_views[idx]) return g.all_views[idx];
                return '';
            };

            renderSlot('slotImgView1', 'ph_view1', 'view1', getSlotView('view1', 0));
            renderSlot('slotImgView2', 'ph_view2', 'view2', getSlotView('view2', 1));
            renderSlot('slotImgView3', 'ph_view3', 'view3', getSlotView('view3', 2));
            renderSlot('slotImgView4', 'ph_view4', 'view4', getSlotView('view4', 3));

            updateOrientationButtons(v.orientation);

            const setSpecBox = (id, val) => {
                const el = document.getElementById(id);
                if (!el) return;
                const box = el.parentElement;
                const cleanVal = (val || '').toString().trim();
                if (!cleanVal || cleanVal === 'N/D' || cleanVal === '-' || cleanVal === 'None' || cleanVal === '0 cm' || cleanVal === '0 m³') {
                    if (box) box.style.display = 'none';
                } else {
                    if (box) box.style.display = '';
                    el.innerText = cleanVal;
                }
            };

            // Lectura de variantes: Si la variante define el valor (incluso vacío ''), se respeta la ficha en blanco
            const getVal = (vVal, pVal) => (vVal !== undefined && vVal !== null) ? vVal : (pVal || '');

            setSpecBox('mWidth', getVal(v.width, p.width));
            setSpecBox('mDepth', getVal(v.depth, p.depth));
            setSpecBox('mHeight', getVal(v.height, p.height));
            setSpecBox('mSeat', getVal(v.seat, p.seat));
            setSpecBox('mPackages', getVal(v.packages, p.packages));
            setSpecBox('mVolume', getVal(v.volume, p.volume));

            document.getElementById('mPrice').innerText = p.price || 'Consultar';
            const matElAdm = document.getElementById('mMaterials');
            const matValAdm = (getVal(v.materials, p.materials) || '').toString().trim();
            if (matElAdm) {
                const matBoxAdm = matElAdm.parentElement;
                if (!matValAdm || matValAdm === '-') {
                    if (matBoxAdm) matBoxAdm.style.display = 'none';
                } else {
                    if (matBoxAdm) matBoxAdm.style.display = '';
                    matElAdm.innerText = matValAdm;
                }
            }

            // Renderizar píldoras de telas y gestor visual de la tela seleccionada
            renderSwatchesRow();
            renderFabricEditor();
            if (typeof renderSalaModulesUI === 'function') renderSalaModulesUI();
            renderPieceSkuComposer();

            const driveBtn = document.getElementById('modalDriveBtn');
            if (driveBtn) {
                const fichaUrl = getVal(v.drive_ficha_url, p.drive_ficha_url);
                driveBtn.href = fichaUrl || '#';
                if (!fichaUrl || fichaUrl === '#') {
                    driveBtn.classList.add('opacity-50', 'pointer-events-none');
                } else {
                    driveBtn.classList.remove('opacity-50', 'pointer-events-none');
                }
            }

            // ACTUALIZACIÓN DE ESTADO ARCHIVADO EN MODAL
            const btnArch = document.getElementById('btnArchiveModal');
            const iconArch = document.getElementById('btnArchiveModalIcon');
            const textArch = document.getElementById('btnArchiveModalText');
            const bannerArch = document.getElementById('modalArchiveBanner');

            updateTechValidationPanel();

            if (p.archived) {
                if (btnArch) {
                    btnArch.style.background = '#10B981';
                    btnArch.style.color = '#FFFFFF';
                    if (iconArch) iconArch.innerText = '👁️';
                    if (textArch) textArch.innerText = 'Desarchivar';
                    btnArch.title = 'Hacer visible nuevamente en el catálogo';
                }
                if (bannerArch) bannerArch.classList.remove('hidden');
            } else {
                if (btnArch) {
                    btnArch.style.background = '#252C32';
                    btnArch.style.color = '#FFFFFF';
                    if (iconArch) iconArch.innerText = '📦';
                    if (textArch) textArch.innerText = 'Archivar';
                    btnArch.title = 'Ocultar o archivar esta ficha del catálogo';
                }
                if (bannerArch) bannerArch.classList.add('hidden');
            }
        }

        function renderSwatchesRow() {
            const p = products[currentProdIndex];
            const swatchesRow = document.getElementById('modalSwatchesRow');
            if (!swatchesRow || !p || !p.variants) return;
            swatchesRow.innerHTML = p.variants.map((vItem, vIdx) => {
                const isAct = vIdx === currentVariantIndex;
                const vg = vItem.gallery || {};
                const linkedImg = vItem.swatch_img || vg.finish || vg.fabric || (Array.isArray(vg.finishes) && vg.finishes[0]) || '';
                if (linkedImg && !vItem.swatch_img) vItem.swatch_img = linkedImg;
                const fType = vItem.finish_type || (window.CreataCloud ? window.CreataCloud.inferFinishType(vItem.color_label, vItem.materials || p.materials) : 'TELA');
                vItem.finish_type = fType;
                const rawLbl = (window.CreataCloud && window.CreataCloud.cleanFinishLabel)
                    ? window.CreataCloud.cleanFinishLabel(vItem.color_label, p.model_name)
                    : (vItem.color_label || '');
                const lbl = (rawLbl || 'NATURAL').toUpperCase();
                const thumb = linkedImg
                    ? `<span class="swatch-pill-dot" style="background-image: url('${linkedImg}');"></span>`
                    : `<span class="swatch-pill-dot" style="background-color: ${vItem.swatch_hex || '#A38251'};"></span>`;
                return `
                    <button type="button" onclick="currentVariantIndex = ${vIdx}; updateModalView(true);"
                            title="${lbl.replace(/"/g, '&quot;')}"
                            class="swatch-pill ${isAct ? 'active' : ''}">
                        ${thumb}
                        <span class="swatch-pill-label">${lbl}</span>
                    </button>
                `;
            }).join('');
        }

        // VARIABLES DE TELA O MADERA CON FOTO Y NOMBRE LIMPIO DE MUESTRA
        function renderFabricEditor() {
            const p = products[currentProdIndex];
            if (!p || !p.variants || p.variants.length === 0) return;
            const v = p.variants[currentVariantIndex] || p.variants[0];
            const container = document.getElementById('fabricEditorSection');
            if (!container) return;

            if (!v.finish_type) {
                v.finish_type = (v.color_label && /MADERA|ROBLE|NOGAL|TZALAM|PAROTA|ENCINO/i.test(v.color_label)) ? 'MADERA' : 'TELA';
            }

            const hasSwatchImg = !!v.swatch_img;

            container.innerHTML = `
                <div class="fabric-editor-card mt-2.5 p-3 bg-[#FAF8F4] border border-[#E1DBC5] rounded-xl shadow-2xs">
                    <div class="flex items-center justify-between pb-2 mb-2 border-b border-[#E1DBC5]">
                        <div class="flex items-center gap-2">
                            ${hasSwatchImg 
                                ? `<span class="w-5 h-5 rounded-full border border-black/20 inline-block shadow-xs bg-cover bg-center shrink-0" style="background-image: url('${v.swatch_img}')"></span>`
                                : `<span class="w-5 h-5 rounded-full border border-black/20 inline-block shadow-xs shrink-0" style="background: ${v.swatch_hex || '#C2B8A3'}"></span>`
                            }
                            <span class="text-[11px] font-extrabold uppercase text-[#252C32] tracking-wider">
                                ${v.finish_type === 'MADERA' ? 'Variable Madera:' : 'Variable Tela:'}
                                <span id="currentFabricBadge" class="text-[#A38251]">${v.color_label || 'NATURAL'}</span>
                            </span>
                        </div>
                        <div class="flex items-center gap-1.5">
                            <button type="button" onclick="addNewFinishOption('TELA')" class="px-2 py-0.5 bg-white border border-[#A38251]/40 hover:bg-amber-50 text-[#A38251] text-[9.5px] font-bold rounded shadow-xs transition" title="Añadir nueva opción de Tela">➕ Tela</button>
                            <button type="button" onclick="addNewFinishOption('MADERA')" class="px-2 py-0.5 bg-white border border-[#A38251]/40 hover:bg-amber-50 text-[#A38251] text-[9.5px] font-bold rounded shadow-xs transition" title="Añadir nueva opción de Madera">➕ Madera</button>
                            ${p.variants.length > 1 ? `<button type="button" onclick="deleteCurrentFabricOption()" class="px-2 py-0.5 bg-white border border-red-200 hover:bg-red-50 text-red-600 text-[9.5px] font-bold rounded shadow-xs transition" title="Eliminar esta variable">🗑️</button>` : ''}
                        </div>
                    </div>

                    <div class="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center">
                        <!-- 1. NOMBRE DE LA VARIABLE -->
                        <div class="sm:col-span-5">
                            <label class="text-[9px] font-bold text-slate-500 uppercase tracking-wider block mb-0.5">Nombre (${v.finish_type}):</label>
                            <input type="text" id="inputFabricLabel"
                                   value="${(v.color_label || '').replace(/"/g, '&quot;')}"
                                   oninput="updateFabricLabelLive(this.value)"
                                   class="w-full text-xs font-bold px-2 py-1.5 bg-white border border-slate-300 rounded focus:border-[#B8893E] outline-none uppercase shadow-xs"
                                   placeholder="Ej. FOREVER BUTTERMILK o ROBLE">
                        </div>

                        <!-- 2. COLOR TONO (HEX) -->
                        <div class="sm:col-span-3">
                            <label class="text-[9px] font-bold text-slate-500 uppercase tracking-wider block mb-0.5">Color Tonalidad:</label>
                            <div class="flex items-center gap-1.5">
                                <input type="color" id="inputFabricHex"
                                       value="${v.swatch_hex || '#C2B8A3'}"
                                       onchange="updateFabricHexLive(this.value)"
                                       class="w-7 h-7 rounded border border-slate-300 cursor-pointer bg-white p-0.5">
                                <span id="labelFabricHex" class="text-[10px] font-mono font-bold text-slate-600">${v.swatch_hex || '#C2B8A3'}</span>
                            </div>
                        </div>

                        <!-- 3. FOTO DE MUESTRA Y TEXTURA -->
                        <div class="sm:col-span-4">
                            <label class="text-[9px] font-bold text-slate-500 uppercase tracking-wider block mb-0.5">Foto de Muestra / Textura:</label>
                            <div class="flex items-center gap-1.5">
                                <div class="fabric-dropzone flex-1 relative flex items-center justify-center gap-1 py-1 px-2 bg-white border-2 border-dashed border-[#B8893E] rounded text-center cursor-pointer hover:bg-amber-50/70 transition group"
                                     ondragover="handleSlotDragOver(event)"
                                     ondragleave="handleSlotDragLeave(event)"
                                     ondrop="handleFabricPhotoDrop(event)"
                                     onclick="document.getElementById('inputFabricPhoto').click()"
                                     title="Arrastra o selecciona la foto de la textura/color">
                                    <span class="text-xs">📷</span>
                                    <span class="text-[9px] font-bold text-[#B8893E] group-hover:underline">${hasSwatchImg ? 'Cambiar Foto' : 'Subir Foto'}</span>
                                    <input type="file" id="inputFabricPhoto" accept="image/*" class="hidden" onchange="handleFabricPhotoUpload(event)">
                                </div>
                                ${hasSwatchImg ? `<button type="button" onclick="removeFabricPhoto()" class="px-1.5 py-1 text-[10px] text-red-600 hover:bg-red-50 rounded border border-red-200" title="Quitar foto y usar color plano">✕</button>` : ''}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }

        let __variantCloudSyncTimer = null;
        function scheduleVariantCloudSave_(prod) {
            if (!prod || !window.CreataCloud || !window.CreataCloud.config.isConfigured()) return;
            clearTimeout(__variantCloudSyncTimer);
            __variantCloudSyncTimer = setTimeout(async () => {
                await window.CreataCloud.cloudPost('save_product', { product: prod });
            }, 600);
        }

        async function updateFabricLabelLive(newLabel) {
            const p = products[currentProdIndex];
            if (!p) return;
            const v = p.variants ? p.variants[currentVariantIndex] : null;
            if (!v) return;

            v.color_label = newLabel.trim().toUpperCase();
            const badge = document.getElementById('currentFabricBadge');
            if (badge) badge.innerText = v.color_label || 'NATURAL';
            renderSwatchesRow();
            await saveCatalogData();
            scheduleVariantCloudSave_(p);
        }

        async function updateFabricHexLive(newHex) {
            const p = products[currentProdIndex];
            if (!p) return;
            const v = p.variants ? p.variants[currentVariantIndex] : null;
            if (!v) return;

            v.swatch_hex = newHex;
            const hexLabel = document.getElementById('labelFabricHex');
            if (hexLabel) hexLabel.innerText = newHex;
            renderSwatchesRow();
            await saveCatalogData();
            scheduleVariantCloudSave_(p);
        }

        async function addNewFinishOption(type = 'TELA') {
            const p = products[currentProdIndex];
            if (!p) return;
            const promptMsg = type === 'MADERA' 
                ? 'Nombre de la variable de madera (ej. ROBLE NATURAL, NOGAL AMERICANO, PAROTA):'
                : 'Nombre de la variable de tela (ej. FOREVER BUTTERMILK, TERCIOPELO AZUL):';
            const name = prompt(promptMsg);
            if (!name || !name.trim()) return;

            const newVariant = {
                name: p.model_name,
                finish_type: type,
                color_label: name.trim().toUpperCase(),
                swatch_hex: type === 'MADERA' ? '#A2703F' : '#8C8C8C',
                swatch_img: '',
                hero_b64: '',
                width: '',
                depth: '',
                height: '',
                seat: '',
                packages: '',
                volume: '',
                materials: '',
                drive_ficha_url: '',
                gallery: {
                    ambiente: '',
                    finish: '',
                    finishes: [],
                    fabric: '',
                    view1: '',
                    view2: '',
                    view3: '',
                    view4: '',
                    all_views: []
                }
            };

            if (!p.variants) p.variants = [];
            p.variants.push(newVariant);
            currentVariantIndex = p.variants.length - 1;

            await saveCatalogData();
            if (window.CreataCloud && window.CreataCloud.config.isConfigured()) {
                await window.CreataCloud.cloudPost('save_product', { product: p });
            }
            updateModalView(true);
            filterCatalog();
            showAdminToast(`${type === 'MADERA' ? 'Madera' : 'Tela'} "${newVariant.color_label}" agregada y sincronizada`, '✅');
        }

        async function addNewFabricOption() {
            await addNewFinishOption('TELA');
        }

        async function removeFabricPhoto() {
            const p = products[currentProdIndex];
            if (!p) return;
            const v = p.variants ? p.variants[currentVariantIndex] : null;
            if (!v) return;
            const oldFinish = v.swatch_img || (v.gallery && (v.gallery.finish || v.gallery.fabric)) || '';
            v.swatch_img = '';
            if (v.gallery) {
                v.gallery.finish = '';
                v.gallery.fabric = '';
                v.gallery.finishes = [];
            }
            if (oldFinish && v.hero_b64 === oldFinish) {
                v.hero_b64 = (v.gallery && (v.gallery.ambiente || v.gallery.view1)) || '';
            }
            await saveCatalogData();
            if (window.CreataCloud && window.CreataCloud.config.isConfigured()) {
                await window.CreataCloud.cloudPost('save_product', { product: p });
            }
            updateModalView(false);
            filterCatalog();
            showAdminToast('Foto de muestra desvinculada del botón y recuadro', 'ℹ️');
        }

        async function deleteCurrentFabricOption() {
            const p = products[currentProdIndex];
            if (!p || !p.variants || p.variants.length <= 1) {
                alert(`El mueble debe tener al menos una opción de acabado.`);
                return;
            }
            const v = p.variants[currentVariantIndex];
            if (!confirm(`¿Eliminar la opción "${v.color_label}"?`)) return;

            p.variants.splice(currentVariantIndex, 1);
            currentVariantIndex = 0;

            await saveCatalogData();
            if (window.CreataCloud && window.CreataCloud.config.isConfigured()) {
                await window.CreataCloud.cloudPost('save_product', { product: p });
            }
            updateModalView(true);
            filterCatalog();
            showAdminToast('Opción eliminada y sincronizada correctamente', '🗑️');
        }
        // REQUERIMIENTO 1: DRAG & DROP Y BORRADO DE FOTOS
        // ==========================================
        // SISTEMA ROBUSTO DE CARGA Y DRAG & DROP
        // ==========================================

        // Extraer imagen sin importar si viene de archivo local, otra pestaña, Drive o portapapeles
