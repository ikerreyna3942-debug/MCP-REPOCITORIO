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
        let currentViewIndex = 0;

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
                const cloned = JSON.parse(JSON.stringify(lp));
                if (Array.isArray(cloned.variants) && Array.isArray(cp.variants)) {
                    cloned.variants.forEach((lv, vIdx) => {
                        const cv = cp.variants[vIdx];
                        if (!lv || !cv) return;
                        if (!lv.hero_b64 && cv.hero_b64) lv.hero_b64 = cv.hero_b64;
                        if (!lv.swatch_img && cv.swatch_img) lv.swatch_img = cv.swatch_img;
                        if (lv.gallery && cv.gallery) {
                            ['ambiente', 'finish', 'fabric', 'view1', 'view2', 'view3', 'view4'].forEach((k) => {
                                if (!lv.gallery[k] && cv.gallery[k]) lv.gallery[k] = cv.gallery[k];
                            });
                            if ((!lv.gallery.all_views || !lv.gallery.all_views.some(Boolean)) && Array.isArray(cv.gallery.all_views)) {
                                lv.gallery.all_views = cv.gallery.all_views.slice();
                            }
                        }
                    });
                }
                return cloned;
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

            let hasRecentLocalSync = false;
            try {
                const rawPing = localStorage.getItem('creata_live_sync_ping');
                if (rawPing) {
                    const parsedPing = JSON.parse(rawPing);
                    if (parsedPing && parsedPing.ts && (Date.now() - Number(parsedPing.ts) < 12000)) {
                        hasRecentLocalSync = true;
                    }
                }
            } catch (_) {}

            if (preferFreshLocal || hasRecentLocalSync || (!isCloudSource && localStorage.getItem('creata_catalog_v12_linked') === 'true')) {
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

            const baseCategories = [
                { id: 'flt-SALAS-SOF-S', label: 'SALAS & SOFÁS' },
                { id: 'flt-SILLAS-SILLONES', label: 'SILLAS & SILLONES' },
                { id: 'flt-COMEDORES', label: 'COMEDORES' },
                { id: 'flt-BUFETERAS-CREDENZAS', label: 'BUFETERAS & CREDENZAS' },
                { id: 'flt-MESAS-DE-CENTRO-LATERALES', label: 'MESAS DE CENTRO & LATERALES' },
                { id: 'flt-REC-MARAS', label: 'RECÁMARAS' },
                { id: 'flt-COMPLEMENTOS', label: 'COMPLEMENTOS' }
            ];

            setBtnText('flt-ALL', 'TODOS', activeProds.length);
            const knownSet = new Set(baseCategories.map(c => c.label));
            baseCategories.forEach(c => {
                setBtnText(c.id, c.label, activeProds.filter(p => p.category === c.label).length);
            });

            const bar = document.getElementById('categoryBar');
            if (bar) {
                const extraCats = [...new Set(activeProds.map(p => p.category).filter(c => c && !knownSet.has(c)))];
                extraCats.forEach(cat => {
                    const safeId = 'flt-dyn-' + cat.replace(/[^A-Z0-9]/gi, '-');
                    let btn = document.getElementById(safeId);
                    if (!btn) {
                        btn = document.createElement('button');
                        btn.id = safeId;
                        btn.className = 'pill-btn';
                        btn.setAttribute('data-cat', cat);
                        btn.onclick = () => setFilter(cat);
                        bar.appendChild(btn);
                    }
                    btn.innerText = `${cat} (${activeProds.filter(p => p.category === cat).length})`;
                });
            }
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
                            <div class="w-16 h-16 rounded-full bg-[#E8E4DE] border border-[#E1DBC5] flex items-center justify-center text-2xl mb-4">🔍</div>
                            <h3 class="text-lg font-bold text-[#252C32] mb-2">Sin coincidencias para "${safeQ}"</h3>
                            <p class="text-sm text-[#64748B] max-w-md mb-4">Prueba con otra palabra clave (modelo, categoría, tela, madera, material o medida).</p>
                            <button type="button" onclick="currentFilter='ALL'; clearPublicSearch();" class="px-5 py-2 rounded-full bg-[#A38251] hover:bg-[#8B6D42] text-white text-xs font-bold uppercase tracking-wider shadow transition">
                                Ver todos los muebles
                            </button>
                        </div>
                    `;
                } else {
                    grid.innerHTML = `
                        <div class="col-span-full py-20 text-center flex flex-col items-center justify-center">
                            <div class="w-16 h-16 rounded-full bg-[#E8E4DE] border border-[#E1DBC5] flex items-center justify-center text-3xl mb-4">🛋️</div>
                            <h3 class="text-xl font-bold text-[#252C32] mb-2">Próximamente nuevos modelos</h3>
                            <p class="text-sm text-[#64748B] max-w-md">Catálogo en actualización. Los nuevos productos y colecciones estarán disponibles muy pronto.</p>
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
                const bustFoto = (window.CreataCloud && window.CreataCloud.bustRepoFotoCache)
                    ? window.CreataCloud.bustRepoFotoCache
                    : (u => u || '');

                const resolveCleanCover = (variantObj) => {
                    if (!variantObj) return '';
                    const vg = variantObj.gallery || {};
                    const rawHero = isPhotoValid(variantObj.hero_b64) ? variantObj.hero_b64 : '';
                    const isSwatchHero = rawHero && (rawHero === variantObj.swatch_img || rawHero === vg.finish || /-finish-\d+\./i.test(rawHero));
                    if (rawHero && !isSwatchHero) return bustFoto(rawHero);
                    if (isPhotoValid(vg.view1)) return bustFoto(vg.view1);
                    if (Array.isArray(vg.all_views)) {
                        const firstV = vg.all_views.find(isPhotoValid);
                        if (firstV) return bustFoto(firstV);
                    }
                    if (isPhotoValid(vg.ambiente)) return bustFoto(vg.ambiente);
                    return '';
                };

                const swatchesHtml = (p.variants || []).map((vItem, vIdx) => {
                    const vg = vItem.gallery || {};
                    const swImg = vItem.swatch_img || vg.finish || vg.fabric || '';
                    const hasImg = isPhotoValid(swImg);
                    const bgStyle = hasImg
                        ? `background-image: url('${bustFoto(swImg)}'); background-size: cover; background-position: center;`
                        : `background-color: ${vItem.swatch_hex || '#A38251'};`;
                    const vCover = resolveCleanCover(vItem).replace(/'/g, "\\'");
                    const vScale = Number(vItem.hero_scale) || 1;
                    const vHp = (vItem.hero_pos && typeof vItem.hero_pos === 'object') ? vItem.hero_pos : { x: 0, y: 0 };
                    const vx = Number(vHp.x) || 0;
                    const vy = Number(vHp.y) || 0;
                    return `
                    <span onmouseenter="var img=document.getElementById('${imgId}'); if(img && '${vCover}'){img.src='${vCover}'; img.style.setProperty('--img-scale','${vScale}'); img.style.setProperty('--img-x','${vx}%'); img.style.setProperty('--img-y','${vy}%'); img.style.display='block';}"
                          onclick="event.stopPropagation(); openModal(${realIdx}, ${vIdx});" 
                          title="${(vItem.color_label || 'Opción').replace(/"/g, '&quot;')}" 
                          class="swatch-circle"
                          style="${bgStyle}"></span>
                    `;
                }).join('');

                const heroSrc = resolveCleanCover(v);
                const heroScale = Number(v && v.hero_scale) || 1;
                const heroPos = (v && v.hero_pos && typeof v.hero_pos === 'object') ? v.hero_pos : { x: 0, y: 0 };
                const heroX = Number(heroPos.x) || 0;
                const heroY = Number(heroPos.y) || 0;
                const hasHero = !!heroSrc;
                card.innerHTML = `
                    <div class="card-img-area">
                        <span class="badge-category">${p.category}</span>
                        ${hasHero ? `<img id="${imgId}" src="${heroSrc}" style="--img-scale: ${heroScale}; --img-x: ${heroX}%; --img-y: ${heroY}%;" alt="${p.model_name.replace(/"/g, '&quot;')}" loading="lazy" onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='flex';">` : ''}
                        <div class="flex flex-col items-center justify-center p-4 text-center select-none w-full h-full" style="min-height: 170px; ${hasHero ? 'display:none;' : ''}">
                            <div class="w-12 h-12 rounded-full bg-[#A38251]/10 flex items-center justify-center mb-2">
                                <svg class="w-6 h-6 text-[#A38251]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                            </div>
                            <span class="text-[10px] font-bold text-[#252C32] tracking-wider uppercase">${p.provider_abbr || 'CREATA'}</span>
                            <span class="text-[9px] text-[#A38251] font-semibold mt-1">📄 Ver Ficha Técnica</span>
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
        let __lightboxPhotos = [];
        let __lightboxIndex = 0;

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
            const bustFotoModal = (window.CreataCloud && window.CreataCloud.bustRepoFotoCache)
                ? window.CreataCloud.bustRepoFotoCache
                : (u => u || '');
            const g = v.gallery || {};
            const slotScales = (v && v.slot_scales && typeof v.slot_scales === 'object') ? v.slot_scales : {};
            const slotPos = (v && v.slot_pos && typeof v.slot_pos === 'object') ? v.slot_pos : {};

            // Función idéntica 1:1 a renderSlot de admin-modal.js
            const renderPublicSlot = (imgId, slotPrefix, src) => {
                const imgEl = document.getElementById(imgId);
                const slotBox = imgEl ? imgEl.closest('.gallery-slot') : null;
                const valid = isPhotoValid(src);
                const sc = Number(slotScales[slotPrefix]) || 1;
                const pos = (slotPos[slotPrefix] && typeof slotPos[slotPrefix] === 'object') ? slotPos[slotPrefix] : { x: 0, y: 0 };
                const px = Number(pos.x) || 0;
                const py = Number(pos.y) || 0;

                if (slotBox) {
                    slotBox.classList.toggle('has-photo', valid);
                    slotBox.style.display = valid ? 'flex' : 'none';
                }
                if (!imgEl) return;

                if (valid) {
                    const cleanSrc = String(src).trim();
                    const isCutoutFallback = slotPrefix === 'ambiente' && /-(hero|view[1-4])(?:-\d+)?\.(?:webp|png)$/i.test(cleanSrc);
                    const useCoverFit = slotPrefix === 'finish' || (slotPrefix === 'ambiente' && !isCutoutFallback);
                    imgEl.src = bustFotoModal(cleanSrc);
                    imgEl.style.display = 'block';
                    imgEl.style.opacity = '1';
                    imgEl.style.transition = '';
                    if (useCoverFit) {
                        imgEl.className = 'w-full h-full object-cover';
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
                        imgEl.className = 'w-full h-full object-contain';
                        imgEl.style.objectFit = 'contain';
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
                    if (slotPrefix === 'finish' || slotPrefix === 'ambiente') imgEl.style.objectFit = 'cover';
                }
            };

            // 1. Muestra de Acabado (idéntico al Editor)
            const rawFinish = (g.finish && String(g.finish).trim())
                || (Array.isArray(g.finishes) && g.finishes.length > 0 && g.finishes[0] ? String(g.finishes[0]).trim() : '')
                || (g.fabric && String(g.fabric).trim())
                || (v.swatch_img && String(v.swatch_img).trim())
                || '';
            const finishSrc = isPhotoValid(rawFinish) ? String(rawFinish).trim() : '';
            if (finishSrc && !v.swatch_img) v.swatch_img = finishSrc;
            renderPublicSlot('slotImgFinish', 'finish', finishSrc);

            // 2. Vistas 1 a 4 (slots 100% independientes en su posición exacta, sin corrimiento de índices)
            const getSlotView = (slotKey, idx) => {
                if (g[slotKey] && typeof g[slotKey] === 'string' && isPhotoValid(g[slotKey])) {
                    return g[slotKey].trim();
                }
                if (Array.isArray(g.all_views) && g.all_views.length > idx && isPhotoValid(g.all_views[idx])) {
                    return String(g.all_views[idx]).trim();
                }
                return '';
            };
            const view1Src = getSlotView('view1', 0);
            const view2Src = getSlotView('view2', 1);
            const view3Src = getSlotView('view3', 2);
            const view4Src = getSlotView('view4', 3);

            renderPublicSlot('slotImgView1', 'view1', view1Src);
            renderPublicSlot('slotImgView2', 'view2', view2Src);
            renderPublicSlot('slotImgView3', 'view3', view3Src);
            renderPublicSlot('slotImgView4', 'view4', view4Src);

            // 3. Ambiente (idéntico al Editor)
            const hasFurnitureViews = !!(view1Src || view2Src || view3Src || view4Src);
            const rawHero = isPhotoValid(v.hero_b64) ? String(v.hero_b64).trim() : '';
            const cleanHeroUrl = (rawHero && rawHero !== finishSrc && !/-finish-\d+\./i.test(rawHero)) ? rawHero : '';
            const ambUrl = isPhotoValid(g.ambiente)
                ? String(g.ambiente).trim()
                : (cleanHeroUrl || '');
            renderPublicSlot('slotImgAmbiente', 'ambiente', ambUrl);

            const hasAnyPhoto = !!(ambUrl || finishSrc || hasFurnitureViews);
            const galleryGrid = document.querySelector('.modal-gallery-grid');
            let placeholderBox = document.getElementById('modalNoPhotoPlaceholder');
            if (!placeholderBox && galleryGrid && galleryGrid.parentElement) {
                placeholderBox = document.createElement('div');
                placeholderBox.id = 'modalNoPhotoPlaceholder';
                placeholderBox.className = 'w-full h-full min-h-[380px] flex flex-col items-center justify-center p-8 text-center bg-[#FAF8F4] border border-[#E1DBC5] rounded-xl';
                galleryGrid.parentElement.appendChild(placeholderBox);
            }

            if (!hasAnyPhoto) {
                if (galleryGrid) galleryGrid.style.display = 'none';
                if (placeholderBox) {
                    placeholderBox.style.display = 'flex';
                    placeholderBox.innerHTML = `
                        <div class="w-20 h-20 rounded-full bg-[#A38251]/10 flex items-center justify-center mb-4 text-[#A38251]">
                            <svg class="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                        </div>
                        <span class="text-xs font-bold text-[#A38251] tracking-widest uppercase mb-1">${p.provider_abbr || 'CREATA'} · FICHA TÉCNICA</span>
                        <h3 class="text-base font-extrabold text-[#252C32] uppercase tracking-wide mb-6">${p.model_name}</h3>
                        <a href="${v.drive_ficha_url || p.drive_ficha_url || '#'}" target="_blank" class="px-6 py-3 bg-[#A38251] hover:bg-[#8B6D42] text-white text-xs font-bold uppercase tracking-wider rounded-lg shadow-md transition-all flex items-center gap-2">
                            <span>Abrir Ficha Técnica en Drive</span>
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
                        </a>
                    `;
                }
            } else {
                if (galleryGrid) galleryGrid.style.display = '';
                if (placeholderBox) placeholderBox.style.display = 'none';
            }

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
            const getVal = (vVal, pVal) => (vVal !== undefined && vVal !== null) ? vVal : (pVal || '');
            setSpecBox('mWidth', getVal(v.width, p.width));
            setSpecBox('mDepth', getVal(v.depth, p.depth));
            setSpecBox('mHeight', getVal(v.height, p.height));
            setSpecBox('mSeat', getVal(v.seat, p.seat));
            setSpecBox('mPackages', getVal(v.packages, p.packages));
            setSpecBox('mVolume', getVal(v.volume, p.volume));

            document.getElementById('mPrice').innerText = v.price || p.price || 'Consultar';
            if (window.CreataCloud && typeof window.CreataCloud.renderModulePricesBox === 'function') {
                window.CreataCloud.renderModulePricesBox('mModulePrices', p, false);
            }
            const matEl = document.getElementById('mMaterials');
            const matText = (getVal(v.materials, p.materials) || '').toString().trim();
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
                    const rawLbl = (window.CreataCloud && window.CreataCloud.cleanFinishLabel)
                        ? window.CreataCloud.cleanFinishLabel(vItem.color_label, p.model_name)
                        : (vItem.color_label || '');
                    const lbl = (rawLbl || 'NATURAL').toUpperCase();
                    const thumb = isPhotoValid(linkedImg)
                        ? `<span class="swatch-pill-dot" style="background-image: url('${bustFotoModal(linkedImg)}');"></span>`
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

            const driveBtn = document.getElementById('modalDriveBtn');
            if (driveBtn) {
                driveBtn.href = v.drive_ficha_url || p.drive_ficha_url || '#';
            }
        }

        function openPhotoLightbox(slotKey) {
            const slotOrder = [
                { key: 'ambiente', id: 'slotImgAmbiente' },
                { key: 'view1', id: 'slotImgView1' },
                { key: 'view2', id: 'slotImgView2' },
                { key: 'view3', id: 'slotImgView3' },
                { key: 'view4', id: 'slotImgView4' },
                { key: 'finish', id: 'slotImgFinish' }
            ];
            __lightboxPhotos = [];
            let clickedIdx = 0;
            slotOrder.forEach((item) => {
                const el = document.getElementById(item.id);
                const src = el && el.style.display !== 'none' ? el.getAttribute('src') : '';
                if (src && src.trim()) {
                    if (item.key === slotKey) clickedIdx = __lightboxPhotos.length;
                    __lightboxPhotos.push(src.trim());
                }
            });
            if (__lightboxPhotos.length === 0) return;
            __lightboxIndex = clickedIdx;
            const lbModal = document.getElementById('photoLightboxModal');
            const lbImg = document.getElementById('lightboxImgEl');
            const prevBtn = document.getElementById('lightboxPrevBtn');
            const nextBtn = document.getElementById('lightboxNextBtn');
            if (lbImg) lbImg.src = __lightboxPhotos[__lightboxIndex];
            if (prevBtn) prevBtn.style.display = __lightboxPhotos.length > 1 ? 'inline-flex' : 'none';
            if (nextBtn) nextBtn.style.display = __lightboxPhotos.length > 1 ? 'inline-flex' : 'none';
            if (lbModal) lbModal.classList.add('active');
        }

        function stepPhotoLightbox(dir) {
            if (!__lightboxPhotos || __lightboxPhotos.length <= 1) return;
            __lightboxIndex = (__lightboxIndex + dir + __lightboxPhotos.length) % __lightboxPhotos.length;
            const lbImg = document.getElementById('lightboxImgEl');
            if (lbImg) lbImg.src = __lightboxPhotos[__lightboxIndex];
        }

        function closePhotoLightbox() {
            const lbModal = document.getElementById('photoLightboxModal');
            if (lbModal) lbModal.classList.remove('active');
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
            const lbModal = document.getElementById('photoLightboxModal');
            if (lbModal && lbModal.classList.contains('active')) {
                if (e.key === 'Escape') closePhotoLightbox();
                else if (e.key === 'ArrowRight') stepPhotoLightbox(1);
                else if (e.key === 'ArrowLeft') stepPhotoLightbox(-1);
                return;
            }
            if (!document.getElementById('slideModal').classList.contains('active')) return;
            if (e.key === 'ArrowRight') nextProduct();
            if (e.key === 'ArrowLeft') prevProduct();
            if (e.key === 'Escape') closeModal();
        });
