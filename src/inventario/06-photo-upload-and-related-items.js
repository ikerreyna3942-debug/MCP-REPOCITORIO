    // ------------------------------------------------------------------------
    // SUBIDA DE FOTOS (1:1 STUDIO FRAMING · MULTI-FOTO · TODOS EXCEPTO INVITADOS)
    // ------------------------------------------------------------------------
    let managerPhotoUploadInFlight = false;
    let uploadPhotoPendingFiles = [];
    let uploadPhotoObjectUrls = [];

    const OWNER_FOTOS_EMAIL = 'kevin.reyna@grupoanipa.com';
    const KEVIN_ROLE_PREVIEW_KEY = 'creata_inv_kevin_role_preview_v1';
    const KEVIN_PREVIEW_STORE_KEY = 'creata_inv_kevin_preview_store_v1';
    const CANONICAL_SQUARE_UPLOAD_PX = 2048;

    const ADMIN_PERM_COLUMNS_CLIENT = [
        { colIndex: 9,  header: 'VER_COTIZADOR',          key: 'cotizador',        label: 'Cotizador' },
        { colIndex: 10, header: 'VER_SEGUIMIENTO',        key: 'seguimiento',      label: 'Seguimiento' },
        { colIndex: 11, header: 'VER_HISTORIAL',          key: 'historial',        label: 'Historial' },
        { colIndex: 12, header: 'VER_FOTOS_APP',          key: 'fotosApp',         label: 'App Fotos / Portadas' },
        { colIndex: 13, header: 'VER_PROMPTS_IA',         key: 'promptsIa',        label: 'Prompts IA' },
        { colIndex: 14, header: 'VER_PANEL_SUITE',        key: 'panelSuite',       label: 'Panel Suite' },
        { colIndex: 15, header: 'VER_EQUIPO_Y_INVITADOS', key: 'equipoInvitados',  label: 'Equipo e Invitados' },
        { colIndex: 16, header: 'VER_CAMBIAR_ROL',        key: 'cambiarRol',       label: 'Modo Admin/Asesor' },
        { colIndex: 17, header: 'VER_GESTION_PRODUCTOS',  key: 'gestionProductos', label: 'Gestionar SKUs' },
        { colIndex: 18, header: 'VER_SUBIR_FOTO',         key: 'subirFoto',        label: 'Subir foto' },
        { colIndex: 19, header: 'VER_CAMBIAR_TIENDA',     key: 'cambiarTienda',    label: 'Cambiar tienda' }
    ];

    function defaultAdminPermissionsForEmailClient(emailRaw) {
        const em = String(emailRaw || '').trim().toLowerCase().replace(/,/g, '.');
        const isOwnerKevin = (em === OWNER_FOTOS_EMAIL);
        return {
            cotizador: true,
            seguimiento: true,
            historial: true,
            fotosApp: isOwnerKevin,
            promptsIa: isOwnerKevin,
            panelSuite: isOwnerKevin,
            equipoInvitados: true,
            cambiarRol: true,
            gestionProductos: isOwnerKevin,
            subirFoto: true,
            cambiarTienda: true
        };
    }

    function parseAdminPermCellClient(rawVal, fallbackBool) {
        if (rawVal === true) return true;
        if (rawVal === false) return false;
        const s = String(rawVal === null || rawVal === undefined ? '' : rawVal)
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim()
            .toUpperCase();
        if (!s) return !!fallbackBool;
        if (/^(SI|YES|TRUE|1|X|OK|VER|ACTIVO|HABILITADO)$/.test(s)) return true;
        if (/^(NO|FALSE|0|OCULTO|INACTIVO|DESHABILITADO|-)$/.test(s)) return false;
        return !!fallbackBool;
    }

    function extractAdminPermissionsFromRowClient(headerRow, rowArr, emailRaw) {
        const perms = defaultAdminPermissionsForEmailClient(emailRaw);
        const hdr = Array.isArray(headerRow) ? headerRow : [];
        const r = Array.isArray(rowArr) ? rowArr : [];
        const colByKey = {};
        for (let c = 0; c < hdr.length; c++) {
            const norm = String(hdr[c] || '')
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .toUpperCase()
                .replace(/[^A-Z0-9]+/g, '_')
                .replace(/^_+|_+$/g, '');
            if (!norm) continue;
            for (let k = 0; k < ADMIN_PERM_COLUMNS_CLIENT.length; k++) {
                const def = ADMIN_PERM_COLUMNS_CLIENT[k];
                if (norm === def.header || norm.indexOf(def.header) !== -1) {
                    colByKey[def.key] = c;
                }
            }
        }
        for (let k = 0; k < ADMIN_PERM_COLUMNS_CLIENT.length; k++) {
            const def = ADMIN_PERM_COLUMNS_CLIENT[k];
            const idx = (colByKey[def.key] !== undefined) ? colByKey[def.key] : def.colIndex;
            if (idx < r.length) {
                perms[def.key] = parseAdminPermCellClient(r[idx], perms[def.key]);
            }
        }
        return perms;
    }

    const UNIFIED_STORE_COLUMNS_CLIENT = [
        { colIndex: 21, headers: ['COLOCIO', 'COLOSIO', 'TIENDA_COLOCIO', 'TIENDA_COLOSIO'], tab: 'COLOCIO' },
        { colIndex: 22, headers: ['PLAYA', 'TIENDA_PLAYA'], tab: 'PLAYA' },
        { colIndex: 23, headers: ['PTC', 'PUERTO_CANCUN', 'TIENDA_PTC'], tab: 'PTC' },
        { colIndex: 24, headers: ['CASA_CREATA', 'TIENDA_CASA_CREATA'], tab: 'CASA CREATA' },
        { colIndex: 25, headers: ['PROYECTOS', 'TIENDA_PROYECTOS'], tab: 'PROYECTOS' }
    ];

    function inferStoreTabFromAreaClient(areaRaw) {
        const up = String(areaRaw || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
        if (!up) return '';
        if (up.indexOf('COLOCIO') !== -1 || up.indexOf('COLOSIO') !== -1) return 'COLOCIO';
        if (up.indexOf('PLAYA') !== -1) return 'PLAYA';
        if (up.indexOf('PTC') !== -1 || up.indexOf('PUERTO') !== -1) return 'PTC';
        if (up.indexOf('CASA') !== -1) return 'CASA CREATA';
        if (up.indexOf('PROYECTO') !== -1) return 'PROYECTOS';
        return '';
    }

    function isAdministrativeUnifiedRowClient(correoRaw, areaColB, puestoColD, hasStoreCols) {
        const em = String(correoRaw || '').trim().toLowerCase().replace(/,/g, '.');
        if (typeof ADMIN_MASTER_EMAILS !== 'undefined' && ADMIN_MASTER_EMAILS && ADMIN_MASTER_EMAILS[em]) return true;
        if (em === OWNER_FOTOS_EMAIL || em === 'santiago.torres@grupoanipa.com') return true;
        const areaUp = String(areaColB || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
        const puestoUp = String(puestoColD || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
        if (/ADMINISTRACI[OÓ]N|ADMINISTRADOR|ADMIN\s+GENERAL/.test(areaUp)) return true;
        if (/ADMINISTRADOR|ADMINISTRACI[OÓ]N|DIRECCI[OÓ]N|GERENCIA\s+GENERAL/.test(puestoUp)) return true;
        if (!hasStoreCols) {
            if (/(ASESOR|GERENTE\s+DE\s+TIENDA|GERENTE\s+COMERCIAL|COORDINADOR|ARQUITECT|INTERIORISTA)/.test(puestoUp)) return false;
            return true;
        }
        return false;
    }

    function extractAssignedStoresFromRowClient(headerRow, rowArr, areaColB) {
        const hdr = Array.isArray(headerRow) ? headerRow : [];
        const r = Array.isArray(rowArr) ? rowArr : [];
        const colByTab = {};
        let detectedStoreHeader = false;
        for (let c = 0; c < hdr.length; c++) {
            const norm = String(hdr[c] || '')
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .toUpperCase()
                .replace(/[^A-Z0-9]+/g, '_')
                .replace(/^_+|_+$/g, '');
            if (!norm) continue;
            for (let k = 0; k < UNIFIED_STORE_COLUMNS_CLIENT.length; k++) {
                const def = UNIFIED_STORE_COLUMNS_CLIENT[k];
                if (def.headers.indexOf(norm) !== -1) {
                    colByTab[def.tab] = c;
                    detectedStoreHeader = true;
                }
            }
        }
        const hasStoreCols = detectedStoreHeader || r.length >= 22;
        const stores = [];
        if (hasStoreCols) {
            for (let k = 0; k < UNIFIED_STORE_COLUMNS_CLIENT.length; k++) {
                const def = UNIFIED_STORE_COLUMNS_CLIENT[k];
                const idx = (colByTab[def.tab] !== undefined) ? colByTab[def.tab] : def.colIndex;
                if (idx < r.length && parseAdminPermCellClient(r[idx], false) === true) {
                    stores.push(def.tab);
                }
            }
        }
        if (!stores.length) {
            const inferred = inferStoreTabFromAreaClient(areaColB);
            if (inferred) stores.push(inferred);
        }
        return { hasStoreCols: hasStoreCols, stores: stores };
    }

    function isRealAdminAccount() {
        if (!activeAdvisorSession || activeAdvisorSession.mustChangeKey) return false;
        if (typeof isGuestSession === 'function' && isGuestSession()) return false;
        const emailNorm = String(activeAdvisorSession.correo || '').trim().toLowerCase().replace(/,/g, '.');
        return Boolean(activeAdvisorSession.isAdmin || emailNorm === OWNER_FOTOS_EMAIL || emailNorm === 'santiago.torres@grupoanipa.com');
    }

    function getActiveAdminPermissions() {
        if (!isRealAdminAccount()) return null;
        if (activeAdvisorSession && activeAdvisorSession.adminPermissions && typeof activeAdvisorSession.adminPermissions === 'object') {
            return Object.assign(defaultAdminPermissionsForEmailClient(activeAdvisorSession.correo), activeAdvisorSession.adminPermissions);
        }
        return defaultAdminPermissionsForEmailClient(activeAdvisorSession && activeAdvisorSession.correo);
    }

    function hasAdminPerm(permKey) {
        if (!isRealAdminAccount()) return false;
        const perms = getActiveAdminPermissions();
        return !!(perms && perms[permKey] === true);
    }

    function isRealKevinOwner() {
        if (!activeAdvisorSession || activeAdvisorSession.mustChangeKey) return false;
        if (typeof isGuestSession === 'function' && isGuestSession()) return false;
        const emailNorm = String(activeAdvisorSession.correo || '').trim().toLowerCase().replace(/,/g, '.');
        return emailNorm === OWNER_FOTOS_EMAIL;
    }

    function isKevinAdvisorPreviewActive() {
        if (!isRealAdminAccount()) return false;
        if (!isRealKevinOwner() && !hasAdminPerm('cambiarRol')) return false;
        try {
            return typeof sessionStorage !== 'undefined' && sessionStorage.getItem(KEVIN_ROLE_PREVIEW_KEY) === 'ASESOR';
        } catch (e) {
            return false;
        }
    }

    function getKevinAdvisorPreviewStore() {
        try {
            const s = typeof sessionStorage !== 'undefined' ? String(sessionStorage.getItem(KEVIN_PREVIEW_STORE_KEY) || '').trim() : '';
            if (s) return s;
        } catch (e) {}
        return 'CREATA PUERTO CANCUN';
    }

    function isEffectiveAdminSession() {
        if (!activeAdvisorSession || activeAdvisorSession.mustChangeKey) return false;
        if (typeof isGuestSession === 'function' && isGuestSession()) return false;
        if (isKevinAdvisorPreviewActive()) return false;
        return !!activeAdvisorSession.isAdmin;
    }

    function isFotosAppOwner() {
        if (!isEffectiveAdminSession()) return false;
        return hasAdminPerm('fotosApp');
    }

    function canManageProductPhotos() {
        if (!activeAdvisorSession || activeAdvisorSession.mustChangeKey) return false;
        if (typeof isGuestSession === 'function' && isGuestSession()) return false;
        if (isEffectiveAdminSession() && !hasAdminPerm('subirFoto')) return false;
        if (!isEffectiveAdminSession() && activeAdvisorSession.userPermissions && activeAdvisorSession.userPermissions.subirFoto === false) return false;
        return true;
    }

    function setDetailUploadPhotoStatus(text, tone, htmlContent) {
        const el = document.getElementById('detUploadPhotoStatus');
        if (!el) return;
        if (!text && !htmlContent) {
            el.textContent = '';
            el.classList.add('hidden');
            return;
        }
        if (htmlContent) {
            el.innerHTML = htmlContent;
        } else {
            el.textContent = text;
        }
        el.className = 'rounded-xl border px-3.5 py-2.5 text-[11px] font-bold ' +
            (tone === 'ok' ? 'sem-green' : (tone === 'warn' ? 'sem-yellow' : 'sem-red'));
    }

    function refreshDetailManagerPhotoControls(it, preserveStatus) {
        const wrap = document.getElementById('detManagerPhotoWrap');
        const inp = document.getElementById('detUploadPhotoInput');
        if (!preserveStatus) {
            setDetailUploadPhotoStatus('', '');
        }
        if (wrap) wrap.classList.add('hidden');
        if (inp) inp.disabled = true;
    }

    function normalizePhotoToSquare1x1DataUrl(file, targetSide, quality) {
        const side = targetSide || CANONICAL_SQUARE_UPLOAD_PX;
        const jpegQ = quality || 0.88;
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
            reader.onload = function () {
                const rawDataUrl = String(reader.result || '');
                if (!rawDataUrl.startsWith('data:image/')) {
                    reject(new Error('Archivo no válido.'));
                    return;
                }
                const img = new Image();
                img.onerror = function () { resolve(rawDataUrl); };
                img.onload = function () {
                    try {
                        const nw = img.naturalWidth || img.width || 1;
                        const nh = img.naturalHeight || img.height || 1;
                        let sx = 0, sy = 0, sw = nw, sh = nh;
                        const bounds = detectProductStudioBoundsFromSource(img, 96);
                        if (bounds && bounds.isWhiteBg) {
                            const padSrcX = Math.round(nw * 0.015);
                            const padSrcY = Math.round(nh * 0.015);
                            const bx = Math.max(0, Math.floor(bounds.uMin * nw) - padSrcX);
                            const by = Math.max(0, Math.floor(bounds.vMin * nh) - padSrcY);
                            const bx2 = Math.min(nw, Math.ceil(bounds.uMax * nw) + padSrcX);
                            const by2 = Math.min(nh, Math.ceil(bounds.vMax * nh) + padSrcY);
                            if ((bx2 - bx) >= nw * 0.08 && (by2 - by) >= nh * 0.08) {
                                sx = bx;
                                sy = by;
                                sw = bx2 - bx;
                                sh = by2 - by;
                            }
                        }

                        // Lienzo cuadrado uniforme 2048x2048 (#FFFFFF) con escala proporcional (~78% eje mayor) para jamás deformar sillones ni sofás
                        const outW = side;
                        const outH = side;
                        const out = document.createElement('canvas');
                        out.width = outW;
                        out.height = outH;
                        const ctx = out.getContext('2d');
                        ctx.fillStyle = '#FFFFFF';
                        ctx.fillRect(0, 0, outW, outH);

                        const padX = Math.round(outW * 0.11);
                        const padY = Math.round(outH * 0.11);
                        const fitScale = Math.min((outW - padX * 2) / sw, (outH - padY * 2) / sh);
                        const dw = Math.max(1, Math.round(sw * fitScale));
                        const dh = Math.max(1, Math.round(sh * fitScale));
                        const dx = Math.round((outW - dw) / 2);
                        const dy = Math.round((outH - dh) / 2);
                        ctx.imageSmoothingEnabled = true;
                        ctx.imageSmoothingQuality = 'high';
                        ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
                        resolve(out.toDataURL('image/jpeg', jpegQ));
                    } catch (eCanvas) {
                        resolve(rawDataUrl);
                    }
                };
                img.src = rawDataUrl;
            };
            reader.readAsDataURL(file);
        });
    }

    function setUploadPhotoModalStatus(text, tone) {
        const el = document.getElementById('uploadPhotoStatus');
        if (!el) return;
        if (!text) {
            el.textContent = '';
            el.classList.add('hidden');
            return;
        }
        el.textContent = text;
        el.className = 'rounded-xl border px-3 py-2 text-[11px] font-bold ' +
            (tone === 'ok' ? 'sem-green' : (tone === 'warn' ? 'sem-yellow' : 'sem-red'));
    }

    function revokeUploadPhotoPreviews() {
        for (let i = 0; i < uploadPhotoObjectUrls.length; i++) {
            try { URL.revokeObjectURL(uploadPhotoObjectUrls[i]); } catch (e) {}
        }
        uploadPhotoObjectUrls = [];
    }

    function renderUploadPhotoPreviewGrid() {
        const grid = document.getElementById('uploadPhotoPreviewGrid');
        const countEl = document.getElementById('uploadPhotoCountLabel');
        if (countEl) {
            const n = uploadPhotoPendingFiles.length;
            countEl.textContent = n === 1 ? '1 seleccionada' : (n + ' seleccionadas');
        }
        revokeUploadPhotoPreviews();
        if (!grid) return;
        if (!uploadPhotoPendingFiles.length) {
            grid.innerHTML = '';
            grid.classList.add('hidden');
            return;
        }
        grid.innerHTML = uploadPhotoPendingFiles.map((file, idx) => {
            const url = URL.createObjectURL(file);
            uploadPhotoObjectUrls.push(url);
            return '<div class="inv-upload-tile">' +
                '<img width="120" height="120" loading="lazy" decoding="async" src="' + escapeHtml(url) + '" alt="">' +
                '<button type="button" class="inv-upload-tile-rm" onclick="removeUploadPhotoFileAt(' + idx + ')" aria-label="Quitar">✕</button>' +
            '</div>';
        }).join('');
        grid.classList.remove('hidden');
    }

    window.removeUploadPhotoFileAt = function (idx) {
        if (managerPhotoUploadInFlight) return;
        if (idx >= 0 && idx < uploadPhotoPendingFiles.length) {
            uploadPhotoPendingFiles.splice(idx, 1);
            renderUploadPhotoPreviewGrid();
        }
    };

    window.onUploadPhotoFilesSelected = function (fileList) {
        const inp = document.getElementById('uploadPhotoFilesInput');
        if (!fileList || !fileList.length) return;
        for (let i = 0; i < fileList.length; i++) {
            const f = fileList[i];
            if (f && (!f.type || /^image\//i.test(f.type))) {
                uploadPhotoPendingFiles.push(f);
            }
        }
        if (inp) inp.value = '';
        renderUploadPhotoPreviewGrid();
        setUploadPhotoModalStatus('', '');
    };

    const PHOTO_CATEGORY_DEST_FOLDERS = [
        { key: 'SALAS',        id: '1xo2z2bIE_HCscBiqFI8Ew-KhQacBElsb', name: 'FOTOS SALAS',                short: 'Salas' },
        { key: 'SILLONES',     id: '1zqGnweu7T5-9f6dQoVXuT9MZTBPefSNm', name: 'FOTOS SILLONES',             short: 'Sillones' },
        { key: 'SOFA_CAMA',    id: '1nU1UgT78XiGo-OLrV4tIrxNKxy9CTd8_', name: 'FOTOS SOFÁ CAMA Y FUTTONES', short: 'Sofá Cama' },
        { key: 'MESA_CENTRO',  id: '1-KcgtpX7hVbsxFsejewVY7QT95Jzno_A', name: 'FOTOS MESA DE CENTRO',       short: 'Mesa Centro' },
        { key: 'MESA_LATERAL', id: '1oRW0Mtpc7tKvDZjfrq4VCwhA332fV1lX', name: 'FOTOS MESA LATERALES',       short: 'Mesa Lateral' },
        { key: 'COMEDORES',    id: '1iaZaA1TXcGVL9WABWi656Xouzviiog6K', name: 'FOTOS COMEDORES',            short: 'Comedores' },
        { key: 'RECAMARAS',    id: '1LyU1n-4SsuJTuchYQmGYHRpcdu0gh2i6', name: 'FOTOS RECAMARAS',            short: 'Recámaras' },
        { key: 'AUXILIARES',   id: '1peDTq6kj9iPZaxxYUId0Jw-MJmQN4aJ8', name: 'FOTOS DE AUXILIARES',        short: 'Auxiliares' },
        { key: 'ACCESORIOS',   id: '13mOw-BpuZSYpD55qPangEEXWuWW-1OL9', name: 'FOTOS ACCESORIOS Y ESPEJOS', short: 'Accesorios' },
        { key: 'INTERIOR',     id: '1mo5gn59M0m-psn0f6o9B1OtUHeCpz3S9', name: 'FOTOS INTERIOR',             short: 'Interior' }
    ];
    const PHOTO_DEST_BY_ID = new Map(PHOTO_CATEGORY_DEST_FOLDERS.map(f => [f.id, f]));

    function resolvePhotoDestCategoryFolder(it) {
        if (!it) return PHOTO_CATEGORY_DEST_FOLDERS[9];
        const cat = plainModelToken(it._cat || it.c || '');
        const tp = plainModelToken(it.tp || '');
        const nom = plainModelToken(it.n || '');
        const tpNom = (tp + ' ' + nom).trim();
        const text = (tpNom + ' ' + cat).trim();

        if (/\bFUTON|\bFUTTON|SOFA\s*CAMA/.test(text)) return PHOTO_CATEGORY_DEST_FOLDERS[2];
        if (/MESA\s+LATERAL|MESA\s+AUXILIAR/.test(text) || (cat.indexOf('MESAS DE CENTRO') !== -1 && /\bLATERAL|\bAUXILIAR/.test(text))) {
            return PHOTO_CATEGORY_DEST_FOLDERS[4];
        }
        if (/MESA\s+DE\s+CENTRO|MESA\s+CENTRAL|\bNIDO\b/.test(text) || cat.indexOf('MESAS DE CENTRO') !== -1) {
            return PHOTO_CATEGORY_DEST_FOLDERS[3];
        }
        if (/\bSILLAS?\b/.test(nom) && !/\b(SILLON(?:ES)?|MESAS?|COLGANTES?|COLUMPIOS?)\b/.test(nom) && !/^SALA\b/.test(nom)) {
            return PHOTO_CATEGORY_DEST_FOLDERS[5];
        }
        if (/\b(SILLON(?:ES)?|POLTRONA|RECLINABLE|BUTACA|TABURETE|OTTOMAN|PUFF)\b/.test(tpNom)) {
            return PHOTO_CATEGORY_DEST_FOLDERS[1];
        }
        if (cat.indexOf('SALAS') !== -1 || /\bSALA\b|\bMODULAR\b|LOVE\s*SEAT|\bCHAISE\b|\bESQUINERO\b|\bSOFA\b/.test(tpNom)) {
            return PHOTO_CATEGORY_DEST_FOLDERS[0];
        }
        if (cat.indexOf('COMEDORES') !== -1 || /\bCOMEDOR|MESA\s+DE\s+COMEDOR|\bSILLA\b|\bBANCO\b|\bBANCA\b/.test(tpNom)) {
            return PHOTO_CATEGORY_DEST_FOLDERS[5];
        }
        if (cat.indexOf('RECAMARAS') !== -1 || /\bCAMA\b|\bCABECERA|\bCOLCHON|\bBURO\b|\bCOMODA\b|\bCAJONERA|\bTOCADOR|PIE\s+DE\s+CAMA/.test(tpNom)) {
            return PHOTO_CATEGORY_DEST_FOLDERS[6];
        }
        if (
            cat.indexOf('ACCESORIOS') !== -1 || cat.indexOf('COJINES') !== -1 || cat.indexOf('ESPEJOS') !== -1 || cat.indexOf('ILUMINACION') !== -1 ||
            /\bESPEJO|\bCUADRO|\bLAMPARA|\bCOJIN|\bFUNDA|\bPLANTA|\bFOLLAJE|\bFLORERO|\bJARRON|\bCHAROLA|\bTAPETE|\bVELA\b|\bFIGURA|\bACCESORIO/.test(tpNom)
        ) {
            return PHOTO_CATEGORY_DEST_FOLDERS[8];
        }
        if (
            cat.indexOf('BUFETERAS') !== -1 || cat.indexOf('COMPLEMENTOS') !== -1 || cat.indexOf('OFICINA') !== -1 || cat.indexOf('EXTERIOR') !== -1 ||
            /\bCREDENZA|\bBUFETERA|\bLIBRERO|MUEBLE\s+PARA\s+TV|MESA\s+DE\s+TV|\bBAR\b|\bCONSOLA|\bAUXILIAR|\bESCRITORIO/.test(tpNom)
        ) {
            return PHOTO_CATEGORY_DEST_FOLDERS[7];
        }
        return PHOTO_CATEGORY_DEST_FOLDERS[9];
    }

    function renderUploadPhotoProductInfoCard(it) {
        const card = document.getElementById('uploadPhotoProductInfoCard');
        const grid = document.getElementById('uploadPhotoProductInfoGrid');
        const sibWrap = document.getElementById('uploadPhotoSiblingVariantsWrap');
        const sibList = document.getElementById('uploadPhotoSiblingVariantsList');
        if (!card || !grid) return;
        if (!it) {
            card.classList.add('hidden');
            grid.innerHTML = '';
            if (sibWrap) sibWrap.classList.add('hidden');
            if (sibList) sibList.innerHTML = '';
            return;
        }

        const catFolder = resolvePhotoDestCategoryFolder(it);
        const catSel = document.getElementById('uploadPhotoCategorySelect');
        const activeFolderId = (catSel && catSel.value && catSel.value !== 'AUTO' && PHOTO_DEST_BY_ID.has(catSel.value))
            ? catSel.value
            : catFolder.id;
        const activeFolderMeta = PHOTO_DEST_BY_ID.get(activeFolderId) || catFolder;

        const finishParts = [];
        if (cleanStr(it.tl)) finishParts.push(cleanStr(it.tl) + (cleanStr(it.ct) && plainModelToken(it.tl).indexOf(plainModelToken(it.ct)) === -1 ? (' (' + cleanStr(it.ct) + ')') : ''));
        if (cleanStr(it.md)) finishParts.push(cleanStr(it.md) + (cleanStr(it.cm) && plainModelToken(it.md).indexOf(plainModelToken(it.cm)) === -1 ? (' ' + cleanStr(it.cm)) : ''));
        else if (cleanStr(it.cm)) finishParts.push(cleanStr(it.cm));
        if (!finishParts.length && cleanStr(it.mt)) finishParts.push(cleanStr(it.mt));

        const infoCells = [
            ['SKU', cleanStr(it.s)],
            ['Categoría Foto', activeFolderMeta.name.replace(/^FOTOS\s+(DE\s+)?/i, '')],
            ['Modelo', cleanStr(it.mo) || cleanStr(it.tp) || '—'],
            ['Variante', (cleanStr(it.vr) && cleanStr(it.vr) !== 'ESTÁNDAR') ? cleanStr(it.vr) : (finishParts[0] || 'Estándar')],
            ['Medidas', cleanStr(it.m) || '—'],
            ['Acabado / Material', finishParts.join(' · ') || '—']
        ];

        grid.innerHTML = infoCells.map(pair => (
            '<div class="rounded-lg px-2 py-1 border" style="background:#FFFFFF;border-color:#E7E0CD;min-width:0;">' +
                '<div class="text-[11px] font-extrabold uppercase tracking-wider" style="color:#8C6D3F;">' + escapeHtml(pair[0]) + '</div>' +
                '<div class="text-[11px] font-bold truncate" style="color:#252C32;" title="' + escapeHtml(pair[1]) + '">' + escapeHtml(pair[1]) + '</div>' +
            '</div>'
        )).join('');
        card.classList.remove('hidden');

        if (sibWrap && sibList) {
            const grp = it._groupKey ? groupsByKey.get(it._groupKey) : null;
            const sibs = (grp && Array.isArray(grp.items)) ? grp.items : [];
            if (sibs.length > 1) {
                sibList.innerHTML = sibs.slice(0, 20).map(sib => {
                    const sSku = cleanStr(sib.s).toUpperCase();
                    const isCur = sSku === cleanStr(it.s).toUpperCase();
                    const vLbl = (cleanStr(sib.vr) && cleanStr(sib.vr) !== 'ESTÁNDAR') ? cleanStr(sib.vr) : (cleanStr(sib.tl) || cleanStr(sib.md) || sSku);
                    return '<button type="button" class="px-2 py-0.5 rounded-full text-[11px] font-bold border whitespace-nowrap" ' +
                        'style="' + (isCur ? 'background:#252C32;color:#FFFFFF;border-color:#252C32;' : 'background:#FFFFFF;color:#252C32;border-color:#D8CFAF;') + '" ' +
                        'data-inv-act="upload-model-opt" data-sku="' + escapeHtml(sSku) + '">' +
                        escapeHtml(sSku + ' · ' + vLbl.slice(0, 22)) +
                    '</button>';
                }).join('');
                sibWrap.classList.remove('hidden');
            } else {
                sibWrap.classList.add('hidden');
                sibList.innerHTML = '';
            }
        }
    }

    window.onUploadPhotoCategoryChanged = function () {
        const hiddenSku = document.getElementById('uploadPhotoSelectedSku');
        const curSku = cleanStr(hiddenSku ? hiddenSku.value : '').toUpperCase();
        if (curSku && bySkuMap.has(curSku)) {
            renderUploadPhotoProductInfoCard(bySkuMap.get(curSku));
        } else {
            const inp = document.getElementById('uploadPhotoModelInput');
            window.filterUploadPhotoModelOptions(inp ? inp.value : '');
        }
    };

    window.selectUploadPhotoModelOption = function (skuVal) {
        const sku = String(skuVal || '').trim().toUpperCase();
        const it = bySkuMap.get(sku);
        const inp = document.getElementById('uploadPhotoModelInput');
        const hiddenSku = document.getElementById('uploadPhotoSelectedSku');
        const badge = document.getElementById('uploadPhotoMatchedBadge');
        const dd = document.getElementById('uploadPhotoModelDropdown');
        const catSel = document.getElementById('uploadPhotoCategorySelect');
        const appFotosLinkEl = document.getElementById('uploadPhotoAppFotosLink');
        if (appFotosLinkEl) {
            appFotosLinkEl.setAttribute('href', sku ? ('./fotos-productos.html?sku=' + encodeURIComponent(sku)) : './fotos-productos.html');
        }
        if (it) {
            const cleanName = stripDimensionsFromProductText(it.n) || it.mo || it.s;
            const catFolder = resolvePhotoDestCategoryFolder(it);
            if (inp) inp.value = cleanName;
            if (hiddenSku) hiddenSku.value = sku;
            if (catSel && catFolder) catSel.value = catFolder.id;
            if (badge) {
                badge.textContent = sku + ' · ' + cleanName + ' · ' + catFolder.name;
                badge.classList.remove('hidden');
            }
            renderUploadPhotoProductInfoCard(it);
        } else {
            if (hiddenSku) hiddenSku.value = sku;
            if (badge) badge.classList.add('hidden');
            renderUploadPhotoProductInfoCard(null);
        }
        if (dd) dd.classList.add('hidden');
    };

    window.filterUploadPhotoModelOptions = function (rawQuery) {
        const dd = document.getElementById('uploadPhotoModelDropdown');
        const hiddenSku = document.getElementById('uploadPhotoSelectedSku');
        const badge = document.getElementById('uploadPhotoMatchedBadge');
        const catSel = document.getElementById('uploadPhotoCategorySelect');
        if (hiddenSku) hiddenSku.value = '';
        if (badge) badge.classList.add('hidden');
        renderUploadPhotoProductInfoCard(null);
        if (!dd) return;

        const filterFolderId = (catSel && catSel.value && catSel.value !== 'AUTO') ? catSel.value : '';
        const q = normalizePlain(rawQuery || '').trim();
        const tokens = q ? q.split(/\s+/).filter(Boolean) : [];
        const matches = [];
        for (let i = 0; i < allItems.length && matches.length < 24; i++) {
            const it = allItems[i];
            if (!it || !it.s) continue;
            if (filterFolderId && resolvePhotoDestCategoryFolder(it).id !== filterFolderId) continue;
            if (!tokens.length) {
                matches.push(it);
                continue;
            }
            const hay = normalizePlain((it.s || '') + ' ' + (it.mo || '') + ' ' + (it.n || '') + ' ' + (it.vr || '') + ' ' + (it.c || ''));
            let ok = true;
            for (let t = 0; t < tokens.length; t++) {
                if (hay.indexOf(tokens[t]) === -1) { ok = false; break; }
            }
            if (ok) matches.push(it);
        }

        if (!matches.length) {
            dd.innerHTML = '';
            dd.classList.add('hidden');
            return;
        }
        dd.innerHTML = matches.map(it => {
            const sku = String(it.s || '').trim().toUpperCase();
            const nm = stripDimensionsFromProductText(it.n) || it.mo || sku;
            const catMeta = resolvePhotoDestCategoryFolder(it);
            const vrTxt = (cleanStr(it.vr) && cleanStr(it.vr) !== 'ESTÁNDAR') ? (' · ' + cleanStr(it.vr)) : '';
            return '<button type="button" class="inv-combo-opt" onmousedown="event.preventDefault(); selectUploadPhotoModelOption(\'' + escapeHtml(sku) + '\')">' +
                '<span class="inv-combo-opt-sku">' + escapeHtml(sku) + '</span>' +
                '<span class="inv-combo-opt-name">' + escapeHtml(nm + vrTxt) + ' <strong style="color:#8C6D3F;font-size:11px;">[' + escapeHtml(catMeta.short) + ']</strong></span>' +
            '</button>';
        }).join('');
        const ddWasHidden = dd.classList.contains('hidden');
        dd.classList.remove('hidden');
        if (ddWasHidden) notifyInvBackStatePush('upload_photo_dropdown');
    };

    window.openUploadPhotoModelDropdown = function () {
        const inp = document.getElementById('uploadPhotoModelInput');
        window.filterUploadPhotoModelOptions(inp ? inp.value : '');
    };

    const SUBIR_PREN_FOLDER_ID_INV = '11_rR-qhgM02Sfx9zw7uHU5AwXvTpKD4p';
    const SUBIR_PREN_WIN_PATH_INV = 'G:\\Mi unidad\\DOC ANIPA\\Fotos general\\Fotos de del proyeto\\SUBIR PREN';
    const SUBIR_PREN_DIR_IDB_NAME_INV = 'creata_subir_pren_dir_idb_v1';
    const SUBIR_PREN_DIR_IDB_STORE_INV = 'dir_handles';
    const SUBIR_PREN_DIR_IDB_KEY_INV = 'subir_pren';

    let uploadPhotoDriveFilesCache = [];
    let uploadPhotoSelectedDriveFileId = '';
    let uploadPhotoDriveLoading = false;

    function openInvSubirPrenDirDb() {
        return new Promise(function (resolve) {
            try {
                if (typeof indexedDB === 'undefined' || !indexedDB || typeof indexedDB.open !== 'function') {
                    resolve(null);
                    return;
                }
                const req = indexedDB.open(SUBIR_PREN_DIR_IDB_NAME_INV, 1);
                req.onupgradeneeded = function () {
                    try {
                        const db = req.result;
                        if (db && !db.objectStoreNames.contains(SUBIR_PREN_DIR_IDB_STORE_INV)) {
                            db.createObjectStore(SUBIR_PREN_DIR_IDB_STORE_INV);
                        }
                    } catch (eUp) {}
                };
                req.onsuccess = function () { resolve(req.result || null); };
                req.onerror = function () { resolve(null); };
            } catch (e) {
                resolve(null);
            }
        });
    }

    async function readInvSavedSubirPrenDirHandle() {
        const db = await openInvSubirPrenDirDb();
        if (!db) return null;
        return new Promise(function (resolve) {
            try {
                const tx = db.transaction(SUBIR_PREN_DIR_IDB_STORE_INV, 'readonly');
                const req = tx.objectStore(SUBIR_PREN_DIR_IDB_STORE_INV).get(SUBIR_PREN_DIR_IDB_KEY_INV);
                req.onsuccess = function () { resolve(req.result || null); };
                req.onerror = function () { resolve(null); };
            } catch (e) {
                resolve(null);
            }
        });
    }

    async function writeInvSavedSubirPrenDirHandle(handle) {
        const db = await openInvSubirPrenDirDb();
        if (!db || !handle) return false;
        return new Promise(function (resolve) {
            try {
                const tx = db.transaction(SUBIR_PREN_DIR_IDB_STORE_INV, 'readwrite');
                tx.objectStore(SUBIR_PREN_DIR_IDB_STORE_INV).put(handle, SUBIR_PREN_DIR_IDB_KEY_INV);
                tx.oncomplete = function () { resolve(true); };
                tx.onerror = function () { resolve(false); };
            } catch (e) {
                resolve(false);
            }
        });
    }

    async function collectInvImagesFromDirHandle(dirHandle, depth) {
        const out = [];
        if (!dirHandle || typeof dirHandle.values !== 'function') return out;
        const curDepth = typeof depth === 'number' ? depth : 0;
        for await (const entry of dirHandle.values()) {
            if (!entry) continue;
            if (entry.kind === 'file' && typeof entry.getFile === 'function') {
                try {
                    const f = await entry.getFile();
                    if (!f) continue;
                    const mime = String(f.type || '').toLowerCase();
                    if (mime.indexOf('image/') === 0 || /\.(jpe?g|png|webp|gif|avif|bmp)$/i.test(f.name || '')) {
                        out.push(f);
                    }
                } catch (eF) {}
            } else if (entry.kind === 'directory' && curDepth < 1) {
                const sub = await collectInvImagesFromDirHandle(entry, curDepth + 1);
                for (let s = 0; s < sub.length; s++) out.push(sub[s]);
            }
        }
        return out;
    }

    function detectSkuFromSubirPrenFilename(fileName) {
        const base = cleanStr(fileName).replace(/\.[a-zA-Z0-9]{2,5}$/, '').trim().toUpperCase();
        if (!base) return '';
        if (bySkuMap.has(base)) return base;
        const firstWord = cleanStr(base.split(/\s+/)[0]);
        if (firstWord.length >= 4 && bySkuMap.has(firstWord)) return firstWord;
        const firstPart = cleanStr(base.split(/[\s_\-]+/)[0]);
        if (firstPart.length >= 4 && bySkuMap.has(firstPart)) return firstPart;
        const tokens = base.split(/[^A-Z0-9\-]+/);
        for (let i = 0; i < tokens.length; i++) {
            if (tokens[i].length >= 5 && bySkuMap.has(tokens[i])) return tokens[i];
        }
        return '';
    }

    function persistFotosSavedOverrideFromCotizador(sku, newUrl, fileId, productName, destFolderName) {
        try {
            const cleanUrl = cleanStr(newUrl);
            if (!cleanUrl || cleanUrl.indexOf('blob:') === 0) return;
            const raw = localStorage.getItem(FOTOS_SAVED_OVERRIDES_STORAGE_KEY);
            const prev = raw ? (JSON.parse(raw) || []) : [];
            const list = Array.isArray(prev) ? prev.filter(function (x) { return cleanStr(x && x.sku).toUpperCase() !== sku; }) : [];
            list.unshift({
                sku: sku,
                productName: productName || sku,
                newUrl: cleanUrl,
                fileId: cleanStr(fileId) || extractDriveFileId(cleanUrl),
                destFolderName: destFolderName || '',
                ts: Date.now()
            });
            localStorage.setItem(FOTOS_SAVED_OVERRIDES_STORAGE_KEY, JSON.stringify(list.slice(0, 120)));
        } catch (eOv) {}

        const msg = {
            type: 'CREATA_SPLIT_PHOTO_SAVED',
            sku: sku,
            photoUrl: cleanStr(newUrl),
            deleted: false,
            fileId: cleanStr(fileId) || extractDriveFileId(newUrl),
            destFolderName: destFolderName || '',
            source: 'cotizador'
        };
        try {
            if (_invSplitActive) {
                const frame = document.getElementById('invSplitFotosFrame');
                if (frame && frame.contentWindow && typeof frame.contentWindow.postMessage === 'function') {
                    frame.contentWindow.postMessage(msg, '*');
                }
            }
            if (window.parent && window.parent !== window && typeof window.parent.postMessage === 'function') {
                window.parent.postMessage(msg, '*');
            }
        } catch (ePm) {}
        try {
            if (typeof BroadcastChannel === 'function') {
                const ch = new BroadcastChannel(FOTOS_SYNC_BROADCAST_CHANNEL);
                ch.postMessage(msg);
                ch.close();
            }
        } catch (eBc) {}
    }

    function readKevinFotosAccessKeyFallback() {
        try {
            if (typeof sessionStorage !== 'undefined') {
                const sec = cleanStr(sessionStorage.getItem('creata_private_kevin_fotos_sec_v1'));
                if (sec) return sec;
            }
            const secLocal = cleanStr(localStorage.getItem('creata_private_kevin_fotos_sec_v1'));
            if (secLocal) return secLocal;
            const fotosSess = JSON.parse(localStorage.getItem('creata_private_kevin_fotos_v1') || 'null');
            if (fotosSess && cleanStr(fotosSess.accessKey)) return cleanStr(fotosSess.accessKey);
        } catch (e) {}
        return '';
    }

    async function callOwnerFotosEndpointFromCotizador(action, extraPayload, timeoutMs) {
        const basePayload = Object.assign({
            authToken: (activeAdvisorSession && activeAdvisorSession.authToken) || '',
            advisorEmail: (activeAdvisorSession && activeAdvisorSession.correo) || '',
            sheetTab: (activeAdvisorSession && activeAdvisorSession.sheetTab) || 'PROYECTOS',
            inboxFolderId: SUBIR_PREN_FOLDER_ID_INV
        }, extraPayload || {});
        const fallbackKey = readKevinFotosAccessKeyFallback();
        if (fallbackKey && !basePayload.accessKey) {
            basePayload.accessKey = fallbackKey;
        }
        let res = await callInvWebAppPost(action, basePayload, timeoutMs || 30000, true);
        if (res && res.renewedAuthToken && activeAdvisorSession) {
            activeAdvisorSession.authToken = cleanStr(res.renewedAuthToken);
        }
        if (res && !res.ok && !res.unavailable && !cleanStr(res.error) && fallbackKey) {
            const loginRes = await callInvWebAppPost('inv_login', {
                email: (activeAdvisorSession && activeAdvisorSession.correo) || 'kevin.reyna@grupoanipa.com',
                accessKey: fallbackKey,
                sheetTab: 'PROYECTOS'
            }, 10000, true);
            const freshTok = cleanStr(loginRes && (loginRes.authToken || (loginRes.user && loginRes.user.authToken)));
            if (freshTok) {
                if (activeAdvisorSession) activeAdvisorSession.authToken = freshTok;
                res = await callInvWebAppPost(action, Object.assign({}, basePayload, { authToken: freshTok }), timeoutMs || 30000, true);
            }
        }
        return res;
    }

    function renderDriveSubirPrenGridInCotizador() {
        const gridEl = document.getElementById('uploadPhotoDriveInboxGrid');
        const countEl = document.getElementById('uploadPhotoDriveInboxCount');
        if (!gridEl) return;
        if (uploadPhotoDriveLoading) {
            gridEl.innerHTML = '<div class="inv-muted-sm" style="grid-column:1/-1;padding:8px;">Cargando SUBIR PREN de Drive...</div>';
            return;
        }
        if (!uploadPhotoDriveFilesCache.length) {
            if (countEl) countEl.textContent = '☁️ Drive SUBIR PREN (0 fotos)';
            gridEl.innerHTML = '<div class="inv-muted-sm" style="grid-column:1/-1;padding:8px;">No hay fotos pendientes en Drive SUBIR PREN.</div>';
            return;
        }
        if (countEl) countEl.textContent = '☁️ Drive SUBIR PREN (' + uploadPhotoDriveFilesCache.length + ')';
        gridEl.innerHTML = uploadPhotoDriveFilesCache.slice(0, 60).map(function (f) {
            const fid = cleanStr(f && f.id);
            const isSel = fid && fid === uploadPhotoSelectedDriveFileId;
            const thumb = cleanStr(f.thumbDataUrl || f.thumbUrl) || ('https://lh3.googleusercontent.com/d/' + encodeURIComponent(fid) + '=w320');
            return '<button type="button" class="inv-subir-pren-item' + (isSel ? ' is-selected' : '') + '" data-inv-act="subir-pren-pick" data-fid="' + escapeHtml(fid) + '">' +
                '<img width="96" height="62" src="' + escapeHtml(thumb) + '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">' +
                '<span class="inv-subir-pren-item-name">' + escapeHtml(f.name || fid) + '</span>' +
            '</button>';
        }).join('');
    }

    window.selectDriveSubirPrenPhotoInCotizador = function (fileId) {
        const fid = cleanStr(fileId);
        if (!fid) return;
        if (uploadPhotoSelectedDriveFileId === fid) {
            uploadPhotoSelectedDriveFileId = '';
        } else {
            uploadPhotoSelectedDriveFileId = fid;
            uploadPhotoPendingFiles = [];
            renderUploadPhotoPreviewGrid();
            const found = uploadPhotoDriveFilesCache.find(function (x) { return cleanStr(x && x.id) === fid; });
            if (found) {
                const hiddenSku = document.getElementById('uploadPhotoSelectedSku');
                if (hiddenSku && !cleanStr(hiddenSku.value)) {
                    const sug = detectSkuFromSubirPrenFilename(found.name);
                    if (sug) window.selectUploadPhotoModelOption(sug);
                }
            }
        }
        const cntLbl = document.getElementById('uploadPhotoCountLabel');
        if (cntLbl) {
            cntLbl.textContent = uploadPhotoSelectedDriveFileId
                ? '1 de Drive SUBIR PREN'
                : (uploadPhotoPendingFiles.length + ' seleccionadas');
        }
        renderDriveSubirPrenGridInCotizador();
    };

    window.loadDriveSubirPrenInCotizador = async function (forceReload) {
        if (!isFotosAppOwner()) return [];
        const wrap = document.getElementById('uploadPhotoDriveInboxWrap');
        if (wrap) wrap.classList.remove('hidden');
        if (uploadPhotoDriveLoading) return uploadPhotoDriveFilesCache;
        const shouldReload = forceReload !== false;
        if (!shouldReload && uploadPhotoDriveFilesCache.length > 0) {
            renderDriveSubirPrenGridInCotizador();
            return uploadPhotoDriveFilesCache;
        }
        uploadPhotoDriveLoading = true;
        renderDriveSubirPrenGridInCotizador();
        try {
            const res = await callOwnerFotosEndpointFromCotizador('fotos_subir_list', { forceReload: true }, 30000);
            if (res && res.ok && Array.isArray(res.files)) {
                uploadPhotoDriveFilesCache = res.files;
                const hiddenSku = document.getElementById('uploadPhotoSelectedSku');
                const curSku = cleanStr(hiddenSku ? hiddenSku.value : '').toUpperCase();
                if (curSku && !uploadPhotoSelectedDriveFileId && !uploadPhotoPendingFiles.length) {
                    const autoMatch = res.files.find(function (f) {
                        return detectSkuFromSubirPrenFilename(f && f.name) === curSku;
                    });
                    if (autoMatch && autoMatch.id) {
                        uploadPhotoSelectedDriveFileId = cleanStr(autoMatch.id);
                        const cntLbl = document.getElementById('uploadPhotoCountLabel');
                        if (cntLbl) cntLbl.textContent = '1 de Drive SUBIR PREN';
                    }
                }
            } else if (res && res.authRequired) {
                setUploadPhotoModalStatus(res.error || 'Confirma tu contraseña para leer Drive SUBIR PREN.', 'warn');
            }
        } finally {
            uploadPhotoDriveLoading = false;
            renderDriveSubirPrenGridInCotizador();
        }
        return uploadPhotoDriveFilesCache;
    };

    window.toggleDriveSubirPrenInCotizador = function () {
        const wrap = document.getElementById('uploadPhotoDriveInboxWrap');
        if (!wrap) return;
        const willOpen = wrap.classList.contains('hidden');
        if (willOpen) {
            wrap.classList.remove('hidden');
            window.loadDriveSubirPrenInCotizador(true);
        } else {
            wrap.classList.add('hidden');
        }
    };

    window.pickLocalSubirPrenInCotizador = async function (forcePickNew) {
        if (typeof window.showDirectoryPicker !== 'function') {
            const folderInp = document.getElementById('uploadPhotoFolderInput');
            if (folderInp && typeof folderInp.click === 'function') folderInp.click();
            return;
        }
        try {
            let dirHandle = forcePickNew ? null : await readInvSavedSubirPrenDirHandle();
            if (dirHandle) {
                let perm = 'granted';
                if (typeof dirHandle.queryPermission === 'function') perm = await dirHandle.queryPermission({ mode: 'read' });
                if (perm !== 'granted' && typeof dirHandle.requestPermission === 'function') perm = await dirHandle.requestPermission({ mode: 'read' });
                if (perm !== 'granted') dirHandle = null;
            }
            if (!dirHandle) {
                dirHandle = await window.showDirectoryPicker({ id: 'creata_subir_pren_pc', mode: 'read' });
                if (!dirHandle) return;
                await writeInvSavedSubirPrenDirHandle(dirHandle);
            }
            const pathLbl = document.getElementById('uploadPhotoSubirPrenPathLabel');
            if (pathLbl) {
                pathLbl.textContent = '✓ ' + SUBIR_PREN_WIN_PATH_INV + ' (' + String(dirHandle.name || 'SUBIR PREN') + ')';
            }
            const files = await collectInvImagesFromDirHandle(dirHandle, 0);
            if (!files.length) {
                setUploadPhotoModalStatus('La carpeta local SUBIR PREN no contiene imágenes actualmente.', 'warn');
                return;
            }
            const hiddenSku = document.getElementById('uploadPhotoSelectedSku');
            const curSku = cleanStr(hiddenSku ? hiddenSku.value : '').toUpperCase();
            let toSelect = files;
            if (curSku) {
                const matchedSkuFiles = files.filter(function (f) {
                    return detectSkuFromSubirPrenFilename(f.name) === curSku || cleanStr(f.name).toUpperCase().indexOf(curSku) !== -1;
                });
                if (matchedSkuFiles.length > 0) toSelect = matchedSkuFiles;
            } else if (files.length === 1) {
                const sugSku = detectSkuFromSubirPrenFilename(files[0].name);
                if (sugSku) window.selectUploadPhotoModelOption(sugSku);
            }
            uploadPhotoSelectedDriveFileId = '';
            renderDriveSubirPrenGridInCotizador();
            window.onUploadPhotoFilesSelected(toSelect);
            setUploadPhotoModalStatus('✓ ' + toSelect.length + ' foto(s) leída(s) de SUBIR PREN (PC).', 'ok');
        } catch (errDir) {
            if (errDir && (errDir.name === 'AbortError' || /abort/i.test(String(errDir.message || '')))) return;
            const folderInp = document.getElementById('uploadPhotoFolderInput');
            if (folderInp && typeof folderInp.click === 'function') folderInp.click();
        }
    };

    window.openUploadPhotoModal = function (prefillItem) {
        if (!canManageProductPhotos()) return;
        const resolvedItem = typeof prefillItem === 'string'
            ? (bySkuMap.get(cleanStr(prefillItem).toUpperCase()) || (cleanStr(prefillItem) ? { s: cleanStr(prefillItem).toUpperCase(), n: cleanStr(prefillItem).toUpperCase() } : null))
            : prefillItem;
        const modal = document.getElementById('uploadPhotoModal');
        const inp = document.getElementById('uploadPhotoModelInput');
        const hiddenSku = document.getElementById('uploadPhotoSelectedSku');
        const badge = document.getElementById('uploadPhotoMatchedBadge');
        const dd = document.getElementById('uploadPhotoModelDropdown');
        const catSel = document.getElementById('uploadPhotoCategorySelect');
        const progWrap = document.getElementById('uploadPhotoProgressWrap');
        const progBar = document.getElementById('uploadPhotoProgressBar');
        const subBtn = document.getElementById('uploadPhotoSubmitBtn');
        const subirSourcesEl = document.getElementById('uploadPhotoSubirPrenSources');
        const driveTrayEl = document.getElementById('uploadPhotoDriveInboxWrap');

        uploadPhotoPendingFiles = [];
        uploadPhotoSelectedDriveFileId = '';
        renderUploadPhotoPreviewGrid();
        setUploadPhotoModalStatus('', '');
        if (progWrap) progWrap.classList.add('hidden');
        if (progBar) progBar.style.width = '0%';
        if (subBtn) {
            subBtn.disabled = false;
            subBtn.textContent = 'Subir a categoría';
        }
        if (dd) dd.classList.add('hidden');
        if (subirSourcesEl) {
            subirSourcesEl.classList.toggle('hidden', !isFotosAppOwner());
        }
        if (driveTrayEl) {
            driveTrayEl.classList.add('hidden');
        }

        const appFotosLinkEl = document.getElementById('uploadPhotoAppFotosLink');
        if (resolvedItem && resolvedItem.s) {
            const sku = String(resolvedItem.s).trim().toUpperCase();
            const nm = stripDimensionsFromProductText(resolvedItem.n) || resolvedItem.mo || sku;
            const catFolder = resolvePhotoDestCategoryFolder(resolvedItem);
            if (inp) inp.value = nm;
            if (hiddenSku) hiddenSku.value = sku;
            if (catSel && catFolder) catSel.value = catFolder.id;
            if (appFotosLinkEl) appFotosLinkEl.setAttribute('href', './fotos-productos.html?sku=' + encodeURIComponent(sku));
            if (badge) {
                badge.textContent = sku + ' · ' + nm + ' · ' + catFolder.name;
                badge.classList.remove('hidden');
            }
            renderUploadPhotoProductInfoCard(resolvedItem);
        } else {
            if (inp) inp.value = '';
            if (hiddenSku) hiddenSku.value = '';
            if (catSel) catSel.value = 'AUTO';
            if (appFotosLinkEl) appFotosLinkEl.setAttribute('href', './fotos-productos.html');
            if (badge) badge.classList.add('hidden');
            renderUploadPhotoProductInfoCard(null);
        }

        if (modal) {
            modal.classList.add('open');
            notifyInvBackStatePush('upload_photo_modal');
        }
    };

    window.openUploadPhotoModalFromDetail = function () {
        if (!canManageProductPhotos()) return;
        window.openUploadPhotoModal(currentDetailItem || null);
    };

    window.closeUploadPhotoModal = function () {
        if (managerPhotoUploadInFlight) return;
        const modal = document.getElementById('uploadPhotoModal');
        const dd = document.getElementById('uploadPhotoModelDropdown');
        const driveTrayEl = document.getElementById('uploadPhotoDriveInboxWrap');
        if (dd) dd.classList.add('hidden');
        if (driveTrayEl) driveTrayEl.classList.add('hidden');
        if (modal) modal.classList.remove('open');
        uploadPhotoPendingFiles = [];
        uploadPhotoSelectedDriveFileId = '';
        renderUploadPhotoPreviewGrid();
        setUploadPhotoModalStatus('', '');
    };

    window.submitMultiProductPhotos = async function () {
        if (managerPhotoUploadInFlight) return;
        if (!canManageProductPhotos()) {
            setUploadPhotoModalStatus('Sesión sin permiso para subir fotos.', 'err');
            return;
        }
        const inp = document.getElementById('uploadPhotoModelInput');
        const hiddenSku = document.getElementById('uploadPhotoSelectedSku');
        const catSel = document.getElementById('uploadPhotoCategorySelect');
        const typedVal = cleanStr(inp ? inp.value : '');
        const pickedSku = cleanStr(hiddenSku ? hiddenSku.value : '').toUpperCase();
        const exactItem = pickedSku ? bySkuMap.get(pickedSku) : bySkuMap.get(typedVal.toUpperCase());
        const targetSku = (exactItem && exactItem.s ? String(exactItem.s) : (pickedSku || typedVal)).trim().toUpperCase();
        const targetName = (exactItem ? (stripDimensionsFromProductText(exactItem.n) || targetSku) : (typedVal || targetSku));

        const autoCatFolder = resolvePhotoDestCategoryFolder(exactItem || { n: targetName });
        const chosenCatFolderId = (catSel && catSel.value && catSel.value !== 'AUTO' && PHOTO_DEST_BY_ID.has(catSel.value))
            ? catSel.value
            : autoCatFolder.id;
        const chosenCatFolderMeta = PHOTO_DEST_BY_ID.get(chosenCatFolderId) || autoCatFolder;

        if (!targetSku) {
            setUploadPhotoModalStatus('Selecciona o escribe un modelo o SKU.', 'warn');
            if (inp) inp.focus();
            return;
        }

        // Flujo directo desde Google Drive SUBIR PREN (11_rR-qhgM02Sfx9zw7uHU5AwXvTpKD4p) -> Categoría + Hoja '1'!D
        if (isFotosAppOwner() && uploadPhotoSelectedDriveFileId && !uploadPhotoPendingFiles.length) {
            const progWrap = document.getElementById('uploadPhotoProgressWrap');
            const progBar = document.getElementById('uploadPhotoProgressBar');
            const subBtn = document.getElementById('uploadPhotoSubmitBtn');
            const driveFid = uploadPhotoSelectedDriveFileId;

            managerPhotoUploadInFlight = true;
            if (subBtn) { subBtn.disabled = true; subBtn.textContent = 'Asignando...'; }
            if (progWrap) progWrap.classList.remove('hidden');
            if (progBar) progBar.style.width = '40%';
            setUploadPhotoModalStatus('Asignando foto de SUBIR PREN a ' + targetSku + '...', 'warn');

            try {
                const pickedDriveMeta = uploadPhotoDriveFilesCache.find(function (x) { return cleanStr(x && x.id) === driveFid; }) || null;
                const assignRes = await callOwnerFotosEndpointFromCotizador('fotos_subir_assign', {
                    sku: targetSku,
                    productName: targetName,
                    driveFileId: driveFid,
                    shortcutId: cleanStr(pickedDriveMeta && pickedDriveMeta.shortcutId),
                    targetFolderId: chosenCatFolderMeta.id,
                    forceTargetFolderId: true
                }, 35000);

                if (assignRes && assignRes.authRequired) {
                    setUploadPhotoModalStatus(assignRes.error || 'Confirma tu contraseña para continuar.', 'warn');
                    promptSessionReauth(assignRes.error || 'Confirma tu contraseña para continuar.', null);
                    return;
                }
                if (assignRes && assignRes.ok) {
                    const finalFid = cleanStr(assignRes.fileId) || driveFid;
                    const finalUrl = cleanStr(assignRes.newUrl || assignRes.photoUrl) || ('https://drive.google.com/file/d/' + finalFid + '/view?usp=sharing');
                    uploadPhotoDriveFilesCache = uploadPhotoDriveFilesCache.filter(function (x) { return cleanStr(x && x.id) !== driveFid; });
                    uploadPhotoSelectedDriveFileId = '';
                    renderDriveSubirPrenGridInCotizador();
                    applyRealtimePhotoUpdateInCotizador(targetSku, finalUrl, finalFid);
                    persistFotosSavedOverrideFromCotizador(targetSku, finalUrl, finalFid, targetName, chosenCatFolderMeta.name);
                    if (progBar) progBar.style.width = '100%';
                    const okMsg = '✓ Foto de SUBIR PREN asignada a ' + targetSku + ' (' + chosenCatFolderMeta.name + ').';
                    setUploadPhotoModalStatus(okMsg, 'ok');
                    if (currentDetailItem && String(currentDetailItem.s || '').toUpperCase() === targetSku) {
                        setDetailUploadPhotoStatus(okMsg, 'ok');
                    }
                } else {
                    setUploadPhotoModalStatus((assignRes && assignRes.error) || 'No se pudo asignar la foto desde SUBIR PREN.', 'err');
                }
            } finally {
                managerPhotoUploadInFlight = false;
                if (subBtn) { subBtn.disabled = false; subBtn.textContent = 'Subir a categoría'; }
            }
            return;
        }

        if (!uploadPhotoPendingFiles.length) {
            setUploadPhotoModalStatus('Selecciona al menos una foto (o elígela de SUBIR PREN).', 'warn');
            return;
        }

        const total = uploadPhotoPendingFiles.length;
        const progWrap = document.getElementById('uploadPhotoProgressWrap');
        const progBar = document.getElementById('uploadPhotoProgressBar');
        const subBtn = document.getElementById('uploadPhotoSubmitBtn');

        managerPhotoUploadInFlight = true;
        if (subBtn) {
            subBtn.disabled = true;
            subBtn.textContent = 'Subiendo...';
        }
        if (progWrap) progWrap.classList.remove('hidden');
        if (progBar) progBar.style.width = '5%';
        setUploadPhotoModalStatus('Subiendo 0 de ' + total + ' a ' + chosenCatFolderMeta.name + '...', 'warn');

        let completed = 0;
        let okCount = 0;
        let failCount = 0;
        let authStopped = false;
        let lastErrMsg = '';
        let cursor = 0;
        const filesSnap = uploadPhotoPendingFiles.slice();
        const ownerModeAssign = isFotosAppOwner();

        async function uploadOne(file, idx) {
            try {
                const dataUrl = await normalizePhotoToSquare1x1DataUrl(file, CANONICAL_SQUARE_UPLOAD_PX, 0.86);

                // Para el titular (Kevin), subir por SUBIR PREN -> Categoría y registrar en Hoja '1'!D la foto principal
                if (ownerModeAssign && idx === 0) {
                    const upInb = await callOwnerFotosEndpointFromCotizador('fotos_subir_upload_inbox', {
                        fileName: file.name || (targetSku + '.jpg'),
                        dataUrl: dataUrl
                    }, 35000);
                    const upFid = cleanStr(upInb && upInb.ok && upInb.file && upInb.file.id);
                    if (upFid) {
                        const assignRes = await callOwnerFotosEndpointFromCotizador('fotos_subir_assign', {
                            sku: targetSku,
                            productName: targetName,
                            driveFileId: upFid,
                            shortcutId: cleanStr(upInb && upInb.file && upInb.file.shortcutId),
                            targetFolderId: chosenCatFolderMeta.id,
                            forceTargetFolderId: true
                        }, 35000);
                        if (assignRes && assignRes.ok) {
                            const finalFid = cleanStr(assignRes.fileId) || upFid;
                            const finalUrl = cleanStr(assignRes.newUrl || assignRes.photoUrl) || ('https://drive.google.com/file/d/' + finalFid + '/view?usp=sharing');
                            applyRealtimePhotoUpdateInCotizador(targetSku, finalUrl, finalFid);
                            persistFotosSavedOverrideFromCotizador(targetSku, finalUrl, finalFid, targetName, chosenCatFolderMeta.name);
                            okCount++;
                            return;
                        }
                    }
                }

                const res = await callInvWebAppPost('inv_upload_product_photo', {
                    authToken: activeAdvisorSession.authToken || '',
                    sheetTab: activeAdvisorSession.sheetTab || '',
                    advisorEmail: activeAdvisorSession.correo || '',
                    advisorName: activeAdvisorSession.nombre || '',
                    sku: targetSku,
                    productName: targetName,
                    categoria: (exactItem && (exactItem.c || exactItem._cat)) ? String(exactItem.c || exactItem._cat) : chosenCatFolderMeta.name,
                    tipo: (exactItem && exactItem.tp) ? String(exactItem.tp) : '',
                    targetFolderId: FOTOS_NUEVAS_CARGADO_FOLDER_ID,
                    targetCategoryFolderId: chosenCatFolderMeta.id,
                    targetCategoryFolderName: chosenCatFolderMeta.name,
                    driveOnly: true,
                    skipSheetWrite: true,
                    dataUrl: dataUrl
                }, 40000, true);

                if (res && res.authRequired) {
                    authStopped = true;
                    lastErrMsg = res.error || 'Confirma tu contraseña para continuar.';
                    return;
                }
                if (res && res.ok) {
                    if (ownerModeAssign && idx === 0 && cleanStr(res.driveUrl || res.fileId)) {
                        const fbFid = cleanStr(res.fileId) || extractDriveFileId(res.driveUrl);
                        const fbUrl = cleanStr(res.driveUrl) || ('https://drive.google.com/file/d/' + fbFid + '/view?usp=sharing');
                        applyRealtimePhotoUpdateInCotizador(targetSku, fbUrl, fbFid);
                    }
                    okCount++;
                } else {
                    failCount++;
                    lastErrMsg = (res && res.error) ? res.error : 'Error al guardar foto.';
                }
            } catch (err) {
                failCount++;
                lastErrMsg = (err && err.message) ? err.message : 'Error al procesar foto.';
            } finally {
                completed++;
                if (progBar) {
                    progBar.style.width = Math.max(8, Math.round((completed / total) * 100)) + '%';
                }
                if (!authStopped) {
                    setUploadPhotoModalStatus('Subiendo ' + completed + ' de ' + total + '...', 'warn');
                }
            }
        }

        async function worker() {
            while (cursor < filesSnap.length && !authStopped) {
                const idx = cursor++;
                await uploadOne(filesSnap[idx], idx);
            }
        }

        try {
            const concurrency = Math.min(4, filesSnap.length);
            const workers = [];
            for (let w = 0; w < concurrency; w++) workers.push(worker());
            await Promise.all(workers);

            if (authStopped) {
                setUploadPhotoModalStatus(lastErrMsg || 'Confirma tu contraseña para subir fotos.', 'warn');
                promptSessionReauth(lastErrMsg || 'Confirma tu contraseña para continuar.', null);
                return;
            }

            if (okCount > 0 && failCount === 0) {
                uploadPhotoPendingFiles = [];
                renderUploadPhotoPreviewGrid();
                const okMsg = '✓ ' + okCount + (okCount === 1 ? ' foto guardada' : ' fotos guardadas') + ' (' + targetSku + ').';
                setUploadPhotoModalStatus(okMsg, 'ok');
                if (currentDetailItem && String(currentDetailItem.s || '').toUpperCase() === targetSku) {
                    setDetailUploadPhotoStatus(okMsg, 'ok');
                }
            } else if (okCount > 0) {
                setUploadPhotoModalStatus('✓ ' + okCount + ' guardadas · ' + failCount + ' con error (' + (lastErrMsg || 'reintenta') + ').', 'warn');
            } else {
                setUploadPhotoModalStatus(lastErrMsg || 'No se pudieron guardar las fotos.', 'err');
            }
        } finally {
            managerPhotoUploadInFlight = false;
            if (subBtn) {
                subBtn.disabled = false;
                subBtn.textContent = 'Subir';
            }
            if (currentDetailItem) {
                refreshDetailManagerPhotoControls(currentDetailItem, true);
            }
        }
    };

    window.uploadManagerProductPhoto = async function (inputEl) {
        const files = inputEl && inputEl.files && inputEl.files.length ? Array.from(inputEl.files) : [];
        if (inputEl) inputEl.value = '';
        if (!files.length || managerPhotoUploadInFlight) return;
        if (!canManageProductPhotos()) return;
        window.openUploadPhotoModal(currentDetailItem || null);
        window.onUploadPhotoFilesSelected(files);
    };

    let relatedStockExpanded = false;
    let relatedStockRefItem = null;
    let relatedStockRefSku = '';

    function normProductTypeKey(val) {
        return String(cleanStr(val) || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toUpperCase()
            .replace(/[^A-Z0-9]+/g, ' ')
            .trim();
    }

    function getRelatedTypeDisplayLabel(refItem) {
        if (!refItem) return 'RELACIONADOS';
        const tpClean = cleanStr(refItem.tp).toUpperCase();
        if (tpClean) return tpClean;
        if (refItem._cat && refItem._cat !== 'OTROS') return refItem._cat;
        if (refItem._main) return refItem._main;
        return 'RELACIONADOS';
    }

    function getRelatedInStockItems(refItem) {
        if (!refItem) return [];
        const curSku = currentDetailItem ? String(currentDetailItem.s || '').trim().toUpperCase() : '';
        const refTp = normProductTypeKey(refItem.tp);
        const refCat = refItem._cat || '';
        const refMain = refItem._main || '';

        const matches = [];
        for (let i = 0; i < allItems.length; i++) {
            const cand = allItems[i];
            if (!cand || !cand.s) continue;
            const candSku = String(cand.s).trim().toUpperCase();
            if (curSku && candSku === curSku) continue;

            const delivStock = getBodegaPisoStock(cand);
            if (delivStock <= 0) continue;

            const candTp = normProductTypeKey(cand.tp);
            let tier = 0;
            if (refTp && candTp && candTp === refTp) {
                tier = 1;
            } else if (refCat && refCat !== 'OTROS' && cand._cat === refCat) {
                tier = 2;
            } else if (!refTp && (!refCat || refCat === 'OTROS') && refMain && cand._main === refMain) {
                tier = 3;
            }
            if (!tier) continue;

            matches.push({
                it: cand,
                tier: tier,
                stock: delivStock,
                hasPhoto: photoUrlForItem(cand) ? 1 : 0
            });
        }

        matches.sort((a, b) => {
            if (a.tier !== b.tier) return a.tier - b.tier;
            if (b.stock !== a.stock) return b.stock - a.stock;
            return compareAlphaEs(
                stripDimensionsFromProductText(a.it.n) || a.it.s,
                stripDimensionsFromProductText(b.it.n) || b.it.s
            ) || String(a.it.s || '').localeCompare(String(b.it.s || ''));
        });

        return matches;
    }

    function buildDeliveryStockSummary(it) {
        const stocks = Array.isArray(it && it.st) ? it.st : [];
        const byLoc = new Map();
        const shortNames = {
            'CEDIS': 'CEDIS',
            'CASA CREATA': 'Casa Creata',
            'PUERTO CANCUN': 'PTC',
            'COLOSIO': 'Colosio',
            'PLAYA': 'Playa'
        };
        for (let i = 0; i < WAREHOUSES.length; i++) {
            const wh = WAREHOUSES[i];
            if (isLpptWarehouse(wh)) continue;
            const q = Math.max(0, Number(stocks[i]) || 0);
            if (q <= 0) continue;
            const baseLoc = String(wh).replace(/\s*\([^)]*\)\s*/g, '').trim().toUpperCase();
            const label = shortNames[baseLoc] || baseLoc;
            byLoc.set(label, (byLoc.get(label) || 0) + q);
        }
        if (byLoc.size === 1) {
            return Array.from(byLoc.keys())[0];
        }
        const parts = [];
        byLoc.forEach((val, key) => parts.push(key + ': ' + val));
        return parts.join(' · ');
    }

    function prepareRelatedInStockSection(refItem, keepExpanded) {
        const secEl = document.getElementById('detRelatedStockSection');
        const btnLbl = document.getElementById('detRelatedStockBtnLabel');
        const panelEl = document.getElementById('detRelatedStockPanel');
        const listEl = document.getElementById('detRelatedStockList');
        if (!secEl || !btnLbl || !panelEl || !listEl) return;

        if (!refItem) {
            relatedStockExpanded = false;
            relatedStockRefItem = null;
            relatedStockRefSku = '';
            secEl.classList.add('hidden');
            panelEl.classList.add('hidden');
            listEl.innerHTML = '';
            return;
        }

        relatedStockRefItem = refItem;
        relatedStockRefSku = currentDetailItem ? String(currentDetailItem.s || '').trim().toUpperCase() : '';
        relatedStockExpanded = !!keepExpanded;

        const matches = getRelatedInStockItems(refItem);
        const typeLabel = getRelatedTypeDisplayLabel(refItem);
        secEl.classList.remove('hidden');

        btnLbl.textContent = 'Productos de entrega inmediata';

        if (relatedStockExpanded) {
            renderRelatedInStockList(matches, typeLabel);
            panelEl.classList.remove('hidden');
        } else {
            panelEl.classList.add('hidden');
            listEl.innerHTML = '';
        }
    }

    function renderRelatedInStockList(precomputedMatches, precomputedLabel) {
        const subEl = document.getElementById('detRelatedStockSubhead');
        const listEl = document.getElementById('detRelatedStockList');
        if (!listEl || !relatedStockRefItem) return;

        const matches = Array.isArray(precomputedMatches) ? precomputedMatches : getRelatedInStockItems(relatedStockRefItem);
        const typeLabel = precomputedLabel || getRelatedTypeDisplayLabel(relatedStockRefItem);

        if (subEl) {
            subEl.textContent = matches.length > 0
                ? ('Disponibles para entrega inmediata relacionados con ' + typeLabel + ' (' + matches.length + ')')
                : ('Sin otros productos de ' + typeLabel + ' con stock físico para entrega inmediata');
        }

        if (!matches.length) {
            listEl.innerHTML =
                '<div class="rounded-xl border px-3.5 py-4 text-center text-[11px] font-semibold" style="border-color:#E8E4DE; background:#FFFFFF; color:#252C32;">' +
                    'Por el momento no hay otros artículos de este mismo tipo con existencia física en bodega o piso.' +
                '</div>';
            return;
        }

        listEl.innerHTML = matches.map(entry => {
            const it = entry.it;
            const skuKey = String(it.s || '').trim().toUpperCase();
            const titleTxt = stripDimensionsFromProductText(it.n) || cleanStr(it._groupTitle) || it.s;
            const locSummary = buildDeliveryStockSummary(it);
            const dispTxt = entry.stock === 1 ? '1 disponible para entrega' : (entry.stock + ' disponibles para entrega');
            return '<div class="inv-row" data-rel-sku="' + escapeHtml(skuKey) + '" style="background:#FFFFFF;">' +
                buildThumbHtml(it, { compact: true }) +
                '<div class="min-w-0 flex-1 pr-2">' +
                    '<div class="inv-det-uniform-text font-bold uppercase leading-snug" style="color:#1A1816;">' +
                        formatTitleWithPriceHtml(titleTxt, it.pr) +
                    '</div>' +
                    '<div class="inv-det-uniform-text font-semibold tracking-wider mt-0.5 flex flex-wrap items-center gap-1.5">' +
                        '<span style="color:#9E7B4F;">' + escapeHtml(it.s) + '</span>' +
                        '<span class="px-1.5 py-0.5 rounded-full inv-det-uniform-text font-extrabold sem-green">' + escapeHtml(dispTxt) + '</span>' +
                        (locSummary ? ('<span class="inv-det-uniform-text font-bold opacity-75" style="color:#1A1816;">(' + escapeHtml(locSummary) + ')</span>') : '') +
                    '</div>' +
                '</div>' +
                buildCardCartControlHtml(skuKey) +
            '</div>';
        }).join('');

        listEl.querySelectorAll('.inv-row[data-rel-sku]').forEach(rowEl => {
            const sku = rowEl.getAttribute('data-rel-sku');
            rowEl.onclick = function () {
                openProductDetail(sku, false);
                const modalCard = document.querySelector('#productDetailModal > div');
                if (modalCard) modalCard.scrollTo({ top: 0, behavior: 'smooth' });
            };
            const ctrlWrap = rowEl.querySelector('[data-sku-ctrl]');
            bindCardCartControlEvents(ctrlWrap, sku);
        });
        if (window.CreataGuard && typeof window.CreataGuard.protectImages === 'function') {
            window.CreataGuard.protectImages(listEl);
        }
    }

    window.toggleRelatedInStockProducts = function () {
        if (!relatedStockRefItem) return;
        relatedStockExpanded = !relatedStockExpanded;
        prepareRelatedInStockSection(relatedStockRefItem, relatedStockExpanded);
        if (relatedStockExpanded) {
            notifyInvBackStatePush('detail_related_stock');
            const secEl = document.getElementById('detRelatedStockSection');
            if (secEl && secEl.scrollIntoView) {
                setTimeout(() => secEl.scrollIntoView({ behavior: 'smooth', block: 'start' }), 40);
            }
        }
    };
