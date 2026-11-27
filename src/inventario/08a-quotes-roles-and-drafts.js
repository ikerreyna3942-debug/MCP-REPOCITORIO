    // ------------------------------------------------------------------------
    // SECCIÓN DE PDFs DE COTIZACIÓN GENERADOS · VISIBILIDAD ESTRICTA POR ROL Y BODEGA ACTIVA
    // - Asesor: solo sus propios PDFs generados en su bodega/tienda activa.
    // - Gerente: solo sus propios PDFs y los de los asesores de su bodega/tienda activa.
    // - Administrador: PDFs generados en la tienda/bodega seleccionada en #quoteAdminStoreSelect.
    // ------------------------------------------------------------------------
    function hasGeneratedErpQuotePdfClient(q) {
        if (!q || typeof q !== 'object') return false;
        const qidNum = parseInt(String(q.quoteId || '').replace(/[^\d]/g, ''), 10) || 0;
        if (qidNum > 0) return true;
        const rawOrder = cleanStr(q.orderCode);
        const fol = cleanStr(q.folio) || ((rawOrder && !/^[A-Z]+-\d+$/i.test(rawOrder)) ? rawOrder : '');
        if (!fol || /^[A-Z]+-\d+$/i.test(fol) || /^(EN PROCESO|PENDIENTE)$/i.test(fol)) return false;
        if (/EN COLA|REVISION/i.test(String(q.status || ''))) return false;
        return true;
    }

    function filterAllowedGeneratedQuotesClient(rawList) {
        if (!activeAdvisorSession || isGuestSession() || !Array.isArray(rawList) || !rawList.length) return [];
        const sess = activeAdvisorSession;
        const isAdmin = isEffectiveAdminSession();
        const isManager = !isAdmin && !isKevinAdvisorPreviewActive() && (!!sess.isManager || isManagerSessionUser(sess));
        const sessEmail = String(sess.correo || '').trim().toLowerCase();
        const previewStore = isKevinAdvisorPreviewActive() ? getKevinAdvisorPreviewStore() : '';

        const activeStoreNorm = isAdmin
            ? normalizeQuoteErpStoreClient(quoteDraftMeta.erpStore || sess.erpStore, '')
            : normalizeQuoteErpStoreClient(previewStore || sess.erpStore, previewStore ? '' : sess.sheetTab);

        const allowedManagerSet = new Set();
        if (sessEmail) allowedManagerSet.add(sessEmail);
        if (isManager && Array.isArray(sess.branchAdvisorEmails)) {
            for (let i = 0; i < sess.branchAdvisorEmails.length; i++) {
                const em = String(sess.branchAdvisorEmails[i] || '').trim().toLowerCase();
                if (em) allowedManagerSet.add(em);
            }
        }

        const seenKeys = new Set();
        const out = [];
        for (let i = 0; i < rawList.length; i++) {
            const q = rawList[i];
            if (!hasGeneratedErpQuotePdfClient(q)) continue;

            const rowStoreNorm = normalizeQuoteErpStoreClient(q.erpStore, q.branchTab);
            const rowEmail = String(q.advisorEmail || '').trim().toLowerCase();

            if (isAdmin) {
                if (activeStoreNorm && rowStoreNorm !== activeStoreNorm) continue;
            } else {
                if (!activeStoreNorm || rowStoreNorm !== activeStoreNorm) continue;
                if (isManager) {
                    if (!rowEmail || !allowedManagerSet.has(rowEmail)) continue;
                } else {
                    if (!sessEmail || rowEmail !== sessEmail) continue;
                }
            }

            const qidClean = cleanStr(q.quoteId);
            const folClean = cleanStr(q.folio) || cleanStr(q.orderCode);
            const dedupeKey = (qidClean ? ('ID:' + qidClean) : '') || (folClean ? ('F:' + folClean) : '');
            if (dedupeKey && seenKeys.has(dedupeKey)) continue;
            if (dedupeKey) seenKeys.add(dedupeKey);
            out.push(q);
        }
        return out;
    }

    window.openQuoteGeneratedPdfsModal = function () {
        if (isGuestSession()) return;
        if (!activeAdvisorSession || activeAdvisorSession.mustChangeKey) {
            openAuthModalForStartup();
            return;
        }
        renderMyRecentQuotes(myRecentQuotesList);
        const modalEl = document.getElementById('quoteGeneratedPdfsModal');
        if (modalEl) {
            modalEl.classList.add('open');
            notifyInvBackStatePush('quote_generated_pdfs_modal');
        }
        refreshMyLiveQuotesInfo(true);
    };

    window.closeQuoteGeneratedPdfsModal = function () {
        const modalEl = document.getElementById('quoteGeneratedPdfsModal');
        if (modalEl) modalEl.classList.remove('open');
    };

    window.scrollToGeneratedQuotePdfs = window.openQuoteGeneratedPdfsModal;

    function renderMyRecentQuotes(list) {
        const wrap = document.getElementById('quoteGeneratedPdfsSection');
        const listEl = document.getElementById('quoteGeneratedPdfsList');
        const emptyEl = document.getElementById('quoteGeneratedPdfsEmptyState');
        const titleEl = document.getElementById('quoteGeneratedPdfsTitle');
        const countBadge = document.getElementById('quoteGeneratedPdfsCountBadge');
        const verPdfBadge = document.getElementById('quoteVerPdfCountBadge');
        const hintEl = document.getElementById('quoteGeneratedPdfsRuleHint');
        const jumpBtn = document.getElementById('quoteJumpToPdfsBtn');
        const jumpCount = document.getElementById('quoteJumpToPdfsCount');

        if (Array.isArray(list)) {
            for (let i = 0; i < list.length; i++) {
                const qi = list[i] || {};
                if (qi.folio) registerObservedFolio(qi.folio, qi.erpStore);
                else if (qi.orderCode) registerObservedFolio(qi.orderCode, qi.erpStore);
            }
        }

        const filtered = filterAllowedGeneratedQuotesClient(list);
        const sess = activeAdvisorSession;
        const isAdmin = sess ? isEffectiveAdminSession() : false;
        const isManager = sess ? (!isAdmin && !isKevinAdvisorPreviewActive() && (!!sess.isManager || isManagerSessionUser(sess))) : false;
        const sessEmail = sess ? String(sess.correo || '').trim().toLowerCase() : '';
        const previewStore = sess && isKevinAdvisorPreviewActive() ? getKevinAdvisorPreviewStore() : '';
        const activeStoreDisplay = sess
            ? (isAdmin
                ? (cleanStr(quoteDraftMeta.erpStore) || cleanStr(sess.erpStore) || 'TIENDA ACTIVA')
                : (previewStore || cleanStr(sess.erpStore) || cleanStr(sess.branchLabel) || cleanStr(sess.sheetTab) || 'MI BODEGA'))
            : 'TIENDA ACTIVA';

        if (titleEl) {
            if (isAdmin) {
                titleEl.textContent = '📄 PDFs de Cotización Generados · ' + activeStoreDisplay;
            } else if (isManager) {
                titleEl.textContent = '📄 PDFs de Cotización (Mi Bodega y Asesores) · ' + activeStoreDisplay;
            } else {
                titleEl.textContent = '📄 Mis PDFs de Cotización · ' + activeStoreDisplay;
            }
        }
        if (hintEl) {
            if (!sess) {
                hintEl.textContent = '';
            } else if (isAdmin) {
                hintEl.textContent = 'PDFs generados en la tienda/bodega activa seleccionada (' + activeStoreDisplay + ').';
            } else if (isManager) {
                hintEl.textContent = 'Gerente: muestra únicamente tus propios PDFs y los generados por los asesores de ' + activeStoreDisplay + '.';
            } else {
                hintEl.textContent = 'Asesor: muestra únicamente tus propios PDFs generados en tu bodega activa (' + activeStoreDisplay + ').';
            }
        }
        if (countBadge) countBadge.textContent = String(filtered.length);
        if (verPdfBadge) {
            verPdfBadge.textContent = String(filtered.length);
            verPdfBadge.classList.toggle('hidden', filtered.length === 0);
        }
        if (jumpCount) jumpCount.textContent = String(filtered.length);

        if (!filtered.length || !sess) {
            if (listEl) listEl.innerHTML = '';
            if (emptyEl) emptyEl.classList.remove('hidden');
            if (wrap) wrap.classList.add('hidden');
            if (jumpBtn) jumpBtn.classList.add('hidden');
            return;
        }

        if (emptyEl) emptyEl.classList.add('hidden');
        if (jumpBtn) jumpBtn.classList.remove('hidden');
        if (!listEl) return;

        listEl.innerHTML = filtered.map(q => {
            const isProy = String(q.quoteType || '').toUpperCase() === 'PROYECTO' || /PROYECTO/i.test(String(q.erpStore || ''));
            const rawOrder = cleanStr(q.orderCode);
            const folioOfficial = cleanStr(q.folio) || ((rawOrder && !/^[A-Z]+-\d+$/i.test(rawOrder)) ? rawOrder : '');
            const qidVal = cleanStr(q.quoteId);
            const cleanFolio = folioOfficial || (qidVal ? ('ID-' + qidVal) : 'PDF');
            const storeTag = cleanStr(q.erpStore || q.branchTab) || activeStoreDisplay;
            const rowEmail = String(q.advisorEmail || '').trim().toLowerCase();
            const isOwnRow = !!(sessEmail && rowEmail === sessEmail);
            const advDisplayName = cleanStr(q.advisorName || q.erpAdvisor);
            const showAdvisorTag = (isAdmin || isManager) && advDisplayName;
            const cardKey = (qidVal ? ('ID:' + qidVal) : '') || (folioOfficial ? ('F:' + folioOfficial) : '');
            const isJustGenerated = !!(newlyGeneratedQuoteHighlightKey && cardKey === newlyGeneratedQuoteHighlightKey);

            return '<div class="rounded-lg border px-3 py-2.5 flex flex-wrap items-center justify-between gap-2 bg-white transition" ' +
                'style="border-color:' + (isJustGenerated ? '#10B981' : '#E1DBC5') + ';' + (isJustGenerated ? ' box-shadow:0 0 0 1px rgba(16,185,129,0.25);' : '') + '">' +
                '<div class="min-w-0">' +
                    '<div class="flex flex-wrap items-center gap-1.5">' +
                        '<span class="px-2 py-0.5 rounded-full text-[11px] font-extrabold uppercase" style="background:' + (isProy ? '#252C32' : '#A38251') + '; color:#FFFFFF;">' +
                            escapeHtml(cleanFolio) +
                        '</span>' +
                        '<span class="text-[11px] font-extrabold uppercase" style="color:#252C32;">' + escapeHtml(storeTag) + '</span>' +
                        '<span class="px-1.5 py-0.5 rounded text-[11px] font-extrabold uppercase" style="background:#ECFDF5; color:#065F46; border:1px solid #A7F3D0;">' +
                            (isJustGenerated ? '✓ PDF RECIÉN GENERADO' : '✓ PDF LISTO') +
                        '</span>' +
                        (qidVal ? ('<span class="text-[11px] font-bold opacity-70" style="color:#252C32;">(ID ERP ' + escapeHtml(qidVal) + ')</span>') : '') +
                    '</div>' +
                    '<div class="text-[11px] font-semibold truncate mt-0.5" style="color:#252C32;">' +
                        escapeHtml(q.clientName || 'Prospecto') +
                        (showAdvisorTag
                            ? (' · <span class="font-extrabold" style="color:#A38251;">' +
                                (isManager && isOwnRow ? ('Mi cotización (' + escapeHtml(advDisplayName) + ')') : ('Asesor: ' + escapeHtml(advDisplayName))) +
                               '</span>')
                            : '') +
                        (q.skusSummary ? (' · ' + escapeHtml(q.skusSummary)) : '') +
                    '</div>' +
                '</div>' +
                '<div class="text-right shrink-0 ml-auto flex flex-col items-end gap-1">' +
                    '<div>' +
                        '<div class="text-[11px] font-black" style="color:#A38251;">' + escapeHtml(q.total || '') + '</div>' +
                        '<div class="text-[11px] font-semibold opacity-70" style="color:#252C32;">' + escapeHtml(q.createdAt || '') + '</div>' +
                    '</div>' +
                    '<button type="button" data-erp-pdf-btn="1" ' +
                        'data-q-id="' + escapeHtml(qidVal) + '" ' +
                        'data-q-folio="' + escapeHtml(folioOfficial) + '" ' +
                        'data-q-uid="' + escapeHtml(cleanStr(q.erpUserId)) + '" ' +
                        'data-q-client="' + escapeHtml(cleanStr(q.clientName)) + '" ' +
                        'data-q-store="' + escapeHtml(cleanStr(q.erpStore || q.branchTab)) + '" ' +
                        'class="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider transition hover:opacity-90" ' +
                        'style="background:#252C32; color:#FFFFFF;" ' +
                        'title="Descargar PDF de cotización">' +
                        '⬇ Descargar PDF' +
                    '</button>' +
                '</div>' +
            '</div>';
        }).join('');

        listEl.querySelectorAll('button[data-erp-pdf-btn]').forEach(btn => {
            btn.addEventListener('click', function () {
                window.downloadOriginalErpQuotePdf({
                    quoteId: btn.getAttribute('data-q-id') || '',
                    folio: btn.getAttribute('data-q-folio') || '',
                    erpUserId: btn.getAttribute('data-q-uid') || '',
                    clientName: btn.getAttribute('data-q-client') || '',
                    erpStore: btn.getAttribute('data-q-store') || '',
                    autoTriggered: false,
                    triggerBtn: btn
                });
            });
        });

        if (wrap) wrap.classList.remove('hidden');
    }

    async function fetchQuotesLedgerGvizFallback() {
        if (!activeAdvisorSession) return [];
        if (!activeAdvisorSession.isAdmin && isManagerSessionUser(activeAdvisorSession) && !Array.isArray(activeAdvisorSession.branchAdvisorEmails)) {
            try {
                const liveUsers = await fetchAllAdvisorRowsLiveGviz();
                const mgrStoreNorm = normalizeQuoteErpStoreClient(activeAdvisorSession.erpStore, activeAdvisorSession.sheetTab);
                const allowed = [String(activeAdvisorSession.correo || '').trim().toLowerCase()];
                for (let uIdx = 0; uIdx < liveUsers.length; uIdx++) {
                    const u = liveUsers[uIdx];
                    if (!u || !u.correo || u.isAdmin || u.isManager) continue;
                    const uStoreNorm = normalizeQuoteErpStoreClient(u.erpStore, u.sheetTab);
                    const uEmail = String(u.correo).trim().toLowerCase();
                    if (uEmail && uStoreNorm === mgrStoreNorm && allowed.indexOf(uEmail) === -1) {
                        allowed.push(uEmail);
                    }
                }
                activeAdvisorSession.branchAdvisorEmails = allowed;
                saveAdvisorSession(activeAdvisorSession);
            } catch (e) {}
        }

        const rows = await fetchSheetCsvRows('COTIZACIONES_EN_VIVO');
        if (!rows || rows.length < 2) return [];
        const hdr = rows[0] || [];
        if (!/ORDEN|FOLIO/i.test(cleanStr(hdr[0]) + ' ' + cleanStr(hdr[1]))) return [];

        const rawItems = [];
        const minIdx = Math.max(1, rows.length - 400);
        for (let i = rows.length - 1; i >= minIdx; i--) {
            const r = rows[i] || [];
            const folioVal = cleanStr(r[1]) || cleanStr(r[0]);
            const storeVal = cleanStr(r[6]);
            if (folioVal) registerObservedFolio(folioVal, storeVal);
            rawItems.push({
                orderCode: cleanStr(r[0]),
                folio: cleanStr(r[1]),
                quoteId: cleanStr(r[2]),
                createdAt: cleanStr(r[3]),
                quoteType: cleanStr(r[4]),
                branchTab: cleanStr(r[5]),
                erpStore: storeVal,
                advisorEmail: cleanStr(r[7]).toLowerCase(),
                advisorName: cleanStr(r[8]),
                erpAdvisor: cleanStr(r[9]),
                erpUserId: cleanStr(r[10]),
                clientName: cleanStr(r[11]),
                itemsCount: cleanStr(r[16]),
                skusSummary: cleanStr(r[17]),
                total: cleanStr(r[21]),
                status: cleanStr(r[22])
            });
        }
        const limit = activeAdvisorSession.isAdmin ? 30 : (isManagerSessionUser(activeAdvisorSession) ? 25 : 15);
        return filterAllowedGeneratedQuotesClient(rawItems).slice(0, limit);
    }

    let lastMultiStoreDirectorySyncMs = 0;
    let lastMyLiveQuotesSyncMs = 0;
    let myLiveQuotesSyncInFlight = false;

    async function refreshMyLiveQuotesInfo(forceNow) {
        if (!activeAdvisorSession || activeAdvisorSession.mustChangeKey || isGuestSession()) {
            renderMyRecentQuotes([]);
            return;
        }
        const nowMs = Date.now();
        if (forceNow === false && (myLiveQuotesSyncInFlight || (nowMs - lastMyLiveQuotesSyncMs) < 15000)) {
            return;
        }
        lastMyLiveQuotesSyncMs = nowMs;
        myLiveQuotesSyncInFlight = true;
        const refreshBtn = document.getElementById('btnRefreshGeneratedQuotePdfs');
        if (refreshBtn && forceNow === true) {
            refreshBtn.disabled = true;
            refreshBtn.textContent = '⏳ Actualizando...';
        }
        try {
            if (nowMs - lastMultiStoreDirectorySyncMs > 45000) {
                lastMultiStoreDirectorySyncMs = nowMs;
                fetchAllAdvisorRowsLiveGviz().catch(() => {});
            }
            const effAdmin = isEffectiveAdminSession();
            const previewStore = isKevinAdvisorPreviewActive() ? getKevinAdvisorPreviewStore() : '';
            const activeTargetStore = (effAdmin && quoteDraftMeta.erpStore)
                ? quoteDraftMeta.erpStore
                : (previewStore || activeAdvisorSession.erpStore);
            currentNextOrderCode = getEstimatedStoreFolio(activeTargetStore, previewStore ? '' : activeAdvisorSession.orderPrefix);
            const nextBadge = document.getElementById('quoteNextOrderBadge');
            if (nextBadge) nextBadge.textContent = 'Folio: ' + currentNextOrderCode;

            if (activeAdvisorSession.authToken) {
                const res = await callInvWebAppPost('inv_my_quotes', {
                    authToken: activeAdvisorSession.authToken,
                    advisorEmail: activeAdvisorSession.correo,
                    sheetTab: activeAdvisorSession.sheetTab || '',
                    erpStore: activeTargetStore || ''
                }, 12000);

                if (res && res.ok) {
                    if (res.nextFolioByStore) {
                        applyServerFolioMap(res.nextFolioByStore);
                    }
                    let sessionChanged = false;
                    if (Array.isArray(res.branchAdvisorEmails) && res.branchAdvisorEmails.length > 0) {
                        activeAdvisorSession.branchAdvisorEmails = res.branchAdvisorEmails
                            .map(em => String(em || '').trim().toLowerCase())
                            .filter(Boolean);
                        if (Array.isArray(activeAdvisorSession.allLocations)) {
                            activeAdvisorSession.allLocations = activeAdvisorSession.allLocations.map(loc => {
                                if (loc && loc.sheetTab === activeAdvisorSession.sheetTab) {
                                    return Object.assign({}, loc, { branchAdvisorEmails: activeAdvisorSession.branchAdvisorEmails });
                                }
                                return loc;
                            });
                        }
                        sessionChanged = true;
                    }
                    if (res.advisor) {
                        const updatedAdv = enrichAdvisorLocation(res.advisor);
                        if (updatedAdv.erpAdvisorLabel) activeAdvisorSession.erpAdvisorLabel = updatedAdv.erpAdvisorLabel;
                        if (updatedAdv.erpAdvisorId) activeAdvisorSession.erpAdvisorId = updatedAdv.erpAdvisorId;
                        if (updatedAdv.maxDiscountPct !== null && updatedAdv.maxDiscountPct !== undefined) {
                            activeAdvisorSession.maxDiscountPct = updatedAdv.maxDiscountPct;
                        }
                        if (updatedAdv.isAdmin) activeAdvisorSession.isAdmin = true;
                        if (updatedAdv.isManager) activeAdvisorSession.isManager = true;
                        if (Array.isArray(updatedAdv.branchAdvisorEmails) && updatedAdv.branchAdvisorEmails.length > 0) {
                            activeAdvisorSession.branchAdvisorEmails = updatedAdv.branchAdvisorEmails;
                        }
                        sessionChanged = true;
                    }
                    if (sessionChanged) {
                        saveAdvisorSession(activeAdvisorSession);
                        renderAdvisorHeaderBar();
                    }
                    if (res.nextOrderCode && !/^[A-Z]+-\d+$/i.test(String(res.nextOrderCode))) {
                        currentNextOrderCode = cleanStr(res.nextOrderCode);
                        if (activeTargetStore) {
                            liveNextFolioByStore[String(activeTargetStore).toUpperCase()] = currentNextOrderCode;
                        }
                    } else {
                        currentNextOrderCode = getEstimatedStoreFolio(activeTargetStore, activeAdvisorSession.orderPrefix);
                    }
                    myRecentQuotesList = Array.isArray(res.recentQuotes) ? res.recentQuotes : [];
                    populateQuoteAdvisorControls();
                    renderMyRecentQuotes(myRecentQuotesList);
                    return;
                }
            }

            // Respaldo directo por lectura de COTIZACIONES_EN_VIVO filtrada estrictamente por rol y bodega activa
            const gvizQuotes = await fetchQuotesLedgerGvizFallback();
            currentNextOrderCode = getEstimatedStoreFolio(activeTargetStore, activeAdvisorSession.orderPrefix);
            myRecentQuotesList = gvizQuotes;
            populateQuoteAdvisorControls();
            renderMyRecentQuotes(myRecentQuotesList);
        } finally {
            myLiveQuotesSyncInFlight = false;
            if (refreshBtn) {
                refreshBtn.disabled = false;
                refreshBtn.textContent = '🔄 Actualizar';
            }
        }
    }

    window.refreshMyLiveQuotesInfo = refreshMyLiveQuotesInfo;

    function refreshMyLiveQuotesThrottled(forceNow) {
        if (!activeAdvisorSession || activeAdvisorSession.mustChangeKey || isGuestSession()) return;
        refreshMyLiveQuotesInfo(forceNow === true ? true : false).catch(() => {});
    }

    function populateAdminSelectorsUI(sess) {
        const adminWrap = document.getElementById('quoteAdminSelectorsWrap');
        const lockedGrid = document.getElementById('quoteLockedInfoGrid');
        const storeSel = document.getElementById('quoteAdminStoreSelect');
        const advSel = document.getElementById('quoteAdminAdvisorSelect');
        if (!adminWrap || !storeSel || !advSel) return;

        if (!sess || !isEffectiveAdminSession()) {
            adminWrap.classList.add('hidden');
            if (lockedGrid) lockedGrid.classList.remove('hidden');
            return;
        }

        adminWrap.classList.remove('hidden');
        if (lockedGrid) lockedGrid.classList.add('hidden');

        const canSwitchStore = typeof hasAdminPerm === 'function' ? hasAdminPerm('cambiarTienda') : true;
        const rawStoresList = erpStoresCatalog.length > 0 ? erpStoresCatalog.slice() : DEFAULT_ERP_STORES.slice();
        DEFAULT_ERP_STORES.forEach(ds => {
            if (rawStoresList.indexOf(ds) === -1) rawStoresList.push(ds);
        });

        const assignedStore = cleanStr(sess.erpStore) || 'CREATA PUERTO CANCUN';
        const targetStore = canSwitchStore
            ? (cleanStr(quoteDraftMeta.erpStore) || assignedStore)
            : assignedStore;
        const storesList = canSwitchStore ? rawStoresList : [assignedStore];
        if (storesList.indexOf(targetStore) === -1) storesList.unshift(targetStore);

        storeSel.innerHTML = storesList.map(st => {
            const pfx = getStoreFolioPrefix(st, '');
            const est = getEstimatedStoreFolio(st, pfx);
            return '<option value="' + escapeHtml(st) + '">' + escapeHtml(st + ' · Folio ' + est) + '</option>';
        }).join('');
        storeSel.value = targetStore;
        storeSel.disabled = !canSwitchStore;
        quoteDraftMeta.erpStore = targetStore;

        const targetStoreUp = targetStore.toUpperCase();
        const sameStoreAdvs = [];
        const otherAdvs = [];
        for (let i = 0; i < erpAdvisorsCatalog.length; i++) {
            const a = erpAdvisorsCatalog[i];
            if (!a || !a.id) continue;
            if (String(a.branch || '').trim().toUpperCase() === targetStoreUp) {
                sameStoreAdvs.push(a);
            } else {
                otherAdvs.push(a);
            }
        }

        let optsHtml = '';
        if (sameStoreAdvs.length > 0) {
            optsHtml += '<optgroup label="Usuarios de ' + escapeHtml(targetStore) + '">';
            sameStoreAdvs.forEach(a => {
                optsHtml += '<option value="' + escapeHtml(a.id) + '" data-label="' + escapeHtml(a.label) + '" data-branch="' + escapeHtml(a.branch || '') + '">' + escapeHtml(a.label) + '</option>';
            });
            optsHtml += '</optgroup>';
        }
        if (otherAdvs.length > 0) {
            optsHtml += '<optgroup label="Otros asesores">';
            otherAdvs.forEach(a => {
                optsHtml += '<option value="' + escapeHtml(a.id) + '" data-label="' + escapeHtml(a.label) + '" data-branch="' + escapeHtml(a.branch || '') + '">' + escapeHtml(a.label) + '</option>';
            });
            optsHtml += '</optgroup>';
        }
        if (!optsHtml && sess.erpAdvisorId) {
            const ownLbl = sess.erpAdvisorLabel || (sess.nombre + ' | ' + targetStore + ' [ID: ' + sess.erpAdvisorId + ']');
            optsHtml = '<option value="' + escapeHtml(sess.erpAdvisorId) + '" data-label="' + escapeHtml(ownLbl) + '" data-branch="' + escapeHtml(targetStore) + '">' + escapeHtml(ownLbl) + '</option>';
        }
        advSel.innerHTML = optsHtml;

        let desiredAdvId = cleanStr(quoteDraftMeta.erpAdvisorId);
        const hasDesiredInSameStore = desiredAdvId && sameStoreAdvs.some(a => String(a.id) === desiredAdvId);
        if (!hasDesiredInSameStore) {
            if (sess.erpAdvisorId && sameStoreAdvs.some(a => String(a.id) === String(sess.erpAdvisorId))) {
                desiredAdvId = String(sess.erpAdvisorId);
            } else if (sameStoreAdvs.length > 0) {
                desiredAdvId = String(sameStoreAdvs[0].id);
            } else if (sess.erpAdvisorId) {
                desiredAdvId = String(sess.erpAdvisorId);
            } else if (otherAdvs.length > 0) {
                desiredAdvId = String(otherAdvs[0].id);
            }
        }
        if (desiredAdvId) {
            advSel.value = desiredAdvId;
        }
        const selectedOpt = advSel.options[advSel.selectedIndex];
        if (selectedOpt) {
            quoteDraftMeta.erpAdvisorId = selectedOpt.value;
            quoteDraftMeta.erpAdvisorLabel = selectedOpt.getAttribute('data-label') || selectedOpt.textContent || '';
        }
    }

    window.onAdminStoreChange = function () {
        const storeSel = document.getElementById('quoteAdminStoreSelect');
        if (!storeSel || !activeAdvisorSession || !isEffectiveAdminSession()) return;
        quoteDraftMeta.erpStore = storeSel.value;
        // Al cambiar de tienda/bodega, elegir automáticamente un usuario de esa tienda para que S Mueblería emita el folio de esa tienda
        quoteDraftMeta.erpAdvisorId = '';
        quoteDraftMeta.erpAdvisorLabel = '';
        lastSubmittedQuoteMeta = null;
        populateQuoteAdvisorControls();
        saveQuoteDraftMeta();
        renderMyRecentQuotes(myRecentQuotesList);
        refreshMyLiveQuotesInfo();
    };

    window.onAdminAdvisorChange = function () {
        const advSel = document.getElementById('quoteAdminAdvisorSelect');
        if (!advSel || !activeAdvisorSession || !isEffectiveAdminSession()) return;
        const prevStore = cleanStr(quoteDraftMeta.erpStore);
        const opt = advSel.options[advSel.selectedIndex];
        if (opt) {
            quoteDraftMeta.erpAdvisorId = opt.value;
            quoteDraftMeta.erpAdvisorLabel = opt.getAttribute('data-label') || opt.textContent || '';
            const advBranch = cleanStr(opt.getAttribute('data-branch'));
            if (advBranch) {
                quoteDraftMeta.erpStore = advBranch;
            }
        }
        lastSubmittedQuoteMeta = null;
        saveQuoteDraftMeta();
        populateQuoteAdvisorControls();
        renderMyRecentQuotes(myRecentQuotesList);
        if (cleanStr(quoteDraftMeta.erpStore) !== prevStore) {
            refreshMyLiveQuotesInfo();
        }
    };

    function populateQuoteAdvisorControls(forceInputs) {
        const titleEl = document.getElementById('quoteModalTitle');
        const hdrInfo = document.getElementById('quoteHeaderAdvisorInfo');
        const originBadge = document.getElementById('quoteOriginTypeBadge');
        const nextOrderBadge = document.getElementById('quoteNextOrderBadge');
        const idBadge = document.getElementById('quoteErpUserIdBadge');
        const storeLbl = document.getElementById('quoteLockedStoreLabel');
        const storeTxt = document.getElementById('quoteLockedStoreText');
        const multiStoreSel = document.getElementById('quoteMultiStoreSelect');
        const advTxt = document.getElementById('quoteLockedAdvisorText');
        const emailTxt = document.getElementById('quoteLockedEmailText');
        const switchLocBtn = document.getElementById('quoteSwitchLocationBtn');
        const clientNameLbl = document.getElementById('quoteClientNameLabel');

        const modeSel = document.getElementById('quoteClientModeSelect');
        const catSel = document.getElementById('quoteCategorySelect');
        const nameInp = document.getElementById('quoteClientNameInput');
        const phoneInp = document.getElementById('quoteClientPhoneInput');
        const emailInp = document.getElementById('quoteClientEmailInput');
        const dateInp = document.getElementById('quoteDeliveryDateInput');
        const notesInp = document.getElementById('quoteNotesInput');
        const extraInp = document.getElementById('quoteExtraDiscountInput');

        const sess = activeAdvisorSession ? enrichAdvisorLocation(activeAdvisorSession) : null;
        if (sess && !sess.erpAdvisorLabel && erpAdvisorsCatalog.length > 0) {
            const matched = matchBestErpAdvisorClient(sess.nombre, sess.erpStore, erpAdvisorsCatalog);
            if (matched) {
                sess.erpAdvisorLabel = matched.label;
                sess.erpAdvisorId = matched.id;
                sess.erpAdvisorBranch = matched.branch;
                saveAdvisorSession(sess);
            }
        }

        populateAdminSelectorsUI(sess);

        const isAdmin = isEffectiveAdminSession();
        const previewStore = isKevinAdvisorPreviewActive() ? getKevinAdvisorPreviewStore() : '';
        const effectiveStore = isAdmin
            ? (cleanStr(quoteDraftMeta.erpStore) || (sess && sess.erpStore) || 'CEDIS')
            : (previewStore || (sess && sess.erpStore) || 'CREATA PUERTO CANCUN');
        const isProy = /PROYECTO/i.test(effectiveStore) || (!isAdmin && !previewStore && !!(sess && sess.isProyecto));
        const prefix = getStoreFolioPrefix(effectiveStore, previewStore ? '' : (sess && sess.orderPrefix));
        const folioEstimate = getEstimatedStoreFolio(effectiveStore, prefix);
        currentNextOrderCode = folioEstimate;

        const effectiveAdvisorLabel = isAdmin
            ? (cleanStr(quoteDraftMeta.erpAdvisorLabel) || (sess && sess.erpAdvisorLabel) || '')
            : ((sess && sess.erpAdvisorLabel) || '');
        const effectiveAdvisorId = isAdmin
            ? (cleanStr(quoteDraftMeta.erpAdvisorId) || extractErpIdFromLabel(effectiveAdvisorLabel) || (sess && sess.erpAdvisorId) || '')
            : ((sess && sess.erpAdvisorId) || extractErpIdFromLabel(effectiveAdvisorLabel) || '');

        if (titleEl) {
            if (isAdmin) {
                titleEl.textContent = 'Cotización · Admin';
            } else {
                titleEl.textContent = isProy
                    ? 'Cotización · Proyecto'
                    : 'Cotización';
            }
        }

        if (hdrInfo) {
            if (sess) {
                hdrInfo.textContent = (sess.nombre || sess.correo) + ' · ' +
                    (isAdmin ? ('ADMIN · ' + effectiveStore) : (isProy ? 'PROYECTO' : (sess.branchLabel || sess.sheetTab))) +
                    ' · Folio: ' + folioEstimate;
            } else {
                hdrInfo.textContent = '';
            }
        }

        if (originBadge) {
            originBadge.textContent = isAdmin
                ? ('ADMIN · ' + prefix)
                : (isProy ? ('PROYECTO · ' + prefix) : ('TIENDA · ' + prefix));
            originBadge.style.background = (isProy || isAdmin) ? '#1A1816' : '#9E7B4F';
            originBadge.style.color = '#FFFFFF';
        }

        if (nextOrderBadge) {
            nextOrderBadge.textContent = 'Folio: ' + folioEstimate;
        }

        if (idBadge) {
            idBadge.textContent = effectiveAdvisorId ? ('ID: ' + effectiveAdvisorId) : '';
        }

        const multiLocs = (sess && !isAdmin && !sess.isGuest && Array.isArray(sess.allLocations))
            ? sess.allLocations.filter(l => l && !l.isGuest)
            : [];

        if (storeLbl) {
            storeLbl.textContent = isProy ? 'Proyecto' : 'Sucursal';
        }
        if (multiStoreSel) {
            if (multiLocs.length > 1) {
                multiStoreSel.innerHTML = multiLocs.map(rawLoc => {
                    const loc = enrichAdvisorLocation(rawLoc);
                    const pfx = getStoreFolioPrefix(loc.erpStore, loc.orderPrefix);
                    const est = getEstimatedStoreFolio(loc.erpStore, pfx);
                    const labelText = (loc.erpStore || loc.branchLabel || loc.sheetTab) + ' · Folio ' + est;
                    return '<option value="' + escapeHtml(loc.sheetTab) + '">' + escapeHtml(labelText) + '</option>';
                }).join('');
                multiStoreSel.value = sess.sheetTab;
                multiStoreSel.classList.remove('hidden');
                if (storeTxt) storeTxt.classList.add('hidden');
            } else {
                multiStoreSel.classList.add('hidden');
                if (storeTxt) storeTxt.classList.remove('hidden');
            }
        }
        if (storeTxt) {
            storeTxt.textContent = sess ? (effectiveStore || '—') : 'Inicia sesión';
        }
        if (advTxt) {
            if (sess) {
                advTxt.textContent = effectiveAdvisorLabel ||
                    ((sess.nombre || sess.correo).toUpperCase() + ' | ' + effectiveStore);
            } else {
                advTxt.textContent = '—';
            }
        }
        if (emailTxt) {
            if (sess) {
                emailTxt.textContent = isAdmin
                    ? ('Sesión Administrador (' + sess.correo + ') · Viendo todas las tiendas · Emitiendo con serie ' + prefix + ' (' + effectiveStore + ')')
                    : ('Cuenta autenticada: ' + sess.correo + ' · Folio serie ' + prefix + ' (' + effectiveStore + ')');
            } else {
                emailTxt.textContent = '';
            }
        }
        if (switchLocBtn) {
            switchLocBtn.classList.toggle('hidden', multiLocs.length <= 1);
            if (multiLocs.length > 1) {
                switchLocBtn.textContent = 'Cambiar tienda (' + multiLocs.length + ')';
            }
        }

        if (clientNameLbl) {
            clientNameLbl.textContent = isProy ? 'Nombre del Proyecto / Cliente *' : 'Nombre del Cliente / Prospecto *';
        }
        if (nameInp) {
            nameInp.placeholder = isProy
                ? 'Ej. Proyecto Residencial / Nombre del cliente...'
                : 'Nombre completo del cliente o prospecto...';
        }

        syncDynamicClientModeOption();
        if (modeSel) modeSel.value = FIXED_QUOTE_CLIENT_MODE;
        if (catSel) catSel.value = FIXED_QUOTE_CATEGORY_LABEL;
        if (nameInp && (forceInputs || document.activeElement !== nameInp)) nameInp.value = quoteDraftMeta.clientName || '';
        if (phoneInp && (forceInputs || document.activeElement !== phoneInp)) phoneInp.value = quoteDraftMeta.clientPhone || '';
        if (emailInp && (forceInputs || document.activeElement !== emailInp)) emailInp.value = quoteDraftMeta.clientEmail || '';
        if (dateInp && (forceInputs || document.activeElement !== dateInp)) {
            dateInp.value = quoteDraftMeta.deliveryDateIso || getDefaultDeliveryIsoDate();
        }
        if (notesInp && (forceInputs || document.activeElement !== notesInp)) notesInp.value = quoteDraftMeta.notes || '';
        if (extraInp && (forceInputs || document.activeElement !== extraInp)) {
            extraInp.value = String(Math.max(0, Number(quoteDraftMeta.extraDiscount) || 0));
        }
        renderSelectedErpClientBadge();
        renderQuoteTotalsOnly();
    }

    window.onExtraDiscountChange = function () {
        saveQuoteDraftMeta();
        renderQuoteTotalsOnly();
    };

    // ------------------------------------------------------------------------
    // LÍMITE DE DESCUENTO (COLUMNA DESCUENTO EN HOJA DE USUARIOS / PUESTO)
    // ASESOR: 30% HASTA EL 30/11/2026 (24% A PARTIR DEL 01/12/2026) · GERENTE / SUBGERENTE / ADMINISTRADOR: 100%
    // ------------------------------------------------------------------------
    const ADVISOR_BASE_MAX_DISCOUNT_PCT = 24;
    const ADVISOR_PROMO_MAX_DISCOUNT_PCT = 30;
    const ADVISOR_PROMO_END_YMD = '2026-11-30'; // Vigencia inclusive hasta el 30 de noviembre de 2026 (America/Cancun)
    const MANAGER_MAX_DISCOUNT_PCT = 100;

    function getCancunTodayYmd() {
        try {
            const parts = new Intl.DateTimeFormat('en-CA', {
                timeZone: 'America/Cancun',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            }).formatToParts(new Date());
            const y = (parts.find(p => p.type === 'year') || {}).value;
            const m = (parts.find(p => p.type === 'month') || {}).value;
            const d = (parts.find(p => p.type === 'day') || {}).value;
            if (y && m && d) return y + '-' + m + '-' + d;
        } catch (e) {}
        const now = new Date();
        return now.getFullYear() + '-' +
            String(now.getMonth() + 1).padStart(2, '0') + '-' +
            String(now.getDate()).padStart(2, '0');
    }

    function isAdvisorDiscount30Active() {
        return getCancunTodayYmd() <= ADVISOR_PROMO_END_YMD;
    }

    function getEffectiveAdvisorMaxDiscountPct() {
        return isAdvisorDiscount30Active() ? ADVISOR_PROMO_MAX_DISCOUNT_PCT : ADVISOR_BASE_MAX_DISCOUNT_PCT;
    }

    function getAdvisorRoleInfo() {
        const sess = activeAdvisorSession;
        if (isGuestSession()) {
            return {
                puesto: 'INVITADO (SOLO VER)',
                isAdmin: false,
                isManager: false,
                isGuest: true,
                maxPct: 0
            };
        }
        if (isKevinAdvisorPreviewActive()) {
            return {
                puesto: 'ASESOR (VISTA PREVIA)',
                isAdmin: false,
                isManager: false,
                isGuest: false,
                maxPct: getEffectiveAdvisorMaxDiscountPct()
            };
        }
        const puestoRaw = cleanStr(sess && sess.puesto);
        const p = String(puestoRaw || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
        const isAdmin = !!(sess && sess.isAdmin) || /ADMINISTRADOR/.test(p);
        const isManager = isAdmin || /GERENTE|\bSUB/.test(p);
        const sheetPct = sess ? parseDiscountPctCell(sess.maxDiscountPct) : null;
        const promoActive = isAdvisorDiscount30Active();
        const advisorDefaultPct = getEffectiveAdvisorMaxDiscountPct();

        let maxPct;
        if (isAdmin) {
            maxPct = MANAGER_MAX_DISCOUNT_PCT;
        } else if (isManager) {
            maxPct = sheetPct !== null ? sheetPct : MANAGER_MAX_DISCOUNT_PCT;
        } else if (sheetPct !== null) {
            // Sincronizar automáticamente sesiones cacheadas en localStorage:
            // - Vigente hasta 30/11/2026: si la sesión guardó 24%, elevar a 30%
            // - A partir del 01/12/2026: si la sesión guardó 30%, regresar automáticamente a 24%
            if (promoActive && sheetPct === ADVISOR_BASE_MAX_DISCOUNT_PCT) {
                maxPct = ADVISOR_PROMO_MAX_DISCOUNT_PCT;
            } else if (!promoActive && sheetPct === ADVISOR_PROMO_MAX_DISCOUNT_PCT) {
                maxPct = ADVISOR_BASE_MAX_DISCOUNT_PCT;
            } else {
                maxPct = sheetPct;
            }
        } else {
            maxPct = advisorDefaultPct;
        }

        return {
            puesto: puestoRaw ? puestoRaw.toUpperCase() : (isAdmin ? 'ADMINISTRADOR GENERAL' : 'ASESOR'),
            isAdmin: isAdmin,
            isManager: isManager,
            maxPct: maxPct
        };
    }

    function getMaxDiscountPct() {
        return getAdvisorRoleInfo().maxPct;
    }

    // ------------------------------------------------------------------------
    // MÚLTIPLES COTIZACIONES ABIERTAS SIN GUARDAR (VIGENCIA MÁXIMA: 3 HORAS)
    // Y BLOQUEO / REINICIO AUTOMÁTICO AL TERMINAR Y CERRAR LA COTIZACIÓN
    // ------------------------------------------------------------------------
    const QUOTE_DRAFTS_KEY = 'creata_inv_quote_drafts_v1';
    const QUOTE_DRAFT_TTL_MS = 3 * 60 * 60 * 1000; // 3 horas ventana visual por sesión activa
    const QUOTE_ACTIVE_DRAFT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000; // 7 días de respaldo para borradores con productos o cliente ante corte de conexión
    let quoteDrafts = [];
    let activeQuoteDraftId = '';
    let quoteDraftsTimer = null;

    function cloneCartMap(src) {
        const out = {};
        if (!src || typeof src !== 'object') return out;
        Object.keys(src).forEach(k => {
            if (src[k] && typeof src[k] === 'object') {
                out[k] = Object.assign({}, src[k]);
            }
        });
        return out;
    }

    function isDraftUntouchedBlank(d) {
        if (!d || d.completed) return false;
        const hasItems = d.cart && Object.keys(d.cart).length > 0;
        const m = d.meta || {};
        const hasClient = !!(cleanStr(m.clientName) || cleanStr(m.clientPhone) || cleanStr(m.clientEmail) || cleanStr(m.notes) || Number(m.erpClientId) > 0 || Number(m.erpLeadId) > 0);
        return !hasItems && !hasClient;
    }

    function isQuoteDraftStillValid(d, nowTs) {
        if (!d || typeof d !== 'object') return false;
        const now = Number(nowTs) || Date.now();
        if ((Number(d.expiresAt) || 0) > now) return true;
        if (!isDraftUntouchedBlank(d)) {
            if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
            const lastTouch = Number(d.updatedAt) || Number(d.createdAt) || 0;
            if (lastTouch > 0 && (now - lastTouch) < QUOTE_ACTIVE_DRAFT_RETENTION_MS) {
                d.expiresAt = now + QUOTE_DRAFT_TTL_MS;
                return true;
            }
        }
        return false;
    }

    function buildFreshDraftObject(initialCart, initialMeta) {
        const now = Date.now();
        return {
            id: 'qd_' + now + '_' + Math.random().toString(36).slice(2, 7),
            createdAt: now,
            updatedAt: now,
            expiresAt: now + QUOTE_DRAFT_TTL_MS,
            completed: false,
            submittedMeta: null,
            cart: cloneCartMap(initialCart || {}),
            meta: Object.assign(createBlankQuoteMeta(), initialMeta || {}, {
                clientMode: FIXED_QUOTE_CLIENT_MODE,
                categoryLabel: FIXED_QUOTE_CATEGORY_LABEL
            })
        };
    }

    function getActiveQuoteDraft() {
        for (let i = 0; i < quoteDrafts.length; i++) {
            if (quoteDrafts[i].id === activeQuoteDraftId) return quoteDrafts[i];
        }
        return quoteDrafts[0] || null;
    }

    function isActiveQuoteCompleted() {
        const d = getActiveQuoteDraft();
        return !!(d && d.completed);
    }

    function persistQuoteDraftsToStorage() {
        try {
            localStorage.setItem(QUOTE_DRAFTS_KEY, JSON.stringify({
                activeId: activeQuoteDraftId,
                drafts: quoteDrafts
            }));
        } catch (e) {}
    }

    function syncActiveQuoteDraftStorage() {
        let d = getActiveQuoteDraft();
        if (!d) {
            d = buildFreshDraftObject(cart, quoteDraftMeta);
            quoteDrafts.push(d);
            activeQuoteDraftId = d.id;
        } else {
            const wasBlank = isDraftUntouchedBlank(d);
            d.cart = cloneCartMap(cart);
            d.meta = Object.assign(createBlankQuoteMeta(), quoteDraftMeta, {
                clientMode: FIXED_QUOTE_CLIENT_MODE,
                categoryLabel: FIXED_QUOTE_CATEGORY_LABEL
            });
            d.submittedMeta = lastSubmittedQuoteMeta ? Object.assign({}, lastSubmittedQuoteMeta) : null;
            d.updatedAt = Date.now();
            if (!isDraftUntouchedBlank(d)) {
                if (wasBlank) d.createdAt = d.updatedAt;
                d.expiresAt = Math.max(Number(d.expiresAt) || 0, d.updatedAt + QUOTE_DRAFT_TTL_MS);
            }
        }
        persistQuoteDraftsToStorage();
        renderQuoteDraftsBar();
    }

    function loadActiveDraftIntoMemory(d) {
        if (!d) return;
        activeQuoteDraftId = d.id;
        cart = cloneCartMap(d.cart || {});
        quoteDraftMeta = Object.assign(createBlankQuoteMeta(), d.meta || {}, {
            clientMode: FIXED_QUOTE_CLIENT_MODE,
            categoryLabel: FIXED_QUOTE_CATEGORY_LABEL
        });
        if (activeAdvisorSession && !activeAdvisorSession.isAdmin) {
            quoteDraftMeta.erpStore = activeAdvisorSession.erpStore || quoteDraftMeta.erpStore || '';
            quoteDraftMeta.erpAdvisorLabel = activeAdvisorSession.erpAdvisorLabel || quoteDraftMeta.erpAdvisorLabel || '';
            quoteDraftMeta.erpAdvisorId = activeAdvisorSession.erpAdvisorId || quoteDraftMeta.erpAdvisorId || '';
        }
        lastSubmittedQuoteMeta = d.submittedMeta ? Object.assign({}, d.submittedMeta) : null;
        try {
            if (d.completed) {
                localStorage.removeItem(CART_KEY);
                localStorage.removeItem(QUOTE_META_STORAGE);
                localStorage.removeItem(QUOTE_META_STORAGE_ALT);
            } else {
                const jsonMeta = JSON.stringify(quoteDraftMeta);
                localStorage.setItem(CART_KEY, JSON.stringify(cart));
                localStorage.setItem(QUOTE_META_STORAGE, jsonMeta);
                localStorage.setItem(QUOTE_META_STORAGE_ALT, jsonMeta);
            }
        } catch (e) {}
        persistQuoteDraftsToStorage();
        updateCartBadge();
    }

    function syncAllCartControlsUI() {
        const seen = new Set();
        document.querySelectorAll('[data-sku-ctrl]').forEach(el => {
            const k = el.getAttribute('data-sku-ctrl');
            if (k && !seen.has(k)) {
                seen.add(k);
                syncSkuCartControls(k);
            }
        });
        Object.keys(cart).forEach(k => {
            if (!seen.has(k)) syncSkuCartControls(k);
        });
        if (currentDetailItem && currentDetailItem.s) {
            syncSkuCartControls(String(currentDetailItem.s).toUpperCase());
        }
        updateCartBadge();
    }

    function formatRemainingDraftTime(expiresAt) {
        const remMs = Math.max(0, (Number(expiresAt) || 0) - Date.now());
        const totalMin = Math.ceil(remMs / 60000);
        if (totalMin <= 0) return '0m';
        const h = Math.floor(totalMin / 60);
        const m = totalMin % 60;
        if (h > 0) return h + 'h ' + String(m).padStart(2, '0') + 'm';
        return m + 'm';
    }

    function pruneExpiredQuoteDrafts(refreshUiIfChanged) {
        const now = Date.now();
        const beforeIds = quoteDrafts.map(d => d.id).join(',');
        quoteDrafts = quoteDrafts.filter(d => {
            if (!d || typeof d !== 'object') return false;
            if (d.completed) return true;
            return isQuoteDraftStillValid(d, now);
        });
        if (quoteDrafts.length === 0) {
            const fresh = buildFreshDraftObject({}, createBlankQuoteMeta());
            quoteDrafts.push(fresh);
            loadActiveDraftIntoMemory(fresh);
        } else if (!quoteDrafts.some(d => d.id === activeQuoteDraftId)) {
            loadActiveDraftIntoMemory(quoteDrafts[0]);
        }
        const afterIds = quoteDrafts.map(d => d.id).join(',');
        if (beforeIds !== afterIds) {
            persistQuoteDraftsToStorage();
            syncAllCartControlsUI();
            if (refreshUiIfChanged) {
                populateQuoteAdvisorControls(true);
                renderCartItems();
                applyQuoteCompletedLockUI();
            }
        }
        renderQuoteDraftsBar();
    }

    function initQuoteDraftsSystem() {
        let loaded = null;
        try {
            loaded = JSON.parse(localStorage.getItem(QUOTE_DRAFTS_KEY) || 'null');
        } catch (e) {}

        const now = Date.now();
        if (loaded && Array.isArray(loaded.drafts) && loaded.drafts.length > 0) {
            // Al abrir / recargar la pestaña del navegador, conservar todos los borradores no completados (protegiendo los que tienen productos o cliente)
            quoteDrafts = loaded.drafts
                .filter(d => d && !d.completed && isQuoteDraftStillValid(d, now))
                .map(d => {
                    d.meta = Object.assign(createBlankQuoteMeta(), d.meta || {}, {
                        clientMode: FIXED_QUOTE_CLIENT_MODE,
                        categoryLabel: FIXED_QUOTE_CATEGORY_LABEL
                    });
                    return d;
                });
            activeQuoteDraftId = String(loaded.activeId || '');
        } else {
            // Migrar carrito / metadatos previos en caso de existir
            const legacyCart = loadCart();
            const legacyMeta = loadQuoteDraftMeta();
            const initial = buildFreshDraftObject(legacyCart, legacyMeta);
            quoteDrafts = [initial];
            activeQuoteDraftId = initial.id;
        }

        if (quoteDrafts.length === 0) {
            const legacyCart = loadCart();
            const legacyMeta = loadQuoteDraftMeta();
            const fresh = buildFreshDraftObject(legacyCart, legacyMeta);
            quoteDrafts = [fresh];
            activeQuoteDraftId = fresh.id;
        }
        const chosen = getActiveQuoteDraft() || quoteDrafts[0];
        loadActiveDraftIntoMemory(chosen);

        if (quoteDraftsTimer) clearInterval(quoteDraftsTimer);
        quoteDraftsTimer = setInterval(function () {
            pruneExpiredQuoteDrafts(true);
        }, 15000);
    }

    function purgeCompletedQuoteDraftsOnExit() {
        const hadCompleted = quoteDrafts.some(d => d && d.completed);
        if (!hadCompleted) return;
        const now = Date.now();
        quoteDrafts = quoteDrafts.filter(d => d && !d.completed && isQuoteDraftStillValid(d, now));
        if (!quoteDrafts.some(d => isDraftUntouchedBlank(d))) {
            const fresh = buildFreshDraftObject({}, createBlankQuoteMeta());
            quoteDrafts.push(fresh);
            activeQuoteDraftId = fresh.id;
        } else {
            const blank = quoteDrafts.find(d => isDraftUntouchedBlank(d)) || quoteDrafts[0];
            activeQuoteDraftId = blank.id;
        }
        const activeNow = getActiveQuoteDraft();
        try {
            const jsonMeta = JSON.stringify((activeNow && activeNow.meta) || createBlankQuoteMeta());
            localStorage.setItem(CART_KEY, JSON.stringify((activeNow && activeNow.cart) || {}));
            localStorage.setItem(QUOTE_META_STORAGE, jsonMeta);
            localStorage.setItem(QUOTE_META_STORAGE_ALT, jsonMeta);
        } catch (e) {}
        persistQuoteDraftsToStorage();
    }

    function purgeCompletedAndActivateBlankDraft() {
        const prevAdminStore = (activeAdvisorSession && activeAdvisorSession.isAdmin) ? cleanStr(quoteDraftMeta.erpStore) : '';
        const prevAdminAdvId = (activeAdvisorSession && activeAdvisorSession.isAdmin) ? cleanStr(quoteDraftMeta.erpAdvisorId) : '';
        const prevAdminAdvLbl = (activeAdvisorSession && activeAdvisorSession.isAdmin) ? cleanStr(quoteDraftMeta.erpAdvisorLabel) : '';
        const now = Date.now();
        quoteDrafts = quoteDrafts.filter(d => d && !d.completed && isQuoteDraftStillValid(d, now));
        let nextBlank = quoteDrafts.find(d => isDraftUntouchedBlank(d));
        if (!nextBlank) {
            const blankMeta = createBlankQuoteMeta();
            if (prevAdminStore) {
                blankMeta.erpStore = prevAdminStore;
                blankMeta.erpAdvisorId = prevAdminAdvId;
                blankMeta.erpAdvisorLabel = prevAdminAdvLbl;
            }
            nextBlank = buildFreshDraftObject({}, blankMeta);
            quoteDrafts.push(nextBlank);
        } else if (prevAdminStore && nextBlank.meta && !cleanStr(nextBlank.meta.erpStore)) {
            nextBlank.meta.erpStore = prevAdminStore;
            nextBlank.meta.erpAdvisorId = prevAdminAdvId;
            nextBlank.meta.erpAdvisorLabel = prevAdminAdvLbl;
        }
        loadActiveDraftIntoMemory(nextBlank);
        syncAllCartControlsUI();
        renderQuoteStatusBanner('', '');
        toggleNewErpClientForm(false);
        const resEl = document.getElementById('quoteErpClientResults');
        if (resEl) {
            resEl.innerHTML = '';
            resEl.classList.add('hidden');
        }
        const searchEl = document.getElementById('quoteErpClientSearchInput');
        if (searchEl) searchEl.value = '';
        populateQuoteAdvisorControls(true);
        renderCartItems();
        applyQuoteCompletedLockUI();
        renderQuoteDraftsBar();
        renderMyRecentQuotes(myRecentQuotesList);
    }

    function markActiveQuoteCompleted(submittedMetaObj) {
        const d = getActiveQuoteDraft();
        if (d) {
            d.completed = true;
            d.submittedMeta = submittedMetaObj ? Object.assign({}, submittedMetaObj) : null;
            d.updatedAt = Date.now();
        }
        try {
            localStorage.removeItem(CART_KEY);
            localStorage.removeItem(QUOTE_META_STORAGE);
            localStorage.removeItem(QUOTE_META_STORAGE_ALT);
        } catch (e) {}
        persistQuoteDraftsToStorage();
        syncAllCartControlsUI();
        renderCartItems();
        applyQuoteCompletedLockUI();
        renderQuoteDraftsBar();
    }

    function applyQuoteCompletedLockUI() {
        const locked = isActiveQuoteCompleted();
        const banner = document.getElementById('quoteCompletedBanner');
        if (banner) banner.classList.toggle('hidden', !locked);

        const sec2 = document.getElementById('quoteSection2Fieldset');
        if (sec2) {
            sec2.querySelectorAll('input, select, textarea, button').forEach(el => {
                el.disabled = locked;
            });
            sec2.style.opacity = locked ? '0.68' : '1';
        }
        const extraInp = document.getElementById('quoteExtraDiscountInput');
        if (extraInp) extraInp.disabled = locked;
        const adminStoreSel = document.getElementById('quoteAdminStoreSelect');
        const adminAdvSel = document.getElementById('quoteAdminAdvisorSelect');
        const canSwitchStore = typeof hasAdminPerm === 'function' ? hasAdminPerm('cambiarTienda') : true;
        if (adminStoreSel) adminStoreSel.disabled = locked || !canSwitchStore;
        if (adminAdvSel) adminAdvSel.disabled = locked;

        const btnRev = document.getElementById('btnLoadPlantillaReview');
        const btnSend = document.getElementById('btnSendQuoteErp');
        const btnClear = document.querySelector('#cartModal button[onclick="clearCart()"]');
        if (btnRev) {
            btnRev.disabled = locked || quoteSubmitInFlight;
            btnRev.style.opacity = locked ? '0.45' : '1';
        }
        if (btnSend) {
            btnSend.disabled = locked || quoteSubmitInFlight;
            btnSend.style.opacity = locked ? '0.45' : '1';
        }
        if (btnClear) {
            btnClear.disabled = locked;
            btnClear.style.opacity = locked ? '0.45' : '1';
        }
    }

    function renderQuoteDraftsBar() {
        const listEl = document.getElementById('quoteDraftsTabsList');
        if (!listEl) return;

        const html = quoteDrafts.map((d, idx) => {
            const isAct = d.id === activeQuoteDraftId;
            const qtySum = Object.values(d.cart || {}).reduce((s, r) => s + (Number(r && r.qty) || 0), 0);
            const cliShort = cleanStr(d.meta && d.meta.clientName);
            const titleTxt = cliShort
                ? (cliShort.length > 18 ? (cliShort.slice(0, 18) + '…') : cliShort)
                : ('Cotización ' + (idx + 1));
            const statusPart = d.completed
                ? ('✓ ' + ((d.submittedMeta && d.submittedMeta.folio) ? d.submittedMeta.folio : 'Emitida'))
                : ((qtySum > 0 ? (qtySum + 'pz ') : '') + '⏱' + formatRemainingDraftTime(d.expiresAt).replace(/\s+/g, ''));

            const bg = isAct ? '#252C32' : '#FFFFFF';
            const fg = isAct ? '#FFFFFF' : '#252C32';
            const brd = isAct ? '#252C32' : (d.completed ? '#A7F3D0' : '#E1DBC5');
            const subColor = isAct ? '#E1DBC5' : '#A38251';
            const canDiscard = quoteDrafts.length > 1 || !isDraftUntouchedBlank(d) || d.completed;

            return '<div class="inline-flex items-center rounded-full border text-[11px] font-bold transition overflow-hidden" ' +
                'style="background:' + bg + '; color:' + fg + '; border-color:' + brd + ';">' +
                '<button type="button" data-inv-act="switch-draft" data-draft-id="' + escapeHtml(d.id) + '" class="px-2.5 py-1 flex items-center gap-1.5 text-left">' +
                    '<span class="font-extrabold uppercase truncate max-w-[130px]">' + escapeHtml(titleTxt) + '</span>' +
                    '<span class="text-[11px] font-bold" style="color:' + subColor + ';">(' + escapeHtml(statusPart) + ')</span>' +
                '</button>' +
                (canDiscard
                    ? ('<button type="button" title="Cerrar / descartar esta cotización" data-inv-act="discard-draft" data-draft-id="' + escapeHtml(d.id) + '" ' +
                        'class="pr-2.5 pl-1 py-1 text-[11px] font-extrabold opacity-75 hover:opacity-100">✕</button>')
                    : '') +
            '</div>';
        }).join('');

        listEl.innerHTML = html;
    }

    window.createNewQuoteDraft = function (switchNow) {
        pruneExpiredQuoteDrafts(false);
        // Si la cotización activa ya estaba terminada, descartarla de inmediato al abrir la nueva
        if (isActiveQuoteCompleted()) {
            quoteDrafts = quoteDrafts.filter(d => d && !d.completed);
        } else {
            syncActiveQuoteDraftStorage();
        }
        const fresh = buildFreshDraftObject({}, createBlankQuoteMeta());
        quoteDrafts.push(fresh);
        if (switchNow !== false) {
            loadActiveDraftIntoMemory(fresh);
            syncAllCartControlsUI();
            renderQuoteStatusBanner('', '');
            toggleNewErpClientForm(false);
            populateQuoteAdvisorControls(true);
            renderCartItems();
            applyQuoteCompletedLockUI();
        } else {
            persistQuoteDraftsToStorage();
        }
        renderQuoteDraftsBar();
        const nameInp = document.getElementById('quoteClientNameInput');
        if (nameInp && !nameInp.disabled) setTimeout(() => nameInp.focus(), 40);
    };

    window.switchQuoteDraft = function (draftId) {
        if (!draftId || draftId === activeQuoteDraftId) return;
        pruneExpiredQuoteDrafts(false);
        const target = quoteDrafts.find(d => d.id === draftId);
        if (!target) return;
        if (!isActiveQuoteCompleted()) {
            syncActiveQuoteDraftStorage();
        }
        loadActiveDraftIntoMemory(target);
        syncAllCartControlsUI();
        renderQuoteStatusBanner('', '');
        toggleNewErpClientForm(false);
        populateQuoteAdvisorControls(true);
        renderCartItems();
        applyQuoteCompletedLockUI();
        renderQuoteDraftsBar();
    };

    window.discardQuoteDraft = function (draftId) {
        const target = quoteDrafts.find(d => d.id === draftId);
        if (!target) return;
        quoteDrafts = quoteDrafts.filter(d => d.id !== draftId);
        if (quoteDrafts.length === 0) {
            const fresh = buildFreshDraftObject({}, createBlankQuoteMeta());
            quoteDrafts.push(fresh);
            loadActiveDraftIntoMemory(fresh);
        } else if (activeQuoteDraftId === draftId) {
            loadActiveDraftIntoMemory(quoteDrafts[quoteDrafts.length - 1]);
        } else {
            persistQuoteDraftsToStorage();
        }
        syncAllCartControlsUI();
        renderQuoteStatusBanner('', '');
        populateQuoteAdvisorControls(true);
        renderCartItems();
        applyQuoteCompletedLockUI();
        renderQuoteDraftsBar();
    };

    window.startFreshQuoteAfterCompleted = function () {
        purgeCompletedAndActivateBlankDraft();
        const nameInp = document.getElementById('quoteClientNameInput');
        if (nameInp && !nameInp.disabled) setTimeout(() => nameInp.focus(), 40);
    };
