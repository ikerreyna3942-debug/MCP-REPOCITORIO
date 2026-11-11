function populateSkuDatalist() {
            const dl = document.getElementById('skuDatalist');
            if (!dl) return;
            dl.innerHTML = Object.keys(SKU_DATABASE).map(k => `<option value="${k}">${SKU_DATABASE[k].model_name} (${SKU_DATABASE[k].category})</option>`).join('');
        }

        function handleSkuInput(val) {
            const cleanVal = val.trim().toUpperCase();
            if (SKU_DATABASE[cleanVal]) {
                executeSkuAutoFill(cleanVal);
            }
        }

        function executeSkuAutoFill(skuQuery = null) {
            const input = document.getElementById('inputAutoSku');
            const query = (skuQuery || (input ? input.value : '')).trim().toUpperCase();
            if (!query) {
                showAdminToast('Escribe o pega un SKU para autollenar', '⚠️');
                return;
            }

            let found = SKU_DATABASE[query];
            if (!found) {
                const cleanQ = query.replace(/[^A-Z0-9]/g, '');
                for (const k in SKU_DATABASE) {
                    const cleanK = k.replace(/[^A-Z0-9]/g, '');
                    if (cleanK === cleanQ || (cleanQ.length >= 4 && cleanK.includes(cleanQ))) {
                        found = SKU_DATABASE[k];
                        break;
                    }
                }
            }

            if (!found) {
                showAdminToast(`SKU "${query}" no encontrado en base de datos`, '❌');
                return;
            }

            const p = products[currentProdIndex];
            if (!p) return;
            const v = (p.variants && p.variants[currentVariantIndex]) ? p.variants[currentVariantIndex] : (p.variants ? p.variants[0] : {});

            if (found.model_name) {
                p.model_name = found.model_name;
                v.name = found.model_name;
            }
            if (found.provider_abbr) {
                p.provider_abbr = found.provider_abbr;
                p.provider = found.provider_abbr;
            }
            if (found.category) p.category = found.category;
            if (found.width) { p.width = found.width; v.width = found.width; }
            if (found.depth) { p.depth = found.depth; v.depth = found.depth; }
            if (found.height) { p.height = found.height; v.height = found.height; }
            if (found.seat) { p.seat = found.seat; v.seat = found.seat; }
            if (found.volume) { p.volume = found.volume; v.volume = found.volume; }
            if (found.packages) { p.packages = found.packages; v.packages = found.packages; }
            if (found.price) p.price = found.price;
            if (found.cost) p.cost = found.cost;
            if (found.materials) { p.materials = found.materials; v.materials = found.materials; }
            if (found.drive_ficha_url && (!p.drive_ficha_url || p.drive_ficha_url === 'https://drive.google.com/')) {
                p.drive_ficha_url = found.drive_ficha_url;
                v.drive_ficha_url = found.drive_ficha_url;
            }
            p.sku = found.sku;

            // Guardar especificaciones de referencia de la hoja "PRESENTACION"
            p.sheet_specs = {
                width: found.width || '',
                depth: found.depth || '',
                height: found.height || '',
                seat: found.seat || '',
                volume: found.volume || '',
                price: found.price || '',
                sku: found.sku || '',
                swatch_img: found.swatch_img || '',
                finish_name: found.finish_name || ''
            };

            // Asignación de foto de tela / acabado de la Columna N
            if (found.swatch_img) {
                v.swatch_img = found.swatch_img;
            }
            if (found.finish_name) {
                v.color_label = found.finish_name;
            }

            // Si la hoja PRESENTACION tiene múltiples variantes de tela para este modelo, generarlas automáticamente
            if (found.variants && found.variants.length > 1 && (!p.variants || p.variants.length <= 1)) {
                p.variants = found.variants.map((fv, fvIdx) => {
                    return {
                        name: p.model_name,
                        finish_type: 'TELA',
                        color_label: fv.color_label || `Opción ${fvIdx + 1}`,
                        swatch_hex: '#B8893E',
                        swatch_img: fv.swatch_img || '',
                        hero_b64: (fvIdx === 0 && v.hero_b64) ? v.hero_b64 : '',
                        width: fv.width || p.width || '',
                        depth: fv.depth || p.depth || '',
                        height: fv.height || p.height || '',
                        seat: fv.seat || p.seat || '',
                        packages: p.packages || '1 bulto',
                        volume: fv.volume || p.volume || '',
                        materials: p.materials || '',
                        drive_ficha_url: p.drive_ficha_url || '',
                        gallery: (fvIdx === 0 && v.gallery) ? JSON.parse(JSON.stringify(v.gallery)) : {
                            ambiente: '',
                            finish: fv.swatch_img || '',
                            finishes: fv.swatch_img ? [fv.swatch_img] : [],
                            fabric: fv.swatch_img || '',
                            view1: '',
                            view2: '',
                            view3: '',
                            view4: '',
                            all_views: []
                        }
                    };
                });
                currentVariantIndex = 0;
            }

            const setInp = (id, val) => {
                const inp = document.getElementById(id);
                if (inp && val !== undefined && val !== null) inp.value = val;
            };
            setInp('edit_title', p.model_name);
            setInp('edit_prov', p.provider_abbr);
            setInp('edit_cat', p.category);
            setInp('edit_mWidth', p.width);
            setInp('edit_mDepth', p.depth);
            setInp('edit_mHeight', p.height);
            setInp('edit_mSeat', p.seat);
            setInp('edit_mPackages', p.packages);
            setInp('edit_mVolume', p.volume);
            setInp('edit_price', p.price);
            setInp('edit_materials', p.materials);

            updateTechValidationPanel();

            if (!isEditMode) {
                updateModalView(false);
            }

            showAdminToast(`¡Datos autollenados desde SKU "${found.sku}" (Hoja PRESENTACION)! ✨`, '✅');
        }

        function updateTechValidationPanel() {
            const p = products[currentProdIndex];
            if (!p) return;
            const v = (p.variants && p.variants[currentVariantIndex]) ? p.variants[currentVariantIndex] : (p.variants ? p.variants[0] : {});

            const sheetBox = document.getElementById('sheetRefDimensions');
            const muebleBox = document.getElementById('currentMuebleDimensions');
            const badge = document.getElementById('techValidationBadge');
            const msg = document.getElementById('techValidationMsg');

            const sSpecs = p.sheet_specs || {};
            const sW = sSpecs.width || '';
            const sD = sSpecs.depth || '';
            const sH = sSpecs.height || '';

            const mW = v.width || p.width || '';
            const mD = v.depth || p.depth || '';
            const mH = v.height || p.height || '';

            if (sheetBox) {
                sheetBox.innerText = (sW && sD && sH) ? `${sW} × ${sD} × ${sH}` : (sW || '-');
            }
            if (muebleBox) {
                muebleBox.innerText = (mW && mD && mH) ? `${mW} × ${mD} × ${mH}` : (mW || '-');
            }

            if (!sW && !sD && !sH) {
                if (badge) {
                    badge.innerText = 'Sin datos de Sheet';
                    badge.className = 'text-[9px] font-bold px-2 py-0.5 rounded-full bg-slate-100 border border-slate-300 text-slate-600';
                }
                if (msg) msg.innerHTML = 'ℹ️ Autollena con un SKU de la hoja "PRESENTACION" para cotejar.';
                return;
            }

            const cleanStr = (s) => (s || '').replace(/[^0-9]/g, '');
            const match = cleanStr(sW) === cleanStr(mW) && cleanStr(sD) === cleanStr(mD) && cleanStr(sH) === cleanStr(mH);

            if (match) {
                if (badge) {
                    badge.innerText = '✅ Coinciden';
                    badge.className = 'text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 border border-emerald-300 text-emerald-800';
                }
                if (msg) msg.innerHTML = '<span class="text-emerald-700 font-bold">Las medidas del catálogo coinciden con la hoja PRESENTACION.</span>';
            } else {
                if (badge) {
                    badge.innerText = '⚠️ Diferencia detectada';
                    badge.className = 'text-[9px] font-bold px-2 py-0.5 rounded-full bg-amber-100 border border-amber-400 text-amber-900';
                }
                if (msg) msg.innerHTML = '<span class="text-amber-800 font-semibold">Difieren del Sheet. Si la Ficha Técnica indica otras medidas, consérvalas.</span>';
            }
        }

        function applySheetDimensionsToCurrent() {
            const p = products[currentProdIndex];
            if (!p || !p.sheet_specs) {
                showAdminToast('No hay medidas de la hoja PRESENTACION cargadas para este producto', '⚠️');
                return;
            }
            const s = p.sheet_specs;
            const v = (p.variants && p.variants[currentVariantIndex]) ? p.variants[currentVariantIndex] : (p.variants ? p.variants[0] : {});

            if (s.width) { p.width = s.width; v.width = s.width; }
            if (s.depth) { p.depth = s.depth; v.depth = s.depth; }
            if (s.height) { p.height = s.height; v.height = s.height; }
            if (s.seat) { p.seat = s.seat; v.seat = s.seat; }
            if (s.volume) { p.volume = s.volume; v.volume = s.volume; }

            const setInp = (id, val) => {
                const inp = document.getElementById(id);
                if (inp && val) inp.value = val;
            };
            setInp('edit_mWidth', p.width);
            setInp('edit_mDepth', p.depth);
            setInp('edit_mHeight', p.height);
            setInp('edit_mSeat', p.seat);
            setInp('edit_mVolume', p.volume);

            updateTechValidationPanel();
            if (!isEditMode) updateModalView(false);
            showAdminToast('Medidas del Sheet copiadas al mueble', '📋');
        }

        


        // INDEXEDDB DATABASE SYNC
        const DB_NAME = 'CreataCatalogDB';
        const DB_VERSION = 3;
        const STORE_NAME = 'products_store';

        function openCatalogDB() {
            return new Promise((resolve, reject) => {
                const req = indexedDB.open(DB_NAME, DB_VERSION);
                req.onupgradeneeded = (e) => {
                    const db = e.target.result;
                    if (e.oldVersion > 0 && e.oldVersion < 3 && db.objectStoreNames.contains(STORE_NAME)) {
                        db.deleteObjectStore(STORE_NAME);
                    }
                    if (!db.objectStoreNames.contains(STORE_NAME)) {
                        db.createObjectStore(STORE_NAME);
                    }
                };
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
        }

        async function loadCustomProducts() {
            try {
                const db = await openCatalogDB();
                const tx = db.transaction(STORE_NAME, 'readonly');
                const req = tx.objectStore(STORE_NAME).get('catalog_data');
                const res = await new Promise((resolve, reject) => {
                    req.onsuccess = () => resolve(req.result);
                    req.onerror = () => reject(req.error);
                });
                if (res && Array.isArray(res) && res.length > 0) {
                    return res;
                }
            } catch (e) {
                console.warn('[Sync DB Error]', e);
            }
            return null;
        }

        let products = [];
        let currentFilter = 'ALL';
        let currentProdIndex = 0;
        let currentVariantIndex = 0;
        let isEditMode = false;

        
        

        async function initializeCatalog() {
            const CATALOG_BUILD_VERSION = 'creata_catalog_v9_cloud_ready';
            let sourceList = null;

            if (window.CreataCloud && window.CreataCloud.config.isConfigured()) {
                const cloudList = await window.CreataCloud.fetchCloudCatalog('admin');
                if (Array.isArray(cloudList) && cloudList.length > 0) {
                    sourceList = cloudList;
                    try {
                        const db = await openCatalogDB();
                        const tx = db.transaction(STORE_NAME, 'readwrite');
                        tx.objectStore(STORE_NAME).put(cloudList, 'catalog_data');
                        await new Promise(r => tx.oncomplete = r);
                    } catch (e) {}
                }
            }

            if (!sourceList) {
                if (!localStorage.getItem(CATALOG_BUILD_VERSION)) {
                    localStorage.setItem(CATALOG_BUILD_VERSION, 'true');
                    const existing = await loadCustomProducts();
                    if (!existing || existing.length === 0) {
                        try {
                            const db = await openCatalogDB();
                            const tx = db.transaction(STORE_NAME, 'readwrite');
                            tx.objectStore(STORE_NAME).put(rawProducts, 'catalog_data');
                            await new Promise(r => tx.oncomplete = r);
                        } catch (e) {
                            console.warn('[Creata Sync Error]', e);
                        }
                    }
                }
                const custom = await loadCustomProducts();
                sourceList = (custom && Array.isArray(custom) && custom.length > 0) ? custom : rawProducts;
            }

            // En el editor SÍ mostramos fichas archivadas (ej. nuevas de Drive) aunque estén pendientes de completar
            products = sourceList.filter(p =>
                p && (
                    p.archived === true ||
                    (p.drive_ficha_url &&
                    p.width && p.width !== 'N/D' &&
                    p.depth && p.depth !== 'N/D' &&
                    p.height && p.height !== 'N/D' &&
                    p.price && !p.price.includes('Consultar'))
                )
            );
            updateCategoryCounts();
            updateAdminBadge();
            if (typeof updateCloudStatusUI === 'function') updateCloudStatusUI();
            setFilter(currentFilter);
            const savedLogo = localStorage.getItem('creata_custom_logo');
            if (savedLogo) {
                const logoEl = document.getElementById('headerLogoImg');
                if (logoEl) logoEl.src = savedLogo;
            }
        }

        if (document.readyState === 'loading') {
            window.addEventListener('DOMContentLoaded', initializeCatalog);
        } else {
            initializeCatalog();
        }


        function updateCategoryCounts() {
            const activeProds = products.filter(p => !p.archived);
            const archProds = products.filter(p => p.archived);

            const setBtnText = (id, label, count) => {
                const btn = document.getElementById(id);
                if (btn) btn.innerText = `${label} (${count})`;
            };

            setBtnText('flt-ALL', 'TODOS', activeProds.length);
            setBtnText('flt-SALAS-SOF-S', 'SALAS & SOFÁS', activeProds.filter(p => p.category === 'SALAS & SOFÁS').length);
            setBtnText('flt-SILLAS-SILLONES', 'SILLAS & SILLONES', activeProds.filter(p => p.category === 'SILLAS & SILLONES').length);
            setBtnText('flt-COMEDORES', 'COMEDORES', activeProds.filter(p => p.category === 'COMEDORES').length);
            setBtnText('flt-BUFETERAS-CREDENZAS', 'BUFETERAS & CREDENZAS', activeProds.filter(p => p.category === 'BUFETERAS & CREDENZAS').length);
            setBtnText('flt-MESAS-DE-CENTRO', 'MESAS DE CENTRO', activeProds.filter(p => p.category === 'MESAS DE CENTRO').length);
            setBtnText('flt-REC-MARAS', 'RECÁMARAS', activeProds.filter(p => p.category === 'RECÁMARAS').length);
            setBtnText('flt-COMPLEMENTOS', 'COMPLEMENTOS', activeProds.filter(p => p.category === 'COMPLEMENTOS').length);

            const archBtn = document.getElementById('flt-ARCHIVED');
            if (archBtn) archBtn.innerText = `📦 ARCHIVADOS (${archProds.length})`;
        }

        function setFilter(cat) {
            currentFilter = cat;
            document.querySelectorAll('#categoryBar .pill-btn').forEach(btn => {
                const btnCat = btn.getAttribute('data-cat');
                btn.classList.toggle('active', btnCat === cat);
            });

            const searchEl = document.getElementById('searchInput');
            const q = searchEl ? searchEl.value.trim().toLowerCase() : '';
            const titleEl = document.getElementById('activeCategoryTitle');

            const activeCount = products.filter(p => !p.archived).length;
            const archCount = products.filter(p => p.archived).length;

            if (titleEl) {
                if (cat === 'ARCHIVED') {
                    titleEl.innerText = `FICHAS ARCHIVADAS / OCULTAS DEL CATÁLOGO (${archCount})`;
                } else if (cat === 'ALL') {
                    titleEl.innerText = `TODOS LOS MUEBLES ACTIVOS (${activeCount})`;
                } else {
                    const catCount = products.filter(p => !p.archived && p.category === cat).length;
                    titleEl.innerText = `${cat} (${catCount})`;
                }
            }

            const filtered = products.filter(p => {
                if (currentFilter === 'ARCHIVED') {
                    if (!p.archived) return false;
                } else {
                    if (p.archived) return false;
                    if (currentFilter !== 'ALL' && p.category !== currentFilter) return false;
                }

                const matchQ = !q || p.model_name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q) || (p.provider && p.provider.toLowerCase().includes(q));
                return matchQ;
            });
            renderGrid(filtered);
        }

        function filterCatalog() {
            setFilter(currentFilter);
        }

        function renderGrid(items) {
            const grid = document.getElementById('grid');
            if (!grid) return;
            grid.innerHTML = '';

            if (items.length === 0) {
                if (currentFilter === 'ARCHIVED') {
                    grid.innerHTML = '<div class="col-span-full py-16 text-center text-gray-300 text-sm">📦 No tienes ninguna ficha archivada actualmente.</div>';
                } else {
                    grid.innerHTML = `
                        <div class="col-span-full py-20 text-center flex flex-col items-center justify-center">
                            <div class="w-16 h-16 rounded-full bg-slate-800/60 border border-slate-700 flex items-center justify-center text-3xl mb-4">📝</div>
                            <h3 class="text-xl font-bold text-white mb-2">Catálogo vacío y limpio</h3>
                            <p class="text-sm text-slate-400 max-w-md mb-6">Todas las fichas anteriores han sido eliminadas para ingresar las correctas. Comienza creando un nuevo mueble o importa tu archivo.</p>
                            <div class="flex flex-wrap items-center justify-center gap-3">
                                <button type="button" onclick="openNewFurnitureModal()" class="px-5 py-2.5 rounded-xl bg-[#B8893E] hover:bg-[#9E7432] text-white font-semibold text-sm shadow-lg inline-flex items-center gap-2 transition">
                                    <span>➕</span> Crear Nuevo Mueble
                                </button>
                                <button type="button" onclick="resetDefaultCatalog()" class="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-medium text-sm inline-flex items-center gap-2 transition" title="Recargar las 47 fichas oficiales limpias">
                                    <span>🔄</span> Recargar Catálogo Base
                                </button>
                            </div>
                        </div>
                    `;
                }
                return;
            }

            items.forEach((p) => {
                const realIdx = products.indexOf(p);
                const v = p.variants ? p.variants[0] : {};
                const card = document.createElement('div');
                card.className = `product-card cursor-pointer ${p.archived ? 'is-archived' : ''}`;
                card.onclick = () => openModal(realIdx, 0);

                const imgId = `grid_card_img_${realIdx}`;

                const swatchesHtml = (p.variants || []).map((vItem, vIdx) => {
                    const hasImg = !!vItem.swatch_img;
                    const bgStyle = hasImg
                        ? `background-image: url('${vItem.swatch_img}'); background-size: cover; background-position: center;`
                        : `background-color: ${vItem.swatch_hex || '#B8893E'};`;
                    return `
                    <span onmouseenter="if(products[${realIdx}].variants[${vIdx}].hero_b64) document.getElementById('${imgId}').src = products[${realIdx}].variants[${vIdx}].hero_b64;"
                          onclick="event.stopPropagation(); if(products[${realIdx}].variants[${vIdx}].hero_b64) document.getElementById('${imgId}').src = products[${realIdx}].variants[${vIdx}].hero_b64; openModal(${realIdx}, ${vIdx});" 
                          title="${vItem.color_label || 'Opción'}" 
                          class="swatch-circle"
                          style="${bgStyle}"></span>
                    `;
                }).join('');

                card.innerHTML = `
                    <div class="card-img-area relative" onmouseenter="this.querySelector('img') && this.querySelector('img').classList.add('flipped')" onmouseleave="this.querySelector('img') && this.querySelector('img').classList.remove('flipped')"
                         ondragover="handleCardDragOver(event)"
                         ondragleave="handleCardDragLeave(event)"
                         ondrop="handleCardDrop(event, ${realIdx})">
                        <div class="card-drag-overlay">
                            <span class="text-xl">📥</span>
                            <span>Soltar para cambiar Foto de Inicio</span>
                        </div>
                        <span class="badge-category">${p.category}</span>
                        ${p.archived ? `<span class="badge-archived-status">📦 ARCHIVADO</span>` : ''}
                        <div class="absolute top-2.5 right-2.5 z-20">
                            <button type="button" class="btn-card-edit" onclick="event.stopPropagation(); openModal(${realIdx}, 0, 0, true);" title="Editar ficha de este mueble">
                                ✏️
                            </button>
                        </div>
                        ${v.hero_b64 ? `<img id="${imgId}" src="${v.hero_b64}" alt="${p.model_name}">` : `
                        <div class="flex flex-col items-center justify-center p-4 text-center select-none w-full h-full" style="min-height: 170px;">
                            <div class="w-12 h-12 rounded-full bg-[#B8893E]/10 flex items-center justify-center mb-2">
                                <svg class="w-6 h-6 text-[#B8893E]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                            </div>
                            <span class="text-[10px] font-bold text-slate-700 tracking-wider uppercase">${p.provider_abbr || 'CREATA'}</span>
                            <span class="text-[9px] text-[#B8893E] font-semibold mt-1">📄 Ver Ficha Técnica</span>
                        </div>`}
                    </div>
                    <div class="card-footer-info">
                        <div class="card-product-title">
                            ${p.model_name}
                            ${p.archived ? '<span class="text-[10px] text-amber-700 font-bold ml-1">(Archivado)</span>' : ''}
                        </div>
                        <div class="card-swatches-row">
                            ${swatchesHtml}
                            <span class="options-count-text">${(p.variants || []).length} ${(p.variants || []).length === 1 ? 'opción' : 'opciones'}</span>
                        </div>
                    </div>
                `;
                grid.appendChild(card);
            });
        }

        async function applyToggleArchiveProduct(realIdx, updateModal) {
            const p = products[realIdx];
            if (!p) return;
            p.archived = !p.archived;
            await saveCatalogData();
            if (updateModal) updateModalView(false);
            updateCategoryCounts();
            filterCatalog();
            updateAdminBadge();

            let cloudSuffix = '';
            if (window.CreataCloud && window.CreataCloud.config.isConfigured()) {
                let res = await window.CreataCloud.cloudPost('toggle_archive', {
                    productId: p.id,
                    archived: !!p.archived
                });
                if (!res || !res.ok) {
                    res = await window.CreataCloud.cloudPost('save_product', { product: p });
                }
                cloudSuffix = (res && res.ok) ? ' · ☁️ Sheets al día' : ' · ⚠️ Solo local';
            }

            if (p.archived) {
                showAdminToast(`"${p.model_name}" archivado (oculto del catálogo)${cloudSuffix}`, '📦');
            } else {
                showAdminToast(`"${p.model_name}" desarchivado (visible en catálogo)${cloudSuffix}`, '👁️');
            }
        }

        async function toggleArchiveProductByIdx(realIdx) {
            await applyToggleArchiveProduct(realIdx, false);
        }

        async function toggleArchiveCurrentProduct() {
            await applyToggleArchiveProduct(currentProdIndex, true);
        }

        function openModal(prodIdx, variantIdx = 0, viewIdx = 0, startInEdit = false) {
            currentProdIndex = prodIdx;
            currentVariantIndex = variantIdx;
            currentViewIndex = viewIdx;
            updateModalView();
            if (startInEdit) {
                toggleEditMode(true);
            } else if (isEditMode) {
                toggleEditMode(false);
            }
            document.getElementById('slideModal').classList.add('active');
        }
        
        function closeModal() {
            document.getElementById('slideModal').classList.remove('active');
        }

        let currentViewOffset = 0;

        // ==========================================================================
        // COMPOSICIÓN DE PIEZAS Y SUMA DINÁMICA DE SKU
        // ==========================================================================
        function getCategoryDefaultPieces(cat) {
            const c = (cat || '').toUpperCase();
            if (c.includes('SALA') || c.includes('SOF')) {
                return [
                    { name: 'Módulo Central', code: 'MOD-CEN', checked: true },
                    { name: 'Módulo Izquierdo', code: 'MOD-IZQ', checked: true },
                    { name: 'Módulo Derecho', code: 'MOD-DER', checked: false },
                    { name: 'Chaise Longue', code: 'CHAISE', checked: true },
                    { name: 'Taburete / Otomán', code: 'TAB', checked: false }
                ];
            } else if (c.includes('REC') || c.includes('CAMA')) {
                return [
                    { name: 'Cabecera', code: 'CAB', checked: true },
                    { name: 'Base de Cama', code: 'BASE', checked: true },
                    { name: 'Buró Izquierdo', code: 'BUR-IZQ', checked: true },
                    { name: 'Buró Derecho', code: 'BUR-DER', checked: true },
                    { name: 'Cajonera', code: 'CAJ', checked: false }
                ];
            } else if (c.includes('COMEDOR')) {
                return [
                    { name: 'Mesa de Comedor', code: 'MESA', checked: true },
                    { name: 'Juego 6 Sillas', code: '6-SIL', checked: true },
                    { name: 'Juego 8 Sillas', code: '8-SIL', checked: false },
                    { name: 'Banca', code: 'BANCA', checked: false }
                ];
            } else {
                return [
                    { name: 'Pieza Principal', code: 'PZA-1', checked: true },
                    { name: 'Pieza Complementaria', code: 'PZA-2', checked: false },
                    { name: 'Módulo Lateral', code: 'MOD-LAT', checked: false }
                ];
            }
        }

        function renderPieceSkuComposer() {
            const p = products[currentProdIndex];
            if (!p) return;

            if (!p.sku_base) {
                p.sku_base = (p.sku || p.id || 'CREATA-01').split(' + ')[0].trim();
            }
            if (!p.sku_mode) {
                p.sku_mode = (p.sku && p.sku.includes(' + ')) ? 'multi' : 'single';
            }
            if (!p.piece_composition || p.piece_composition.length === 0) {
                p.piece_composition = getCategoryDefaultPieces(p.category);
            }

            const singleRadio = document.getElementById('skuModeSingle');
            const multiRadio = document.getElementById('skuModeMulti');
            const multiSection = document.getElementById('multiPieceSection');

            if (p.sku_mode === 'multi') {
                if (multiRadio) multiRadio.checked = true;
                if (singleRadio) singleRadio.checked = false;
                if (multiSection) multiSection.classList.remove('hidden');
            } else {
                if (singleRadio) singleRadio.checked = true;
                if (multiRadio) multiRadio.checked = false;
                if (multiSection) multiSection.classList.add('hidden');
            }

            const listWrap = document.getElementById('piecesListContainer');
            if (listWrap) {
                listWrap.innerHTML = p.piece_composition.map((pi, idx) => `
                    <label class="flex items-center justify-between p-1.5 bg-white border border-slate-200 rounded hover:border-[#B8893E] cursor-pointer text-[10px]">
                        <span class="flex items-center gap-1.5">
                            <input type="checkbox" ${pi.checked ? 'checked' : ''} onchange="togglePieceChecked(${idx}, this.checked)" class="accent-[#B8893E]">
                            <span class="font-bold text-slate-700">${pi.name}</span>
                        </span>
                        <code class="font-mono text-[9px] px-1 py-0.5 bg-slate-100 rounded text-slate-600 font-bold">${pi.code}</code>
                    </label>
                `).join('');
            }

            updateCompositeSkuCalculation();
        }

        async function handleSkuModeChange(mode) {
            const p = products[currentProdIndex];
            if (!p) return;
            p.sku_mode = mode;
            if (mode === 'single') {
                p.sku = p.sku_base || p.sku.split(' + ')[0];
                const input = document.getElementById('inputAutoSku');
                if (input) input.value = p.sku;
            } else {
                updateCompositeSkuCalculation();
            }
            await saveCatalogData();
            renderPieceSkuComposer();
        }

        async function togglePieceChecked(idx, isChecked) {
            const p = products[currentProdIndex];
            if (!p || !p.piece_composition || !p.piece_composition[idx]) return;
            p.piece_composition[idx].checked = isChecked;
            if (p.sku_mode === 'multi') {
                updateCompositeSkuCalculation();
            }
            await saveCatalogData();
        }

        function updateCompositeSkuCalculation() {
            const p = products[currentProdIndex];
            if (!p) return;

            const base = (p.sku_base || p.sku || 'MUEBLE').split(' + ')[0].trim();
            p.sku_base = base;

            const selected = (p.piece_composition || []).filter(pi => pi.checked);
            const displayEl = document.getElementById('compositeSkuDisplay');
            const countEl = document.getElementById('compositePiecesCount');
            const input = document.getElementById('inputAutoSku');

            if (p.sku_mode === 'multi') {
                const codes = selected.map(pi => pi.code.trim()).filter(Boolean);
                const fullSku = codes.length > 0 ? `${base} + ${codes.join(' + ')}` : base;
                p.sku = fullSku;
                if (displayEl) displayEl.innerText = fullSku;
                if (countEl) countEl.innerText = `${selected.length} ${selected.length === 1 ? 'pieza' : 'piezas'}`;
                if (input) input.value = fullSku;

                if (selected.length > 0) {
                    p.packages = `${selected.length} bultos / piezas`;
                    const mPack = document.getElementById('mPackages');
                    if (mPack) mPack.innerText = p.packages;
                }
            } else {
                p.sku = base;
                if (displayEl) displayEl.innerText = base;
                if (countEl) countEl.innerText = '1 pieza';
                if (input) input.value = base;
            }
        }

        async function addNewCustomPiece() {
            const p = products[currentProdIndex];
            if (!p) return;
            const nameEl = document.getElementById('newPieceName');
            const codeEl = document.getElementById('newPieceCode');
            const name = (nameEl ? nameEl.value : '').trim().toUpperCase();
            const code = (codeEl ? codeEl.value : '').trim().toUpperCase();

            if (!name || !code) {
                showAdminToast('Escribe nombre y código de la pieza', '⚠️');
                return;
            }

            if (!p.piece_composition) p.piece_composition = [];
            p.piece_composition.push({ name, code, checked: true });

            if (nameEl) nameEl.value = '';
            if (codeEl) codeEl.value = '';

            p.sku_mode = 'multi';
            updateCompositeSkuCalculation();
            await saveCatalogData();
            renderPieceSkuComposer();
            showAdminToast(`Pieza "${name}" añadida al SKU compuesto`, '🧩');
        }
        let mainPhotoCycleIndex = -1;
