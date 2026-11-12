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

        if (varList) {
            varList.innerHTML = grp.items.map(it => {
                const skuKey = String(it.s || '').toUpperCase();
                const inCartQty = cart[skuKey] ? cart[skuKey].qty : 0;
                const varLabel = cleanStr(it.vr) || cleanStr(it.tl) || cleanStr(it.md) || cleanStr(it.n) || it.s;
                return '<div class="inv-row" data-var-sku="' + escapeHtml(skuKey) + '">' +
                    '<div class="min-w-0 flex-1 pr-2">' +
                        '<div class="text-sm font-bold uppercase leading-snug" style="color:#252C32;">' + escapeHtml(varLabel) + '</div>' +
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
    // COTIZACIÓN DE PRODUCTOS (ANTES CARRITO)
    // ------------------------------------------------------------------------
    window.addToCart = function (skuRaw, delta) {
        const key = String(skuRaw || '').trim().toUpperCase();
        const it = bySkuMap.get(key);
        if (!it) return;
        if (!cart[key]) {
            cart[key] = {
                sku: it.s,
                name: cleanStr(it.n) || it.s,
                price: formatPrice(it.pr),
                qty: 0
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

    window.openCartModal = function () {
        renderCartItems();
        document.getElementById('cartModal').classList.add('open');
    };

    window.closeCartModal = function () {
        document.getElementById('cartModal').classList.remove('open');
    };

    window.clearCart = function () {
        cart = {};
        saveCart();
        renderCartItems();
        const inp = document.getElementById('invSearchInput');
        applyFilter(inp ? inp.value : '');
    };

    function renderCartItems() {
        const wrap = document.getElementById('cartItemsContainer');
        const totalBar = document.getElementById('cartTotalBar');
        const totalAmtEl = document.getElementById('cartTotalAmount');
        if (!wrap) return;
        const entries = Object.values(cart);
        if (!entries.length) {
            wrap.innerHTML = '<div class="text-center py-6 text-xs font-semibold opacity-60">No hay productos en la cotización.</div>';
            if (totalBar) totalBar.classList.add('hidden');
            return;
        }
        let grandTotal = 0;
        wrap.innerHTML = entries.map(row => {
            const key = String(row.sku).toUpperCase();
            const liveIt = bySkuMap.get(key);
            const itemName = (liveIt && cleanStr(liveIt.n)) || row.name || row.sku;
            const itemPriceStr = (liveIt && formatPrice(liveIt.pr)) || formatPrice(row.price);
            const unitNum = parsePriceNum(itemPriceStr);
            const qty = Number(row.qty) || 0;
            const subTotal = unitNum * qty;
            grandTotal += subTotal;
            const subTotalStr = subTotal > 0 ? formatPrice(subTotal) : '';

            return '<div class="rounded-xl border p-3 flex items-center justify-between gap-2" style="border-color:#E8E4DE;">' +
                '<div class="min-w-0 flex-1 cursor-pointer" onclick="closeCartModal(); openProductDetail(\'' + escapeHtml(key) + '\', false)">' +
                    '<div class="text-xs font-extrabold uppercase leading-snug" style="color:#252C32;">' +
                        formatTitleWithPriceHtml(itemName, itemPriceStr) +
                    '</div>' +
                    '<div class="text-[11px] font-bold mt-0.5" style="color:#A38251;">' +
                        escapeHtml(row.sku) +
                        (subTotalStr && qty > 1 ? (' · Subtotal: ' + escapeHtml(subTotalStr)) : '') +
                    '</div>' +
                '</div>' +
                '<div class="flex items-center gap-1.5 shrink-0">' +
                    '<button type="button" onclick="addToCart(\'' + escapeHtml(key) + '\', -1)" class="w-7 h-7 rounded-full border text-sm font-bold" style="border-color:#E1DBC5;">−</button>' +
                    '<span class="w-7 text-center text-xs font-extrabold">' + qty + '</span>' +
                    '<button type="button" onclick="addToCart(\'' + escapeHtml(key) + '\', 1)" class="w-7 h-7 rounded-full border text-sm font-bold" style="border-color:#A38251; background:#A38251; color:#FFF;">+</button>' +
                '</div>' +
            '</div>';
        }).join('');

        if (totalBar && totalAmtEl) {
            if (grandTotal > 0) {
                totalAmtEl.textContent = formatPrice(grandTotal);
                totalBar.classList.remove('hidden');
            } else {
                totalBar.classList.add('hidden');
            }
        }
    }

    window.copyCartSummary = function () {
        const entries = Object.values(cart);
        if (!entries.length) return;
        let grandTotal = 0;
        const lines = entries.map(r => {
            const key = String(r.sku).toUpperCase();
            const liveIt = bySkuMap.get(key);
            const itemName = (liveIt && cleanStr(liveIt.n)) || r.name || r.sku;
            const itemPriceStr = (liveIt && formatPrice(liveIt.pr)) || formatPrice(r.price);
            const unitNum = parsePriceNum(itemPriceStr);
            const qty = Number(r.qty) || 0;
            grandTotal += unitNum * qty;
            return qty + 'x [' + r.sku + '] ' + formatTitleWithPricePlain(itemName, itemPriceStr);
        });
        if (grandTotal > 0) {
            lines.push('TOTAL COTIZACIÓN: ' + formatPrice(grandTotal));
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(lines.join('\n'));
        }
        const btn = document.getElementById('copyCartBtn');
        if (btn) {
            const prev = btn.textContent;
            btn.textContent = '✓ Copiado';
            setTimeout(() => { btn.textContent = prev; }, 900);
        }
    };

    // ------------------------------------------------------------------------
    // ESCÁNER BLUETOOTH (HID KEYBOARD WEDGE) + ENTER DIRECTO EN BUSCADOR
    // ------------------------------------------------------------------------
    let scanBuffer = '';
    let lastKeyTime = 0;

    document.addEventListener('keydown', function (ev) {
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

        if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;

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
        await unpackInitialInventoryIfNeeded();
        lastLiveSignature = computeItemsSignature(allItems);
        indexItemsAndGroups();
        updateCartBadge();
        const inp = document.getElementById('invSearchInput');
        if (inp) {
            inp.addEventListener('input', function () {
                applyFilter(this.value);
            });
            inp.focus();
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
