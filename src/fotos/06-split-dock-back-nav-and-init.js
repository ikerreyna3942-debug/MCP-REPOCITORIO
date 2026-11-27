    // =========================================================================
    // PANTALLA DIVIDIDA REDIMENSIONABLE (APP FOTOS + COTIZADOR EN UNA SOLA APP)
    // =========================================================================
    const FOTOS_SPLIT_PCT_STORAGE = 'creata_unified_split_pct_v1';
    const FOTOS_SPLIT_AXIS_STORAGE = 'creata_unified_split_axis_v1';
    let _fotosSplitActive = false;
    let _fotosSplitPct = 50;
    let _fotosSplitVertical = false;
    let _fotosSplitTarget = 'cotizador';

    function getFotosSplitTargetUrl(target) {
        return target === 'prompts' ? 'https://buena-espero.onrender.com/?embed=true&embed_options=dark_theme' : './inventario.html?embed=1';
    }

    function loadFotosSplitPrefs() {
        try {
            const savedPct = parseFloat(localStorage.getItem(FOTOS_SPLIT_PCT_STORAGE) || '');
            if (Number.isFinite(savedPct) && savedPct >= 20 && savedPct <= 80) {
                _fotosSplitPct = Math.round(savedPct);
            } else {
                _fotosSplitPct = 50;
            }
            const savedAxis = localStorage.getItem(FOTOS_SPLIT_AXIS_STORAGE) || '';
            if (savedAxis === 'vertical' || savedAxis === 'horizontal') {
                _fotosSplitVertical = savedAxis === 'vertical';
            } else {
                _fotosSplitVertical = window.innerWidth < 768;
            }
        } catch (e) {
            _fotosSplitPct = 50;
            _fotosSplitVertical = window.innerWidth < 768;
        }
    }

    function applyFotosSplitDomState() {
        const dock = document.getElementById('fotosSplitCotizadorDock');
        const btn = document.getElementById('btnSplitWithCotizador');
        const badge = document.getElementById('fotosSplitRatioBadge');
        const frame = document.getElementById('fotosSplitCotizadorFrame');
        const btnCot = document.getElementById('btnFotosSplitTargetCotizador');
        const btnPrompts = document.getElementById('btnFotosSplitTargetPrompts');

        document.body.classList.toggle('fotos-split-active', _fotosSplitActive);
        document.body.classList.toggle('fotos-split-vertical', _fotosSplitActive && _fotosSplitVertical);
        document.documentElement.style.setProperty('--fotos-split-pct', _fotosSplitPct + '%');
        document.body.style.setProperty('--fotos-split-pct', _fotosSplitPct + '%');

        if (dock) dock.classList.toggle('hidden', !_fotosSplitActive);
        if (btn) {
            btn.classList.toggle('active', _fotosSplitActive);
            btn.textContent = _fotosSplitActive ? '✕ Dividir' : '⬛⬜ Dividir';
        }
        if (badge) {
            badge.textContent = _fotosSplitPct + '% / ' + (100 - _fotosSplitPct) + '%';
        }
        if (btnCot) btnCot.classList.toggle('active', _fotosSplitTarget !== 'prompts');
        if (btnPrompts) btnPrompts.classList.toggle('active', _fotosSplitTarget === 'prompts');
        if (_fotosSplitActive && frame) {
            const targetUrl = getFotosSplitTargetUrl(_fotosSplitTarget);
            const loadedSrc = (frame.dataset && frame.dataset.loadedSrc) || frame.getAttribute('src') || '';
            if (!loadedSrc || loadedSrc === 'about:blank' || loadedSrc !== targetUrl) {
                if (typeof frame.setAttribute === 'function') {
                    frame.setAttribute('title', _fotosSplitTarget === 'prompts' ? 'Generador de Prompts IA' : 'Cotizador CREATA');
                }
                if (window.CreataBackNav && typeof window.CreataBackNav.replaceIframeUrl === 'function') {
                    window.CreataBackNav.replaceIframeUrl(frame, targetUrl);
                } else if (typeof frame.setAttribute === 'function') {
                    frame.setAttribute('src', targetUrl);
                }
                try {
                    if (frame.dataset) frame.dataset.loadedSrc = targetUrl;
                } catch (e) {}
            }
        }
        updateAssignButtonState();
    }

    window.setFotosSplitTarget = function (target) {
        const nextTarget = target === 'prompts' ? 'prompts' : 'cotizador';
        _fotosSplitTarget = nextTarget;
        if (!_fotosSplitActive) {
            loadFotosSplitPrefs();
            _fotosSplitActive = true;
            applyFotosSplitDomState();
            syncFotosBackNav('split_cotizador');
        } else {
            applyFotosSplitDomState();
        }
        if (_fotosSplitTarget === 'cotizador' && state.selectedSku) {
            setTimeout(() => notifySplitPeerOfSkuSelect(state.selectedSku, true), 450);
        }
    };

    window.setFotosSplitPreset = function (pctVal) {
        const p = Math.max(20, Math.min(80, Math.round(Number(pctVal) || 50)));
        _fotosSplitPct = p;
        try { localStorage.setItem(FOTOS_SPLIT_PCT_STORAGE, String(p)); } catch (e) {}
        applyFotosSplitDomState();
    };

    window.toggleFotosSplitAxis = function () {
        _fotosSplitVertical = !_fotosSplitVertical;
        try { localStorage.setItem(FOTOS_SPLIT_AXIS_STORAGE, _fotosSplitVertical ? 'vertical' : 'horizontal'); } catch (e) {}
        applyFotosSplitDomState();
    };

    window.closeFotosSplitCotizador = function () {
        _fotosSplitActive = false;
        applyFotosSplitDomState();
    };

    window.toggleSplitCotizadorInFotos = function () {
        // Si esta ventana ya está embebida dentro del Cotizador en modo pantalla dividida, pedirle al padre ajustar/cerrar
        const isEmbedded = (window.parent && window.parent !== window);
        if (isEmbedded) {
            try {
                if (typeof window.parent.postMessage === 'function') {
                    window.parent.postMessage({ type: 'CREATA_SPLIT_TOGGLE_FROM_CHILD' }, '*');
                }
                return;
            } catch (e) {}
        }
        if (!_fotosSplitActive) {
            loadFotosSplitPrefs();
            _fotosSplitActive = true;
        } else {
            _fotosSplitActive = false;
        }
        applyFotosSplitDomState();
        if (_fotosSplitActive) {
            syncFotosBackNav('split_cotizador');
            if (state.selectedSku) {
                setTimeout(() => notifySplitPeerOfSkuSelect(state.selectedSku, true), 450);
            }
        }
    };

    window.openSelectedSkuInCotizador = function () {
        if (!state.selectedSku) return;
        const targetSku = state.selectedSku;
        const isEmbedded = !!(window.parent && window.parent !== window);
        if (isEmbedded) {
            notifySplitPeerOfSkuSelect(targetSku, true);
            return;
        }
        if (!_fotosSplitActive) {
            loadFotosSplitPrefs();
            _fotosSplitActive = true;
            applyFotosSplitDomState();
            syncFotosBackNav('split_cotizador');
            setTimeout(() => notifySplitPeerOfSkuSelect(targetSku, true), 500);
        } else {
            notifySplitPeerOfSkuSelect(targetSku, true);
        }
    };

    function bindFotosSplitResizerDrag() {
        const bar = document.getElementById('fotosSplitResizerBar');
        if (!bar) return;

        let dragging = false;

        const updateFromPointer = (clientX, clientY) => {
            if (!dragging || !_fotosSplitActive) return;
            const vw = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1);
            const vh = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1);
            const rawPct = _fotosSplitVertical ? ((clientY / vh) * 100) : ((clientX / vw) * 100);
            const clamped = Math.max(20, Math.min(80, Math.round(rawPct)));
            _fotosSplitPct = clamped;
            document.documentElement.style.setProperty('--fotos-split-pct', clamped + '%');
            document.body.style.setProperty('--fotos-split-pct', clamped + '%');
            const badge = document.getElementById('fotosSplitRatioBadge');
            if (badge) badge.textContent = clamped + '% / ' + (100 - clamped) + '%';
        };

        const stopDrag = () => {
            if (!dragging) return;
            dragging = false;
            document.body.classList.remove('fotos-split-dragging');
            try { localStorage.setItem(FOTOS_SPLIT_PCT_STORAGE, String(_fotosSplitPct)); } catch (e) {}
        };

        bar.addEventListener('mousedown', (ev) => {
            if (ev.target && ev.target.closest && ev.target.closest('.fotos-split-presets')) return;
            dragging = true;
            document.body.classList.add('fotos-split-dragging');
            ev.preventDefault();
        });

        window.addEventListener('mousemove', (ev) => {
            if (!dragging) return;
            updateFromPointer(ev.clientX, ev.clientY);
        });

        window.addEventListener('mouseup', stopDrag);

        bar.addEventListener('touchstart', (ev) => {
            if (ev.target && ev.target.closest && ev.target.closest('.fotos-split-presets')) return;
            if (!ev.touches || !ev.touches.length) return;
            dragging = true;
            document.body.classList.add('fotos-split-dragging');
        }, { passive: true });

        window.addEventListener('touchmove', (ev) => {
            if (!dragging || !ev.touches || !ev.touches.length) return;
            const t = ev.touches[0];
            updateFromPointer(t.clientX, t.clientY);
        }, { passive: true });

        window.addEventListener('touchend', stopDrag);
        window.addEventListener('touchcancel', stopDrag);
    }

    function initFotosBackNav() {
        const factory = (window.CreataBackNav && typeof window.CreataBackNav.createController === 'function')
            ? window.CreataBackNav.createController
            : (typeof window.createCreataBackNavController === 'function' ? window.createCreataBackNavController : null);
        if (!factory) return;

        _fotosBackNav = factory({
            appId: 'fotos',
            toastId: 'fotosBackToast',
            maxDepth: 12,
            exitGuardMs: 2500,
            exitMessage: 'Presiona Atrás otra vez para salir',
            isEnabled: () => state.unlocked === true,
            steps: [
                {
                    id: 'lightbox',
                    isActive: () => Boolean(state.lightboxOpen || state.lightboxUrl || !isElHidden('photoLightbox')),
                    undo: () => window.closePhotoLightbox(),
                    escapeAllowed: true
                },
                {
                    id: 'install_modal',
                    isActive: () => !isElHidden('fotosInstallModal'),
                    undo: () => window.closeFotosInstallModal(),
                    escapeAllowed: true
                },
                {
                    id: 'split_cotizador',
                    isActive: () => _fotosSplitActive === true,
                    undo: () => window.closeFotosSplitCotizador(),
                    escapeAllowed: true,
                    toast: 'Pantalla dividida cerrada'
                },
                {
                    id: 'selected_photo',
                    isActive: () => Boolean(state.selectedInboxFileId || state.selectedPhotoItem),
                    undo: () => window.clearSelectedInboxPhoto(),
                    escapeAllowed: true,
                    toast: 'Foto deseleccionada'
                },
                {
                    id: 'inbox_search',
                    isActive: () => Boolean(cleanStr(state.inboxSearchQuery)),
                    undo: () => window.clearInboxSearch({ focus: false }),
                    escapeAllowed: true,
                    toast: 'Filtro de galería limpiado'
                },
                {
                    id: 'gallery_mode',
                    isActive: () => state.galleryMode === 'LOADED' || state.galleryMode === 'ARCHIVED',
                    undo: () => window.setGalleryMode('INBOX'),
                    escapeAllowed: false,
                    toast: 'Volviendo a SUBIR PREN'
                },
                {
                    id: 'mobile_section',
                    isActive: () => state.mobileSectionHistory.length > 0 || (isMobileViewport() && state.activeMobileSection !== 'secSkuFinder'),
                    depthWeight: () => Math.max(1, state.mobileSectionHistory.length),
                    undo: () => {
                        const prev = state.mobileSectionHistory.length > 0
                            ? state.mobileSectionHistory.pop()
                            : 'secSkuFinder';
                        window.jumpToFotosSection(prev, null, { fromBack: true });
                    },
                    escapeAllowed: false,
                    toast: 'Paso anterior'
                },
                {
                    id: 'selected_visual_target',
                    isActive: () => typeof visualState !== 'undefined' && visualState.workMode !== 'SKU' && Boolean(visualState.selectedOverrideKey),
                    undo: () => { if (typeof window.clearSelectedVisualTarget === 'function') window.clearSelectedVisualTarget(); },
                    escapeAllowed: true,
                    toast: 'Selección quitada'
                },
                {
                    id: 'visual_search',
                    isActive: () => typeof visualState !== 'undefined' && visualState.workMode !== 'SKU' && Boolean(cleanStr(visualState.searchQuery)),
                    undo: () => { if (typeof window.clearVisualTargetSearch === 'function') window.clearVisualTargetSearch(); },
                    escapeAllowed: true,
                    toast: 'Búsqueda limpiada'
                },
                {
                    id: 'visual_filter',
                    isActive: () => typeof visualState !== 'undefined' && visualState.workMode !== 'SKU' && Boolean(visualState.filterMode && visualState.filterMode !== 'ALL'),
                    undo: () => { if (typeof window.setVisualTargetFilter === 'function') window.setVisualTargetFilter('ALL'); },
                    escapeAllowed: false,
                    toast: 'Filtro: Todos'
                },
                {
                    id: 'visual_work_mode',
                    isActive: () => typeof visualState !== 'undefined' && visualState.workMode !== 'SKU',
                    undo: () => { if (typeof window.setFotosWorkMode === 'function') window.setFotosWorkMode('SKU'); },
                    escapeAllowed: false,
                    toast: 'Volviendo a SKUs'
                },
                {
                    id: 'selected_sku',
                    isActive: () => Boolean(state.selectedSku),
                    undo: () => window.clearSelectedSku(),
                    escapeAllowed: true,
                    toast: 'SKU deseleccionado'
                },
                {
                    id: 'sku_search',
                    isActive: () => Boolean(cleanStr(state.skuSearchQuery)),
                    undo: () => window.clearSkuSearch({ focus: false }),
                    escapeAllowed: true,
                    toast: 'Búsqueda limpiada'
                },
                {
                    id: 'sku_location',
                    isActive: () => Boolean(state.skuLocationFilter && state.skuLocationFilter !== 'ALL'),
                    undo: () => window.setSkuLocationFilter('ALL'),
                    escapeAllowed: false,
                    toast: 'Ubicación: Todas'
                },
                {
                    id: 'sku_category',
                    isActive: () => Boolean(state.skuCategoryFilter && state.skuCategoryFilter !== 'ALL'),
                    undo: () => window.setSkuCategoryFilter('ALL'),
                    escapeAllowed: false,
                    toast: 'Categoría: Todas'
                },
                {
                    id: 'sku_filter',
                    isActive: () => Boolean(state.skuFilterMode && state.skuFilterMode !== 'ALL'),
                    undo: () => window.setSkuFilterMode('ALL'),
                    escapeAllowed: false,
                    toast: 'Filtro: Todos'
                }
            ]
        });

        _fotosBackNav.init();
        window.__CREATA_FOTOS_BACK_NAV__ = _fotosBackNav;
        window.handleFotosBackAction = function () {
            if (!state.unlocked) return { handled: false, blocked: false };
            return _fotosBackNav ? _fotosBackNav.stepBackOnce() : { handled: false };
        };
    }

    function handleIncomingPeerMessageInFotos(d) {
        if (!d || typeof d !== 'object') return;
        const fromSelfTab = Boolean(d.tabId && d.tabId === FOTOS_TAB_ID);
        if (fromSelfTab) return;

        if (d.type === 'CREATA_SPLIT_PHOTO_SAVED' && d.sku) {
            if (d.source === 'fotos' && !d.tabId) return;
            const targetSku = cleanStr(d.sku).toUpperCase();
            if (!targetSku) return;
            const nextUrl = d.deleted ? '' : cleanPhotoUrl(d.photoUrl);
            const nextFid = d.deleted ? '' : (cleanStr(d.fileId) || extractDriveFileId(nextUrl));
            if (!state.productBySku.has(targetSku)) {
                upsertProductFromCotizadorPeer(targetSku, { f: nextUrl });
            }
            const prod = state.productBySku.get(targetSku);
            if (prod) {
                prod.photoUrl = nextUrl;
                prod.photoFileId = nextFid;
                if (nextUrl) prod.inSheet1 = true;
            }
            if (d.fileId) {
                state.rawInboxFromDrive = state.rawInboxFromDrive.filter((x) => x && x.id !== d.fileId);
                state.inboxFiles = state.inboxFiles.filter((x) => x && x.id !== d.fileId);
            }
            invalidateLoadedPhotosCache();
            renderSkuCategoryFilterRow();
            renderSkuLocationFilterRow();
            applySkuFiltersAndRender();
            renderInboxGallery();
            if (state.selectedSku === targetSku) {
                renderSelectedProductStage();
            }
            return;
        }
        if (d.type === 'CREATA_VISUAL_OVERRIDE_SAVED' && d.overrideKey) {
            const ovKey = cleanStr(d.overrideKey).toUpperCase();
            if (!ovKey) return;
            if (d.deleted) {
                delete visualState.overridesMap[ovKey];
            } else if (d.override && typeof d.override === 'object') {
                visualState.overridesMap[ovKey] = d.override;
            }
            saveVisualOverridesToLocalStorage();
            if (visualState.workMode !== 'SKU') {
                renderVisualTargetsList();
                renderVisualTargetStage();
            } else if (state.selectedSku) {
                renderSelectedProductStage();
            }
            return;
        }
        if (d.type === 'CREATA_FOTOS_INBOX_CHANGED') {
            if (state.unlocked && !state.inboxLoading) {
                runSilentFotosLiveTick('inbox');
            }
            return;
        }
        if (d.type === 'CREATA_SPLIT_SELECT_SKU' && d.source !== 'fotos' && d.sku) {
            const targetSku = cleanStr(d.sku).toUpperCase();
            if (!targetSku) return;
            if (!state.productBySku.has(targetSku) || (d.meta && Array.isArray(d.meta.st))) {
                upsertProductFromCotizadorPeer(targetSku, d.meta || null);
                renderSkuCategoryFilterRow();
                renderSkuLocationFilterRow();
                applySkuFiltersAndRender();
            }
            if (state.selectedSku !== targetSku) {
                window.selectSkuProduct(targetSku, { skipBackSync: true, fromPeerSync: true });
            } else if (d.meta && Array.isArray(d.meta.st)) {
                renderSelectedProductStage();
            }
        }
    }

    function handleDelegatedFotosClick(ev) {
        if (!ev || !ev.target || typeof ev.target.closest !== 'function') return;
        const el = ev.target.closest('[data-fotos-act]');
        if (!el) return;
        const act = el.getAttribute('data-fotos-act');
        if (!act) return;
        if (act === 'load-more-gallery') {
            ev.stopPropagation();
            if (typeof window.loadMoreGalleryItems === 'function') window.loadMoreGalleryItems();
        } else if (act === 'photo-op') {
            ev.stopPropagation();
            if (typeof window.runFotosLifecycleAction === 'function') {
                window.runFotosLifecycleAction({
                    op: el.getAttribute('data-op') || '',
                    sku: el.getAttribute('data-sku') || '',
                    fileId: el.getAttribute('data-fid') || '',
                    source: el.getAttribute('data-source') || '',
                    shortcutId: el.getAttribute('data-shortcut') || ''
                }, ev);
            }
        } else if (act === 'take-archived') {
            if (typeof window.selectArchivedPhotoForAssign === 'function') {
                window.selectArchivedPhotoForAssign(el.getAttribute('data-fid') || '', ev);
            }
        } else if (act === 'cat-filter') {
            if (typeof window.setSkuCategoryFilter === 'function') window.setSkuCategoryFilter(el.getAttribute('data-cat-key') || 'ALL');
        } else if (act === 'loc-filter') {
            if (typeof window.setSkuLocationFilter === 'function') window.setSkuLocationFilter(el.getAttribute('data-loc-key') || 'ALL');
        } else if (act === 'sync-sku') {
            if (typeof window.syncSkusNow === 'function') window.syncSkusNow(el.getAttribute('data-raw') || '');
        } else if (act === 'manual-sku') {
            if (typeof window.useNewManualSku === 'function') window.useNewManualSku(el.getAttribute('data-raw') || '');
        } else if (act === 'select-sku') {
            if (typeof window.selectSkuProduct === 'function') window.selectSkuProduct(el.getAttribute('data-sku') || '');
        } else if (act === 'take-sku-row') {
            ev.stopPropagation();
            if (typeof window.takePhotoFromSkuRow === 'function') window.takePhotoFromSkuRow(el.getAttribute('data-sku') || '', ev);
        } else if (act === 'del-loaded-sku') {
            ev.stopPropagation();
            if (typeof window.deleteLoadedPhotoBySku === 'function') window.deleteLoadedPhotoBySku(el.getAttribute('data-sku') || '', el.getAttribute('data-fid') || '', ev);
        } else if (act === 'lightbox') {
            const src = el.getAttribute('data-lightbox-src') || '';
            const driveId = el.getAttribute('data-drive-id') || '';
            if (src && typeof window.openPhotoLightbox === 'function') window.openPhotoLightbox(src, driveId);
        } else if (act === 'recent-select') {
            if (typeof window.selectRecentUploadedPhoto === 'function') window.selectRecentUploadedPhoto(el.getAttribute('data-fid') || '', el.getAttribute('data-recent-key') || '', ev);
        } else if (act === 'recent-preview') {
            ev.stopPropagation();
            const driveId = el.getAttribute('data-drive-id') || '';
            if (typeof window.previewRecentUploadedPhoto === 'function') window.previewRecentUploadedPhoto(el.getAttribute('data-lightbox-src') || '', ev, driveId);
        } else if (act === 'take-loaded') {
            if (typeof window.takeLoadedPhotoForAssign === 'function') window.takeLoadedPhotoForAssign(el.getAttribute('data-sku') || '', el.getAttribute('data-fid') || '');
        } else if (act === 'select-inbox') {
            if (typeof window.selectInboxPhoto === 'function') window.selectInboxPhoto(el.getAttribute('data-fid') || '');
        } else if (act === 'open-inbox-doc') {
            if (ev && ev.target && ev.target.closest && ev.target.closest('.inbox-doc-open-btn')) {
                return;
            }
            if (typeof window.openInboxDocumentById === 'function') {
                window.openInboxDocumentById(el.getAttribute('data-fid') || '', el.getAttribute('data-doc-url') || '', ev);
            }
        } else if (act === 'del-inbox') {
            ev.stopPropagation();
            if (typeof window.deleteInboxPhotoById === 'function') window.deleteInboxPhotoById(el.getAttribute('data-fid') || '', ev);
        } else if (act === 'suggest-sku') {
            ev.stopPropagation();
            if (typeof window.applySuggestedSkuFromInbox === 'function') window.applySuggestedSkuFromInbox(el.getAttribute('data-fid') || '', el.getAttribute('data-suggested-sku') || '', ev);
        } else if (act === 'select-visual') {
            if (typeof window.selectVisualTarget === 'function') window.selectVisualTarget(el.getAttribute('data-visual-key') || '');
        }
    }

    function triggerFotosSwUpdate() {
        try {
            if (_fotosSwRegistration && typeof _fotosSwRegistration.update === 'function') {
                _fotosSwRegistration.update().catch(() => {});
            }
        } catch (eUpd) {}
    }

    function initFotosApp() {
        try {
            if ('serviceWorker' in navigator && /^https?:$/i.test(window.location.protocol)) {
                navigator.serviceWorker.register('./fotos-sw.js', {
                    scope: './fotos-productos',
                    updateViaCache: 'none'
                }).then((reg) => {
                    _fotosSwRegistration = reg || null;
                    if (reg && typeof reg.update === 'function') {
                        reg.update().catch(() => {});
                    }
                }).catch(() => {});
            }
        } catch (eSw) {}

        document.addEventListener('click', handleDelegatedFotosClick);
        const livePillEl = document.getElementById('fotosLiveStatusPill');
        if (livePillEl) {
            livePillEl.style.cursor = 'pointer';
            livePillEl.title = 'Toca para actualizar SUBIR PREN y catálogo ahora';
            livePillEl.addEventListener('click', () => {
                if (state.unlocked && typeof window.refreshAllPhotoWorkspace === 'function') {
                    window.refreshAllPhotoWorkspace(true);
                }
            });
        }

        window.addEventListener('beforeinstallprompt', (ev) => {
            ev.preventDefault();
            _deferredFotosInstallPrompt = ev;
            syncFotosInstallAppBtn();
        });
        window.addEventListener('appinstalled', () => {
            _deferredFotosInstallPrompt = null;
            const btn = document.getElementById('btnInstallFotosApp');
            if (btn) btn.classList.add('hidden');
            window.closeFotosInstallModal();
        });
        syncFotosInstallAppBtn();
        bindFotosSplitResizerDrag();
        initFotosBackNav();

        // Sincronización en vivo con el Cotizador, pestañas hermanas y puente de portapapeles con Prompts IA (P1-20 / P1-28)
        const PROMPTS_EMBED_ORIGINS = [
            'https://buena-espero.onrender.com',
            'https://app-1-3y7y.onrender.com'
        ];
        window.addEventListener('message', async (ev) => {
            if (!ev) return;
            const curOrigin = (window.location && window.location.origin) || '';
            const isSameOrigin = (ev.origin === curOrigin) || (!ev.origin && window.location && window.location.protocol === 'file:');
            const isPromptsOrigin = PROMPTS_EMBED_ORIGINS.indexOf(ev.origin) !== -1;
            if (!isSameOrigin && !isPromptsOrigin) return;
            const data = ev.data;
            if (!data || typeof data !== 'object') return;
            if (data.type === 'CREATA_PROMPTS_COPY_IMAGE') {
                const reqId = String(data.requestId || '');
                const rawUri = (typeof data.dataUri === 'string' && data.dataUri.trim())
                    ? data.dataUri
                    : (typeof data.dataUrl === 'string' ? data.dataUrl : '');
                const dataUri = rawUri.trim();
                let ok = false;
                if (/^data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=\s]+$/.test(dataUri)) {
                    try {
                        let pngBlob = null;
                        if (dataUri.indexOf('data:image/png;base64,') === 0) {
                            const bin = atob(dataUri.slice('data:image/png;base64,'.length).replace(/\s+/g, ''));
                            const bytes = new Uint8Array(bin.length);
                            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
                            pngBlob = new Blob([bytes], { type: 'image/png' });
                        } else if (typeof Image !== 'undefined' && typeof document !== 'undefined') {
                            pngBlob = await new Promise((resolve, reject) => {
                                const img = new Image();
                                img.onload = () => {
                                    let c = null;
                                    try {
                                        c = document.createElement('canvas');
                                        c.width = img.naturalWidth || img.width || 1;
                                        c.height = img.naturalHeight || img.height || 1;
                                        const ctx = c.getContext('2d');
                                        ctx.drawImage(img, 0, 0);
                                        c.toBlob((b) => {
                                            try { c.width = 0; c.height = 0; } catch (eRel) {}
                                            if (b) resolve(b);
                                            else reject(new Error('toBlob'));
                                        }, 'image/png');
                                    } catch (eCanvas) {
                                        if (c) { try { c.width = 0; c.height = 0; } catch (eRel2) {} }
                                        reject(eCanvas);
                                    }
                                };
                                img.onerror = () => reject(new Error('img'));
                                img.src = dataUri;
                            });
                        }
                        if (pngBlob && navigator.clipboard && typeof navigator.clipboard.write === 'function' && typeof window.ClipboardItem === 'function') {
                            await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': pngBlob })]);
                            ok = true;
                        }
                    } catch (eClip) {
                        ok = false;
                    }
                }
                try {
                    if (ev.source && typeof ev.source.postMessage === 'function') {
                        ev.source.postMessage({
                            type: 'CREATA_PROMPTS_COPY_IMAGE_RESULT',
                            ok: ok,
                            requestId: reqId
                        }, ev.origin || '*');
                    }
                } catch (eReply) {}
                return;
            }
            if (isPromptsOrigin) return;
            handleIncomingPeerMessageInFotos(data);
        });
        try {
            if (typeof BroadcastChannel === 'function') {
                _fotosSyncChannel = new BroadcastChannel(SYNC_BROADCAST_CHANNEL_NAME);
                _fotosSyncChannel.onmessage = (ev) => {
                    handleIncomingPeerMessageInFotos(ev && ev.data);
                };
            }
        } catch (eBc) {
            _fotosSyncChannel = null;
        }
        window.addEventListener('storage', (ev) => {
            if (!ev || !ev.key || !state.unlocked) return;
            if (ev.key === VISUAL_OVERRIDES_STORAGE_KEY) {
                loadVisualOverridesFromLocalStorage();
                if (visualState.workMode !== 'SKU') {
                    renderVisualTargetsList();
                    renderVisualTargetStage();
                } else if (state.selectedSku) {
                    renderSelectedProductStage();
                }
            } else if (ev.key === SAVED_OVERRIDES_STORAGE || ev.key === DELETED_QUEUE_STORAGE) {
                hydrateSavedOverrides();
                runSilentFotosLiveTick('catalog');
            } else if (ev.key === FOTOS_INBOX_SYNC_STORAGE) {
                try {
                    const parsed = ev.newValue ? JSON.parse(ev.newValue) : null;
                    if (parsed && parsed.tabId === FOTOS_TAB_ID) return;
                } catch (eP) {}
                runSilentFotosLiveTick('inbox');
            }
        });

        if (window.CREATA_LOGO_B64) {
            document.querySelectorAll('[data-creata-logo]').forEach((img) => {
                img.src = window.CREATA_LOGO_B64;
            });
        }

        populateDestFolderSelect();
        syncLocalSubirPrenFolderBadge();
        bindSubirPrenDragAndDrop();
        hydrateSavedOverrides();
        hydrateFromFastCache();
        hydrateFromLocalCompressedBundleIfEmpty();
        renderSkuCategoryFilterRow();
        renderSkuLocationFilterRow();
        loadSheetsCatalog();

        const skuInp = document.getElementById('skuSearchInput');
        const clrBtn = document.getElementById('skuSearchClearBtn');
        let skuRaf = 0;
        if (skuInp) {
            skuInp.addEventListener('input', () => {
                const val = skuInp.value || '';
                const wasEmpty = !cleanStr(state.skuSearchQuery);
                state.skuSearchQuery = val;
                if (clrBtn) clrBtn.classList.toggle('hidden', !val.trim());
                if (wasEmpty && Boolean(cleanStr(val))) {
                    syncFotosBackNav('sku_search');
                }
                if (skuRaf) cancelAnimationFrame(skuRaf);
                skuRaf = requestAnimationFrame(() => {
                    state.skuSearchQuery = val;
                    applySkuFiltersAndRender();
                    saveFotosUiCheckpointNow();
                });
            });
            skuInp.addEventListener('keydown', (ev) => {
                if (ev.key === 'Enter') {
                    ev.preventDefault();
                    state.skuSearchQuery = skuInp.value || '';
                    applySkuFiltersAndRender();
                    saveFotosUiCheckpointNow();
                    if (state.filteredProducts.length > 0) {
                        window.selectSkuProduct(state.filteredProducts[0].sku);
                    }
                }
            });
        }

        const inboxInp = document.getElementById('inboxSearchInput');
        const inboxClrBtn = document.getElementById('inboxSearchClearBtn');
        let inboxRaf = 0;
        if (inboxInp) {
            inboxInp.addEventListener('input', () => {
                const val = inboxInp.value || '';
                const wasEmpty = !cleanStr(state.inboxSearchQuery);
                state.inboxSearchQuery = val;
                if (inboxClrBtn) inboxClrBtn.classList.toggle('hidden', !val.trim());
                if (wasEmpty && Boolean(cleanStr(val))) {
                    syncFotosBackNav('inbox_search');
                }
                if (inboxRaf) cancelAnimationFrame(inboxRaf);
                inboxRaf = requestAnimationFrame(() => {
                    state.inboxSearchQuery = val;
                    renderInboxGallery();
                    saveFotosUiCheckpointNow();
                });
            });
        }

        const destSel = document.getElementById('destFolderSelect');
        if (destSel) {
            destSel.addEventListener('change', () => saveFotosUiCheckpointNow());
        }

        const markManualScroll = () => { _fotosUserHasScrolled = true; };
        window.addEventListener('touchstart', markManualScroll, { passive: true, once: true });
        window.addEventListener('wheel', markManualScroll, { passive: true, once: true });

        const skuListEl = document.getElementById('skuResultsList');
        let skuScrollTimer = null;
        if (skuListEl) {
            skuListEl.addEventListener('scroll', () => {
                if (!_fotosRestoringCheckpoint) _fotosUserHasScrolled = true;
                if (skuScrollTimer) clearTimeout(skuScrollTimer);
                skuScrollTimer = setTimeout(() => saveFotosUiCheckpointNow(), 250);
            }, { passive: true });
        }

        const galEl = document.getElementById('inboxGalleryContainer');
        let galScrollTimer = null;
        if (galEl) {
            galEl.addEventListener('scroll', () => {
                if (!_fotosRestoringCheckpoint) _fotosUserHasScrolled = true;
                if (galScrollTimer) clearTimeout(galScrollTimer);
                galScrollTimer = setTimeout(() => saveFotosUiCheckpointNow(), 250);
            }, { passive: true });
        }

        let winScrollTimer = null;
        window.addEventListener('scroll', () => {
            if (!_fotosRestoringCheckpoint && (window.scrollY || 0) > 8) {
                _fotosUserHasScrolled = true;
            }
            if (winScrollTimer) clearTimeout(winScrollTimer);
            winScrollTimer = setTimeout(() => saveFotosUiCheckpointNow(), 250);
        }, { passive: true });

        window.addEventListener('pagehide', () => saveFotosUiCheckpointNow());
        window.addEventListener('beforeunload', () => saveFotosUiCheckpointNow());
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                saveFotosUiCheckpointNow();
            } else if (document.visibilityState === 'visible' && state.unlocked) {
                updateOfflineSyncBanner();
                flushFotosOfflineOutbox();
                sendFotosPresenceHeartbeat(false);
                triggerThrottledLiveVisibilitySync();
            }
        });
        window.addEventListener('focus', () => {
            triggerFotosSwUpdate();
            if (state.unlocked) {
                updateOfflineSyncBanner();
                sendFotosPresenceHeartbeat(false);
                triggerThrottledLiveVisibilitySync();
            }
        });

        window.addEventListener('online', () => {
            triggerFotosSwUpdate();
            updateOfflineSyncBanner();
            setFotosLiveStatus('live');
            if (state.unlocked) {
                showAssignFeedback('🌐 Conexión recuperada · sincronizando fotos guardadas...', true);
                flushFotosOfflineOutbox();
                drainPendingDeletedQueueAsync();
                sendFotosPresenceHeartbeat(false);
                triggerThrottledLiveVisibilitySync();
            }
        });

        window.addEventListener('offline', () => {
            updateOfflineSyncBanner();
            setFotosLiveStatus('offline');
            if (state.unlocked) {
                showAssignFeedback('📡 Modo sin conexión · tus fotos se guardarán en el teléfono.', true);
            }
        });

        document.addEventListener('keydown', (ev) => {
            if (ev.key === 'Escape') {
                if (!state.unlocked) return;
                if (_fotosBackNav && typeof _fotosBackNav.handleEscape === 'function') {
                    _fotosBackNav.handleEscape();
                } else if (state.lightboxOpen || state.lightboxUrl || !isElHidden('photoLightbox')) {
                    window.closePhotoLightbox();
                } else if (!isElHidden('fotosInstallModal')) {
                    window.closeFotosInstallModal();
                }
            }
        });

        const sess = checkExistingFotosOwnerSession();
        if (sess.valid) {
            state.authToken = sess.authToken || '';
            state.accessKey = sess.accessKey || '';
            state.activeEmail = sess.email || OWNER_EMAIL;
            state.activeDisplayName = sess.nombre || OWNER_DISPLAY_NAME;
            state.activeSheetTab = sess.sheetTab || 'CUENTAS ADMINISTRATIVAS';
            unlockFotosPortal();
        } else {
            if (sess.otherEmail) {
                setGateMessage('Solo autorizado para ' + OWNER_EMAIL, 'error');
            } else if (sess.needsReauth) {
                setGateMessage('Ingresa tu contraseña.', 'warn');
            }
            const pwdInp = document.getElementById('ownerPasswordInput');
            if (pwdInp) setTimeout(() => pwdInp.focus(), 80);
        }

        try {
            const urlParams = new URLSearchParams(window.location.search || '');
            const isInSuiteEmbed = urlParams.get('embed') === '1' || (typeof window !== 'undefined' && window.parent && window.parent !== window);
            if (document.body) {
                if (isInSuiteEmbed) document.body.classList.add('is-suite-embed');
                if (typeof window.showDirectoryPicker !== 'function') document.body.classList.add('no-local-fs');
            }
            if (urlParams.get('split') === '1') {
                loadFotosSplitPrefs();
                _fotosSplitActive = true;
                applyFotosSplitDomState();
            }
            const initialSkuParam = cleanStr(urlParams.get('sku')).toUpperCase();
            if (initialSkuParam) {
                if (!state.productBySku.has(initialSkuParam)) {
                    upsertProductFromCotizadorPeer(initialSkuParam, null);
                }
                window.selectSkuProduct(initialSkuParam, { skipBackSync: true, fromPeerSync: true });
            }
        } catch (eParam) {}

        // Sincronizar pestaña activa inferior (1. SKU / 2. PRODUCTO / 3. GALERÍA) al hacer scroll en celular
        if (typeof window.addEventListener === 'function' && typeof document.getElementById === 'function') {
            let scrollRaf = 0;
            const syncMobileTabOnScroll = () => {
                scrollRaf = 0;
                const ids = ['secSkuFinder', 'secProductStage', 'secGalleryInbox'];
                let activeId = ids[0];
                const threshold = 140;
                for (let i = 0; i < ids.length; i++) {
                    const sec = document.getElementById(ids[i]);
                    if (sec && typeof sec.getBoundingClientRect === 'function') {
                        const rect = sec.getBoundingClientRect();
                        if (rect.top <= threshold) activeId = ids[i];
                    }
                }
                if (state.activeMobileSection !== activeId) {
                    state.activeMobileSection = activeId;
                    document.querySelectorAll('#mobileFotosJumpBar .mobile-jump-btn').forEach((b) => {
                        b.classList.toggle('active', b.getAttribute('data-jump') === activeId);
                    });
                }
            };
            window.addEventListener('scroll', () => {
                if (scrollRaf) return;
                if (typeof window.requestAnimationFrame === 'function') {
                    scrollRaf = window.requestAnimationFrame(syncMobileTabOnScroll);
                } else {
                    syncMobileTabOnScroll();
                }
            }, { passive: true });
        }

        const visInp = document.getElementById('visualTargetSearchInput');
        const visClr = document.getElementById('visualTargetSearchClearBtn');
        if (visInp) {
            visInp.addEventListener('input', () => {
                visualState.searchQuery = visInp.value || '';
                if (visClr) visClr.classList.toggle('hidden', !visualState.searchQuery.trim());
                renderVisualTargetsList();
            });
        }
        loadVisualOverridesFromLocalStorage();
        rebuildVisualTargetsCatalog();
    }
