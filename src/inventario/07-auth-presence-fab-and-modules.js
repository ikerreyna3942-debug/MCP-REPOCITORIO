    // ------------------------------------------------------------------------
    // USUARIOS POR UBICACIÓN, CONTRASEÑA TEMPORAL Y PLANTILLA S MUEBLERÍA
    // ------------------------------------------------------------------------
    const AUTH_SESSION_KEY = 'creata_inv_advisor_session_v1';
    const PENDING_KEYS_STORAGE = 'creata_inv_updated_keys_v1';
    const QUOTE_META_STORAGE = 'creata_inv_quote_draft_meta_v1';
    const QUOTE_META_STORAGE_ALT = 'creata_inv_quote_meta_v1';

    const USER_BRANCH_TABS = [
        {
            tab: 'PLAYA',
            branchKey: 'PLAYA',
            label: 'Playa del Carmen',
            erpStore: 'CREATA LIVING PLAYA',
            orderPrefix: 'PL',
            quoteType: 'SUCURSAL',
            isProyecto: false,
            serieLabel: 'SERIE PL · PLAYA'
        },
        {
            tab: 'COLOCIO',
            branchKey: 'COLOSIO',
            label: 'Colosio',
            erpStore: 'CREATA LIVING COLOSIO',
            orderPrefix: 'DTC',
            quoteType: 'SUCURSAL',
            isProyecto: false,
            serieLabel: 'SERIE DTC · COLOSIO'
        },
        {
            tab: 'OUTLET COLOSIO',
            branchKey: 'OUTLET COLOSIO',
            label: 'Outlet Colosio',
            erpStore: 'OUTLET COLOSIO',
            orderPrefix: 'OUT',
            quoteType: 'SUCURSAL',
            isProyecto: false,
            serieLabel: 'SERIE OUT · OUTLET COLOSIO'
        },
        {
            tab: 'PTC',
            branchKey: 'PTC',
            label: 'Puerto Cancún (PTC)',
            erpStore: 'CREATA PUERTO CANCUN',
            orderPrefix: 'PTC',
            quoteType: 'SUCURSAL',
            isProyecto: false,
            serieLabel: 'SERIE PTC · PUERTO CANCÚN'
        },
        {
            tab: 'CASA CREATA',
            branchKey: 'CASA CREATA',
            label: 'Casa Creata',
            erpStore: 'CASA CREATA BONAMPAK',
            orderPrefix: 'CCB',
            quoteType: 'SUCURSAL',
            isProyecto: false,
            serieLabel: 'SERIE CCB · CASA CREATA'
        },
        {
            tab: 'PROYECTOS',
            branchKey: 'PROYECTOS',
            label: 'Proyectos',
            erpStore: 'PROYECTOS ANIPA INTERIOR',
            orderPrefix: 'PRO',
            quoteType: 'PROYECTO',
            isProyecto: true,
            serieLabel: 'MODALIDAD PROYECTO · SERIE PRO'
        },
        {
            tab: 'CUENTAS ADMINISTRATIVAS',
            branchKey: 'ADMIN',
            label: 'Administración General',
            erpStore: 'CEDIS',
            orderPrefix: 'CED',
            quoteType: 'ADMINISTRATIVO',
            isProyecto: false,
            isAdmin: true,
            serieLabel: 'ADMINISTRADOR · TODAS LAS TIENDAS'
        },
        {
            tab: 'INVITADOS',
            branchKey: 'INVITADOS',
            label: 'Invitado (Solo Ver)',
            erpStore: 'SOLO LECTURA',
            orderPrefix: 'INV',
            quoteType: 'SOLO_VER',
            isProyecto: false,
            isGuest: true,
            serieLabel: 'SOLO VER · INVITADO (SIN COTIZAR NI DESCUENTOS)'
        }
    ];

    const MAX_GUEST_PLACES_PER_EMAIL = 2;
    const DEVICE_ID_STORAGE_KEY = 'creata_inv_device_id_v1';
    const DEVICE_ID_COOKIE_NAME = 'creata_inv_dev_id';
    const GUEST_DEVICES_LOCAL_STORAGE_KEY = 'creata_inv_guest_devices_v1';

    function getOrCreateClientDeviceId() {
        let devId = '';
        try {
            devId = cleanStr(localStorage.getItem(DEVICE_ID_STORAGE_KEY) || '');
        } catch (e) {}
        if (!devId && typeof document !== 'undefined' && document.cookie) {
            const m = document.cookie.match(new RegExp('(?:^|;\\s*)' + DEVICE_ID_COOKIE_NAME + '=([^;]+)'));
            if (m && m[1]) {
                try { devId = cleanStr(decodeURIComponent(m[1])); } catch (e) {}
            }
        }
        if (!devId || devId.length < 6) {
            const randPart = (typeof crypto !== 'undefined' && crypto.randomUUID)
                ? crypto.randomUUID().replace(/-/g, '').slice(0, 14)
                : (Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 8));
            devId = 'dev_' + Date.now().toString(36) + '_' + randPart;
        }
        try {
            localStorage.setItem(DEVICE_ID_STORAGE_KEY, devId);
        } catch (e) {}
        try {
            if (typeof document !== 'undefined') {
                document.cookie = DEVICE_ID_COOKIE_NAME + '=' + encodeURIComponent(devId) + '; path=/; max-age=' + (400 * 24 * 60 * 60) + '; SameSite=Lax';
            }
        } catch (e) {}
        return devId;
    }

    function getClientDeviceLabel() {
        try {
            const ua = String((typeof navigator !== 'undefined' && navigator.userAgent) || '');
            let os = 'Dispositivo';
            if (/iPhone/i.test(ua)) os = 'iPhone';
            else if (/iPad/i.test(ua)) os = 'iPad';
            else if (/Android/i.test(ua)) os = 'Android';
            else if (/Macintosh|Mac OS X/i.test(ua)) os = 'Mac';
            else if (/Windows/i.test(ua)) os = 'Windows PC';
            else if (/Linux/i.test(ua)) os = 'Linux';

            let browser = 'Web';
            if (/Edg\//i.test(ua)) browser = 'Edge';
            else if (/OPR\/|Opera/i.test(ua)) browser = 'Opera';
            else if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) browser = 'Chrome';
            else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) browser = 'Safari';
            else if (/Firefox\//i.test(ua)) browser = 'Firefox';

            return os + ' · ' + browser;
        } catch (e) {
            return 'Navegador Web';
        }
    }

    function parseGuestMaxDevicesCellClient(rawVal) {
        const s = cleanStr(rawVal);
        if (!s) return MAX_GUEST_PLACES_PER_EMAIL;
        const mSlash = s.match(/^\d+\s*\/\s*(\d+)$/);
        if (mSlash && mSlash[1]) {
            const denom = parseInt(mSlash[1], 10);
            if (denom >= 1 && denom <= 50) return denom;
        }
        const mNum = s.match(/(\d+)/);
        if (mNum && mNum[1]) {
            const n = parseInt(mNum[1], 10);
            if (n >= 1 && n <= 50) return n;
        }
        return MAX_GUEST_PLACES_PER_EMAIL;
    }

    function extractGuestDeviceColsFromRowClient(rowArr) {
        const r = Array.isArray(rowArr) ? rowArr : [];
        const colH = cleanStr(r[7]);
        const colI = cleanStr(r[8]);
        const colJ = cleanStr(r[9]);
        const isLegacy9Col = !colJ && (/\[(?:ID|DEV):/i.test(colI) || /^Lugar\s*\d+\s*:/i.test(colI) || /^\d+\s*\/\s*\d+$/.test(colH));
        if (isLegacy9Col) {
            return {
                maxPlaces: parseGuestMaxDevicesCellClient(colH),
                placesText: colH,
                devicesRaw: colI
            };
        }
        return {
            maxPlaces: parseGuestMaxDevicesCellClient(colH),
            placesText: colI,
            devicesRaw: colJ
        };
    }

    function parseGuestDevicesFromTextClient(rawText, maxPlacesOpt) {
        const s = cleanStr(rawText);
        if (!s) return [];
        const maxCap = Math.max(1, Math.min(50, Number(maxPlacesOpt) || 50));
        const list = [];
        const seen = {};
        const parts = s.split(/\s*\|\s*/);
        for (let i = 0; i < parts.length; i++) {
            const seg = cleanStr(parts[i]);
            if (!seg) continue;
            const mId = seg.match(/\[(?:ID|DEV):\s*([^\]]+)\]/i);
            if (!mId || !mId[1]) continue;
            const id = cleanStr(mId[1]).slice(0, 80);
            if (!id || seen[id]) continue;
            seen[id] = true;
            const labelPart = cleanStr(
                seg
                    .replace(/^(?:Lugar\s*\d+\s*:\s*|\d+\)\s*)/i, '')
                    .replace(/\[(?:ID|DEV):\s*[^\]]+\]/gi, '')
                    .replace(/\([^)]*\)\s*$/, '')
            ) || 'Dispositivo';
            const mTime = seg.match(/\(([^)]+)\)\s*$/);
            list.push({
                id: id,
                label: labelPart,
                stamp: mTime ? cleanStr(mTime[1]) : ''
            });
            if (list.length >= maxCap) break;
        }
        return list;
    }

    function loadLocalGuestDeviceRegistry() {
        try {
            const parsed = JSON.parse(localStorage.getItem(GUEST_DEVICES_LOCAL_STORAGE_KEY) || '{}');
            return (parsed && typeof parsed === 'object') ? parsed : {};
        } catch (e) {
            return {};
        }
    }

    function saveLocalGuestDeviceRegistry(regObj) {
        try {
            localStorage.setItem(GUEST_DEVICES_LOCAL_STORAGE_KEY, JSON.stringify(regObj || {}));
        } catch (e) {}
    }

    function checkGuestDeviceLimitClient(guestRowUser, deviceId, deviceLabel) {
        const email = String((guestRowUser && guestRowUser.correo) || '').trim().toLowerCase();
        const devId = cleanStr(deviceId) || getOrCreateClientDeviceId();
        const devLbl = cleanStr(deviceLabel) || getClientDeviceLabel();
        const reg = loadLocalGuestDeviceRegistry();
        const maxAllowedPlaces = Math.max(1, Math.min(50, Number(guestRowUser && guestRowUser.guestMaxPlaces) || MAX_GUEST_PLACES_PER_EMAIL));

        const sheetDevices = Array.isArray(guestRowUser && guestRowUser.guestDevices)
            ? guestRowUser.guestDevices
            : parseGuestDevicesFromTextClient(guestRowUser && guestRowUser.guestDevicesRaw, maxAllowedPlaces);
        const placesTxt = cleanStr(guestRowUser && guestRowUser.guestPlacesText);
        const sheetExplicitZero = /^0\s*\/\s*\d+$/.test(placesTxt) && sheetDevices.length === 0;
        if (sheetExplicitZero && reg[email]) {
            delete reg[email];
            saveLocalGuestDeviceRegistry(reg);
        }

        const merged = [];
        const seen = {};
        const pushDev = function (d) {
            if (!d || !d.id || seen[d.id] || merged.length >= maxAllowedPlaces) return;
            seen[d.id] = true;
            merged.push({
                id: String(d.id),
                label: cleanStr(d.label) || 'Dispositivo',
                stamp: cleanStr(d.stamp || d.lastSeen) || ''
            });
        };

        sheetDevices.forEach(pushDev);
        if (Array.isArray(reg[email])) {
            reg[email].forEach(pushDev);
        }

        let slotIdx = -1;
        for (let i = 0; i < merged.length; i++) {
            if (merged[i].id === devId) {
                slotIdx = i;
                break;
            }
        }

        // Si en la hoja Lugares Activos dice "N/N" sin IDs explícitos y este dispositivo no estaba registrado localmente
        const placesUsedMatch = placesTxt.match(/^(\d+)\s*\/\s*(\d+)$/);
        const placesUsedNum = placesUsedMatch ? (parseInt(placesUsedMatch[1], 10) || 0) : 0;
        if (slotIdx === -1 && (merged.length >= maxAllowedPlaces || (sheetDevices.length === 0 && placesUsedNum >= maxAllowedPlaces))) {
            const usedLabels = merged.map((d, idx) => 'Lugar ' + (idx + 1) + ': ' + (d.label || 'Dispositivo')).join(' · ');
            const pluralText = maxAllowedPlaces === 1 ? '1 dispositivo permitido' : (maxAllowedPlaces + ' dispositivos permitidos');
            return {
                ok: false,
                limitReached: true,
                activePlaces: Math.max(merged.length, maxAllowedPlaces),
                maxPlaces: maxAllowedPlaces,
                error: 'Este correo de Invitado (' + email + ') ya alcanzó su límite configurado de ' + pluralText +
                    (usedLabels ? (' (' + usedLabels + ')') : '') + '. Para abrir en otro equipo, aumenta la columna "Dispositivos Permitidos" (Columna H) o borra la celda de dispositivos en la hoja INVITADOS.'
            };
        }

        const nowStamp = new Date().toLocaleString('es-MX');
        if (slotIdx >= 0) {
            merged[slotIdx].label = devLbl || merged[slotIdx].label;
            merged[slotIdx].stamp = nowStamp;
        } else {
            merged.push({
                id: devId,
                label: devLbl,
                stamp: nowStamp
            });
            slotIdx = merged.length - 1;
        }

        reg[email] = merged;
        saveLocalGuestDeviceRegistry(reg);

        // Sincronizar con Apps Script en segundo plano para dejar constancia en las Columnas H, I y J de INVITADOS
        callInvWebAppPost('inv_guest_heartbeat', {
            authToken: (activeAdvisorSession && activeAdvisorSession.authToken) || '',
            email: email,
            deviceId: devId,
            deviceLabel: devLbl
        }, 9000).catch(() => {});

        return {
            ok: true,
            slotNumber: slotIdx + 1,
            activePlaces: merged.length,
            maxPlaces: maxAllowedPlaces,
            devices: merged
        };
    }

    function isGuestUserObject(u) {
        if (!u || typeof u !== 'object') return false;
        if (u.isAdmin || ADMIN_MASTER_EMAILS[String(u.correo || '').trim().toLowerCase()]) return false;
        if (u.isGuest || u.soloLectura) return true;
        const tabUp = String(u.sheetTab || u.branchKey || '').trim().toUpperCase();
        if (tabUp === 'INVITADOS' || tabUp === 'INVITADO') return true;
        const qtUp = String(u.quoteType || '').trim().toUpperCase();
        if (qtUp === 'SOLO_VER' || qtUp === 'SOLO LECTURA') return true;
        const pNorm = String(u.puesto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
        return /INVITAD|SOLO\s*VER|SOLO\s*LECTURA/.test(pNorm);
    }

    function isGuestSession(sessOpt) {
        const s = sessOpt !== undefined ? sessOpt : activeAdvisorSession;
        return isGuestUserObject(s);
    }

    const DEFAULT_ERP_STORES = [
        'CREATA PUERTO CANCUN',
        'CASA CREATA BONAMPAK',
        'CREATA LIVING COLOSIO',
        'CREATA LIVING PLAYA',
        'OUTLET COLOSIO',
        'PROYECTOS ANIPA INTERIOR',
        'CEDIS',
        'ADMINISTRACION'
    ];

    const ADMIN_MASTER_EMAILS = {
        'santiago.torres@grupoanipa.com': true,
        'kevin.reyna@grupoanipa.com': true
    };

    // Series oficiales de folios en S Mueblería según tienda o bodega (sin guion artificial)
    const ERP_STORE_FOLIO_SERIES = {
        'CREATA LIVING PLAYA': 'PL',
        'CREATA LIVING COLOSIO': 'DTC',
        'OUTLET COLOSIO': 'OUT',
        'CREATA PUERTO CANCUN': 'PTC',
        'CASA CREATA BONAMPAK': 'CCB',
        'PROYECTOS ANIPA INTERIOR': 'PRO',
        'CEDIS': 'CED',
        'ADMINISTRACION': 'ADM'
    };

    const liveMaxFolioNumByPrefix = {};
    const liveNextFolioByStore = {};

    function getStoreFolioPrefix(erpStore, fallbackPrefix) {
        const up = String(erpStore || '').trim().toUpperCase();
        if (ERP_STORE_FOLIO_SERIES[up]) return ERP_STORE_FOLIO_SERIES[up];
        const cfg = findBranchConfig('', up);
        if (cfg && cfg.orderPrefix) return cfg.orderPrefix;
        const fb = String(fallbackPrefix || '').trim().toUpperCase().replace(/[^A-Z]/g, '');
        return fb || 'PTC';
    }

    function registerObservedFolio(rawFolio, erpStoreHint) {
        const s = cleanStr(rawFolio).toUpperCase();
        if (!s) return false;
        // Ignorar consecutivos viejos artificiales con guion como PL-0001
        if (/^[A-Z]+-\d+$/.test(s)) return false;
        const m = s.match(/^([A-Z]{2,5})\s*(\d{2,8})$/);
        if (!m) return false;
        const pfx = m[1];
        const num = parseInt(m[2], 10);
        if (!num || num <= 0) return false;
        let updated = false;
        if (!liveMaxFolioNumByPrefix[pfx] || num > liveMaxFolioNumByPrefix[pfx]) {
            liveMaxFolioNumByPrefix[pfx] = num;
            updated = true;
        }
        const storeUp = String(erpStoreHint || '').trim().toUpperCase();
        if (storeUp && (!liveNextFolioByStore[storeUp] || num >= (parseInt((liveNextFolioByStore[storeUp].match(/\d+$/) || ['0'])[0], 10) || 0))) {
            liveNextFolioByStore[storeUp] = pfx + String(num + 1);
            updated = true;
        }
        return updated;
    }

    function applyServerFolioMap(mapObj) {
        if (!mapObj || typeof mapObj !== 'object') return;
        Object.keys(mapObj).forEach(stKey => {
            const val = cleanStr(mapObj[stKey]).toUpperCase();
            const up = String(stKey || '').trim().toUpperCase();
            if (!up || !val || /^[A-Z]+-\d+$/.test(val)) return;
            liveNextFolioByStore[up] = val;
            const m = val.match(/^([A-Z]{2,5})(\d{2,8})$/);
            if (m) {
                const pfx = m[1];
                const prevNum = Math.max(0, (parseInt(m[2], 10) || 1) - 1);
                if (prevNum > (liveMaxFolioNumByPrefix[pfx] || 0)) {
                    liveMaxFolioNumByPrefix[pfx] = prevNum;
                }
            }
        });
    }

    function getEstimatedStoreFolio(erpStore, fallbackPrefix) {
        const storeUp = String(erpStore || '').trim().toUpperCase();
        if (storeUp && liveNextFolioByStore[storeUp]) {
            return liveNextFolioByStore[storeUp];
        }
        const pfx = getStoreFolioPrefix(storeUp, fallbackPrefix);
        if (liveMaxFolioNumByPrefix[pfx] && liveMaxFolioNumByPrefix[pfx] > 0) {
            return pfx + String(liveMaxFolioNumByPrefix[pfx] + 1);
        }
        return 'Serie ' + pfx;
    }

    function isEmailOrRoleAdmin(u) {
        if (!u || typeof u !== 'object') return false;
        if (u.isAdmin) return true;
        const email = String(u.correo || '').trim().toLowerCase();
        if (ADMIN_MASTER_EMAILS[email]) return true;
        const bKey = String(u.branchKey || u.sheetTab || '').trim().toUpperCase();
        if (bKey === 'ADMIN' || bKey === 'CUENTAS ADMINISTRATIVAS') return true;
        const pNorm = String(u.puesto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
        return /ADMINISTRADOR/.test(pNorm);
    }

    function parseDiscountPctCell(rawVal) {
        if (rawVal === null || rawVal === undefined) return null;
        const s = String(rawVal).trim();
        if (!s) return null;
        // Evitar confundir nombres o etiquetas de asesor con descuento
        if (/[A-Za-z]{3,}/.test(s)) return null;
        const hasPctSign = s.indexOf('%') !== -1;
        const cleaned = s.replace(/[^0-9.,-]/g, '').replace(',', '.');
        if (!cleaned) return null;
        const n = Number(cleaned);
        if (isNaN(n) || !isFinite(n) || n < 0) return null;
        if (!hasPctSign && n > 0 && n <= 1) {
            return Math.min(100, Math.round(n * 10000) / 100);
        }
        return Math.min(100, Math.round(n * 100) / 100);
    }

    function findBranchConfig(tabOrKey, erpStoreHint) {
        const up = String(tabOrKey || '').trim().toUpperCase();
        const storeUp = String(erpStoreHint || '').trim().toUpperCase();
        for (let i = 0; i < USER_BRANCH_TABS.length; i++) {
            const cfg = USER_BRANCH_TABS[i];
            if (cfg.tab.toUpperCase() === up || cfg.branchKey.toUpperCase() === up) return cfg;
            if (up === 'COLOSIO' && cfg.tab === 'COLOCIO') return cfg;
            if ((up === 'INVITADO' || up === 'SOLO VER') && cfg.tab === 'INVITADOS') return cfg;
        }
        if (storeUp) {
            for (let j = 0; j < USER_BRANCH_TABS.length; j++) {
                if (USER_BRANCH_TABS[j].erpStore.toUpperCase() === storeUp) return USER_BRANCH_TABS[j];
            }
        }
        return null;
    }

    function isManagerSessionUser(uOrPuesto) {
        if (!uOrPuesto) return false;
        if (typeof uOrPuesto === 'object' && (isEmailOrRoleAdmin(uOrPuesto) || isGuestUserObject(uOrPuesto))) return false;
        const rawPuesto = typeof uOrPuesto === 'object' ? (uOrPuesto.puesto || '') : String(uOrPuesto || '');
        const pNorm = String(rawPuesto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
        if (/INVITAD|SOLO\s*VER|SOLO\s*LECTURA/.test(pNorm)) return false;
        return /GERENTE|\bSUB/.test(pNorm);
    }

    function normalizeQuoteErpStoreClient(rawStore, rawBranchTab) {
        const candidates = [rawStore, rawBranchTab];
        for (let c = 0; c < candidates.length; c++) {
            const s = String(candidates[c] || '')
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .trim()
                .toUpperCase();
            if (!s) continue;
            for (let i = 0; i < USER_BRANCH_TABS.length; i++) {
                const cfg = USER_BRANCH_TABS[i];
                const cfgStore = String(cfg.erpStore || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
                const cfgTab = String(cfg.tab || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
                const cfgKey = String(cfg.branchKey || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
                const cfgLbl = String(cfg.label || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
                if (!cfg.isAdmin && !cfg.isGuest && (cfgStore === s || cfgTab === s || cfgKey === s || cfgLbl === s)) {
                    return cfgStore;
                }
            }
            if (s === 'COLOSIO' || s === 'COLOCIO') return 'CREATA LIVING COLOSIO';
            if (s === 'PLAYA') return 'CREATA LIVING PLAYA';
            if (s === 'PTC' || s === 'PUERTO CANCUN') return 'CREATA PUERTO CANCUN';
            if (s === 'CASA CREATA') return 'CASA CREATA BONAMPAK';
            if (s === 'PROYECTOS') return 'PROYECTOS ANIPA INTERIOR';
            return s;
        }
        return '';
    }

    function enrichAdvisorLocation(u) {
        if (!u || typeof u !== 'object') return u;
        const cfg = findBranchConfig(u.sheetTab || u.branchKey, u.erpStore);
        const guestFlag = !!(cfg && cfg.isGuest) || isGuestUserObject(u);
        if (guestFlag) {
            const customMax = Math.max(1, Math.min(50, Number(u.guestMaxPlaces) || MAX_GUEST_PLACES_PER_EMAIL));
            return Object.assign({}, u, {
                sheetTab: u.sheetTab || 'INVITADOS',
                isAdmin: false,
                isManager: false,
                isGuest: true,
                soloLectura: true,
                maxDiscountPct: 0,
                branchKey: 'INVITADOS',
                branchLabel: u.branchLabel || 'Invitado (Solo Ver)',
                erpStore: 'SOLO LECTURA',
                orderPrefix: 'INV',
                quoteType: 'SOLO_VER',
                isProyecto: false,
                mustChangeKey: !!u.mustChangeKey,
                serieLabel: 'SOLO VER · INVITADO (SIN COTIZAR NI DESCUENTOS)',
                guestSlotNum: Math.max(1, Math.min(customMax, Number(u.guestSlotNum) || 1)),
                guestActivePlaces: Math.max(1, Math.min(customMax, Number(u.guestActivePlaces) || 1)),
                guestMaxPlaces: customMax
            });
        }
        const adminFlag = isEmailOrRoleAdmin(u) || !!(cfg && cfg.isAdmin);
        const managerFlag = !adminFlag && (!!u.isManager || isManagerSessionUser(u));
        const resolvedStore = cleanStr(u.erpAdvisorBranch && adminFlag ? u.erpAdvisorBranch : '') ||
            cleanStr(u.erpStore) ||
            (cfg ? cfg.erpStore : '') ||
            'CREATA PUERTO CANCUN';
        const isProy = !adminFlag && (cfg ? !!cfg.isProyecto : (!!u.isProyecto || String(u.branchKey || u.sheetTab || '').toUpperCase() === 'PROYECTOS'));
        const prefix = getStoreFolioPrefix(resolvedStore, u.orderPrefix || (cfg ? cfg.orderPrefix : (isProy ? 'PRO' : 'PTC')));
        const parsedDisc = parseDiscountPctCell(u.maxDiscountPct);
        const enrichedObj = Object.assign({}, u, {
            isAdmin: adminFlag,
            isManager: managerFlag,
            isGuest: false,
            soloLectura: false,
            maxDiscountPct: parsedDisc !== null ? parsedDisc : (u.maxDiscountPct !== undefined ? u.maxDiscountPct : null),
            branchKey: adminFlag ? 'ADMIN' : (u.branchKey || (cfg ? cfg.branchKey : '')),
            branchLabel: u.branchLabel || (cfg ? cfg.label : (u.sheetTab || '')),
            erpStore: resolvedStore,
            orderPrefix: prefix,
            quoteType: adminFlag ? 'ADMINISTRATIVO' : (u.quoteType || (cfg ? cfg.quoteType : (isProy ? 'PROYECTO' : 'SUCURSAL'))),
            isProyecto: isProy,
            serieLabel: u.serieLabel || (cfg ? cfg.serieLabel : '')
        });
        if (Array.isArray(u.branchAdvisorEmails)) {
            enrichedObj.branchAdvisorEmails = u.branchAdvisorEmails
                .map(em => String(em || '').trim().toLowerCase())
                .filter(Boolean);
        }
        return enrichedObj;
    }

    const FIXED_QUOTE_CLIENT_MODE = 'PROSPECTO PROVISIONAL (SOLO NOMBRE - MODIFICABLE AL CERRAR)';
    const FIXED_QUOTE_CATEGORY_LABEL = 'COTIZACIONES [ID: 2]';

    let erpStoresCatalog = DEFAULT_ERP_STORES.slice();
    let erpAdvisorsCatalog = [];
    let activeAdvisorSession = loadAdvisorSession();
    let pendingAuthContext = null; // { email, inputKey, locations, switchingFromActive }
    let quoteDraftMeta = loadQuoteDraftMeta();
    let quoteSubmitInFlight = false;
    let currentNextOrderCode = '';
    let myRecentQuotesList = [];
    let newlyGeneratedQuoteHighlightKey = '';
    let lastSubmittedQuoteMeta = null;
    let pendingQuoteRetrySendToErp = null;
    let pendingPdfDownloadRetryOpts = null;
    let erpPdfDownloadInFlight = false;

    function loadAdvisorSession() {
        try {
            const raw = JSON.parse(localStorage.getItem(AUTH_SESSION_KEY) || 'null');
            if (raw && typeof raw === 'object' && raw.correo && (raw.branchLabel || raw.sheetTab)) {
                const enriched = enrichAdvisorLocation(raw);
                if (Array.isArray(enriched.allLocations)) {
                    enriched.allLocations = enriched.allLocations.map(enrichAdvisorLocation);
                }
                return enriched;
            }
        } catch (e) {}
        return null;
    }

    function saveAdvisorSession(sess) {
        activeAdvisorSession = sess ? enrichAdvisorLocation(sess) : null;
        try {
            if (activeAdvisorSession) localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(activeAdvisorSession));
            else localStorage.removeItem(AUTH_SESSION_KEY);
        } catch (e) {}
    }

    function loadUpdatedKeysMap() {
        try {
            const obj = JSON.parse(localStorage.getItem(PENDING_KEYS_STORAGE) || '{}');
            return (obj && typeof obj === 'object') ? obj : {};
        } catch (e) {
            return {};
        }
    }

    function saveUpdatedKeysMap(mapObj) {
        try {
            if (!mapObj || !Object.keys(mapObj).length) {
                localStorage.removeItem(PENDING_KEYS_STORAGE);
            } else {
                localStorage.setItem(PENDING_KEYS_STORAGE, JSON.stringify(mapObj));
            }
        } catch (e) {}
    }

    function purgeLegacySyncedPendingKeys() {
        try {
            const raw = localStorage.getItem(PENDING_KEYS_STORAGE);
            if (!raw) return;
            const mapObj = JSON.parse(raw);
            if (!mapObj || typeof mapObj !== 'object' || Array.isArray(mapObj)) {
                localStorage.removeItem(PENDING_KEYS_STORAGE);
                return;
            }
            let changed = false;
            const keys = Object.keys(mapObj);
            for (let i = 0; i < keys.length; i++) {
                const em = keys[i];
                const entry = mapObj[em];
                if (!entry || typeof entry !== 'object' || entry.synced === true) {
                    delete mapObj[em];
                    changed = true;
                }
            }
            if (changed) {
                if (Object.keys(mapObj).length) {
                    localStorage.setItem(PENDING_KEYS_STORAGE, JSON.stringify(mapObj));
                } else {
                    localStorage.removeItem(PENDING_KEYS_STORAGE);
                }
            }
        } catch (e) {
            try { localStorage.removeItem(PENDING_KEYS_STORAGE); } catch (e2) {}
        }
    }

    function getDefaultDeliveryIsoDate() {
        const d = new Date();
        d.setDate(d.getDate() + 30);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return yyyy + '-' + mm + '-' + dd;
    }

    function isoDateToDMY(isoStr) {
        const s = cleanStr(isoStr);
        const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (m) return m[3] + '/' + m[2] + '/' + m[1];
        return s;
    }

    function createBlankQuoteMeta() {
        return {
            erpStore: '',
            erpAdvisorLabel: '',
            erpAdvisorId: '',
            clientMode: FIXED_QUOTE_CLIENT_MODE,
            categoryLabel: FIXED_QUOTE_CATEGORY_LABEL,
            clientName: '',
            clientPhone: '',
            clientEmail: '',
            erpClientId: 0,
            erpLeadId: 0,
            erpNoCliente: '',
            erpClientAddress: '',
            deliveryDateIso: getDefaultDeliveryIsoDate(),
            notes: '',
            extraDiscount: 0
        };
    }

    function loadQuoteDraftMeta() {
        const fallback = createBlankQuoteMeta();
        try {
            const rawSaved = localStorage.getItem(QUOTE_META_STORAGE) || localStorage.getItem(QUOTE_META_STORAGE_ALT) || 'null';
            const saved = JSON.parse(rawSaved);
            if (saved && typeof saved === 'object') {
                return Object.assign(fallback, saved, {
                    clientMode: FIXED_QUOTE_CLIENT_MODE,
                    categoryLabel: FIXED_QUOTE_CATEGORY_LABEL,
                    deliveryDateIso: saved.deliveryDateIso || getDefaultDeliveryIsoDate()
                });
            }
        } catch (e) {}
        return fallback;
    }

    window.saveQuoteDraftMeta = function () {
        if (typeof isActiveQuoteCompleted === 'function' && isActiveQuoteCompleted()) return;
        const modeEl = document.getElementById('quoteClientModeSelect');
        const catEl = document.getElementById('quoteCategorySelect');
        const nameEl = document.getElementById('quoteClientNameInput');
        const phoneEl = document.getElementById('quoteClientPhoneInput');
        const emailEl = document.getElementById('quoteClientEmailInput');
        const dateEl = document.getElementById('quoteDeliveryDateInput');
        const notesEl = document.getElementById('quoteNotesInput');
        const extraEl = document.getElementById('quoteExtraDiscountInput');
        const adminStoreEl = document.getElementById('quoteAdminStoreSelect');
        const adminAdvEl = document.getElementById('quoteAdminAdvisorSelect');

        if (activeAdvisorSession) {
            if (isEffectiveAdminSession()) {
                if (adminStoreEl && adminStoreEl.value) {
                    quoteDraftMeta.erpStore = adminStoreEl.value;
                } else if (!quoteDraftMeta.erpStore) {
                    quoteDraftMeta.erpStore = activeAdvisorSession.erpStore || 'CEDIS';
                }
                if (adminAdvEl && adminAdvEl.value) {
                    const selOpt = adminAdvEl.options[adminAdvEl.selectedIndex];
                    quoteDraftMeta.erpAdvisorId = adminAdvEl.value;
                    quoteDraftMeta.erpAdvisorLabel = selOpt ? (selOpt.getAttribute('data-label') || selOpt.textContent || '') : '';
                } else if (!quoteDraftMeta.erpAdvisorId) {
                    quoteDraftMeta.erpAdvisorId = activeAdvisorSession.erpAdvisorId || '';
                    quoteDraftMeta.erpAdvisorLabel = activeAdvisorSession.erpAdvisorLabel || '';
                }
            } else {
                // Para asesores, gerentes y vista previa de Asesor de Kevin queda en la tienda activa
                quoteDraftMeta.erpStore = isKevinAdvisorPreviewActive()
                    ? getKevinAdvisorPreviewStore()
                    : (activeAdvisorSession.erpStore || '');
                quoteDraftMeta.erpAdvisorLabel = activeAdvisorSession.erpAdvisorLabel || '';
                quoteDraftMeta.erpAdvisorId = activeAdvisorSession.erpAdvisorId || '';
            }
        }
        if (modeEl) modeEl.value = FIXED_QUOTE_CLIENT_MODE;
        if (catEl) catEl.value = FIXED_QUOTE_CATEGORY_LABEL;
        quoteDraftMeta.clientMode = FIXED_QUOTE_CLIENT_MODE;
        quoteDraftMeta.categoryLabel = FIXED_QUOTE_CATEGORY_LABEL;
        if (nameEl) quoteDraftMeta.clientName = nameEl.value;
        if (phoneEl) quoteDraftMeta.clientPhone = phoneEl.value;
        if (emailEl) quoteDraftMeta.clientEmail = emailEl.value;
        if (dateEl && dateEl.value) quoteDraftMeta.deliveryDateIso = dateEl.value;
        if (notesEl) quoteDraftMeta.notes = notesEl.value;
        if (extraEl) quoteDraftMeta.extraDiscount = Math.max(0, Number(extraEl.value) || 0);

        try {
            const jsonMeta = JSON.stringify(quoteDraftMeta);
            localStorage.setItem(QUOTE_META_STORAGE, jsonMeta);
            localStorage.setItem(QUOTE_META_STORAGE_ALT, jsonMeta);
        } catch (e) {}
        if (typeof syncActiveQuoteDraftStorage === 'function') {
            syncActiveQuoteDraftStorage();
        }
    };

    function cleanKeyCellValue(val) {
        if (val === null || val === undefined) return '';
        if (typeof val === 'number') {
            return Number.isInteger(val) ? String(val) : String(Math.trunc(val));
        }
        let s = String(val).trim();
        if (/^\d+\.0+$/.test(s)) s = s.replace(/\.0+$/, '');
        return s;
    }

    function keysMatchNormalized(a, b) {
        const s1 = String(a || '').trim();
        const s2 = String(b || '').trim();
        if (!s1 || !s2) return false;
        if (s1 === s2) return true;
        const c1 = s1.replace(/\s+/g, '');
        const c2 = s2.replace(/\s+/g, '');
        return !!c1 && c1 === c2;
    }

    function normAdvisorTokens(txt) {
        const clean = String(txt || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toUpperCase()
            .replace(/\bLUPITA\b/g, 'GUADALUPE')
            .replace(/\bDADVID\b/g, 'DAVID')
            .replace(/\bJOHANNA\b/g, 'JOHANA')
            .replace(/\bRODRIGUEZ\b/g, 'RODRIGEZ');
        const words = clean.match(/[A-Z]+/g) || [];
        const stop = { DE: 1, LA: 1, DEL: 1, LOS: 1, LAS: 1, Y: 1, PROYECTOS: 1, OUTLET: 1, ADMON: 1 };
        return words.filter(w => w.length >= 2 && !stop[w]);
    }

    function matchBestErpAdvisorClient(userName, targetErpStore, advisorsList) {
        const uToks = normAdvisorTokens(userName);
        if (!uToks.length || !Array.isArray(advisorsList) || !advisorsList.length) return null;
        const uSet = new Set(uToks);
        let best = null;
        let bestScore = -1;
        for (let i = 0; i < advisorsList.length; i++) {
            const a = advisorsList[i];
            const aToks = a.tokens || normAdvisorTokens((a.label || '').split('|')[0]);
            let overlap = 0;
            for (let j = 0; j < aToks.length; j++) {
                if (uSet.has(aToks[j])) overlap++;
            }
            if (overlap <= 0) continue;
            const sameStore = String(a.branch || '').toUpperCase() === String(targetErpStore || '').toUpperCase() ? 1 : 0;
            const ratio = overlap / Math.max(1, Math.min(uToks.length, aToks.length));
            const score = (sameStore * 100) + (overlap * 10) + ratio;
            if (score > bestScore) {
                bestScore = score;
                best = a;
            }
        }
        return best;
    }

    function extractErpIdFromLabel(label) {
        const m = String(label || '').match(/\[ID:\s*(\d+)\]/i) || String(label || '').match(/\bID[:\s#]*(\d{3,7})\b/i);
        return m ? m[1] : '';
    }

    const INV_OFFLINE_OUTBOX_KEY = 'creata_inv_offline_outbox_v1';
    const INV_ERP_CATALOG_CACHE_KEY = 'creata_inv_erp_cat_cache_v1';
    const INV_LPPT_CACHE_KEY = 'creata_inv_lppt_cache_v1';
    const INV_OFFLINE_QUEUEABLE_ACTIONS = {
        inv_log_event: 1,
        seg_action: 1
    };
    let invOfflineOutboxFlushInFlight = false;

    function enqueueInvOfflineOutbox(action, payloadObj) {
        if (!action || !INV_OFFLINE_QUEUEABLE_ACTIONS[action]) return;
        try {
            const raw = localStorage.getItem(INV_OFFLINE_OUTBOX_KEY);
            const list = raw ? JSON.parse(raw) : [];
            const arr = Array.isArray(list) ? list : [];
            arr.push({
                id: 'out_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
                ts: Date.now(),
                action: action,
                payload: Object.assign({}, payloadObj || {})
            });
            while (arr.length > 80) arr.shift();
            localStorage.setItem(INV_OFFLINE_OUTBOX_KEY, JSON.stringify(arr));
        } catch (e) {}
    }

    async function flushInvOfflineOutbox() {
        if (invOfflineOutboxFlushInFlight) return;
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
        let arr = [];
        try {
            const raw = localStorage.getItem(INV_OFFLINE_OUTBOX_KEY);
            arr = raw ? JSON.parse(raw) : [];
        } catch (e) { arr = []; }
        if (!Array.isArray(arr) || arr.length === 0) return;

        invOfflineOutboxFlushInFlight = true;
        try {
            const remaining = [];
            for (let i = 0; i < arr.length; i++) {
                const entry = arr[i];
                if (!entry || !entry.action) continue;
                const res = await callInvWebAppPost(entry.action, entry.payload || {}, 10000, true);
                if (res && res.unavailable) {
                    remaining.push(entry);
                    for (let j = i + 1; j < arr.length; j++) remaining.push(arr[j]);
                    break;
                }
            }
            try {
                if (remaining.length > 0) {
                    localStorage.setItem(INV_OFFLINE_OUTBOX_KEY, JSON.stringify(remaining));
                } else {
                    localStorage.removeItem(INV_OFFLINE_OUTBOX_KEY);
                }
            } catch (e) {}
        } finally {
            invOfflineOutboxFlushInFlight = false;
        }
    }

    async function callInvWebAppPost(action, payloadObj, timeoutMs, skipOfflineQueue) {
        // P0-02: usar siempre CANONICAL_WEBAPP_URL para evitar desvío de credenciales/escrituras vía ?webapp= o localStorage
        const targetUrl = CANONICAL_WEBAPP_URL;
        if (!targetUrl) {
            if (!skipOfflineQueue) enqueueInvOfflineOutbox(action, payloadObj);
            return { ok: false, unavailable: true };
        }

        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = controller ? setTimeout(() => controller.abort(), timeoutMs || 12000) : null;
        let res;
        try {
            const body = Object.assign({}, payloadObj || {}, { action: action });
            const resp = await fetch(targetUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(body),
                signal: controller ? controller.signal : undefined
            });
            if (!resp.ok) {
                res = { ok: false, unavailable: true, httpStatus: resp.status };
            } else {
                const json = await resp.json();
                if (json && !json.ok && /PIN de administrador|Acci[óo]n no reconocida/i.test(String(json.error || ''))) {
                    res = { ok: false, needsRedeploy: true, error: json.error };
                } else {
                    res = json || { ok: false, unavailable: true };
                }
            }
        } catch (err) {
            res = { ok: false, unavailable: true, error: err && err.message ? err.message : String(err) };
        } finally {
            if (timer) clearTimeout(timer);
        }

        if (res && res.unavailable && !skipOfflineQueue) {
            enqueueInvOfflineOutbox(action, payloadObj);
        }
        return res;
    }

    // ------------------------------------------------------------------------
    // PRESENCIA EN TIEMPO REAL (#16) + FAB ÚNICO (#9) + NAVEGACIÓN IN-APP (#7, #10)
    // ------------------------------------------------------------------------
    const INV_PRESENCE_DEVICE_KEY = 'creata_inv_presence_dev_v1';
    let lastPresenceHeartbeatMs = 0;
    let activeInAppModule = 'home'; // 'home' | 'seguimiento' | 'historial'
    let invFabIsOpen = false;
    let pendingPostAuthModuleIntent = '';

    function getInvPresenceDeviceId() {
        try {
            let id = localStorage.getItem(INV_PRESENCE_DEVICE_KEY);
            if (!id) {
                id = 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
                localStorage.setItem(INV_PRESENCE_DEVICE_KEY, id);
            }
            return id;
        } catch (e) {
            return 'dev_mem_' + Math.random().toString(36).slice(2, 10);
        }
    }

    function getActiveSessionDeviceId(sessOpt) {
        const s = sessOpt || activeAdvisorSession;
        if (typeof isGuestSession === 'function' && isGuestSession(s)) {
            return getOrCreateClientDeviceId();
        }
        return getInvPresenceDeviceId();
    }

    let lastPresenceVistaSent = '';
    function currentPresenceVista() {
        return (activeInAppModule && activeInAppModule !== 'home') ? activeInAppModule : 'inventario';
    }

    const INV_SESSION_STARTED_AT_KEY = 'creata_inv_session_started_ms_v1';
    function getInvSessionStartedMs() {
        try {
            let v = Number(localStorage.getItem(INV_SESSION_STARTED_AT_KEY) || 0);
            if (!v || !isFinite(v)) {
                v = Date.now();
                localStorage.setItem(INV_SESSION_STARTED_AT_KEY, String(v));
            }
            return v;
        } catch (e) {
            return Date.now();
        }
    }

    function recoverStoredInvAuthToken(sessObj) {
        const s = sessObj || activeAdvisorSession;
        if (!s) return '';
        if (cleanStr(s.authToken)) return cleanStr(s.authToken);
        const targetEmail = cleanStr(s.correo).toLowerCase().replace(/,/g, '.');
        if (!targetEmail) return '';
        const candidateKeys = [
            AUTH_SESSION_KEY,
            'creata_private_kevin_panel_v1',
            'creata_private_kevin_fotos_v1',
            'creata_private_kevin_hist_v1'
        ];
        for (let i = 0; i < candidateKeys.length; i++) {
            try {
                const raw = localStorage.getItem(candidateKeys[i]);
                const obj = raw ? JSON.parse(raw) : null;
                const objMail = cleanStr(obj && obj.correo).toLowerCase().replace(/,/g, '.');
                if (obj && objMail === targetEmail && cleanStr(obj.authToken)) {
                    s.authToken = cleanStr(obj.authToken);
                    return s.authToken;
                }
            } catch (e) {}
        }
        return '';
    }

    function readStoredInvAccessKeyFallback(sessObj) {
        const s = sessObj || activeAdvisorSession;
        if (!s) return '';
        if (cleanStr(s.accessKey)) return cleanStr(s.accessKey);
        const targetEmail = cleanStr(s.correo).toLowerCase().replace(/,/g, '.');
        if (!targetEmail) return '';
        const candidateKeys = [
            AUTH_SESSION_KEY,
            'creata_private_kevin_panel_v1',
            'creata_private_kevin_fotos_v1',
            'creata_private_kevin_hist_v1'
        ];
        for (let i = 0; i < candidateKeys.length; i++) {
            try {
                const raw = localStorage.getItem(candidateKeys[i]);
                const obj = raw ? JSON.parse(raw) : null;
                const objMail = cleanStr(obj && obj.correo).toLowerCase().replace(/,/g, '.');
                if (obj && objMail === targetEmail && cleanStr(obj.accessKey)) {
                    return cleanStr(obj.accessKey);
                }
            } catch (e) {}
        }
        try {
            const pendingMap = loadUpdatedKeysMap();
            if (pendingMap && pendingMap[targetEmail] && cleanStr(pendingMap[targetEmail].newKey)) {
                return cleanStr(pendingMap[targetEmail].newKey);
            }
        } catch (e) {}
        if (targetEmail === 'kevin.reyna@grupoanipa.com' && typeof readKevinFotosAccessKeyFallback === 'function') {
            return readKevinFotosAccessKeyFallback();
        }
        return '';
    }

    function persistRenewedInvAuthToken(sessObj, newToken) {
        const tok = cleanStr(newToken);
        if (!tok) return;
        const s = sessObj || activeAdvisorSession;
        const targetEmail = cleanStr(s && s.correo).toLowerCase().replace(/,/g, '.');
        if (s) s.authToken = tok;
        if (activeAdvisorSession && (!targetEmail || cleanStr(activeAdvisorSession.correo).toLowerCase().replace(/,/g, '.') === targetEmail)) {
            activeAdvisorSession.authToken = tok;
            saveAdvisorSession(activeAdvisorSession);
        }
        if (!targetEmail) return;
        const syncKeys = [
            'creata_private_kevin_panel_v1',
            'creata_private_kevin_fotos_v1',
            'creata_private_kevin_hist_v1'
        ];
        for (let i = 0; i < syncKeys.length; i++) {
            try {
                const raw = localStorage.getItem(syncKeys[i]);
                if (!raw) continue;
                const obj = JSON.parse(raw);
                const objMail = cleanStr(obj && obj.correo).toLowerCase().replace(/,/g, '.');
                if (obj && objMail === targetEmail) {
                    obj.authToken = tok;
                    localStorage.setItem(syncKeys[i], JSON.stringify(obj));
                }
            } catch (e) {}
        }
    }

    let _invTokenRenewPromise = null;
    async function renewInvAuthTokenIfPossible(sessObj, forceMint) {
        const s = sessObj || activeAdvisorSession;
        if (!s || !cleanStr(s.correo)) return '';
        const currentTok = cleanStr(s.authToken);
        if (!forceMint) {
            const recovered = recoverStoredInvAuthToken(s);
            if (recovered) {
                persistRenewedInvAuthToken(s, recovered);
                return recovered;
            }
        } else {
            const targetEmail = cleanStr(s.correo).toLowerCase().replace(/,/g, '.');
            const candidateKeys = [
                AUTH_SESSION_KEY,
                'creata_private_kevin_panel_v1',
                'creata_private_kevin_fotos_v1',
                'creata_private_kevin_hist_v1'
            ];
            for (let i = 0; i < candidateKeys.length; i++) {
                try {
                    const raw = localStorage.getItem(candidateKeys[i]);
                    const obj = raw ? JSON.parse(raw) : null;
                    const objMail = cleanStr(obj && obj.correo).toLowerCase().replace(/,/g, '.');
                    const storedTok = obj && objMail === targetEmail ? cleanStr(obj.authToken) : '';
                    if (storedTok && storedTok !== currentTok) {
                        persistRenewedInvAuthToken(s, storedTok);
                        return storedTok;
                    }
                } catch (e) {}
            }
        }
        const fallbackKey = readStoredInvAccessKeyFallback(s);
        if (!fallbackKey) return '';
        if (_invTokenRenewPromise) return _invTokenRenewPromise;
        _invTokenRenewPromise = (async function () {
            try {
                const loginRes = await callInvWebAppPost('inv_login', {
                    email: cleanStr(s.correo),
                    accessKey: fallbackKey,
                    sheetTab: cleanStr(s.sheetTab)
                }, 12000, true);
                const freshTok = cleanStr(loginRes && (loginRes.authToken || (loginRes.user && loginRes.user.authToken)));
                if (freshTok) {
                    persistRenewedInvAuthToken(s, freshTok);
                    return freshTok;
                }
                return '';
            } catch (e) {
                return '';
            } finally {
                _invTokenRenewPromise = null;
            }
        })();
        return _invTokenRenewPromise;
    }

    async function callInvWebAppGetPresence(payloadObj, timeoutMs) {
        // P1-20: nunca enviar authToken ni accessKey por URL GET; usar siempre POST
        return callInvWebAppPost('inv_presence_list', payloadObj || {}, timeoutMs || 15000, true);
    }

    function sendInvPresenceHeartbeat(sessObj, forceNow, _isRetry) {
        const s = sessObj || activeAdvisorSession;
        if (!s || s.mustChangeKey || !s.correo) return;
        if (window.CreataGuard && (window.CreataGuard.blocked || window.CreataGuard.isBlocked)) return;
        const now = Date.now();
        const vista = currentPresenceVista();
        const vistaChanged = vista !== lastPresenceVistaSent;
        if (!forceNow && !vistaChanged && (now - lastPresenceHeartbeatMs) < 45000) return;
        if (!forceNow && typeof document !== 'undefined' && document.visibilityState !== 'visible') return;

        const dispatchHeartbeat = async function () {
            let token = recoverStoredInvAuthToken(s);
            const fallbackKey = readStoredInvAccessKeyFallback(s);
            if (!token && fallbackKey) {
                token = await renewInvAuthTokenIfPossible(s, false);
            }
            if (!token && !fallbackKey) return;

            lastPresenceHeartbeatMs = Date.now();
            lastPresenceVistaSent = vista;
            const roleInfo = (typeof getAdvisorRoleInfo === 'function') ? getAdvisorRoleInfo(s) : {};
            const devLabel = (typeof getClientDeviceLabel === 'function') ? getClientDeviceLabel() : 'Navegador';
            const hbPayload = {
                authToken: token || '',
                advisorEmail: s.correo || '',
                correo: s.correo || '',
                nombre: s.nombre || s.correo || '',
                puesto: s.puesto || '',
                sheetTab: s.sheetTab || '',
                branchLabel: s.branchLabel || s.sheetTab || '',
                erpStore: s.erpStore || '',
                role: s.isGuest ? 'INVITADO' : (roleInfo.roleLabel || (isEffectiveAdminSession() ? 'ADMIN' : (s.isManager ? 'GERENTE' : 'ASESOR'))),
                isGuest: !!s.isGuest,
                isAdmin: isEffectiveAdminSession(),
                isManager: !!s.isManager,
                deviceId: getActiveSessionDeviceId(s),
                deviceLabel: devLabel,
                sessionStartedMs: getInvSessionStartedMs(),
                vista: vista,
                view: vista,
                page: 'inventario'
            };
            if (!token && fallbackKey) hbPayload.accessKey = fallbackKey;

            const hbRes = await callInvWebAppPost('inv_presence_heartbeat', hbPayload, 8000, true);
            if (hbRes && hbRes.renewedAuthToken) {
                persistRenewedInvAuthToken(s, hbRes.renewedAuthToken);
            }
            if (hbRes && hbRes.ok && activeAdvisorSession && !isGuestSession()) {
                let permsChanged = false;
                if (hbRes.adminPermissions && typeof hbRes.adminPermissions === 'object') {
                    const prevJson = JSON.stringify(activeAdvisorSession.adminPermissions || null);
                    const nextJson = JSON.stringify(hbRes.adminPermissions);
                    if (prevJson !== nextJson) {
                        activeAdvisorSession.adminPermissions = hbRes.adminPermissions;
                        permsChanged = true;
                    }
                }
                if (hbRes.userPermissions && typeof hbRes.userPermissions === 'object') {
                    const prevUserJson = JSON.stringify(activeAdvisorSession.userPermissions || null);
                    const nextUserJson = JSON.stringify(hbRes.userPermissions);
                    if (prevUserJson !== nextUserJson) {
                        activeAdvisorSession.userPermissions = hbRes.userPermissions;
                        permsChanged = true;
                    }
                }
                if (permsChanged) {
                    saveAdvisorSession(activeAdvisorSession);
                    renderAdvisorHeaderBar();
                    if (typeof renderSettingsRoleAndSections === 'function') renderSettingsRoleAndSections();
                }
            }
            if (hbRes && hbRes.sessionRevoked === true && typeof window.logoutAdvisorSession === 'function') {
                window.logoutAdvisorSession();
                return;
            }
            if (!_isRetry && hbRes && !hbRes.ok && !hbRes.unavailable && (hbRes.authRequired || !hbRes.error)) {
                const freshTok = await renewInvAuthTokenIfPossible(s, true);
                if (freshTok) {
                    lastPresenceHeartbeatMs = 0;
                    sendInvPresenceHeartbeat(s, true, true);
                }
            }
        };

        dispatchHeartbeat().catch(() => {});
    }

    function sendInvPresenceLogout(sessObj) {
        const s = sessObj;
        if (!s || !s.correo) return;
        callInvWebAppPost('inv_presence_logout', {
            authToken: s.authToken || '',
            correo: s.correo || '',
            sheetTab: s.sheetTab || '',
            deviceId: getActiveSessionDeviceId(s)
        }, 5000, true).catch(() => {});
    }

    window.closeFabMenu = function () {
        invFabIsOpen = false;
        const root = document.getElementById('invFabRoot');
        const menu = document.getElementById('invFabMenu');
        const toggle = document.getElementById('invFabToggleBtn');
        const backdrop = document.getElementById('invFabBackdrop');
        if (root) root.classList.remove('is-open');
        if (menu) menu.classList.add('hidden');
        if (backdrop) backdrop.classList.add('hidden');
        if (toggle) toggle.setAttribute('aria-expanded', 'false');
    };

    window.openFabMenu = function () {
        if (!activeAdvisorSession || activeAdvisorSession.mustChangeKey) return;
        if (typeof syncPwaInstallButtonState === 'function') syncPwaInstallButtonState();
        invFabIsOpen = true;
        const root = document.getElementById('invFabRoot');
        const menu = document.getElementById('invFabMenu');
        const toggle = document.getElementById('invFabToggleBtn');
        const backdrop = document.getElementById('invFabBackdrop');
        if (root) root.classList.add('is-open');
        if (menu) menu.classList.remove('hidden');
        if (backdrop) backdrop.classList.remove('hidden');
        if (toggle) toggle.setAttribute('aria-expanded', 'true');
        notifyInvBackStatePush('fab_menu');
    };

    window.toggleFabMenu = function () {
        if (invFabIsOpen) window.closeFabMenu();
        else window.openFabMenu();
    };

    function buildInAppModuleContext() {
        let s = activeAdvisorSession ? enrichAdvisorLocation(activeAdvisorSession) : null;
        if (s && isKevinAdvisorPreviewActive()) {
            const pStore = getKevinAdvisorPreviewStore();
            s = Object.assign({}, s, {
                isAdmin: false,
                isManager: false,
                is_master: false,
                es_admin: false,
                forceAdvisorPreview: true,
                puesto: 'ASESOR',
                erpStore: pStore,
                branchLabel: pStore,
                sheetTab: pStore,
                allLocations: [Object.assign({}, s, { isAdmin: false, isManager: false, erpStore: pStore, sheetTab: pStore })]
            });
        }
        return {
            session: s,
            apiUrl: (window.CREATA_CLOUD_CONFIG && window.CREATA_CLOUD_CONFIG.getApiUrl)
                ? (window.CREATA_CLOUD_CONFIG.getApiUrl() || CANONICAL_WEBAPP_URL)
                : CANONICAL_WEBAPP_URL,
            onClose: function () { window.closeInAppModules(); },
            onGoHome: function () { window.goHomeFromLogo(); },
            onBackStatePush: notifyInvBackStatePush,
            backNavManaged: Boolean(_invBackNav),
            getLiveInventorySnapshot: function () {
                const map = {};
                if (!Array.isArray(allItems)) return map;
                for (let i = 0; i < allItems.length; i++) {
                    const it = allItems[i];
                    if (!it || !it.s) continue;
                    const sku = String(it.s).trim().toUpperCase();
                    if (!sku) continue;
                    const st = Array.isArray(it.st) ? it.st : [];
                    map[sku] = {
                        sku: sku,
                        tipo: it.tp || '',
                        modelo: it.mo || '',
                        nombre: it.n || '',
                        fotoRaw: it.f || '',
                        cedis_bod: Number(st[1]) || 0,
                        cedis_pis: Number(st[2]) || 0,
                        casa_bod: Number(st[3]) || 0,
                        casa_pis: Number(st[4]) || 0,
                        ptc_bod: Number(st[5]) || 0,
                        ptc_pis: Number(st[6]) || 0,
                        col_bod: Number(st[7]) || 0,
                        col_pis: Number(st[8]) || 0,
                        pla_bod: Number(st[9]) || 0,
                        pla_pis: Number(st[10]) || 0,
                        out_bod: Number(it.out_bod !== undefined ? it.out_bod : st[11]) || 0,
                        out_pis: Number(it.out_pis !== undefined ? it.out_pis : st[12]) || 0,
                        precio: parsePriceNum(it.pr) || 0
                    };
                }
                return map;
            }
        };
    }

    function unmountActiveModules() {
        try {
            if (window.CreataSeguimientoModule && typeof window.CreataSeguimientoModule.unmount === 'function') {
                window.CreataSeguimientoModule.unmount();
            }
        } catch (e) {}
        try {
            if (window.CreataHistorialModule && typeof window.CreataHistorialModule.unmount === 'function') {
                window.CreataHistorialModule.unmount();
            }
        } catch (e) {}
    }

    window.closeInAppModules = function (opts) {
        const o = opts || {};
        const mainView = document.getElementById('invMainView');
        const segView = document.getElementById('inAppSeguimientoView');
        const histView = document.getElementById('inAppHistorialView');
        unmountActiveModules();
        if (segView) segView.classList.add('hidden');
        if (histView) histView.classList.add('hidden');
        if (mainView) mainView.classList.remove('hidden');
        document.body.classList.remove('inv-module-open');
        activeInAppModule = 'home';
        const histBtn = document.getElementById('headerHistorialBtn');
        if (histBtn) histBtn.classList.remove('is-active');
        if (!o.skipCheckpoint && typeof scheduleSaveInvWorkspaceCheckpoint === 'function') {
            scheduleSaveInvWorkspaceCheckpoint();
        }
    };
    window.closeInAppModuleView = window.closeInAppModules;

    window.openInAppSeguimiento = function () {
        if (!activeAdvisorSession || activeAdvisorSession.mustChangeKey) {
            pendingPostAuthModuleIntent = 'seguimiento';
            openAuthModalForStartup();
            return;
        }
        if (isGuestSession()) return;
        window.closeFabMenu();
        closeProductDetail();
        closeCartModal();
        if (typeof window.closePriceCalculatorModal === 'function') window.closePriceCalculatorModal();
        if (typeof window.closeUploadPhotoModal === 'function') window.closeUploadPhotoModal();

        const mainView = document.getElementById('invMainView');
        const segView = document.getElementById('inAppSeguimientoView');
        const histView = document.getElementById('inAppHistorialView');
        const segRoot = document.getElementById('inAppSeguimientoRoot');
        if (!segView || !segRoot) return;

        try {
            if (window.CreataHistorialModule && typeof window.CreataHistorialModule.unmount === 'function') {
                window.CreataHistorialModule.unmount();
            }
        } catch (e) {}
        if (histView) histView.classList.add('hidden');
        if (mainView) mainView.classList.add('hidden');
        segView.classList.remove('hidden');
        document.body.classList.add('inv-module-open');
        activeInAppModule = 'seguimiento';

        if (window.CreataSeguimientoModule && typeof window.CreataSeguimientoModule.mount === 'function') {
            window.CreataSeguimientoModule.mount(segRoot, buildInAppModuleContext());
        } else {
            segRoot.innerHTML = '<div style="padding:24px;text-align:center;font-size:11px;font-weight:700;">Cargando Seguimiento...</div>';
        }
        if (!invWorkspaceRestoring) notifyInvBackStatePush('seguimiento_module');
        window.scrollTo({ top: 0, behavior: 'auto' });
        sendInvPresenceHeartbeat(activeAdvisorSession, false);
        if (typeof scheduleSaveInvWorkspaceCheckpoint === 'function') scheduleSaveInvWorkspaceCheckpoint();
    };

    window.openInAppHistorial = function () {
        if (!activeAdvisorSession || activeAdvisorSession.mustChangeKey) {
            pendingPostAuthModuleIntent = 'historial';
            openAuthModalForStartup();
            return;
        }
        if (isGuestSession() || !isEffectiveAdminSession() || !hasAdminPerm('historial')) return;
        window.closeFabMenu();
        closeProductDetail();
        closeCartModal();
        if (typeof window.closePriceCalculatorModal === 'function') window.closePriceCalculatorModal();
        if (typeof window.closeUploadPhotoModal === 'function') window.closeUploadPhotoModal();

        const mainView = document.getElementById('invMainView');
        const segView = document.getElementById('inAppSeguimientoView');
        const histView = document.getElementById('inAppHistorialView');
        const histRoot = document.getElementById('inAppHistorialRoot');
        if (!histView || !histRoot) return;

        try {
            if (window.CreataSeguimientoModule && typeof window.CreataSeguimientoModule.unmount === 'function') {
                window.CreataSeguimientoModule.unmount();
            }
        } catch (e) {}
        if (segView) segView.classList.add('hidden');
        if (mainView) mainView.classList.add('hidden');
        histView.classList.remove('hidden');
        document.body.classList.add('inv-module-open');
        activeInAppModule = 'historial';

        if (window.CreataHistorialModule && typeof window.CreataHistorialModule.mount === 'function') {
            window.CreataHistorialModule.mount(histRoot, buildInAppModuleContext());
        } else {
            histRoot.innerHTML = '<div style="padding:24px;text-align:center;font-size:11px;font-weight:700;">Cargando Historial...</div>';
        }
        if (!invWorkspaceRestoring) notifyInvBackStatePush('historial_module');
        window.scrollTo({ top: 0, behavior: 'auto' });
        sendInvPresenceHeartbeat(activeAdvisorSession, false);
        if (typeof scheduleSaveInvWorkspaceCheckpoint === 'function') scheduleSaveInvWorkspaceCheckpoint();
    };

    window.openInAppModule = function (moduleName) {
        if (moduleName === 'seguimiento') window.openInAppSeguimiento();
        else if (moduleName === 'historial') window.openInAppHistorial();
        else window.closeInAppModules();
    };

    window.goHomeFromLogo = function () {
        window.closeFabMenu();
        closeProductDetail();
        closeCartModal();
        if (typeof window.closeUploadPhotoModal === 'function') window.closeUploadPhotoModal();
        if (typeof window.closeBarcodeScanner === 'function') window.closeBarcodeScanner();
        window.closeInAppModules({ skipCheckpoint: true });
        activeCategory = 'ALL';
        activeSubCategory = 'ALL';
        const inp = document.getElementById('invSearchInput');
        if (inp) inp.value = '';
        _invPrevSearchNonEmpty = false;
        if (searchDebounceTimer) {
            clearTimeout(searchDebounceTimer);
            searchDebounceTimer = null;
        }
        applyFilter('');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        sendInvPresenceHeartbeat(activeAdvisorSession, false);
        if (typeof scheduleSaveInvWorkspaceCheckpoint === 'function') scheduleSaveInvWorkspaceCheckpoint();
    };
    window.goToHomeView = window.goHomeFromLogo;

    function readAndConsumeOpenModuleIntent() {
        let intent = '';
        try {
            const params = new URLSearchParams(window.location.search || '');
            const qMod = cleanStr(params.get('openModule') || params.get('module')).toLowerCase();
            if (qMod === 'seguimiento' || qMod === 'historial') intent = qMod;
        } catch (e) {}
        if (!intent) {
            try {
                const stored = cleanStr(sessionStorage.getItem('creata_open_module')).toLowerCase();
                if (stored === 'seguimiento' || stored === 'historial') intent = stored;
            } catch (e) {}
        }
        try { sessionStorage.removeItem('creata_open_module'); } catch (e) {}
        try {
            const lRaw = localStorage.getItem('creata_open_module');
            localStorage.removeItem('creata_open_module');
            if (!intent && lRaw) {
                let mod = '';
                if (String(lRaw).charAt(0) === '{') {
                    const parsed = JSON.parse(lRaw);
                    const ts = Number(parsed && parsed.ts) || 0;
                    if (parsed && parsed.module && (!ts || (Date.now() - ts) <= 30000)) {
                        mod = cleanStr(parsed.module).toLowerCase();
                    }
                }
                if (mod === 'seguimiento' || mod === 'historial') intent = mod;
            }
        } catch (e) {}
        if (intent && window.history && typeof window.history.replaceState === 'function') {
            try {
                const u = new URL(window.location.href);
                if (u.searchParams.has('openModule') || u.searchParams.has('module')) {
                    u.searchParams.delete('openModule');
                    u.searchParams.delete('module');
                    window.history.replaceState(window.history.state || {}, '', u.pathname + (u.search || '') + (u.hash || ''));
                }
            } catch (e) {}
        }
        return intent;
    }

    function applyPostAuthRestoreFlow() {
        if (!activeAdvisorSession || activeAdvisorSession.mustChangeKey) return;
        const intent = pendingPostAuthModuleIntent || readAndConsumeOpenModuleIntent();
        pendingPostAuthModuleIntent = '';
        if (intent === 'seguimiento' && !isGuestSession()) {
            window.openInAppSeguimiento();
            return;
        }
        if (intent === 'historial' && !isGuestSession()) {
            window.openInAppHistorial();
            return;
        }
        if (typeof restoreInvWorkspaceCheckpoint === 'function') {
            restoreInvWorkspaceCheckpoint();
        }
    }

    // ------------------------------------------------------------------------
    // BITÁCORA EXCLUSIVA EN HOJA "HISTORIAL": FALLOS DE CÓDIGO Y MOVIMIENTOS
    // ------------------------------------------------------------------------
    const FOTOS_NUEVAS_CARGADO_FOLDER_ID = '1rPFbjvovC5fSDPHS29yYpbLwM90c-5L9';
    const FOTOS_NUEVAS_CARGADO_SHEET = 'FOTOS NUEVAS CARGADO';
    const historySentSignatures = new Map();
    let historyEventsSentCount = 0;

    function reportSystemHistoryEvent(opts) {
        try {
            if (!opts || historyEventsSentCount >= 20) return;
            const sig = [
                cleanStr(opts.classification),
                cleanStr(opts.module),
                cleanStr(opts.event),
                cleanStr(opts.ref),
                cleanStr(opts.detail).slice(0, 120)
            ].join('|');
            const now = Date.now();
            const prevTs = historySentSignatures.get(sig) || 0;
            if (now - prevTs < 300000) return; // Evitar duplicados en ventana de 5 min
            historySentSignatures.set(sig, now);
            historyEventsSentCount++;

            const sess = activeAdvisorSession;
            const userStr = cleanStr(opts.user) ||
                (sess ? ((sess.nombre ? (sess.nombre + ' (' + sess.correo + ')') : sess.correo)) : 'Visitante / Sin sesión');
            const branchStr = cleanStr(opts.branch) ||
                (sess ? (sess.erpStore || sess.branchLabel || sess.sheetTab || '') : '');

            const classClean = cleanStr(opts.classification) || 'FALLO DE CÓDIGO';
            const modClean = cleanStr(opts.module) || 'inventario-app.js';
            const evClean = cleanStr(opts.event) || 'EVENTO SISTEMA';
            const stClean = cleanStr(opts.status) || '⚠️ ALERTA';
            const refClean = cleanStr(opts.ref) || '';
            const detClean = cleanStr(opts.detail) || '';

            callInvWebAppPost('inv_log_event', {
                authToken: (sess && sess.authToken) || '',
                classification: classClean,
                module: modClean,
                event: evClean,
                status: stClean,
                user: userStr,
                branch: branchStr,
                ref: refClean,
                detail: detClean,
                analysis: cleanStr(opts.analysis) || ''
            }, 9000).catch(() => {});

            if (/FALLO/i.test(classClean) && !/CORREGIDO/i.test(stClean)) {
                if (window.CreataLiveAlerts && typeof window.CreataLiveAlerts.notifyFailure === 'function') {
                    window.CreataLiveAlerts.notifyFailure({
                        classification: classClean,
                        status: stClean,
                        module: modClean,
                        event: evClean,
                        ref: refClean,
                        detail: detClean,
                        user: userStr,
                        branch: branchStr
                    });
                }
            }
        } catch (eHist) {}
    }

    if (typeof window !== 'undefined') {
        window.addEventListener('error', function (ev) {
            try {
                const msg = cleanStr(ev && ev.message);
                if (!msg || /ResizeObserver loop/i.test(msg)) return;
                if (/^Script error\.?$/i.test(msg) && !cleanStr(ev && ev.filename) && !(ev && ev.lineno) && !(ev && ev.error)) return;
                const fileStr = cleanStr(ev && ev.filename).split('/').pop() || 'inventario.html';
                const loc = (ev && ev.lineno) ? (fileStr + ':' + ev.lineno + (ev.colno ? (':' + ev.colno) : '')) : fileStr;
                reportSystemHistoryEvent({
                    classification: 'FALLO DE CÓDIGO',
                    module: 'JS Cliente · ' + loc,
                    event: 'ERROR DE EJECUCIÓN JAVASCRIPT',
                    status: '❌ ERROR',
                    ref: (currentDetailItem && currentDetailItem.s) ? currentDetailItem.s : '',
                    detail: msg,
                    analysis: cleanStr(ev && ev.error && ev.error.stack) || ('Excepción capturada en ventana (' + loc + ').')
                });
            } catch (e) {}
        });

        window.addEventListener('unhandledrejection', function (ev) {
            try {
                const r = ev ? ev.reason : null;
                const msg = cleanStr((r && r.message) ? r.message : r);
                if (
                    !msg ||
                    /AbortError|The user aborted a request|The operation was aborted|signal is aborted|play\(\)\s*request\s*was\s*interrupted|writeText.*Clipboard|Document is not focused|not allowed by the user agent/i.test(msg)
                ) return;
                reportSystemHistoryEvent({
                    classification: 'FALLO DE CÓDIGO',
                    module: 'JS Cliente · Promise',
                    event: 'PROMESA NO CONTROLADA (UNHANDLED REJECTION)',
                    status: '❌ ERROR',
                    ref: (currentDetailItem && currentDetailItem.s) ? currentDetailItem.s : '',
                    detail: msg,
                    analysis: cleanStr(r && r.stack) || 'Promesa asíncrona rechazada sin bloque catch.'
                });
            } catch (e) {}
        });
    }

    async function fetchSheetCsvRows(sheetName, extraParams) {
        if (!META.sheetId) return null;
        if (String(sheetName) === '1') {
            try {
                const exportUrl = 'https://docs.google.com/spreadsheets/d/' + encodeURIComponent(META.sheetId) +
                    '/export?format=csv&gid=620514545&_t=' + Date.now();
                const expResp = await fetch(exportUrl, { cache: 'no-store' });
                if (expResp.ok) {
                    const expTxt = await expResp.text();
                    if (expTxt && !expTxt.trim().startsWith('<!DOCTYPE') && !expTxt.trim().startsWith('<html')) {
                        const allRows = parseCsvText(expTxt);
                        if (Array.isArray(allRows) && allRows.length > 1) {
                            return allRows.slice(1);
                        }
                    }
                }
            } catch (eExp) {}
        }
        const url = 'https://docs.google.com/spreadsheets/d/' + encodeURIComponent(META.sheetId) +
            '/gviz/tq?tqx=out:csv&headers=0&sheet=' + encodeURIComponent(sheetName) +
            (extraParams ? ('&' + extraParams) : '') + '&_t=' + Date.now();
        try {
            const resp = await fetch(url, { cache: 'no-store' });
            if (!resp.ok) return null;
            const txt = await resp.text();
            if (!txt || txt.trim().startsWith('<!DOCTYPE') || txt.trim().startsWith('<html')) return null;
            return parseCsvText(txt);
        } catch (e) {
            return null;
        }
    }

    let lastErpCatalogSyncMs = 0;

    function restoreErpCatalogFromLocalCache() {
        try {
            const raw = localStorage.getItem(INV_ERP_CATALOG_CACHE_KEY);
            if (!raw) return false;
            const data = JSON.parse(raw);
            if (!data || typeof data !== 'object') return false;
            if (Array.isArray(data.stores) && data.stores.length > 0 && erpStoresCatalog.length <= DEFAULT_ERP_STORES.length) {
                erpStoresCatalog = data.stores;
            }
            if (Array.isArray(data.advisors) && data.advisors.length > 0 && erpAdvisorsCatalog.length === 0) {
                erpAdvisorsCatalog = data.advisors.map(a => ({
                    label: a.label || '',
                    branch: a.branch || '',
                    id: a.id || '',
                    tokens: Array.isArray(a.tokens) ? a.tokens : normAdvisorTokens(String(a.label || '').split('|')[0])
                }));
            }
            if (Array.isArray(data.prices) && data.prices.length > 0 && liveErpPricesBySku.size === 0) {
                liveErpPricesBySku = new Map(data.prices);
            }
            if (Array.isArray(data.catalog) && data.catalog.length > 0 && liveErpCatalogBySku.size === 0) {
                liveErpCatalogBySku = new Map(data.catalog);
            }
            return true;
        } catch (e) {
            return false;
        }
    }

    async function loadErpCatalogLiveFromSheet() {
        restoreErpCatalogFromLocalCache();
        const [rows, h1Rows] = await Promise.all([
            fetchSheetCsvRows('plantilla', 'range=AA2:AH5500'),
            fetchSheetCsvRows('1', 'range=A2:D9500').catch(() => null)
        ]);
        const stores = DEFAULT_ERP_STORES.slice();
        const advisors = [];
        const nextPrices = new Map();
        const nextErpCatalog = new Map();

        if (Array.isArray(rows)) {
            for (let i = 0; i < rows.length; i++) {
                const r = rows[i] || [];
                const st = cleanStr(r[0]);
                if (st && stores.indexOf(st) === -1) stores.push(st);
                const label = cleanStr(r[1]);
                const branch = cleanStr(r[2]);
                if (branch && stores.indexOf(branch) === -1) stores.push(branch);
                const idVal = cleanKeyCellValue(r[3]) || extractErpIdFromLabel(label);
                if (label && label.toUpperCase() !== 'ASESOR_ERP_ETIQUETA') {
                    advisors.push({
                        label: label,
                        branch: branch,
                        id: idVal,
                        tokens: normAdvisorTokens(label.split('|')[0])
                    });
                }
                const erpSku = cleanStr(r[4]).toUpperCase();
                if (erpSku && erpSku !== 'SKU_ERP') {
                    const prFmt = formatPrice(r[7]);
                    if (prFmt) nextPrices.set(erpSku, prFmt);
                    const rawAf = cleanStr(r[5]);
                    const erpMo = (rawAf && !/^\d+$/.test(rawAf) && !/^(ID_PRODUCTO_ERP|MODELO_ERP)$/i.test(rawAf)) ? rawAf : '';
                    const erpNom = cleanStr(r[6]);
                    if (erpNom && erpNom.toUpperCase() !== 'NOMBRE_ERP' && !/^DESC[-\s]|DESCONTINUAD/i.test(erpNom)) {
                        nextErpCatalog.set(erpSku, {
                            sku: cleanStr(r[4]),
                            mo: erpMo,
                            n: erpNom,
                            pr: prFmt,
                            f: ''
                        });
                    }
                }
            }
        }

        if (Array.isArray(h1Rows)) {
            for (let j = 0; j < h1Rows.length; j++) {
                const hr = h1Rows[j] || [];
                const hSkuRaw = cleanStr(hr[0]);
                const hSku = hSkuRaw.toUpperCase();
                if (!hSku || hSku === 'SKU') continue;
                const hNom = cleanStr(hr[1]);
                if (hNom && /^DESC[-\s]|DESCONTINUAD/i.test(hNom)) continue;
                // Col C (hr[2]) en Hoja '1' es 'FOTO APP', NO 'MODELO'
                const hFotoRaw = cleanStr(hr[3]);
                const hFoto = (/^https?:\/\//i.test(hFotoRaw) || extractDriveFileId(hFotoRaw)) ? hFotoRaw : '';
                const prevEntry = nextErpCatalog.get(hSku);
                if (prevEntry) {
                    if (!prevEntry.n && hNom) prevEntry.n = hNom;
                    if (!prevEntry.f && hFoto) prevEntry.f = hFoto;
                } else if (hNom) {
                    nextErpCatalog.set(hSku, {
                        sku: hSkuRaw,
                        mo: '',
                        n: hNom,
                        pr: nextPrices.get(hSku) || '',
                        f: hFoto
                    });
                }
            }
        }

        if (stores.length > 0 && Array.isArray(rows)) erpStoresCatalog = stores;
        if (advisors.length > 0) erpAdvisorsCatalog = advisors;
        if (nextPrices.size > 0) liveErpPricesBySku = nextPrices;
        if (nextErpCatalog.size > 0) liveErpCatalogBySku = nextErpCatalog;
        if (advisors.length > 0 || nextPrices.size > 0) {
            try {
                localStorage.setItem(INV_ERP_CATALOG_CACHE_KEY, JSON.stringify({
                    ts: Date.now(),
                    stores: erpStoresCatalog,
                    advisors: erpAdvisorsCatalog,
                    prices: Array.from(liveErpPricesBySku.entries()),
                    catalog: Array.from(liveErpCatalogBySku.entries())
                }));
            } catch (eCache) {}
        }
        lastErpCatalogSyncMs = Date.now();
    }

    function extractEmailFromGuestRowClient(rowArr) {
        if (!Array.isArray(rowArr)) return '';
        const preferredOrder = [4, 2, 1, 0, 3];
        for (let k = 0; k < preferredOrder.length; k++) {
            const idx = preferredOrder[k];
            const cell = cleanStr(rowArr[idx]).toLowerCase();
            if (cell && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cell)) {
                return cell;
            }
        }
        return '';
    }

    function deriveGuestNameFromRowClient(rowArr, email) {
        const c2 = cleanStr(rowArr && rowArr[2]);
        if (c2 && c2.indexOf('@') === -1 && !/^NOMBRE$/i.test(c2)) return c2;
        const c1 = cleanStr(rowArr && rowArr[1]);
        if (c1 && c1.indexOf('@') === -1 && !/^(INVITADO|SOLO\s*VER|MODALIDAD|SUC)$/i.test(c1)) return c1;
        const localPart = String(email || '').split('@')[0] || 'INVITADO';
        return localPart.replace(/[._-]+/g, ' ').toUpperCase();
    }

    async function fetchAllAdvisorRowsLiveGviz() {
        await loadErpCatalogLiveFromSheet();
        const activeToken = recoverStoredInvAuthToken(activeAdvisorSession);
        if (activeToken && activeAdvisorSession && !isGuestSession(activeAdvisorSession)) {
            try {
                const apiDir = await callInvWebAppPost('inv_my_directory', { authToken: activeToken }, 10000, true);
                if (apiDir && apiDir.ok && Array.isArray(apiDir.users) && apiDir.users.length > 0) {
                    const normalizedUsers = apiDir.users.map(u => enrichAdvisorLocation(u));
                    syncMultiStoreLocationsForActiveSession(normalizedUsers);
                    return normalizedUsers;
                }
            } catch (eApiDir) {}
        }
        const localKeyUpdates = loadUpdatedKeysMap();
        const tabsToFetch = USER_BRANCH_TABS.filter(c => c.tab === 'CUENTAS ADMINISTRATIVAS' || c.isGuest);
        const results = await Promise.all(tabsToFetch.map(async (cfg) => {
            let rows = await fetchSheetCsvRows(cfg.tab);
            if (cfg.isGuest && (!rows || !rows.length)) {
                rows = await fetchSheetCsvRows('invitados');
                if (!rows || !rows.length) {
                    rows = await fetchSheetCsvRows('Invitados');
                }
                if (!rows || !rows.length) {
                    const tok = (activeAdvisorSession && activeAdvisorSession.authToken) || '';
                    if (tok) callInvWebAppPost('inv_ensure_invitados', { authToken: tok }, 8000).catch(() => {});
                }
            }
            if (!rows || rows.length < 1) return [];
            let headerIdx = -1;
            for (let h = 0; h < Math.min(rows.length, 4); h++) {
                const hdrRow = rows[h] || [];
                const joinedHdr = hdrRow.map(c => cleanStr(c).toUpperCase()).join(' ');
                if (/^CORREO/i.test(cleanStr(hdrRow[4])) || /^NOMBRE/i.test(cleanStr(hdrRow[2])) || (cfg.isGuest && /\bCORREO\b/.test(joinedHdr))) {
                    headerIdx = h;
                    break;
                }
            }
            if (headerIdx === -1 && !cfg.isGuest) return [];
            const headerRowArr = headerIdx >= 0 ? (rows[headerIdx] || []) : [];
            const startIdx = headerIdx >= 0 ? (headerIdx + 1) : 0;
            const tabUsers = [];
            for (let i = startIdx; i < rows.length; i++) {
                const r = rows[i] || [];
                const correo = cfg.isGuest
                    ? extractEmailFromGuestRowClient(r)
                    : cleanStr(r[4]).toLowerCase().replace(/,/g, '.');
                if (!correo || correo.indexOf('@') === -1) continue;
                let tempKey = cleanKeyCellValue(r[5]);
                let defKey = cleanKeyCellValue(r[6]);
                const colB = cleanStr(r[1]);
                const colH = cleanStr(r[7]);
                const colI = cleanStr(r[8]);

                // Si la hoja ya tiene clave definitiva en Col G, limpiar caché pendiente local
                const localUpd = localKeyUpdates[correo];
                if (defKey && localUpd && keysMatchNormalized(defKey, localUpd.newKey)) {
                    delete localKeyUpdates[correo];
                    saveUpdatedKeysMap(localKeyUpdates);
                } else if (!defKey && localUpd && localUpd.newKey) {
                    defKey = localUpd.newKey;
                    tempKey = '';
                }

                if (cfg.isGuest) {
                    const guestNombre = deriveGuestNameFromRowClient(r, correo);
                    const guestPuesto = cleanStr(r[3]) && cleanStr(r[3]).indexOf('@') === -1
                        ? cleanStr(r[3])
                        : 'Invitado (Solo Ver)';
                    const guestCols = extractGuestDeviceColsFromRowClient(r);
                    const parsedDevs = parseGuestDevicesFromTextClient(guestCols.devicesRaw, guestCols.maxPlaces);
                    tabUsers.push({
                        sheetTab: 'INVITADOS',
                        rowNum: i + 1,
                        isAdmin: false,
                        isManager: false,
                        isGuest: true,
                        soloLectura: true,
                        noPasswordRequired: (!tempKey && !defKey),
                        maxDiscountPct: 0,
                        branchKey: 'INVITADOS',
                        branchLabel: cfg.label,
                        erpStore: 'SOLO LECTURA',
                        orderPrefix: 'INV',
                        quoteType: 'SOLO_VER',
                        isProyecto: false,
                        serieLabel: 'Modo Invitado · Solo Ver (Máx. ' + guestCols.maxPlaces + (guestCols.maxPlaces === 1 ? ' Dispositivo)' : ' Dispositivos)'),
                        nombre: guestNombre,
                        puesto: guestPuesto,
                        correo: correo,
                        tempKey: tempKey,
                        defKey: defKey,
                        mustChangeKey: !defKey,
                        erpAdvisorLabel: '',
                        erpAdvisorId: '',
                        erpAdvisorBranch: '',
                        guestPlacesText: guestCols.placesText,
                        guestDevicesRaw: guestCols.devicesRaw,
                        guestDevices: parsedDevs,
                        guestMaxPlaces: guestCols.maxPlaces
                    });
                    continue;
                }

                const nombre = cleanStr(r[2]);
                const puesto = cleanStr(r[3]);

                // Columna H: Nombre y ID del asesor en S Mueblería; Columna I (al costado): Descuento (%)
                let explicitAdvisorLabel = '';
                let explicitAdvisorId = '';
                let explicitDiscountPct = parseDiscountPctCell(colI);
                if (explicitDiscountPct === null && parseDiscountPctCell(colH) !== null && !extractErpIdFromLabel(colH)) {
                    explicitDiscountPct = parseDiscountPctCell(colH);
                } else if (colH) {
                    explicitAdvisorId = extractErpIdFromLabel(colH) || (/^\d{3,7}$/.test(colH) ? colH : '');
                    if (colH.indexOf('|') !== -1 || explicitAdvisorId) {
                        explicitAdvisorLabel = colH;
                    }
                }

                const resolveErpClientForStore = (storeErpName) => {
                    let matched = null;
                    if (explicitAdvisorId && erpAdvisorsCatalog.length > 0) {
                        matched = erpAdvisorsCatalog.find(a => String(a.id) === String(explicitAdvisorId)) || null;
                    }
                    if (!matched) {
                        matched = matchBestErpAdvisorClient(nombre, storeErpName, erpAdvisorsCatalog);
                    }
                    return {
                        label: (matched && matched.label) || explicitAdvisorLabel || '',
                        id: (matched && matched.id) || explicitAdvisorId || '',
                        branch: (matched && matched.branch) || ''
                    };
                };

                const rowPerms = extractAdminPermissionsFromRowClient(headerRowArr, r, correo);
                const storeInfo = extractAssignedStoresFromRowClient(headerRowArr, r, colB);
                const isAdminUser = isAdministrativeUnifiedRowClient(correo, colB, puesto, storeInfo.hasStoreCols);

                if (isAdminUser) {
                    const singleStCfg = storeInfo.stores.length === 1 ? findBranchConfig(storeInfo.stores[0], '') : null;
                    const defaultAdminErp = singleStCfg ? singleStCfg.erpStore : cfg.erpStore;
                    const erpInfo = resolveErpClientForStore(defaultAdminErp);
                    const userErpStore = erpInfo.branch || defaultAdminErp;
                    tabUsers.push({
                        sheetTab: 'CUENTAS ADMINISTRATIVAS',
                        rowNum: i + 1,
                        isAdmin: true,
                        isManager: false,
                        isGuest: false,
                        soloLectura: false,
                        maxDiscountPct: explicitDiscountPct,
                        branchKey: 'ADMIN',
                        branchLabel: cfg.label,
                        erpStore: userErpStore,
                        orderPrefix: getStoreFolioPrefix(userErpStore, singleStCfg ? singleStCfg.orderPrefix : cfg.orderPrefix),
                        quoteType: 'ADMINISTRATIVO',
                        isProyecto: false,
                        serieLabel: cfg.serieLabel,
                        nombre: nombre,
                        puesto: puesto,
                        correo: correo,
                        tempKey: tempKey,
                        defKey: defKey,
                        mustChangeKey: !defKey && !!tempKey,
                        erpAdvisorLabel: erpInfo.label,
                        erpAdvisorId: erpInfo.id,
                        erpAdvisorBranch: erpInfo.branch,
                        adminPermissions: rowPerms,
                        userPermissions: rowPerms,
                        assignedStores: storeInfo.stores.slice()
                    });
                } else {
                    const targetStores = storeInfo.stores.length ? storeInfo.stores : ['PROYECTOS'];
                    for (let sIdx = 0; sIdx < targetStores.length; sIdx++) {
                        const stCfg = findBranchConfig(targetStores[sIdx], '') || findBranchConfig('PROYECTOS', '');
                        if (!stCfg) continue;
                        const erpInfo = resolveErpClientForStore(stCfg.erpStore);
                        tabUsers.push({
                            sheetTab: stCfg.tab,
                            rowNum: i + 1,
                            isAdmin: false,
                            isManager: isManagerSessionUser(puesto),
                            isGuest: false,
                            soloLectura: false,
                            maxDiscountPct: explicitDiscountPct,
                            branchKey: stCfg.branchKey,
                            branchLabel: stCfg.label,
                            erpStore: stCfg.erpStore,
                            orderPrefix: getStoreFolioPrefix(stCfg.erpStore, stCfg.orderPrefix),
                            quoteType: stCfg.quoteType,
                            isProyecto: !!stCfg.isProyecto,
                            serieLabel: stCfg.serieLabel,
                            nombre: nombre,
                            puesto: puesto,
                            correo: correo,
                            tempKey: tempKey,
                            defKey: defKey,
                            mustChangeKey: !defKey && !!tempKey,
                            erpAdvisorLabel: erpInfo.label,
                            erpAdvisorId: erpInfo.id,
                            erpAdvisorBranch: erpInfo.branch,
                            adminPermissions: null,
                            userPermissions: rowPerms,
                            assignedStores: targetStores.slice()
                        });
                    }
                }
            }
            return tabUsers;
        }));
        const flatUsers = results.flat();
        const adminPermsByEmail = {};
        for (let a = 0; a < flatUsers.length; a++) {
            const au = flatUsers[a];
            if (au && !au.isGuest && au.isAdmin && au.correo && au.adminPermissions) {
                adminPermsByEmail[String(au.correo).trim().toLowerCase()] = au.adminPermissions;
            }
        }
        for (let a = 0; a < flatUsers.length; a++) {
            const au = flatUsers[a];
            if (!au || au.isGuest || !au.correo) continue;
            const em = String(au.correo).trim().toLowerCase();
            if (adminPermsByEmail[em]) {
                au.isAdmin = true;
                au.adminPermissions = adminPermsByEmail[em];
            } else if (au.isAdmin && !au.adminPermissions) {
                au.adminPermissions = defaultAdminPermissionsForEmailClient(em);
            }
        }
        for (let m = 0; m < flatUsers.length; m++) {
            const mu = flatUsers[m];
            if (!mu || mu.isAdmin || mu.isGuest || !mu.isManager) continue;
            const mgrStoreNorm = normalizeQuoteErpStoreClient(mu.erpStore, mu.sheetTab);
            const allowedEmails = [String(mu.correo || '').trim().toLowerCase()];
            for (let k = 0; k < flatUsers.length; k++) {
                const cu = flatUsers[k];
                if (!cu || !cu.correo || cu.isAdmin || cu.isGuest || cu.isManager) continue;
                const cuStoreNorm = normalizeQuoteErpStoreClient(cu.erpStore, cu.sheetTab);
                const cuEmail = String(cu.correo).trim().toLowerCase();
                if (cuEmail && cuStoreNorm === mgrStoreNorm && allowedEmails.indexOf(cuEmail) === -1) {
                    allowedEmails.push(cuEmail);
                }
            }
            mu.branchAdvisorEmails = allowedEmails;
        }
        syncMultiStoreLocationsForActiveSession(flatUsers);
        return flatUsers;
    }

    function syncMultiStoreLocationsForActiveSession(liveUsers) {
        if (!activeAdvisorSession || isGuestSession(activeAdvisorSession) || !Array.isArray(liveUsers) || !liveUsers.length) return;
        const sessEmail = String(activeAdvisorSession.correo || '').trim().toLowerCase();
        if (!sessEmail) return;
        const matchedLocs = liveUsers.filter(u => u && !u.isGuest && String(u.correo || '').trim().toLowerCase() === sessEmail);
        if (!matchedLocs.length) return;

        const adminRow = matchedLocs.find(u => u && u.adminPermissions && u.sheetTab === 'CUENTAS ADMINISTRATIVAS') || matchedLocs.find(u => u && u.adminPermissions);
        let permsChanged = false;
        if (adminRow && adminRow.adminPermissions) {
            const prevPermSig = JSON.stringify(activeAdvisorSession.adminPermissions || null);
            const nextPermSig = JSON.stringify(adminRow.adminPermissions);
            if (prevPermSig !== nextPermSig) {
                activeAdvisorSession.isAdmin = true;
                activeAdvisorSession.adminPermissions = adminRow.adminPermissions;
                permsChanged = true;
            }
        }
        const firstUserRow = matchedLocs[0];
        if (firstUserRow && firstUserRow.userPermissions) {
            const prevUserPermSig = JSON.stringify(activeAdvisorSession.userPermissions || null);
            const nextUserPermSig = JSON.stringify(firstUserRow.userPermissions);
            if (prevUserPermSig !== nextUserPermSig) {
                activeAdvisorSession.userPermissions = firstUserRow.userPermissions;
                permsChanged = true;
            }
        }
        if (firstUserRow && Array.isArray(firstUserRow.assignedStores)) {
            const prevStSig = JSON.stringify(activeAdvisorSession.assignedStores || []);
            const nextStSig = JSON.stringify(firstUserRow.assignedStores);
            if (prevStSig !== nextStSig) {
                activeAdvisorSession.assignedStores = firstUserRow.assignedStores.slice();
                permsChanged = true;
            }
        }

        const prevLocs = Array.isArray(activeAdvisorSession.allLocations) ? activeAdvisorSession.allLocations : [];
        const tokenByTab = {};
        prevLocs.forEach(l => {
            if (l && l.sheetTab && l.authToken) {
                tokenByTab[String(l.sheetTab).trim().toUpperCase()] = l.authToken;
            }
        });
        if (activeAdvisorSession.sheetTab && activeAdvisorSession.authToken) {
            tokenByTab[String(activeAdvisorSession.sheetTab).trim().toUpperCase()] = activeAdvisorSession.authToken;
        }

        const nextAll = matchedLocs.map(rawU => {
            const u = enrichAdvisorLocation(rawU);
            const tabKey = String(u.sheetTab || '').trim().toUpperCase();
            return Object.assign({}, u, {
                mustChangeKey: false,
                authToken: tokenByTab[tabKey] || activeAdvisorSession.authToken || ''
            });
        });

        const prevTabsSig = prevLocs.map(l => String((l && l.sheetTab) || '').toUpperCase()).join('|');
        const nextTabsSig = nextAll.map(l => String((l && l.sheetTab) || '').toUpperCase()).join('|');
        if (permsChanged || prevTabsSig !== nextTabsSig || prevLocs.length !== nextAll.length) {
            activeAdvisorSession.allLocations = nextAll;
            saveAdvisorSession(activeAdvisorSession);
            renderAdvisorHeaderBar();
            populateQuoteAdvisorControls();
            if (typeof renderSettingsRoleAndSections === 'function') renderSettingsRoleAndSections();
        }
    }

    async function syncPendingKeyUpdatesToCloud() {
        purgeLegacySyncedPendingKeys();
        const mapObj = loadUpdatedKeysMap();
        const emails = Object.keys(mapObj);
        if (!emails.length) return;
        let changed = false;
        for (let i = 0; i < emails.length; i++) {
            const em = emails[i];
            const item = mapObj[em];
            if (!item || !item.newKey) continue;
            const res = await callInvWebAppPost('inv_update_key', {
                email: em,
                currentKey: item.prevKey || '',
                newKey: item.newKey
            }, 9000);
            if (res && res.ok) {
                if (activeAdvisorSession && activeAdvisorSession.correo === em && res.authToken) {
                    activeAdvisorSession.authToken = res.authToken;
                    saveAdvisorSession(activeAdvisorSession);
                }
                delete mapObj[em];
                changed = true;
            }
        }
        if (changed) saveUpdatedKeysMap(mapObj);
    }

    function showAuthBanner(elId, text, tone) {
        const el = document.getElementById(elId);
        if (!el) return;
        if (!text) {
            el.textContent = '';
            el.classList.add('hidden');
            return;
        }
        el.textContent = text;
        el.className = 'rounded-xl border px-3.5 py-2.5 text-[11px] font-bold ' +
            (tone === 'ok' ? 'sem-green' : (tone === 'warn' ? 'sem-yellow' : 'sem-red'));
    }

    function setAuthStepVisible(stepName) {
        const sLogin = document.getElementById('authStepLogin');
        const sBranch = document.getElementById('authStepBranch');
        const sNewKey = document.getElementById('authStepNewKey');
        if (sLogin) sLogin.classList.toggle('hidden', stepName !== 'login');
        if (sBranch) sBranch.classList.toggle('hidden', stepName !== 'branch');
        if (sNewKey) sNewKey.classList.toggle('hidden', stepName !== 'newkey');
    }

    window.toggleAuthInputVisibility = function (inputId, btnEl) {
        const inp = document.getElementById(inputId);
        if (!inp) return;
        const isHidden = inp.type === 'password';
        inp.type = isHidden ? 'text' : 'password';
        if (btnEl) btnEl.textContent = isHidden ? 'Ocultar' : 'Ver';
    };

    function renderAdvisorHeaderBar() {
        const bar = document.getElementById('advisorSessionBar');
        const nameEl = document.getElementById('sessionUserName');
        const branchEl = document.getElementById('sessionBranchBadge');
        const erpEl = document.getElementById('sessionErpBadge');
        const switchBtn = document.getElementById('sessionSwitchBranchBtn');
        const headerSwitchStoreBtn = document.getElementById('headerSwitchStoreBtn');
        const headerSwitchStoreBtnText = document.getElementById('headerSwitchStoreBtnText');
        const headerExtraWrap = document.getElementById('invHeaderExtra');
        const headerHistBtn = document.getElementById('headerHistorialBtn');
        const guestBadgeWrap = document.getElementById('headerGuestBadgeWrap');
        const guestBadgeText = document.getElementById('headerGuestBadgeText');

        const fabRoot = document.getElementById('invFabRoot');
        const fabQuoteBtn = document.getElementById('fabQuoteBtn');
        const fabCalculatorBtn = document.getElementById('fabCalculatorBtn');
        const fabSeguimientoBtn = document.getElementById('fabSeguimientoBtn');
        const fabPurchaseSuggestionBtn = document.getElementById('fabPurchaseSuggestionBtn');
        const fabUploadPhotoBtn = document.getElementById('fabUploadPhotoBtn');
        const fabSplitFotosBtn = document.getElementById('fabSplitFotosBtn');
        const fabPromptsBtn = document.getElementById('fabPromptsBtn');
        const fabPanelSuiteBtn = document.getElementById('fabPanelSuiteBtn');
        const fabSettingsBtn = document.getElementById('fabSettingsBtn');
        const fabGuestSessionsBtn = document.getElementById('fabGuestSessionsBtn');
        const fabGuestPasswordBtn = document.getElementById('fabGuestPasswordBtn');
        const fabLogoutBtn = document.getElementById('fabLogoutBtn');
        const headerRoleModePill = document.getElementById('headerRoleModePill');
        const uploadPhotoAppFotosLink = document.getElementById('uploadPhotoAppFotosLink');
        const uploadPhotoSplitBtn = document.getElementById('uploadPhotoSplitBtn');

        const isAuthed = !!(activeAdvisorSession && !activeAdvisorSession.mustChangeKey);
        const guestMode = isGuestSession();
        const canUploadDrivePhotos = canManageProductPhotos();
        const isOwnerFotos = isFotosAppOwner();
        const effectiveAdmin = isEffectiveAdminSession();
        const kevinAdvisorPreview = isKevinAdvisorPreviewActive();
        const nonAdminUserPerms = (!effectiveAdmin && activeAdvisorSession && activeAdvisorSession.userPermissions && typeof activeAdvisorSession.userPermissions === 'object')
            ? activeAdvisorSession.userPermissions
            : null;
        const canSeeHistorial = isAuthed && !guestMode && effectiveAdmin && hasAdminPerm('historial');
        const canSeeCotizador = !guestMode && (effectiveAdmin ? hasAdminPerm('cotizador') : (!nonAdminUserPerms || nonAdminUserPerms.cotizador !== false));
        const canSeeSeguimiento = !guestMode && (effectiveAdmin ? hasAdminPerm('seguimiento') : (!nonAdminUserPerms || nonAdminUserPerms.seguimiento !== false));
        const canSwitchStorePerm = !nonAdminUserPerms || nonAdminUserPerms.cambiarTienda !== false;
        const canSeePromptsIa = isAuthed && !guestMode && effectiveAdmin && hasAdminPerm('promptsIa');
        const canSeePanelSuite = isAuthed && !guestMode && effectiveAdmin && hasAdminPerm('panelSuite');

        if (headerHistBtn) {
            headerHistBtn.classList.toggle('hidden', !canSeeHistorial);
        }
        if (!canSeeHistorial && activeInAppModule === 'historial' && typeof window.closeInAppModules === 'function') {
            window.closeInAppModules();
        }
        if (!canSeeSeguimiento && activeInAppModule === 'seguimiento' && typeof window.closeInAppModules === 'function') {
            window.closeInAppModules();
        }

        if (fabRoot) {
            fabRoot.classList.toggle('hidden', !isAuthed);
            if (!isAuthed) window.closeFabMenu();
        }
        if (fabQuoteBtn) fabQuoteBtn.classList.toggle('hidden', !canSeeCotizador);
        if (fabCalculatorBtn) fabCalculatorBtn.classList.toggle('hidden', !isAuthed || guestMode);
        if ((!isAuthed || guestMode) && typeof window.closePriceCalculatorModal === 'function') {
            window.closePriceCalculatorModal();
        }
        if (fabSeguimientoBtn) fabSeguimientoBtn.classList.toggle('hidden', !canSeeSeguimiento);
        if (fabPurchaseSuggestionBtn) fabPurchaseSuggestionBtn.classList.toggle('hidden', !isAuthed);
        if (fabUploadPhotoBtn) fabUploadPhotoBtn.classList.toggle('hidden', !canUploadDrivePhotos);
        if (fabSplitFotosBtn) fabSplitFotosBtn.classList.toggle('hidden', !isOwnerFotos);
        if (fabPromptsBtn) fabPromptsBtn.classList.toggle('hidden', !canSeePromptsIa);
        if (fabPanelSuiteBtn) fabPanelSuiteBtn.classList.toggle('hidden', !canSeePanelSuite);
        if (fabSettingsBtn) fabSettingsBtn.classList.toggle('hidden', !isAuthed || guestMode);
        if (fabGuestSessionsBtn) fabGuestSessionsBtn.classList.toggle('hidden', !isAuthed || !guestMode);
        if (fabGuestPasswordBtn) fabGuestPasswordBtn.classList.toggle('hidden', !isAuthed || !guestMode);
        if (fabLogoutBtn) fabLogoutBtn.classList.toggle('hidden', !isAuthed);
        if (uploadPhotoAppFotosLink) uploadPhotoAppFotosLink.classList.toggle('hidden', !isOwnerFotos);
        if (uploadPhotoSplitBtn) uploadPhotoSplitBtn.classList.toggle('hidden', !isOwnerFotos);
        if (!isOwnerFotos && _invSplitActive && typeof window.closeInvSplitFotosDock === 'function') {
            window.closeInvSplitFotosDock();
        }

        let showRolePill = false;
        if (headerRoleModePill) {
            if (isAuthed && kevinAdvisorPreview) {
                showRolePill = true;
                headerRoleModePill.classList.remove('hidden');
            } else {
                headerRoleModePill.classList.add('hidden');
            }
        }

        let showGuest = false;
        if (guestBadgeWrap) {
            if (guestMode && isAuthed) {
                showGuest = true;
                const maxCap = Math.max(1, Math.min(50, Number(activeAdvisorSession.guestMaxPlaces) || MAX_GUEST_PLACES_PER_EMAIL));
                const slotNum = Math.max(1, Math.min(maxCap, Number(activeAdvisorSession.guestSlotNum) || 1));
                if (guestBadgeText) {
                    guestBadgeText.textContent = 'SOLO VER · ' + slotNum + '/' + maxCap;
                }
                guestBadgeWrap.classList.remove('hidden');
            } else {
                guestBadgeWrap.classList.add('hidden');
            }
        }

        const multiLocs = (isAuthed && !guestMode && !effectiveAdmin && !kevinAdvisorPreview && canSwitchStorePerm && Array.isArray(activeAdvisorSession.allLocations))
            ? activeAdvisorSession.allLocations.filter(l => l && !l.isGuest)
            : [];
        let showSwitch = false;
        if (headerSwitchStoreBtn) {
            if (multiLocs.length > 1) {
                showSwitch = true;
                const shortStore = cleanStr(activeAdvisorSession.erpStore || activeAdvisorSession.branchLabel || activeAdvisorSession.sheetTab) || 'Tienda';
                if (headerSwitchStoreBtnText) {
                    headerSwitchStoreBtnText.textContent = shortStore + ' ▾';
                }
                headerSwitchStoreBtn.classList.remove('hidden');
            } else {
                headerSwitchStoreBtn.classList.add('hidden');
            }
        }

        if (headerExtraWrap) {
            headerExtraWrap.classList.toggle('hidden', !(showGuest || showSwitch || showRolePill));
        }

        updateCartBadge();

        if (currentDetailItem && typeof refreshDetailManagerPhotoControls === 'function') {
            refreshDetailManagerPhotoControls(currentDetailItem, true);
        }

        if (!bar) return;
        if (!isAuthed) {
            bar.classList.add('hidden');
            return;
        }

        if (nameEl) nameEl.textContent = activeAdvisorSession.nombre || activeAdvisorSession.correo;
        if (branchEl) {
            const activeStoreEff = kevinAdvisorPreview ? getKevinAdvisorPreviewStore() : activeAdvisorSession.erpStore;
            const prefix = getStoreFolioPrefix(activeStoreEff, activeAdvisorSession.orderPrefix);
            if (guestMode) {
                branchEl.textContent = 'INVITADO · SOLO VER';
            } else if (kevinAdvisorPreview) {
                branchEl.textContent = 'MODO ASESOR · ' + activeStoreEff + ' · ' + prefix;
            } else if (effectiveAdmin) {
                branchEl.textContent = 'ADMINISTRADOR';
            } else if (activeAdvisorSession.isProyecto) {
                branchEl.textContent = 'PROYECTO · ' + prefix;
            } else {
                branchEl.textContent = (activeAdvisorSession.branchLabel || activeAdvisorSession.sheetTab || '') + ' · ' + prefix;
            }
        }
        if (erpEl) {
            if (guestMode) {
                const maxCap = Math.max(1, Math.min(50, Number(activeAdvisorSession.guestMaxPlaces) || MAX_GUEST_PLACES_PER_EMAIL));
                const slotNum = Math.max(1, Math.min(maxCap, Number(activeAdvisorSession.guestSlotNum) || 1));
                erpEl.textContent = 'Lugar ' + slotNum + '/' + maxCap;
                erpEl.classList.remove('hidden');
            } else if (activeAdvisorSession.erpAdvisorId) {
                erpEl.textContent = 'ID #' + activeAdvisorSession.erpAdvisorId;
                erpEl.classList.remove('hidden');
            } else {
                erpEl.textContent = '';
                erpEl.classList.add('hidden');
            }
        }
        if (switchBtn) {
            switchBtn.classList.toggle('hidden', multiLocs.length <= 1);
        }
        bar.classList.remove('hidden');
    }

    function applyAdvisorDefaultsToQuoteForm(forceOverwriteStoreAndUser) {
        if (!activeAdvisorSession || isGuestSession()) return;
        if (!activeAdvisorSession.isAdmin || forceOverwriteStoreAndUser || !quoteDraftMeta.erpStore) {
            quoteDraftMeta.erpStore = activeAdvisorSession.erpStore || 'CREATA PUERTO CANCUN';
            quoteDraftMeta.erpAdvisorLabel = activeAdvisorSession.erpAdvisorLabel || '';
            quoteDraftMeta.erpAdvisorId = activeAdvisorSession.erpAdvisorId || '';
        }
        try {
            const jsonMeta = JSON.stringify(quoteDraftMeta);
            localStorage.setItem(QUOTE_META_STORAGE, jsonMeta);
            localStorage.setItem(QUOTE_META_STORAGE_ALT, jsonMeta);
        } catch (e) {}
        populateQuoteAdvisorControls();
    }

    function openAuthModalForStartup() {
        const modal = document.getElementById('authModal');
        if (!modal) return;
        showAuthBanner('authLoginMsg', '', 'err');
        showAuthBanner('authNewKeyMsg', '', 'err');

        if (activeAdvisorSession && activeAdvisorSession.mustChangeKey) {
            setAuthStepVisible('newkey');
            modal.classList.add('open');
            return;
        }
        if (!activeAdvisorSession) {
            setAuthStepVisible('login');
            modal.classList.add('open');
            const emInp = document.getElementById('authEmailInput');
            if (emInp) setTimeout(() => emInp.focus(), 60);
            return;
        }
        modal.classList.remove('open');
        renderAdvisorHeaderBar();
        sendInvPresenceHeartbeat(activeAdvisorSession, true);
        if (isGuestSession()) {
            verifyActiveGuestSessionLive();
        } else {
            refreshMyLiveQuotesInfo();
        }
    }

    function promptSessionReauth(reasonMsg, retrySendFlag) {
        pendingQuoteRetrySendToErp = (typeof retrySendFlag === 'boolean') ? retrySendFlag : null;
        const modal = document.getElementById('authModal');
        const emInp = document.getElementById('authEmailInput');
        const keyInp = document.getElementById('authKeyInput');
        if (emInp && activeAdvisorSession && activeAdvisorSession.correo) {
            emInp.value = activeAdvisorSession.correo;
        }
        if (keyInp) keyInp.value = '';
        setAuthStepVisible('login');
        showAuthBanner('authLoginMsg', reasonMsg || 'Confirma tu contraseña personal para emitir la cotización con tu usuario exclusivo.', 'warn');
        if (modal) {
            modal.classList.add('open');
            if (activeAdvisorSession && !activeAdvisorSession.mustChangeKey) {
                notifyInvBackStatePush('auth_reauth');
            }
        }
        if (keyInp) setTimeout(() => keyInp.focus(), 60);
    }

    function renderBranchChoicesStep(locations, subtitleText) {
        const subEl = document.getElementById('authBranchSubtitle');
        const listEl = document.getElementById('authBranchOptionsList');
        if (subEl && subtitleText) subEl.textContent = subtitleText;
        if (!listEl) return;

        listEl.innerHTML = locations.map((rawLoc, idx) => {
            const loc = enrichAdvisorLocation(rawLoc);
            const isCurrent = activeAdvisorSession &&
                activeAdvisorSession.sheetTab === loc.sheetTab &&
                activeAdvisorSession.correo === loc.correo;
            const pfx = getStoreFolioPrefix(loc.erpStore, loc.orderPrefix);
            const guestMaxCap = Math.max(1, Math.min(50, Number(loc.guestMaxPlaces) || MAX_GUEST_PLACES_PER_EMAIL));
            const modeTag = loc.isGuest
                ? ('SOLO VER · MÁX ' + guestMaxCap + (guestMaxCap === 1 ? ' LUGAR' : ' LUGARES'))
                : (loc.isAdmin
                    ? 'ADMIN · VER TODO'
                    : (loc.isProyecto ? ('PROYECTO · FOLIO ' + pfx) : ('FOLIO ' + pfx)));
            return '<button type="button" data-branch-idx="' + idx + '" ' +
                'class="w-full text-left rounded-xl border p-3.5 transition flex items-center justify-between gap-3 hover:shadow-sm" ' +
                'style="border-color:' + (isCurrent ? '#A38251' : '#E1DBC5') + '; background:' + (isCurrent ? '#FAF9F6' : '#FFFFFF') + ';">' +
                '<div class="min-w-0">' +
                    '<div class="flex flex-wrap items-center gap-1.5">' +
                        '<span class="text-[11px] font-extrabold uppercase tracking-wider" style="color:#252C32;">' + escapeHtml(loc.branchLabel || loc.sheetTab) + '</span>' +
                        '<span class="px-2 py-0.5 rounded-full text-[11px] font-extrabold uppercase" style="background:' + (loc.isProyecto || loc.isAdmin ? '#252C32' : '#E1DBC5') + '; color:' + (loc.isProyecto || loc.isAdmin ? '#FFFFFF' : '#252C32') + ';">' + escapeHtml(modeTag) + '</span>' +
                    '</div>' +
                    '<div class="text-[11px] font-semibold mt-0.5" style="color:#A38251;">' +
                        escapeHtml((loc.puesto ? (loc.puesto + ' · ') : '') + (loc.erpStore || '')) +
                    '</div>' +
                '</div>' +
                '<span class="px-2.5 py-1 rounded-full text-[11px] font-extrabold uppercase shrink-0" style="background:#A38251; color:#FFFFFF;">' + (isCurrent ? 'Activa' : 'Elegir') + '</span>' +
            '</button>';
        }).join('');

        listEl.querySelectorAll('button[data-branch-idx]').forEach(btn => {
            btn.onclick = function () {
                const idx = parseInt(btn.getAttribute('data-branch-idx'), 10) || 0;
                const chosen = locations[idx];
                if (chosen) finalizeLocationChoice(chosen, locations, '');
            };
        });

        setAuthStepVisible('branch');
        const modal = document.getElementById('authModal');
        if (modal) modal.classList.add('open');
    }

    function refreshGuestReadOnlyUIState() {
        updateCartBadge();
        const inp = document.getElementById('invSearchInput');
        if (Array.isArray(allItems) && allItems.length > 0) {
            applyFilter(inp ? inp.value : '', true);
        }
        const detailModal = document.getElementById('productDetailModal');
        if (detailModal && detailModal.classList.contains('open')) {
            if (currentDetailItem) {
                const crumbEl = document.getElementById('detGroupCrumb');
                const crumbVisible = !!(crumbEl && !crumbEl.classList.contains('hidden'));
                renderDetailModal(currentDetailItem, crumbVisible && !!currentGroup);
            } else if (currentGroup) {
                renderGroupVariantsStep(currentGroup);
            }
        }
    }

    function finalizeLocationChoice(chosenLoc, allLocs, nextOrderFromLogin) {
        const enrichedChosen = enrichAdvisorLocation(chosenLoc);
        const cleanAll = (allLocs || [enrichedChosen]).map(rawU => {
            const u = enrichAdvisorLocation(rawU);
            const locObj = {
                sheetTab: u.sheetTab,
                rowNum: u.rowNum,
                isAdmin: !!u.isAdmin,
                isManager: !!u.isManager,
                isGuest: !!u.isGuest,
                soloLectura: !!u.soloLectura,
                maxDiscountPct: u.isGuest ? 0 : (u.maxDiscountPct !== undefined ? u.maxDiscountPct : null),
                branchKey: u.branchKey,
                branchLabel: u.branchLabel,
                erpStore: u.erpStore,
                orderPrefix: u.orderPrefix,
                quoteType: u.quoteType,
                isProyecto: !!u.isProyecto,
                serieLabel: u.serieLabel,
                nombre: u.nombre,
                puesto: u.puesto,
                correo: u.correo,
                mustChangeKey: !!u.mustChangeKey,
                erpAdvisorLabel: u.erpAdvisorLabel || '',
                erpAdvisorId: u.erpAdvisorId || '',
                erpAdvisorBranch: u.erpAdvisorBranch || '',
                authToken: u.authToken || '',
                guestSlotNum: u.guestSlotNum || 1,
                guestActivePlaces: u.guestActivePlaces || 1,
                guestMaxPlaces: u.guestMaxPlaces || MAX_GUEST_PLACES_PER_EMAIL
            };
            if (Array.isArray(u.branchAdvisorEmails)) {
                locObj.branchAdvisorEmails = u.branchAdvisorEmails;
            }
            if (u.adminPermissions && typeof u.adminPermissions === 'object') {
                locObj.adminPermissions = Object.assign({}, u.adminPermissions);
            }
            if (u.userPermissions && typeof u.userPermissions === 'object') {
                locObj.userPermissions = Object.assign({}, u.userPermissions);
            }
            if (Array.isArray(u.assignedStores)) {
                locObj.assignedStores = u.assignedStores.slice();
            }
            return locObj;
        });

        const sessionObj = {
            sheetTab: enrichedChosen.sheetTab,
            rowNum: enrichedChosen.rowNum,
            isAdmin: !!enrichedChosen.isAdmin,
            isManager: !!enrichedChosen.isManager,
            isGuest: !!enrichedChosen.isGuest,
            soloLectura: !!enrichedChosen.soloLectura,
            maxDiscountPct: enrichedChosen.isGuest ? 0 : (enrichedChosen.maxDiscountPct !== undefined ? enrichedChosen.maxDiscountPct : null),
            branchKey: enrichedChosen.branchKey,
            branchLabel: enrichedChosen.branchLabel,
            erpStore: enrichedChosen.erpStore,
            orderPrefix: enrichedChosen.orderPrefix,
            quoteType: enrichedChosen.quoteType,
            isProyecto: !!enrichedChosen.isProyecto,
            serieLabel: enrichedChosen.serieLabel,
            nombre: enrichedChosen.nombre,
            puesto: enrichedChosen.puesto,
            correo: enrichedChosen.correo,
            mustChangeKey: !!enrichedChosen.mustChangeKey,
            erpAdvisorLabel: enrichedChosen.erpAdvisorLabel || '',
            erpAdvisorId: enrichedChosen.erpAdvisorId || '',
            erpAdvisorBranch: enrichedChosen.erpAdvisorBranch || '',
            authToken: enrichedChosen.authToken || '',
            guestSlotNum: enrichedChosen.guestSlotNum || 1,
            guestActivePlaces: enrichedChosen.guestActivePlaces || 1,
            guestMaxPlaces: enrichedChosen.guestMaxPlaces || MAX_GUEST_PLACES_PER_EMAIL,
            allLocations: cleanAll
        };
        if (Array.isArray(enrichedChosen.branchAdvisorEmails)) {
            sessionObj.branchAdvisorEmails = enrichedChosen.branchAdvisorEmails;
        }
        if (enrichedChosen.adminPermissions && typeof enrichedChosen.adminPermissions === 'object') {
            sessionObj.adminPermissions = Object.assign({}, enrichedChosen.adminPermissions);
        }
        if (enrichedChosen.userPermissions && typeof enrichedChosen.userPermissions === 'object') {
            sessionObj.userPermissions = Object.assign({}, enrichedChosen.userPermissions);
        }
        if (Array.isArray(enrichedChosen.assignedStores)) {
            sessionObj.assignedStores = enrichedChosen.assignedStores.slice();
        }

        lastSubmittedQuoteMeta = null;
        myRecentQuotesList = [];
        newlyGeneratedQuoteHighlightKey = '';
        if (sessionObj.isGuest) {
            cart = {};
            closeCartModal();
            currentNextOrderCode = '';
        } else {
            const cleanLoginFolio = (nextOrderFromLogin && !/^[A-Z]+-\d+$/i.test(String(nextOrderFromLogin)))
                ? cleanStr(nextOrderFromLogin)
                : '';
            if (cleanLoginFolio && sessionObj.erpStore) {
                liveNextFolioByStore[String(sessionObj.erpStore).toUpperCase()] = cleanLoginFolio;
            }
            currentNextOrderCode = cleanLoginFolio || getEstimatedStoreFolio(sessionObj.erpStore, sessionObj.orderPrefix);
        }

        saveAdvisorSession(sessionObj);
        renderMyRecentQuotes([]);
        if (!sessionObj.isGuest) {
            applyAdvisorDefaultsToQuoteForm(true);
        }

        if (sessionObj.mustChangeKey) {
            showAuthBanner('authNewKeyMsg', '', 'err');
            const nk = document.getElementById('authNewKeyInput');
            const ck = document.getElementById('authConfirmKeyInput');
            if (nk) nk.value = '';
            if (ck) ck.value = '';
            setAuthStepVisible('newkey');
            const modal = document.getElementById('authModal');
            if (modal) modal.classList.add('open');
            if (nk) setTimeout(() => nk.focus(), 60);
            return;
        }

        pendingAuthContext = null;
        const modal = document.getElementById('authModal');
        if (modal) modal.classList.remove('open');
        renderAdvisorHeaderBar();
        refreshGuestReadOnlyUIState();
        sendInvPresenceHeartbeat(sessionObj, true);
        if (!sessionObj.isGuest) {
            refreshMyLiveQuotesInfo();
        }

        if (!sessionObj.isGuest && pendingPdfDownloadRetryOpts) {
            const retryPdfOpts = pendingPdfDownloadRetryOpts;
            pendingPdfDownloadRetryOpts = null;
            window.downloadOriginalErpQuotePdf(retryPdfOpts);
            return;
        }

        if (!sessionObj.isGuest && pendingQuoteRetrySendToErp !== null) {
            const retrySendFlag = pendingQuoteRetrySendToErp;
            pendingQuoteRetrySendToErp = null;
            submitQuoteToSystem(retrySendFlag, true);
            return;
        }

        applyPostAuthRestoreFlow();
    }

    let lastGuestHeartbeatMs = 0;
    async function verifyActiveGuestSessionLive(forceNow) {
        if (!activeAdvisorSession || !isGuestSession(activeAdvisorSession)) return;
        const now = Date.now();
        if (!forceNow && (now - lastGuestHeartbeatMs) < 45000) return;
        lastGuestHeartbeatMs = now;

        const email = String(activeAdvisorSession.correo || '').trim().toLowerCase();
        const deviceId = getOrCreateClientDeviceId();
        const deviceLabel = getClientDeviceLabel();
        const localKeyUpdates = loadUpdatedKeysMap();
        const hasPendingLocalNewKey = !!(localKeyUpdates[email] && localKeyUpdates[email].newKey);

        try {
            const hbRes = await callInvWebAppPost('inv_guest_heartbeat', {
                authToken: (activeAdvisorSession && activeAdvisorSession.authToken) || '',
                email: email,
                deviceId: deviceId,
                deviceLabel: deviceLabel
            }, 9000);

            if (hbRes && hbRes.ok) {
                if (hbRes.slotNumber) activeAdvisorSession.guestSlotNum = hbRes.slotNumber;
                if (hbRes.activePlaces || hbRes.activeCount) activeAdvisorSession.guestActivePlaces = hbRes.activePlaces || hbRes.activeCount;
                if (hbRes.maxPlaces) {
                    activeAdvisorSession.guestMaxPlaces = hbRes.maxPlaces;
                }
                if (hbRes.mustChangeKey && !hasPendingLocalNewKey) {
                    activeAdvisorSession.mustChangeKey = true;
                    saveAdvisorSession(activeAdvisorSession);
                    openAuthModalForStartup();
                    return;
                }
                saveAdvisorSession(activeAdvisorSession);
                renderAdvisorHeaderBar();
                return;
            }
            if (hbRes && !hbRes.unavailable && !hbRes.needsRedeploy && (hbRes.authRequired || hbRes.limitReached || hbRes.revoked)) {
                const msg = hbRes.error || 'Tu acceso de Invitado alcanzó el límite de dispositivos permitidos o fue actualizado.';
                window.logoutAdvisorSession();
                showAuthBanner('authLoginMsg', msg, 'err');
                return;
            }
        } catch (e) {}
    }

    window.submitAdvisorLogin = async function (ev) {
        if (ev && ev.preventDefault) ev.preventDefault();
        const emailEl = document.getElementById('authEmailInput');
        const keyEl = document.getElementById('authKeyInput');
        const btnEl = document.getElementById('authLoginSubmitBtn');

        const email = cleanStr(emailEl ? emailEl.value : '').toLowerCase();
        const inputKey = cleanStr(keyEl ? keyEl.value : '');
        if (!email) {
            showAuthBanner('authLoginMsg', 'Ingresa tu correo electrónico.', 'err');
            return;
        }

        const deviceId = getOrCreateClientDeviceId();
        const deviceLabel = getClientDeviceLabel();
        const preferredTab = ((pendingQuoteRetrySendToErp !== null || pendingPdfDownloadRetryOpts !== null) && activeAdvisorSession && activeAdvisorSession.correo === email)
            ? (activeAdvisorSession.sheetTab || '')
            : '';

        if (btnEl) {
            btnEl.disabled = true;
            btnEl.textContent = 'Verificando cuenta...';
        }
        showAuthBanner('authLoginMsg', '', 'err');

        try {
            // P0-01: Autenticación y emisión de token firmado exclusivamente vía Apps Script WebApp (sin verificación de contraseñas en cliente vía GViz)
            const cloudRes = await callInvWebAppPost('inv_login', {
                email: email,
                accessKey: inputKey,
                sheetTab: preferredTab,
                deviceId: deviceId,
                deviceLabel: deviceLabel
            }, 12000, true);

            if (cloudRes && cloudRes.ok) {
                if (cloudRes.nextFolioByStore) {
                    applyServerFolioMap(cloudRes.nextFolioByStore);
                }
                if (Array.isArray(cloudRes.stores) && cloudRes.stores.length > 0) {
                    const mergedStores = DEFAULT_ERP_STORES.slice();
                    cloudRes.stores.forEach(s => {
                        const cs = cleanStr(s);
                        if (cs && mergedStores.indexOf(cs) === -1) mergedStores.push(cs);
                    });
                    erpStoresCatalog = mergedStores;
                }
                if (Array.isArray(cloudRes.advisors) && cloudRes.advisors.length > 0) {
                    erpAdvisorsCatalog = cloudRes.advisors.map(a => ({
                        label: a.label,
                        branch: a.branch,
                        id: a.id || extractErpIdFromLabel(a.label),
                        tokens: normAdvisorTokens((a.label || '').split('|')[0])
                    }));
                }

                const mergedLocations = Array.isArray(cloudRes.locations)
                    ? cloudRes.locations.slice()
                    : (Array.isArray(cloudRes.allLocationsForEmail)
                        ? cloudRes.allLocationsForEmail.slice()
                        : (cloudRes.user ? [cloudRes.user] : []));

                if ((cloudRes.chooseBranch || mergedLocations.length > 1) && mergedLocations.length > 1 && !preferredTab) {
                    pendingAuthContext = {
                        email: email,
                        inputKey: inputKey,
                        locations: mergedLocations,
                        switchingFromActive: false
                    };
                    renderBranchChoicesStep(
                        mergedLocations,
                        'Hola ' + (mergedLocations[0].nombre || '') + '. Tu correo está registrado en varias tiendas/bodegas; selecciona a qué tienda vas a cotizar:'
                    );
                    return;
                }

                if (cloudRes.user || mergedLocations.length > 0) {
                    const primaryUser = preferredTab
                        ? (mergedLocations.find(u => u.sheetTab === preferredTab) || cloudRes.user || mergedLocations[0])
                        : (cloudRes.user || mergedLocations[0]);
                    pendingAuthContext = {
                        email: email,
                        inputKey: inputKey,
                        locations: mergedLocations.length ? mergedLocations : [primaryUser],
                        switchingFromActive: false
                    };
                    finalizeLocationChoice(
                        primaryUser,
                        mergedLocations.length ? mergedLocations : [primaryUser],
                        cloudRes.nextOrderCode || ''
                    );
                    return;
                }
            }

            if (cloudRes && !cloudRes.unavailable && !cloudRes.needsRedeploy && cloudRes.error) {
                showAuthBanner('authLoginMsg', cloudRes.error, 'err');
                return;
            }
            showAuthBanner('authLoginMsg', 'Sin conexión con el servidor de autenticación. Verifica tu internet e intenta de nuevo.', 'err');
        } finally {
            if (btnEl) {
                btnEl.disabled = false;
                btnEl.textContent = 'Ingresar';
            }
        }
    };

    window.cancelBranchSelection = function () {
        if (pendingAuthContext && pendingAuthContext.switchingFromActive && activeAdvisorSession && !activeAdvisorSession.mustChangeKey) {
            pendingAuthContext = null;
            const modal = document.getElementById('authModal');
            if (modal) modal.classList.remove('open');
            return;
        }
        setAuthStepVisible('login');
    };

    window.openSwitchBranchSelector = function () {
        if (!activeAdvisorSession || !Array.isArray(activeAdvisorSession.allLocations) || activeAdvisorSession.allLocations.length <= 1) {
            return;
        }
        if (!isEffectiveAdminSession() && activeAdvisorSession.userPermissions && activeAdvisorSession.userPermissions.cambiarTienda === false) {
            return;
        }
        pendingAuthContext = {
            email: activeAdvisorSession.correo,
            inputKey: '',
            locations: activeAdvisorSession.allLocations,
            switchingFromActive: true
        };
        renderBranchChoicesStep(
            activeAdvisorSession.allLocations,
            'Selecciona la tienda o bodega autorizada de tu cuenta a la que vas a cotizar:'
        );
        notifyInvBackStatePush('auth_branch');
    };

    window.onMultiStoreUserSelectChange = function (targetSheetTab) {
        if (!activeAdvisorSession || activeAdvisorSession.isAdmin || isGuestSession()) return;
        const multiLocs = Array.isArray(activeAdvisorSession.allLocations)
            ? activeAdvisorSession.allLocations.filter(l => l && !l.isGuest)
            : [];
        if (multiLocs.length <= 1) return;
        const cleanTarget = cleanStr(targetSheetTab).toUpperCase().replace(/COLOSIO/g, 'COLOCIO');
        const chosen = multiLocs.find(l =>
            String(l.sheetTab || '').trim().toUpperCase().replace(/COLOSIO/g, 'COLOCIO') === cleanTarget ||
            String(l.erpStore || '').trim().toUpperCase() === cleanTarget
        );
        if (!chosen) return;
        finalizeLocationChoice(chosen, activeAdvisorSession.allLocations, '');
    };

    window.submitNewPersonalKey = async function (ev) {
        if (ev && ev.preventDefault) ev.preventDefault();
        if (!activeAdvisorSession) return;

        const newKeyEl = document.getElementById('authNewKeyInput');
        const confKeyEl = document.getElementById('authConfirmKeyInput');
        const saveBtn = document.getElementById('authSaveNewKeyBtn');

        const newKey = cleanStr(newKeyEl ? newKeyEl.value : '');
        const confKey = cleanStr(confKeyEl ? confKeyEl.value : '');
        const prevTempKey = (pendingAuthContext && pendingAuthContext.inputKey) ? pendingAuthContext.inputKey : '';

        if (newKey.length < 8) {
            showAuthBanner('authNewKeyMsg', 'La nueva contraseña debe tener mínimo 8 caracteres.', 'err');
            return;
        }
        if (newKey !== confKey) {
            showAuthBanner('authNewKeyMsg', 'Las contraseñas no coinciden. Verifícalas por favor.', 'err');
            return;
        }
        if (prevTempKey && keysMatchNormalized(newKey, prevTempKey)) {
            showAuthBanner('authNewKeyMsg', 'Elige una contraseña nueva diferente a la contraseña temporal.', 'err');
            return;
        }

        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.textContent = 'Guardando nueva contraseña...';
        }
        showAuthBanner('authNewKeyMsg', '', 'err');

        try {
            const authTokenForKey = recoverStoredInvAuthToken(activeAdvisorSession) || activeAdvisorSession.authToken || '';
            const reqBody = {
                email: activeAdvisorSession.correo,
                currentKey: prevTempKey,
                newKey: newKey,
                sheetTab: activeAdvisorSession.sheetTab || '',
                authToken: authTokenForKey
            };

            let res = await callInvWebAppPost('inv_update_key', reqBody, 25000, true);
            if (!res || res.unavailable) {
                res = await callInvWebAppPost('inv_update_key', reqBody, 25000, true);
            }

            if (!res || !res.ok) {
                const errText = (res && res.error)
                    ? res.error
                    : 'No se pudo guardar tu nueva contraseña en el servidor. Verifica tu conexión y presiona Guardar de nuevo.';
                showAuthBanner('authNewKeyMsg', errText, 'err');
                return;
            }

            if (res.authToken) {
                activeAdvisorSession.authToken = res.authToken;
            }
            if (res.tokensByTab && Array.isArray(activeAdvisorSession.allLocations)) {
                activeAdvisorSession.allLocations = activeAdvisorSession.allLocations.map(l =>
                    Object.assign({}, l, {
                        mustChangeKey: false,
                        authToken: (l && l.sheetTab && res.tokensByTab[l.sheetTab]) || l.authToken || res.authToken || ''
                    })
                );
            }
            try {
                const mapObj = loadUpdatedKeysMap();
                if (mapObj && mapObj[activeAdvisorSession.correo]) {
                    delete mapObj[activeAdvisorSession.correo];
                    saveUpdatedKeysMap(mapObj);
                }
            } catch (eCleanPend) {}

            activeAdvisorSession.mustChangeKey = false;
            if (Array.isArray(activeAdvisorSession.allLocations)) {
                activeAdvisorSession.allLocations = activeAdvisorSession.allLocations.map(l =>
                    Object.assign({}, l, { mustChangeKey: false })
                );
            }
            saveAdvisorSession(activeAdvisorSession);
            pendingAuthContext = null;

            const keyInp = document.getElementById('authKeyInput');
            if (keyInp) keyInp.value = '';

            const modal = document.getElementById('authModal');
            if (modal) modal.classList.remove('open');
            renderAdvisorHeaderBar();
            refreshGuestReadOnlyUIState();
            sendInvPresenceHeartbeat(activeAdvisorSession, true);
            if (!isGuestSession()) {
                populateQuoteAdvisorControls();
                refreshMyLiveQuotesInfo();
            } else {
                verifyActiveGuestSessionLive(true);
            }

            if (pendingQuoteRetrySendToErp !== null) {
                const retrySendFlag = pendingQuoteRetrySendToErp;
                pendingQuoteRetrySendToErp = null;
                submitQuoteToSystem(retrySendFlag, true);
                return;
            }

            applyPostAuthRestoreFlow();
        } finally {
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.textContent = 'Guardar';
            }
        }
    };

    window.logoutAdvisorSession = function () {
        const prevSess = activeAdvisorSession;
        sendInvPresenceLogout(prevSess);
        window.closeFabMenu();
        window.closeInAppModules({ skipCheckpoint: true });
        if (typeof window.closeUploadPhotoModal === 'function') window.closeUploadPhotoModal();
        if (typeof window.closeSettingsModal === 'function') window.closeSettingsModal();
        if (typeof window.closeOutOfStockRequestModal === 'function') window.closeOutOfStockRequestModal();
        if (typeof window.closePurchaseSuggestionModal === 'function') window.closePurchaseSuggestionModal();
        if (typeof window.closePriceCalculatorModal === 'function') window.closePriceCalculatorModal();
        if (typeof window.clearPriceCalculator === 'function') window.clearPriceCalculator(true);
        try {
            if (typeof sessionStorage !== 'undefined') {
                sessionStorage.removeItem(KEVIN_ROLE_PREVIEW_KEY);
                sessionStorage.removeItem('creata_private_kevin_fotos_sec_v1');
            }
            localStorage.removeItem(INV_SESSION_STARTED_AT_KEY);
            localStorage.removeItem(PENDING_KEYS_STORAGE);
            localStorage.removeItem('creata_private_kevin_panel_v1');
            localStorage.removeItem('creata_private_kevin_fotos_v1');
            localStorage.removeItem('creata_private_kevin_hist_v1');
            localStorage.removeItem('creata_private_kevin_fotos_sec_v1');
            localStorage.removeItem(CART_KEY);
            localStorage.removeItem(QUOTE_DRAFTS_KEY);
            localStorage.removeItem(QUOTE_META_STORAGE);
            localStorage.removeItem(QUOTE_META_STORAGE_ALT);
            localStorage.removeItem(INV_OOS_LOCAL_BACKUP_KEY);
            localStorage.removeItem(INV_PURCHASE_SUG_LOCAL_BACKUP_KEY);
            localStorage.removeItem('creata_seg_closures_v1');
            localStorage.removeItem('creata_seg_phones_v1');
            localStorage.removeItem('creata_seg_contacted_v1');
            localStorage.removeItem('creata_seg_audit_v1');
            localStorage.removeItem('creata_seg_live_snapshot_v1');
            localStorage.removeItem('creata_seg_offline_outbox_v1');
            localStorage.removeItem('creata_seg_dir_cache_v1');
            localStorage.removeItem('creata_live_app_quotes_bridge_v1');
        } catch (eClrRole) {}
        saveAdvisorSession(null);
        pendingAuthContext = null;
        pendingQuoteRetrySendToErp = null;
        currentNextOrderCode = '';
        myRecentQuotesList = [];
        newlyGeneratedQuoteHighlightKey = '';
        lastSubmittedQuoteMeta = null;
        renderAdvisorHeaderBar();
        refreshGuestReadOnlyUIState();
        renderMyRecentQuotes([]);
        const keyInp = document.getElementById('authKeyInput');
        if (keyInp) keyInp.value = '';
        closeCartModal();
        try {
            if (_invBackNav && typeof _invBackNav.resetToBase === 'function') {
                _invBackNav.resetToBase();
            }
        } catch (e) {}
        openAuthModalForStartup();
    };
