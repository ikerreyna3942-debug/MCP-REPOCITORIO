// INDEXEDDB DATABASE SYNC
        const DB_NAME = 'CreataCatalogDB';
        const DB_VERSION = 3;
        const STORE_NAME = 'products_store';

        function openCatalogDB() {
            return new Promise((resolve, reject) => {
                const req = indexedDB.open(DB_NAME, DB_VERSION);
                req.onupgradeneeded = (e) => {
                    const db = e.target.result;
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

        function normalizeSearchStr(str) {
            if (!str) return '';
            return String(str)
                .toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/\s+/g, ' ')
                .trim();
        }

        function buildPublicSearchHaystack(p) {
            if (!p) return '';
            const parts = [
                p.model_name || '',
                p.category || '',
                p.provider_abbr || '',
                p.provider || '',
                p.materials || '',
                p.width || '',
                p.depth || '',
                p.height || '',
                p.seat || '',
                p.packages || '',
                p.volume || '',
                p.price || ''
            ];
            if (Array.isArray(p.variants)) {
                p.variants.forEach((v) => {
                    if (!v) return;
                    parts.push(
                        v.color_label || '',
                        v.finish_type || '',
                        v.materials || '',
                        v.width || '',
                        v.depth || '',
                        v.height || ''
                    );
                });
            }
            if (Array.isArray(p.sala_modules)) {
                p.sala_modules.forEach((m) => {
                    if (!m) return;
                    parts.push(m.name || '', m.width || '', m.depth || '', m.height || '');
                });
            }
            return normalizeSearchStr(parts.join(' '));
        }

        function matchesPublicSearch(p, rawQuery) {
            const normQ = normalizeSearchStr(rawQuery);
            if (!normQ) return true;
            const tokens = normQ.split(' ').filter(Boolean);
            if (tokens.length === 0) return true;
            const haystack = buildPublicSearchHaystack(p);
            return tokens.every((tok) => haystack.includes(tok));
        }

        function mergeFreshEditorEditsIntoPublic_(cloudItems, localItems) {
            if (!Array.isArray(localItems) || localItems.length === 0) return cloudItems;
            const localByModel = {};
            const localById = {};
            localItems.forEach((lp) => {
                if (!lp) return;
                if (lp.id) localById[lp.id] = lp;
                if (lp.model_name) localByModel[String(lp.model_name).trim().toUpperCase()] = lp;
            });
            const merged = cloudItems.map((cp) => {
                const lp = (cp && cp.id && localById[cp.id]) || (cp && cp.model_name && localByModel[String(cp.model_name).trim().toUpperCase()]) || null;
                if (!lp) return cp;
                return JSON.parse(JSON.stringify(lp));
            });
            return merged;
        }

        async function initializeCatalog(preferFreshLocal = false) {
            let sourceList = rawProducts;
            let isCloudSource = false;

            if (window.CreataCloud) {
                const liveList = await window.CreataCloud.fetchCloudCatalog('public');
                if (Array.isArray(liveList) && liveList.length > 0) {
                    sourceList = liveList;
                    isCloudSource = true;
                }
            }

            if (preferFreshLocal || (!isCloudSource && localStorage.getItem('creata_catalog_v12_linked') === 'true')) {
                const localCustom = await loadCustomProducts();
                if (Array.isArray(localCustom) && localCustom.length > 0) {
                    sourceList = isCloudSource
                        ? mergeFreshEditorEditsIntoPublic_(sourceList, localCustom)
                        : localCustom;
                }
            }

            // FUENTE DE VERDAD SEGURA PARA CLIENTES (SIN ARCHIVADOS, SIN SKUs, SIN TEXTOS INVENTADOS)
            products = sourceList
                .map(p => window.CreataCloud ? window.CreataCloud.sanitizePublicProduct(p) : p)
                .filter(p => {
                    if (!p || p.archived || !p.model_name) return false;
                    if (isCloudSource) return true;
                    return !!(
                        p.width && p.width !== 'N/D' &&
                        p.depth && p.depth !== 'N/D' &&
                        p.height && p.height !== 'N/D' &&
                        p.price && !String(p.price).includes('Consultar')
                    );
                });
            updateCategoryCounts();
            setFilter(currentFilter);
            const modalEl = document.getElementById('slideModal');
            if (modalEl && modalEl.classList.contains('active') && products.length > 0) {
                if (currentProdIndex >= products.length) currentProdIndex = 0;
                updateModalView(false);
            }
            const savedLogo = localStorage.getItem('creata_custom_logo');
            if (savedLogo) {
                const logoEl = document.getElementById('headerLogoImg');
                if (logoEl) logoEl.src = savedLogo;
            }
        }

        // Vinculación en tiempo real Editor (admin.html) -> Cliente (index.html)
        let __liveSyncRefreshTimer = null;
        function handleLiveEditorSyncSignal_() {
            initializeCatalog(true);
            clearTimeout(__liveSyncRefreshTimer);
            __liveSyncRefreshTimer = setTimeout(() => initializeCatalog(false), 4500);
        }
        try {
            if (typeof BroadcastChannel !== 'undefined') {
                const bc = new BroadcastChannel('creata_live_sync');
                bc.onmessage = () => handleLiveEditorSyncSignal_();
            }
        } catch (e) {}
        window.addEventListener('storage', (ev) => {
            if (ev && ev.key === 'creata_live_sync_ping') handleLiveEditorSyncSignal_();
        });

        if (document.readyState === 'loading') {
            window.addEventListener('DOMContentLoaded', () => initializeCatalog(false));
        } else {
            initializeCatalog(false);
        }


        function updateCategoryCounts() {
            const activeProds = products.filter(p => !p.archived);

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
        }

        function handlePublicSearch(val) {
            const rawQ = (val || '').trim();
            const clearBtn = document.getElementById('clearSearchBtn');
            if (clearBtn) clearBtn.style.display = rawQ.length > 0 ? 'inline-flex' : 'none';

            if (rawQ.length > 0 && currentFilter !== 'ALL') {
                const hitsInCurrent = products.filter(p => !p.archived && p.category === currentFilter && matchesPublicSearch(p, rawQ));
                const hitsGlobal = products.filter(p => !p.archived && matchesPublicSearch(p, rawQ));
                if (hitsInCurrent.length === 0 && hitsGlobal.length > 0) {
                    currentFilter = 'ALL';
                }
            }
            setFilter(currentFilter);
        }

        function clearPublicSearch() {
            const searchEl = document.getElementById('searchInput');
            if (searchEl) {
                searchEl.value = '';
                searchEl.focus();
            }
            const clearBtn = document.getElementById('clearSearchBtn');
            if (clearBtn) clearBtn.style.display = 'none';
            setFilter(currentFilter);
        }

        function setFilter(cat) {
            currentFilter = cat;
            document.querySelectorAll('#categoryBar .pill-btn').forEach(btn => {
                const btnCat = btn.getAttribute('data-cat');
                btn.classList.toggle('active', btnCat === cat);
            });

            const searchEl = document.getElementById('searchInput');
            const rawQ = searchEl ? searchEl.value.trim() : '';
            const clearBtn = document.getElementById('clearSearchBtn');
            if (clearBtn) clearBtn.style.display = rawQ.length > 0 ? 'inline-flex' : 'none';

            const titleEl = document.getElementById('activeCategoryTitle');
            const activeProds = products.filter(p => !p.archived);

            const filtered = activeProds.filter(p => {
                const matchCat = (currentFilter === 'ALL' || p.category === currentFilter);
                const matchQ = matchesPublicSearch(p, rawQ);
                return matchCat && matchQ;
            });

            if (titleEl) {
                if (rawQ) {
                    const catSuffix = currentFilter === 'ALL' ? '' : ` EN ${currentFilter}`;
                    titleEl.innerText = `RESULTADOS PARA "${rawQ.toUpperCase()}"${catSuffix} (${filtered.length})`;
                } else if (cat === 'ALL') {
                    titleEl.innerText = `TODOS LOS MUEBLES (${activeProds.length})`;
                } else {
                    const catCount = activeProds.filter(p => p.category === cat).length;
                    titleEl.innerText = `${cat} (${catCount})`;
                }
            }

            renderGrid(filtered, rawQ);
        }

        function filterCatalog() {
            setFilter(currentFilter);
        }

        function renderGrid(items, activeSearchQuery = '') {
            const grid = document.getElementById('grid');
            if (!grid) return;
            grid.innerHTML = '';

            if (items.length === 0) {
                if (activeSearchQuery) {
                    const safeQ = activeSearchQuery.replace(/[<>&"]/g, '');
                    grid.innerHTML = `
                        <div class="col-span-full py-16 text-center flex flex-col items-center justify-center">
                            <div class="w-16 h-16 rounded-full bg-slate-800/60 border border-slate-700 flex items-center justify-center text-2xl mb-4">🔍</div>
                            <h3 class="text-lg font-bold text-white mb-2">Sin coincidencias para "${safeQ}"</h3>
                            <p class="text-sm text-slate-300 max-w-md mb-4">Prueba con otra palabra clave (modelo, categoría, tela, madera, material o medida).</p>
                            <button type="button" onclick="currentFilter='ALL'; clearPublicSearch();" class="px-5 py-2 rounded-full bg-[#B8893E] hover:bg-[#9E7432] text-white text-xs font-bold uppercase tracking-wider shadow transition">
                                Ver todos los muebles
                            </button>
                        </div>
                    `;
                } else {
                    grid.innerHTML = `
                        <div class="col-span-full py-20 text-center flex flex-col items-center justify-center">
                            <div class="w-16 h-16 rounded-full bg-slate-800/60 border border-slate-700 flex items-center justify-center text-3xl mb-4">🛋️</div>
                            <h3 class="text-xl font-bold text-white mb-2">Próximamente nuevos modelos</h3>
                            <p class="text-sm text-slate-400 max-w-md">Catálogo en actualización. Los nuevos productos y colecciones estarán disponibles muy pronto.</p>
                        </div>
                    `;
                }
                return;
            }

            items.forEach((p) => {
                const realIdx = products.indexOf(p);
                const v = p.variants ? p.variants[0] : {};
                const card = document.createElement('div');
                card.className = 'product-card cursor-pointer';
                card.onclick = () => openModal(realIdx, 0);

                const imgId = `grid_card_img_${realIdx}`;
                const isPhotoValid = window.CreataCloud ? window.CreataCloud.isValidPhotoUrl : (u => !!u);

                const resolveCleanCover = (variantObj) => {
                    if (!variantObj) return '';
                    const vg = variantObj.gallery || {};
                    const rawHero = isPhotoValid(variantObj.hero_b64) ? variantObj.hero_b64 : '';
                    const isSwatchHero = rawHero && (rawHero === variantObj.swatch_img || rawHero === vg.finish || /-finish-\d+\./i.test(rawHero));
                    if (rawHero && !isSwatchHero) return rawHero;
                    if (isPhotoValid(vg.ambiente)) return vg.ambiente;
                    if (isPhotoValid(vg.view1)) return vg.view1;
                    if (Array.isArray(vg.all_views)) {
                        const firstV = vg.all_views.find(isPhotoValid);
                        if (firstV) return firstV;
                    }
                    return '';
                };

                const swatchesHtml = (p.variants || []).map((vItem, vIdx) => {
                    const vg = vItem.gallery || {};
                    const swImg = vItem.swatch_img || vg.finish || vg.fabric || '';
                    const hasImg = isPhotoValid(swImg);
                    const bgStyle = hasImg
                        ? `background-image: url('${swImg}'); background-size: cover; background-position: center;`
                        : `background-color: ${vItem.swatch_hex || '#B8893E'};`;
                    const vCover = resolveCleanCover(vItem).replace(/'/g, "\\'");
                    return `
                    <span onmouseenter="var img=document.getElementById('${imgId}'); if(img && '${vCover}'){img.src='${vCover}'; img.style.display='block';}"
                          onclick="event.stopPropagation(); openModal(${realIdx}, ${vIdx});" 
                          title="${(vItem.color_label || 'Opción').replace(/"/g, '&quot;')}" 
                          class="swatch-circle"
                          style="${bgStyle}"></span>
                    `;
                }).join('');

                const heroSrc = resolveCleanCover(v);
                const hasHero = !!heroSrc;
                card.innerHTML = `
                    <div class="card-img-area">
                        <span class="badge-category">${p.category}</span>
                        ${hasHero ? `<img id="${imgId}" src="${heroSrc}" alt="${p.model_name.replace(/"/g, '&quot;')}" loading="lazy" onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='flex';">` : ''}
                        <div class="flex flex-col items-center justify-center p-4 text-center select-none w-full h-full" style="min-height: 170px; ${hasHero ? 'display:none;' : ''}">
                            <div class="w-12 h-12 rounded-full bg-[#B8893E]/10 flex items-center justify-center mb-2">
                                <svg class="w-6 h-6 text-[#B8893E]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                            </div>
                            <span class="text-[10px] font-bold text-slate-700 tracking-wider uppercase">${p.provider_abbr || 'CREATA'}</span>
                            <span class="text-[9px] text-[#B8893E] font-semibold mt-1">📄 Ver Ficha Técnica</span>
                        </div>
                    </div>
                    <div class="card-footer-info">
                        <div class="card-product-title">${p.model_name}</div>
                        <div class="card-swatches-row">
                            ${swatchesHtml}
                            <span class="options-count-text">${(p.variants || []).length} ${(p.variants || []).length === 1 ? 'opción' : 'opciones'}</span>
                        </div>
                    </div>
                `;
                grid.appendChild(card);
            });
        }

        function openModal(prodIdx, variantIdx = 0, viewIdx = 0) {
            currentProdIndex = prodIdx;
            currentVariantIndex = variantIdx;
            currentViewIndex = viewIdx;
            updateModalView();
            document.getElementById('slideModal').classList.add('active');
        }

        function closeModal() {
            document.getElementById('slideModal').classList.remove('active');
        }

        let currentViewOffset = 0;
        let mainPhotoCycleIndex = -1;

        function updateModalView(resetOffset = true) {
            const p = products[currentProdIndex];
            if (!p) return;
            const v = (p.variants && p.variants[currentVariantIndex]) ? p.variants[currentVariantIndex] : (p.variants ? p.variants[0] : {});
            if (resetOffset) {
                currentViewOffset = 0;
                mainPhotoCycleIndex = -1;
            }

            document.getElementById('modalProviderCat').innerText = `${p.provider_abbr} · ${p.category}`;
            document.getElementById('modalTitle').innerText = p.model_name;

            const isPhotoValid = window.CreataCloud ? window.CreataCloud.isValidPhotoUrl : (u => !!u);
            const g = v.gallery || {};
            const rawFinish = g.finish || (g.finishes && g.finishes.length > 0 ? g.finishes[0] : '') || g.fabric || v.swatch_img || '';
            const finishSrc = isPhotoValid(rawFinish) ? rawFinish : '';
            if (finishSrc && !v.swatch_img) v.swatch_img = finishSrc;

            const rawHero = isPhotoValid(v.hero_b64) ? v.hero_b64 : '';
            const cleanHeroUrl = (rawHero && rawHero !== finishSrc && !/-finish-\d+\./i.test(rawHero)) ? rawHero : '';
            const ambUrl = isPhotoValid(g.ambiente) ? g.ambiente : cleanHeroUrl;
            const rawViews = Array.isArray(g.all_views) && g.all_views.length > 0
                ? g.all_views
                : [g.view1, g.view2, g.view3, g.view4];
            const validViews = (rawViews || []).filter(isPhotoValid);

            const ambEl = document.getElementById('slotImgAmbiente');
            if (ambEl) {
                ambEl.className = "w-full h-full object-contain transition-all duration-200";
                if (ambUrl) {
                    ambEl.src = ambUrl;
                    ambEl.style.display = 'block';
                } else {
                    ambEl.removeAttribute('src');
                    ambEl.style.display = 'none';
                }
            }

            const vFinishType = v.finish_type || (window.CreataCloud ? window.CreataCloud.inferFinishType(v.color_label, v.materials || p.materials) : 'TELA');
            const vFinishLabel = (v.color_label || 'ACABADO OFICIAL').toUpperCase();
            const finishBadgeEl = document.getElementById('slotFinishLabelBadge');

            const finishEl = document.getElementById('slotImgFinish');
            if (finishEl) {
                const finishBox = finishEl.closest('.gallery-slot');
                finishEl.className = "w-full h-full object-cover p-1";
                if (finishSrc) {
                    finishEl.src = finishSrc;
                    finishEl.style.display = 'block';
                    if (finishBox) finishBox.style.display = 'flex';
                    if (finishBadgeEl) {
                        finishBadgeEl.textContent = `${vFinishType === 'MADERA' ? '🪵' : '🧵'} ${vFinishLabel}`;
                        finishBadgeEl.style.display = 'inline-flex';
                    }
                } else {
                    finishEl.removeAttribute('src');
                    finishEl.style.display = 'none';
                    if (finishBox) finishBox.style.display = 'none';
                    if (finishBadgeEl) finishBadgeEl.style.display = 'none';
                }
            }

            const hasAnyPhoto = !!(ambUrl || finishSrc || validViews.length > 0);
            const galleryGrid = document.querySelector('.modal-gallery-grid');
            let placeholderBox = document.getElementById('modalNoPhotoPlaceholder');
            if (!placeholderBox && galleryGrid && galleryGrid.parentElement) {
                placeholderBox = document.createElement('div');
                placeholderBox.id = 'modalNoPhotoPlaceholder';
                placeholderBox.className = 'w-full h-full min-h-[380px] flex flex-col items-center justify-center p-8 text-center bg-slate-50 border border-slate-200 rounded-xl';
                galleryGrid.parentElement.appendChild(placeholderBox);
            }

            if (!hasAnyPhoto) {
                if (galleryGrid) galleryGrid.style.display = 'none';
                if (placeholderBox) {
                    placeholderBox.style.display = 'flex';
                    placeholderBox.innerHTML = `
                        <div class="w-20 h-20 rounded-full bg-[#B8893E]/10 flex items-center justify-center mb-4 text-[#B8893E]">
                            <svg class="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                        </div>
                        <span class="text-xs font-bold text-[#B8893E] tracking-widest uppercase mb-1">${p.provider_abbr || 'CREATA'} · FICHA TÉCNICA</span>
                        <h3 class="text-base font-extrabold text-slate-800 uppercase tracking-wide mb-6">${p.model_name}</h3>
                        <a href="${v.drive_ficha_url || p.drive_ficha_url || '#'}" target="_blank" class="px-6 py-3 bg-[#B8893E] hover:bg-[#9E7432] text-white text-xs font-bold uppercase tracking-wider rounded-lg shadow-md transition-all flex items-center gap-2">
                            <span>Abrir Ficha Técnica en Drive</span>
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
                        </a>
                    `;
                }
            } else {
                if (galleryGrid) galleryGrid.style.display = '';
                if (placeholderBox) placeholderBox.style.display = 'none';
            }

            const vSlots = ['slotImgView1', 'slotImgView2', 'slotImgView3', 'slotImgView4'];
            vSlots.forEach((slotId, idx) => {
                const el = document.getElementById(slotId);
                const parentBox = el ? el.closest('.gallery-slot') : null;
                const viewImg = validViews[idx] || '';
                if (viewImg) {
                    if (el) {
                        el.src = viewImg;
                        el.style.display = 'block';
                        el.className = "w-full h-full object-contain p-1.5";
                    }
                    if (parentBox) parentBox.style.display = 'block';
                } else {
                    if (el) {
                        el.removeAttribute('src');
                        el.style.display = 'none';
                    }
                    if (parentBox) parentBox.style.display = 'none';
                }
            });

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
            setSpecBox('mWidth', v.width || p.width);
            setSpecBox('mDepth', v.depth || p.depth);
            setSpecBox('mHeight', v.height || p.height);
            setSpecBox('mSeat', v.seat || p.seat);
            setSpecBox('mPackages', v.packages || p.packages);
            setSpecBox('mVolume', v.volume || p.volume);

            document.getElementById('mPrice').innerText = v.price || p.price || 'Consultar';
            const matEl = document.getElementById('mMaterials');
            const matText = (v.materials || p.materials || '').toString().trim();
            if (matEl) {
                const matBox = matEl.parentElement;
                if (!matText || matText === '-') {
                    if (matBox) matBox.style.display = 'none';
                } else {
                    if (matBox) matBox.style.display = '';
                    matEl.innerText = matText;
                }
            }

            const swatchesRow = document.getElementById('modalSwatchesRow');
            if (swatchesRow && p.variants) {
                swatchesRow.innerHTML = p.variants.map((vItem, vIdx) => {
                    const isAct = vIdx === currentVariantIndex;
                    const vg = vItem.gallery || {};
                    const linkedImg = vItem.swatch_img || vg.finish || vg.fabric || (Array.isArray(vg.finishes) && vg.finishes[0]) || '';
                    if (linkedImg && !vItem.swatch_img) vItem.swatch_img = linkedImg;
                    const fType = vItem.finish_type || (window.CreataCloud ? window.CreataCloud.inferFinishType(vItem.color_label, vItem.materials || p.materials) : 'TELA');
                    const typeIcon = fType === 'MADERA' ? '🪵' : '🧵';
                    const lbl = (vItem.color_label || 'ACABADO OFICIAL').toUpperCase();
                    const thumb = isPhotoValid(linkedImg)
                        ? `<span class="swatch-pill-dot" style="background-image: url('${linkedImg}');"></span>`
                        : `<span class="swatch-pill-dot" style="background-color: ${vItem.swatch_hex || '#B8893E'};"></span>`;
                    return `
                    <button type="button" onclick="currentVariantIndex = ${vIdx}; updateModalView(true);"
                            title="${lbl.replace(/"/g, '&quot;')}"
                            class="swatch-pill ${isAct ? 'active' : ''}">
                        ${thumb}
                        <span class="swatch-pill-label">${lbl}</span>
                        <span class="swatch-pill-icon">${typeIcon}</span>
                    </button>
                    `;
                }).join('');
            }

            const driveBtn = document.getElementById('modalDriveBtn');
            if (driveBtn) {
                driveBtn.href = v.drive_ficha_url || p.drive_ficha_url || '#';
            }
        }

        function cycleMainPhoto() {
            const p = products[currentProdIndex];
            const v = (p && p.variants && p.variants[currentVariantIndex]) ? p.variants[currentVariantIndex] : (p && p.variants ? p.variants[0] : {});
            const g = v.gallery || {};
            const isPhotoValid = window.CreataCloud ? window.CreataCloud.isValidPhotoUrl : (u => !!u);
            const pool = [g.ambiente, v.hero_b64, ...(Array.isArray(g.all_views) ? g.all_views : [])].filter(isPhotoValid);
            const allViews = [...new Set(pool)];
            if (allViews.length === 0) return;

            mainPhotoCycleIndex = (mainPhotoCycleIndex + 1) % allViews.length;
            const mainImg = document.getElementById('slotImgAmbiente');
            if (!mainImg) return;

            mainImg.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease';
            mainImg.style.transform = 'scale(0.92) rotateY(25deg)';
            mainImg.style.opacity = '0.5';

            setTimeout(() => {
                mainImg.src = allViews[mainPhotoCycleIndex];
                mainImg.style.transform = 'scale(1) rotateY(0deg)';
                mainImg.style.opacity = '1';
            }, 150);
        }

        function swapToMain(slotName) {
            const mainImg = document.getElementById('slotImgAmbiente');
            if (!mainImg) return;

            let targetImg = null;
            if (slotName === 'finish') targetImg = document.getElementById('slotImgFinish');
            else if (slotName === 'view1') targetImg = document.getElementById('slotImgView1');
            else if (slotName === 'view2') targetImg = document.getElementById('slotImgView2');
            else if (slotName === 'view3') targetImg = document.getElementById('slotImgView3');
            else if (slotName === 'view4') targetImg = document.getElementById('slotImgView4');

            if (!targetImg || !targetImg.src) return;

            const currentMainSrc = mainImg.src;
            const currentTargetSrc = targetImg.src;

            if (!currentTargetSrc || currentMainSrc === currentTargetSrc) return;

            mainImg.style.transition = 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.25s ease';
            targetImg.style.transition = 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.25s ease';

            mainImg.style.transform = 'scale(0.92) rotateY(-18deg)';
            mainImg.style.opacity = '0.5';
            targetImg.style.transform = 'scale(0.92) rotateY(18deg)';
            targetImg.style.opacity = '0.5';

            setTimeout(() => {
                // Intercambio bidireccional (ninguna foto desaparece)
                mainImg.src = currentTargetSrc;
                targetImg.src = currentMainSrc;

                mainImg.style.transform = 'scale(1) rotateY(0deg)';
                mainImg.style.opacity = '1';
                targetImg.style.transform = 'scale(1) rotateY(0deg)';
                targetImg.style.opacity = '1';
            }, 130);
        }

        function prevProduct() {
            currentProdIndex = (currentProdIndex - 1 + products.length) % products.length;
            currentVariantIndex = 0;
            updateModalView();
        }

        function nextProduct() {
            currentProdIndex = (currentProdIndex + 1) % products.length;
            currentVariantIndex = 0;
            updateModalView();
        }

        document.addEventListener('keydown', (e) => {
            if (!document.getElementById('slideModal').classList.contains('active')) return;
            if (e.key === 'ArrowRight') nextProduct();
            if (e.key === 'ArrowLeft') prevProduct();
            if (e.key === 'Escape') closeModal();
        });