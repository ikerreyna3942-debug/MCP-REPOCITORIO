    function skuKeySafe(s) {
        return cleanStr(s).toUpperCase();
    }

    function matchesLocationFilter(p, locKey) {
        const key = locKey || 'ALL';
        if (key === 'ALL') return true;
        if (!p) return false;
        if (key === 'QUOTABLE') {
            return (Number(p.totalBodegaPiso) || 0) >= 1 || (Number(p.lpptStock) || 0) >= 1;
        }
        const whMeta = FOTOS_WAREHOUSE_BY_KEY.get(key);
        if (!whMeta) return true;
        const st = Array.isArray(p.st) ? p.st : [];
        return (Number(st[whMeta.idx]) || 0) >= 1;
    }

    function renderSkuCategoryFilterRow() {
        const wrap = document.getElementById('skuCategoryFilterRow');
        if (!wrap) return;

        const countsByFolderId = new Map();
        const mode = state.skuFilterMode;
        const locKey = state.skuLocationFilter || 'ALL';
        for (let i = 0; i < state.products.length; i++) {
            const p = state.products[i];
            if (mode === 'NO_PHOTO' && p.photoUrl) continue;
            if (mode === 'HAS_PHOTO' && !p.photoUrl) continue;
            if (mode === 'IN_INV' && !p.inInv) continue;
            if (!matchesLocationFilter(p, locKey)) continue;
            const fid = p.destFolderId || CATEGORIAS_DEST_FOLDERS[9].id;
            countsByFolderId.set(fid, (countsByFolderId.get(fid) || 0) + 1);
        }

        const activeCatKey = state.skuCategoryFilter || 'ALL';
        const pills = [
            '<button type="button" class="cat-filter-pill' + (activeCatKey === 'ALL' ? ' active' : '') + '" data-cat-key="ALL" data-fotos-act="cat-filter">' +
                '<span>Todas</span>' +
            '</button>'
        ];
        for (let i = 0; i < CATEGORIAS_DEST_FOLDERS.length; i++) {
            const f = CATEGORIAS_DEST_FOLDERS[i];
            const cnt = countsByFolderId.get(f.id) || 0;
            const isAct = activeCatKey === f.key;
            pills.push(
                '<button type="button" class="cat-filter-pill' + (isAct ? ' active' : '') + '" data-cat-key="' + escapeHtml(f.key) + '" data-fotos-act="cat-filter">' +
                    '<span>' + escapeHtml(f.short || f.name.replace(/^FOTOS\s+(DE\s+)?/i, '')) + '</span>' +
                    '<span class="cat-cnt">' + cnt + '</span>' +
                '</button>'
            );
        }
        wrap.innerHTML = pills.join('');
        syncSkuExtraFiltersBadge();
    }

    function syncSkuExtraFiltersBadge() {
        const badge = document.getElementById('skuExtraFiltersBadge');
        if (!badge) return;
        let activeCount = 0;
        if (state.skuCategoryFilter && state.skuCategoryFilter !== 'ALL') activeCount++;
        if (state.skuLocationFilter && state.skuLocationFilter !== 'ALL') activeCount++;
        badge.textContent = String(activeCount);
        badge.classList.toggle('hidden', activeCount === 0);
    }

    function renderSkuLocationFilterRow() {
        const wrap = document.getElementById('skuLocationFilterRow');
        if (!wrap) return;

        const mode = state.skuFilterMode;
        const catFilterMeta = (state.skuCategoryFilter && state.skuCategoryFilter !== 'ALL')
            ? DEST_FOLDER_BY_KEY.get(state.skuCategoryFilter)
            : null;
        const requiredFolderId = catFilterMeta ? catFilterMeta.id : '';

        let quotableCount = 0;
        const countsByWh = new Array(FOTOS_WAREHOUSES.length).fill(0);

        for (let i = 0; i < state.products.length; i++) {
            const p = state.products[i];
            if (mode === 'NO_PHOTO' && p.photoUrl) continue;
            if (mode === 'HAS_PHOTO' && !p.photoUrl) continue;
            if (mode === 'IN_INV' && !p.inInv) continue;
            if (requiredFolderId && p.destFolderId !== requiredFolderId) continue;

            if ((Number(p.totalBodegaPiso) || 0) >= 1 || (Number(p.lpptStock) || 0) >= 1) {
                quotableCount++;
            }
            const st = Array.isArray(p.st) ? p.st : [];
            for (let w = 0; w < FOTOS_WAREHOUSES.length; w++) {
                if ((Number(st[w]) || 0) >= 1) countsByWh[w]++;
            }
        }

        const activeLocKey = state.skuLocationFilter || 'ALL';
        const pills = [
            '<button type="button" class="cat-filter-pill' + (activeLocKey === 'ALL' ? ' active' : '') + '" data-loc-key="ALL" data-fotos-act="loc-filter">' +
                '<span>Todas ubic.</span>' +
            '</button>',
            '<button type="button" class="cat-filter-pill' + (activeLocKey === 'QUOTABLE' ? ' active' : '') + '" data-loc-key="QUOTABLE" data-fotos-act="loc-filter" title="Visibles en Cotizador">' +
                '<span>En Cotizador</span>' +
                '<span class="cat-cnt">' + quotableCount + '</span>' +
            '</button>'
        ];

        for (let w = 0; w < FOTOS_WAREHOUSES.length; w++) {
            const wh = FOTOS_WAREHOUSES[w];
            const cnt = countsByWh[w] || 0;
            const isAct = activeLocKey === wh.key;
            pills.push(
                '<button type="button" class="cat-filter-pill' + (isAct ? ' active' : '') + '" data-loc-key="' + escapeHtml(wh.key) + '" data-fotos-act="loc-filter" title="' + escapeHtml(wh.label) + '">' +
                    '<span>' + escapeHtml(wh.short) + '</span>' +
                    '<span class="cat-cnt">' + cnt + '</span>' +
                '</button>'
            );
        }
        wrap.innerHTML = pills.join('');
        syncSkuExtraFiltersBadge();
    }

    window.setSkuCategoryFilter = function (catKey) {
        state.skuCategoryFilter = catKey || 'ALL';
        renderSkuCategoryFilterRow();
        renderSkuLocationFilterRow();
        if (state.skuCategoryFilter !== 'ALL') {
            const fMeta = DEST_FOLDER_BY_KEY.get(state.skuCategoryFilter);
            const destSel = document.getElementById('destFolderSelect');
            if (fMeta && destSel && !state.selectedSku) {
                destSel.value = fMeta.id;
            }
        }
        applySkuFiltersAndRender();
        if (state.galleryMode === 'LOADED') {
            renderInboxGallery();
        }
        saveFotosUiCheckpointNow();
        if (state.skuCategoryFilter !== 'ALL') {
            syncFotosBackNav('sku_category');
        }
    };

    window.setSkuLocationFilter = function (locKey) {
        state.skuLocationFilter = locKey || 'ALL';
        renderSkuLocationFilterRow();
        renderSkuCategoryFilterRow();
        applySkuFiltersAndRender();
        saveFotosUiCheckpointNow();
        if (state.skuLocationFilter !== 'ALL') {
            syncFotosBackNav('sku_location');
        }
    };

    window.clearSkuSearch = function (opts) {
        const inp = document.getElementById('skuSearchInput');
        const clr = document.getElementById('skuSearchClearBtn');
        if (inp) inp.value = '';
        if (clr) clr.classList.add('hidden');
        state.skuSearchQuery = '';
        applySkuFiltersAndRender();
        saveFotosUiCheckpointNow();
        if (inp) {
            if (opts && opts.focus === false) {
                if (typeof inp.blur === 'function') inp.blur();
            } else {
                if (typeof inp.focus === 'function') inp.focus();
            }
        }
    };

    window.setSkuFilterMode = function (mode) {
        state.skuFilterMode = mode || 'ALL';
        document.querySelectorAll('.filter-pill[data-filter]').forEach((b) => {
            b.classList.toggle('active', b.getAttribute('data-filter') === state.skuFilterMode);
        });
        renderSkuCategoryFilterRow();
        renderSkuLocationFilterRow();
        applySkuFiltersAndRender();
        saveFotosUiCheckpointNow();
        if (state.skuFilterMode !== 'ALL') {
            syncFotosBackNav('sku_filter');
        }
    };

    function applySkuFiltersAndRender() {
        const q = normalizeSearchText(state.skuSearchQuery);
        const tokens = q ? q.split(' ').filter(Boolean) : [];
        const mode = state.skuFilterMode;
        const locKey = state.skuLocationFilter || 'ALL';
        const catFilterMeta = (state.skuCategoryFilter && state.skuCategoryFilter !== 'ALL')
            ? DEST_FOLDER_BY_KEY.get(state.skuCategoryFilter)
            : null;
        const requiredFolderId = catFilterMeta ? catFilterMeta.id : '';

        const matches = [];
        const products = state.products;
        const len = products.length;
        const tLen = tokens.length;

        for (let i = 0; i < len; i++) {
            const p = products[i];
            if (mode === 'NO_PHOTO' && p.photoUrl) continue;
            if (mode === 'HAS_PHOTO' && !p.photoUrl) continue;
            if (mode === 'IN_INV' && !p.inInv) continue;
            if (requiredFolderId && p.destFolderId !== requiredFolderId) continue;
            if (!matchesLocationFilter(p, locKey)) continue;

            if (tLen > 0) {
                let ok = true;
                const paddedWords = ' ' + p.searchNorm.replace(/[^a-z0-9]+/g, ' ') + ' ';
                for (let t = 0; t < tLen; t++) {
                    const tok = tokens[t];
                    if (tok === 'silla' || tok === 'sillas') {
                        if (paddedWords.indexOf(' silla ') === -1 && paddedWords.indexOf(' sillas ') === -1) {
                            ok = false;
                            break;
                        }
                    } else if (tok === 'sillon' || tok === 'sillones') {
                        if (paddedWords.indexOf(' sillon ') === -1 && paddedWords.indexOf(' sillones ') === -1) {
                            ok = false;
                            break;
                        }
                    } else if (p.searchNorm.indexOf(tok) === -1) {
                        ok = false;
                        break;
                    }
                }
                if (!ok) continue;
            }
            matches.push(p);
        }

        if (q) {
            matches.sort((a, b) => {
                const aExact = a.searchSkuNorm === q ? 0 : (a.searchSkuNorm.indexOf(q) === 0 ? 1 : (a.searchNameNorm.indexOf(q) === 0 ? 2 : 3));
                const bExact = b.searchSkuNorm === q ? 0 : (b.searchSkuNorm.indexOf(q) === 0 ? 1 : (b.searchNameNorm.indexOf(q) === 0 ? 2 : 3));
                if (aExact !== bExact) return aExact - bExact;
                const aQuot = (a.totalBodegaPiso > 0 || a.lpptStock > 0) ? 1 : 0;
                const bQuot = (b.totalBodegaPiso > 0 || b.lpptStock > 0) ? 1 : 0;
                if (aQuot !== bQuot) return bQuot - aQuot;
                if (a.inInv !== b.inInv) return a.inInv ? -1 : 1;
                return a.sku.localeCompare(b.sku, 'es');
            });
        }

        state.filteredProducts = matches;
        renderSkuResultsList();
    }

    function renderSkuResultsList() {
        const listEl = document.getElementById('skuResultsList');
        const badgeEl = document.getElementById('skuListCountBadge');
        if (!listEl) return;

        const totalMatches = state.filteredProducts.length;
        if (badgeEl) badgeEl.textContent = totalMatches.toLocaleString('es-MX');

        const slice = state.filteredProducts.slice(0, 120);
        if (!slice.length) {
            const rawTyped = cleanStr(state.skuSearchQuery).toUpperCase().replace(/\s+/g, '');
            const looksLikeSku = /^[A-Z0-9_-]{3,28}$/.test(rawTyped);
            listEl.innerHTML =
                '<div class="photo-empty-placeholder" style="display:flex;flex-direction:column;gap:8px;padding:18px 12px;">' +
                    '<span>Sin resultados</span>' +
                    (rawTyped.length >= 3
                        ? ('<button type="button" class="hdr-btn is-accent is-compact-btn" data-fotos-act="sync-sku" data-raw="' + escapeHtml(rawTyped) + '">↻ ERP "' + escapeHtml(rawTyped) + '"</button>')
                        : '') +
                    (looksLikeSku
                        ? ('<button type="button" class="hdr-btn is-neutral is-compact-btn" data-fotos-act="manual-sku" data-raw="' + escapeHtml(rawTyped) + '">+ SKU "' + escapeHtml(rawTyped) + '"</button>')
                        : '') +
                '</div>';
            return;
        }

        const selSku = state.selectedSku;
        const htmlParts = new Array(slice.length);
        for (let i = 0; i < slice.length; i++) {
            const p = slice[i];
            const isSel = p.sku === selSku;
            const fid = p.photoFileId || '';
            const safeDriveFid = isLocalTempPhotoId(fid) ? '' : fid;
            const thumb = p.photoUrl ? buildPhotoThumbUrl(safeDriveFid || p.photoUrl, 160) : '';
            const destMeta = DEST_FOLDER_BY_ID.get(p.destFolderId);
            const catShort = destMeta ? (destMeta.short || destMeta.name.replace(/^FOTOS\s+(DE\s+)?/i, '')) : (p.destFolderName || '').replace(/^FOTOS\s+(DE\s+)?/i, '');
            const bodPiso = Number(p.totalBodegaPiso) || 0;
            const lpptQ = Number(p.lpptStock) || 0;
            let stockBadgeHtml = '';
            if (bodPiso > 0) {
                stockBadgeHtml = '<span class="sku-stock-badge in-stock" title="Stock Bodega/Piso">Stock ' + bodPiso + (lpptQ > 0 ? (' + LPPT ' + lpptQ) : '') + '</span>';
            } else if (lpptQ > 0) {
                stockBadgeHtml = '<span class="sku-stock-badge in-lppt" title="Entrantes LPPT">LPPT ' + lpptQ + '</span>';
            } else if (p.hasStocksLoaded && p.inInv) {
                stockBadgeHtml = '<span class="sku-stock-badge zero-stock">0 pz</span>';
            }

            const subParts = [];
            if (p.modelo) subParts.push(p.modelo);
            if (p.variante && p.variante !== 'ESTÁNDAR' && normPlainCat(p.variante) !== normPlainCat(p.modelo)) subParts.push(p.variante);
            if (p.medidas) subParts.push(p.medidas);
            if (p.locSummary) subParts.push(p.locSummary);

            htmlParts[i] =
                '<div class="sku-item' + (isSel ? ' selected' : '') + '" data-sku="' + escapeHtml(p.sku) + '" data-fotos-act="select-sku">' +
                    '<div class="sku-mini-thumb">' +
                        (thumb
                            ? ('<img width="44" height="44" src="' + escapeHtml(thumb) + '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-drive-id="' + escapeHtml(safeDriveFid) + '" onerror="handlePhotoImgError(this)">')
                            : '<span>—</span>') +
                    '</div>' +
                    '<div class="sku-item-info">' +
                        '<div class="sku-code-row">' +
                            '<span class="sku-code">' + escapeHtml(p.sku) + '</span>' +
                            '<span class="sku-status-badge ' + (p.photoUrl ? 'has-photo' : 'no-photo') + '">' +
                                (p.photoUrl ? 'Foto' : 'Sin foto') +
                            '</span>' +
                            (catShort ? ('<span class="sku-cat-chip">' + escapeHtml(catShort) + '</span>') : '') +
                            stockBadgeHtml +
                            (p.photoUrl
                                ? ('<span class="sku-quick-actions">' +
                                    '<button type="button" class="sku-quick-btn is-take" data-fotos-act="take-sku-row" data-sku="' + escapeHtml(p.sku) + '">Tomar</button>' +
                                    '<button type="button" class="sku-quick-btn is-del" data-fotos-act="del-loaded-sku" data-sku="' + escapeHtml(p.sku) + '" data-fid="' + escapeHtml(fid) + '">🗑</button>' +
                                   '</span>')
                                : '') +
                        '</div>' +
                        '<div class="sku-name">' + escapeHtml(p.displayName) + '</div>' +
                        (subParts.length ? ('<div class="sku-submeta">' + escapeHtml(subParts.join(' · ')) + '</div>') : '') +
                    '</div>' +
                '</div>';
        }
        const prevScrollTop = Number(listEl.scrollTop) || 0;
        listEl.innerHTML = htmlParts.join('');
        if (prevScrollTop > 0) listEl.scrollTop = prevScrollTop;
    }

    function updateSkuListSelectionInDom(prevSku, nextSku) {
        const listEl = document.getElementById('skuResultsList');
        if (!listEl) return;
        const items = listEl.querySelectorAll('.sku-item');
        for (let i = 0; i < items.length; i++) {
            const el = items[i];
            const sk = el.getAttribute('data-sku');
            if (sk === prevSku && sk !== nextSku) el.classList.remove('selected');
            else if (sk === nextSku) el.classList.add('selected');
        }
    }

    window.selectSkuProduct = function (skuRaw, opts) {
        const sku = cleanStr(skuRaw).toUpperCase();
        const prod = state.productBySku.get(sku);
        if (!prod) return;

        const prevSku = state.selectedSku;
        state.selectedSku = sku;
        hideAssignFeedback();

        const destSel = document.getElementById('destFolderSelect');
        if (destSel && prod.destFolderId) destSel.value = prod.destFolderId;

        updateSkuListSelectionInDom(prevSku, sku);
        renderSelectedProductStage();
        updateAssignButtonState();
        saveFotosUiCheckpointNow();
        if (!(opts && opts.skipBackSync)) {
            syncFotosBackNav('selected_sku');
        }
        if (!(opts && opts.fromPeerSync) && !_fotosRestoringCheckpoint) {
            const isEmbedded = !!(window.parent && window.parent !== window);
            if (_fotosSplitActive || isEmbedded) {
                notifySplitPeerOfSkuSelect(sku, false);
            }
        }
    };

    window.clearSelectedSku = function () {
        if (!state.selectedSku) return;
        const prevSku = state.selectedSku;
        state.selectedSku = '';
        updateSkuListSelectionInDom(prevSku, '');
        hideAssignFeedback();
        renderSelectedProductStage();
        updateAssignButtonState();
        saveFotosUiCheckpointNow();
    };

    function getActiveSelectedPhotoObject() {
        if (state.selectedPhotoItem && state.selectedPhotoItem.id) {
            return state.selectedPhotoItem;
        }
        if (state.selectedInboxFileId) {
            const f = state.inboxFiles.find((it) => it.id === state.selectedInboxFileId);
            if (f) {
                return {
                    id: f.id,
                    name: f.name,
                    viewUrl: f.viewUrl || ('https://drive.google.com/file/d/' + f.id + '/view?usp=sharing'),
                    thumbDataUrl: f.thumbDataUrl || '',
                    localDataUrl: f.localDataUrl || '',
                    fromLoaded: false,
                    skuOrigin: ''
                };
            }
        }
        return null;
    }

    function renderSelectedProductStage() {
        const prod = state.selectedSku ? state.productBySku.get(state.selectedSku) : null;
        const rowBadge = document.getElementById('selectedRowBadge');
        const btnOpenCotizador = document.getElementById('btnOpenInCotizadorStage');
        const btnClearSku = document.getElementById('btnClearSelectedSku');
        const autoDestPill = document.getElementById('autoDestFolderPill');
        const linkedFabricChip = document.getElementById('skuLinkedFabricChip');
        const colASku = document.getElementById('selColASku');
        const colBName = document.getElementById('selColBName');
        const catLabel = document.getElementById('selCategoryLabel');
        const moVarVal = document.getElementById('selModelVariantVal');
        const dimsFinVal = document.getElementById('selDimsFinishVal');
        const locWrap = document.getElementById('selLocationsWrap');
        const locSummaryBadge = document.getElementById('selLocationsSummaryBadge');
        const locGrid = document.getElementById('selLocationsGrid');
        const sibWrap = document.getElementById('selSiblingVariantsWrap');
        const sibList = document.getElementById('selSiblingVariantsList');

        const curOpenLink = document.getElementById('curPhotoOpenLink');
        const curTakeBtn = document.getElementById('curPhotoTakeBtn');
        const curDeleteBtn = document.getElementById('curPhotoDeleteBtn');
        const curCanvas = document.getElementById('curPhotoCanvas');
        const quickNameEl = document.getElementById('skuQuickName');
        const quickSkuEl = document.getElementById('skuQuickSku');
        const quickCatEl = document.getElementById('skuQuickCat');

        if (!prod) {
            if (rowBadge) rowBadge.textContent = '—';
            if (btnOpenCotizador) btnOpenCotizador.classList.add('hidden');
            if (btnClearSku) btnClearSku.classList.add('hidden');
            if (autoDestPill) autoDestPill.textContent = '📁 Auto';
            if (linkedFabricChip) {
                linkedFabricChip.classList.add('hidden');
                linkedFabricChip.innerHTML = '';
            }
            if (colASku) colASku.textContent = '—';
            if (colBName) colBName.textContent = '—';
            if (catLabel) catLabel.textContent = '—';
            if (quickNameEl) quickNameEl.textContent = 'Elige un SKU';
            if (quickSkuEl) quickSkuEl.textContent = '—';
            if (quickCatEl) quickCatEl.textContent = '—';
            if (moVarVal) moVarVal.textContent = '—';
            if (dimsFinVal) dimsFinVal.textContent = '—';
            if (locWrap) locWrap.classList.add('hidden');
            if (locGrid) locGrid.innerHTML = '';
            if (sibWrap) sibWrap.classList.add('hidden');
            if (sibList) sibList.innerHTML = '';
            if (curOpenLink) curOpenLink.classList.add('hidden');
            if (curTakeBtn) curTakeBtn.classList.add('hidden');
            if (curDeleteBtn) curDeleteBtn.classList.add('hidden');
            if (curCanvas) curCanvas.innerHTML = '<div class="photo-empty-placeholder">Sin foto</div>';
            renderNewPhotoStage();
            return;
        }

        if (btnOpenCotizador) btnOpenCotizador.classList.remove('hidden');
        if (btnClearSku) btnClearSku.classList.remove('hidden');
        if (rowBadge) {
            rowBadge.textContent = prod.inSheet1 ? (prod.rowNumber ? ('Fila ' + prod.rowNumber) : 'Hoja 1') : 'Nuevo';
        }
        const autoDestMeta = resolveCategoryDestFolderForProduct(prod.categoria, prod.tipo, prod.displayName);
        prod.destFolderId = autoDestMeta.id;
        prod.destFolderName = autoDestMeta.name;
        const destSel = document.getElementById('destFolderSelect');
        if (destSel && prod.destFolderId) destSel.value = prod.destFolderId;

        const shortCatName = prod.destFolderName.replace(/^FOTOS\s+(DE\s+)?/i, '');
        if (autoDestPill) autoDestPill.textContent = '📁 Auto: ' + shortCatName;
        if (colASku) colASku.textContent = prod.sku;
        if (colBName) colBName.textContent = prod.colBName || prod.displayName;
        if (catLabel) catLabel.textContent = shortCatName;
        if (quickNameEl) quickNameEl.textContent = prod.colBName || prod.displayName || prod.sku;
        if (quickSkuEl) quickSkuEl.textContent = prod.sku;
        if (quickCatEl) quickCatEl.textContent = shortCatName;

        if (linkedFabricChip) {
            const matchedFab = (typeof findMatchingUploadedFabricForProduct === 'function')
                ? findMatchingUploadedFabricForProduct(prod)
                : null;
            const matchedWood = (!matchedFab && typeof findMatchingUploadedWoodForProduct === 'function')
                ? findMatchingUploadedWoodForProduct(prod)
                : null;
            const matchedSwatch = (matchedFab && matchedFab.url)
                ? { label: matchedFab.label, url: matchedFab.url, prefix: '🧵 Tela: ' }
                : ((matchedWood && matchedWood.url) ? { label: matchedWood.label, url: matchedWood.url, prefix: '🪵 Madera: ' } : null);
            if (matchedSwatch) {
                const swThumb = resolveVisualThumbSrcInFotos(matchedSwatch.url, 140);
                const swFull = resolveVisualThumbSrcInFotos(matchedSwatch.url, 900);
                const swFid = extractDriveFileId(matchedSwatch.url);
                linkedFabricChip.innerHTML =
                    '<img width="22" height="22" loading="lazy" decoding="async" src="' + escapeHtml(swThumb) + '" alt="' + escapeHtml(matchedSwatch.label) + '" referrerpolicy="no-referrer" ' +
                    'data-drive-id="' + escapeHtml(swFid) + '" onerror="handlePhotoImgError(this)">' +
                    '<span>' + matchedSwatch.prefix + escapeHtml(matchedSwatch.label) + '</span>';
                linkedFabricChip.onclick = function () { openPhotoLightbox(swFull); };
                linkedFabricChip.classList.remove('hidden');
            } else {
                linkedFabricChip.classList.add('hidden');
                linkedFabricChip.innerHTML = '';
                linkedFabricChip.onclick = null;
            }
        }

        if (moVarVal) {
            const mvParts = [];
            if (prod.modelo) mvParts.push(prod.modelo);
            if (prod.variante && prod.variante !== 'ESTÁNDAR' && normPlainCat(prod.variante) !== normPlainCat(prod.modelo)) {
                mvParts.push(prod.variante);
            } else if (!mvParts.length && prod.tipo) {
                mvParts.push(prod.tipo);
            }
            moVarVal.textContent = mvParts.length ? mvParts.join(' · ') : (prod.tipo || 'Estándar');
        }

        if (dimsFinVal) {
            const dfParts = [];
            if (prod.medidas) dfParts.push(prod.medidas);
            if (prod.acabado) dfParts.push(prod.acabado);
            dimsFinVal.textContent = dfParts.length ? dfParts.join(' · ') : (prod.categoria || '—');
        }

        // Renderizar las 11 ubicaciones oficiales (LPPT + 10 posiciones Bodega/Piso)
        if (locWrap && locGrid) {
            const st = Array.isArray(prod.st) ? prod.st : emptyFotosStocks();
            const bodPiso = Number(prod.totalBodegaPiso) || 0;
            const lpptQ = Number(prod.lpptStock) || 0;
            const summaryParts = ['Bodega/Piso: ' + bodPiso];
            if (lpptQ > 0) summaryParts.push('LPPT: ' + lpptQ);
            if (prod.precio) summaryParts.push(prod.precio);
            if (locSummaryBadge) locSummaryBadge.textContent = summaryParts.join(' · ');

            const chipsHtml = [];
            for (let w = 0; w < FOTOS_WAREHOUSES.length; w++) {
                const wh = FOTOS_WAREHOUSES[w];
                const qty = Math.max(0, Number(st[w]) || 0);
                const semClass = qty <= 0 ? 'sem-red' : (qty <= 2 ? 'sem-yellow' : 'sem-green');
                const lpptClass = wh.isLppt ? ' is-lppt' : '';
                const labelText = (wh.isLppt && qty > 0)
                    ? ('LPPT: ' + qty + (prod.fe ? (' · ' + prod.fe) : ''))
                    : (wh.short || wh.label);
                chipsHtml.push(
                    '<div class="loc-stock-chip ' + semClass + lpptClass + '" title="' + escapeHtml(wh.label) + '">' +
                        '<span class="loc-stock-lbl"><span class="loc-stock-dot"></span><span>' + escapeHtml(labelText) + '</span></span>' +
                        '<span class="loc-stock-val">' + qty + '</span>' +
                    '</div>'
                );
            }
            locGrid.innerHTML = chipsHtml.join('');
            locWrap.classList.remove('hidden');
        }

        if (sibWrap && sibList) {
            const gk = prod._groupKey || buildProductGroupKey(prod);
            const sibs = (gk && state.siblingsByGroupKey.get(gk)) || [];
            if (sibs.length > 1) {
                sibList.innerHTML = sibs.slice(0, 24).map((sItem) => {
                    const isAct = sItem.sku === prod.sku;
                    const vLabel = (sItem.variante && sItem.variante !== 'ESTÁNDAR' && normPlainCat(sItem.variante) !== normPlainCat(sItem.modelo))
                        ? sItem.variante
                        : (sItem.acabado || sItem.medidas || sItem.sku);
                    return '<button type="button" class="sib-var-pill' + (isAct ? ' active' : '') + '" data-fotos-act="select-sku" data-sku="' + escapeHtml(sItem.sku) + '" title="' + escapeHtml(sItem.sku + ' · ' + sItem.displayName) + '">' +
                        '<span class="sib-var-dot' + (sItem.photoUrl ? ' has-photo' : '') + '"></span>' +
                        '<span>' + escapeHtml(sItem.sku) + ' · ' + escapeHtml(vLabel.slice(0, 26)) + '</span>' +
                    '</button>';
                }).join('');
                sibWrap.classList.remove('hidden');
            } else {
                sibWrap.classList.add('hidden');
                sibList.innerHTML = '';
            }
        }

        const savedSession = state.sessionSavedBySku.get(prod.sku) || null;
        const curStageTitle = curCanvas && curCanvas.parentElement
            ? curCanvas.parentElement.querySelector('.photo-stage-title')
            : null;

        const hasSelPhoto = !!getActiveSelectedPhotoObject();
        const showBeforeVsLoaded = savedSession && !hasSelPhoto;
        const leftUrl = showBeforeVsLoaded ? (savedSession.previousUrl || '') : prod.photoUrl;

        if (curStageTitle) {
            curStageTitle.textContent = showBeforeVsLoaded ? 'Anterior' : 'Actual';
        }

        if (leftUrl) {
            const fid = extractDriveFileId(leftUrl);
            const previewSrc = (!showBeforeVsLoaded && savedSession && savedSession.localDataUrl)
                ? savedSession.localDataUrl
                : buildPhotoThumbUrl(fid || leftUrl, 900);
            if (curOpenLink) {
                curOpenLink.href = leftUrl;
                curOpenLink.classList.remove('hidden');
            }
            if (curTakeBtn) curTakeBtn.classList.remove('hidden');
            if (curDeleteBtn) curDeleteBtn.classList.remove('hidden');
            if (curCanvas) {
                curCanvas.innerHTML =
                    '<img width="360" height="270" src="' + escapeHtml(previewSrc) + '" alt="' + escapeHtml(prod.sku) + '" decoding="async" fetchpriority="high" style="width:auto;height:auto;" referrerpolicy="no-referrer" ' +
                    'data-drive-id="' + escapeHtml(fid) + '" ' +
                    'data-fotos-act="lightbox" data-lightbox-src="' + escapeHtml(previewSrc) + '" ' +
                    'onerror="handlePhotoImgError(this)">';
            }
        } else {
            if (curOpenLink) curOpenLink.classList.add('hidden');
            if (curTakeBtn) curTakeBtn.classList.add('hidden');
            if (curDeleteBtn) curDeleteBtn.classList.add('hidden');
            if (curCanvas) {
                curCanvas.innerHTML = '<div class="photo-empty-placeholder">Sin foto</div>';
            }
        }

        renderNewPhotoStage();
    }

    function renderNewPhotoStage() {
        const stageCard = document.getElementById('newPhotoStageCard');
        const stageTitle = document.getElementById('newPhotoStageTitle');
        const clearBtn = document.getElementById('clearSelectedInboxBtn');
        const delBtn = document.getElementById('deleteSelectedPhotoBtn');
        const canvas = document.getElementById('newPhotoCanvas');
        const footWrap = document.getElementById('newPhotoFootWrap');
        const footText = document.getElementById('newPhotoFileText');
        if (!canvas || !stageCard) return;

        const selPhoto = getActiveSelectedPhotoObject();
        const savedSession = (!selPhoto && state.selectedSku)
            ? (state.sessionSavedBySku.get(state.selectedSku) || null)
            : null;

        stageCard.classList.remove('is-new-selected', 'is-just-saved');

        if (selPhoto) {
            stageCard.classList.add('is-new-selected');
            if (stageTitle) {
                stageTitle.textContent = selPhoto.fromLoaded
                    ? ('Tomada (' + (selPhoto.skuOrigin || 'Cargada') + ')')
                    : 'SUBIR PREN';
            }
            if (clearBtn) clearBtn.classList.remove('hidden');
            if (delBtn) delBtn.classList.remove('hidden');
            const safeSelFid = isLocalTempPhotoId(selPhoto.id) ? '' : cleanStr(selPhoto.id);
            const previewUrl = selPhoto.localDataUrl || selPhoto.thumbDataUrl || buildPhotoThumbUrl(safeSelFid || selPhoto.viewUrl, 900);
            canvas.innerHTML =
                '<img width="360" height="270" src="' + escapeHtml(previewUrl) + '" alt="' + escapeHtml(selPhoto.name) + '" decoding="async" fetchpriority="high" style="width:auto;height:auto;" referrerpolicy="no-referrer" ' +
                'data-drive-id="' + escapeHtml(safeSelFid) + '" ' +
                'data-fotos-act="lightbox" data-lightbox-src="' + escapeHtml(previewUrl) + '" ' +
                'onerror="handlePhotoImgError(this)">';
            if (footWrap) footWrap.classList.remove('hidden');
            if (footText) footText.textContent = selPhoto.name;
            return;
        }

        if (savedSession) {
            stageCard.classList.add('is-just-saved');
            if (stageTitle) stageTitle.textContent = savedSession.rowNumber ? ('✅ Fila ' + savedSession.rowNumber) : '✅ Guardada';
            if (clearBtn) clearBtn.classList.add('hidden');
            if (delBtn) delBtn.classList.remove('hidden');
            const rawSavedFid = cleanStr(savedSession.fileId);
            const safeSavedFid = isLocalTempPhotoId(rawSavedFid) ? '' : (rawSavedFid || extractDriveFileId(savedSession.newUrl));
            const savedPreview = savedSession.localDataUrl || buildPhotoThumbUrl(safeSavedFid || savedSession.newUrl, 900);
            canvas.innerHTML =
                '<img width="360" height="270" src="' + escapeHtml(savedPreview) + '" alt="' + escapeHtml(savedSession.sku) + '" decoding="async" fetchpriority="high" style="width:auto;height:auto;" referrerpolicy="no-referrer" ' +
                'data-drive-id="' + escapeHtml(safeSavedFid) + '" ' +
                'data-fotos-act="lightbox" data-lightbox-src="' + escapeHtml(savedPreview) + '" ' +
                'onerror="handlePhotoImgError(this)">';
            if (footWrap) footWrap.classList.remove('hidden');
            if (footText) {
                const safeLinkHref = /^https?:\/\//i.test(cleanStr(savedSession.newUrl))
                    ? (' · <a href="' + escapeHtml(savedSession.newUrl) + '" target="_blank" rel="noopener" style="color:#6EE7B7;font-weight:800;">↗</a>')
                    : ' · Pendiente';
                footText.innerHTML = escapeHtml(savedSession.fileName || savedSession.destFolderName) + safeLinkHref;
            }
            return;
        }

        if (stageTitle) stageTitle.textContent = 'Nueva';
        if (clearBtn) clearBtn.classList.add('hidden');
        if (delBtn) delBtn.classList.add('hidden');
        if (footWrap) footWrap.classList.add('hidden');
        canvas.innerHTML = '<div class="photo-empty-placeholder">Sube o arrastra</div>';
    }

    function updateAssignButtonState() {
        const btn = document.getElementById('btnAssignPhotoNow');
        const selPhoto = getActiveSelectedPhotoObject();
        const isSkuMode = (typeof visualState === 'undefined' || !visualState || visualState.workMode === 'SKU');
        const canAssign = !!(state.selectedSku && selPhoto);
        if (btn) {
            btn.disabled = !canAssign;
            btn.textContent = 'Guardar';
        }
        const quickBar = document.getElementById('mobileQuickSaveBar');
        const quickSku = document.getElementById('mobileQuickSaveSku');
        const quickBtn = document.getElementById('btnMobileQuickSaveNow');
        const showQuick = isSkuMode && canAssign && !_fotosSplitActive;
        if (quickBar) quickBar.classList.toggle('hidden', !showQuick);
        if (quickSku) quickSku.textContent = state.selectedSku || '—';
        if (quickBtn) quickBtn.disabled = !canAssign;
        if (document.body && document.body.classList) {
            document.body.classList.toggle('has-mobile-quick-save', showQuick);
        }
        if (typeof syncVisualStageSelectedGalleryPreview === 'function') {
            syncVisualStageSelectedGalleryPreview();
        }
    }

    function showAssignFeedback(msgHtml, isOk) {
        const box = document.getElementById('assignFeedbackBox');
        if (!box) return;
        box.innerHTML = msgHtml;
        box.className = 'assign-feedback-banner ' + (isOk ? 'ok' : 'err');
    }

    function hideAssignFeedback() {
        const box = document.getElementById('assignFeedbackBox');
        if (!box) return;
        box.innerHTML = '';
        box.className = 'assign-feedback-banner hidden';
    }

    window.setGalleryMode = function (mode) {
        state.galleryMode = mode === 'LOADED' ? 'LOADED' : 'INBOX';
        const tabInbox = document.getElementById('tabGalleryInbox');
        const tabLoaded = document.getElementById('tabGalleryLoaded');
        if (tabInbox) tabInbox.classList.toggle('active', state.galleryMode === 'INBOX');
        if (tabLoaded) tabLoaded.classList.toggle('active', state.galleryMode === 'LOADED');
        renderInboxGallery();
        saveFotosUiCheckpointNow();
        if (state.galleryMode === 'LOADED') {
            syncFotosBackNav('gallery_mode');
        }
    };

    window.clearInboxSearch = function (opts) {
        const inp = document.getElementById('inboxSearchInput');
        const clr = document.getElementById('inboxSearchClearBtn');
        if (inp) inp.value = '';
        if (clr) clr.classList.add('hidden');
        state.inboxSearchQuery = '';
        renderInboxGallery();
        saveFotosUiCheckpointNow();
        if (inp) {
            if (opts && opts.focus === false) {
                if (typeof inp.blur === 'function') inp.blur();
            } else if (opts && opts.focus === true) {
                if (typeof inp.focus === 'function') inp.focus();
            }
        }
    };

    window.refreshInboxOnly = async function (manualRefresh, opts) {
        if (state.inboxLoading) return;
        const forceRefresh = Boolean(manualRefresh || (opts && opts.forceRefresh));
        const isSilent = !!(opts && opts.silent) && !forceRefresh;
        if (isSilent && Date.now() < _inboxRateLimitBackoffUntilMs) {
            setFotosLiveStatus('syncing', 'Sincronizando...');
            return;
        }
        state.inboxLoading = true;
        const btnInb = document.getElementById('btnRefreshInbox');
        if (!isSilent && btnInb) { btnInb.disabled = true; btnInb.textContent = '↻...'; }
        const container = document.getElementById('inboxGalleryContainer');
        if (!isSilent && container && !state.inboxFiles.length && state.galleryMode === 'INBOX') {
            container.innerHTML = '<div class="photo-empty-placeholder" style="grid-column:1/-1;">Cargando...</div>';
        }

        const loadedCountKnown = Object.keys(state.loadedFileNamesById || {}).length;
        const needLoadedNames = Boolean(forceRefresh || loadedCountKnown === 0 || !state.inboxRev || _backendSupportsInboxRev);
        const inboxTimeoutMs = 75000;
        let res = null;
        try {
            const listPayload = Object.assign({
                deviceId: getFotosPresenceDeviceId(),
                sinceRev: forceRefresh ? '' : cleanStr(state.inboxRev),
                includeDocuments: true,
                includeLoadedNames: needLoadedNames,
                forceRefresh: forceRefresh
            }, buildOwnerAuthPayload());
            res = await callWebAppPost('fotos_subir_list', listPayload, inboxTimeoutMs);
            if ((!res || res.unavailable) && !isSilent && (typeof navigator === 'undefined' || navigator.onLine !== false)) {
                const retryPayload = Object.assign({
                    deviceId: getFotosPresenceDeviceId(),
                    sinceRev: '',
                    includeDocuments: true,
                    includeLoadedNames: false,
                    forceRefresh: forceRefresh
                }, buildOwnerAuthPayload());
                res = await callWebAppPost('fotos_subir_list', retryPayload, inboxTimeoutMs);
            }
        } finally {
            state.inboxLoading = false;
            if (!isSilent && btnInb) { btnInb.disabled = false; btnInb.textContent = '↻'; }
        }

        if (res && res.rateLimited) {
            _inboxRateLimitBackoffUntilMs = Math.max(_inboxRateLimitBackoffUntilMs, Date.now() + RATE_LIMIT_BACKOFF_MS);
            setFotosLiveStatus('syncing', 'Sincronizando...');
            return;
        }

        if (res && res.ok && res.unchanged === true) {
            _inboxConsecutiveSyncFails = 0;
            _inboxRateLimitBackoffUntilMs = 0;
            _backendSupportsInboxRev = true;
            if (cleanStr(res.rev)) state.inboxRev = cleanStr(res.rev);
            if (Array.isArray(res.recentUploads)) {
                const recentChanged = mergeSharedRecentUploadsFromServer(res.recentUploads);
                if (recentChanged) {
                    renderRecentUploadedStrip();
                    if (state.galleryMode === 'LOADED') renderInboxGallery();
                }
            }
            if (_liveSyncPendingCount <= 1) setFotosLiveStatus('live');
            drainPendingDeletedQueueAsync();
            if (manualRefresh) {
                showAssignFeedback('✅ Carpeta actualizada (' + state.inboxFiles.length + ').', true);
            }
            return;
        }

        if (res && res.ok && Array.isArray(res.files)) {
            _inboxConsecutiveSyncFails = 0;
            _inboxRateLimitBackoffUntilMs = 0;
            if (cleanStr(res.rev)) {
                state.inboxRev = cleanStr(res.rev);
                _backendSupportsInboxRev = true;
            }
            if (_liveSyncPendingCount <= 1) setFotosLiveStatus('live');
            const loadedNamesChanged = mergeLoadedFileNamesFromServer(res.loadedFileNames);
            const recentChanged = Array.isArray(res.recentUploads)
                ? mergeSharedRecentUploadsFromServer(res.recentUploads)
                : false;
            reconcileDeletedQueueWithLiveState(res.files);
            state.rawInboxFromDrive = res.files;
            const nextInbox = filterAndMergeInboxFiles(res.files);
            const nextFp = computeInboxFingerprint(nextInbox) + '::' + Object.keys(state.loadedFileNamesById || {}).length + '::' + cleanStr(state.inboxRev);
            const inboxChanged = !isSilent || !_lastInboxFingerprint || nextFp !== _lastInboxFingerprint || loadedNamesChanged || recentChanged;
            _lastInboxFingerprint = nextFp;
            state.inboxFiles = nextInbox;
            if (inboxChanged) {
                scheduleSaveFastCache();
                if (state.selectedInboxFileId && (!state.selectedPhotoItem || !state.selectedPhotoItem.fromLoaded)) {
                    if (!state.inboxFiles.some((f) => f.id === state.selectedInboxFileId && !isDocumentInboxItem(f))) {
                        state.selectedInboxFileId = '';
                        state.selectedPhotoItem = null;
                    }
                }
                renderInboxGallery();
                renderSelectedProductStage();
                updateAssignButtonState();
            }
            drainPendingDeletedQueueAsync();
            if (manualRefresh) {
                showAssignFeedback('✅ Carpeta actualizada (' + state.inboxFiles.length + ').', true);
            }
            return;
        }

        if (res && res.authRequired) {
            window.lockFotosPortal();
            setGateMessage('Ingresa tu contraseña.', 'warn');
            return;
        }

        const errMsg = cleanStr(res && res.error);
        if (/Acci[óo]n no reconocida/i.test(errMsg)) {
            state.inboxFiles = filterAndMergeInboxFiles(state.rawInboxFromDrive);
            if (!isSilent) renderInboxGallery();
            return;
        }

        _inboxConsecutiveSyncFails++;
        setFotosLiveStatus('offline', 'Reconectando');
        if (manualRefresh) {
            showAssignFeedback(
                '⚠️ ' + escapeHtml(errMsg || 'Google Drive tardó en responder al actualizar SUBIR PREN. Intenta de nuevo en unos segundos.'),
                false
            );
        }

        if (!isSilent && container && state.galleryMode === 'INBOX' && !state.inboxFiles.length) {
            const isOff = typeof navigator !== 'undefined' && navigator.onLine === false;
            container.innerHTML = '<div class="photo-empty-placeholder" style="grid-column:1/-1;">' +
                escapeHtml(isOff
                    ? '📡 Modo sin conexión · usa + Archivo o 📤 Subir para agregar fotos o documentos desde tu teléfono.'
                    : (errMsg || 'Reconectando automáticamente con Google Drive en vivo...')) +
                '</div>';
        }
    };

    function renderRecentUploadedStrip() {
        const strip = document.getElementById('recentUploadedPhotosStrip');
        const rail = document.getElementById('recentUploadedPhotosRail');
        const badge = document.getElementById('recentUploadsCountBadge');
        if (!strip || !rail) return;

        const recent = getRecentUploadedPhotosList();
        if (badge) badge.textContent = String(recent.length);
        if (!recent.length) {
            strip.classList.add('hidden');
            rail.innerHTML = '';
            return;
        }

        strip.classList.remove('hidden');
        const activePhoto = getActiveSelectedPhotoObject();
        const activeId = activePhoto ? activePhoto.id : '';
        const parts = new Array(recent.length);

        for (let i = 0; i < recent.length; i++) {
            const it = recent[i];
            const isSel = !!(activeId && activeId === it.id && activePhoto && activePhoto.fromLoaded);
            const thumb = it.localDataUrl || buildPhotoThumbUrl(it.id || it.viewUrl, 320);
            const fullSrc = it.localDataUrl || buildPhotoThumbUrl(it.id || it.viewUrl, 1200);
            const kindClass = it.targetKind === 'TELA'
                ? 'is-fabric'
                : (it.targetKind === 'MADERA'
                    ? 'is-wood'
                    : (it.targetKind === 'PORTADA' ? 'is-cover' : 'is-sku'));
            const kindTag = it.targetKind === 'TELA'
                ? '🧵 Tela'
                : (it.targetKind === 'MADERA'
                    ? '🪵 Madera'
                    : (it.targetKind === 'PORTADA' ? '🖼️ Portada' : (it.targetKey || 'SKU')));
            const displayTitle = it.fileName || it.targetLabel || it.targetKey || 'Foto';
            const timeTxt = formatShortTimeLabel(it.ts);
            const tooltip = [displayTitle, it.targetLabel, timeTxt].filter(Boolean).join(' · ');

            parts[i] =
                '<div class="recent-upload-card' + (isSel ? ' selected' : '') + '" data-recent-id="' + escapeHtml(it.id) + '" data-fotos-act="recent-select" data-fid="' + escapeHtml(it.id || '') + '" data-recent-key="' + escapeHtml(it.targetKey || '') + '" title="' + escapeHtml(tooltip) + '">' +
                    '<div class="recent-upload-thumb-wrap ' + kindClass + '">' +
                        '<button type="button" class="recent-upload-eye-btn" title="Ver en grande" aria-label="Ver foto" data-fotos-act="recent-preview" data-drive-id="' + escapeHtml(it.id || '') + '" data-lightbox-src="' + escapeHtml(fullSrc || '') + '">👁</button>' +
                        '<img width="120" height="78" src="' + escapeHtml(thumb) + '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-drive-id="' + escapeHtml(it.id) + '" onerror="handlePhotoImgError(this)">' +
                        '<span class="recent-upload-kind-tag">' + escapeHtml(kindTag) + '</span>' +
                    '</div>' +
                    '<div class="recent-upload-meta">' +
                        '<div class="recent-upload-name">' + escapeHtml(displayTitle) + '</div>' +
                        '<div class="recent-upload-sub">' +
                            '<span>' + escapeHtml(timeTxt || 'Reciente') + '</span>' +
                            '<span class="is-reuse-pill" data-recent-lbl="1">' + (isSel ? '✓ Lista' : 'Reusar') + '</span>' +
                        '</div>' +
                    '</div>' +
                '</div>';
        }
        rail.innerHTML = parts.join('');
    }

    window.previewRecentUploadedPhoto = function (src, ev, optDriveId) {
        if (ev && ev.stopPropagation) ev.stopPropagation();
        if (src && typeof window.openPhotoLightbox === 'function') {
            window.openPhotoLightbox(src, optDriveId || '');
        }
    };

    window.selectRecentUploadedPhoto = function (fileIdRaw, targetKeyRaw, ev) {
        if (ev && ev.stopPropagation) ev.stopPropagation();
        window.takeLoadedPhotoForAssign(targetKeyRaw || '', fileIdRaw || '', ev);
    };

    function renderInboxGallery() {
        renderRecentUploadedStrip();
        const container = document.getElementById('inboxGalleryContainer');
        const inboxBadge = document.getElementById('inboxHeaderBadge');
        const loadedBadge = document.getElementById('loadedHeaderBadge');
        if (!container) return;

        const loadedAll = getLoadedPhotosList();
        const q = normalizeSearchText(state.inboxSearchQuery);

        const visibleInbox = q
            ? state.inboxFiles.filter((f) => (f._searchNorm || '').indexOf(q) !== -1)
            : state.inboxFiles;

        const visibleLoaded = q
            ? loadedAll.filter((it) => (it._searchNorm || '').indexOf(q) !== -1)
            : loadedAll;

        if (inboxBadge) inboxBadge.textContent = String(visibleInbox.length);
        if (loadedBadge) loadedBadge.textContent = String(visibleLoaded.length);

        const activePhoto = getActiveSelectedPhotoObject();
        const activeId = activePhoto ? activePhoto.id : '';

        if (state.galleryMode === 'LOADED') {
            const sliceLoaded = visibleLoaded.slice(0, 140);
            if (!sliceLoaded.length) {
                container.innerHTML = '<div class="photo-empty-placeholder" style="grid-column:1/-1;">—</div>';
                return;
            }
            const parts = new Array(sliceLoaded.length);
            for (let i = 0; i < sliceLoaded.length; i++) {
                const item = sliceLoaded[i];
                const isSel = activeId === item.id && activePhoto && activePhoto.fromLoaded && activePhoto.skuOrigin === item.sku;
                const thumb = item.localDataUrl || buildPhotoThumbUrl(item.id || item.viewUrl, 360);
                const cardKey = 'L::' + (item.sku || '') + '::' + item.id;
                const primaryTitle = item.fileName || item.name || item.sku;
                const isVisualItem = /^V(?:COV|FAB|WOD):/i.test(item.sku || '');
                const displaySkuTag = isVisualItem ? (item.name || item.sku.replace(/^V(?:COV|FAB|WOD):/i, '')) : item.sku;
                const subText = [displaySkuTag, item.shortFolder].filter(Boolean).join(' · ');
                const titleTooltip = item.fileName
                    ? (item.fileName + (displaySkuTag ? (' · ' + displaySkuTag) : '') + (item.name && item.name !== item.fileName && item.name !== displaySkuTag ? (' · ' + item.name) : ''))
                    : (displaySkuTag ? (displaySkuTag + (item.name && item.name !== displaySkuTag ? (' · ' + item.name) : '')) : item.name);

                parts[i] =
                    '<div class="inbox-photo-card' + (isSel ? ' selected' : '') + '" data-card-key="' + escapeHtml(cardKey) + '" data-fotos-act="take-loaded" data-sku="' + escapeHtml(item.sku || '') + '" data-fid="' + escapeHtml(item.id || '') + '">' +
                        '<div class="inbox-thumb-box">' +
                            (!isVisualItem
                                ? ('<button type="button" class="card-del-btn" title="Borrar" data-fotos-act="del-loaded-sku" data-sku="' + escapeHtml(item.sku || '') + '" data-fid="' + escapeHtml(item.id || '') + '">🗑</button>')
                                : '') +
                            '<img width="160" height="120" src="' + escapeHtml(thumb) + '" alt="" loading="lazy" decoding="async" style="width:auto;height:auto;" referrerpolicy="no-referrer" data-drive-id="' + escapeHtml(item.id) + '" onerror="handlePhotoImgError(this)">' +
                        '</div>' +
                        '<div class="inbox-card-meta">' +
                            '<div class="inbox-file-name" title="' + escapeHtml(titleTooltip) + '">' + escapeHtml(primaryTitle) + '</div>' +
                            '<div class="inbox-file-sub">' +
                                '<span>' + escapeHtml(subText) + '</span>' +
                                '<span data-take-lbl="1" style="font-weight:800;color:' + (isSel ? '#CCA66B' : '#D0D9E4') + ';">' + (isSel ? '✓' : 'Tomar') + '</span>' +
                            '</div>' +
                        '</div>' +
                    '</div>';
            }
            container.innerHTML = parts.join('');
            return;
        }

        if (!state.inboxFiles.length) {
            container.innerHTML = '<div class="photo-empty-placeholder" style="grid-column:1/-1;">SUBIR PREN vacía</div>';
            return;
        }

        if (!visibleInbox.length) {
            container.innerHTML = '<div class="photo-empty-placeholder" style="grid-column:1/-1;">—</div>';
            return;
        }

        const sliceInbox = visibleInbox.slice(0, 160);
        const parts = new Array(sliceInbox.length);
        for (let i = 0; i < sliceInbox.length; i++) {
            const f = sliceInbox[i];
            const sz = f._sizeText || '';
            const cardKey = 'I::' + f.id;

            if (isDocumentInboxItem(f)) {
                const docInfo = getDocumentBadgeInfo(f);
                const openHref = cleanStr(f.viewUrl || f.url || (!isLocalTempPhotoId(f.id) ? ('https://drive.google.com/file/d/' + f.id + '/view?usp=sharing') : ''));
                const hasOpenHref = /^https?:\/\//i.test(openHref);
                const subMeta = [sz, f.subfolder].filter(Boolean).join(' · ') || docInfo.label;

                parts[i] =
                    '<div class="inbox-photo-card inbox-doc-card" data-card-key="' + escapeHtml(cardKey) + '" data-fotos-act="open-inbox-doc" data-fid="' + escapeHtml(f.id || '') + '" data-doc-url="' + escapeHtml(openHref) + '">' +
                        '<div class="inbox-thumb-box inbox-doc-preview">' +
                            '<button type="button" class="card-del-btn" title="Borrar documento" data-fotos-act="del-inbox" data-fid="' + escapeHtml(f.id || '') + '">🗑</button>' +
                            '<div class="inbox-doc-badge ' + escapeHtml(docInfo.cls) + '">' +
                                '<span class="inbox-doc-icon" aria-hidden="true">' + docInfo.icon + '</span>' +
                                '<span class="inbox-doc-ext">' + escapeHtml(docInfo.label) + '</span>' +
                            '</div>' +
                        '</div>' +
                        '<div class="inbox-card-meta">' +
                            '<div class="inbox-file-name" title="' + escapeHtml(f.name) + '">' + escapeHtml(f.name) + '</div>' +
                            '<div class="inbox-file-sub inbox-doc-actions">' +
                                '<span>' + escapeHtml(subMeta) + '</span>' +
                                (hasOpenHref
                                    ? ('<a class="inbox-doc-open-btn" href="' + escapeHtml(openHref) + '" target="_blank" rel="noopener">Abrir</a>')
                                    : ('<span class="inbox-doc-pending">' + (f.isOfflinePending ? 'Cola' : 'Subiendo...') + '</span>')) +
                            '</div>' +
                        '</div>' +
                    '</div>';
                continue;
            }

            const isSel = f.id === activeId && (!activePhoto || !activePhoto.fromLoaded);
            const thumb = f.localDataUrl || f.thumbDataUrl || buildPhotoThumbUrl(f.id, 360);
            const suggestedSku = f._suggestedSku || '';

            parts[i] =
                '<div class="inbox-photo-card' + (isSel ? ' selected' : '') + '" data-card-key="' + escapeHtml(cardKey) + '" data-fotos-act="select-inbox" data-fid="' + escapeHtml(f.id || '') + '">' +
                    '<div class="inbox-thumb-box">' +
                        '<button type="button" class="card-del-btn" title="Borrar" data-fotos-act="del-inbox" data-fid="' + escapeHtml(f.id || '') + '">🗑</button>' +
                        '<img width="160" height="120" src="' + escapeHtml(thumb) + '" alt="" loading="lazy" decoding="async" style="width:auto;height:auto;" referrerpolicy="no-referrer" data-drive-id="' + escapeHtml(f.id) + '" onerror="handlePhotoImgError(this)">' +
                    '</div>' +
                    '<div class="inbox-card-meta">' +
                        '<div class="inbox-file-name" title="' + escapeHtml(f.name) + '">' + escapeHtml(f.name) + '</div>' +
                        '<div class="inbox-file-sub">' +
                            '<span>' + escapeHtml(sz) + '</span>' +
                            '<span data-take-lbl="1" style="font-weight:800;color:' + (isSel ? '#CCA66B' : '#D0D9E4') + ';">' + (isSel ? '✓' : 'Tomar') + '</span>' +
                        '</div>' +
                        (suggestedSku
                            ? ('<button type="button" class="suggest-sku-btn" data-fotos-act="suggest-sku" data-fid="' + escapeHtml(f.id || '') + '" data-suggested-sku="' + escapeHtml(suggestedSku) + '">SKU ' + escapeHtml(suggestedSku) + '</button>')
                            : '') +
                    '</div>' +
                '</div>';
        }
        container.innerHTML = parts.join('');
    }

    function updateGallerySelectionInDom() {
        const activePhoto = getActiveSelectedPhotoObject();
        const container = document.getElementById('inboxGalleryContainer');
        if (container) {
            const targetKey = activePhoto
                ? (activePhoto.fromLoaded ? ('L::' + (activePhoto.skuOrigin || '') + '::' + activePhoto.id) : ('I::' + activePhoto.id))
                : '';

            const cards = container.querySelectorAll('.inbox-photo-card');
            for (let i = 0; i < cards.length; i++) {
                const card = cards[i];
                const isSel = targetKey && card.getAttribute('data-card-key') === targetKey;
                card.classList.toggle('selected', !!isSel);
                const lbl = card.querySelector('[data-take-lbl]');
                if (lbl) {
                    lbl.textContent = isSel ? '✓' : 'Tomar';
                    lbl.style.color = isSel ? '#CCA66B' : '#D0D9E4';
                }
            }
        }

        const rail = document.getElementById('recentUploadedPhotosRail');
        if (rail) {
            const activeRecentId = (activePhoto && activePhoto.fromLoaded) ? activePhoto.id : '';
            const rCards = rail.querySelectorAll('.recent-upload-card');
            for (let i = 0; i < rCards.length; i++) {
                const card = rCards[i];
                const isSel = !!(activeRecentId && card.getAttribute('data-recent-id') === activeRecentId);
                card.classList.toggle('selected', isSel);
                const rLbl = card.querySelector('[data-recent-lbl]');
                if (rLbl) rLbl.textContent = isSel ? '✓ Lista' : 'Reusar';
            }
        }
    }

    window.openInboxDocumentById = function (fileIdRaw, fallbackUrlRaw, ev) {
        if (ev && ev.stopPropagation) ev.stopPropagation();
        const fid = cleanStr(fileIdRaw);
        const fObj = fid ? (state.inboxFiles.find((f) => f && f.id === fid) || state.rawInboxFromDrive.find((f) => f && f.id === fid) || null) : null;
        const rawUrl = cleanStr(
            (fObj && (fObj.viewUrl || fObj.url)) ||
            fallbackUrlRaw ||
            (fid && !isLocalTempPhotoId(fid) ? ('https://drive.google.com/file/d/' + fid + '/view?usp=sharing') : '')
        );
        if (/^https?:\/\//i.test(rawUrl)) {
            try {
                window.open(rawUrl, '_blank', 'noopener');
            } catch (eOpen) {}
            return;
        }
        showAssignFeedback('⏳ Documento pendiente de sincronizar con SUBIR PREN...', true);
    };

    window.selectInboxPhoto = function (fileId) {
        const id = cleanStr(fileId);
        if (!id) return;
        const candidateObj = state.inboxFiles.find((f) => f && f.id === id);
        if (candidateObj && isDocumentInboxItem(candidateObj)) {
            window.openInboxDocumentById(candidateObj.id, candidateObj.viewUrl || candidateObj.url);
            return;
        }
        const alreadySame = state.selectedInboxFileId === id && (!state.selectedPhotoItem || !state.selectedPhotoItem.fromLoaded);
        if (alreadySame) {
            state.selectedInboxFileId = '';
            state.selectedPhotoItem = null;
        } else {
            const fObj = candidateObj;
            state.selectedInboxFileId = id;
            state.selectedPhotoItem = fObj ? {
                id: fObj.id,
                name: fObj.name,
                shortcutId: cleanStr(fObj.shortcutId),
                viewUrl: fObj.viewUrl || ('https://drive.google.com/file/d/' + fObj.id + '/view?usp=sharing'),
                thumbDataUrl: fObj.thumbDataUrl || '',
                localDataUrl: fObj.localDataUrl || '',
                fromLoaded: false,
                skuOrigin: cleanStr(fObj.skuOrigin)
            } : null;

            // Seguridad: NUNCA cambiar silenciosamente el SKU si el usuario ya eligió uno
            if (fObj && visualState.workMode === 'SKU' && !state.selectedSku) {
                const sug = fObj._suggestedSku || findSuggestedSkuForFileName(fObj.name) || cleanStr(fObj.skuOrigin);
                const explicitInName = sug ? extractExplicitSkuFromFileName(fObj.name) : '';
                if (sug && explicitInName === sug && state.productBySku.has(sug)) {
                    window.selectSkuProduct(sug, { skipBackSync: true });
                }
            }
        }
        hideAssignFeedback();
        updateGallerySelectionInDom();
        renderSelectedProductStage();
        if (typeof syncVisualStageSelectedGalleryPreview === 'function') {
            syncVisualStageSelectedGalleryPreview();
        }
        updateAssignButtonState();
        saveFotosUiCheckpointNow();
        if (!alreadySame) {
            syncFotosBackNav('selected_photo');
        }
    };

    window.takeLoadedPhotoForAssign = function (skuRaw, fileIdRaw, ev) {
        if (ev && ev.stopPropagation) ev.stopPropagation();
        const sku = cleanStr(skuRaw).toUpperCase();
        let fid = cleanStr(fileIdRaw);
        const prod = sku ? state.productBySku.get(sku) : null;
        const saved = sku ? state.sessionSavedBySku.get(sku) : null;
        const ovMap = getVisualOverridesMapSafe();
        const visOv = sku && ovMap[sku] ? ovMap[sku] : null;
        const recentMatch = getRecentUploadedPhotosList().find((r) => (fid && r.id === fid) || (sku && r.targetKey === sku)) || null;
        const rawCandidateUrl = (prod && prod.photoUrl) ||
            (saved && saved.newUrl) ||
            (recentMatch && recentMatch.viewUrl) ||
            (visOv && !/^blob:/i.test(cleanStr(visOv.note)) && cleanStr(visOv.note).indexOf('data:image/') !== 0 ? cleanStr(visOv.note) : '') ||
            (fid && !isLocalTempPhotoId(fid) ? ('https://drive.google.com/file/d/' + fid + '/view?usp=sharing') : '');
        const url = /^blob:/i.test(cleanStr(rawCandidateUrl)) ? '' : rawCandidateUrl;
        if (!fid && url) fid = extractDriveFileId(url);
        if (!fid) return;

        const alreadySame = state.selectedPhotoItem &&
            state.selectedPhotoItem.id === fid &&
            state.selectedPhotoItem.fromLoaded &&
            (state.selectedPhotoItem.skuOrigin === sku || !sku);

        if (alreadySame) {
            state.selectedInboxFileId = '';
            state.selectedPhotoItem = null;
        } else {
            const origFileName = cleanStr(
                (saved && saved.fileName) ||
                (recentMatch && recentMatch.fileName) ||
                (state.loadedFileNamesById && state.loadedFileNamesById[fid]) ||
                ''
            );
            const displayLabel = origFileName || (prod
                ? (prod.sku + ' · ' + (prod.displayName || prod.colBName || prod.sku))
                : ((recentMatch && recentMatch.targetLabel) || (visOv && visOv.name) || sku || fid));
            const localDataUrl = (saved && saved.localDataUrl) ||
                (recentMatch && recentMatch.localDataUrl) ||
                (visOv && cleanStr(visOv.note).indexOf('data:image/') === 0 ? cleanStr(visOv.note) : '') ||
                '';
            state.selectedInboxFileId = fid;
            state.selectedPhotoItem = {
                id: fid,
                name: displayLabel,
                viewUrl: url || (!isLocalTempPhotoId(fid) ? ('https://drive.google.com/file/d/' + fid + '/view?usp=sharing') : ''),
                thumbDataUrl: '',
                localDataUrl: localDataUrl,
                fromLoaded: true,
                skuOrigin: sku || (recentMatch && recentMatch.targetKey) || ''
            };
        }

        hideAssignFeedback();
        updateGallerySelectionInDom();
        renderSelectedProductStage();
        if (typeof syncVisualStageSelectedGalleryPreview === 'function') {
            syncVisualStageSelectedGalleryPreview();
        }
        updateAssignButtonState();
        saveFotosUiCheckpointNow();
        if (!alreadySame) {
            syncFotosBackNav('selected_photo');
        }
    };

    window.takeCurrentProductPhoto = function () {
        if (!state.selectedSku) return;
        const prod = state.productBySku.get(state.selectedSku);
        const saved = state.sessionSavedBySku.get(state.selectedSku);
        const url = (prod && prod.photoUrl) || (saved && saved.newUrl) || '';
        const fid = (prod && prod.photoFileId) || extractDriveFileId(url) || (saved && saved.fileId) || '';
        if (!fid) return;
        window.takeLoadedPhotoForAssign(state.selectedSku, fid);
    };

    window.takePhotoFromSkuRow = function (skuRaw, ev) {
        if (ev && ev.stopPropagation) ev.stopPropagation();
        const sku = cleanStr(skuRaw).toUpperCase();
        const prod = state.productBySku.get(sku);
        if (!prod || !prod.photoUrl) return;
        const fid = prod.photoFileId || extractDriveFileId(prod.photoUrl);
        if (!fid) return;
        window.takeLoadedPhotoForAssign(sku, fid);
    };

    window.deleteInboxPhotoById = async function (fileIdRaw, ev) {
        if (ev && ev.stopPropagation) ev.stopPropagation();
        const fid = cleanStr(fileIdRaw);
        if (!fid) return;

        const targetItem = state.inboxFiles.find((f) => f && f.id === fid) ||
            state.rawInboxFromDrive.find((f) => f && f.id === fid) || null;
        const shortcutId = cleanStr(targetItem && targetItem.shortcutId);
        const isDoc = isDocumentInboxItem(targetItem);

        markDeletedInQueue(fid, '', shortcutId);
        state.rawInboxFromDrive = state.rawInboxFromDrive.filter((f) => f.id !== fid);
        state.inboxFiles = state.inboxFiles.filter((f) => f.id !== fid);
        state.fotosNuevasSheetItems = state.fotosNuevasSheetItems.filter((f) => f.id !== fid);
        scheduleSaveFastCache();

        if (state.selectedInboxFileId === fid || (state.selectedPhotoItem && state.selectedPhotoItem.id === fid)) {
            state.selectedInboxFileId = '';
            state.selectedPhotoItem = null;
        }

        renderInboxGallery();
        renderSelectedProductStage();
        updateAssignButtonState();
        saveFotosUiCheckpointNow();
        notifyFotosInboxChanged('delete_inbox');
        showAssignFeedback(isDoc ? '🗑 Documento borrado de SUBIR PREN.' : '🗑 Foto borrada de SUBIR PREN.', true);

        if (isLocalTempPhotoId(fid)) {
            removeOutboxEntriesForLocalFileId(fid);
            deleteOfflinePhotoBlobIdb(fid);
            unmarkSkuDeletedInQueue('', fid);
            return;
        }

        const res = await callWebAppPost('fotos_delete', Object.assign({
            driveFileId: fid,
            shortcutId: shortcutId,
            source: 'INBOX',
            skipListReturn: true
        }, buildOwnerAuthPayload()), 22000);

        if (res && res.ok) {
            if (cleanStr(res.rev)) state.inboxRev = cleanStr(res.rev);
            if (Array.isArray(res.recentUploads)) mergeSharedRecentUploadsFromServer(res.recentUploads);
            unmarkSkuDeletedInQueue('', fid);
        }
    };

    window.deleteLoadedPhotoBySku = async function (skuRaw, fileIdRaw, ev) {
        if (ev && ev.stopPropagation) ev.stopPropagation();
        const sku = cleanStr(skuRaw).toUpperCase();
        const prod = sku ? state.productBySku.get(sku) : null;
        const saved = sku ? state.sessionSavedBySku.get(sku) : null;
        const fid = cleanStr(fileIdRaw) ||
            (prod ? (prod.photoFileId || extractDriveFileId(prod.photoUrl)) : '') ||
            (saved ? (saved.fileId || extractDriveFileId(saved.newUrl)) : '');
        const wasLocalOnly = isLocalTempPhotoId(fid) && !(prod && prod.inSheet1 && extractDriveFileId(saved && saved.previousUrl));

        if (!sku && !fid) return;

        markDeletedInQueue(fid, sku);

        if (isLocalTempPhotoId(fid)) {
            removeOutboxEntriesForLocalFileId(fid);
            deleteOfflinePhotoBlobIdb(fid);
        }
        if (sku) {
            const cleanedQ = readFotosOfflineOutbox().filter((it) => {
                if (!it) return false;
                if ((it.type === 'direct_upload_assign' || it.type === 'assign_photo') && cleanStr(it.sku).toUpperCase() === sku) {
                    if (it.localFileId) deleteOfflinePhotoBlobIdb(it.localFileId);
                    return false;
                }
                return true;
            });
            writeFotosOfflineOutbox(cleanedQ);
        }

        if (prod) {
            prod.photoUrl = '';
            prod.photoFileId = '';
        }
        if (sku) {
            state.sessionSavedBySku.delete(sku);
            state.sessionSavedLogs = state.sessionSavedLogs.filter((it) => it.sku !== sku);
            saveSavedOverridesNow();
        }
        if (fid) {
            state.rawInboxFromDrive = state.rawInboxFromDrive.filter((f) => f.id !== fid);
            state.inboxFiles = state.inboxFiles.filter((f) => f.id !== fid);
            state.fotosNuevasSheetItems = state.fotosNuevasSheetItems.filter((f) => f.id !== fid);
        }
        if (
            (fid && state.selectedInboxFileId === fid) ||
            (state.selectedPhotoItem && ((fid && state.selectedPhotoItem.id === fid) || (sku && state.selectedPhotoItem.skuOrigin === sku)))
        ) {
            state.selectedInboxFileId = '';
            state.selectedPhotoItem = null;
        }

        invalidateLoadedPhotosCache();
        scheduleSaveFastCache();
        renderSkuCategoryFilterRow();
        renderSkuLocationFilterRow();
        applySkuFiltersAndRender();
        renderInboxGallery();
        renderSelectedProductStage();
        renderSessionHistoryLog();
        updateAssignButtonState();
        saveFotosUiCheckpointNow();
        if (sku) {
            notifySplitPeerOfPhotoUpdate(sku, '', '', '');
        }
        notifyFotosInboxChanged('delete_loaded');
        showAssignFeedback('🗑 Foto borrada' + (sku ? (' de ' + escapeHtml(sku)) : '') + '.', true);

        if (wasLocalOnly) {
            unmarkSkuDeletedInQueue(sku, fid);
            return;
        }

        const res = await callWebAppPost('fotos_delete', Object.assign({
            sku: sku,
            driveFileId: isLocalTempPhotoId(fid) ? '' : fid,
            source: 'LOADED',
            skipListReturn: true
        }, buildOwnerAuthPayload()), 22000);

        if (res && res.ok) {
            if (cleanStr(res.rev)) state.inboxRev = cleanStr(res.rev);
            if (Array.isArray(res.recentUploads)) mergeSharedRecentUploadsFromServer(res.recentUploads);
            unmarkSkuDeletedInQueue(sku, fid);
        }
    };

    window.deleteCurrentProductPhoto = function () {
        if (!state.selectedSku) return;
        const prod = state.productBySku.get(state.selectedSku);
        const fid = prod ? (prod.photoFileId || extractDriveFileId(prod.photoUrl)) : '';
        window.deleteLoadedPhotoBySku(state.selectedSku, fid);
    };

    window.deleteSelectedStagePhoto = function () {
        const sel = getActiveSelectedPhotoObject();
        if (sel) {
            if (sel.fromLoaded) {
                window.deleteLoadedPhotoBySku(sel.skuOrigin || '', sel.id);
            } else {
                window.deleteInboxPhotoById(sel.id);
            }
            return;
        }
        if (state.selectedSku) {
            const saved = state.sessionSavedBySku.get(state.selectedSku);
            if (saved) {
                window.deleteLoadedPhotoBySku(state.selectedSku, saved.fileId || extractDriveFileId(saved.newUrl));
            }
        }
    };

    window.applySuggestedSkuFromInbox = function (fileId, sku, ev) {
        if (ev && ev.stopPropagation) ev.stopPropagation();
        const id = cleanStr(fileId);
        const fObj = state.inboxFiles.find((f) => f.id === id);
        if (fObj && isDocumentInboxItem(fObj)) {
            window.openInboxDocumentById(fObj.id, fObj.viewUrl || fObj.url, ev);
            return;
        }
        state.selectedInboxFileId = id;
        state.selectedPhotoItem = fObj ? {
            id: fObj.id,
            name: fObj.name,
            shortcutId: cleanStr(fObj.shortcutId),
            viewUrl: fObj.viewUrl || ('https://drive.google.com/file/d/' + fObj.id + '/view?usp=sharing'),
            thumbDataUrl: fObj.thumbDataUrl || '',
            localDataUrl: fObj.localDataUrl || '',
            fromLoaded: false,
            skuOrigin: cleanStr(fObj.skuOrigin)
        } : null;
        window.selectSkuProduct(sku, { skipBackSync: true });
        updateGallerySelectionInDom();
        renderSelectedProductStage();
        updateAssignButtonState();
        saveFotosUiCheckpointNow();
        syncFotosBackNav('selected_photo');
    };

    window.clearSelectedInboxPhoto = function () {
        state.selectedInboxFileId = '';
        state.selectedPhotoItem = null;
        updateGallerySelectionInDom();
        renderSelectedProductStage();
        updateAssignButtonState();
        saveFotosUiCheckpointNow();
    };

    function notifySplitPeerOfPhotoUpdate(sku, photoUrl, fileId, destFolderName) {
        const cleanUrl = cleanStr(photoUrl);
        const msg = {
            type: 'CREATA_SPLIT_PHOTO_SAVED',
            sku: cleanStr(sku).toUpperCase(),
            photoUrl: cleanUrl,
            deleted: !cleanUrl,
            fileId: cleanStr(fileId),
            destFolderName: cleanStr(destFolderName),
            source: 'fotos',
            tabId: FOTOS_TAB_ID
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
            if (_fotosSyncChannel && cleanUrl.indexOf('blob:') !== 0) {
                _fotosSyncChannel.postMessage(msg);
            }
        } catch (e3) {}
    }

    function notifySplitPeerOfSkuSelect(sku, openDetail) {
        const msg = {
            type: 'CREATA_SPLIT_SELECT_SKU',
            sku: cleanStr(sku).toUpperCase(),
            openDetail: !!openDetail,
            source: 'fotos'
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
            if (_fotosSyncChannel && openDetail) {
                _fotosSyncChannel.postMessage(msg);
            }
        } catch (e3) {}
    }
