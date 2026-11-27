    // ========================================================================
    // MÓDULO DE CONFIGURACIÓN POR ROL (ASESORES Y ADMINISTRADOR KEVIN)
    // ========================================================================
    let settingsSelectedProductSku = '';
    let settingsPassInFlight = false;
    let settingsProdInFlight = false;
    let settingsOverridesSyncedOnce = false;

    function setSettingsStatusBox(elId, msg, tone) {
        const el = document.getElementById(elId);
        if (!el) return;
        const clean = cleanStr(msg);
        if (!clean) {
            el.textContent = '';
            el.className = 'inv-settings-status hidden';
            return;
        }
        el.textContent = clean;
        el.className = 'inv-settings-status ' + (tone === 'ok' ? 'is-ok' : (tone === 'warn' ? 'is-warn' : 'is-err'));
    }

    let _lastOverridesFingerprintInv = '';

    function computeOverridesFingerprintInv(mapObj) {
        if (!mapObj || typeof mapObj !== 'object') return '';
        const keys = Object.keys(mapObj).sort();
        const parts = new Array(keys.length);
        for (let i = 0; i < keys.length; i++) {
            const k = keys[i];
            const e = mapObj[k] || {};
            parts[i] = k + '|' + (e.status || '') + '|' + (e.name || '') + '|' + (e.category || '') + '|' + (e.price == null ? '' : e.price) + '|' + (e.note || '') + '|' + (e.updatedAt || '');
        }
        return parts.join('\n');
    }

    function saveLocalProductOverridesMap(mapObj) {
        invProductOverridesMap = sanitizeProductOverridesMap(mapObj);
        _vfabIndexMapRef = null;
        _lastOverridesFingerprintInv = computeOverridesFingerprintInv(invProductOverridesMap);
        try {
            localStorage.setItem(INV_PRODUCT_OVERRIDES_STORAGE, JSON.stringify(invProductOverridesMap));
        } catch (e) {}
    }

    function rerenderCatalogAfterOverrideChange(preserveCount) {
        try {
            applyAllProductOverridesToCatalog();
            if (typeof indexItemsAndGroups === 'function') {
                indexItemsAndGroups();
            } else if (Array.isArray(allGroups)) {
                for (let i = 0; i < allGroups.length; i++) {
                    const g = allGroups[i];
                    g._hasPhoto = (getGroupVisualCoverPhotoUrl(g.key) || firstPhotoItem(g.items)) ? 1 : 0;
                }
            }
            if (typeof renderCategoryBar === 'function') renderCategoryBar();
            const inp = document.getElementById('invSearchInput');
            if (typeof applyFilter === 'function') applyFilter(inp ? inp.value : '', !!preserveCount);
            if (currentGroup && !currentDetailItem && isModalOpenById('productDetailModal')) {
                const updatedGroup = Array.isArray(allGroups) ? allGroups.find(g => g.key === currentGroup.key) : null;
                if (updatedGroup) {
                    currentGroup = updatedGroup;
                    renderGroupVariantsStep(currentGroup);
                } else if (typeof window.closeProductDetail === 'function') {
                    window.closeProductDetail();
                }
            }
        } catch (e) {}
    }

    // ------------------------------------------------------------------------
    // GESTOR DE FOTOS VISUALES (SOLO KEVIN): PORTADA DE INICIO Y FOTO DE TELA
    // ------------------------------------------------------------------------
    let visualPhotoPickerCtx = null; // { kind: 'cover'|'fabric', overrideKey, targetKey, label }
    let visualPhotoInFlight = false;

    function normalizeVisualPhotoDataUrl(file, maxSide, quality) {
        return new Promise((resolve, reject) => {
            if (!file) return reject(new Error('Sin archivo.'));
            const reader = new FileReader();
            reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
            reader.onload = () => {
                const rawDataUrl = String(reader.result || '');
                if (typeof Image === 'undefined' || typeof document === 'undefined' || !document.createElement) {
                    resolve(rawDataUrl);
                    return;
                }
                const img = new Image();
                img.onerror = () => resolve(rawDataUrl);
                img.onload = () => {
                    try {
                        const w = img.naturalWidth || img.width || 0;
                        const h = img.naturalHeight || img.height || 0;
                        if (!w || !h) { resolve(rawDataUrl); return; }
                        const cap = Number(maxSide) || 1100;
                        const scale = Math.min(1, cap / Math.max(w, h));
                        const tw = Math.max(1, Math.round(w * scale));
                        const th = Math.max(1, Math.round(h * scale));
                        const cvs = document.createElement('canvas');
                        cvs.width = tw;
                        cvs.height = th;
                        const ctx = cvs.getContext('2d');
                        if (!ctx) { resolve(rawDataUrl); return; }
                        ctx.fillStyle = '#FFFFFF';
                        ctx.fillRect(0, 0, tw, th);
                        ctx.drawImage(img, 0, 0, tw, th);
                        resolve(cvs.toDataURL('image/jpeg', typeof quality === 'number' ? quality : 0.84));
                    } catch (eCvs) {
                        resolve(rawDataUrl);
                    }
                };
                img.src = rawDataUrl;
            };
            reader.readAsDataURL(file);
        });
    }

    function updateVisualPhotoPickerPreview(rawUrl) {
        const wrap = document.getElementById('visualPhotoPreviewWrap');
        const img = document.getElementById('visualPhotoPreviewImg');
        const clrBtn = document.getElementById('visualPhotoClearBtn');
        const src = resolveVisualImgSrc(rawUrl, 600);
        if (wrap && img) {
            if (src) {
                img.src = src;
                wrap.classList.remove('hidden');
            } else {
                img.src = '';
                wrap.classList.add('hidden');
            }
        }
        if (clrBtn) clrBtn.classList.toggle('hidden', !src);
    }

    async function persistVisualPhotoOverride(overrideKey, kind, displayLabel, photoUrl, opMode) {
        const k = String(overrideKey || '').trim().toUpperCase();
        if (!k) return { ok: false, error: 'Clave inválida.' };
        const op = opMode === 'DELETE' ? 'DELETE' : 'SAVE';
        const nextUrl = op === 'DELETE' ? '' : sanitizeVisualOverrideUrl(cleanStr(photoUrl));
        if (op === 'SAVE' && !nextUrl) {
            return { ok: false, error: 'URL de imagen inválida (no se permiten enlaces temporales blob: ni data:).' };
        }
        const categoryTag = kind === 'fabric' ? 'FABRIC_SWATCH' : (kind === 'wood' ? 'WOOD_SWATCH' : 'VISUAL_COVER');

        // Actualizar de inmediato localmente para respuesta instantánea
        const nextMap = Object.assign({}, invProductOverridesMap || {});
        if (op === 'DELETE') {
            delete nextMap[k];
        } else {
            nextMap[k] = {
                sku: k,
                status: 'VISIBLE',
                name: cleanStr(displayLabel).slice(0, 140),
                category: categoryTag,
                price: null,
                note: nextUrl,
                updatedBy: (activeAdvisorSession && activeAdvisorSession.correo) || '',
                updatedAt: new Date().toISOString()
            };
        }
        saveLocalProductOverridesMap(nextMap);
        rerenderCatalogAfterOverrideChange(true);

        // Sincronizar a _INV_PRODUCT_OVERRIDES en Google Sheets (visible para todos los dispositivos y asesores)
        if (!activeAdvisorSession || !activeAdvisorSession.authToken) {
            return { ok: true, localOnly: true };
        }
        const res = await callInvWebAppPost('inv_product_override_save', {
            authToken: activeAdvisorSession.authToken || '',
            advisorEmail: activeAdvisorSession.correo || '',
            sku: k,
            op: op === 'DELETE' ? 'DELETE' : 'RESTORE',
            name: cleanStr(displayLabel).slice(0, 140),
            category: categoryTag,
            note: nextUrl
        }, 20000);
        if (res && res.ok) {
            return { ok: true, synced: true };
        }
        return { ok: false, error: (res && res.error) || 'Guardado localmente (no se pudo sincronizar con la nube).' };
    }

    window.openVisualPhotoPicker = function (kind, targetKey, displayLabel) {
        if (!isVisualPhotoEditorAllowed()) return;
        const kMode = kind === 'fabric' ? 'fabric' : (kind === 'wood' ? 'wood' : 'cover');
        const overrideKey = kMode === 'fabric'
            ? buildFabricSwatchOverrideKey(targetKey)
            : (kMode === 'wood' ? buildWoodSwatchOverrideKey(targetKey) : buildVisualCoverOverrideKey(targetKey));
        if (!overrideKey) return;

        visualPhotoPickerCtx = {
            kind: kMode,
            overrideKey: overrideKey,
            targetKey: String(targetKey || ''),
            label: cleanStr(displayLabel || targetKey)
        };

        const modal = document.getElementById('visualPhotoPickerModal');
        const eyebrow = document.getElementById('visualPhotoPickerEyebrow');
        const titleEl = document.getElementById('visualPhotoPickerTitle');
        const hintEl = document.getElementById('visualPhotoPickerHint');
        const urlInp = document.getElementById('visualPhotoUrlInput');
        const fileInp = document.getElementById('visualPhotoFileInput');

        const existingUrl = getVisualOverridePhotoUrl(overrideKey);
        if (eyebrow) {
            eyebrow.textContent = kMode === 'fabric'
                ? 'TELA / COLOR · GLOBAL'
                : (kMode === 'wood' ? 'MADERA / ACABADO · GLOBAL' : 'SOLO VISUAL EN INICIO · NO ALTERA SKUS');
        }
        if (titleEl) {
            titleEl.textContent = (kMode === 'fabric' ? '🧵 Tela: ' : (kMode === 'wood' ? '🪵 Madera: ' : '📷 Portada: ')) + visualPhotoPickerCtx.label;
        }
        if (hintEl) {
            hintEl.textContent = kMode === 'fabric'
                ? 'Esta foto de tela aparecerá junto al color "' + visualPhotoPickerCtx.label + '" en este modelo y en cualquier otro modelo con la misma tela.'
                : (kMode === 'wood'
                    ? 'Esta foto de madera aparecerá junto al acabado "' + visualPhotoPickerCtx.label + '" en mesas, recámaras y muebles con esta madera.'
                    : 'Esta foto se mostrará únicamente en la tarjeta inicial de "' + visualPhotoPickerCtx.label + '" sin modificar la foto individual de ningún módulo ni las cotizaciones.');
        }
        if (urlInp) urlInp.value = existingUrl;
        if (fileInp) fileInp.value = '';
        updateVisualPhotoPickerPreview(existingUrl);
        setSettingsStatusBox('visualPhotoStatus', '', 'ok');

        if (modal) {
            modal.classList.add('open');
            notifyInvBackStatePush('visual_photo_picker');
        }
    };

    window.closeVisualPhotoPicker = function () {
        if (visualPhotoInFlight) return;
        const modal = document.getElementById('visualPhotoPickerModal');
        if (modal) modal.classList.remove('open');
        visualPhotoPickerCtx = null;
    };

    window.triggerVisualPhotoFileInput = function () {
        if (visualPhotoInFlight) return;
        const fileInp = document.getElementById('visualPhotoFileInput');
        if (fileInp) fileInp.click();
    };

    window.onVisualPhotoFileSelected = async function (inputEl) {
        if (visualPhotoInFlight || !visualPhotoPickerCtx || !isVisualPhotoEditorAllowed()) return;
        const file = inputEl && inputEl.files && inputEl.files[0];
        if (!file) return;
        const ctx = Object.assign({}, visualPhotoPickerCtx);
        const upBtn = document.getElementById('visualPhotoUploadBtn');
        const urlInp = document.getElementById('visualPhotoUrlInput');

        visualPhotoInFlight = true;
        if (upBtn) { upBtn.disabled = true; upBtn.textContent = 'Subiendo foto a Drive...'; }
        setSettingsStatusBox('visualPhotoStatus', 'Optimizando y subiendo imagen a Drive...', 'warn');

        try {
            const maxSide = (ctx.kind === 'fabric' || ctx.kind === 'wood') ? 640 : CANONICAL_SQUARE_UPLOAD_PX;
            const dataUrl = await normalizeVisualPhotoDataUrl(file, maxSide, 0.86);
            updateVisualPhotoPickerPreview(dataUrl);

            const res = await callInvWebAppPost('inv_upload_product_photo', {
                authToken: (activeAdvisorSession && activeAdvisorSession.authToken) || '',
                sheetTab: (activeAdvisorSession && activeAdvisorSession.sheetTab) || '',
                advisorEmail: (activeAdvisorSession && activeAdvisorSession.correo) || '',
                advisorName: (activeAdvisorSession && activeAdvisorSession.nombre) || '',
                sku: ctx.overrideKey,
                productName: (ctx.kind === 'fabric' ? 'TELA ' : 'PORTADA ') + ctx.label,
                categoria: ctx.kind === 'fabric' ? 'TELAS' : 'SALAS',
                tipo: ctx.kind === 'fabric' ? 'TELA' : 'PORTADA',
                targetFolderId: FOTOS_NUEVAS_CARGADO_FOLDER_ID,
                driveOnly: true,
                skipSheetWrite: true,
                dataUrl: dataUrl
            }, 40000, true);

            if (res && res.authRequired) {
                setSettingsStatusBox('visualPhotoStatus', res.error || 'Confirma tu contraseña para subir fotos.', 'err');
                promptSessionReauth(res.error || 'Confirma tu contraseña para continuar.', null);
                return;
            }
            const fid = cleanStr((res && res.fileId) || (res && res.driveUrl && extractDriveFileId(res.driveUrl)));
            const driveUrl = cleanStr(res && res.driveUrl) || (fid ? ('https://drive.google.com/file/d/' + fid + '/view?usp=sharing') : '');
            if (!res || !res.ok || !driveUrl) {
                setSettingsStatusBox('visualPhotoStatus', (res && res.error) || 'No se pudo subir la imagen a Drive.', 'err');
                return;
            }

            if (urlInp) urlInp.value = driveUrl;
            updateVisualPhotoPickerPreview(driveUrl);
            const saveRes = await persistVisualPhotoOverride(ctx.overrideKey, ctx.kind, ctx.label, driveUrl, 'SAVE');
            if (saveRes && saveRes.ok) {
                setSettingsStatusBox('visualPhotoStatus', '✓ Foto guardada y sincronizada en todos los dispositivos.', 'ok');
            } else {
                setSettingsStatusBox('visualPhotoStatus', (saveRes && saveRes.error) || 'Foto subida, pero falló la sincronización.', 'warn');
            }
        } catch (err) {
            setSettingsStatusBox('visualPhotoStatus', (err && err.message) || 'Error al subir la foto.', 'err');
        } finally {
            visualPhotoInFlight = false;
            if (inputEl) inputEl.value = '';
            if (upBtn) { upBtn.disabled = false; upBtn.textContent = '📷 Subir foto desde celular / PC'; }
        }
    };

    window.saveVisualPhotoFromUrl = async function () {
        if (visualPhotoInFlight || !visualPhotoPickerCtx || !isVisualPhotoEditorAllowed()) return;
        const urlInp = document.getElementById('visualPhotoUrlInput');
        const rawUrl = sanitizeVisualOverrideUrl(cleanStr(urlInp && urlInp.value));
        if (!rawUrl) {
            setSettingsStatusBox('visualPhotoStatus', 'Pega un enlace válido que empiece con https:// (no se permiten enlaces blob: ni data:)', 'err');
            return;
        }
        const ctx = Object.assign({}, visualPhotoPickerCtx);
        visualPhotoInFlight = true;
        setSettingsStatusBox('visualPhotoStatus', 'Guardando enlace...', 'warn');
        try {
            updateVisualPhotoPickerPreview(rawUrl);
            const saveRes = await persistVisualPhotoOverride(ctx.overrideKey, ctx.kind, ctx.label, rawUrl, 'SAVE');
            if (saveRes && saveRes.ok) {
                setSettingsStatusBox('visualPhotoStatus', '✓ Foto guardada y sincronizada.', 'ok');
            } else {
                setSettingsStatusBox('visualPhotoStatus', (saveRes && saveRes.error) || 'Guardada localmente.', 'warn');
            }
        } finally {
            visualPhotoInFlight = false;
        }
    };

    window.clearVisualPhotoOverride = async function () {
        if (visualPhotoInFlight || !visualPhotoPickerCtx || !isVisualPhotoEditorAllowed()) return;
        const ctx = Object.assign({}, visualPhotoPickerCtx);
        visualPhotoInFlight = true;
        setSettingsStatusBox('visualPhotoStatus', 'Quitando foto...', 'warn');
        try {
            const urlInp = document.getElementById('visualPhotoUrlInput');
            if (urlInp) urlInp.value = '';
            updateVisualPhotoPickerPreview('');
            const saveRes = await persistVisualPhotoOverride(ctx.overrideKey, ctx.kind, ctx.label, '', 'DELETE');
            if (saveRes && saveRes.ok) {
                setSettingsStatusBox('visualPhotoStatus', '✓ Foto visual eliminada.', 'ok');
            } else {
                setSettingsStatusBox('visualPhotoStatus', (saveRes && saveRes.error) || 'Eliminada localmente.', 'warn');
            }
        } finally {
            visualPhotoInFlight = false;
        }
    };

    window.openVisualPhotoLightbox = function (rawUrl, caption) {
        const src = resolveVisualImgSrc(rawUrl, 1200);
        if (!src) return;
        const fid = extractDriveFileId(rawUrl);
        const modal = document.getElementById('visualPhotoLightboxModal');
        const img = document.getElementById('visualPhotoLightboxImg');
        const cap = document.getElementById('visualPhotoLightboxCaption');
        if (img) {
            img.setAttribute('data-fb-step', '0');
            if (fid) img.setAttribute('data-fid', fid);
            else img.removeAttribute('data-fid');
            img.onerror = function () {
                if (typeof window.__invHandleSwatchImgError === 'function') {
                    window.__invHandleSwatchImgError(img);
                }
            };
            img.style.display = '';
            img.src = src;
        }
        if (cap) cap.textContent = cleanStr(caption || 'Vista previa');
        if (modal) {
            modal.classList.add('open');
            notifyInvBackStatePush('visual_photo_lightbox');
        }
    };

    window.closeVisualPhotoLightbox = function () {
        const modal = document.getElementById('visualPhotoLightboxModal');
        const img = document.getElementById('visualPhotoLightboxImg');
        if (modal) modal.classList.remove('open');
        if (img) img.src = '';
    };

    async function fetchProductOverridesLiveGviz() {
        if (!META || !META.sheetId || typeof fetch !== 'function') return null;
        const urls = [
            'https://docs.google.com/spreadsheets/d/' + encodeURIComponent(META.sheetId) + '/gviz/tq?tqx=out:csv&headers=0&gid=645650207&_t=' + Date.now(),
            'https://docs.google.com/spreadsheets/d/' + encodeURIComponent(META.sheetId) + '/gviz/tq?tqx=out:csv&headers=0&sheet=' + encodeURIComponent('_INV_PRODUCT_OVERRIDES') + '&_t=' + Date.now()
        ];
        for (let u = 0; u < urls.length; u++) {
            try {
                const resp = await fetch(urls[u], { cache: 'no-store' });
                if (!resp || !resp.ok) continue;
                const txt = await resp.text();
                if (!txt || txt.trim().startsWith('<!DOCTYPE') || txt.trim().startsWith('<html')) continue;
                const rows = parseCsvText(txt);
                if (!Array.isArray(rows) || rows.length < 2) continue;
                const firstSkuCell = cleanStr(rows[0] && rows[0][0]).toUpperCase();
                if (firstSkuCell !== 'SKU' && firstSkuCell.indexOf('VFAB:') !== 0 && firstSkuCell.indexOf('VCOV:') !== 0 && firstSkuCell.indexOf('VWOD:') !== 0) continue;
                const startIdx = firstSkuCell === 'SKU' ? 1 : 0;
                const mapOut = {};
                for (let i = startIdx; i < rows.length; i++) {
                    const r = rows[i] || [];
                    const sku = cleanStr(r[0]).toUpperCase();
                    if (!sku) continue;
                    const statusRaw = cleanStr(r[1] || 'VISIBLE').toUpperCase();
                    const noteStr = cleanStr(r[5]);
                    if (/^V(?:FAB|COV|WOD):/i.test(sku) && (/^blob:/i.test(noteStr) || /^data:/i.test(noteStr))) continue;
                    const pRaw = cleanStr(r[4]);
                    const pNum = (pRaw !== '' && isFinite(Number(pRaw))) ? Number(pRaw) : null;
                    mapOut[sku] = {
                        sku: sku,
                        status: (statusRaw === 'ARCHIVADO' || statusRaw === 'ELIMINADO') ? statusRaw : 'VISIBLE',
                        name: cleanStr(r[2]),
                        category: cleanStr(r[3]),
                        price: pNum,
                        note: noteStr,
                        updatedBy: cleanStr(r[6]),
                        updatedAt: cleanStr(r[7])
                    };
                }
                if (Object.keys(mapOut).length > 0) return mapOut;
            } catch (eGvizOv) {}
        }
        return null;
    }

    async function syncProductOverridesFromCloud(forceNow, opts) {
        if (settingsOverridesSyncedOnce && !forceNow) return;
        const isSilentPoll = !!(opts && opts.silent);
        let syncedAny = false;
        const applyOverridesIfChanged = (rawMap) => {
            if (!rawMap || typeof rawMap !== 'object' || Object.keys(rawMap).length === 0) return false;
            const cleanMap = sanitizeProductOverridesMap(rawMap);
            const nextFp = computeOverridesFingerprintInv(cleanMap);
            if (_lastOverridesFingerprintInv && nextFp === _lastOverridesFingerprintInv) {
                return true; // Sin cambios: evitar re-index y reset de paginación (P1-14)
            }
            saveLocalProductOverridesMap(cleanMap);
            rerenderCatalogAfterOverrideChange(isSilentPoll);
            renderSettingsProductOverridesList();
            return true;
        };

        try {
            const gvizMap = await fetchProductOverridesLiveGviz();
            if (applyOverridesIfChanged(gvizMap)) {
                syncedAny = true;
            }
        } catch (eGviz) {}

        if ((!syncedAny || !isSilentPoll) && activeAdvisorSession && !activeAdvisorSession.mustChangeKey && activeAdvisorSession.authToken) {
            try {
                const res = await callInvWebAppPost('inv_product_overrides_get', {
                    authToken: activeAdvisorSession.authToken || '',
                    advisorEmail: activeAdvisorSession.correo || ''
                }, 15000);
                if (res && res.ok && applyOverridesIfChanged(res.overrides)) {
                    syncedAny = true;
                }
            } catch (e) {}
        }

        if (syncedAny) {
            settingsOverridesSyncedOnce = true;
        }
    }

    function getUserMultiStoreList() {
        if (!activeAdvisorSession || activeAdvisorSession.mustChangeKey || isGuestSession()) return [];
        if (isEffectiveAdminSession() || isKevinAdvisorPreviewActive()) return [];
        const locs = Array.isArray(activeAdvisorSession.allLocations)
            ? activeAdvisorSession.allLocations.filter(l => l && !l.isGuest)
            : [];
        return locs.length > 1 ? locs : [];
    }

    function renderSettingsRoleAndSections() {
        const titleEl = document.getElementById('settingsModalTitle');
        const subEl = document.getElementById('settingsUserSubtitle');
        const roleSec = document.getElementById('settingsRoleSwitchSection');
        const teamPresenceSec = document.getElementById('settingsTeamPresenceSection');
        const adminPermsSec = document.getElementById('settingsAdminPermsSection');
        const histLinkBtn = document.getElementById('btnSettingsOpenHistorialLink');
        const docSec = document.getElementById('settingsDocNameSection');
        const branchSec = document.getElementById('settingsBranchSection');
        const prodSec = document.getElementById('settingsProductsSection');

        const guestMode = isGuestSession();
        const isAdminAcct = !guestMode && isRealAdminAccount();
        const kevinAdvisor = !guestMode && isKevinAdvisorPreviewActive();
        const effectiveAdmin = isEffectiveAdminSession();
        const roleInfo = getAdvisorRoleInfo();

        if (titleEl) {
            titleEl.textContent = guestMode ? 'Mi cuenta (Invitado)' : 'Configuración';
        }
        if (subEl && activeAdvisorSession) {
            const storeLbl = guestMode
                ? ('Lugar ' + (Number(activeAdvisorSession.guestSlotNum) || 1) + '/' + (Number(activeAdvisorSession.guestMaxPlaces) || MAX_GUEST_PLACES_PER_EMAIL))
                : (kevinAdvisor
                    ? getKevinAdvisorPreviewStore()
                    : cleanStr(activeAdvisorSession.erpStore || activeAdvisorSession.branchLabel || activeAdvisorSession.sheetTab));
            subEl.textContent = (activeAdvisorSession.nombre || activeAdvisorSession.correo) + ' · ' + roleInfo.puesto + (storeLbl ? (' · ' + storeLbl) : '');
        }

        // 1) Administrativos con VER_CAMBIAR_ROL=SI: interruptor Administrador <-> Asesor
        if (roleSec) {
            const showRoleSwitch = isAdminAcct && hasAdminPerm('cambiarRol');
            roleSec.classList.toggle('hidden', !showRoleSwitch);
            if (showRoleSwitch) {
                const badge = document.getElementById('settingsRoleModeBadge');
                const btnAdm = document.getElementById('btnSettingsRoleAdmin');
                const btnAdv = document.getElementById('btnSettingsRoleAdvisor');
                const storeWrap = document.getElementById('settingsAdvisorPreviewStoreWrap');
                const storeSel = document.getElementById('settingsAdvisorPreviewStoreSelect');
                if (badge) badge.textContent = kevinAdvisor ? 'Vista Asesor' : 'Administrador';
                if (btnAdm) btnAdm.classList.toggle('is-active', !kevinAdvisor);
                if (btnAdv) btnAdv.classList.toggle('is-active', kevinAdvisor);
                if (storeWrap) storeWrap.classList.toggle('hidden', !kevinAdvisor);
                if (storeSel) storeSel.value = getKevinAdvisorPreviewStore();
            }
        }

        // 1b) Administrativos con VER_EQUIPO_Y_INVITADOS=SI: Equipo e Invitados conectados en vivo
        if (teamPresenceSec) {
            const showTeamPresence = isAdminAcct && !kevinAdvisor && hasAdminPerm('equipoInvitados');
            teamPresenceSec.classList.toggle('hidden', !showTeamPresence);
            if (histLinkBtn) {
                histLinkBtn.classList.toggle('hidden', !hasAdminPerm('historial'));
            }
            if (showTeamPresence && typeof window.renderSettingsTeamPresenceList === 'function') {
                window.renderSettingsTeamPresenceList();
            }
        }

        // 1c) Resumen de permisos por columna desde hoja CUENTAS ADMINISTRATIVAS
        if (adminPermsSec) {
            const showAdminPerms = isAdminAcct && !kevinAdvisor;
            adminPermsSec.classList.toggle('hidden', !showAdminPerms);
            if (showAdminPerms) {
                const permsObj = getActiveAdminPermissions() || {};
                const chipsEl = document.getElementById('settingsAdminPermsChips');
                const countBadgeEl = document.getElementById('settingsAdminPermsCountBadge');
                let activeCount = 0;
                const chipsHtml = ADMIN_PERM_COLUMNS_CLIENT.map(function (def) {
                    const enabled = permsObj[def.key] === true;
                    if (enabled) activeCount++;
                    const cls = enabled ? 'inv-settings-pill-live' : 'inv-settings-badge';
                    return '<span class="' + cls + '" title="' + escapeHtml(def.header) + '">' + (enabled ? '✓ ' : '✕ ') + escapeHtml(def.label) + '</span>';
                }).join('');
                if (chipsEl) chipsEl.innerHTML = chipsHtml;
                if (countBadgeEl) countBadgeEl.textContent = activeCount + '/' + ADMIN_PERM_COLUMNS_CLIENT.length + ' activos';
            }
        }

        // 2) Nombre del documento PDF: visible para asesores y administrativos
        if (docSec) {
            const showDocName = Boolean(activeAdvisorSession && !activeAdvisorSession.mustChangeKey && !guestMode);
            docSec.classList.toggle('hidden', !showDocName);
            if (showDocName) {
                const prefs = readPdfDocNamePrefs();
                const pfxEl = document.getElementById('settingsDocPrefixInput');
                const folEl = document.getElementById('settingsDocIncludeFolio');
                const cliEl = document.getElementById('settingsDocIncludeClient');
                if (pfxEl) pfxEl.value = prefs.prefix;
                if (folEl) folEl.checked = prefs.includeFolio !== false;
                if (cliEl) cliEl.checked = prefs.includeClient !== false;
                window.updateSettingsDocNamePreview();
            }
        }

        // 3) Cambiar de bodega / tienda: usuarios en más de 1 hoja de tienda (y en Vista Asesor para previsualizar)
        if (branchSec) {
            const multiLocs = getUserMultiStoreList();
            const showBranch = !guestMode && (multiLocs.length > 1 || kevinAdvisor);
            branchSec.classList.toggle('hidden', !showBranch);
            if (showBranch) {
                const badge = document.getElementById('settingsBranchCountBadge');
                const curTxt = document.getElementById('settingsBranchCurrentText');
                const branchBtn = branchSec.querySelector('button');
                if (kevinAdvisor) {
                    const previewStore = getKevinAdvisorPreviewStore();
                    if (badge) badge.textContent = 'Vista Asesor · 5 tiendas';
                    if (curTxt) curTxt.textContent = 'Tienda / bodega simulada: ' + previewStore + ' (cámbiala arriba en "Tienda para vista de Asesor").';
                    if (branchBtn) {
                        branchBtn.textContent = 'Elegir tienda simulada';
                        branchBtn.onclick = function () {
                            const sel = document.getElementById('settingsAdvisorPreviewStoreSelect');
                            if (sel) { sel.scrollIntoView({ behavior: 'smooth', block: 'center' }); sel.focus(); }
                        };
                    }
                } else {
                    const activeStore = cleanStr(activeAdvisorSession.erpStore || activeAdvisorSession.branchLabel || activeAdvisorSession.sheetTab);
                    if (badge) badge.textContent = multiLocs.length + ' tiendas';
                    if (curTxt) curTxt.textContent = 'Tienda / bodega activa: ' + (activeStore || 'Sin asignar') + '.';
                    if (branchBtn) {
                        branchBtn.textContent = 'Cambiar de bodega / tienda';
                        branchBtn.onclick = function () {
                            window.closeSettingsModal();
                            window.openSwitchBranchSelector();
                        };
                    }
                }
            }
        }

        // 4) Gestionar productos (Guardar · Archivar · Eliminar): Administrativos con VER_GESTION_PRODUCTOS=SI
        if (prodSec) {
            const showProds = isAdminAcct && !kevinAdvisor && hasAdminPerm('gestionProductos');
            prodSec.classList.toggle('hidden', !showProds);
            if (showProds) {
                renderSettingsProductOverridesList();
            }
        }
    }

    let settingsTeamPresenceTimer = null;
    let settingsTeamPresenceInFlight = false;

    function stopSettingsTeamPresenceAutoRefresh() {
        if (settingsTeamPresenceTimer) {
            clearInterval(settingsTeamPresenceTimer);
            settingsTeamPresenceTimer = null;
        }
    }

    function startSettingsTeamPresenceAutoRefresh() {
        stopSettingsTeamPresenceAutoRefresh();
        if (!isRealAdminAccount() || isKevinAdvisorPreviewActive() || !hasAdminPerm('equipoInvitados')) return;
        settingsTeamPresenceTimer = setInterval(function () {
            const modal = document.getElementById('settingsModal');
            if (!modal || !modal.classList.contains('open')) {
                stopSettingsTeamPresenceAutoRefresh();
                return;
            }
            if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
            if (isRealAdminAccount() && !isKevinAdvisorPreviewActive() && hasAdminPerm('equipoInvitados') && typeof window.refreshSettingsTeamPresence === 'function') {
                window.refreshSettingsTeamPresence(false);
            }
        }, 20000);
    }

    window.openSettingsModal = function (focusSection) {
        if (!activeAdvisorSession || activeAdvisorSession.mustChangeKey) return;
        const modal = document.getElementById('settingsModal');
        if (!modal) return;
        const guestMode = isGuestSession();
        setSettingsStatusBox('settingsDocNameStatus', '', 'ok');
        setSettingsStatusBox('settingsPassStatus', '', 'ok');
        setSettingsStatusBox('settingsSessionsStatus', '', 'ok');
        setSettingsStatusBox('settingsProdStatus', '', 'ok');
        setSettingsStatusBox('settingsTeamPresenceStatus', '', 'ok');
        const currEl = document.getElementById('settingsCurrPassInput');
        const newEl = document.getElementById('settingsNewPassInput');
        const confEl = document.getElementById('settingsConfPassInput');
        const teamSearchEl = document.getElementById('settingsTeamSearchInput');
        if (currEl) currEl.value = '';
        if (newEl) newEl.value = '';
        if (confEl) confEl.value = '';
        if (teamSearchEl) teamSearchEl.value = '';
        renderSettingsRoleAndSections();
        modal.classList.add('open');
        notifyInvBackStatePush('settings_modal');
        window.refreshSettingsOpenSessions(false);
        const canSeeTeamPresenceNow = !guestMode && isRealAdminAccount() && !isKevinAdvisorPreviewActive() && hasAdminPerm('equipoInvitados');
        const canManageProdsNow = !guestMode && isRealAdminAccount() && !isKevinAdvisorPreviewActive() && hasAdminPerm('gestionProductos');
        if (canSeeTeamPresenceNow && typeof window.refreshSettingsTeamPresence === 'function') {
            window.refreshSettingsTeamPresence(false);
            startSettingsTeamPresenceAutoRefresh();
        } else {
            stopSettingsTeamPresenceAutoRefresh();
        }
        if (!guestMode) {
            syncProductOverridesFromCloud(canManageProdsNow);
        }
        const focusKey = String(focusSection || '').trim().toLowerCase();
        if (focusKey === 'password' || focusKey === 'sessions') {
            const targetId = focusKey === 'sessions' ? 'settingsSessionsSection' : 'settingsPasswordSection';
            const scrollFn = function () {
                const secEl = document.getElementById(targetId);
                if (secEl && typeof secEl.scrollIntoView === 'function') {
                    secEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
                if (focusKey === 'password' && currEl && typeof currEl.focus === 'function') {
                    currEl.focus();
                }
            };
            if (typeof requestAnimationFrame === 'function') {
                requestAnimationFrame(scrollFn);
            } else {
                scrollFn();
            }
        }
    };

    window.closeSettingsModal = function () {
        stopSettingsTeamPresenceAutoRefresh();
        const modal = document.getElementById('settingsModal');
        if (modal) modal.classList.remove('open');
    };

    window.setKevinRolePreviewMode = function (mode) {
        if (!isRealAdminAccount() || !hasAdminPerm('cambiarRol')) return;
        const target = String(mode || 'ADMIN').toUpperCase() === 'ASESOR' ? 'ASESOR' : 'ADMIN';
        try {
            if (typeof sessionStorage !== 'undefined') {
                if (target === 'ASESOR') {
                    sessionStorage.setItem(KEVIN_ROLE_PREVIEW_KEY, 'ASESOR');
                } else {
                    sessionStorage.removeItem(KEVIN_ROLE_PREVIEW_KEY);
                }
            }
        } catch (e) {}
        renderAdvisorHeaderBar();
        if (typeof populateQuoteAdvisorControls === 'function') {
            try { populateQuoteAdvisorControls(); } catch (eSync) {}
        }
        if (typeof renderCartItems === 'function') {
            const cartM = document.getElementById('cartModal');
            if (cartM && cartM.classList.contains('open')) {
                try { renderCartItems(); } catch (eCart) {}
            }
        }
        renderSettingsRoleAndSections();
        if (target === 'ADMIN' && hasAdminPerm('equipoInvitados')) {
            const modal = document.getElementById('settingsModal');
            if (modal && modal.classList.contains('open') && typeof window.refreshSettingsTeamPresence === 'function') {
                window.refreshSettingsTeamPresence(false);
                startSettingsTeamPresenceAutoRefresh();
            }
        } else {
            stopSettingsTeamPresenceAutoRefresh();
        }
        if (typeof showToast === 'function') {
            showToast(target === 'ASESOR' ? 'Vista cambiada a Asesor (tope de descuento de asesor activo).' : 'Regresaste a modo Administrador.');
        }
    };

    window.setKevinAdvisorPreviewStore = function (storeName) {
        if (!isRealAdminAccount() || !hasAdminPerm('cambiarRol')) return;
        const clean = cleanStr(storeName) || 'CREATA PUERTO CANCUN';
        try {
            if (typeof sessionStorage !== 'undefined') {
                sessionStorage.setItem(KEVIN_PREVIEW_STORE_KEY, clean);
            }
        } catch (e) {}
        renderAdvisorHeaderBar();
        if (typeof populateQuoteAdvisorControls === 'function') {
            try { populateQuoteAdvisorControls(); } catch (eSync) {}
        }
        if (typeof renderCartItems === 'function') {
            const cartM = document.getElementById('cartModal');
            if (cartM && cartM.classList.contains('open')) {
                try { renderCartItems(); } catch (eCart) {}
            }
        }
        renderSettingsRoleAndSections();
    };

    window.updateSettingsDocNamePreview = function () {
        const pfxEl = document.getElementById('settingsDocPrefixInput');
        const folEl = document.getElementById('settingsDocIncludeFolio');
        const cliEl = document.getElementById('settingsDocIncludeClient');
        const prevEl = document.getElementById('settingsDocNamePreview');
        if (!prevEl) return;
        const sample = buildFormalQuotePdfFileName('PTC32013', 'Juan Perez', {
            prefix: pfxEl ? pfxEl.value : DEFAULT_PDF_DOC_PREFIX,
            includeFolio: folEl ? !!folEl.checked : true,
            includeClient: cliEl ? !!cliEl.checked : true
        });
        prevEl.textContent = sample;
    };

    window.saveSettingsDocNamePrefs = function () {
        const pfxEl = document.getElementById('settingsDocPrefixInput');
        const folEl = document.getElementById('settingsDocIncludeFolio');
        const cliEl = document.getElementById('settingsDocIncludeClient');
        const cleanPrefix = sanitizePdfDocPrefix(pfxEl ? pfxEl.value : '') || DEFAULT_PDF_DOC_PREFIX;
        const prefs = {
            prefix: cleanPrefix,
            includeFolio: folEl ? !!folEl.checked : true,
            includeClient: cliEl ? !!cliEl.checked : true
        };
        try {
            localStorage.setItem(INV_PDF_DOC_NAME_PREF_KEY, JSON.stringify(prefs));
        } catch (e) {}
        if (pfxEl) pfxEl.value = cleanPrefix;
        window.updateSettingsDocNamePreview();
        setSettingsStatusBox('settingsDocNameStatus', 'Nombre del documento PDF guardado.', 'ok');
    };

    window.resetSettingsDocNamePrefs = function () {
        try { localStorage.removeItem(INV_PDF_DOC_NAME_PREF_KEY); } catch (e) {}
        const pfxEl = document.getElementById('settingsDocPrefixInput');
        const folEl = document.getElementById('settingsDocIncludeFolio');
        const cliEl = document.getElementById('settingsDocIncludeClient');
        if (pfxEl) pfxEl.value = DEFAULT_PDF_DOC_PREFIX;
        if (folEl) folEl.checked = true;
        if (cliEl) cliEl.checked = true;
        window.updateSettingsDocNamePreview();
        setSettingsStatusBox('settingsDocNameStatus', 'Se restauró el nombre predeterminado.', 'ok');
    };

    window.submitSettingsPasswordChange = async function () {
        if (settingsPassInFlight || !activeAdvisorSession || activeAdvisorSession.mustChangeKey) return;
        const currEl = document.getElementById('settingsCurrPassInput');
        const newEl = document.getElementById('settingsNewPassInput');
        const confEl = document.getElementById('settingsConfPassInput');
        const btn = document.getElementById('btnSettingsChangePass');

        const currPass = cleanStr(currEl ? currEl.value : '');
        const newPass = cleanStr(newEl ? newEl.value : '');
        const confPass = cleanStr(confEl ? confEl.value : '');

        if (!currPass) {
            setSettingsStatusBox('settingsPassStatus', 'Ingresa tu contraseña actual.', 'err');
            return;
        }
        if (newPass.length < 8) {
            setSettingsStatusBox('settingsPassStatus', 'La nueva contraseña debe tener al menos 8 caracteres.', 'err');
            return;
        }
        if (newPass !== confPass) {
            setSettingsStatusBox('settingsPassStatus', 'La nueva contraseña y la confirmación no coinciden.', 'err');
            return;
        }
        if (keysMatchNormalized(currPass, newPass)) {
            setSettingsStatusBox('settingsPassStatus', 'La nueva contraseña debe ser diferente a la actual.', 'err');
            return;
        }

        settingsPassInFlight = true;
        if (btn) { btn.disabled = true; btn.textContent = 'Actualizando...'; }
        setSettingsStatusBox('settingsPassStatus', '', 'ok');

        try {
            // Verificar primero la contraseña actual contra inv_login para garantizar que coincida
            const verifyRes = await callInvWebAppPost('inv_login', {
                email: activeAdvisorSession.correo,
                accessKey: currPass,
                sheetTab: activeAdvisorSession.sheetTab || '',
                deviceId: getActiveSessionDeviceId(),
                deviceLabel: (typeof getClientDeviceLabel === 'function') ? getClientDeviceLabel() : 'Navegador'
            }, 15000);
            if (!verifyRes || !verifyRes.ok) {
                if (verifyRes && verifyRes.unavailable) {
                    setSettingsStatusBox('settingsPassStatus', 'Sin conexión con el servidor. Intenta de nuevo.', 'err');
                } else {
                    setSettingsStatusBox('settingsPassStatus', 'La contraseña actual es incorrecta.', 'err');
                }
                return;
            }

            const freshToken = cleanStr(verifyRes.authToken || (verifyRes.user && verifyRes.user.authToken) || activeAdvisorSession.authToken || '');
            const res = await callInvWebAppPost('inv_update_key', {
                email: activeAdvisorSession.correo,
                currentKey: currPass,
                newKey: newPass,
                sheetTab: activeAdvisorSession.sheetTab || '',
                authToken: freshToken
            }, 20000);

            if (res && res.ok) {
                if (res.authToken) {
                    activeAdvisorSession.authToken = res.authToken;
                }
                if (res.tokensByTab && Array.isArray(activeAdvisorSession.allLocations)) {
                    activeAdvisorSession.allLocations = activeAdvisorSession.allLocations.map(l => {
                        const t = l && l.sheetTab ? res.tokensByTab[l.sheetTab] : '';
                        return t ? Object.assign({}, l, { authToken: t }) : l;
                    });
                }
                try {
                    localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(activeAdvisorSession));
                    const mapObj = loadUpdatedKeysMap();
                    if (mapObj && mapObj[activeAdvisorSession.correo]) {
                        delete mapObj[activeAdvisorSession.correo];
                        saveUpdatedKeysMap(mapObj);
                    }
                    purgeLegacySyncedPendingKeys();
                } catch (eSave) {}
                if (currEl) currEl.value = '';
                if (newEl) newEl.value = '';
                if (confEl) confEl.value = '';
                const okPassMsg = isGuestSession()
                    ? 'Contraseña actualizada correctamente.'
                    : 'Contraseña actualizada correctamente en todas tus hojas.';
                setSettingsStatusBox('settingsPassStatus', okPassMsg, 'ok');
            } else {
                setSettingsStatusBox('settingsPassStatus', (res && res.error) || 'No se pudo actualizar la contraseña.', 'err');
            }
        } catch (err) {
            setSettingsStatusBox('settingsPassStatus', 'Error de red al actualizar la contraseña.', 'err');
        } finally {
            settingsPassInFlight = false;
            if (btn) { btn.disabled = false; btn.textContent = 'Actualizar contraseña'; }
        }
    };

    function formatSettingsSessionTime(tsMs, serverNowMs) {
        const ts = Number(tsMs || 0);
        if (!ts) return 'Reciente';
        const diff = Math.max(0, (Number(serverNowMs) || Date.now()) - ts);
        if (diff < 60000) return 'Ahora mismo';
        if (diff < 3600000) return 'Hace ' + Math.max(1, Math.floor(diff / 60000)) + ' min';
        if (diff < 86400000) return 'Hace ' + Math.max(1, Math.floor(diff / 3600000)) + ' h';
        return 'Hace ' + Math.max(1, Math.floor(diff / 86400000)) + ' días';
    }

    function renderSettingsSessionsList(sessions, serverNowMs) {
        const listEl = document.getElementById('settingsSessionsList');
        if (!listEl) return;
        const arr = Array.isArray(sessions) ? sessions : [];
        if (!arr.length) {
            listEl.innerHTML = '<div class="inv-settings-section-sub">Solo aparece tu sesión actual en este dispositivo.</div>';
            return;
        }
        listEl.innerHTML = arr.map(s => {
            const devIdEsc = escapeHtml(String(s.deviceId || ''));
            const devLblEsc = escapeHtml(String(s.deviceLabel || 'Navegador'));
            const metaParts = [
                s.sucursal ? String(s.sucursal) : '',
                s.vista ? ('Vista: ' + String(s.vista)) : '',
                formatSettingsSessionTime(s.lastSeenMs, serverNowMs)
            ].filter(Boolean);
            let badgeHtml = '<span class="inv-settings-badge">Inactiva</span>';
            if (s.revoked) {
                badgeHtml = '<span class="inv-settings-pill-del">Cerrada</span>';
            } else if (s.online || s.isCurrent) {
                badgeHtml = '<span class="inv-settings-pill-live">● Activa</span>';
            }
            const revokeBtnHtml = (!s.isCurrent && !s.revoked && s.active !== false)
                ? ('<button type="button" class="inv-btn-secondary" style="padding:4px 8px;font-size:11px;" data-inv-act="revoke-session" data-dev-id="' + devIdEsc + '">Cerrar</button>')
                : '';
            return (
                '<div class="inv-settings-session-item">' +
                    '<div class="inv-settings-item-main">' +
                        '<div class="inv-settings-item-title">' + devLblEsc + (s.isCurrent ? ' (Este dispositivo)' : '') + '</div>' +
                        '<div class="inv-settings-item-meta">' + escapeHtml(metaParts.join(' · ')) + '</div>' +
                    '</div>' +
                    '<div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">' +
                        badgeHtml +
                        revokeBtnHtml +
                    '</div>' +
                '</div>'
            );
        }).join('');
    }

    function syncGuestSlotMetaFromSessionResponse(res) {
        if (!res || !activeAdvisorSession || !isGuestSession()) return;
        let changed = false;
        if (Number(res.slotNumber) > 0) {
            activeAdvisorSession.guestSlotNum = Number(res.slotNumber);
            changed = true;
        }
        if (typeof res.activeCount === 'number' && res.activeCount >= 0) {
            activeAdvisorSession.guestActivePlaces = res.activeCount;
            changed = true;
        }
        if (Number(res.maxPlaces) > 0) {
            activeAdvisorSession.guestMaxPlaces = Number(res.maxPlaces);
            changed = true;
        }
        if (changed) {
            saveAdvisorSession(activeAdvisorSession);
            renderAdvisorHeaderBar();
            renderSettingsRoleAndSections();
        }
    }

    window.refreshSettingsOpenSessions = async function (showFeedback) {
        if (!activeAdvisorSession || activeAdvisorSession.mustChangeKey) return;
        const guestMode = isGuestSession();
        const curDevId = getActiveSessionDeviceId();
        const curLabel = (typeof getClientDeviceLabel === 'function') ? getClientDeviceLabel() : 'Este navegador';
        const fallbackLocal = [{
            deviceId: curDevId,
            deviceLabel: curLabel,
            sucursal: guestMode ? 'INVITADOS (SOLO VER)' : cleanStr(activeAdvisorSession.erpStore || activeAdvisorSession.branchLabel || activeAdvisorSession.sheetTab),
            vista: currentPresenceVista(),
            lastSeenMs: Date.now(),
            online: true,
            active: true,
            revoked: false,
            isCurrent: true
        }];

        if (!activeAdvisorSession.authToken) {
            renderSettingsSessionsList(fallbackLocal, Date.now());
            setSettingsStatusBox('settingsSessionsStatus', 'Inicia sesión de nuevo si deseas sincronizar sesiones en otros dispositivos.', 'warn');
            return;
        }
        try {
            const res = await callInvWebAppPost('inv_my_sessions', {
                authToken: activeAdvisorSession.authToken || '',
                advisorEmail: activeAdvisorSession.correo || '',
                sheetTab: activeAdvisorSession.sheetTab || '',
                erpStore: guestMode ? 'INVITADOS (SOLO VER)' : (activeAdvisorSession.erpStore || ''),
                deviceId: curDevId,
                deviceLabel: curLabel,
                sessionStartedMs: getInvSessionStartedMs(),
                vista: 'configuracion'
            }, 15000);
            if (res && res.ok && Array.isArray(res.sessions)) {
                syncGuestSlotMetaFromSessionResponse(res);
                renderSettingsSessionsList(res.sessions.length ? res.sessions : fallbackLocal, res.serverTimeMs || Date.now());
                if (showFeedback) {
                    setSettingsStatusBox('settingsSessionsStatus', 'Sesiones actualizadas (' + res.sessions.length + ').', 'ok');
                }
                return;
            }
        } catch (e) {}
        renderSettingsSessionsList(fallbackLocal, Date.now());
        if (showFeedback) {
            setSettingsStatusBox('settingsSessionsStatus', 'Mostrando sesión local (actualiza Apps Script de Control de Productos para listar otros dispositivos).', 'warn');
        }
    };

    const settingsTeamPresenceState = {
        users: [],
        guests: [],
        onlineCount: 0,
        offlineCount: 0,
        guestOnlineCount: 0,
        guestOfflineCount: 0,
        serverTimeMs: 0,
        filter: 'ALL',
        loading: false,
        error: ''
    };

    function formatInvPresenceVistaLabel(vista) {
        const v = cleanStr(vista).toLowerCase();
        if (!v) return '';
        if (v === 'inventario' || v === 'home' || v === 'catalogo') return 'Inventario / Cotizador';
        if (v === 'seguimiento') return 'Seguimiento';
        if (v === 'historial') return 'Historial';
        if (v === 'configuracion') return 'Configuración';
        if (v === 'cotizador' || v === 'carrito') return 'Cotizador';
        if (v === 'fotos' || v === 'fotos-productos') return 'Subida de Fotos';
        if (v === 'panel') return 'Panel CREATA';
        return cleanStr(vista);
    }

    window.setSettingsTeamPresenceFilter = function (mode) {
        const next = (mode === 'ONLINE' || mode === 'OFFLINE' || mode === 'GUESTS') ? mode : 'ALL';
        settingsTeamPresenceState.filter = next;
        window.renderSettingsTeamPresenceList();
    };

    window.renderSettingsTeamPresenceList = function () {
        if (!isRealAdminAccount() || isKevinAdvisorPreviewActive() || !hasAdminPerm('equipoInvitados')) return;
        const badgeEl = document.getElementById('settingsTeamOnlineBadge');
        const listEl = document.getElementById('settingsTeamPresenceList');
        const btnAll = document.getElementById('settingsTeamFilterAll');
        const btnOn = document.getElementById('settingsTeamFilterOnline');
        const btnOff = document.getElementById('settingsTeamFilterOffline');
        const btnGuests = document.getElementById('settingsTeamFilterGuests');
        const searchEl = document.getElementById('settingsTeamSearchInput');

        const teamUsers = Array.isArray(settingsTeamPresenceState.users) ? settingsTeamPresenceState.users : [];
        const guestUsers = Array.isArray(settingsTeamPresenceState.guests) ? settingsTeamPresenceState.guests : [];
        const allCombined = teamUsers.concat(guestUsers);
        const total = allCombined.length;
        const onCount = settingsTeamPresenceState.onlineCount;
        const offCount = settingsTeamPresenceState.offlineCount;
        const gTotal = guestUsers.length;
        const gOnCount = settingsTeamPresenceState.guestOnlineCount;
        const combinedOn = onCount + gOnCount;
        const combinedOff = Math.max(0, total - combinedOn);

        if (badgeEl) {
            badgeEl.textContent = gTotal > 0
                ? ('● ' + onCount + ' equipo · ' + gOnCount + ' invitado' + (gOnCount === 1 ? '' : 's'))
                : ('● ' + onCount + ' conectado' + (onCount === 1 ? '' : 's'));
        }
        if (btnAll) {
            btnAll.textContent = 'Todos' + (total ? (' (' + total + ')') : '');
            btnAll.classList.toggle('is-active', settingsTeamPresenceState.filter === 'ALL');
        }
        if (btnOn) {
            btnOn.textContent = 'Conectados' + (total ? (' (' + combinedOn + ')') : '');
            btnOn.classList.toggle('is-active', settingsTeamPresenceState.filter === 'ONLINE');
        }
        if (btnOff) {
            btnOff.textContent = 'Desconectados' + (total ? (' (' + combinedOff + ')') : '');
            btnOff.classList.toggle('is-active', settingsTeamPresenceState.filter === 'OFFLINE');
        }
        if (btnGuests) {
            btnGuests.textContent = 'Invitados' + (gTotal ? (' (' + gOnCount + '/' + gTotal + ')') : '');
            btnGuests.classList.toggle('is-active', settingsTeamPresenceState.filter === 'GUESTS');
        }
        if (!listEl) return;

        if (settingsTeamPresenceState.loading && !total) {
            listEl.innerHTML = '<div class="inv-settings-section-sub">Consultando quién está conectado…</div>';
            return;
        }

        const q = cleanStr(searchEl ? searchEl.value : '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        const sourcePool = settingsTeamPresenceState.filter === 'GUESTS' ? guestUsers : allCombined;
        const filtered = sourcePool.filter(function (u) {
            if (settingsTeamPresenceState.filter === 'ONLINE' && !u.online) return false;
            if (settingsTeamPresenceState.filter === 'OFFLINE' && u.online) return false;
            if (q) {
                const hay = [
                    u.nombre,
                    u.correo,
                    u.sucursal,
                    u.rol,
                    u.vista,
                    formatInvPresenceVistaLabel(u.vista),
                    u.deviceLabel,
                    u.slotLabel,
                    u.isGuest ? 'invitado' : ''
                ].join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
                if (!hay.includes(q)) return false;
            }
            return true;
        });

        if (!filtered.length) {
            let emptyMsg = 'Sin registros.';
            if (!total) {
                if (settingsTeamPresenceState.error === 'no_token' || settingsTeamPresenceState.error === 'auth_failed') {
                    emptyMsg = 'Tu sesión actual no tiene token de presencia. Toca Salir en el menú + y vuelve a iniciar sesión.';
                } else if (settingsTeamPresenceState.error === 'unavailable') {
                    emptyMsg = 'No se pudo consultar el equipo en vivo. Toca ↻ Actualizar para reintentar.';
                }
            } else if (settingsTeamPresenceState.filter === 'GUESTS') {
                emptyMsg = gTotal ? 'Sin invitados coincidentes con esa búsqueda.' : 'Aún no hay invitados registrados en la hoja INVITADOS.';
            } else if (settingsTeamPresenceState.filter === 'ONLINE') {
                emptyMsg = 'Nadie conectado en los últimos 3 minutos.';
            } else if (q) {
                emptyMsg = 'Sin coincidencias para esa búsqueda.';
            }
            listEl.innerHTML = '<div class="inv-settings-section-sub">' + escapeHtml(emptyMsg) + '</div>';
            return;
        }

        const refNow = settingsTeamPresenceState.serverTimeMs || Date.now();
        listEl.innerHTML = filtered.map(function (u) {
            const vistaLbl = formatInvPresenceVistaLabel(u.vista);
            const whereParts = u.isGuest
                ? [
                    u.slotLabel ? ('Lugares: ' + u.slotLabel) : '',
                    u.deviceLabel ? ('📱 ' + u.deviceLabel) : '',
                    vistaLbl ? (u.online ? ('En: ' + vistaLbl) : ('Última vista: ' + vistaLbl)) : ''
                ].filter(Boolean)
                : [
                    u.sucursal ? ('📍 ' + u.sucursal) : '',
                    vistaLbl ? (u.online ? ('En: ' + vistaLbl) : ('Última vista: ' + vistaLbl)) : ''
                ].filter(Boolean);
            const subLine = u.isGuest
                ? (whereParts.join(' · ') || 'Invitado (Solo ver)')
                : ([u.rol || '', whereParts.join(' · ')].filter(Boolean).join(' · ') || '—');
            const timeLbl = u.lastSeenMs ? formatSettingsSessionTime(u.lastSeenMs, refNow) : 'Sin registro';
            const cls = u.online ? 'is-online' : 'is-offline';
            const guestPill = u.isGuest
                ? ' <span class="inv-settings-badge" style="margin-left:5px;font-size:11px;padding:1px 6px;">INVITADO</span>'
                : '';
            const badgeHtml = u.online
                ? '<span class="inv-settings-pill-live">● Conectado</span>'
                : '<span class="inv-settings-badge">Desconectado</span>';
            return (
                '<div class="inv-team-presence-row ' + cls + (u.isGuest ? ' is-guest-row' : '') + '">' +
                    '<div class="inv-team-presence-left">' +
                        '<span class="inv-team-dot ' + cls + '" aria-hidden="true"></span>' +
                        '<div class="inv-settings-item-main">' +
                            '<div class="inv-settings-item-title">' + escapeHtml(u.nombre || (u.isGuest ? 'Invitado' : 'Usuario')) + guestPill + '</div>' +
                            '<div class="inv-settings-item-meta">' + escapeHtml(subLine) + '</div>' +
                        '</div>' +
                    '</div>' +
                    '<div class="inv-team-presence-right">' +
                        badgeHtml +
                        '<span class="inv-team-time">' + escapeHtml(timeLbl) + '</span>' +
                    '</div>' +
                '</div>'
            );
        }).join('');
    };

    window.refreshSettingsTeamPresence = async function (showFeedback) {
        if (!isRealAdminAccount() || isKevinAdvisorPreviewActive() || !hasAdminPerm('equipoInvitados')) return;
        if (settingsTeamPresenceInFlight && !showFeedback) return;
        settingsTeamPresenceInFlight = true;

        try {
            let token = recoverStoredInvAuthToken(activeAdvisorSession);
            if (!token) {
                try {
                    const raw = localStorage.getItem('creata_inv_advisor_session_v1');
                    const parsed = raw ? JSON.parse(raw) : null;
                    if (parsed && parsed.authToken) token = cleanStr(parsed.authToken);
                } catch (e) {}
            }
            const fallbackKey = readStoredInvAccessKeyFallback(activeAdvisorSession);
            if (!token && fallbackKey) {
                token = await renewInvAuthTokenIfPossible(activeAdvisorSession, false);
            }
            if (!token && !fallbackKey) {
                settingsTeamPresenceState.error = 'no_token';
                settingsTeamPresenceState.users = [];
                settingsTeamPresenceState.guests = [];
                settingsTeamPresenceState.onlineCount = 0;
                settingsTeamPresenceState.offlineCount = 0;
                settingsTeamPresenceState.guestOnlineCount = 0;
                settingsTeamPresenceState.guestOfflineCount = 0;
                window.renderSettingsTeamPresenceList();
                return;
            }
            settingsTeamPresenceState.loading = true;
            settingsTeamPresenceState.error = '';
            window.renderSettingsTeamPresenceList();

            const buildPayload = function (tok, includeKey) {
                const p = {
                    authToken: tok || '',
                    advisorEmail: cleanStr(activeAdvisorSession && activeAdvisorSession.correo),
                    sheetTab: cleanStr(activeAdvisorSession && activeAdvisorSession.sheetTab)
                };
                if (includeKey && fallbackKey) p.accessKey = fallbackKey;
                return p;
            };

            let res = await callInvWebAppPost('inv_presence_list', buildPayload(token, !token), 18000, true);
            if (res && res.renewedAuthToken) {
                persistRenewedInvAuthToken(activeAdvisorSession, res.renewedAuthToken);
            }
            if (!res || res.unavailable || res.needsRedeploy) {
                res = await callInvWebAppGetPresence(buildPayload(token, !token), 18000);
                if (res && res.renewedAuthToken) {
                    persistRenewedInvAuthToken(activeAdvisorSession, res.renewedAuthToken);
                }
            }
            if (res && !res.ok && !res.unavailable && !res.forbidden) {
                const freshTok = await renewInvAuthTokenIfPossible(activeAdvisorSession, true);
                if (freshTok || fallbackKey) {
                    const retryPayload = buildPayload(freshTok || token, true);
                    res = await callInvWebAppPost('inv_presence_list', retryPayload, 18000, true);
                    if (!res || res.unavailable || res.needsRedeploy) {
                        res = await callInvWebAppGetPresence(retryPayload, 18000);
                    }
                    if (res && res.renewedAuthToken) {
                        persistRenewedInvAuthToken(activeAdvisorSession, res.renewedAuthToken);
                    }
                }
            }
            if (res && res.ok && Array.isArray(res.users)) {
                const serverNow = Number(res.serverTimeMs) > 0 ? Number(res.serverTimeMs) : Date.now();
                const thresholdMs = Number(res.thresholdMs) > 0 ? Number(res.thresholdMs) : 180000;
                const list = res.users.filter(Boolean).map(function (raw) {
                    const lastSeenMs = Number(raw.lastSeenMs) > 0 ? Number(raw.lastSeenMs) : 0;
                    const online = typeof raw.online === 'boolean'
                        ? raw.online
                        : Boolean(lastSeenMs > 0 && (serverNow - lastSeenMs) <= thresholdMs);
                    return {
                        nombre: cleanStr(raw.nombre) || 'Usuario',
                        correo: cleanStr(raw.correo),
                        sucursal: cleanStr(raw.sucursal),
                        rol: cleanStr(raw.rol),
                        vista: cleanStr(raw.vista),
                        isGuest: false,
                        online: online,
                        lastSeenMs: lastSeenMs
                    };
                });
                list.sort(function (a, b) {
                    if (a.online !== b.online) return a.online ? -1 : 1;
                    if (b.lastSeenMs !== a.lastSeenMs) return b.lastSeenMs - a.lastSeenMs;
                    return a.nombre.localeCompare(b.nombre, 'es');
                });

                const rawGuests = Array.isArray(res.guests) ? res.guests : [];
                const guestList = rawGuests.filter(Boolean).map(function (raw) {
                    const lastSeenMs = Number(raw.lastSeenMs) > 0 ? Number(raw.lastSeenMs) : 0;
                    const online = typeof raw.online === 'boolean'
                        ? raw.online
                        : Boolean(lastSeenMs > 0 && (serverNow - lastSeenMs) <= thresholdMs);
                    const activePl = typeof raw.activePlaces === 'number' ? raw.activePlaces : (online ? 1 : 0);
                    const maxPl = Number(raw.maxPlaces) > 0 ? Number(raw.maxPlaces) : MAX_GUEST_PLACES_PER_EMAIL;
                    return {
                        nombre: cleanStr(raw.nombre) || 'Invitado',
                        correo: cleanStr(raw.correo),
                        sucursal: 'INVITADOS (SOLO VER)',
                        rol: cleanStr(raw.rol) || 'INVITADO (SOLO VER)',
                        vista: cleanStr(raw.vista),
                        deviceLabel: cleanStr(raw.deviceLabel),
                        activePlaces: activePl,
                        maxPlaces: maxPl,
                        slotLabel: cleanStr(raw.slotLabel) || (activePl + ' / ' + maxPl),
                        isGuest: true,
                        online: online,
                        lastSeenMs: lastSeenMs
                    };
                });
                guestList.sort(function (a, b) {
                    if (a.online !== b.online) return a.online ? -1 : 1;
                    if (b.lastSeenMs !== a.lastSeenMs) return b.lastSeenMs - a.lastSeenMs;
                    return a.nombre.localeCompare(b.nombre, 'es');
                });

                settingsTeamPresenceState.users = list;
                settingsTeamPresenceState.guests = guestList;
                settingsTeamPresenceState.onlineCount = list.filter(function (u) { return u.online; }).length;
                settingsTeamPresenceState.offlineCount = list.length - settingsTeamPresenceState.onlineCount;
                settingsTeamPresenceState.guestOnlineCount = guestList.filter(function (g) { return g.online; }).length;
                settingsTeamPresenceState.guestOfflineCount = guestList.length - settingsTeamPresenceState.guestOnlineCount;
                settingsTeamPresenceState.serverTimeMs = serverNow;
                settingsTeamPresenceState.error = '';
                settingsTeamPresenceState.loading = false;
                window.renderSettingsTeamPresenceList();
                if (showFeedback) {
                    const gSuffix = guestList.length
                        ? (' · Invitados: ' + settingsTeamPresenceState.guestOnlineCount + ' en línea de ' + guestList.length)
                        : '';
                    setSettingsStatusBox('settingsTeamPresenceStatus', 'Equipo actualizado: ' + settingsTeamPresenceState.onlineCount + ' conectados de ' + list.length + gSuffix + '.', 'ok');
                }
                return;
            }
            settingsTeamPresenceState.error = (res && res.unavailable) ? 'unavailable' : 'auth_failed';
        } catch (e) {
            settingsTeamPresenceState.error = 'unavailable';
        } finally {
            settingsTeamPresenceInFlight = false;
        }
        settingsTeamPresenceState.loading = false;
        window.renderSettingsTeamPresenceList();
        if (showFeedback) {
            setSettingsStatusBox('settingsTeamPresenceStatus', 'No se pudo consultar el equipo en vivo. Intenta de nuevo.', 'warn');
        }
    };

    window.revokeSingleSettingsSession = async function (targetDeviceId) {
        if (!activeAdvisorSession || !activeAdvisorSession.authToken || !targetDeviceId) return;
        try {
            const res = await callInvWebAppPost('inv_revoke_session', {
                authToken: activeAdvisorSession.authToken,
                advisorEmail: activeAdvisorSession.correo,
                sheetTab: activeAdvisorSession.sheetTab || '',
                deviceId: getActiveSessionDeviceId(),
                targetDeviceId: targetDeviceId
            }, 15000);
            if (res && res.ok) {
                syncGuestSlotMetaFromSessionResponse(res);
                setSettingsStatusBox('settingsSessionsStatus', 'Sesión cerrada remotamente.', 'ok');
                window.refreshSettingsOpenSessions(false);
            } else {
                setSettingsStatusBox('settingsSessionsStatus', 'No se pudo cerrar esa sesión remota.', 'err');
            }
        } catch (e) {
            setSettingsStatusBox('settingsSessionsStatus', 'Error de red al cerrar la sesión remota.', 'err');
        }
    };

    window.revokeSettingsOtherSessions = async function () {
        if (!activeAdvisorSession || !activeAdvisorSession.authToken) return;
        const btn = document.getElementById('btnSettingsRevokeOthers');
        if (btn) { btn.disabled = true; btn.textContent = 'Cerrando...'; }
        try {
            const res = await callInvWebAppPost('inv_revoke_session', {
                authToken: activeAdvisorSession.authToken,
                advisorEmail: activeAdvisorSession.correo,
                sheetTab: activeAdvisorSession.sheetTab || '',
                deviceId: getActiveSessionDeviceId(),
                targetDeviceId: 'ALL_OTHERS'
            }, 15000);
            if (res && res.ok) {
                syncGuestSlotMetaFromSessionResponse(res);
                const count = Number(res.revokedCount || 0);
                const msg = count === 0
                    ? 'No había otras sesiones abiertas en otros dispositivos.'
                    : ('Se cerraron ' + count + (count === 1 ? ' sesión' : ' sesiones') + ' en otros dispositivos.');
                setSettingsStatusBox('settingsSessionsStatus', msg, 'ok');
                window.refreshSettingsOpenSessions(false);
            } else {
                setSettingsStatusBox('settingsSessionsStatus', 'Actualiza Apps Script para cerrar sesiones en otros dispositivos.', 'warn');
            }
        } catch (e) {
            setSettingsStatusBox('settingsSessionsStatus', 'Error de red al cerrar otras sesiones.', 'err');
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = 'Cerrar otras sesiones'; }
        }
    };

    window.searchSettingsProductCandidates = function (queryRaw) {
        if (!isRealAdminAccount() || isKevinAdvisorPreviewActive() || !hasAdminPerm('gestionProductos')) return;
        const listEl = document.getElementById('settingsProdSuggestList');
        if (!listEl) return;
        const q = String(queryRaw || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
        if (!q || q.length < 2) {
            listEl.innerHTML = '';
            listEl.classList.add('hidden');
            return;
        }
        const matches = [];
        for (let i = 0; i < allItems.length && matches.length < 12; i++) {
            const it = allItems[i];
            if (!it || !it.s) continue;
            const hay = (String(it.s) + ' ' + String(it.n || '') + ' ' + String(it.c || ''))
                .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
            if (hay.indexOf(q) !== -1) {
                matches.push(it);
            }
        }
        if (!matches.length) {
            listEl.innerHTML = '<div class="inv-settings-section-sub" style="padding:6px 8px;">Sin coincidencias para "' + escapeHtml(queryRaw) + '".</div>';
            listEl.classList.remove('hidden');
            return;
        }
        listEl.innerHTML = matches.map(it => {
            const sku = String(it.s).toUpperCase();
            const ovr = getProductOverrideForSku(sku);
            const stTag = ovr && ovr.status !== 'VISIBLE' ? (' [' + ovr.status + ']') : '';
            return (
                '<button type="button" class="inv-settings-suggest-btn" data-inv-act="edit-settings-prod" data-sku="' + escapeHtml(sku) + '">' +
                    '<span style="font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtml(sku + ' · ' + (it.n || '')) + '</span>' +
                    '<span style="font-size:11px;color:var(--inv-muted);flex-shrink:0;">' + escapeHtml((it.c || '') + stTag) + '</span>' +
                '</button>'
            );
        }).join('');
        listEl.classList.remove('hidden');
    };

    window.selectSettingsProductForEdit = function (skuRaw) {
        if (!isRealAdminAccount() || isKevinAdvisorPreviewActive() || !hasAdminPerm('gestionProductos')) return;
        const sku = String(skuRaw || '').trim().toUpperCase();
        const it = bySkuMap.get(sku) || null;
        const ovr = getProductOverrideForSku(sku);
        if (!it && !ovr) return;
        settingsSelectedProductSku = sku;

        const suggestEl = document.getElementById('settingsProdSuggestList');
        const wrap = document.getElementById('settingsProdEditorWrap');
        const skuLbl = document.getElementById('settingsProdSelectedSkuLabel');
        const stBadge = document.getElementById('settingsProdSelectedStatusBadge');
        const nameInp = document.getElementById('settingsProdNameInput');
        const catInp = document.getElementById('settingsProdCategoryInput');
        const priceInp = document.getElementById('settingsProdPriceInput');
        const noteInp = document.getElementById('settingsProdNoteInput');
        const btnArch = document.getElementById('btnSettingsProdArchive');
        const btnRest = document.getElementById('btnSettingsProdRestore');

        if (suggestEl) suggestEl.classList.add('hidden');
        if (wrap) wrap.classList.remove('hidden');
        const status = (ovr && ovr.status) || 'VISIBLE';
        if (skuLbl) skuLbl.textContent = 'SKU: ' + sku;
        if (stBadge) stBadge.textContent = status;
        if (nameInp) nameInp.value = (ovr && ovr.name) || (it && it.n) || '';
        if (catInp) catInp.value = (ovr && ovr.category) || (it && it._cat) || (it && it.c) || '';
        const parsedPr = it ? parsePriceNum(it.pr) : 0;
        const pVal = (ovr && ovr.price !== null && ovr.price !== undefined && ovr.price !== '') ? ovr.price : (parsedPr > 0 ? parsedPr : '');
        if (priceInp) priceInp.value = pVal !== '' ? String(pVal) : '';
        if (noteInp) noteInp.value = (ovr && ovr.note) || '';
        if (btnArch) btnArch.classList.toggle('hidden', status === 'ARCHIVADO');
        if (btnRest) btnRest.classList.toggle('hidden', status === 'VISIBLE');
        setSettingsStatusBox('settingsProdStatus', '', 'ok');
    };

    function renderSettingsProductOverridesList() {
        const listEl = document.getElementById('settingsProdOverridesList');
        const cntEl = document.getElementById('settingsProductsOverrideCount');
        const entries = Object.keys(invProductOverridesMap || {})
            .map(k => invProductOverridesMap[k])
            .filter(e => e && !/^V(?:COV|FAB):/i.test(String(e.sku || '')));
        if (cntEl) cntEl.textContent = entries.length + (entries.length === 1 ? ' cambio' : ' cambios');
        if (!listEl) return;
        if (!entries.length) {
            listEl.innerHTML = '<div class="inv-settings-section-sub">Aún no hay productos archivados, editados o eliminados.</div>';
            return;
        }
        listEl.innerHTML = entries.map(e => {
            const skuEsc = escapeHtml(e.sku);
            const pillCls = e.status === 'ELIMINADO'
                ? 'inv-settings-pill-del'
                : (e.status === 'ARCHIVADO' ? 'inv-settings-pill-arch' : 'inv-settings-pill-live');
            const subParts = [
                e.name || '',
                e.price !== null && e.price !== undefined ? ('$' + Number(e.price).toLocaleString('es-MX')) : '',
                e.note || ''
            ].filter(Boolean);
            return (
                '<div class="inv-settings-prod-item">' +
                    '<div class="inv-settings-item-main">' +
                        '<div class="inv-settings-item-title">' + skuEsc + '</div>' +
                        '<div class="inv-settings-item-meta">' + escapeHtml(subParts.join(' · ') || 'Sin nota') + '</div>' +
                    '</div>' +
                    '<div style="display:flex;align-items:center;gap:5px;flex-shrink:0;">' +
                        '<span class="' + pillCls + '">' + escapeHtml(e.status) + '</span>' +
                        '<button type="button" class="inv-btn-secondary" style="padding:4px 8px;font-size:11px;" data-inv-act="edit-settings-prod" data-sku="' + skuEsc + '">Editar</button>' +
                    '</div>' +
                '</div>'
            );
        }).join('');
    }

    window.submitSettingsProductAction = async function (opRaw) {
        if (settingsProdInFlight || !isRealAdminAccount() || isKevinAdvisorPreviewActive() || !hasAdminPerm('gestionProductos')) return;
        const sku = String(settingsSelectedProductSku || '').trim().toUpperCase();
        if (!sku) {
            setSettingsStatusBox('settingsProdStatus', 'Primero selecciona un SKU de la búsqueda.', 'err');
            return;
        }
        const op = String(opRaw || 'SAVE').toUpperCase();
        if (op === 'DELETE') {
            if (typeof window.confirm === 'function' && !window.confirm('¿Eliminar ' + sku + ' de la vista del Cotizador? (No borra filas ni fórmulas de INVENTARIO_EN_VIVO y podrás restaurarlo después).')) {
                return;
            }
        }
        const nameVal = cleanStr((document.getElementById('settingsProdNameInput') || {}).value);
        const catVal = cleanStr((document.getElementById('settingsProdCategoryInput') || {}).value);
        const priceRaw = cleanStr((document.getElementById('settingsProdPriceInput') || {}).value);
        const noteVal = cleanStr((document.getElementById('settingsProdNoteInput') || {}).value);
        const actorEmail = cleanStr(activeAdvisorSession && activeAdvisorSession.correo) || OWNER_FOTOS_EMAIL;

        settingsProdInFlight = true;
        setSettingsStatusBox('settingsProdStatus', 'Guardando...', 'warn');

        const localNextStatus = op === 'ARCHIVE' ? 'ARCHIVADO' : (op === 'DELETE' ? 'ELIMINADO' : (op === 'RESTORE' ? 'VISIBLE' : ((getProductOverrideForSku(sku) || {}).status || 'VISIBLE')));
        const localEntry = {
            sku: sku,
            status: localNextStatus,
            name: nameVal,
            category: catVal,
            price: priceRaw !== '' && isFinite(Number(priceRaw)) ? Number(priceRaw) : null,
            note: noteVal,
            updatedBy: actorEmail,
            updatedAt: new Date().toLocaleString('es-MX')
        };

        try {
            const res = await callInvWebAppPost('inv_product_override_save', {
                authToken: activeAdvisorSession.authToken || '',
                advisorEmail: actorEmail,
                sheetTab: activeAdvisorSession.sheetTab || 'CUENTAS ADMINISTRATIVAS',
                sku: sku,
                op: op,
                name: nameVal,
                category: catVal,
                price: priceRaw,
                note: noteVal
            }, 20000);

            if (res && res.ok && res.override) {
                invProductOverridesMap[sku] = res.override;
                saveLocalProductOverridesMap(invProductOverridesMap);
                rerenderCatalogAfterOverrideChange();
                window.selectSettingsProductForEdit(sku);
                renderSettingsProductOverridesList();
                const verb = op === 'ARCHIVE' ? 'archivado' : (op === 'DELETE' ? 'eliminado del cotizador' : (op === 'RESTORE' ? 'restaurado a visible' : 'guardado'));
                setSettingsStatusBox('settingsProdStatus', 'SKU ' + sku + ' ' + verb + ' correctamente en la nube.', 'ok');
            } else {
                invProductOverridesMap[sku] = localEntry;
                saveLocalProductOverridesMap(invProductOverridesMap);
                rerenderCatalogAfterOverrideChange();
                window.selectSettingsProductForEdit(sku);
                renderSettingsProductOverridesList();
                setSettingsStatusBox('settingsProdStatus', 'Aplicado localmente (' + ((res && res.error) || 'actualiza Apps Script de Control de Productos para sincronizarlo a todos los asesores') + ').', 'warn');
            }
        } catch (e) {
            invProductOverridesMap[sku] = localEntry;
            saveLocalProductOverridesMap(invProductOverridesMap);
            rerenderCatalogAfterOverrideChange();
            window.selectSettingsProductForEdit(sku);
            renderSettingsProductOverridesList();
            setSettingsStatusBox('settingsProdStatus', 'Aplicado en este dispositivo; sincroniza Apps Script para replicarlo.', 'warn');
        } finally {
            settingsProdInFlight = false;
        }
    };

    // ========================================================================
    // REGISTRO DE DEMANDA / PIEZAS SOLICITADAS SIN STOCK (DEMANDA_SIN_STOCK)
    // ========================================================================
    const INV_OOS_LOCAL_BACKUP_KEY = 'creata_inv_oos_requests_backup_v1';
    let oosReqInFlight = false;
    let oosReqActiveContext = null;

    function computeStockSummaryForDemandItem(it) {
        if (!it || !Array.isArray(it.st)) return 'Sin dato de stock';
        const lppt = Math.max(0, Number(it.st[0]) || 0);
        let storeTotal = 0;
        for (let i = 1; i < it.st.length; i++) {
            storeTotal += Math.max(0, Number(it.st[i]) || 0);
        }
        if (storeTotal === 0 && lppt === 0) return '0 en tiendas · 0 LPPT (Agotado)';
        return storeTotal + ' en tiendas/CEDIS · ' + lppt + ' LPPT';
    }

    function buildOutOfStockRequestContext(itemOverride, groupOverride) {
        const it = itemOverride || currentDetailItem || null;
        const grp = groupOverride || currentGroup || null;
        if (it) {
            const sku = cleanStr(it.s).toUpperCase();
            const modelName = stripDimensionsFromProductText(it.n) || cleanStr(it._groupTitle) || sku;
            const category = cleanStr(it.c || (grp && grp.category) || '');
            const varParts = [];
            const bedSz = (typeof resolveItemBedSize === 'function') ? resolveItemBedSize(it) : null;
            if (bedSz && bedSz.key && bedSz.key !== 'UNSPECIFIED' && bedSz.label) {
                varParts.push(bedSz.label);
            }
            const fabText = [cleanStr(it.tl), cleanStr(it.ct)].filter(Boolean).join(' ').trim();
            if (fabText) varParts.push(fabText);
            const woodText = [cleanStr(it.md), cleanStr(it.cm)].filter(Boolean).join(' ').trim();
            if (!fabText && woodText) varParts.push(woodText);
            return {
                sku: sku,
                modelName: modelName.toUpperCase(),
                category: category,
                variantInfo: varParts.join(' · '),
                stockSummary: computeStockSummaryForDemandItem(it)
            };
        }
        if (grp) {
            const itemsArr = Array.isArray(grp.items) ? grp.items : [];
            const sample = itemsArr[0] || null;
            const sku = sample && sample.s ? cleanStr(sample.s).toUpperCase() : cleanStr(grp.key).toUpperCase();
            const modelName = cleanStr(grp.displayTitle || grp.title || sku).toUpperCase();
            const category = cleanStr((sample && sample.c) || grp.category || '');
            const varParts = [];
            if (currentGroupBedSizeKey) varParts.push(currentGroupBedSizeKey);
            if (currentGroupFabricKey) varParts.push(currentGroupFabricKey);
            return {
                sku: sku,
                modelName: modelName,
                category: category,
                variantInfo: varParts.join(' · '),
                stockSummary: itemsArr.length ? ('Grupo (' + itemsArr.length + ' variantes)') : 'Sin stock'
            };
        }
        return {
            sku: '',
            modelName: '',
            category: '',
            variantInfo: '',
            stockSummary: 'Sin dato de stock'
        };
    }

    function saveOutOfStockRequestLocalBackup(entry) {
        try {
            const safeEntry = Object.assign({}, entry || {});
            delete safeEntry.authToken;
            delete safeEntry.accessKey;
            const raw = localStorage.getItem(INV_OOS_LOCAL_BACKUP_KEY);
            const arr = raw ? (JSON.parse(raw) || []) : [];
            if (Array.isArray(arr)) {
                arr.unshift(safeEntry);
                localStorage.setItem(INV_OOS_LOCAL_BACKUP_KEY, JSON.stringify(arr.slice(0, 60)));
            }
        } catch (e) {}
    }

    window.openOutOfStockRequestModal = function () {
        if (!activeAdvisorSession || activeAdvisorSession.mustChangeKey || isGuestSession()) return;
        const modal = document.getElementById('outOfStockRequestModal');
        if (!modal) return;

        const ctx = buildOutOfStockRequestContext();
        oosReqActiveContext = ctx;

        const skuEl = document.getElementById('oosReqSkuInput');
        const modelEl = document.getElementById('oosReqModelInput');
        const qtyEl = document.getElementById('oosReqQtyInput');
        const comEl = document.getElementById('oosReqCommentsInput');
        const btnEl = document.getElementById('btnOosReqSubmit');

        if (skuEl) skuEl.value = ctx.sku || '';
        if (modelEl) modelEl.value = ctx.modelName || '';
        if (qtyEl) qtyEl.value = '1';
        if (comEl) comEl.value = '';
        if (btnEl) {
            btnEl.disabled = false;
            btnEl.textContent = 'Guardar';
        }
        setSettingsStatusBox('oosReqStatus', '', 'ok');

        modal.classList.add('open');
        notifyInvBackStatePush('out_of_stock_request_modal');
        setTimeout(function () {
            if (comEl && typeof comEl.focus === 'function') comEl.focus();
        }, 40);
    };

    window.closeOutOfStockRequestModal = function () {
        const modal = document.getElementById('outOfStockRequestModal');
        if (modal) modal.classList.remove('open');
    };

    window.submitOutOfStockRequest = async function (ev) {
        if (ev && typeof ev.preventDefault === 'function') ev.preventDefault();
        if (oosReqInFlight || !activeAdvisorSession || activeAdvisorSession.mustChangeKey || isGuestSession()) return;

        const skuEl = document.getElementById('oosReqSkuInput');
        const modelEl = document.getElementById('oosReqModelInput');
        const qtyEl = document.getElementById('oosReqQtyInput');
        const comEl = document.getElementById('oosReqCommentsInput');
        const btnEl = document.getElementById('btnOosReqSubmit');

        const sku = cleanStr(skuEl ? skuEl.value : '').toUpperCase();
        const modelName = cleanStr(modelEl ? modelEl.value : '').toUpperCase();
        const qtyRaw = Number(qtyEl ? qtyEl.value : 1);
        const qty = (isFinite(qtyRaw) && qtyRaw >= 1) ? Math.min(999, Math.round(qtyRaw)) : 1;
        const variantInfo = cleanStr(oosReqActiveContext && oosReqActiveContext.variantInfo);
        const comments = cleanStr(comEl ? comEl.value : '');

        if (!sku && !modelName) {
            setSettingsStatusBox('oosReqStatus', 'Falta el SKU o modelo.', 'err');
            return;
        }
        if (!comments) {
            setSettingsStatusBox('oosReqStatus', 'Escribe un comentario.', 'err');
            if (comEl && typeof comEl.focus === 'function') comEl.focus();
            return;
        }

        const activeStore = isKevinAdvisorPreviewActive()
            ? getKevinAdvisorPreviewStore()
            : cleanStr(activeAdvisorSession.erpStore || activeAdvisorSession.branchLabel || activeAdvisorSession.sheetTab || 'SIN ASIGNAR');
        const resolvedOosToken = recoverStoredInvAuthToken(activeAdvisorSession);
        if (resolvedOosToken && !activeAdvisorSession.authToken) {
            activeAdvisorSession.authToken = resolvedOosToken;
        }
        const payload = {
            authToken: resolvedOosToken || '',
            advisorEmail: cleanStr(activeAdvisorSession.correo),
            sheetTab: cleanStr(activeAdvisorSession.sheetTab),
            erpStore: activeStore,
            sku: sku,
            modelName: modelName,
            category: cleanStr(oosReqActiveContext && oosReqActiveContext.category),
            variantInfo: variantInfo,
            qty: qty,
            comments: comments,
            stockSummary: cleanStr(oosReqActiveContext && oosReqActiveContext.stockSummary)
        };

        oosReqInFlight = true;
        if (btnEl) {
            btnEl.disabled = true;
            btnEl.textContent = 'Guardando...';
        }
        setSettingsStatusBox('oosReqStatus', 'Guardando...', 'warn');

        try {
            const res = await callInvWebAppPost('inv_register_demand_request', payload, 18000, true);
            if (res && res.ok) {
                const folio = cleanStr(res.requestId || '');
                saveOutOfStockRequestLocalBackup(Object.assign({ synced: true, requestId: folio, savedAt: Date.now() }, payload));
                setSettingsStatusBox('oosReqStatus', '✓ Guardado' + (folio ? (' · ' + folio) : ''), 'ok');
                if (typeof showToast === 'function') {
                    showToast('Guardado en Sin stock' + (folio ? (' · ' + folio) : ''));
                }
                setTimeout(function () {
                    window.closeOutOfStockRequestModal();
                }, 800);
            } else if (res && res.needsRedeploy) {
                saveOutOfStockRequestLocalBackup(Object.assign({ synced: false, savedAt: Date.now() }, payload));
                setSettingsStatusBox(
                    'oosReqStatus',
                    'Falta publicar una "Nueva versión" en Google Apps Script (Implementar → Administrar implementaciones → Editar).',
                    'err'
                );
            } else if (res && res.authRequired) {
                saveOutOfStockRequestLocalBackup(Object.assign({ synced: false, savedAt: Date.now() }, payload));
                const authMsg = (res && res.error) ? res.error : 'Tu sesión expiró. Confirma tu contraseña y presiona Guardar de nuevo.';
                setSettingsStatusBox('oosReqStatus', authMsg, 'warn');
                if (typeof promptSessionReauth === 'function') {
                    promptSessionReauth(authMsg, null);
                }
            } else {
                saveOutOfStockRequestLocalBackup(Object.assign({ synced: false, savedAt: Date.now() }, payload));
                const errMsg = (res && res.error) ? res.error : 'No se pudo conectar con Apps Script.';
                setSettingsStatusBox('oosReqStatus', errMsg, 'warn');
            }
        } catch (err) {
            saveOutOfStockRequestLocalBackup(Object.assign({ synced: false, savedAt: Date.now() }, payload));
            setSettingsStatusBox('oosReqStatus', 'Error de red. Guardado local.', 'err');
        } finally {
            oosReqInFlight = false;
            if (btnEl) {
                btnEl.disabled = false;
                btnEl.textContent = 'Guardar';
            }
        }
    };

    // ========================================================================
    // REGISTRO DE SUGERENCIAS DE COMPRA (SUGERENCIAS_DE_COMPRA — PARA TODOS)
    // ========================================================================
    const INV_PURCHASE_SUG_LOCAL_BACKUP_KEY = 'creata_inv_purchase_suggestions_backup_v1';
    let purchaseSugInFlight = false;
    let purchaseSugSelectedAmbiente = '';

    function savePurchaseSuggestionLocalBackup(entry) {
        try {
            const safeEntry = Object.assign({}, entry || {});
            delete safeEntry.authToken;
            delete safeEntry.accessKey;
            const raw = localStorage.getItem(INV_PURCHASE_SUG_LOCAL_BACKUP_KEY);
            const arr = raw ? (JSON.parse(raw) || []) : [];
            if (Array.isArray(arr)) {
                arr.unshift(safeEntry);
                localStorage.setItem(INV_PURCHASE_SUG_LOCAL_BACKUP_KEY, JSON.stringify(arr.slice(0, 60)));
            }
        } catch (e) {}
    }

    function syncPurchaseSuggestionAmbienteUi(val) {
        const norm = String(val || '').trim().toUpperCase();
        purchaseSugSelectedAmbiente = (norm === 'INTERIOR' || norm === 'EXTERIOR') ? norm : '';
        const intOpt = document.getElementById('purchaseSugOptInterior');
        const extOpt = document.getElementById('purchaseSugOptExterior');
        const intInp = document.getElementById('purchaseSugAmbInterior');
        const extInp = document.getElementById('purchaseSugAmbExterior');
        if (intOpt) intOpt.classList.toggle('is-selected', purchaseSugSelectedAmbiente === 'INTERIOR');
        if (extOpt) extOpt.classList.toggle('is-selected', purchaseSugSelectedAmbiente === 'EXTERIOR');
        if (intInp) intInp.checked = purchaseSugSelectedAmbiente === 'INTERIOR';
        if (extInp) extInp.checked = purchaseSugSelectedAmbiente === 'EXTERIOR';
    }

    window.selectPurchaseSuggestionAmbiente = function (val) {
        syncPurchaseSuggestionAmbienteUi(val);
    };

    window.openPurchaseSuggestionModal = function () {
        if (!activeAdvisorSession || activeAdvisorSession.mustChangeKey) return;
        const modal = document.getElementById('purchaseSuggestionModal');
        if (!modal) return;

        syncPurchaseSuggestionAmbienteUi('');
        const typeEl = document.getElementById('purchaseSugProductTypeInput');
        const comEl = document.getElementById('purchaseSugCommentsInput');
        const btnEl = document.getElementById('btnPurchaseSugSubmit');

        if (typeEl) typeEl.value = '';
        if (comEl) comEl.value = '';
        if (btnEl) {
            btnEl.disabled = false;
            btnEl.textContent = 'Enviar sugerencia';
        }
        setSettingsStatusBox('purchaseSugStatus', '', 'ok');

        modal.classList.add('open');
        notifyInvBackStatePush('purchase_suggestion_modal');
    };

    window.closePurchaseSuggestionModal = function () {
        const modal = document.getElementById('purchaseSuggestionModal');
        if (modal) modal.classList.remove('open');
    };

    window.submitPurchaseSuggestion = async function (ev) {
        if (ev && typeof ev.preventDefault === 'function') ev.preventDefault();
        if (purchaseSugInFlight || !activeAdvisorSession || activeAdvisorSession.mustChangeKey) return;

        const intInp = document.getElementById('purchaseSugAmbInterior');
        const extInp = document.getElementById('purchaseSugAmbExterior');
        const typeEl = document.getElementById('purchaseSugProductTypeInput');
        const comEl = document.getElementById('purchaseSugCommentsInput');
        const btnEl = document.getElementById('btnPurchaseSugSubmit');

        let ambiente = purchaseSugSelectedAmbiente;
        if (intInp && intInp.checked) ambiente = 'INTERIOR';
        else if (extInp && extInp.checked) ambiente = 'EXTERIOR';

        const tipoProducto = cleanStr(typeEl ? typeEl.value : '');
        const comments = cleanStr(comEl ? comEl.value : '');

        if (ambiente !== 'INTERIOR' && ambiente !== 'EXTERIOR') {
            setSettingsStatusBox('purchaseSugStatus', 'Selecciona Interior o Exterior.', 'err');
            return;
        }
        if (!tipoProducto) {
            setSettingsStatusBox('purchaseSugStatus', 'Indica el tipo de producto.', 'err');
            if (typeEl && typeof typeEl.focus === 'function') typeEl.focus();
            return;
        }
        if (!comments) {
            setSettingsStatusBox('purchaseSugStatus', 'Escribe tus comentarios.', 'err');
            if (comEl && typeof comEl.focus === 'function') comEl.focus();
            return;
        }

        const activeStore = isKevinAdvisorPreviewActive()
            ? getKevinAdvisorPreviewStore()
            : cleanStr(activeAdvisorSession.erpStore || activeAdvisorSession.branchLabel || activeAdvisorSession.sheetTab || 'SIN ASIGNAR');
        const resolvedSugToken = recoverStoredInvAuthToken(activeAdvisorSession);
        if (resolvedSugToken && !activeAdvisorSession.authToken) {
            activeAdvisorSession.authToken = resolvedSugToken;
        }
        const payload = {
            authToken: resolvedSugToken || '',
            advisorEmail: cleanStr(activeAdvisorSession.correo),
            sheetTab: cleanStr(activeAdvisorSession.sheetTab),
            erpStore: activeStore,
            ambiente: ambiente,
            tipoProducto: tipoProducto,
            comments: comments
        };

        purchaseSugInFlight = true;
        if (btnEl) {
            btnEl.disabled = true;
            btnEl.textContent = 'Enviando...';
        }
        setSettingsStatusBox('purchaseSugStatus', 'Guardando sugerencia...', 'warn');

        try {
            const res = await callInvWebAppPost('inv_register_purchase_suggestion', payload, 18000, true);
            if (res && res.ok) {
                const folio = cleanStr(res.suggestionId || '');
                savePurchaseSuggestionLocalBackup(Object.assign({ synced: true, suggestionId: folio, savedAt: Date.now() }, payload));
                setSettingsStatusBox('purchaseSugStatus', '✓ Sugerencia enviada' + (folio ? (' · ' + folio) : ''), 'ok');
                if (typeof showToast === 'function') {
                    showToast('Sugerencia de compra registrada' + (folio ? (' · ' + folio) : ''));
                }
                setTimeout(function () {
                    window.closePurchaseSuggestionModal();
                }, 800);
            } else if (res && res.needsRedeploy) {
                savePurchaseSuggestionLocalBackup(Object.assign({ synced: false, savedAt: Date.now() }, payload));
                setSettingsStatusBox(
                    'purchaseSugStatus',
                    'Falta publicar una "Nueva versión" en Google Apps Script (Implementar → Administrar implementaciones → Editar) para activar Sugerencias de compra.',
                    'err'
                );
            } else if (res && res.authRequired) {
                savePurchaseSuggestionLocalBackup(Object.assign({ synced: false, savedAt: Date.now() }, payload));
                const authMsg = (res && res.error) ? res.error : 'Tu sesión expiró. Confirma tu contraseña y vuelve a enviar tu sugerencia.';
                setSettingsStatusBox('purchaseSugStatus', authMsg, 'warn');
                if (typeof promptSessionReauth === 'function') {
                    promptSessionReauth(authMsg, null);
                }
            } else {
                savePurchaseSuggestionLocalBackup(Object.assign({ synced: false, savedAt: Date.now() }, payload));
                const errMsg = (res && res.error) ? res.error : 'No se pudo conectar con Apps Script.';
                setSettingsStatusBox('purchaseSugStatus', errMsg, 'warn');
            }
        } catch (err) {
            savePurchaseSuggestionLocalBackup(Object.assign({ synced: false, savedAt: Date.now() }, payload));
            setSettingsStatusBox('purchaseSugStatus', 'Error de red. Guardado local.', 'err');
        } finally {
            purchaseSugInFlight = false;
            if (btnEl) {
                btnEl.disabled = false;
                btnEl.textContent = 'Enviar sugerencia';
            }
        }
    };
