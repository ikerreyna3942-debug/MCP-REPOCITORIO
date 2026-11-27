    // =========================================================================
    // PANTALLA DIVIDIDA REDIMENSIONABLE: COTIZADOR + APP DE SUBIR FOTOS
    // =========================================================================
    const INV_SPLIT_PCT_STORAGE = 'creata_unified_split_pct_v1';
    const INV_SPLIT_AXIS_STORAGE = 'creata_unified_split_axis_v1';
    let _invSplitActive = false;
    let _invSplitPct = 50;
    let _invSplitVertical = false;
    let _invSplitTarget = 'fotos';

    function getInvSplitTargetUrl(target) {
        return target === 'prompts' ? 'https://buena-espero.onrender.com/?embed=true&embed_options=dark_theme' : './fotos-productos.html?embed=1';
    }

    function loadInvSplitPrefs() {
        try {
            const savedPct = parseFloat(localStorage.getItem(INV_SPLIT_PCT_STORAGE) || '');
            if (Number.isFinite(savedPct) && savedPct >= 20 && savedPct <= 80) {
                _invSplitPct = Math.round(savedPct);
            } else {
                _invSplitPct = 50;
            }
            const savedAxis = localStorage.getItem(INV_SPLIT_AXIS_STORAGE) || '';
            if (savedAxis === 'vertical' || savedAxis === 'horizontal') {
                _invSplitVertical = savedAxis === 'vertical';
            } else {
                _invSplitVertical = window.innerWidth < 768;
            }
        } catch (e) {
            _invSplitPct = 50;
            _invSplitVertical = window.innerWidth < 768;
        }
    }

    function applyInvSplitDomState() {
        const dock = document.getElementById('invSplitFotosDock');
        const badge = document.getElementById('invSplitRatioBadge');
        const fabLbl = document.getElementById('fabSplitFotosBtnLabel');
        const frame = document.getElementById('invSplitFotosFrame');
        const btnFotos = document.getElementById('btnInvSplitTargetFotos');
        const btnPrompts = document.getElementById('btnInvSplitTargetPrompts');

        document.body.classList.toggle('inv-split-active', _invSplitActive);
        document.body.classList.toggle('inv-split-vertical', _invSplitActive && _invSplitVertical);
        document.documentElement.style.setProperty('--inv-split-pct', _invSplitPct + '%');
        document.body.style.setProperty('--inv-split-pct', _invSplitPct + '%');

        if (dock) dock.classList.toggle('hidden', !_invSplitActive);
        if (fabLbl) {
            fabLbl.textContent = _invSplitActive ? 'Cerrar Pantalla Dividida' : 'Dividir: Cotizador + Fotos';
        }
        if (badge) {
            badge.textContent = _invSplitPct + '% / ' + (100 - _invSplitPct) + '%';
        }
        if (btnFotos) btnFotos.classList.toggle('active', _invSplitTarget !== 'prompts');
        if (btnPrompts) btnPrompts.classList.toggle('active', _invSplitTarget === 'prompts');
        if (_invSplitActive && frame) {
            const targetUrl = getInvSplitTargetUrl(_invSplitTarget);
            const loadedSrc = (frame.dataset && frame.dataset.loadedSrc) || frame.getAttribute('src') || '';
            if (!loadedSrc || loadedSrc === 'about:blank' || loadedSrc !== targetUrl) {
                if (typeof frame.setAttribute === 'function') {
                    frame.setAttribute('title', _invSplitTarget === 'prompts' ? 'Generador de Prompts IA' : 'App de Subir Fotos por Categoría');
                }
                if (window.CreataBackNav && typeof window.CreataBackNav.replaceIframeUrl === 'function') {
                    window.CreataBackNav.replaceIframeUrl(frame, targetUrl);
                } else {
                    try {
                        if (frame.contentWindow && frame.contentWindow.location && typeof frame.contentWindow.location.replace === 'function') {
                            frame.contentWindow.location.replace(targetUrl);
                        } else {
                            frame.setAttribute('src', targetUrl);
                        }
                    } catch (eFrame) {
                        frame.setAttribute('src', targetUrl);
                    }
                }
                try {
                    if (frame.dataset) frame.dataset.loadedSrc = targetUrl;
                } catch (eDs) {}
            }
        }
    }

    let _suppressInvPeerSkuNotifyOnce = false;

    function notifyInvSplitFotosOfSku(skuRaw) {
        if (_suppressInvPeerSkuNotifyOnce) {
            _suppressInvPeerSkuNotifyOnce = false;
            return;
        }
        if (!skuRaw) return;
        const isEmbeddedInParent = !!(typeof window !== 'undefined' && window.parent && window.parent !== window);
        if (!_invSplitActive && !isEmbeddedInParent) return;

        const targetSku = cleanStr(skuRaw).toUpperCase();
        const it = bySkuMap.get(targetSku) || null;
        const msg = {
            type: 'CREATA_SPLIT_SELECT_SKU',
            sku: targetSku,
            source: 'cotizador',
            meta: it ? {
                n: it.n || '',
                c: it.c || it._cat || '',
                tp: it.tp || '',
                mo: it.mo || '',
                vr: it.vr || '',
                m: it.m || '',
                st: Array.isArray(it.st) ? it.st.slice() : null,
                pr: it.pr || '',
                fe: it.fe || '',
                f: it.f || ''
            } : null
        };

        try {
            if (_invSplitActive && _invSplitTarget === 'fotos') {
                const frame = document.getElementById('invSplitFotosFrame');
                if (frame && frame.contentWindow && typeof frame.contentWindow.postMessage === 'function') {
                    frame.contentWindow.postMessage(msg, '*');
                }
            }
        } catch (e) {}

        try {
            if (isEmbeddedInParent && typeof window.parent.postMessage === 'function') {
                window.parent.postMessage(msg, '*');
            }
        } catch (e2) {}
    }

    window.setInvSplitTarget = function (target) {
        if (!isFotosAppOwner()) {
            _invSplitActive = false;
            applyInvSplitDomState();
            return;
        }
        const nextTarget = target === 'prompts' ? 'prompts' : 'fotos';
        _invSplitTarget = nextTarget;
        if (!_invSplitActive) {
            loadInvSplitPrefs();
            _invSplitActive = true;
            applyInvSplitDomState();
            notifyInvBackStatePush('split_fotos_dock');
        } else {
            applyInvSplitDomState();
        }
        if (_invSplitTarget === 'fotos' && currentDetailItem && currentDetailItem.s) {
            setTimeout(() => notifyInvSplitFotosOfSku(currentDetailItem.s), 450);
        }
    };

    window.openPromptsFromCotizador = function () {
        if (!isEffectiveAdminSession() || !hasAdminPerm('promptsIa')) return;
        const opened = window.open('https://buena-espero.onrender.com/', '_blank', 'noopener');
        if (!opened) window.location.href = 'https://buena-espero.onrender.com/';
    };

    window.openPanelFromCotizador = function () {
        if (!isEffectiveAdminSession() || !hasAdminPerm('panelSuite')) return;
        const opened = window.open('./panel.html', '_blank', 'noopener');
        if (!opened) window.location.href = './panel.html';
    };

    window.setInvSplitPreset = function (pctVal) {
        const p = Math.max(20, Math.min(80, Math.round(Number(pctVal) || 50)));
        _invSplitPct = p;
        try { localStorage.setItem(INV_SPLIT_PCT_STORAGE, String(p)); } catch (e) {}
        applyInvSplitDomState();
    };

    window.toggleInvSplitAxis = function () {
        _invSplitVertical = !_invSplitVertical;
        try { localStorage.setItem(INV_SPLIT_AXIS_STORAGE, _invSplitVertical ? 'vertical' : 'horizontal'); } catch (e) {}
        applyInvSplitDomState();
    };

    window.closeInvSplitFotosDock = function () {
        _invSplitActive = false;
        applyInvSplitDomState();
    };

    window.toggleInvSplitFotosDock = function () {
        if (!isFotosAppOwner()) {
            _invSplitActive = false;
            applyInvSplitDomState();
            return;
        }
        if (!_invSplitActive) {
            loadInvSplitPrefs();
            _invSplitActive = true;
            applyInvSplitDomState();
            notifyInvBackStatePush('split_fotos_dock');
            if (_invSplitTarget === 'fotos' && currentDetailItem && currentDetailItem.s) {
                setTimeout(() => notifyInvSplitFotosOfSku(currentDetailItem.s), 450);
            }
        } else {
            _invSplitActive = false;
            applyInvSplitDomState();
        }
    };

    // =========================================================================
    // NAVEGACIÓN BOTÓN ATRÁS DEL TELÉFONO (popstate / History API — 17 NIVELES)
    // =========================================================================
    let _invBackNav = null;
    let _invPrevSearchNonEmpty = false;

    function notifyInvBackStatePush(reason) {
        try {
            if (_invBackNav && typeof _invBackNav.syncDepthOnUserAction === 'function') {
                _invBackNav.syncDepthOnUserAction(reason || 'inv_action');
            }
        } catch (e) {}
    }

    function isModalOpenById(id) {
        const el = document.getElementById(id);
        return Boolean(el && el.classList.contains('open'));
    }

    function isElVisibleById(id) {
        const el = document.getElementById(id);
        return Boolean(el && !el.classList.contains('hidden'));
    }

    function isMandatoryAuthGateActive() {
        if (!isModalOpenById('authModal')) return false;
        const loginVisible = isElVisibleById('authStepLogin');
        const newKeyVisible = isElVisibleById('authStepNewKey');
        if ((loginVisible || newKeyVisible) && (!activeAdvisorSession || activeAdvisorSession.mustChangeKey)) {
            return true;
        }
        return false;
    }

    function isOptionalAuthModalActive() {
        if (!isModalOpenById('authModal')) return false;
        if (isElVisibleById('authStepBranch')) return true;
        if (isElVisibleById('authStepLogin') && activeAdvisorSession && !activeAdvisorSession.mustChangeKey) {
            return true;
        }
        return false;
    }

    function hasDomSegOverlayOpen() {
        const ids = ['seg_previewModal', 'seg_modalCerrarCotizacion', 'seg_modalKevinAudit'];
        for (let i = 0; i < ids.length; i++) {
            const el = document.getElementById(ids[i]);
            if (el && !el.classList.contains('cm-hidden')) return true;
        }
        return false;
    }

    function hasDomHistOverlayOpen() {
        const ids = ['hist_photoPreviewModal', 'hist_quoteInspectModal'];
        for (let i = 0; i < ids.length; i++) {
            const el = document.getElementById(ids[i]);
            if (el && !el.classList.contains('cm-hidden')) return true;
        }
        return false;
    }

    function initInventarioBackNav() {
        if (_invBackNav) return _invBackNav;
        if (typeof window.createCreataBackNavController !== 'function') return null;

        _invBackNav = window.createCreataBackNavController({
            appId: 'inventario',
            toastId: 'creataBackNavToast',
            maxDepth: 12,
            exitGuardMs: 2500,
            exitMessage: 'Presiona Atrás otra vez para salir',
            isEnabled: function () {
                return !isMandatoryAuthGateActive();
            },
            steps: [
                // Priority 0: Mandatory Auth Gate — never bypass or leak Escape
                {
                    id: 'auth_gate_locked',
                    isActive: function () { return isMandatoryAuthGateActive(); },
                    undo: function () { return { handled: true, blocked: true, toast: '' }; },
                    escapeAllowed: true
                },
                // Priority 0b: Visual Photo Lightbox (z-index: 95)
                {
                    id: 'visual_photo_lightbox',
                    isActive: function () { return isModalOpenById('visualPhotoLightboxModal'); },
                    undo: function () { window.closeVisualPhotoLightbox(); },
                    escapeAllowed: true
                },
                // Priority 0c: Visual Photo Picker Modal (z-index: 90)
                {
                    id: 'visual_photo_picker',
                    isActive: function () { return isModalOpenById('visualPhotoPickerModal'); },
                    undo: function () { window.closeVisualPhotoPicker(); },
                    escapeAllowed: true
                },
                // Priority 1: Barcode/QR Scanner Modal (z-index: 90)
                {
                    id: 'scan_modal',
                    isActive: function () { return isModalOpenById('scanModal'); },
                    undo: function () { window.closeBarcodeScanner(); },
                    escapeAllowed: true
                },
                // Priority 1b: Informative Price Calculator Modal (z-index: 91)
                {
                    id: 'price_calculator_modal',
                    isActive: function () { return isModalOpenById('priceCalculatorModal'); },
                    undo: function () { window.closePriceCalculatorModal(); },
                    escapeAllowed: true
                },
                // Priority 2: Install App Modal (z-index: 88)
                {
                    id: 'install_modal',
                    isActive: function () { return isModalOpenById('installAppModal'); },
                    undo: function () { window.closeInstallAppModal(); },
                    escapeAllowed: true
                },
                // Priority 2a: Out-of-Stock Demand Request Modal (z-index: 92)
                {
                    id: 'out_of_stock_request_modal',
                    isActive: function () { return isModalOpenById('outOfStockRequestModal'); },
                    undo: function () { window.closeOutOfStockRequestModal(); },
                    escapeAllowed: true
                },
                // Priority 2a-bis: Purchase Suggestion Modal (z-index: 93)
                {
                    id: 'purchase_suggestion_modal',
                    isActive: function () { return isModalOpenById('purchaseSuggestionModal'); },
                    undo: function () { window.closePurchaseSuggestionModal(); },
                    escapeAllowed: true
                },
                // Priority 2b: Settings Modal (z-index: 86)
                {
                    id: 'settings_modal',
                    isActive: function () { return isModalOpenById('settingsModal'); },
                    undo: function () { window.closeSettingsModal(); },
                    escapeAllowed: true
                },
                // Priority 3: Auth Branch Selector or Optional Reauth (z-index: 85)
                {
                    id: 'auth_branch_or_reauth',
                    isActive: function () { return isOptionalAuthModalActive(); },
                    undo: function () {
                        if (isElVisibleById('authStepBranch')) {
                            window.cancelBranchSelection();
                            return;
                        }
                        pendingQuoteRetrySendToErp = null;
                        const m = document.getElementById('authModal');
                        if (m) m.classList.remove('open');
                    },
                    escapeAllowed: true
                },
                // Priority 4: Upload Photo Model Dropdown (z-index: 82)
                {
                    id: 'upload_photo_dropdown',
                    isActive: function () {
                        return isModalOpenById('uploadPhotoModal') && isElVisibleById('uploadPhotoModelDropdown');
                    },
                    undo: function () {
                        const dd = document.getElementById('uploadPhotoModelDropdown');
                        if (dd) dd.classList.add('hidden');
                    },
                    escapeAllowed: true
                },
                // Priority 5: Upload Photo Modal (z-index: 82) — preserves in-flight upload lock
                {
                    id: 'upload_photo_modal',
                    isActive: function () { return isModalOpenById('uploadPhotoModal'); },
                    undo: function () {
                        if (managerPhotoUploadInFlight) {
                            return { handled: true, blocked: true, toast: 'Subida en curso...' };
                        }
                        window.closeUploadPhotoModal();
                    },
                    escapeAllowed: true
                },
                // Priority 6: Seguimiento In-App Overlays (z-index: 80)
                {
                    id: 'seg_overlay',
                    isActive: function () {
                        if (activeInAppModule !== 'seguimiento') return false;
                        if (window.CreataSeguimientoModule && typeof window.CreataSeguimientoModule.hasActiveOverlay === 'function') {
                            return window.CreataSeguimientoModule.hasActiveOverlay();
                        }
                        return hasDomSegOverlayOpen();
                    },
                    undo: function (ctx) {
                        if (window.CreataSeguimientoModule && typeof window.CreataSeguimientoModule.handleBackAction === 'function') {
                            return window.CreataSeguimientoModule.handleBackAction({ phase: 'overlay', source: ctx && ctx.source });
                        }
                        return false;
                    },
                    escapeAllowed: true
                },
                // Priority 7: Historial In-App Overlays (z-index: 80)
                {
                    id: 'hist_overlay',
                    isActive: function () {
                        if (activeInAppModule !== 'historial') return false;
                        if (window.CreataHistorialModule && typeof window.CreataHistorialModule.hasActiveOverlay === 'function') {
                            return window.CreataHistorialModule.hasActiveOverlay();
                        }
                        return hasDomHistOverlayOpen();
                    },
                    undo: function (ctx) {
                        if (window.CreataHistorialModule && typeof window.CreataHistorialModule.handleBackAction === 'function') {
                            return window.CreataHistorialModule.handleBackAction({ phase: 'overlay', source: ctx && ctx.source });
                        }
                        return false;
                    },
                    escapeAllowed: true
                },
                // Priority 8: Quote Accepted Confirmation Modal (z-index: 75)
                {
                    id: 'quote_accepted_modal',
                    isActive: function () { return isModalOpenById('quoteAcceptedModal'); },
                    undo: function () { window.acceptGeneratedQuoteAndReset(); },
                    escapeAllowed: true
                },
                // Priority 8b: Quote Generated PDFs Modal (z-index: 72) — unwinds before #cartModal
                {
                    id: 'quote_generated_pdfs_modal',
                    isActive: function () { return isModalOpenById('quoteGeneratedPdfsModal'); },
                    undo: function () { window.closeQuoteGeneratedPdfsModal(); },
                    escapeAllowed: true
                },
                // Priority 8c: Catalog Gear Sort & Filter Modal (z-index: 68)
                {
                    id: 'catalog_filter_modal',
                    isActive: function () { return isModalOpenById('catalogFilterModal'); },
                    undo: function () { window.closeCatalogFilterModal(); },
                    escapeAllowed: true
                },
                // Priority 9: Floating Action Button Menu (z-index: 40)
                {
                    id: 'fab_menu',
                    isActive: function () {
                        const root = document.getElementById('invFabRoot');
                        return Boolean(invFabIsOpen || (root && root.classList.contains('is-open')));
                    },
                    undo: function () { window.closeFabMenu(); },
                    escapeAllowed: true
                },
                // Priority 10: Cart Modal -> New ERP Client Inline Form (z-index: 60)
                {
                    id: 'cart_new_client_form',
                    isActive: function () {
                        return isModalOpenById('cartModal') && isElVisibleById('quoteNewErpClientPanel');
                    },
                    undo: function () { window.toggleNewErpClientForm(false); },
                    escapeAllowed: true
                },
                // Priority 11: Cart Modal (z-index: 60)
                {
                    id: 'cart_modal',
                    isActive: function () { return isModalOpenById('cartModal'); },
                    undo: function () { window.closeCartModal(); },
                    escapeAllowed: true
                },
                // Priority 12a: Product Detail -> Related In-Stock Panel
                {
                    id: 'detail_related_stock',
                    isActive: function () {
                        return isModalOpenById('productDetailModal') &&
                            Boolean(relatedStockExpanded || isElVisibleById('detRelatedStockPanel'));
                    },
                    undo: function () {
                        if (relatedStockRefItem && relatedStockExpanded && typeof window.toggleRelatedInStockProducts === 'function') {
                            window.toggleRelatedInStockProducts();
                            return;
                        }
                        relatedStockExpanded = false;
                        const panel = document.getElementById('detRelatedStockPanel');
                        if (panel) panel.classList.add('hidden');
                    },
                    escapeAllowed: true
                },
                // Priority 12b: Product Detail -> Single Variant Back to Group Variants / Fabric Modules
                {
                    id: 'detail_back_to_variants',
                    isActive: function () {
                        return isModalOpenById('productDetailModal') &&
                            isElVisibleById('detSingleStep') &&
                            isElVisibleById('detGroupCrumb') &&
                            Boolean(currentGroup && Array.isArray(currentGroup.items) && currentGroup.items.length > 1);
                    },
                    undo: function () { window.backToCurrentGroupVariants(); },
                    escapeAllowed: true,
                    toast: 'Volviendo a módulos'
                },
                // Priority 12b2: Click 3 (Modules of Selected Color) -> Click 2 (Colors / Fabrics)
                {
                    id: 'fabric_back_to_colors',
                    isActive: function () {
                        return isModalOpenById('productDetailModal') &&
                            isElVisibleById('detVariantsStep') &&
                            Boolean(currentGroup && currentGroupFabricKey);
                    },
                    undo: function () { window.backToCurrentGroupVariants(); },
                    escapeAllowed: true,
                    toast: 'Volviendo a colores / telas'
                },
                // Priority 12b3: Bed Group Step 2 / Auto-Skipped Step 3 -> Step 1 (Sizes)
                {
                    id: 'bed_size_back_to_sizes',
                    isActive: function () {
                        return isModalOpenById('productDetailModal') &&
                            isElVisibleById('detVariantsStep') &&
                            Boolean(currentGroup && !currentGroupFabricKey && currentGroupBedSizeKey);
                    },
                    undo: function () { window.backToCurrentGroupVariants(); },
                    escapeAllowed: true,
                    toast: 'Volviendo a tamaños'
                },
                // Priority 12c: Product Detail Modal Close
                {
                    id: 'product_detail_modal',
                    isActive: function () { return isModalOpenById('productDetailModal'); },
                    undo: function () { window.closeProductDetail(); },
                    escapeAllowed: true
                },
                // Priority 13: Split-Screen Fotos Dock (z-index: 65)
                {
                    id: 'split_fotos_dock',
                    isActive: function () {
                        return Boolean(_invSplitActive || isElVisibleById('invSplitFotosDock'));
                    },
                    undo: function () { window.closeInvSplitFotosDock(); },
                    escapeAllowed: true,
                    toast: 'Pantalla dividida cerrada'
                },
                // Priority 14: Seguimiento Module View Unwind (search -> filters -> close module)
                {
                    id: 'seg_view',
                    isActive: function () { return activeInAppModule === 'seguimiento'; },
                    depthWeight: function () {
                        if (window.CreataSeguimientoModule && typeof window.CreataSeguimientoModule.getBackDepthWeight === 'function') {
                            return window.CreataSeguimientoModule.getBackDepthWeight();
                        }
                        return 1;
                    },
                    undo: function (ctx) {
                        if (window.CreataSeguimientoModule && typeof window.CreataSeguimientoModule.handleBackAction === 'function') {
                            return window.CreataSeguimientoModule.handleBackAction({ phase: 'view', source: ctx && ctx.source });
                        }
                        window.closeInAppModules();
                        return { handled: true, toast: 'Volviendo al inventario' };
                    },
                    escapeAllowed: false
                },
                // Priority 15: Historial Module View Unwind (search -> filters -> tab -> close module)
                {
                    id: 'hist_view',
                    isActive: function () { return activeInAppModule === 'historial'; },
                    depthWeight: function () {
                        if (window.CreataHistorialModule && typeof window.CreataHistorialModule.getBackDepthWeight === 'function') {
                            return window.CreataHistorialModule.getBackDepthWeight();
                        }
                        return 1;
                    },
                    undo: function (ctx) {
                        if (window.CreataHistorialModule && typeof window.CreataHistorialModule.handleBackAction === 'function') {
                            return window.CreataHistorialModule.handleBackAction({ phase: 'view', source: ctx && ctx.source });
                        }
                        window.closeInAppModules();
                        return { handled: true, toast: 'Volviendo al inventario' };
                    },
                    escapeAllowed: false
                },
                // Priority 16a: Home View Search
                {
                    id: 'inv_search',
                    isActive: function () {
                        if (activeInAppModule !== 'home') return false;
                        const inp = document.getElementById('invSearchInput');
                        return Boolean(inp && cleanStr(inp.value));
                    },
                    undo: function () { window.clearInvSearch(); },
                    escapeAllowed: false,
                    toast: 'Búsqueda limpiada'
                },
                // Priority 16a2: Home View Gear Sort / Finish / Size Filters
                {
                    id: 'inv_adv_filters',
                    isActive: function () {
                        return activeInAppModule === 'home' &&
                            typeof hasNonCategoryAdvancedFiltersOrSort === 'function' &&
                            hasNonCategoryAdvancedFiltersOrSort();
                    },
                    undo: function () {
                        if (typeof clearNonCategoryAdvancedFiltersAndSort === 'function') {
                            clearNonCategoryAdvancedFiltersAndSort();
                        }
                    },
                    escapeAllowed: false,
                    toast: 'Filtros restablecidos'
                },
                // Priority 16b: Home View Subcategory Filter
                {
                    id: 'inv_subcategory',
                    isActive: function () {
                        return activeInAppModule === 'home' && Boolean(activeSubCategory && activeSubCategory !== 'ALL');
                    },
                    undo: function () { window.setInvSubCategory('ALL'); },
                    escapeAllowed: false,
                    toast: 'Subcategoría: Todas'
                },
                // Priority 16c: Home View Category Filter
                {
                    id: 'inv_category',
                    isActive: function () {
                        return activeInAppModule === 'home' && Boolean(activeCategory && activeCategory !== 'ALL');
                    },
                    undo: function () { window.setInvCategory('ALL'); },
                    escapeAllowed: false,
                    toast: 'Categoría: Todas'
                }
                // Priority 17: Clean-root 2.5s double-back exit guard handled automatically by creata-back-nav.js
            ]
        });

        _invBackNav.init();
        window.__CREATA_INV_BACK_NAV__ = _invBackNav;
        return _invBackNav;
    }

    window.handleInventarioBackAction = function (opts) {
        const o = opts && typeof opts === 'object' ? opts : {};
        if (_invBackNav) {
            if (o.source === 'escape') {
                return _invBackNav.handleEscape();
            }
            return _invBackNav.stepBackOnce(o);
        }
        return { handled: false, blocked: false, stepId: null, toast: '', source: o.source || 'manual' };
    };

    function bindInvSplitResizerDrag() {
        const bar = document.getElementById('invSplitResizerBar');
        if (!bar) return;

        let dragging = false;

        const updateFromPointer = (clientX, clientY) => {
            if (!dragging || !_invSplitActive) return;
            const vw = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1);
            const vh = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1);
            const rawPct = _invSplitVertical ? ((clientY / vh) * 100) : ((clientX / vw) * 100);
            const clamped = Math.max(20, Math.min(80, Math.round(rawPct)));
            _invSplitPct = clamped;
            document.documentElement.style.setProperty('--inv-split-pct', clamped + '%');
            document.body.style.setProperty('--inv-split-pct', clamped + '%');
            const badge = document.getElementById('invSplitRatioBadge');
            if (badge) badge.textContent = clamped + '% / ' + (100 - clamped) + '%';
        };

        const stopDrag = () => {
            if (!dragging) return;
            dragging = false;
            document.body.classList.remove('inv-split-dragging');
            try { localStorage.setItem(INV_SPLIT_PCT_STORAGE, String(_invSplitPct)); } catch (e) {}
        };

        bar.addEventListener('mousedown', (ev) => {
            if (ev.target && ev.target.closest && ev.target.closest('.inv-split-presets')) return;
            dragging = true;
            document.body.classList.add('inv-split-dragging');
            ev.preventDefault();
        });

        window.addEventListener('mousemove', (ev) => {
            if (!dragging) return;
            updateFromPointer(ev.clientX, ev.clientY);
        });

        window.addEventListener('mouseup', stopDrag);

        bar.addEventListener('touchstart', (ev) => {
            if (ev.target && ev.target.closest && ev.target.closest('.inv-split-presets')) return;
            if (!ev.touches || !ev.touches.length) return;
            dragging = true;
            document.body.classList.add('inv-split-dragging');
        }, { passive: true });

        window.addEventListener('touchmove', (ev) => {
            if (!dragging || !ev.touches || !ev.touches.length) return;
            const t = ev.touches[0];
            updateFromPointer(t.clientX, t.clientY);
        }, { passive: true });

        window.addEventListener('touchend', stopDrag);
        window.addEventListener('touchcancel', stopDrag);
    }

    function applyRealtimePhotoUpdateInCotizador(skuRaw, rawPhotoUrl, rawFileId) {
        const targetSku = cleanStr(skuRaw).toUpperCase();
        if (!targetSku) return false;
        const it = bySkuMap.get(targetSku);
        if (!it) return false;

        const cleanNewUrl = cleanStr(rawPhotoUrl);
        // Ignorar blob: efímeros de otra ventana porque el canvas protegido usa crossOrigin=anonymous;
        // milisegundos después llega data:image/ o https://drive.google.com/... permanente.
        if (cleanNewUrl.indexOf('blob:') === 0) return false;

        const newFid = cleanStr(rawFileId) || extractDriveFileId(cleanNewUrl);
        if (newFid) {
            failedDrivePhotoIds.delete(newFid);
        }

        it.f = cleanNewUrl;
        it._hasPhoto = photoUrlForItem(it) ? 1 : 0;

        const singleGrp = singleBySkuMap.get(targetSku);
        if (singleGrp) {
            singleGrp._hasPhoto = it._hasPhoto;
        }
        const grp = it._groupKey ? groupsByKey.get(it._groupKey) : null;
        if (grp && Array.isArray(grp.items)) {
            grp._hasPhoto = (getGroupVisualCoverPhotoUrl(grp.key) || firstPhotoItem(grp.items)) ? 1 : 0;
        }

        const inp = document.getElementById('invSearchInput');
        if (typeof applyFilter === 'function') {
            applyFilter(inp ? inp.value : '', true);
        }

        const detailModal = document.getElementById('productDetailModal');
        const isModalOpen = !!(detailModal && detailModal.classList.contains('open'));
        if (isModalOpen) {
            if (currentDetailItem && cleanStr(currentDetailItem.s).toUpperCase() === targetSku) {
                const crumbEl = document.getElementById('detGroupCrumb');
                const crumbVisible = !!(crumbEl && !crumbEl.classList.contains('hidden'));
                _suppressInvPeerSkuNotifyOnce = true;
                renderDetailModal(currentDetailItem, crumbVisible && !!currentGroup);
                _suppressInvPeerSkuNotifyOnce = false;
            } else if (currentGroup && Array.isArray(currentGroup.items) && currentGroup.items.some(function (x) { return cleanStr(x && x.s).toUpperCase() === targetSku; })) {
                const varStep = document.getElementById('detVariantsStep');
                if (varStep && !varStep.classList.contains('hidden') && typeof renderGroupVariantsStep === 'function') {
                    renderGroupVariantsStep(currentGroup);
                }
            }
        }
        return true;
    }

    function handleIncomingFotosPeerMessageInCotizador(d) {
        if (!d || typeof d !== 'object') return;
        if (d.type === 'CREATA_SPLIT_TOGGLE_FROM_CHILD') {
            window.closeInvSplitFotosDock();
            return;
        }
        if (d.type === 'CREATA_SPLIT_PHOTO_SAVED' && d.sku) {
            const nextUrl = d.deleted ? '' : (d.photoUrl || '');
            applyRealtimePhotoUpdateInCotizador(d.sku, nextUrl, d.fileId || '');
            return;
        }
        if (d.type === 'CREATA_VISUAL_OVERRIDE_SAVED' && d.overrideKey) {
            const ovKey = String(d.overrideKey || '').trim().toUpperCase();
            if (!ovKey) return;
            const nextMap = Object.assign({}, invProductOverridesMap || {});
            if (d.deleted || !d.override) {
                delete nextMap[ovKey];
            } else {
                nextMap[ovKey] = d.override;
            }
            saveLocalProductOverridesMap(nextMap);
            rerenderCatalogAfterOverrideChange();
            return;
        }
        if (d.type === 'CREATA_SPLIT_SELECT_SKU' && d.source === 'fotos' && d.sku) {
            const targetSku = cleanStr(d.sku).toUpperCase();
            if (!targetSku || !bySkuMap.has(targetSku)) return;
            const detailModal = document.getElementById('productDetailModal');
            const detailAlreadyOpen = !!(detailModal && detailModal.classList.contains('open'));
            if (d.openDetail || detailAlreadyOpen) {
                if (!currentDetailItem || cleanStr(currentDetailItem.s).toUpperCase() !== targetSku) {
                    _suppressInvPeerSkuNotifyOnce = true;
                    window.openProductDetail(targetSku, false, true);
                    _suppressInvPeerSkuNotifyOnce = false;
                }
            }
        }
    }

    if (typeof window !== 'undefined') {
        bindInvSplitResizerDrag();

        // P0-08: Delegación segura de clics/cambios para elementos renderizados dinámicamente (sin onclick inline interpolado)
        if (typeof document !== 'undefined' && document.addEventListener) {
            document.addEventListener('click', function (ev) {
                if (!ev || !ev.target || typeof ev.target.closest !== 'function') return;
                const el = ev.target.closest('[data-inv-act]');
                if (!el) return;
                const act = el.getAttribute('data-inv-act');
                if (act === 'upload-model-opt') {
                    if (typeof window.selectUploadPhotoModelOption === 'function') window.selectUploadPhotoModelOption(el.getAttribute('data-sku') || '');
                } else if (act === 'subir-pren-pick') {
                    if (typeof window.selectDriveSubirPrenPhotoInCotizador === 'function') window.selectDriveSubirPrenPhotoInCotizador(el.getAttribute('data-fid') || '');
                } else if (act === 'switch-draft') {
                    if (typeof window.switchQuoteDraft === 'function') window.switchQuoteDraft(el.getAttribute('data-draft-id') || '');
                } else if (act === 'discard-draft') {
                    if (typeof window.discardQuoteDraft === 'function') window.discardQuoteDraft(el.getAttribute('data-draft-id') || '');
                } else if (act === 'cart-open-detail') {
                    if (typeof window.closeCartModal === 'function') window.closeCartModal();
                    if (typeof window.openProductDetail === 'function') window.openProductDetail(el.getAttribute('data-sku') || '', false, true);
                } else if (act === 'cart-qty') {
                    const delta = Number(el.getAttribute('data-delta')) || 0;
                    if (delta && typeof window.addToCart === 'function') window.addToCart(el.getAttribute('data-sku') || '', delta);
                } else if (act === 'cart-remove') {
                    if (typeof window.removeFromCart === 'function') window.removeFromCart(el.getAttribute('data-sku') || '');
                } else if (act === 'revoke-session') {
                    if (typeof window.revokeSingleSettingsSession === 'function') window.revokeSingleSettingsSession(el.getAttribute('data-dev-id') || '');
                } else if (act === 'edit-settings-prod') {
                    if (typeof window.selectSettingsProductForEdit === 'function') window.selectSettingsProductForEdit(el.getAttribute('data-sku') || '');
                }
            });
            document.addEventListener('change', function (ev) {
                const el = ev && ev.target;
                if (!el || typeof el.getAttribute !== 'function') return;
                if (el.getAttribute('data-inv-change') === 'cart-discount') {
                    if (typeof window.setCartItemDiscount === 'function') window.setCartItemDiscount(el.getAttribute('data-sku') || '', el.value);
                }
            });
        }

        // P1-20 / P1-28: Validar ev.origin en postMessage + puente de portapapeles PNG para Prompts IA embebido
        const PROMPTS_EMBED_ORIGIN_INV = 'https://buena-espero.onrender.com';
        const PROMPTS_EMBED_ORIGIN_ALT = 'https://app-1-3y7y.onrender.com';
        window.addEventListener('message', async function (ev) {
            if (!ev) return;
            const curOrigin = (window.location && window.location.origin) || '';
            const isSameOrigin = (ev.origin === curOrigin) || (!ev.origin && window.location && window.location.protocol === 'file:');
            const isPromptsOrigin = ev.origin === PROMPTS_EMBED_ORIGIN_INV || ev.origin === PROMPTS_EMBED_ORIGIN_ALT;
            if (!isSameOrigin && !isPromptsOrigin) return;
            const data = ev.data;
            if (!data || typeof data !== 'object') return;
            if (isPromptsOrigin) {
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
                                pngBlob = await new Promise(function (resolve, reject) {
                                    const img = new Image();
                                    img.onload = function () {
                                        try {
                                            const c = document.createElement('canvas');
                                            c.width = img.naturalWidth || img.width || 1;
                                            c.height = img.naturalHeight || img.height || 1;
                                            const ctx = c.getContext('2d');
                                            ctx.drawImage(img, 0, 0);
                                            c.toBlob(function (b) { return b ? resolve(b) : reject(new Error('toBlob')); }, 'image/png');
                                        } catch (eC) { reject(eC); }
                                    };
                                    img.onerror = function () { reject(new Error('img')); };
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
                            ev.source.postMessage({ type: 'CREATA_PROMPTS_COPY_IMAGE_RESULT', ok: ok, requestId: reqId }, ev.origin);
                        }
                    } catch (eReply) {}
                }
                return;
            }
            handleIncomingFotosPeerMessageInCotizador(data);
        });

        try {
            if (typeof BroadcastChannel === 'function') {
                const invSyncChannel = new BroadcastChannel(FOTOS_SYNC_BROADCAST_CHANNEL);
                invSyncChannel.onmessage = function (ev) {
                    handleIncomingFotosPeerMessageInCotizador(ev && ev.data);
                };
            }
        } catch (eBc) {}

        window.addEventListener('storage', function (ev) {
            if (!ev) return;
            if (ev.key === INV_PRODUCT_OVERRIDES_STORAGE) {
                try {
                    const parsedOvr = ev.newValue ? JSON.parse(ev.newValue) : {};
                    if (parsedOvr && typeof parsedOvr === 'object' && !Array.isArray(parsedOvr)) {
                        invProductOverridesMap = sanitizeProductOverridesMap(parsedOvr);
                        _vfabIndexMapRef = null;
                        rerenderCatalogAfterOverrideChange(true);
                    }
                } catch (eOvrSync) {}
                return;
            }
            if (ev.key !== FOTOS_SAVED_OVERRIDES_STORAGE_KEY && ev.key !== FOTOS_DELETED_QUEUE_STORAGE_KEY) {
                return;
            }
            if (Array.isArray(allItems) && allItems.length > 0 && applyStoredFotosOverridesToItems(allItems)) {
                indexItemsAndGroups();
                const inp = document.getElementById('invSearchInput');
                if (typeof applyFilter === 'function') {
                    applyFilter(inp ? inp.value : '', true);
                }
                const detailModal = document.getElementById('productDetailModal');
                if (detailModal && detailModal.classList.contains('open') && currentDetailItem) {
                    const crumbEl = document.getElementById('detGroupCrumb');
                    const crumbVisible = !!(crumbEl && !crumbEl.classList.contains('hidden'));
                    _suppressInvPeerSkuNotifyOnce = true;
                    renderDetailModal(currentDetailItem, crumbVisible && !!currentGroup);
                    _suppressInvPeerSkuNotifyOnce = false;
                }
            }
        });

        try {
            const urlParams = new URLSearchParams(window.location.search || '');
            if (urlParams.get('splitFotos') === '1' && isFotosAppOwner()) {
                loadInvSplitPrefs();
                _invSplitActive = true;
                applyInvSplitDomState();
            }
        } catch (eParam) {}
    }
