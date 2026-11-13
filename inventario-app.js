(function () {
    'use strict';

    const DEFAULT_WAREHOUSES = [
        'LPPT',
        'CEDIS (BODEGA)',
        'CEDIS (PISO)',
        'CASA CREATA (BODEGA)',
        'CASA CREATA (PISO)',
        'PUERTO CANCUN (BODEGA)',
        'PUERTO CANCUN (PISO)',
        'COLOSIO (BODEGA)',
        'COLOSIO (PISO)',
        'PLAYA (BODEGA)',
        'PLAYA (PISO)'
    ];
    const META = window.CREATA_INV_META || {
        fileName: 'CONTROL DE PRODUCTOS PRESENTACIÓN',
        sheetId: '1xewqWPOlR5LMEFQXq1KsqvObg9PPlTkRGqfZ_4Iiv-8',
        gid: 690403633,
        tabName: 'INVENTARIO_EN_VIVO',
        lpptSheetId: '1t78KDg_DMbGfauNWRrjUc3ULh-SzrxO9XwOHPrtJtWE',
        lpptGid: 1025729459,
        warehouses: DEFAULT_WAREHOUSES
    };
    const WAREHOUSES = Array.isArray(META.warehouses) && META.warehouses.length > 0
        ? META.warehouses
        : DEFAULT_WAREHOUSES;
    const LPPT_SHEET_ID = META.lpptSheetId || '1t78KDg_DMbGfauNWRrjUc3ULh-SzrxO9XwOHPrtJtWE';
    const LPPT_GID = META.lpptGid || 1025729459;

    const MONTHS_ES = [
        'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
        'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
    ];

    const PAGE_SIZE = 80;
    const CART_KEY = 'creata_inv_open_cart_v1';
    const DEFAULT_MIN_STOCK = 2;

    let allItems = Array.isArray(window.CREATA_INV_DATA) ? window.CREATA_INV_DATA : [];
    const bySkuMap = new Map();
    const groupsByKey = new Map();
    let allGroups = [];
    let filteredGroups = [];
    let renderedCount = 0;

    let currentGroup = null;
    let currentDetailItem = null;
    let cart = loadCart();
    let lastLiveSignature = '';
    let liveLpptBySku = new Map();

    function emptyStocks() {
        return new Array(WAREHOUSES.length).fill(0);
    }

    function isLpptWarehouse(label) {
        return /^(LPPT|LLPT)$/i.test(String(label || '').trim());
    }

    // Suma únicamente las 10 ubicaciones físicas (CEDIS, CASA CREATA, PUERTO CANCUN, COLOSIO, PLAYA en BODEGA y PISO)
    function getBodegaPisoStock(it) {
        if (!it || !Array.isArray(it.st)) return 0;
        let total = 0;
        for (let i = 0; i < WAREHOUSES.length; i++) {
            if (isLpptWarehouse(WAREHOUSES[i])) continue;
            total += Math.max(0, Number(it.st[i]) || 0);
        }
        return total;
    }

    function parsePriceNum(raw) {
        if (raw === null || raw === undefined) return 0;
        if (typeof raw === 'number') return isFinite(raw) && raw > 0 ? raw : 0;
        const cleaned = String(raw).replace(/[^0-9.-]/g, '');
        if (!cleaned) return 0;
        const n = Number(cleaned);
        return (!isNaN(n) && isFinite(n) && n > 0) ? n : 0;
    }

    function formatPrice(raw) {
        const n = parsePriceNum(raw);
        if (n <= 0) return '';
        return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function computeItemsSignature(items) {
        const parts = new Array(items.length);
        for (let i = 0; i < items.length; i++) {
            const it = items[i];
            const st = Array.isArray(it.st) ? it.st.join(',') : '';
            parts[i] = [
                it.s, it.tp, it.mo, it.n, it.vr, it.f, it.c,
                it.tl, it.ct, it.md, it.cm, it.mt, it.m, it.p,
                it.lt, it.pr, it.fe, st
            ].join('\x1f');
        }
        return parts.join('\n');
    }

    function cleanStr(val) {
        if (val === null || val === undefined) return '';
        const s = String(val).trim();
        if (!s) return '';
        if (/^(n\/?a|null|undefined|-|\.|sin\s+especificar|no\s+especificado|no\s+aplica|pendiente|por\s+clasificar)$/i.test(s)) {
            return '';
        }
        return s;
    }

    function normalizePlain(str) {
        return String(str || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, ' ')
            .trim();
    }

    // Normalización fonética/ortográfica para español (z/s/c, b/v, ll/y) -> "Apienso" == "Apienzo"
    function normSearch(str) {
        return String(str || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/ll/g, 'y')
            .replace(/c([ei])/g, 's$1')
            .replace(/z/g, 's')
            .replace(/v/g, 'b')
            .replace(/([a-z])\1+/g, '$1')
            .replace(/[^a-z0-9]+/g, ' ')
            .trim();
    }

    function isOneEditOrTransposition(a, b) {
        if (a === b) return true;
        const la = a.length;
        const lb = b.length;
        if (Math.abs(la - lb) > 1) return false;

        let i = 0;
        while (i < la && i < lb && a[i] === b[i]) i++;
        if (i === la && i === lb) return true;

        if (la === lb) {
            if (a.slice(i + 1) === b.slice(i + 1)) return true;
            if (i + 1 < la && a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2)) {
                return true;
            }
            return false;
        }
        if (la > lb) return a.slice(i + 1) === b.slice(i);
        return a.slice(i) === b.slice(i + 1);
    }

    function tokenMatchesGroup(tok, grp) {
        if (grp._search.indexOf(tok) !== -1 || grp._plain.indexOf(tok) !== -1) return true;
        if (tok.length >= 5 && !/\d/.test(tok)) {
            for (let i = 0; i < grp._words.length; i++) {
                if (isOneEditOrTransposition(tok, grp._words[i])) return true;
            }
        }
        return false;
    }

    function escapeHtml(str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function extractDriveFileId(raw) {
        const s = cleanStr(raw);
        if (!s) return '';
        const m = s.match(/\/d\/([a-zA-Z0-9_-]{15,})/) || s.match(/[?&]id=([a-zA-Z0-9_-]{15,})/);
        return m ? m[1] : '';
    }

    function resolveDriveOrImgUrl(raw) {
        const s = cleanStr(raw);
        if (!s) return '';
        const fid = extractDriveFileId(s);
        if (fid) return 'https://lh3.googleusercontent.com/d/' + fid + '=w1000';
        if (/^https?:\/\//i.test(s) || s.startsWith('data:image/')) return s;
        return '';
    }

    function computeGroupTitle(it) {
        const tp = cleanStr(it.tp).toUpperCase();
        const mo = cleanStr(it.mo).toUpperCase();
        if (tp && mo) return tp + ' ' + mo;
        return cleanStr(it.n || it.s).toUpperCase();
    }

    function formatTitleWithPriceHtml(titleText, priceStr) {
        const cleanTitle = escapeHtml(titleText || '');
        const cleanPr = formatPrice(priceStr);
        if (!cleanPr) return cleanTitle;
        return cleanTitle + ' <span class="font-extrabold" style="color:#A38251;">— ' + escapeHtml(cleanPr) + '</span>';
    }

    function formatTitleWithPricePlain(titleText, priceStr) {
        const cleanTitle = String(titleText || '').trim();
        const cleanPr = formatPrice(priceStr);
        if (!cleanPr) return cleanTitle;
        return cleanTitle + ' — ' + cleanPr;
    }

    function parseSheetDate(rawStr) {
        const s = cleanStr(rawStr);
        if (!s) return null;
        const m1 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
        if (m1) {
            const d = parseInt(m1[1], 10);
            const m = parseInt(m1[2], 10) - 1;
            let y = parseInt(m1[3], 10);
            if (y < 100) y += 2000;
            const dt = new Date(y, m, d);
            dt.setHours(0, 0, 0, 0);
            return isNaN(dt.getTime()) ? null : dt;
        }
        const m2 = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
        if (m2) {
            const dt = new Date(parseInt(m2[1], 10), parseInt(m2[2], 10) - 1, parseInt(m2[3], 10));
            dt.setHours(0, 0, 0, 0);
            return isNaN(dt.getTime()) ? null : dt;
        }
        return null;
    }

    function formatDateDMY(dt) {
        if (!dt || isNaN(dt.getTime())) return '';
        const dd = String(dt.getDate()).padStart(2, '0');
        const mm = String(dt.getMonth() + 1).padStart(2, '0');
        const yyyy = dt.getFullYear();
        return dd + '/' + mm + '/' + yyyy;
    }

    function formatSpanishDayMonth(dt) {
        if (!dt || isNaN(dt.getTime())) return '';
        const dayNum = dt.getDate();
        const monthName = MONTHS_ES[dt.getMonth()] || '';
        return dayNum + ' de ' + monthName;
    }

    // Construye el mensaje limpio para LPPT cuando existen piezas disponibles (> 0); vacío si no hay piezas
    function formatLpptArrivalText(it, lpptQty) {
        const qty = Math.max(0, Number(lpptQty) || 0);
        if (qty <= 0) return '';

        let arrivalDate = null;
        const feRaw = cleanStr(it && it.fe);
        if (feRaw && feRaw !== 'Sin piezas solicitadas') {
            arrivalDate = parseSheetDate(feRaw);
        }
        if (!arrivalDate && it && it.lt !== '' && it.lt !== null && it.lt !== undefined) {
            const ltNum = Number(it.lt);
            if (!isNaN(ltNum) && isFinite(ltNum) && ltNum >= 0) {
                const d = new Date();
                d.setHours(0, 0, 0, 0);
                d.setDate(d.getDate() + Math.round(ltNum));
                arrivalDate = d;
            }
        }

        const dispWord = qty === 1 ? 'disponible' : 'disponibles';
        const dayMonth = arrivalDate ? formatSpanishDayMonth(arrivalDate) : '';
        if (dayMonth) {
            return 'LPPT ' + qty + ' ' + dispWord + ' llega disponible para entregar a partir del día ' + dayMonth;
        }
        return 'LPPT ' + qty + ' ' + dispWord;
    }

    function indexItemsAndGroups() {
        bySkuMap.clear();
        groupsByKey.clear();
        allGroups = [];

        for (let i = 0; i < allItems.length; i++) {
            const it = allItems[i];
            if (!Array.isArray(it.st)) it.st = emptyStocks();
            it.pr = formatPrice(it.pr);
            const skuKey = String(it.s || '').trim().toUpperCase();
            if (!skuKey) continue;

            const title = computeGroupTitle(it);
            const gKey = normalizePlain(title) || skuKey.toLowerCase();
            it._groupKey = gKey;
            it._groupTitle = title;

            const rawText = [
                it.s, title, it.n, it.vr, it.tp, it.mo, it.c,
                it.tl, it.ct, it.md, it.cm, it.mt, it.m, it.p, it.pr
            ].join(' ');
            it._plain = normalizePlain(rawText);
            it._search = normSearch(rawText);

            bySkuMap.set(skuKey, it);

            let grp = groupsByKey.get(gKey);
            if (!grp) {
                grp = {
                    key: gKey,
                    title: title,
                    tp: cleanStr(it.tp).toUpperCase(),
                    mo: cleanStr(it.mo).toUpperCase(),
                    items: [],
                    _plainParts: [],
                    _searchParts: []
                };
                groupsByKey.set(gKey, grp);
                allGroups.push(grp);
            }
            grp.items.push(it);
            grp._plainParts.push(it._plain);
            grp._searchParts.push(it._search);
        }

        for (let i = 0; i < allGroups.length; i++) {
            const grp = allGroups[i];
            grp._plain = grp._plainParts.join(' ');
            grp._search = grp._searchParts.join(' ');
            grp._words = Array.from(new Set(grp._search.split(/\s+/).filter(w => w.length >= 4)));
            grp._titleTokens = normSearch(grp.title).split(/\s+/).filter(Boolean);
            grp._modelTokens = grp.mo ? normSearch(grp.mo).split(/\s+/).filter(Boolean) : [];
            delete grp._plainParts;
            delete grp._searchParts;
        }
    }

    function loadCart() {
        try {
            const saved = JSON.parse(localStorage.getItem(CART_KEY) || '{}');
            return (saved && typeof saved === 'object') ? saved : {};
        } catch (e) {
            return {};
        }
    }

    function saveCart() {
        try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch (e) {}
        updateCartBadge();
    }

    function updateCartBadge() {
        const totalQty = Object.values(cart).reduce((acc, row) => acc + (Number(row.qty) || 0), 0);
        const el = document.getElementById('headerCartCount');
        if (el) el.textContent = String(totalQty);
    }

    // ------------------------------------------------------------------------
    // FILTRADO AGRUPADO POR MODELO + TOLERANCIA ORTOGRÁFICA + ESCÁNER SKU
    // ------------------------------------------------------------------------
    function applyFilter(query, preserveCount) {
        const rawTrim = String(query || '').trim();
        const clearBtn = document.getElementById('invClearBtn');
        if (clearBtn) clearBtn.style.display = rawTrim ? 'block' : 'none';

        if (!rawTrim) {
            filteredGroups = allGroups;
        } else {
            const exactSkuItem = bySkuMap.get(rawTrim.toUpperCase());
            if (exactSkuItem && groupsByKey.has(exactSkuItem._groupKey)) {
                filteredGroups = [groupsByKey.get(exactSkuItem._groupKey)];
            } else {
                const qNorm = normSearch(rawTrim);
                const qTokens = qNorm.split(/\s+/).filter(Boolean);

                let matches = allGroups.filter(grp => {
                    for (let i = 0; i < qTokens.length; i++) {
                        if (!tokenMatchesGroup(qTokens[i], grp)) return false;
                    }
                    return true;
                });

                if (matches.length === 0 && qTokens.length >= 2) {
                    matches = allGroups.filter(grp => {
                        if (!grp.mo || grp._titleTokens.length === 0) return false;
                        for (let t = 0; t < grp._titleTokens.length; t++) {
                            const gTok = grp._titleTokens[t];
                            const foundInQuery = qTokens.some(qt =>
                                qt === gTok ||
                                (qt.length >= 4 && gTok.length >= 4 && isOneEditOrTransposition(qt, gTok))
                            );
                            if (!foundInQuery) return false;
                        }
                        return true;
                    });
                }

                if (matches.length === 0 && qTokens.length >= 1) {
                    matches = allGroups.filter(grp => {
                        if (!grp.mo || grp._modelTokens.length === 0) return false;
                        const modLongEnough = grp._modelTokens.some(mt => mt.length >= 5);
                        if (!modLongEnough) return false;
                        return grp._modelTokens.every(mt =>
                            qTokens.some(qt => qt === mt || (qt.length >= 5 && isOneEditOrTransposition(qt, mt)))
                        );
                    });
                }

                filteredGroups = matches;
            }
        }

        const targetInitial = preserveCount ? Math.max(PAGE_SIZE, renderedCount) : PAGE_SIZE;
        renderedCount = 0;
        const container = document.getElementById('invListContainer');
        if (container) container.innerHTML = '';
        renderMoreItems(targetInitial);
    }

    window.renderMoreItems = function (batchSize) {
        const container = document.getElementById('invListContainer');
        const moreWrap = document.getElementById('invLoadMoreWrap');
        if (!container) return;

        if (filteredGroups.length === 0) {
            container.innerHTML = '';
            if (moreWrap) moreWrap.classList.add('hidden');
            return;
        }

        const step = (typeof batchSize === 'number' && batchSize > 0) ? batchSize : PAGE_SIZE;
        const nextEnd = Math.min(renderedCount + step, filteredGroups.length);
        const frag = document.createDocumentFragment();

        for (let i = renderedCount; i < nextEnd; i++) {
            const grp = filteredGroups[i];
            const row = document.createElement('div');
            row.className = 'inv-row';

            if (grp.items.length > 1) {
                // Listado limpio sin precio afuera (el precio se muestra adentro al abrir el inventario del producto)
                row.onclick = function () { openGroupModal(grp.key); };
                row.innerHTML =
                    '<div class="min-w-0 flex-1 pr-2">' +
                        '<div class="text-sm font-bold uppercase leading-snug" style="color:#252C32;">' + escapeHtml(grp.title) + '</div>' +
                    '</div>' +
                    '<svg class="w-4 h-4 shrink-0" style="color:#A38251;" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
                        '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M9 5l7 7-7 7"></path>' +
                    '</svg>';
            } else {
                const it = grp.items[0];
                const skuKey = String(it.s || '').toUpperCase();
                const inCartQty = cart[skuKey] ? cart[skuKey].qty : 0;
                row.onclick = function () { openProductDetail(it.s, false); };
                row.innerHTML =
                    '<div class="min-w-0 flex-1 pr-2">' +
                        '<div class="text-sm font-bold uppercase leading-snug" style="color:#252C32;">' + escapeHtml(grp.title || it.n || it.s) + '</div>' +
                        '<div class="text-xs font-semibold tracking-wider mt-0.5" style="color:#A38251;">' + escapeHtml(it.s) + '</div>' +
                    '</div>' +
                    '<button type="button" title="Agregar a Cotización" data-sku-btn="' + escapeHtml(skuKey) + '" class="cart-plus-btn ' + (inCartQty > 0 ? 'in-cart' : '') + '">' +
                        (inCartQty > 0 ? ('+' + inCartQty) : '+') +
                    '</button>';

                const btn = row.querySelector('button');
                btn.onclick = function (ev) {
                    ev.stopPropagation();
                    addToCart(it.s, 1);
                };
            }

            frag.appendChild(row);
        }

        container.appendChild(frag);
        renderedCount = nextEnd;

        if (moreWrap) {
            if (renderedCount < filteredGroups.length) moreWrap.classList.remove('hidden');
            else moreWrap.classList.add('hidden');
        }
    };

    window.clearInvSearch = function () {
        const inp = document.getElementById('invSearchInput');
        if (inp) {
            inp.value = '';
            inp.focus();
        }
        applyFilter('');
    };

    // ------------------------------------------------------------------------
    // PASO 1: MODAL DE VARIANTES DISPONIBLES DEL MODELO (ej. SILLON APIENZO)
    // ------------------------------------------------------------------------
    function renderGroupVariantsStep(grp) {
        currentGroup = grp;
        currentDetailItem = null;

        const crumbEl = document.getElementById('detGroupCrumb');
        const skuEl = document.getElementById('detSku');
        const nameEl = document.getElementById('detName');
        const priceWrapEl = document.getElementById('detPriceWrap');
        const priceEl = document.getElementById('detPrice');
        const addBtn = document.getElementById('detAddCartBtn');
        const varStep = document.getElementById('detVariantsStep');
        const singleStep = document.getElementById('detSingleStep');
        const varList = document.getElementById('detVariantsList');

        if (crumbEl) {
            crumbEl.textContent = '';
            crumbEl.classList.add('hidden');
        }
        if (skuEl) {
            skuEl.textContent = '';
            skuEl.classList.add('hidden');
        }
        if (nameEl) {
            nameEl.textContent = grp.title;
        }
        if (priceEl) priceEl.textContent = '';
        if (priceWrapEl) priceWrapEl.classList.add('hidden');
        if (addBtn) addBtn.classList.add('hidden');

        function normWordForVariant(w) {
            return String(w || '')
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .toUpperCase()
                .replace(/[^A-Z0-9]/g, '');
        }

        function buildVariantLabel(it, groupObj) {
            const rawName = cleanStr(it.n).toUpperCase();
            const vr = cleanStr(it.vr).toUpperCase();
            const titleWords = new Set(
                String(groupObj && groupObj.title ? groupObj.title : '')
                    .toUpperCase()
                    .split(/\s+/)
                    .map(normWordForVariant)
                    .filter(Boolean)
            );

            const tokens = rawName.split(/\s+/).filter(Boolean);
            const rem = [];
            for (let i = 0; i < tokens.length; i++) {
                const nw = normWordForVariant(tokens[i]);
                if (!nw) continue;
                if ((nw === 'DE' || nw === 'DEL') && i + 1 < tokens.length && titleWords.has(normWordForVariant(tokens[i + 1]))) {
                    continue;
                }
                if (titleWords.has(nw)) continue;
                rem.push(tokens[i]);
            }
            while (rem.length > 0 && /^(DE|DEL|LA|EL|LOS|LAS|PARA|-|\/|·)$/.test(normWordForVariant(rem[0]))) rem.shift();
            while (rem.length > 0 && /^(DE|DEL|LA|EL|LOS|LAS|PARA|-|\/|·)$/.test(normWordForVariant(rem[rem.length - 1]))) rem.pop();

            let label = rem.join(' ').replace(/\s+/g, ' ').trim();
            if (!label || normWordForVariant(label) === normWordForVariant(it.s)) {
                label = vr || cleanStr(it.m).toUpperCase() || cleanStr(it.tl).toUpperCase() || cleanStr(it.md).toUpperCase() || rawName || it.s;
            }
            return label;
        }

        if (varList) {
            const baseLabels = grp.items.map(it => buildVariantLabel(it, grp));
            const labelCounts = new Map();
            for (let i = 0; i < baseLabels.length; i++) {
                labelCounts.set(baseLabels[i], (labelCounts.get(baseLabels[i]) || 0) + 1);
            }

            varList.innerHTML = grp.items.map((it, idx) => {
                const skuKey = String(it.s || '').toUpperCase();
                const inCartQty = cart[skuKey] ? cart[skuKey].qty : 0;
                let varLabel = baseLabels[idx];
                const medUpper = cleanStr(it.m).toUpperCase();
                if (medUpper && labelCounts.get(varLabel) > 1 && varLabel.indexOf(medUpper) === -1) {
                    varLabel = varLabel + ' · ' + medUpper;
                }
                return '<div class="inv-row" data-var-sku="' + escapeHtml(skuKey) + '">' +
                    '<div class="min-w-0 flex-1 pr-2">' +
                        '<div class="text-sm font-bold uppercase leading-snug" style="color:#252C32;">' +
                            formatTitleWithPriceHtml(varLabel, it.pr) +
                        '</div>' +
                        '<div class="text-xs font-semibold tracking-wider mt-0.5" style="color:#A38251;">' + escapeHtml(it.s) + '</div>' +
                    '</div>' +
                    '<button type="button" title="Agregar a Cotización" data-sku-btn="' + escapeHtml(skuKey) + '" class="cart-plus-btn ' + (inCartQty > 0 ? 'in-cart' : '') + '">' +
                        (inCartQty > 0 ? ('+' + inCartQty) : '+') +
                    '</button>' +
                '</div>';
            }).join('');

            varList.querySelectorAll('.inv-row[data-var-sku]').forEach(rowEl => {
                const sku = rowEl.getAttribute('data-var-sku');
                rowEl.onclick = function () {
                    openProductDetail(sku, true);
                };
                const btn = rowEl.querySelector('button');
                if (btn) {
                    btn.onclick = function (ev) {
                        ev.stopPropagation();
                        addToCart(sku, 1);
                    };
                }
            });
        }

        if (varStep) varStep.classList.remove('hidden');
        if (singleStep) singleStep.classList.add('hidden');
    }

    window.openGroupModal = function (groupKey) {
        const grp = groupsByKey.get(groupKey);
        if (!grp) return false;
        if (grp.items.length === 1) {
            return openProductDetail(grp.items[0].s, false);
        }

        renderGroupVariantsStep(grp);

        const modal = document.getElementById('productDetailModal');
        if (modal) modal.classList.add('open');
        refreshLiveSheetNow();
        return true;
    };

    window.backToCurrentGroupVariants = function () {
        if (currentGroup && currentGroup.items.length > 1) {
            openGroupModal(currentGroup.key);
        }
    };

    // ------------------------------------------------------------------------
    // PASO 2: DETALLE DE VARIANTE SELECCIONADA O ESCANEADA DIRECTO POR SKU
    // ------------------------------------------------------------------------
    window.openProductDetail = function (skuRaw, fromGroupList) {
        const key = String(skuRaw || '').trim().toUpperCase();
        const it = bySkuMap.get(key);
        if (!it) return false;

        currentDetailItem = it;
        if (!fromGroupList) {
            const grp = groupsByKey.get(it._groupKey);
            currentGroup = (grp && grp.items.length > 1) ? grp : null;
        }

        renderDetailModal(it, !!fromGroupList);

        const varStep = document.getElementById('detVariantsStep');
        const singleStep = document.getElementById('detSingleStep');
        if (varStep) varStep.classList.add('hidden');
        if (singleStep) singleStep.classList.remove('hidden');

        const modal = document.getElementById('productDetailModal');
        if (modal) modal.classList.add('open');
        refreshLiveSheetNow();
        return true;
    };

    window.closeProductDetail = function () {
        const modal = document.getElementById('productDetailModal');
        if (modal) modal.classList.remove('open');
        currentDetailItem = null;
        currentGroup = null;
    };

    function renderDetailModal(it, showGroupBack) {
        const crumbEl = document.getElementById('detGroupCrumb');
        const skuEl = document.getElementById('detSku');
        const nameEl = document.getElementById('detName');
        const priceWrapEl = document.getElementById('detPriceWrap');
        const priceEl = document.getElementById('detPrice');
        const addBtn = document.getElementById('detAddCartBtn');

        if (crumbEl) {
            if (showGroupBack && currentGroup && currentGroup.items.length > 1) {
                crumbEl.textContent = '← ' + currentGroup.title;
                crumbEl.classList.remove('hidden');
            } else {
                crumbEl.textContent = '';
                crumbEl.classList.add('hidden');
            }
        }

        if (skuEl) {
            skuEl.textContent = it.s || '';
            skuEl.classList.toggle('hidden', !it.s);
        }

        const baseTitle = cleanStr(it.n) || cleanStr(it._groupTitle) || it.s || '';
        const formattedPrice = formatPrice(it.pr);
        if (nameEl) {
            nameEl.textContent = baseTitle;
        }
        // Precio adentro del recuadro de inventario (junto a Stock Total)
        if (priceEl && priceWrapEl) {
            if (formattedPrice) {
                priceEl.textContent = formattedPrice;
                priceWrapEl.classList.remove('hidden');
            } else {
                priceEl.textContent = '';
                priceWrapEl.classList.add('hidden');
            }
        }

        if (addBtn) {
            addBtn.classList.remove('hidden');
            const key = String(it.s || '').toUpperCase();
            const q = cart[key] ? cart[key].qty : 0;
            addBtn.textContent = q > 0 ? ('+ Cotización (' + q + ')') : '+ Cotización';
        }

        // Cuadro de 1 sola foto
        const driveId = extractDriveFileId(it.f);
        const photoUrl = resolveDriveOrImgUrl(it.f);
        const imgEl = document.getElementById('detPhotoImg');
        const emptyEl = document.getElementById('detPhotoEmpty');
        if (photoUrl) {
            imgEl.dataset.fallbackTried = '';
            imgEl.src = photoUrl;
            imgEl.classList.remove('hidden');
            emptyEl.classList.add('hidden');
            imgEl.onerror = function () {
                if (driveId && !imgEl.dataset.fallbackTried) {
                    imgEl.dataset.fallbackTried = '1';
                    imgEl.src = 'https://drive.google.com/thumbnail?id=' + driveId + '&sz=w1000';
                    return;
                }
                imgEl.classList.add('hidden');
                emptyEl.classList.remove('hidden');
            };
        } else {
            imgEl.dataset.fallbackTried = '';
            imgEl.src = '';
            imgEl.classList.add('hidden');
            emptyEl.classList.remove('hidden');
        }

        // Stock Total (solo las 10 ubicaciones físicas Bodega/Piso) y Semáforo + LPPT
        const stocks = Array.isArray(it.st) ? it.st : emptyStocks();
        let totalBodegaPiso = 0;
        const whHtml = [];

        for (let i = 0; i < WAREHOUSES.length; i++) {
            const whName = WAREHOUSES[i];
            const isLppt = isLpptWarehouse(whName);
            const qty = Math.max(0, Number(stocks[i]) || 0);
            if (!isLppt) {
                totalBodegaPiso += qty;
            }

            let semClass = 'sem-green';
            let dotColor = '#10B981';
            if (qty <= 0) {
                semClass = 'sem-red';
                dotColor = '#EF4444';
            } else if (qty <= DEFAULT_MIN_STOCK) {
                semClass = 'sem-yellow';
                dotColor = '#F59E0B';
            }

            const spanClass = (i === 0 && WAREHOUSES.length % 2 === 1 && isLppt)
                ? ' sm:col-span-2'
                : '';

            if (isLppt) {
                // Si no hay piezas en LPPT (qty <= 0), no colocar nada de LPPT
                if (qty > 0) {
                    const lpptMsg = formatLpptArrivalText(it, qty);
                    whHtml.push(
                        '<div class="rounded-xl border px-3.5 py-3 flex items-center justify-between gap-3 ' + semClass + spanClass + '">' +
                            '<div class="flex items-center gap-2 min-w-0 pr-2">' +
                                '<span class="w-2.5 h-2.5 rounded-full inline-block shrink-0" style="background:' + dotColor + ';"></span>' +
                                '<span class="text-xs font-extrabold leading-snug">' + escapeHtml(lpptMsg) + '</span>' +
                            '</div>' +
                            '<span class="text-lg font-black shrink-0">' + qty + '</span>' +
                        '</div>'
                    );
                }
            } else {
                whHtml.push(
                    '<div class="rounded-xl border px-3.5 py-3 flex items-center justify-between ' + semClass + spanClass + '">' +
                        '<div class="flex items-center gap-2 min-w-0 pr-2">' +
                            '<span class="w-2.5 h-2.5 rounded-full inline-block shrink-0" style="background:' + dotColor + ';"></span>' +
                            '<span class="text-xs font-extrabold uppercase tracking-wide truncate">' + escapeHtml(whName) + '</span>' +
                        '</div>' +
                        '<span class="text-lg font-black shrink-0">' + qty + '</span>' +
                    '</div>'
                );
            }
        }

        document.getElementById('detTotalStock').textContent = String(totalBodegaPiso);
        document.getElementById('detWarehousesGrid').innerHTML = whHtml.join('');

        // Sin cuadros inferiores de Proveedor / Tiempo de entrega (BORRAR.png)
        const specsWrap = document.getElementById('detSpecsWrap');
        const specsGrid = document.getElementById('detSpecsGrid');
        if (specsGrid) specsGrid.innerHTML = '';
        if (specsWrap) specsWrap.classList.add('hidden');
    }

    // ------------------------------------------------------------------------
    // USUARIOS POR UBICACIÓN, CONTRASEÑA TEMPORAL Y PLANTILLA S MUEBLERÍA
    // ------------------------------------------------------------------------
    const AUTH_SESSION_KEY = 'creata_inv_advisor_session_v1';
    const PENDING_KEYS_STORAGE = 'creata_inv_updated_keys_v1';
    const QUOTE_META_STORAGE = 'creata_inv_quote_draft_meta_v1';

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
            label: 'Administración / Todas',
            erpStore: 'CEDIS',
            orderPrefix: 'ADM',
            quoteType: 'ADMINISTRATIVO',
            isProyecto: false,
            serieLabel: 'SERIE ADM · ADMINISTRACIÓN'
        }
    ];

    const DEFAULT_ERP_STORES = [
        'CREATA PUERTO CANCUN',
        'CASA CREATA BONAMPAK',
        'CREATA LIVING COLOSIO',
        'CREATA LIVING PLAYA',
        'OUTLET COLOSIO',
        'PROYECTOS ANIPA INTERIOR',
        'CEDIS'
    ];

    function findBranchConfig(tabOrKey, erpStoreHint) {
        const up = String(tabOrKey || '').trim().toUpperCase();
        const storeUp = String(erpStoreHint || '').trim().toUpperCase();
        for (let i = 0; i < USER_BRANCH_TABS.length; i++) {
            const cfg = USER_BRANCH_TABS[i];
            if (cfg.tab.toUpperCase() === up || cfg.branchKey.toUpperCase() === up) return cfg;
            if (up === 'COLOSIO' && cfg.tab === 'COLOCIO') return cfg;
        }
        if (storeUp) {
            for (let j = 0; j < USER_BRANCH_TABS.length; j++) {
                if (USER_BRANCH_TABS[j].erpStore.toUpperCase() === storeUp) return USER_BRANCH_TABS[j];
            }
        }
        return null;
    }

    function enrichAdvisorLocation(u) {
        if (!u || typeof u !== 'object') return u;
        const cfg = findBranchConfig(u.sheetTab || u.branchKey, u.erpStore);
        const isProy = cfg ? !!cfg.isProyecto : (!!u.isProyecto || String(u.branchKey || u.sheetTab || '').toUpperCase() === 'PROYECTOS');
        return Object.assign({}, u, {
            branchKey: u.branchKey || (cfg ? cfg.branchKey : ''),
            branchLabel: u.branchLabel || (cfg ? cfg.label : (u.sheetTab || '')),
            erpStore: (cfg ? cfg.erpStore : u.erpStore) || 'CREATA PUERTO CANCUN',
            orderPrefix: u.orderPrefix || (cfg ? cfg.orderPrefix : (isProy ? 'PRO' : 'COT')),
            quoteType: u.quoteType || (cfg ? cfg.quoteType : (isProy ? 'PROYECTO' : 'SUCURSAL')),
            isProyecto: isProy,
            serieLabel: u.serieLabel || (cfg ? cfg.serieLabel : '')
        });
    }

    let erpStoresCatalog = DEFAULT_ERP_STORES.slice();
    let erpAdvisorsCatalog = [];
    let activeAdvisorSession = loadAdvisorSession();
    let pendingAuthContext = null; // { email, inputKey, locations, switchingFromActive }
    let quoteDraftMeta = loadQuoteDraftMeta();
    let quoteSubmitInFlight = false;
    let currentNextOrderCode = '';
    let myRecentQuotesList = [];
    let lastSubmittedQuoteMeta = null;
    let pendingQuoteRetrySendToErp = null;

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
            localStorage.setItem(PENDING_KEYS_STORAGE, JSON.stringify(mapObj || {}));
        } catch (e) {}
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

    function loadQuoteDraftMeta() {
        const fallback = {
            erpStore: '',
            erpAdvisorLabel: '',
            clientMode: 'PROSPECTO PROVISIONAL (SOLO NOMBRE - MODIFICABLE AL CERRAR)',
            categoryLabel: 'COTIZACIONES [ID: 2]',
            clientName: '',
            clientPhone: '',
            deliveryDateIso: getDefaultDeliveryIsoDate(),
            notes: '',
            extraDiscount: 0
        };
        try {
            const saved = JSON.parse(localStorage.getItem(QUOTE_META_STORAGE) || 'null');
            if (saved && typeof saved === 'object') {
                return Object.assign(fallback, saved, {
                    deliveryDateIso: saved.deliveryDateIso || getDefaultDeliveryIsoDate()
                });
            }
        } catch (e) {}
        return fallback;
    }

    window.saveQuoteDraftMeta = function () {
        const modeEl = document.getElementById('quoteClientModeSelect');
        const catEl = document.getElementById('quoteCategorySelect');
        const nameEl = document.getElementById('quoteClientNameInput');
        const phoneEl = document.getElementById('quoteClientPhoneInput');
        const dateEl = document.getElementById('quoteDeliveryDateInput');
        const notesEl = document.getElementById('quoteNotesInput');
        const extraEl = document.getElementById('quoteExtraDiscountInput');

        // Sucursal/Proyecto y Usuario ERP siempre quedan bloqueados exclusivamente al correo en sesión
        if (activeAdvisorSession) {
            quoteDraftMeta.erpStore = activeAdvisorSession.erpStore || '';
            quoteDraftMeta.erpAdvisorLabel = activeAdvisorSession.erpAdvisorLabel || '';
        }
        if (modeEl) quoteDraftMeta.clientMode = modeEl.value;
        if (catEl) quoteDraftMeta.categoryLabel = catEl.value;
        if (nameEl) quoteDraftMeta.clientName = nameEl.value;
        if (phoneEl) quoteDraftMeta.clientPhone = phoneEl.value;
        if (dateEl && dateEl.value) quoteDraftMeta.deliveryDateIso = dateEl.value;
        if (notesEl) quoteDraftMeta.notes = notesEl.value;
        if (extraEl) quoteDraftMeta.extraDiscount = Math.max(0, Number(extraEl.value) || 0);

        try {
            localStorage.setItem(QUOTE_META_STORAGE, JSON.stringify(quoteDraftMeta));
        } catch (e) {}
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
        const m = String(label || '').match(/\[ID:\s*(\d+)\]/i);
        return m ? m[1] : '';
    }

    async function callInvWebAppPost(action, payloadObj, timeoutMs) {
        const apiUrl = (window.CREATA_CLOUD_CONFIG && window.CREATA_CLOUD_CONFIG.getApiUrl)
            ? window.CREATA_CLOUD_CONFIG.getApiUrl()
            : '';
        if (!apiUrl) return { ok: false, unavailable: true };
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = controller ? setTimeout(() => controller.abort(), timeoutMs || 12000) : null;
        try {
            const body = Object.assign({}, payloadObj || {}, { action: action });
            const resp = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(body),
                signal: controller ? controller.signal : undefined
            });
            if (!resp.ok) return { ok: false, unavailable: true, httpStatus: resp.status };
            const json = await resp.json();
            if (json && !json.ok && /PIN de administrador|Acci[óo]n no reconocida/i.test(String(json.error || ''))) {
                return { ok: false, needsRedeploy: true, error: json.error };
            }
            return json || { ok: false, unavailable: true };
        } catch (err) {
            return { ok: false, unavailable: true, error: err && err.message ? err.message : String(err) };
        } finally {
            if (timer) clearTimeout(timer);
        }
    }

    async function fetchSheetCsvRows(sheetName, extraParams) {
        if (!META.sheetId) return null;
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

    async function loadErpCatalogLiveFromSheet() {
        const rows = await fetchSheetCsvRows('plantilla', 'range=AA2:AD200');
        if (!rows || !rows.length) return;
        const stores = [];
        const advisors = [];
        for (let i = 0; i < rows.length; i++) {
            const r = rows[i] || [];
            const st = cleanStr(r[0]);
            if (st && stores.indexOf(st) === -1) stores.push(st);
            const label = cleanStr(r[1]);
            const branch = cleanStr(r[2]);
            const idVal = cleanKeyCellValue(r[3]) || extractErpIdFromLabel(label);
            if (label && label.toUpperCase() !== 'ASESOR_ERP_ETIQUETA') {
                advisors.push({
                    label: label,
                    branch: branch,
                    id: idVal,
                    tokens: normAdvisorTokens(label.split('|')[0])
                });
            }
        }
        if (stores.length > 0) erpStoresCatalog = stores;
        if (advisors.length > 0) erpAdvisorsCatalog = advisors;
    }

    async function fetchAllAdvisorRowsLiveGviz() {
        await loadErpCatalogLiveFromSheet();
        const localKeyUpdates = loadUpdatedKeysMap();
        const results = await Promise.all(USER_BRANCH_TABS.map(async (cfg) => {
            const rows = await fetchSheetCsvRows(cfg.tab);
            if (!rows || rows.length < 3) return [];
            const tabUsers = [];
            for (let i = 2; i < rows.length; i++) {
                const r = rows[i] || [];
                const nombre = cleanStr(r[2]);
                const puesto = cleanStr(r[3]);
                const correo = cleanStr(r[4]).toLowerCase();
                if (!correo || correo.indexOf('@') === -1) continue;
                let tempKey = cleanKeyCellValue(r[5]);
                let defKey = cleanKeyCellValue(r[6]);

                // Si la hoja ya tiene clave definitiva en Col G, limpiar caché pendiente local
                const localUpd = localKeyUpdates[correo];
                if (defKey && localUpd && keysMatchNormalized(defKey, localUpd.newKey)) {
                    delete localKeyUpdates[correo];
                    saveUpdatedKeysMap(localKeyUpdates);
                } else if (!defKey && localUpd && localUpd.newKey) {
                    defKey = localUpd.newKey;
                    tempKey = '';
                }

                const matchedErp = matchBestErpAdvisorClient(nombre, cfg.erpStore, erpAdvisorsCatalog);
                tabUsers.push({
                    sheetTab: cfg.tab,
                    rowNum: i + 1,
                    branchKey: cfg.branchKey,
                    branchLabel: cfg.label,
                    erpStore: cfg.erpStore,
                    orderPrefix: cfg.orderPrefix,
                    quoteType: cfg.quoteType,
                    isProyecto: !!cfg.isProyecto,
                    serieLabel: cfg.serieLabel,
                    nombre: nombre,
                    puesto: puesto,
                    correo: correo,
                    tempKey: tempKey,
                    defKey: defKey,
                    mustChangeKey: !defKey && !!tempKey,
                    erpAdvisorLabel: matchedErp ? matchedErp.label : '',
                    erpAdvisorId: matchedErp ? matchedErp.id : '',
                    erpAdvisorBranch: matchedErp ? matchedErp.branch : ''
                });
            }
            return tabUsers;
        }));
        return results.flat();
    }

    async function syncPendingKeyUpdatesToCloud() {
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
        el.className = 'rounded-xl border px-3.5 py-2.5 text-xs font-bold ' +
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

        if (!bar) return;
        if (!activeAdvisorSession || activeAdvisorSession.mustChangeKey) {
            bar.classList.add('hidden');
            return;
        }

        if (nameEl) nameEl.textContent = activeAdvisorSession.nombre || activeAdvisorSession.correo;
        if (branchEl) {
            const prefix = activeAdvisorSession.orderPrefix || 'COT';
            if (activeAdvisorSession.isProyecto) {
                branchEl.textContent = 'PROYECTO · SERIE ' + prefix;
            } else {
                branchEl.textContent = (activeAdvisorSession.branchLabel || activeAdvisorSession.sheetTab || '') + ' · SERIE ' + prefix;
            }
        }
        if (erpEl) {
            if (activeAdvisorSession.erpAdvisorId) {
                erpEl.textContent = 'Usuario S Mueblería #' + activeAdvisorSession.erpAdvisorId;
                erpEl.classList.remove('hidden');
            } else {
                erpEl.textContent = '';
                erpEl.classList.add('hidden');
            }
        }
        const multiLocs = Array.isArray(activeAdvisorSession.allLocations) ? activeAdvisorSession.allLocations : [];
        if (switchBtn) {
            switchBtn.classList.toggle('hidden', multiLocs.length <= 1);
        }
        bar.classList.remove('hidden');
    }

    function applyAdvisorDefaultsToQuoteForm(forceOverwriteStoreAndUser) {
        if (!activeAdvisorSession) return;
        // Sucursal/Proyecto y Asesor S Mueblería siempre se bloquean al titular del correo autenticado
        quoteDraftMeta.erpStore = activeAdvisorSession.erpStore || 'CREATA PUERTO CANCUN';
        quoteDraftMeta.erpAdvisorLabel = activeAdvisorSession.erpAdvisorLabel || '';
        try {
            localStorage.setItem(QUOTE_META_STORAGE, JSON.stringify(quoteDraftMeta));
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
        refreshMyLiveQuotesInfo();
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
        if (modal) modal.classList.add('open');
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
            const modeTag = loc.isProyecto ? ('PROYECTO · SERIE ' + (loc.orderPrefix || 'PRO')) : ('SERIE ' + (loc.orderPrefix || 'COT'));
            return '<button type="button" data-branch-idx="' + idx + '" ' +
                'class="w-full text-left rounded-xl border p-3.5 transition flex items-center justify-between gap-3 hover:shadow-sm" ' +
                'style="border-color:' + (isCurrent ? '#A38251' : '#E1DBC5') + '; background:' + (isCurrent ? '#FAF9F6' : '#FFFFFF') + ';">' +
                '<div class="min-w-0">' +
                    '<div class="flex flex-wrap items-center gap-1.5">' +
                        '<span class="text-xs font-extrabold uppercase tracking-wider" style="color:#252C32;">' + escapeHtml(loc.branchLabel || loc.sheetTab) + '</span>' +
                        '<span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase" style="background:' + (loc.isProyecto ? '#252C32' : '#E1DBC5') + '; color:' + (loc.isProyecto ? '#FFFFFF' : '#252C32') + ';">' + escapeHtml(modeTag) + '</span>' +
                    '</div>' +
                    '<div class="text-[11px] font-semibold mt-0.5" style="color:#A38251;">' +
                        escapeHtml((loc.puesto ? (loc.puesto + ' · ') : '') + (loc.erpStore || '')) +
                    '</div>' +
                '</div>' +
                '<span class="px-2.5 py-1 rounded-full text-[11px] font-extrabold uppercase shrink-0" style="background:#A38251; color:#FFFFFF;">Elegir</span>' +
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

    function finalizeLocationChoice(chosenLoc, allLocs, nextOrderFromLogin) {
        const enrichedChosen = enrichAdvisorLocation(chosenLoc);
        const cleanAll = (allLocs || [enrichedChosen]).map(rawU => {
            const u = enrichAdvisorLocation(rawU);
            return {
                sheetTab: u.sheetTab,
                rowNum: u.rowNum,
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
                authToken: u.authToken || ''
            };
        });

        const sessionObj = {
            sheetTab: enrichedChosen.sheetTab,
            rowNum: enrichedChosen.rowNum,
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
            allLocations: cleanAll
        };

        lastSubmittedQuoteMeta = null;
        currentNextOrderCode = cleanStr(nextOrderFromLogin) || ((sessionObj.orderPrefix || 'COT') + '-0001');
        saveAdvisorSession(sessionObj);
        applyAdvisorDefaultsToQuoteForm(true);

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
        refreshMyLiveQuotesInfo();

        if (pendingQuoteRetrySendToErp !== null) {
            const retrySendFlag = pendingQuoteRetrySendToErp;
            pendingQuoteRetrySendToErp = null;
            submitQuoteToSystem(retrySendFlag);
            return;
        }

        const cartModalEl = document.getElementById('cartModal');
        if (!cartModalEl || !cartModalEl.classList.contains('open')) {
            const searchInp = document.getElementById('invSearchInput');
            if (searchInp) setTimeout(() => searchInp.focus(), 60);
        }
    }

    window.submitAdvisorLogin = async function (ev) {
        if (ev && ev.preventDefault) ev.preventDefault();
        const emailEl = document.getElementById('authEmailInput');
        const keyEl = document.getElementById('authKeyInput');
        const btnEl = document.getElementById('authLoginSubmitBtn');

        const email = cleanStr(emailEl ? emailEl.value : '').toLowerCase();
        const inputKey = cleanStr(keyEl ? keyEl.value : '');
        if (!email || !inputKey) {
            showAuthBanner('authLoginMsg', 'Ingresa tu correo electrónico y tu contraseña.', 'err');
            return;
        }

        const preferredTab = (pendingQuoteRetrySendToErp !== null && activeAdvisorSession && activeAdvisorSession.correo === email)
            ? (activeAdvisorSession.sheetTab || '')
            : '';

        if (btnEl) {
            btnEl.disabled = true;
            btnEl.textContent = 'Verificando cuenta...';
        }
        showAuthBanner('authLoginMsg', '', 'err');

        try {
            // 1) Validación directa y emisión de token firmado vía Apps Script WebApp
            const cloudRes = await callInvWebAppPost('inv_login', {
                email: email,
                accessKey: inputKey,
                sheetTab: preferredTab
            }, 10000);

            if (cloudRes && cloudRes.ok) {
                if (Array.isArray(cloudRes.stores) && cloudRes.stores.length > 0) {
                    erpStoresCatalog = cloudRes.stores;
                }
                if (Array.isArray(cloudRes.advisors) && cloudRes.advisors.length > 0) {
                    erpAdvisorsCatalog = cloudRes.advisors.map(a => ({
                        label: a.label,
                        branch: a.branch,
                        id: a.id || extractErpIdFromLabel(a.label),
                        tokens: normAdvisorTokens((a.label || '').split('|')[0])
                    }));
                }

                if (cloudRes.chooseBranch && Array.isArray(cloudRes.locations) && cloudRes.locations.length > 1) {
                    pendingAuthContext = {
                        email: email,
                        inputKey: inputKey,
                        locations: cloudRes.locations,
                        switchingFromActive: false
                    };
                    renderBranchChoicesStep(
                        cloudRes.locations,
                        'Hola ' + (cloudRes.locations[0].nombre || '') + '. Tu correo está registrado en varias hojas; selecciona en cuál ubicación estarás:'
                    );
                    return;
                }

                if (cloudRes.user) {
                    pendingAuthContext = {
                        email: email,
                        inputKey: inputKey,
                        locations: cloudRes.allLocationsForEmail || [cloudRes.user],
                        switchingFromActive: false
                    };
                    finalizeLocationChoice(
                        cloudRes.user,
                        cloudRes.allLocationsForEmail || [cloudRes.user],
                        cloudRes.nextOrderCode || ''
                    );
                    return;
                }
            } else if (cloudRes && !cloudRes.unavailable && !cloudRes.needsRedeploy && cloudRes.error) {
                showAuthBanner('authLoginMsg', cloudRes.error, 'err');
                return;
            }

            // 2) Respaldo de lectura directa en vivo desde las hojas PLAYA, COLOCIO, PTC, CASA CREATA, PROYECTOS y plantilla
            const allUsers = await fetchAllAdvisorRowsLiveGviz();
            if (!allUsers.length) {
                showAuthBanner('authLoginMsg', 'No fue posible consultar las hojas de usuarios. Verifica tu conexión a internet.', 'err');
                return;
            }

            const emailMatches = allUsers.filter(u => u.correo === email);
            if (!emailMatches.length) {
                showAuthBanner('authLoginMsg', 'El correo ingresado no aparece registrado en ninguna hoja de sucursal.', 'err');
                return;
            }

            const validMatches = emailMatches.filter(u => {
                if (u.defKey) return keysMatchNormalized(inputKey, u.defKey);
                if (u.tempKey) return keysMatchNormalized(inputKey, u.tempKey);
                return false;
            });

            if (!validMatches.length) {
                showAuthBanner('authLoginMsg', 'Contraseña incorrecta. Verifica tu contraseña temporal o personal.', 'err');
                return;
            }

            const preparedLocs = validMatches.map(u => {
                const usedTemp = !u.defKey && !!u.tempKey && keysMatchNormalized(inputKey, u.tempKey);
                return Object.assign({}, u, { mustChangeKey: usedTemp });
            });

            pendingAuthContext = {
                email: email,
                inputKey: inputKey,
                locations: preparedLocs,
                switchingFromActive: false
            };

            if (preparedLocs.length > 1 && !preferredTab) {
                renderBranchChoicesStep(
                    preparedLocs,
                    'Hola ' + (preparedLocs[0].nombre || '') + '. Tu correo aparece en varias hojas; selecciona en cuál ubicación estarás:'
                );
            } else {
                const picked = preferredTab
                    ? (preparedLocs.find(u => u.sheetTab === preferredTab) || preparedLocs[0])
                    : preparedLocs[0];
                finalizeLocationChoice(picked, preparedLocs, '');
            }
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
        pendingAuthContext = {
            email: activeAdvisorSession.correo,
            inputKey: '',
            locations: activeAdvisorSession.allLocations,
            switchingFromActive: true
        };
        renderBranchChoicesStep(
            activeAdvisorSession.allLocations,
            'Selecciona la ubicación autorizada de tu correo en la que emitirás tus cotizaciones:'
        );
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

        if (newKey.length < 4) {
            showAuthBanner('authNewKeyMsg', 'La nueva contraseña debe tener mínimo 4 caracteres.', 'err');
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
            const res = await callInvWebAppPost('inv_update_key', {
                email: activeAdvisorSession.correo,
                currentKey: prevTempKey,
                newKey: newKey,
                sheetTab: activeAdvisorSession.sheetTab || '',
                authToken: activeAdvisorSession.authToken || ''
            }, 12000);

            if (res && res.ok) {
                if (res.authToken) {
                    activeAdvisorSession.authToken = res.authToken;
                }
                if (res.tokensByTab && Array.isArray(activeAdvisorSession.allLocations)) {
                    activeAdvisorSession.allLocations = activeAdvisorSession.allLocations.map(l =>
                        Object.assign({}, l, {
                            mustChangeKey: false,
                            authToken: res.tokensByTab[l.sheetTab] || l.authToken || res.authToken || ''
                        })
                    );
                }
            } else {
                // Guardar actualización pendiente para sincronizar apenas responda el WebApp y reemplazar la temporal de inmediato
                const mapObj = loadUpdatedKeysMap();
                mapObj[activeAdvisorSession.correo] = {
                    prevKey: prevTempKey,
                    newKey: newKey,
                    updatedAt: new Date().toISOString()
                };
                saveUpdatedKeysMap(mapObj);
            }

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
            populateQuoteAdvisorControls();
            refreshMyLiveQuotesInfo();

            if (pendingQuoteRetrySendToErp !== null) {
                const retrySendFlag = pendingQuoteRetrySendToErp;
                pendingQuoteRetrySendToErp = null;
                submitQuoteToSystem(retrySendFlag);
                return;
            }

            const searchInp = document.getElementById('invSearchInput');
            if (searchInp) setTimeout(() => searchInp.focus(), 60);
        } finally {
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.textContent = 'Guardar nueva contraseña y continuar';
            }
        }
    };

    window.logoutAdvisorSession = function () {
        saveAdvisorSession(null);
        pendingAuthContext = null;
        pendingQuoteRetrySendToErp = null;
        currentNextOrderCode = '';
        myRecentQuotesList = [];
        lastSubmittedQuoteMeta = null;
        renderAdvisorHeaderBar();
        renderMyRecentQuotes([]);
        const keyInp = document.getElementById('authKeyInput');
        if (keyInp) keyInp.value = '';
        closeCartModal();
        openAuthModalForStartup();
    };

    // ------------------------------------------------------------------------
    // PLANTILLA DE COTIZACIÓN · BLOQUEADA AL CORREO Y EN VIVO CON S MUEBLERÍA
    // ------------------------------------------------------------------------
    function renderMyRecentQuotes(list) {
        const wrap = document.getElementById('quoteMyRecentWrap');
        const listEl = document.getElementById('quoteMyRecentList');
        if (!wrap || !listEl) return;

        if (!Array.isArray(list) || !list.length || !activeAdvisorSession) {
            listEl.innerHTML = '';
            wrap.classList.add('hidden');
            return;
        }

        listEl.innerHTML = list.map(q => {
            const isProy = String(q.quoteType || '').toUpperCase() === 'PROYECTO';
            const folioTxt = cleanStr(q.folio) || (q.quoteId ? ('ID-' + q.quoteId) : 'En proceso');
            return '<div class="rounded-lg border px-3 py-2 flex flex-wrap items-center justify-between gap-2 bg-white" style="border-color:#E1DBC5;">' +
                '<div class="min-w-0">' +
                    '<div class="flex flex-wrap items-center gap-1.5">' +
                        '<span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase" style="background:' + (isProy ? '#252C32' : '#A38251') + '; color:#FFFFFF;">' +
                            escapeHtml(q.orderCode || (isProy ? 'PRO' : 'COT')) +
                        '</span>' +
                        '<span class="text-xs font-extrabold uppercase" style="color:#252C32;">Folio S Mueblería: ' + escapeHtml(folioTxt) + '</span>' +
                        (q.quoteId ? ('<span class="text-[10px] font-bold opacity-70" style="color:#252C32;">(ID ' + escapeHtml(q.quoteId) + ')</span>') : '') +
                    '</div>' +
                    '<div class="text-[11px] font-semibold truncate mt-0.5" style="color:#252C32;">' +
                        escapeHtml(q.clientName || 'Prospecto') +
                        (q.skusSummary ? (' · ' + escapeHtml(q.skusSummary)) : '') +
                    '</div>' +
                '</div>' +
                '<div class="text-right shrink-0 ml-auto">' +
                    '<div class="text-xs font-black" style="color:#A38251;">' + escapeHtml(q.total || '') + '</div>' +
                    '<div class="text-[10px] font-semibold opacity-70" style="color:#252C32;">' + escapeHtml(q.createdAt || '') + '</div>' +
                '</div>' +
            '</div>';
        }).join('');
        wrap.classList.remove('hidden');
    }

    async function refreshMyLiveQuotesInfo() {
        if (!activeAdvisorSession || activeAdvisorSession.mustChangeKey) {
            renderMyRecentQuotes([]);
            return;
        }
        const fallbackOrder = (activeAdvisorSession.orderPrefix || 'COT') + '-0001';
        if (!currentNextOrderCode) {
            currentNextOrderCode = fallbackOrder;
            const nextBadge = document.getElementById('quoteNextOrderBadge');
            if (nextBadge) nextBadge.textContent = 'Orden: ' + currentNextOrderCode;
        }

        if (!activeAdvisorSession.authToken) {
            return;
        }

        const res = await callInvWebAppPost('inv_my_quotes', {
            authToken: activeAdvisorSession.authToken,
            advisorEmail: activeAdvisorSession.correo,
            sheetTab: activeAdvisorSession.sheetTab || ''
        }, 10000);

        if (res && res.ok) {
            if (res.advisor) {
                const updatedAdv = enrichAdvisorLocation(res.advisor);
                if (updatedAdv.erpAdvisorLabel) activeAdvisorSession.erpAdvisorLabel = updatedAdv.erpAdvisorLabel;
                if (updatedAdv.erpAdvisorId) activeAdvisorSession.erpAdvisorId = updatedAdv.erpAdvisorId;
                saveAdvisorSession(activeAdvisorSession);
                renderAdvisorHeaderBar();
            }
            if (res.nextOrderCode) {
                currentNextOrderCode = res.nextOrderCode;
            }
            myRecentQuotesList = Array.isArray(res.recentQuotes) ? res.recentQuotes : [];
            populateQuoteAdvisorControls();
            renderMyRecentQuotes(myRecentQuotesList);
        }
    }

    function populateQuoteAdvisorControls() {
        const titleEl = document.getElementById('quoteModalTitle');
        const hdrInfo = document.getElementById('quoteHeaderAdvisorInfo');
        const originBadge = document.getElementById('quoteOriginTypeBadge');
        const nextOrderBadge = document.getElementById('quoteNextOrderBadge');
        const idBadge = document.getElementById('quoteErpUserIdBadge');
        const storeLbl = document.getElementById('quoteLockedStoreLabel');
        const storeTxt = document.getElementById('quoteLockedStoreText');
        const advTxt = document.getElementById('quoteLockedAdvisorText');
        const emailTxt = document.getElementById('quoteLockedEmailText');
        const clientNameLbl = document.getElementById('quoteClientNameLabel');

        const modeSel = document.getElementById('quoteClientModeSelect');
        const catSel = document.getElementById('quoteCategorySelect');
        const nameInp = document.getElementById('quoteClientNameInput');
        const phoneInp = document.getElementById('quoteClientPhoneInput');
        const dateInp = document.getElementById('quoteDeliveryDateInput');
        const notesInp = document.getElementById('quoteNotesInput');
        const extraInp = document.getElementById('quoteExtraDiscountInput');

        const sess = activeAdvisorSession ? enrichAdvisorLocation(activeAdvisorSession) : null;
        const isProy = !!(sess && sess.isProyecto);
        const prefix = (sess && sess.orderPrefix) || 'COT';
        const orderDisplay = currentNextOrderCode || (prefix + '-0001');

        if (sess && !sess.erpAdvisorLabel && erpAdvisorsCatalog.length > 0) {
            const matched = matchBestErpAdvisorClient(sess.nombre, sess.erpStore, erpAdvisorsCatalog);
            if (matched) {
                sess.erpAdvisorLabel = matched.label;
                sess.erpAdvisorId = matched.id;
                sess.erpAdvisorBranch = matched.branch;
                saveAdvisorSession(sess);
            }
        }

        if (titleEl) {
            titleEl.textContent = isProy
                ? 'Cotización de Proyecto · S Mueblería En Vivo'
                : 'Cotización de Sucursal · S Mueblería En Vivo';
        }

        if (hdrInfo) {
            if (sess) {
                hdrInfo.textContent = (sess.nombre || sess.correo) + ' · ' +
                    (isProy ? 'MODALIDAD PROYECTO' : ('Sucursal: ' + (sess.branchLabel || sess.sheetTab))) +
                    ' · Orden ' + orderDisplay;
            } else {
                hdrInfo.textContent = '';
            }
        }

        if (originBadge) {
            originBadge.textContent = isProy
                ? ('PROYECTO · SERIE ' + prefix)
                : ((sess && sess.branchKey === 'ADMIN') ? ('ADMIN · SERIE ' + prefix) : ('SUCURSAL · SERIE ' + prefix));
            originBadge.style.background = isProy ? '#252C32' : '#A38251';
            originBadge.style.color = '#FFFFFF';
        }

        if (nextOrderBadge) {
            nextOrderBadge.textContent = 'Orden: ' + orderDisplay;
        }

        const uid = (sess && sess.erpAdvisorId) || extractErpIdFromLabel(sess && sess.erpAdvisorLabel) || '';
        if (idBadge) {
            idBadge.textContent = uid ? ('ID S Mueblería: ' + uid) : 'Usuario Vinculado';
        }

        if (storeLbl) {
            storeLbl.textContent = isProy ? 'Área / Modalidad Proyecto' : 'Sucursal Asignada';
        }
        if (storeTxt) {
            storeTxt.textContent = sess ? (sess.erpStore || '—') : 'Inicia sesión';
        }
        if (advTxt) {
            if (sess) {
                advTxt.textContent = sess.erpAdvisorLabel ||
                    ((sess.nombre || sess.correo).toUpperCase() + ' | ' + (sess.erpStore || ''));
            } else {
                advTxt.textContent = '—';
            }
        }
        if (emailTxt) {
            if (sess) {
                emailTxt.textContent = 'Cotización exclusiva del correo autenticado: ' + sess.correo +
                    (isProy ? ' · Registrada en S Mueblería como PROYECTO' : (' · Serie ' + prefix));
            } else {
                emailTxt.textContent = '';
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

        if (modeSel && quoteDraftMeta.clientMode) modeSel.value = quoteDraftMeta.clientMode;
        if (catSel && quoteDraftMeta.categoryLabel) catSel.value = quoteDraftMeta.categoryLabel;
        if (nameInp && document.activeElement !== nameInp) nameInp.value = quoteDraftMeta.clientName || '';
        if (phoneInp && document.activeElement !== phoneInp) phoneInp.value = quoteDraftMeta.clientPhone || '';
        if (dateInp && document.activeElement !== dateInp) {
            dateInp.value = quoteDraftMeta.deliveryDateIso || getDefaultDeliveryIsoDate();
        }
        if (notesInp && document.activeElement !== notesInp) notesInp.value = quoteDraftMeta.notes || '';
        if (extraInp && document.activeElement !== extraInp) {
            extraInp.value = String(Math.max(0, Number(quoteDraftMeta.extraDiscount) || 0));
        }
    }

    window.onExtraDiscountChange = function () {
        saveQuoteDraftMeta();
        renderQuoteTotalsOnly();
    };

    window.setCartItemDiscount = function (skuRaw, rawPct) {
        const key = String(skuRaw || '').trim().toUpperCase();
        if (!cart[key]) return;
        let pct = Number(rawPct);
        if (isNaN(pct) || !isFinite(pct)) pct = 0;
        pct = Math.max(0, Math.min(100, pct));
        cart[key].discountPct = pct;
        saveCart();
        renderCartItems();
    };

    window.addToCart = function (skuRaw, delta) {
        const key = String(skuRaw || '').trim().toUpperCase();
        const it = bySkuMap.get(key);
        if (!it) return;
        if (!cart[key]) {
            cart[key] = {
                sku: it.s,
                name: cleanStr(it.n) || it.s,
                price: formatPrice(it.pr),
                qty: 0,
                discountPct: 0
            };
        } else if (it.pr) {
            cart[key].price = formatPrice(it.pr);
            cart[key].name = cleanStr(it.n) || cart[key].name || it.s;
        }
        cart[key].qty = Math.max(0, (Number(cart[key].qty) || 0) + (delta || 1));
        if (cart[key].qty <= 0) delete cart[key];
        saveCart();

        const btns = document.querySelectorAll('[data-sku-btn="' + CSS.escape(key) + '"]');
        btns.forEach(b => {
            const q = cart[key] ? cart[key].qty : 0;
            b.textContent = q > 0 ? ('+' + q) : '+';
            b.classList.toggle('in-cart', q > 0);
        });
        if (currentDetailItem && String(currentDetailItem.s).toUpperCase() === key) {
            const addBtn = document.getElementById('detAddCartBtn');
            if (addBtn) {
                const q = cart[key] ? cart[key].qty : 0;
                addBtn.textContent = q > 0 ? ('+ Cotización (' + q + ')') : '+ Cotización';
            }
        }
        if (document.getElementById('cartModal').classList.contains('open')) {
            renderCartItems();
        }
    };

    window.addCurrentDetailToCart = function () {
        if (!currentDetailItem) return;
        addToCart(currentDetailItem.s, 1);
    };

    window.openCartModal = async function () {
        if (!activeAdvisorSession || activeAdvisorSession.mustChangeKey) {
            openAuthModalForStartup();
            return;
        }
        if (!erpAdvisorsCatalog.length) {
            loadErpCatalogLiveFromSheet().then(() => populateQuoteAdvisorControls());
        }
        populateQuoteAdvisorControls();
        renderCartItems();
        renderMyRecentQuotes(myRecentQuotesList);
        document.getElementById('cartModal').classList.add('open');
        refreshMyLiveQuotesInfo();
    };

    window.closeCartModal = function () {
        document.getElementById('cartModal').classList.remove('open');
    };

    window.clearCart = function () {
        cart = {};
        lastSubmittedQuoteMeta = null;
        saveCart();
        const statusBox = document.getElementById('quoteSystemStatusBox');
        if (statusBox) {
            statusBox.innerHTML = '';
            statusBox.classList.add('hidden');
        }
        renderCartItems();
        const inp = document.getElementById('invSearchInput');
        applyFilter(inp ? inp.value : '');
    };

    function computeQuoteBreakdown() {
        const entries = Object.values(cart);
        const lines = [];
        let sumLines = 0;

        for (let i = 0; i < entries.length; i++) {
            const row = entries[i];
            const key = String(row.sku || '').toUpperCase();
            const liveIt = bySkuMap.get(key);
            const itemName = (liveIt && cleanStr(liveIt.n)) || row.name || row.sku;
            const itemPriceStr = (liveIt && formatPrice(liveIt.pr)) || formatPrice(row.price);
            const unitList = parsePriceNum(itemPriceStr);
            const qty = Math.max(1, Number(row.qty) || 1);
            const discPct = Math.max(0, Math.min(100, Number(row.discountPct) || 0));
            const unitFinal = unitList * (1 - (discPct / 100));
            const lineSubtotal = unitFinal * qty;
            sumLines += lineSubtotal;

            lines.push({
                key: key,
                sku: row.sku,
                name: itemName,
                qty: qty,
                discountPct: discPct,
                unitList: unitList,
                unitFinal: unitFinal,
                lineSubtotal: lineSubtotal
            });
        }

        const extraDiscount = Math.max(0, Number(quoteDraftMeta.extraDiscount) || 0);
        const totalWithIva = Math.max(0, sumLines - extraDiscount);
        const subtotalNoIva = totalWithIva / 1.16;
        const ivaAmount = totalWithIva - subtotalNoIva;

        return {
            lines: lines,
            sumLines: sumLines,
            extraDiscount: extraDiscount,
            subtotalNoIva: subtotalNoIva,
            ivaAmount: ivaAmount,
            totalWithIva: totalWithIva
        };
    }

    function renderQuoteTotalsOnly() {
        const totalBar = document.getElementById('cartTotalBar');
        const subEl = document.getElementById('quoteSubtotalNoIva');
        const ivaEl = document.getElementById('quoteIvaAmount');
        const totalAmtEl = document.getElementById('cartTotalAmount');
        const bd = computeQuoteBreakdown();

        if (!bd.lines.length) {
            if (totalBar) totalBar.classList.add('hidden');
            return;
        }
        if (totalBar) totalBar.classList.remove('hidden');
        if (subEl) subEl.textContent = formatPrice(bd.subtotalNoIva) || '$0.00';
        if (ivaEl) ivaEl.textContent = formatPrice(bd.ivaAmount) || '$0.00';
        if (totalAmtEl) totalAmtEl.textContent = formatPrice(bd.totalWithIva) || '$0.00';
    }

    function renderCartItems() {
        const wrap = document.getElementById('cartItemsContainer');
        const countLbl = document.getElementById('quoteItemsCountLabel');
        if (!wrap) return;

        const bd = computeQuoteBreakdown();
        if (countLbl) {
            countLbl.textContent = bd.lines.length + (bd.lines.length === 1 ? ' partida' : ' partidas') +
                (bd.lines.length > 15 ? ' (excede límite de 15)' : '');
            countLbl.style.color = bd.lines.length > 15 ? '#991B1B' : '#252C32';
        }

        if (!bd.lines.length) {
            wrap.innerHTML = '<div class="text-center py-6 rounded-xl border text-xs font-semibold opacity-60" style="border-color:#E8E4DE;">No hay productos agregados a la plantilla de cotización.</div>';
            renderQuoteTotalsOnly();
            return;
        }

        wrap.innerHTML = bd.lines.map((ln, idx) => {
            const unitStr = ln.unitList > 0 ? formatPrice(ln.unitList) : 'Sin precio';
            const lineSubStr = ln.lineSubtotal > 0 ? formatPrice(ln.lineSubtotal) : '$0.00';
            return '<div class="rounded-xl border p-3 flex flex-wrap sm:flex-nowrap items-center justify-between gap-2.5" style="border-color:#E8E4DE; background:#FFFFFF;">' +
                '<div class="min-w-0 flex-1 cursor-pointer" onclick="closeCartModal(); openProductDetail(\'' + escapeHtml(ln.key) + '\', false)">' +
                    '<div class="text-xs font-extrabold uppercase leading-snug" style="color:#252C32;">' +
                        '<span class="opacity-50 mr-1">' + (idx + 1) + '.</span>' +
                        escapeHtml(ln.name) +
                    '</div>' +
                    '<div class="text-[11px] font-bold mt-0.5 flex flex-wrap items-center gap-2" style="color:#A38251;">' +
                        '<span>' + escapeHtml(ln.sku) + '</span>' +
                        '<span>· P. Lista: ' + escapeHtml(unitStr) + '</span>' +
                        '<span style="color:#252C32;">· Importe: ' + escapeHtml(lineSubStr) + '</span>' +
                    '</div>' +
                '</div>' +
                '<div class="flex items-center gap-2 shrink-0 ml-auto">' +
                    '<div class="flex items-center gap-1" title="Porcentaje de descuento en esta partida">' +
                        '<span class="text-[10px] font-bold uppercase opacity-70">Desc%</span>' +
                        '<input type="number" min="0" max="100" step="0.5" value="' + (ln.discountPct || 0) + '" ' +
                               'onchange="setCartItemDiscount(\'' + escapeHtml(ln.key) + '\', this.value)" ' +
                               'class="w-14 rounded-lg border px-1.5 py-1 text-center text-xs font-bold outline-none" ' +
                               'style="border-color:#E1DBC5; color:#252C32;">' +
                    '</div>' +
                    '<div class="flex items-center gap-1">' +
                        '<button type="button" onclick="addToCart(\'' + escapeHtml(ln.key) + '\', -1)" class="w-7 h-7 rounded-full border text-sm font-bold" style="border-color:#E1DBC5;">−</button>' +
                        '<span class="w-6 text-center text-xs font-extrabold">' + ln.qty + '</span>' +
                        '<button type="button" onclick="addToCart(\'' + escapeHtml(ln.key) + '\', 1)" class="w-7 h-7 rounded-full border text-sm font-bold" style="border-color:#A38251; background:#A38251; color:#FFF;">+</button>' +
                    '</div>' +
                '</div>' +
            '</div>';
        }).join('');

        renderQuoteTotalsOnly();
    }

    function collectQuoteSubmissionPayload(sendToErp) {
        saveQuoteDraftMeta();
        const bd = computeQuoteBreakdown();
        const sess = activeAdvisorSession ? enrichAdvisorLocation(activeAdvisorSession) : null;
        const prefix = (sess && sess.orderPrefix) || 'COT';
        const erpStore = (sess && sess.erpStore) || 'CREATA PUERTO CANCUN';
        const erpAdvisorLabel = (sess && sess.erpAdvisorLabel) ||
            (sess ? ((sess.nombre || sess.correo).toUpperCase() + ' | ' + erpStore) : '');

        return {
            sendToErp: !!sendToErp,
            authToken: sess ? (sess.authToken || '') : '',
            sheetTab: sess ? (sess.sheetTab || '') : '',
            advisorEmail: sess ? sess.correo : '',
            advisorName: sess ? sess.nombre : '',
            branchLabel: sess ? sess.branchLabel : '',
            orderPrefix: prefix,
            orderCode: (lastSubmittedQuoteMeta && lastSubmittedQuoteMeta.orderCode) || currentNextOrderCode || (prefix + '-0001'),
            quoteType: sess ? sess.quoteType : 'SUCURSAL',
            isProyecto: !!(sess && sess.isProyecto),
            erpStore: erpStore,
            erpAdvisorLabel: erpAdvisorLabel,
            erpAdvisorId: sess ? (sess.erpAdvisorId || '') : '',
            categoryLabel: quoteDraftMeta.categoryLabel || 'COTIZACIONES [ID: 2]',
            clientMode: quoteDraftMeta.clientMode || 'PROSPECTO PROVISIONAL (SOLO NOMBRE - MODIFICABLE AL CERRAR)',
            clientName: cleanStr(quoteDraftMeta.clientName) || (sess && sess.isProyecto ? 'PROYECTO CREATA' : 'PROSPECTO EN TIENDA'),
            clientPhone: cleanStr(quoteDraftMeta.clientPhone),
            deliveryDate: isoDateToDMY(quoteDraftMeta.deliveryDateIso || getDefaultDeliveryIsoDate()),
            notes: cleanStr(quoteDraftMeta.notes),
            extraDiscount: bd.extraDiscount,
            items: bd.lines.map(ln => ({
                sku: ln.sku,
                name: ln.name,
                qty: ln.qty,
                discountPct: ln.discountPct,
                unitList: ln.unitList,
                lineSubtotal: ln.lineSubtotal
            })),
            breakdown: bd
        };
    }

    function buildFormattedQuoteText(payload) {
        const bd = payload.breakdown;
        const folioLine = (lastSubmittedQuoteMeta && lastSubmittedQuoteMeta.folio)
            ? ('Folio S Mueblería: ' + lastSubmittedQuoteMeta.folio + (lastSubmittedQuoteMeta.quoteId ? (' (ID ' + lastSubmittedQuoteMeta.quoteId + ')') : ''))
            : '';
        const lines = [
            payload.isProyecto
                ? 'COTIZACIÓN DE PROYECTO — CREATA MUEBLES'
                : 'COTIZACIÓN DE SUCURSAL — CREATA MUEBLES',
            'Orden de Cotización: ' + (payload.orderCode || ''),
            folioLine,
            (payload.isProyecto ? 'Modalidad / Área: PROYECTO · ' : 'Sucursal Sistema: ') + payload.erpStore,
            'Usuario Exclusivo S Mueblería: ' + (payload.erpAdvisorLabel || payload.advisorName || ''),
            'Correo Titular: ' + (payload.advisorEmail || '') + (payload.branchLabel ? (' (' + payload.branchLabel + ')') : ''),
            'Categoría: ' + payload.categoryLabel,
            'Modalidad Cliente: ' + payload.clientMode,
            (payload.isProyecto ? 'Proyecto / Cliente: ' : 'Cliente / Prospecto: ') + payload.clientName,
            payload.clientPhone ? ('Teléfono: ' + payload.clientPhone) : '',
            'Entrega Tentativa: ' + payload.deliveryDate,
            payload.notes ? ('Notas: ' + payload.notes) : '',
            '----------------------------------------',
            'PARTIDAS:'
        ].filter(Boolean);

        bd.lines.forEach((ln, i) => {
            const discTxt = ln.discountPct > 0 ? (' (-' + ln.discountPct + '%)') : '';
            lines.push(
                (i + 1) + '. [' + ln.sku + '] ' + ln.name +
                ' | Cant: ' + ln.qty +
                ' | P. Lista: ' + (formatPrice(ln.unitList) || '$0.00') +
                discTxt +
                ' | Importe: ' + (formatPrice(ln.lineSubtotal) || '$0.00')
            );
        });

        lines.push('----------------------------------------');
        if (bd.extraDiscount > 0) {
            lines.push('Descuento Extra: -' + formatPrice(bd.extraDiscount));
        }
        lines.push('Subtotal (sin IVA): ' + (formatPrice(bd.subtotalNoIva) || '$0.00'));
        lines.push('IVA (16%): ' + (formatPrice(bd.ivaAmount) || '$0.00'));
        lines.push('TOTAL COTIZACIÓN: ' + (formatPrice(bd.totalWithIva) || '$0.00'));
        return lines.join('\n');
    }

    window.copyCartSummary = function () {
        const bd = computeQuoteBreakdown();
        if (!bd.lines.length) return;
        const payload = collectQuoteSubmissionPayload(false);
        const text = buildFormattedQuoteText(payload);
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text);
        }
        const btn = document.getElementById('copyCartBtn');
        if (btn) {
            const prev = btn.textContent;
            btn.textContent = '✓ Copiado';
            setTimeout(() => { btn.textContent = prev; }, 1100);
        }
    };

    window.printQuoteTemplate = function () {
        const bd = computeQuoteBreakdown();
        if (!bd.lines.length) return;
        const payload = collectQuoteSubmissionPayload(false);
        const todayStr = formatDateDMY(new Date());
        const logoSrc = window.CREATA_LOGO_B64 || '';
        const folioTxt = (lastSubmittedQuoteMeta && lastSubmittedQuoteMeta.folio) ? lastSubmittedQuoteMeta.folio : '';
        const qidTxt = (lastSubmittedQuoteMeta && lastSubmittedQuoteMeta.quoteId) ? lastSubmittedQuoteMeta.quoteId : '';
        const docHeading = payload.isProyecto ? 'Cotización de Proyecto' : 'Cotización de Sucursal';

        const rowsHtml = bd.lines.map((ln, idx) =>
            '<tr>' +
                '<td style="padding:8px;border-bottom:1px solid #E8E4DE;text-align:center;">' + (idx + 1) + '</td>' +
                '<td style="padding:8px;border-bottom:1px solid #E8E4DE;font-weight:700;">' + escapeHtml(ln.sku) + '</td>' +
                '<td style="padding:8px;border-bottom:1px solid #E8E4DE;">' + escapeHtml(ln.name) + '</td>' +
                '<td style="padding:8px;border-bottom:1px solid #E8E4DE;text-align:center;font-weight:700;">' + ln.qty + '</td>' +
                '<td style="padding:8px;border-bottom:1px solid #E8E4DE;text-align:right;">' + escapeHtml(formatPrice(ln.unitList) || '$0.00') + '</td>' +
                '<td style="padding:8px;border-bottom:1px solid #E8E4DE;text-align:center;">' + (ln.discountPct > 0 ? (ln.discountPct + '%') : '0%') + '</td>' +
                '<td style="padding:8px;border-bottom:1px solid #E8E4DE;text-align:right;font-weight:700;">' + escapeHtml(formatPrice(ln.lineSubtotal) || '$0.00') + '</td>' +
            '</tr>'
        ).join('');

        const win = window.open('', '_blank');
        if (!win) return;
        win.document.write(
            '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>' + escapeHtml(docHeading) + ' — ' + escapeHtml(payload.clientName) + '</title>' +
            '<link href="https://fonts.googleapis.com/css2?family=Raleway:wght@400;600;700;800&display=swap" rel="stylesheet">' +
            '<style>body{font-family:Raleway,sans-serif;color:#252C32;margin:28px;font-size:12px;} ' +
            'table{width:100%;border-collapse:collapse;margin-top:16px;} th{background:#252C32;color:#FFF;padding:9px 8px;text-transform:uppercase;font-size:11px;letter-spacing:0.04em;} ' +
            '.box{border:1px solid #E1DBC5;border-radius:10px;padding:12px 14px;margin-top:12px;background:#FAF9F6;} ' +
            '@media print{.no-print{display:none!important;}}</style></head><body>' +
            '<div style="display:flex;align-items:center;justify-content:space-between;background:#252C32;color:#FFF;padding:16px 20px;border-radius:12px;">' +
                '<div>' + (logoSrc ? ('<img src="' + logoSrc + '" style="height:48px;object-fit:contain;">') : '<strong>CREATA MUEBLES</strong>') + '</div>' +
                '<div style="text-align:right;">' +
                    '<div style="font-size:15px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;">' + escapeHtml(docHeading) + '</div>' +
                    '<div style="color:#E1DBC5;font-size:11px;margin-top:3px;">Orden: <strong>' + escapeHtml(payload.orderCode || '') + '</strong>' +
                        (folioTxt ? (' · Folio S Mueblería: <strong>' + escapeHtml(folioTxt) + '</strong>') : '') +
                        (qidTxt ? (' (ID ' + escapeHtml(qidTxt) + ')') : '') +
                    '</div>' +
                    '<div style="color:#E1DBC5;font-size:11px;margin-top:2px;">Fecha: ' + escapeHtml(todayStr) + ' · ' + escapeHtml(payload.erpStore) + '</div>' +
                '</div>' +
            '</div>' +
            '<div class="box" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
                '<div><strong>' + (payload.isProyecto ? 'Proyecto / Cliente:' : 'Cliente / Prospecto:') + '</strong> ' + escapeHtml(payload.clientName) + '</div>' +
                '<div><strong>Origen / Modalidad:</strong> ' + escapeHtml(payload.isProyecto ? 'PROYECTO' : ('SUCURSAL (' + (payload.branchLabel || payload.erpStore) + ')')) + '</div>' +
                '<div><strong>Teléfono:</strong> ' + escapeHtml(payload.clientPhone || 'Por definir') + '</div>' +
                '<div><strong>Entrega Tentativa:</strong> ' + escapeHtml(payload.deliveryDate) + '</div>' +
                '<div><strong>Asesor Exclusivo S Mueblería:</strong> ' + escapeHtml(payload.erpAdvisorLabel || payload.advisorName) + '</div>' +
                '<div><strong>Correo Titular:</strong> ' + escapeHtml(payload.advisorEmail || '') + '</div>' +
                (payload.notes ? ('<div style="grid-column:span 2;"><strong>Notas:</strong> ' + escapeHtml(payload.notes) + '</div>') : '') +
            '</div>' +
            '<table><thead><tr><th>#</th><th>SKU</th><th style="text-align:left;">Descripción</th><th>Cant.</th><th style="text-align:right;">Precio Lista</th><th>% Desc.</th><th style="text-align:right;">Importe</th></tr></thead>' +
            '<tbody>' + rowsHtml + '</tbody></table>' +
            '<div style="margin-left:auto;max-width:300px;margin-top:16px;border:1px solid #E1DBC5;border-radius:10px;padding:12px 14px;background:#FAF9F6;">' +
                (bd.extraDiscount > 0 ? ('<div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span>Descuento Extra:</span><strong>-' + escapeHtml(formatPrice(bd.extraDiscount)) + '</strong></div>') : '') +
                '<div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span>Subtotal (sin IVA):</span><strong>' + escapeHtml(formatPrice(bd.subtotalNoIva) || '$0.00') + '</strong></div>' +
                '<div style="display:flex;justify-content:space-between;margin-bottom:8px;"><span>IVA (16%):</span><strong>' + escapeHtml(formatPrice(bd.ivaAmount) || '$0.00') + '</strong></div>' +
                '<div style="display:flex;justify-content:space-between;border-top:1px solid #E1DBC5;padding-top:8px;font-size:14px;font-weight:800;color:#A38251;"><span>TOTAL COTIZACIÓN:</span><span>' + escapeHtml(formatPrice(bd.totalWithIva) || '$0.00') + '</span></div>' +
            '</div>' +
            '<div class="no-print" style="margin-top:20px;text-align:right;">' +
                '<button onclick="window.print()" style="background:#A38251;color:#FFF;border:none;padding:10px 20px;border-radius:999px;font-weight:800;cursor:pointer;text-transform:uppercase;">Imprimir / Guardar PDF</button>' +
            '</div>' +
            '</body></html>'
        );
        win.document.close();
    };

    function renderQuoteStatusBanner(tone, htmlContent) {
        const box = document.getElementById('quoteSystemStatusBox');
        if (!box) return;
        if (!htmlContent) {
            box.innerHTML = '';
            box.classList.add('hidden');
            return;
        }
        box.className = 'rounded-xl border p-3.5 text-xs space-y-1.5 ' +
            (tone === 'ok' ? 'sem-green' : (tone === 'warn' ? 'sem-yellow' : 'sem-red'));
        box.innerHTML = htmlContent;
        box.classList.remove('hidden');
    }

    async function readLivePlantillaHeaderStatus() {
        const rows = await fetchSheetCsvRows('plantilla', 'range=A5:M11');
        if (!rows || rows.length < 5) return null;
        return {
            ok: true,
            erpStore: cleanStr(rows[0] && rows[0][2]),
            erpAdvisor: cleanStr(rows[1] && rows[1][2]),
            erpUserId: cleanStr(rows[1] && rows[1][6]),
            actionState: cleanStr(rows[0] && rows[0][10]),
            erpStatus: cleanStr(rows[1] && rows[1][10]),
            quoteId: cleanStr(rows[2] && rows[2][10]),
            folio: cleanStr(rows[2] && rows[2][12]),
            lastSync: cleanStr(rows[4] && rows[4][10])
        };
    }

    window.submitQuoteToSystem = async function (sendToErp) {
        if (quoteSubmitInFlight) return;
        if (!activeAdvisorSession || activeAdvisorSession.mustChangeKey) {
            openAuthModalForStartup();
            return;
        }

        const bd = computeQuoteBreakdown();
        if (!bd.lines.length) {
            renderQuoteStatusBanner('err', '<div>Agrega al menos un producto antes de generar o enviar la cotización.</div>');
            return;
        }
        if (bd.lines.length > 15) {
            renderQuoteStatusBanner('err', '<div>La hoja <strong>plantilla</strong> admite máximo 15 partidas por cotización (actualmente tienes ' + bd.lines.length + ').</div>');
            return;
        }

        const nameInp = document.getElementById('quoteClientNameInput');
        if (nameInp && !cleanStr(nameInp.value)) {
            nameInp.focus();
            renderQuoteStatusBanner(
                'warn',
                '<div>Ingresa el <strong>' +
                    (activeAdvisorSession.isProyecto ? 'Nombre del Proyecto / Cliente' : 'Nombre del Cliente / Prospecto') +
                '</strong> para registrar la cotización.</div>'
            );
            return;
        }

        const payload = collectQuoteSubmissionPayload(sendToErp);
        const btnRev = document.getElementById('btnLoadPlantillaReview');
        const btnSend = document.getElementById('btnSendQuoteErp');
        quoteSubmitInFlight = true;
        if (btnRev) btnRev.disabled = true;
        if (btnSend) btnSend.disabled = true;

        renderQuoteStatusBanner(
            'warn',
            '<div class="font-extrabold uppercase">' +
                (sendToErp
                    ? ('Enviando ' + (payload.isProyecto ? 'Cotización de Proyecto' : 'Cotización de Sucursal') + ' en vivo a S Mueblería...')
                    : 'Cargando orden de cotización en revisión en Google Sheets...') +
            '</div>' +
            '<div>Orden: <strong>' + escapeHtml(payload.orderCode) + '</strong> · Titular exclusivo: <strong>' + escapeHtml(payload.advisorEmail) + '</strong> (' + escapeHtml(payload.erpStore) + ')</div>'
        );

        try {
            const res = await callInvWebAppPost('inv_submit_quote', payload, 38000);

            if (res && res.authRequired) {
                renderQuoteStatusBanner(
                    'warn',
                    '<div class="font-extrabold uppercase">Verificación de titular requerida</div>' +
                    '<div>' + escapeHtml(res.error || 'Confirma tu contraseña personal para emitir esta cotización con tu usuario exclusivo.') + '</div>'
                );
                promptSessionReauth(
                    res.error || 'Confirma tu contraseña personal para emitir tu cotización en vivo en S Mueblería.',
                    !!sendToErp
                );
                return;
            }

            if (res && res.ok) {
                const assignedOrder = cleanStr(res.orderCode) || payload.orderCode;
                if (res.nextOrderCode) {
                    currentNextOrderCode = res.nextOrderCode;
                }
                if (Array.isArray(res.recentQuotes)) {
                    myRecentQuotesList = res.recentQuotes;
                    renderMyRecentQuotes(myRecentQuotesList);
                }
                populateQuoteAdvisorControls();

                if (!sendToErp) {
                    lastSubmittedQuoteMeta = {
                        orderCode: assignedOrder,
                        folio: '',
                        quoteId: '',
                        createdAt: cleanStr(res.lastSync),
                        quoteType: res.quoteType || payload.quoteType
                    };
                    renderQuoteStatusBanner(
                        'ok',
                        '<div class="font-extrabold uppercase">✓ Orden ' + escapeHtml(assignedOrder) + ' cargada en revisión en Google Sheets</div>' +
                        '<div>' + (payload.isProyecto ? 'Modalidad: <strong>PROYECTO</strong>' : 'Sucursal: <strong>' + escapeHtml(res.erpStore || payload.erpStore) + '</strong>') +
                            ' · Usuario exclusivo: <strong>' + escapeHtml(res.erpAdvisor || payload.erpAdvisorLabel) + '</strong></div>' +
                        (res.erpStatus ? ('<div>Estado: ' + escapeHtml(res.erpStatus) + '</div>') : '')
                    );
                    return;
                }

                // Flujo directo 24/7 en vivo hacia sistema.smuebleria.com
                if (res.sentLiveToErp) {
                    const folioTxt = cleanStr(res.folio) || ('ID-' + cleanStr(res.quoteId));
                    const qidTxt = cleanStr(res.quoteId);
                    lastSubmittedQuoteMeta = {
                        orderCode: assignedOrder,
                        folio: folioTxt,
                        quoteId: qidTxt,
                        createdAt: cleanStr(res.lastSync),
                        quoteType: res.quoteType || payload.quoteType
                    };
                    renderQuoteStatusBanner(
                        'ok',
                        '<div class="font-extrabold uppercase">✓ Cotización creada en vivo en el sistema S Mueblería</div>' +
                        '<div>Orden ' + (payload.isProyecto ? 'Proyecto' : 'Sucursal') + ': <strong>' + escapeHtml(assignedOrder) + '</strong>' +
                            ' · Folio S Mueblería: <strong>' + escapeHtml(folioTxt) + '</strong>' +
                            (qidTxt ? (' · ID Cotización ERP: <strong>' + escapeHtml(qidTxt) + '</strong>') : '') +
                        '</div>' +
                        '<div>Emitida exclusivamente por: <strong>' + escapeHtml(payload.erpAdvisorLabel) + '</strong> (' + escapeHtml(payload.advisorEmail) + ')</div>' +
                        '<div class="pt-1"><button type="button" onclick="printQuoteTemplate()" class="underline font-extrabold">Abrir Comprobante / PDF con Folio S Mueblería →</button></div>'
                    );
                    return;
                }

                // Compatibilidad en caso de que la implementación WebApp aún no se haya actualizado a la nueva versión
                let latest = res;
                for (let attempt = 0; attempt < 6; attempt++) {
                    if (latest && (cleanStr(latest.folio) || cleanStr(latest.quoteId) || /COTIZACI[ÓO]N CREADA|ENVIADA EN VIVO|ERROR/i.test(String(latest.erpStatus || '')))) {
                        break;
                    }
                    await new Promise(r => setTimeout(r, 3000));
                    const polled = await readLivePlantillaHeaderStatus();
                    if (polled) latest = polled;
                }

                const folioFallback = cleanStr(latest && latest.folio);
                const qidFallback = cleanStr(latest && latest.quoteId);
                if (folioFallback || qidFallback) {
                    lastSubmittedQuoteMeta = {
                        orderCode: assignedOrder,
                        folio: folioFallback,
                        quoteId: qidFallback,
                        createdAt: cleanStr(latest && latest.lastSync),
                        quoteType: payload.quoteType
                    };
                    renderQuoteStatusBanner(
                        'ok',
                        '<div class="font-extrabold uppercase">✓ Cotización registrada en S Mueblería</div>' +
                        '<div>Orden: <strong>' + escapeHtml(assignedOrder) + '</strong> · Folio S Mueblería: <strong>' + escapeHtml(folioFallback || 'Generado') + '</strong>' +
                            (qidFallback ? (' · ID Cotización: <strong>' + escapeHtml(qidFallback) + '</strong>') : '') +
                        '</div>'
                    );
                } else {
                    renderQuoteStatusBanner(
                        'warn',
                        '<div class="font-extrabold uppercase">Plantilla registrada · Falta activar nueva versión de Apps Script para envío directo 24/7</div>' +
                        '<div>Para que la cotización se inserte directo en vivo en <strong>sistema.smuebleria.com</strong> sin depender de ninguna computadora encendida, pega el código actualizado de <code>AppsScript_Creata_Drive_Sheets.gs</code> en <em>Extensiones → Apps Script → Implementar → Administrar implementaciones → Editar → Nueva versión</em>.</div>'
                    );
                }
                return;
            }

            if (res && !res.ok && !res.unavailable && !res.needsRedeploy && res.error) {
                renderQuoteStatusBanner(
                    'err',
                    '<div class="font-extrabold uppercase">No se pudo registrar la cotización en S Mueblería</div>' +
                    '<div>' + escapeHtml(res.error) + '</div>'
                );
                return;
            }

            window.copyCartSummary();
            renderQuoteStatusBanner(
                'warn',
                '<div class="font-extrabold uppercase">Plantilla generada y copiada al portapapeles</div>' +
                '<div>Actualiza la versión publicada de <code>AppsScript_Creata_Drive_Sheets.gs</code> en <em>Extensiones → Apps Script → Implementar → Administrar implementaciones → Editar → Nueva versión</em> para enviar en vivo directo a S Mueblería.</div>' +
                '<div class="pt-1"><button type="button" onclick="printQuoteTemplate()" class="underline font-extrabold">Abrir Vista / PDF de esta Cotización →</button></div>'
            );
        } finally {
            quoteSubmitInFlight = false;
            if (btnRev) btnRev.disabled = false;
            if (btnSend) btnSend.disabled = false;
        }
    };


    // ------------------------------------------------------------------------
    // ESCÁNER BLUETOOTH (HID KEYBOARD WEDGE) + ENTER DIRECTO EN BUSCADOR
    // ------------------------------------------------------------------------
    let scanBuffer = '';
    let lastKeyTime = 0;

    document.addEventListener('keydown', function (ev) {
        const authModalEl = document.getElementById('authModal');
        if (authModalEl && authModalEl.classList.contains('open')) {
            return;
        }

        if (ev.key === 'Escape') {
            closeProductDetail();
            closeCartModal();
            return;
        }
        const activeTag = document.activeElement ? document.activeElement.tagName : '';
        const isSearchFocused = document.activeElement && document.activeElement.id === 'invSearchInput';

        if (isSearchFocused && ev.key === 'Enter') {
            const val = String(document.activeElement.value || '').trim();
            if (val) {
                if (openProductDetail(val, false)) {
                    ev.preventDefault();
                    document.activeElement.select();
                    return;
                }
                if (filteredGroups.length === 1) {
                    ev.preventDefault();
                    const g = filteredGroups[0];
                    if (g.items.length > 1) openGroupModal(g.key);
                    else openProductDetail(g.items[0].s, false);
                    return;
                }
            }
        }

        if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT') return;

        const now = Date.now();
        if (now - lastKeyTime > 120) {
            scanBuffer = '';
        }
        lastKeyTime = now;

        if (ev.key === 'Enter' || ev.key === 'Tab') {
            const code = scanBuffer.trim();
            scanBuffer = '';
            if (code.length >= 3) {
                ev.preventDefault();
                const inp = document.getElementById('invSearchInput');
                if (inp) inp.value = code;
                applyFilter(code);
                if (!openProductDetail(code, false) && filteredGroups.length === 1) {
                    const g = filteredGroups[0];
                    if (g.items.length > 1) openGroupModal(g.key);
                    else openProductDetail(g.items[0].s, false);
                }
            }
        } else if (ev.key.length === 1 && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
            scanBuffer += ev.key;
        }
    });

    // ------------------------------------------------------------------------
    // LECTURA EN VIVO (SOLO LECTURA) DE LPPT Y SINCRONIZACIÓN CON INVENTARIO_EN_VIVO
    // ------------------------------------------------------------------------
    let liveSyncInFlight = false;

    function normHeader(h) {
        return String(h || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toUpperCase()
            .replace(/\s+/g, ' ')
            .trim();
    }

    function parseCsvText(csvText) {
        const rows = [];
        let row = [];
        let field = '';
        let inQuotes = false;
        for (let i = 0; i < csvText.length; i++) {
            const ch = csvText[i];
            if (inQuotes) {
                if (ch === '"') {
                    if (csvText[i + 1] === '"') {
                        field += '"';
                        i++;
                    } else {
                        inQuotes = false;
                    }
                } else {
                    field += ch;
                }
            } else {
                if (ch === '"') {
                    inQuotes = true;
                } else if (ch === ',') {
                    row.push(field);
                    field = '';
                } else if (ch === '\r') {
                    // ignore
                } else if (ch === '\n') {
                    row.push(field);
                    rows.push(row);
                    row = [];
                    field = '';
                } else {
                    field += ch;
                }
            }
        }
        if (field.length > 0 || row.length > 0) {
            row.push(field);
            rows.push(row);
        }
        return rows;
    }

    async function fetchLiveLpptOrders() {
        if (!LPPT_SHEET_ID) return;
        try {
            const url = 'https://docs.google.com/spreadsheets/d/' + LPPT_SHEET_ID +
                '/export?format=csv&gid=' + encodeURIComponent(LPPT_GID);
            const res = await fetch(url, { cache: 'no-store' });
            if (!res.ok) return;
            const text = await res.text();
            const rows = parseCsvText(text);
            if (rows.length < 3) return;

            const nextMap = new Map();
            for (let i = 2; i < rows.length; i++) {
                const r = rows[i];
                if (!r || r.length <= 9) continue;
                const sku = cleanStr(r[9]).toUpperCase();
                const oc = cleanStr(r[3]); // Columna D: Orden de compra
                if (!sku || !oc || sku === 'CLA00E') continue;

                const folio = r.length > 12 ? cleanStr(r[12]) : '';
                const cliente = r.length > 15 ? cleanStr(r[15]) : '';
                const comComp = (r.length > 18 ? cleanStr(r[18]) : '').toUpperCase();
                if (folio || cliente || comComp.indexOf('NO DISPONIBLE') !== -1 || comComp.indexOf('GARANTIA') !== -1) {
                    continue;
                }

                const rawCant = r.length > 6 ? String(r[6] || '').replace(/,/g, '') : '0';
                const cant = Math.max(0, Math.floor(Number(rawCant) || 0));
                const comAses = r.length > 19 ? String(r[19] || '') : '';
                let reserved = 0;
                const matches = comAses.match(/\((\d+)\)/g);
                if (matches) {
                    for (let m = 0; m < matches.length; m++) {
                        reserved += parseInt(matches[m].slice(1, -1), 10) || 0;
                    }
                }
                const freeQty = Math.max(0, cant - reserved);
                if (freeQty <= 0) continue;

                const fcStr = cleanStr(r[2]); // Columna C: Fecha compra
                const fcompStr = r.length > 5 ? cleanStr(r[5]) : '';
                let list = nextMap.get(sku);
                if (!list) {
                    list = [];
                    nextMap.set(sku, list);
                }
                list.push({
                    fc: parseSheetDate(fcStr),
                    fcStr: fcStr,
                    oc: oc,
                    fcomp: parseSheetDate(fcompStr),
                    free: freeQty
                });
            }
            if (nextMap.size > 0) {
                liveLpptBySku = nextMap;
            }
        } catch (err) {
            // Conservar último mapa LPPT en memoria si falla la red
        }
    }

    function gvizCellRaw(rowCells, idx) {
        if (idx < 0 || idx >= rowCells.length) return '';
        const c = rowCells[idx];
        if (!c) return '';
        if (c.v !== null && c.v !== undefined) return c.v;
        if (c.f !== null && c.f !== undefined) return c.f;
        return '';
    }

    function gvizCellFormatted(rowCells, idx) {
        if (idx < 0 || idx >= rowCells.length) return '';
        const c = rowCells[idx];
        if (!c) return '';
        if (c.f !== null && c.f !== undefined && String(c.f).trim() !== '') return c.f;
        if (c.v !== null && c.v !== undefined) return c.v;
        return '';
    }

    function normalizeLeadTimeVal(rawVal) {
        const s = cleanStr(rawVal);
        if (!s) return '';
        const n = Number(s);
        if (!isNaN(n)) return n >= 0 ? Math.round(n) : '';
        return s;
    }

    function computeLpptAndLeadTime(skuUpper, baseLtRaw, invLpptVal, invFeStr, prevItem) {
        const baseLtNum = Number(baseLtRaw);
        const validBaseLt = (!isNaN(baseLtNum) && isFinite(baseLtNum) && baseLtNum > 0) ? Math.round(baseLtNum) : '';
        const entries = liveLpptBySku.get(skuUpper);

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (entries && entries.length > 0) {
            let lpptQty = 0;
            let bestArr = null;

            for (let k = 0; k < entries.length; k++) {
                const e = entries[k];
                lpptQty += e.free;

                let dCompraLt = null;
                if (e.fc && validBaseLt) {
                    dCompraLt = new Date(e.fc.getTime());
                    dCompraLt.setDate(dCompraLt.getDate() + validBaseLt);
                }
                let arr = dCompraLt;
                if ((!arr || arr < today) && e.fcomp && (!arr || e.fcomp > arr)) {
                    arr = e.fcomp;
                }
                if (arr) {
                    if (
                        !bestArr ||
                        (arr >= today && (bestArr < today || arr < bestArr)) ||
                        (arr < today && bestArr < today && arr > bestArr)
                    ) {
                        bestArr = arr;
                    }
                }
            }

            if (!bestArr && invFeStr) {
                bestArr = parseSheetDate(invFeStr);
            }
            const feFormatted = bestArr
                ? formatDateDMY(bestArr)
                : (cleanStr(invFeStr) || 'Sin piezas solicitadas');
            const remDays = bestArr
                ? Math.max(0, Math.round((bestArr.getTime() - today.getTime()) / 86400000))
                : validBaseLt;

            return {
                lpptQty: lpptQty,
                lt: remDays,
                baseLt: validBaseLt,
                fe: feFormatted
            };
        }

        const fallbackQty = Math.max(0, Number(invLpptVal) || 0);
        const feClean = cleanStr(invFeStr) || (prevItem && cleanStr(prevItem.fe)) || 'Sin piezas solicitadas';
        const parsedFe = parseSheetDate(feClean);
        let ltOut = validBaseLt;
        if (fallbackQty > 0 && parsedFe) {
            ltOut = Math.max(0, Math.round((parsedFe.getTime() - today.getTime()) / 86400000));
        } else if (prevItem && prevItem.lt !== undefined && prevItem.lt !== '') {
            ltOut = prevItem.lt;
        }

        return {
            lpptQty: fallbackQty,
            lt: ltOut,
            baseLt: validBaseLt || (prevItem && prevItem.baseLt) || '',
            fe: feClean
        };
    }

    function applyLiveGvizTable(table) {
        if (!table || !Array.isArray(table.rows) || !Array.isArray(table.cols)) return false;

        let headers = table.cols.map(c => normHeader((c && c.label) || ''));
        let startRowIdx = 0;

        if (!headers[0] && table.rows.length > 0 && Array.isArray(table.rows[0].c)) {
            headers = table.rows[0].c.map(cell => normHeader((cell && cell.v != null) ? cell.v : ''));
            startRowIdx = 1;
        }

        function findCol(names) {
            const list = Array.isArray(names) ? names : [names];
            for (let k = 0; k < list.length; k++) {
                const idx = headers.indexOf(normHeader(list[k]));
                if (idx !== -1) return idx;
            }
            return -1;
        }

        function resolveWarehouseCol(whLabel) {
            const raw = String(whLabel || '').trim();
            const noParens = raw.replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();
            const candidates = [raw, noParens];
            if (/^(LPPT|LLPT)$/i.test(noParens)) {
                candidates.push('LPPT', 'LLPT');
            }
            return findCol(candidates);
        }

        const colSku = findCol('SKU');
        const colCedis = findCol(['CEDIS BODEGA', 'CEDIS (BODEGA)', 'CEDIS']);
        const colCasa = findCol(['CASA CREATA BODEGA', 'CASA CREATA (BODEGA)', 'CASA CREATA']);

        if (colSku === -1 || colCedis === -1 || colCasa === -1) {
            return false;
        }

        const colTp = findCol('TIPO DE PRODUCTO');
        const colMo = findCol('MODELO');
        const colNombre = findCol('NOMBRE');
        const colVar = findCol('VARIANTE');
        const colFoto = findCol('FOTO');
        const colCat = findCol('CATEGORIA');
        const colTela = findCol('TELA');
        const colColorTela = findCol('COLOR DE TELA');
        const colMadera = findCol('MADERA');
        const colColorMadera = findCol('COLOR DE MADERA');
        const colMat = findCol('MATERIALES');
        const colMed = findCol('MEDIDAS');
        const colProv = findCol('PROVEEDOR');
        const colPrecio = findCol('PRECIO');
        const colLt = findCol(['TIEMPO DE ENTREGA (DIAS)', 'TIEMPO DE ENTREGA']);
        const colFe = findCol(['FECHA ESTIMADA DE LLEGADA', 'FECHA ESTIMADA']);
        const whCols = WAREHOUSES.map(wh => resolveWarehouseCol(wh));

        const liveItems = [];

        for (let i = startRowIdx; i < table.rows.length; i++) {
            const rowCells = (table.rows[i] && table.rows[i].c) || [];
            const sku = cleanStr(gvizCellRaw(rowCells, colSku));
            if (!sku || sku.toUpperCase() === 'SKU') continue;
            const skuUpper = sku.toUpperCase();
            const prevIt = bySkuMap.get(skuUpper);

            const st = new Array(WAREHOUSES.length);
            for (let w = 0; w < WAREHOUSES.length; w++) {
                const wIdx = whCols[w];
                const rawStock = wIdx !== -1 ? gvizCellRaw(rowCells, wIdx) : 0;
                const numStock = Number(rawStock);
                st[w] = (!isNaN(numStock) && isFinite(numStock)) ? Math.max(0, Math.round(numStock)) : 0;
            }

            const baseLtVal = normalizeLeadTimeVal(gvizCellRaw(rowCells, colLt));
            const rawFe = colFe !== -1 ? cleanStr(gvizCellFormatted(rowCells, colFe)) : '';
            const lpptInfo = computeLpptAndLeadTime(skuUpper, baseLtVal, st[0], rawFe, prevIt);

            if (isLpptWarehouse(WAREHOUSES[0])) {
                st[0] = lpptInfo.lpptQty;
            }

            const rawPr = colPrecio !== -1 ? gvizCellFormatted(rowCells, colPrecio) : '';
            const prFormatted = formatPrice(rawPr) || (prevIt && formatPrice(prevIt.pr)) || '';

            liveItems.push({
                s: sku,
                tp: cleanStr(gvizCellRaw(rowCells, colTp)) || (prevIt && prevIt.tp) || '',
                mo: cleanStr(gvizCellRaw(rowCells, colMo)) || (prevIt && prevIt.mo) || '',
                n: cleanStr(gvizCellRaw(rowCells, colNombre)) || (prevIt && prevIt.n) || sku,
                vr: cleanStr(gvizCellRaw(rowCells, colVar)) || (prevIt && prevIt.vr) || '',
                f: cleanStr(gvizCellRaw(rowCells, colFoto)) || (prevIt && prevIt.f) || '',
                c: cleanStr(gvizCellRaw(rowCells, colCat)) || (prevIt && prevIt.c) || '',
                tl: cleanStr(gvizCellRaw(rowCells, colTela)) || (prevIt && prevIt.tl) || '',
                ct: cleanStr(gvizCellRaw(rowCells, colColorTela)) || (prevIt && prevIt.ct) || '',
                md: cleanStr(gvizCellRaw(rowCells, colMadera)) || (prevIt && prevIt.md) || '',
                cm: cleanStr(gvizCellRaw(rowCells, colColorMadera)) || (prevIt && prevIt.cm) || '',
                mt: cleanStr(gvizCellRaw(rowCells, colMat)) || (prevIt && prevIt.mt) || '',
                m: cleanStr(gvizCellRaw(rowCells, colMed)) || (prevIt && prevIt.m) || '',
                p: cleanStr(gvizCellRaw(rowCells, colProv)) || (prevIt && prevIt.p) || '',
                pr: prFormatted,
                lt: lpptInfo.lt,
                baseLt: lpptInfo.baseLt,
                fe: lpptInfo.fe,
                st: st
            });
        }

        if (liveItems.length === 0) return false;

        const nextSig = computeItemsSignature(liveItems);
        if (nextSig !== lastLiveSignature) {
            lastLiveSignature = nextSig;
            allItems = liveItems;
            window.CREATA_INV_DATA = liveItems;
            indexItemsAndGroups();

            const inp = document.getElementById('invSearchInput');
            applyFilter(inp ? inp.value : '', true);

            const modalEl = document.getElementById('productDetailModal');
            const isModalOpen = modalEl && modalEl.classList.contains('open');
            if (isModalOpen) {
                if (currentDetailItem) {
                    const refreshed = bySkuMap.get(String(currentDetailItem.s).toUpperCase());
                    if (refreshed) {
                        currentDetailItem = refreshed;
                        if (currentGroup) {
                            const updatedGrp = groupsByKey.get(refreshed._groupKey);
                            currentGroup = (updatedGrp && updatedGrp.items.length > 1) ? updatedGrp : null;
                        }
                        const crumbVisible = !document.getElementById('detGroupCrumb').classList.contains('hidden');
                        renderDetailModal(currentDetailItem, crumbVisible && !!currentGroup);
                    } else {
                        closeProductDetail();
                    }
                } else if (currentGroup) {
                    const refreshedGrp = groupsByKey.get(currentGroup.key);
                    if (refreshedGrp && refreshedGrp.items.length > 1) {
                        renderGroupVariantsStep(refreshedGrp);
                    } else if (refreshedGrp && refreshedGrp.items.length === 1) {
                        openProductDetail(refreshedGrp.items[0].s, false);
                    } else {
                        closeProductDetail();
                    }
                }
            }
        }

        return true;
    }

    function tryGvizSource(sheetId, queryParam) {
        return new Promise((resolve) => {
            if (!sheetId) {
                resolve(false);
                return;
            }
            const cbName = '__creataInvGviz_' + Date.now() + '_' + Math.floor(Math.random() * 99999);
            const script = document.createElement('script');
            const timer = setTimeout(() => {
                cleanup();
                resolve(false);
            }, 7000);

            function cleanup() {
                clearTimeout(timer);
                try { delete window[cbName]; } catch (e) { window[cbName] = undefined; }
                if (script.parentNode) script.parentNode.removeChild(script);
            }

            window[cbName] = function (resp) {
                cleanup();
                if (!resp || !resp.table) {
                    resolve(false);
                    return;
                }
                resolve(applyLiveGvizTable(resp.table));
            };

            script.onerror = function () {
                cleanup();
                resolve(false);
            };
            script.src = 'https://docs.google.com/spreadsheets/d/' + sheetId +
                '/gviz/tq?tqx=responseHandler:' + cbName +
                '&' + queryParam + '&_t=' + Date.now();
            document.head.appendChild(script);
        });
    }

    async function tryWebAppLiveSync() {
        try {
            const apiUrl = (window.CREATA_CLOUD_CONFIG && window.CREATA_CLOUD_CONFIG.getApiUrl)
                ? window.CREATA_CLOUD_CONFIG.getApiUrl()
                : '';
            if (!apiUrl) return false;
            const res = await fetch(apiUrl + '?action=cm_inventory&sheetId=' + encodeURIComponent(META.sheetId) + '&tab=' + encodeURIComponent(META.tabName || 'INVENTARIO_EN_VIVO') + '&_t=' + Date.now());
            if (!res.ok) return false;
            const json = await res.json();
            if (json && json.ok && Array.isArray(json.rows) && json.rows.length > 1) {
                const fakeTable = {
                    cols: json.rows[0].map(h => ({ label: String(h || '') })),
                    rows: json.rows.slice(1).map(r => ({ c: r.map(v => ({ v: v })) }))
                };
                return applyLiveGvizTable(fakeTable);
            }
        } catch (e) {}
        return false;
    }

    window.refreshLiveSheetNow = async function () {
        if (liveSyncInFlight) return;
        liveSyncInFlight = true;
        try {
            syncPendingKeyUpdatesToCloud().catch(() => {});
            await fetchLiveLpptOrders();
            let ok = false;
            if (META.gid != null) {
                ok = await tryGvizSource(META.sheetId, 'gid=' + encodeURIComponent(META.gid));
            }
            if (!ok) {
                ok = await tryGvizSource(META.sheetId, 'sheet=' + encodeURIComponent(META.tabName || 'INVENTARIO_EN_VIVO'));
            }
            if (!ok) {
                await tryWebAppLiveSync();
            }
        } finally {
            liveSyncInFlight = false;
        }
    };

    async function unpackInitialInventoryIfNeeded() {
        if (Array.isArray(allItems) && allItems.length > 0) return;
        if (typeof window.CREATA_INV_GZ === 'string' && window.CREATA_INV_GZ.length > 0 && typeof DecompressionStream !== 'undefined') {
            try {
                const binStr = atob(window.CREATA_INV_GZ);
                const bytes = new Uint8Array(binStr.length);
                for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
                const ds = new DecompressionStream('gzip');
                const stream = new Blob([bytes]).stream().pipeThrough(ds);
                const jsonText = await new Response(stream).text();
                const cols = JSON.parse(jsonText);
                if (Array.isArray(cols) && cols.length >= 16 && Array.isArray(cols[0])) {
                    const len = cols[0].length;
                    const unpacked = new Array(len);
                    for (let i = 0; i < len; i++) {
                        const sku = cleanStr(cols[0][i]);
                        unpacked[i] = {
                            s: sku,
                            tp: cleanStr(cols[1][i]),
                            mo: cleanStr(cols[2][i]),
                            n: cleanStr(cols[3][i]) || sku,
                            vr: cleanStr(cols[4][i]),
                            f: cleanStr(cols[5][i]),
                            c: cleanStr(cols[6][i]),
                            tl: cleanStr(cols[7][i]),
                            ct: cleanStr(cols[8][i]),
                            md: cleanStr(cols[9][i]),
                            cm: cleanStr(cols[10][i]),
                            mt: cleanStr(cols[11][i]),
                            m: cleanStr(cols[12][i]),
                            p: cleanStr(cols[13][i]),
                            lt: normalizeLeadTimeVal(cols[14][i]),
                            st: Array.isArray(cols[15][i]) ? cols[15][i] : emptyStocks(),
                            pr: cols.length > 16 ? formatPrice(cols[16][i]) : '',
                            fe: cols.length > 17 ? cleanStr(cols[17][i]) : '',
                            baseLt: cols.length > 20 ? normalizeLeadTimeVal(cols[20][i]) : normalizeLeadTimeVal(cols[14][i])
                        };
                    }
                    allItems = unpacked;
                    window.CREATA_INV_DATA = unpacked;
                }
            } catch (err) {
                console.error('[Inventario Unpack Error]', err);
            }
        }
    }

    document.addEventListener('DOMContentLoaded', async function () {
        openAuthModalForStartup();
        loadErpCatalogLiveFromSheet().then(() => {
            if (activeAdvisorSession) {
                if (!activeAdvisorSession.erpAdvisorLabel && erpAdvisorsCatalog.length > 0) {
                    const matched = matchBestErpAdvisorClient(activeAdvisorSession.nombre, activeAdvisorSession.erpStore, erpAdvisorsCatalog);
                    if (matched) {
                        activeAdvisorSession.erpAdvisorLabel = matched.label;
                        activeAdvisorSession.erpAdvisorId = matched.id;
                        activeAdvisorSession.erpAdvisorBranch = matched.branch;
                        saveAdvisorSession(activeAdvisorSession);
                        renderAdvisorHeaderBar();
                    }
                }
                populateQuoteAdvisorControls();
            }
        });

        await unpackInitialInventoryIfNeeded();
        lastLiveSignature = computeItemsSignature(allItems);
        indexItemsAndGroups();
        updateCartBadge();
        const inp = document.getElementById('invSearchInput');
        if (inp) {
            inp.addEventListener('input', function () {
                applyFilter(this.value);
            });
            if (activeAdvisorSession && !activeAdvisorSession.mustChangeKey) {
                inp.focus();
            }
        }
        applyFilter('');
        refreshLiveSheetNow();
        setInterval(function () {
            if (document.visibilityState !== 'hidden') {
                refreshLiveSheetNow();
            }
        }, 12000);
        window.addEventListener('focus', refreshLiveSheetNow);
        window.addEventListener('online', refreshLiveSheetNow);
        document.addEventListener('visibilitychange', function () {
            if (document.visibilityState === 'visible') {
                refreshLiveSheetNow();
            }
        });
    });
})();
