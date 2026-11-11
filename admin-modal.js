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

            const renderSlot = (imgId, phId, slotPrefix, src) => {
                const imgEl = document.getElementById(imgId);
                const phEl = document.getElementById(phId);
                const valid = src && typeof src === 'string' && src.trim().length > 0;
                if (imgEl) {
                    if (valid) {
                        imgEl.src = src;
                        imgEl.style.display = 'block';
                    } else {
                        imgEl.removeAttribute('src');
                        imgEl.style.display = 'none';
                    }
                }
                if (phEl) phEl.style.display = valid ? 'none' : 'flex';
                const delBtn = document.getElementById(`btnDelete_${slotPrefix}`);
                if (delBtn) delBtn.style.display = valid ? 'inline-flex' : 'none';
            };

            // 1. Ambiente (slot independiente)
            const ambienteSrc = (g.ambiente !== undefined) ? g.ambiente : (v.hero_b64 || '');
            renderSlot('slotImgAmbiente', 'ph_ambiente', 'ambiente', ambienteSrc);

            // 2. Acabado / Detalle (slot independiente)
            const finishSrc = (g.finish !== undefined) 
                ? g.finish 
                : ((g.finishes && g.finishes.length > 0) ? g.finishes[0] : (g.fabric || ''));
            renderSlot('slotImgFinish', 'ph_finish', 'finish', finishSrc);

            // 3. Vistas 1 a 4 (slots 100% independientes sin repetición ni ciclo)
            const getSlotView = (slotKey, idx) => {
                if (g[slotKey] !== undefined) return g[slotKey];
                if (g.all_views && g.all_views.length > idx) return g.all_views[idx];
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
                    btnArch.style.background = '#475569';
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
                const hasImg = !!vItem.swatch_img;
                const typeIcon = vItem.finish_type === 'MADERA' ? '🪵' : '🧵';
                const thumb = hasImg
                    ? `<span class="w-4 h-4 rounded-full inline-block border border-black/25 shadow-xs bg-cover bg-center shrink-0" style="background-image: url('${vItem.swatch_img}');"></span>`
                    : `<span class="w-4 h-4 rounded-full inline-block border border-black/25 shadow-xs shrink-0" style="background: ${vItem.swatch_hex || '#B8893E'};
"></span>`;
                return `
                    <button type="button" onclick="currentVariantIndex = ${vIdx}; updateModalView(true);"
                            title="${vItem.color_label || 'ACABADO'}"
                            class="swatch-pill ${isAct ? 'active' : ''} flex items-center gap-1.5 px-2.5 py-1 rounded-full border">
                        ${thumb}
                        <span class="text-[10px] font-bold uppercase tracking-wider">${vItem.color_label || 'ACABADO'}</span>
                        <span class="text-[9px] opacity-70">${typeIcon}</span>
                    </button>
                `;
            }).join('');
        }

        // REQUERIMIENTOS 3 Y 5: VARIABLES DE TELA O MADERA CON FOTO Y NOMBRE DE MUESTRA
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
                <div class="fabric-editor-card mt-2.5 p-3 bg-slate-50 border border-slate-300 rounded-xl shadow-2xs">
                    <div class="flex items-center justify-between pb-2 mb-2 border-b border-slate-200">
                        <div class="flex items-center gap-2">
                            ${hasSwatchImg 
                                ? `<span class="w-5 h-5 rounded-full border border-black/20 inline-block shadow-xs bg-cover bg-center shrink-0" style="background-image: url('${v.swatch_img}')"></span>`
                                : `<span class="w-5 h-5 rounded-full border border-black/20 inline-block shadow-xs shrink-0" style="background: ${v.swatch_hex || '#C2B8A3'}"></span>`
                            }
                            <span class="text-[11px] font-extrabold uppercase text-slate-800 tracking-wider">
                                ${v.finish_type === 'MADERA' ? '🪵 Variable Madera:' : '🧵 Variable Tela:'}
                                <span id="currentFabricBadge" class="text-[#B8893E]">${v.color_label || 'ACABADO'}</span>
                            </span>
                        </div>
                        <div class="flex items-center gap-1.5">
                            <button type="button" onclick="addNewFinishOption('TELA')" class="px-2 py-0.5 bg-white border border-[#B8893E]/40 hover:bg-amber-50 text-[#B8893E] text-[9.5px] font-bold rounded shadow-xs transition" title="Añadir nueva opción de Tela">➕ Tela</button>
                            <button type="button" onclick="addNewFinishOption('MADERA')" class="px-2 py-0.5 bg-white border border-[#B8893E]/40 hover:bg-amber-50 text-[#B8893E] text-[9.5px] font-bold rounded shadow-xs transition" title="Añadir nueva opción de Madera">➕ Madera</button>
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

        async function updateFabricLabelLive(newLabel) {
            const p = products[currentProdIndex];
            if (!p) return;
            const v = p.variants ? p.variants[currentVariantIndex] : null;
            if (!v) return;

            v.color_label = newLabel.trim().toUpperCase();
            const badge = document.getElementById('currentFabricBadge');
            if (badge) badge.innerText = v.color_label || 'ACABADO';
            renderSwatchesRow();
            await saveCatalogData();
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
                    all_views: ['', '', '', '']
                }
            };

            if (!p.variants) p.variants = [];
            p.variants.push(newVariant);
            currentVariantIndex = p.variants.length - 1;

            await saveCatalogData();
            updateModalView(true);
            renderGrid(products);
            showAdminToast(`${type === 'MADERA' ? 'Madera' : 'Tela'} "${newVariant.color_label}" agregada con ficha en blanco`, '✅');
        }

        async function addNewFabricOption() {
            await addNewFinishOption('TELA');
        }

        async function removeFabricPhoto() {
            const p = products[currentProdIndex];
            if (!p) return;
            const v = p.variants ? p.variants[currentVariantIndex] : null;
            if (!v) return;
            v.swatch_img = '';
            if (v.gallery && v.gallery.finishes) v.gallery.finishes = [];
            await saveCatalogData();
            updateModalView(false);
            renderGrid(products);
            showAdminToast('Foto de muestra retirada (usando color plano)', 'ℹ️');
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
            updateModalView(true);
            renderGrid(products);
            showAdminToast('Opción eliminada correctamente', '🗑️');
        }
        // REQUERIMIENTO 1: DRAG & DROP Y BORRADO DE FOTOS
        // ==========================================
        // SISTEMA ROBUSTO DE CARGA Y DRAG & DROP
        // ==========================================

        // Extraer imagen sin importar si viene de archivo local, otra pestaña, Drive o portapapeles
