(function () {
    'use strict';

    const META = window.CREATA_INV_META || {
        sheetId: '1xewqWPOlR5LMEFQXq1KsqvObg9PPlTkRGqfZ_4Iiv-8',
        tabName: 'INVENTARIO_EN_VIVO',
        fallbackSheetId: '1PSLq2QftivCNC5wr83A-hCvZDH2sdJ0J9t9NzTSKfxY',
        fallbackGid: 1757610943,
        warehouses: ['CEDIS', 'CASA CREATA', 'PUERTO CANCUN', 'COLOSIO', 'PLAYA']
    };
    const WAREHOUSES = META.warehouses || ['CEDIS', 'CASA CREATA', 'PUERTO CANCUN', 'COLOSIO', 'PLAYA'];
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

    // Distancia Damerau-Levenshtein <= 1 (incluye transposición ej. "apiezno" <-> "apienso")
    function isOneEditOrTransposition(a, b) {
        if (a === b) return true;
        const la = a.length;
        const lb = b.length;
        if (Math.abs(la - lb) > 1) return false;

        let i = 0;
        while (i < la && i < lb && a[i] === b[i]) i++;
        if (i === la && i === lb) return true;

        // Sustitución o transposición adyacente cuando tienen el mismo largo
        if (la === lb) {
            if (a.slice(i + 1) === b.slice(i + 1)) return true;
            if (i + 1 < la && a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2)) {
                return true;
            }
            return false;
        }
        // Inserción / eliminación de 1 letra
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

    function resolveDriveOrImgUrl(raw) {
        const s = cleanStr(raw);
        if (!s) return '';
        const m = s.match(/\/d\/([a-zA-Z0-9_-]{15,})/) || s.match(/[?&]id=([a-zA-Z0-9_-]{15,})/);
        if (m) return 'https://drive.google.com/thumbnail?id=' + m[1] + '&sz=w1000';
        if (/^https?:\/\//i.test(s) || s.startsWith('data:image/')) return s;
        return '';
    }

    function computeGroupTitle(it) {
        const tp = cleanStr(it.tp).toUpperCase();
        const mo = cleanStr(it.mo).toUpperCase();
        if (tp && mo) return tp + ' ' + mo;
        return cleanStr(it.n || it.s).toUpperCase();
    }

    function indexItemsAndGroups() {
        bySkuMap.clear();
        groupsByKey.clear();
        allGroups = [];

        for (let i = 0; i < allItems.length; i++) {
            const it = allItems[i];
            if (!Array.isArray(it.st)) it.st = [0, 0, 0, 0, 0];
            const skuKey = String(it.s || '').trim().toUpperCase();
            if (!skuKey) continue;

            const title = computeGroupTitle(it);
            const gKey = normalizePlain(title) || skuKey.toLowerCase();
            it._groupKey = gKey;
            it._groupTitle = title;

            const rawText = [
                it.s, title, it.n, it.vr, it.tp, it.mo, it.c,
                it.tl, it.ct, it.md, it.cm, it.mt, it.m, it.p
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
    function applyFilter(query) {
        const rawTrim = String(query || '').trim();
        const clearBtn = document.getElementById('invClearBtn');
        if (clearBtn) clearBtn.style.display = rawTrim ? 'block' : 'none';

        if (!rawTrim) {
            filteredGroups = allGroups;
        } else {
            // Si coincide con un SKU exacto, mostrar el grupo al que pertenece ese SKU
            const exactSkuItem = bySkuMap.get(rawTrim.toUpperCase());
            if (exactSkuItem && groupsByKey.has(exactSkuItem._groupKey)) {
                filteredGroups = [groupsByKey.get(exactSkuItem._groupKey)];
            } else {
                const qNorm = normSearch(rawTrim);
                const qTokens = qNorm.split(/\s+/).filter(Boolean);

                // Paso 1: coincidencia de todos los términos contra el grupo y sus variantes
                let matches = allGroups.filter(grp => {
                    for (let i = 0; i < qTokens.length; i++) {
                        if (!tokenMatchesGroup(qTokens[i], grp)) return false;
                    }
                    return true;
                });

                // Paso 2: si el usuario escribió nombre completo con tela/color inexistente en bodega
                // (ej. "Apienso sillon drill charcoal"), mostrar el grupo cuyo TIPO + MODELO coincida
                if (matches.length === 0 && qTokens.length >= 2) {
                    matches = allGroups.filter(grp => {
                        if (!grp.mo || grp._titleTokens.length === 0) return false;
                        // Todos los tokens del título del grupo (ej. ["siyon", "apienso"]) deben venir en la consulta
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

                // Paso 3: coincidencia exclusiva por modelo si el modelo es único (>= 5 letras)
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

        renderedCount = 0;
        const container = document.getElementById('invListContainer');
        if (container) container.innerHTML = '';
        renderMoreItems();
    }

    window.renderMoreItems = function () {
        const container = document.getElementById('invListContainer');
        const moreWrap = document.getElementById('invLoadMoreWrap');
        if (!container) return;

        if (filteredGroups.length === 0) {
            container.innerHTML = '';
            if (moreWrap) moreWrap.classList.add('hidden');
            return;
        }

        const nextEnd = Math.min(renderedCount + PAGE_SIZE, filteredGroups.length);
        const frag = document.createDocumentFragment();

        for (let i = renderedCount; i < nextEnd; i++) {
            const grp = filteredGroups[i];
            const row = document.createElement('div');
            row.className = 'inv-row';

            if (grp.items.length > 1) {
                // Producto con múltiples variantes: mostrar SOLO 1 renglón con TIPO + MODELO (ej. SILLON APIENZO)
                row.onclick = function () { openGroupModal(grp.key); };
                row.innerHTML =
                    '<div class="min-w-0 flex-1 pr-2">' +
                        '<div class="text-sm font-bold uppercase leading-snug" style="color:#252C32;">' + escapeHtml(grp.title) + '</div>' +
                    '</div>' +
                    '<svg class="w-4 h-4 shrink-0" style="color:#A38251;" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
                        '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M9 5l7 7-7 7"></path>' +
                    '</svg>';
            } else {
                // Producto de 1 sola pieza/SKU
                const it = grp.items[0];
                const skuKey = String(it.s || '').toUpperCase();
                const inCartQty = cart[skuKey] ? cart[skuKey].qty : 0;
                row.onclick = function () { openProductDetail(it.s, false); };
                row.innerHTML =
                    '<div class="min-w-0 flex-1 pr-2">' +
                        '<div class="text-sm font-bold uppercase leading-snug" style="color:#252C32;">' + escapeHtml(grp.title || it.n || it.s) + '</div>' +
                        '<div class="text-xs font-semibold tracking-wider mt-0.5" style="color:#A38251;">' + escapeHtml(it.s) + '</div>' +
                    '</div>' +
                    '<button type="button" data-sku-btn="' + escapeHtml(skuKey) + '" class="cart-plus-btn ' + (inCartQty > 0 ? 'in-cart' : '') + '">' +
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
    window.openGroupModal = function (groupKey) {
        const grp = groupsByKey.get(groupKey);
        if (!grp) return false;
        if (grp.items.length === 1) {
            return openProductDetail(grp.items[0].s, false);
        }

        currentGroup = grp;
        currentDetailItem = null;

        const crumbEl = document.getElementById('detGroupCrumb');
        const skuEl = document.getElementById('detSku');
        const nameEl = document.getElementById('detName');
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
        if (nameEl) nameEl.textContent = grp.title;
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
                    '<button type="button" data-sku-btn="' + escapeHtml(skuKey) + '" class="cart-plus-btn ' + (inCartQty > 0 ? 'in-cart' : '') + '">' +
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
        if (nameEl) {
            nameEl.textContent = cleanStr(it.n) || cleanStr(it._groupTitle) || it.s || '';
        }
        if (addBtn) {
            addBtn.classList.remove('hidden');
            const key = String(it.s || '').toUpperCase();
            const q = cart[key] ? cart[key].qty : 0;
            addBtn.textContent = q > 0 ? ('+ Carrito (' + q + ')') : '+ Carrito';
        }

        // Cuadro de 1 sola foto (completamente limpio y sin textos cuando está vacío)
        const photoUrl = resolveDriveOrImgUrl(it.f);
        const imgEl = document.getElementById('detPhotoImg');
        const emptyEl = document.getElementById('detPhotoEmpty');
        if (photoUrl) {
            imgEl.src = photoUrl;
            imgEl.classList.remove('hidden');
            emptyEl.classList.add('hidden');
            imgEl.onerror = function () {
                imgEl.classList.add('hidden');
                emptyEl.classList.remove('hidden');
            };
        } else {
            imgEl.src = '';
            imgEl.classList.add('hidden');
            emptyEl.classList.remove('hidden');
        }

        // Stock Total y Semáforo por Bodega (sin frases de relleno)
        const stocks = Array.isArray(it.st) ? it.st : [0, 0, 0, 0, 0];
        let total = 0;
        const whHtml = [];

        for (let i = 0; i < WAREHOUSES.length; i++) {
            const qty = Math.max(0, Number(stocks[i]) || 0);
            total += qty;

            let semClass = 'sem-green';
            let dotColor = '#10B981';
            if (qty <= 0) {
                semClass = 'sem-red';
                dotColor = '#EF4444';
            } else if (qty <= DEFAULT_MIN_STOCK) {
                semClass = 'sem-yellow';
                dotColor = '#F59E0B';
            }

            whHtml.push(
                '<div class="rounded-xl border px-3.5 py-3 flex items-center justify-between ' + semClass + '">' +
                    '<div class="flex items-center gap-2 min-w-0 pr-2">' +
                        '<span class="w-2.5 h-2.5 rounded-full inline-block shrink-0" style="background:' + dotColor + ';"></span>' +
                        '<span class="text-xs font-extrabold uppercase tracking-wide truncate">' + escapeHtml(WAREHOUSES[i]) + '</span>' +
                    '</div>' +
                    '<span class="text-lg font-black shrink-0">' + qty + '</span>' +
                '</div>'
            );
        }

        document.getElementById('detTotalStock').textContent = String(total);
        document.getElementById('detWarehousesGrid').innerHTML = whHtml.join('');

        // Columnas dedicadas del producto: SOLO se renderizan las que tengan dato real (cero texto vacío)
        const ltNum = Number(it.lt);
        const ltDisplay = (it.lt !== '' && it.lt !== null && it.lt !== undefined && !isNaN(ltNum) && ltNum > 0)
            ? (ltNum + ' días')
            : '';

        const candidateSpecs = [
            ['Tipo de producto', cleanStr(it.tp)],
            ['Modelo', cleanStr(it.mo)],
            ['Tela', cleanStr(it.tl)],
            ['Color de tela', cleanStr(it.ct)],
            ['Madera', cleanStr(it.md)],
            ['Color de madera', cleanStr(it.cm)],
            ['Materiales', cleanStr(it.mt)],
            ['Medidas', cleanStr(it.m)],
            ['Proveedor', cleanStr(it.p)],
            ['Tiempo de entrega', ltDisplay]
        ].filter(pair => pair[1] !== '');

        const specsWrap = document.getElementById('detSpecsWrap');
        const specsGrid = document.getElementById('detSpecsGrid');
        if (candidateSpecs.length > 0) {
            specsGrid.innerHTML = candidateSpecs.map(([label, val]) =>
                '<div class="rounded-lg p-2.5 border" style="border-color:#E8E4DE; background:#FAFAFA;">' +
                    '<span class="block text-[10px] font-extrabold uppercase tracking-wider" style="color:#A38251;">' + escapeHtml(label) + '</span>' +
                    '<span class="block text-xs font-bold mt-0.5" style="color:#252C32;">' + escapeHtml(val) + '</span>' +
                '</div>'
            ).join('');
            specsWrap.classList.remove('hidden');
        } else {
            specsGrid.innerHTML = '';
            specsWrap.classList.add('hidden');
        }
    }

    // ------------------------------------------------------------------------
    // CARRITO DE SELECCIÓN
    // ------------------------------------------------------------------------
    window.addToCart = function (skuRaw, delta) {
        const key = String(skuRaw || '').trim().toUpperCase();
        const it = bySkuMap.get(key);
        if (!it) return;
        if (!cart[key]) {
            cart[key] = { sku: it.s, name: cleanStr(it.n) || it.s, qty: 0 };
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
                addBtn.textContent = q > 0 ? ('+ Carrito (' + q + ')') : '+ Carrito';
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
        if (!wrap) return;
        const entries = Object.values(cart);
        if (!entries.length) {
            wrap.innerHTML = '';
            return;
        }
        wrap.innerHTML = entries.map(row => {
            const key = String(row.sku).toUpperCase();
            return '<div class="rounded-xl border p-3 flex items-center justify-between gap-2" style="border-color:#E8E4DE;">' +
                '<div class="min-w-0 flex-1 cursor-pointer" onclick="closeCartModal(); openProductDetail(\'' + escapeHtml(key) + '\', false)">' +
                    '<div class="text-xs font-extrabold uppercase truncate" style="color:#252C32;">' + escapeHtml(row.name) + '</div>' +
                    '<div class="text-[11px] font-bold" style="color:#A38251;">' + escapeHtml(row.sku) + '</div>' +
                '</div>' +
                '<div class="flex items-center gap-1.5 shrink-0">' +
                    '<button type="button" onclick="addToCart(\'' + escapeHtml(key) + '\', -1)" class="w-7 h-7 rounded-full border text-sm font-bold" style="border-color:#E1DBC5;">−</button>' +
                    '<span class="w-7 text-center text-xs font-extrabold">' + row.qty + '</span>' +
                    '<button type="button" onclick="addToCart(\'' + escapeHtml(key) + '\', 1)" class="w-7 h-7 rounded-full border text-sm font-bold" style="border-color:#A38251; background:#A38251; color:#FFF;">+</button>' +
                '</div>' +
            '</div>';
        }).join('');
    }

    window.copyCartSummary = function () {
        const entries = Object.values(cart);
        if (!entries.length) return;
        const lines = entries.map(r => r.qty + 'x [' + r.sku + '] ' + r.name);
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(lines.join('\n'));
        }
        const btn = document.getElementById('copyCartBtn');
        if (btn) {
            const prev = btn.textContent;
            btn.textContent = '✓';
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
                // 1. Si es un SKU exacto (escáner Bluetooth o tecleado directo), abrir directo la variante
                if (openProductDetail(val, false)) {
                    ev.preventDefault();
                    document.activeElement.select();
                    return;
                }
                // 2. Si solo hay 1 grupo filtrado, abrir sus variantes o su ficha
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
    // SINCRONIZACIÓN EN VIVO CON INVENTARIO_EN_VIVO (HOJA DE PRESENTACIÓN)
    // ------------------------------------------------------------------------
    let liveSyncInFlight = false;

    function applyLiveGvizTable(table) {
        if (!table || !Array.isArray(table.rows) || !Array.isArray(table.cols)) return false;

        // Extraer nombres de columnas desde table.cols o desde la primera fila
        let headers = table.cols.map(c => String((c && c.label) || '').trim().toUpperCase());
        let startRowIdx = 0;

        if (!headers[0] && table.rows.length > 0 && Array.isArray(table.rows[0].c)) {
            headers = table.rows[0].c.map(cell => String((cell && cell.v != null) ? cell.v : '').trim().toUpperCase());
            startRowIdx = 1;
        }

        const skuIdx = headers.indexOf('SKU');
        const cedisIdx = headers.indexOf('CEDIS');
        const casaIdx = headers.indexOf('CASA CREATA');

        // Guardia estricta: si la hoja devuelta por GViz NO tiene SKU en col 0 + CEDIS + CASA CREATA,
        // significa que la pestaña INVENTARIO_EN_VIVO aún no existe en ese documento (GViz devolvió la hoja 1).
        if (skuIdx !== 0 || cedisIdx < 8 || casaIdx < 9) {
            return false;
        }

        const isEnriched20Col = headers.indexOf('TIPO DE PRODUCTO') !== -1 && cedisIdx >= 14;
        let updated = 0;
        let structureAdded = false;

        for (let i = startRowIdx; i < table.rows.length; i++) {
            const rowCells = (table.rows[i] && table.rows[i].c) || [];
            const r = rowCells.map(cell => (cell && cell.v != null) ? cell.v : '');
            const sku = cleanStr(r[0]);
            if (!sku || sku.toUpperCase() === 'SKU') continue;

            const key = sku.toUpperCase();
            let it = bySkuMap.get(key);

            if (isEnriched20Col) {
                // Esquema de 20 columnas en CONTROL DE PRODUCTOS PRESENTACIÓN -> INVENTARIO_EN_VIVO
                if (!it) {
                    it = {
                        s: sku,
                        tp: cleanStr(r[1]),
                        mo: cleanStr(r[2]),
                        n: cleanStr(r[3]) || sku,
                        vr: cleanStr(r[4]),
                        f: cleanStr(r[5]),
                        c: cleanStr(r[6]),
                        tl: cleanStr(r[7]),
                        ct: cleanStr(r[8]),
                        md: cleanStr(r[9]),
                        cm: cleanStr(r[10]),
                        mt: cleanStr(r[11]),
                        m: cleanStr(r[12]),
                        p: cleanStr(r[13]),
                        lt: r[14] !== '' && r[14] != null ? Number(r[14]) || '' : '',
                        st: [0, 0, 0, 0, 0]
                    };
                    allItems.push(it);
                    structureAdded = true;
                } else {
                    if (cleanStr(r[1])) it.tp = cleanStr(r[1]);
                    if (cleanStr(r[2])) it.mo = cleanStr(r[2]);
                    if (cleanStr(r[3])) it.n = cleanStr(r[3]);
                    if (cleanStr(r[4])) it.vr = cleanStr(r[4]);
                    it.f = cleanStr(r[5]);
                    if (cleanStr(r[6])) it.c = cleanStr(r[6]);
                    it.tl = cleanStr(r[7]);
                    it.ct = cleanStr(r[8]);
                    it.md = cleanStr(r[9]);
                    it.cm = cleanStr(r[10]);
                    it.mt = cleanStr(r[11]);
                    it.m = cleanStr(r[12]);
                    if (cleanStr(r[13])) it.p = cleanStr(r[13]);
                    it.lt = r[14] !== '' && r[14] != null ? (Number(r[14]) || '') : '';
                }
                it.st = [
                    Number(r[cedisIdx]) || 0,
                    Number(r[cedisIdx + 1]) || 0,
                    Number(r[cedisIdx + 2]) || 0,
                    Number(r[cedisIdx + 3]) || 0,
                    Number(r[cedisIdx + 4]) || 0
                ];
            } else {
                // Esquema legado de 15 columnas: actualizar foto y existencias en vivo sin borrar columnas dedicadas enriquecidas
                if (!it) {
                    it = {
                        s: sku,
                        tp: '',
                        mo: '',
                        n: cleanStr(r[1]) || sku,
                        vr: cleanStr(r[1]) || sku,
                        f: cleanStr(r[2]),
                        c: cleanStr(r[3]),
                        tl: cleanStr(r[6]),
                        ct: '',
                        md: '',
                        cm: '',
                        mt: '',
                        m: cleanStr(r[7]),
                        p: cleanStr(r[8]),
                        lt: r[9] ? Number(r[9]) || '' : '',
                        st: [0, 0, 0, 0, 0]
                    };
                    allItems.push(it);
                    structureAdded = true;
                } else {
                    if (cleanStr(r[2])) it.f = cleanStr(r[2]);
                }
                it.st = [
                    Number(r[cedisIdx]) || 0,
                    Number(r[cedisIdx + 1]) || 0,
                    Number(r[cedisIdx + 2]) || 0,
                    Number(r[cedisIdx + 3]) || 0,
                    Number(r[cedisIdx + 4]) || 0
                ];
            }
            updated++;
        }

        if (updated > 0) {
            if (structureAdded || isEnriched20Col) {
                indexItemsAndGroups();
                const inp = document.getElementById('invSearchInput');
                applyFilter(inp ? inp.value : '');
            }
            if (currentDetailItem) {
                const refreshed = bySkuMap.get(String(currentDetailItem.s).toUpperCase());
                if (refreshed) {
                    currentDetailItem = refreshed;
                    const crumbVisible = !document.getElementById('detGroupCrumb').classList.contains('hidden');
                    renderDetailModal(currentDetailItem, crumbVisible);
                }
            }
        }
        return updated > 0;
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
            }, 6000);

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
            const res = await fetch(apiUrl + '?action=cm_inventory&sheetId=' + encodeURIComponent(META.sheetId) + '&tab=' + encodeURIComponent(META.tabName) + '&_t=' + Date.now());
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
        const dot = document.getElementById('liveSyncDot');
        if (dot) dot.style.opacity = '0.4';
        try {
            // 1. Intentar primero la pestaña INVENTARIO_EN_VIVO del documento CONTROL DE PRODUCTOS PRESENTACIÓN
            let ok = await tryGvizSource(META.sheetId, 'sheet=' + encodeURIComponent(META.tabName || 'INVENTARIO_EN_VIVO'));
            // 2. Respaldo WebApp si está activo
            if (!ok) {
                ok = await tryWebAppLiveSync();
            }
            // 3. Respaldo en vivo hacia la hoja previa mientras se habilita edición o se importa INVENTARIO_EN_VIVO
            if (!ok && META.fallbackSheetId && META.fallbackGid != null) {
                await tryGvizSource(META.fallbackSheetId, 'gid=' + encodeURIComponent(META.fallbackGid));
            }
        } finally {
            if (dot) dot.style.opacity = '1';
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
                        unpacked[i] = {
                            s: cols[0][i] || '',
                            tp: cols[1][i] || '',
                            mo: cols[2][i] || '',
                            n: cols[3][i] || '',
                            vr: cols[4][i] || '',
                            f: cols[5][i] || '',
                            c: cols[6][i] || '',
                            tl: cols[7][i] || '',
                            ct: cols[8][i] || '',
                            md: cols[9][i] || '',
                            cm: cols[10][i] || '',
                            mt: cols[11][i] || '',
                            m: cols[12][i] || '',
                            p: cols[13][i] || '',
                            lt: cols[14][i] === '' || cols[14][i] == null ? '' : cols[14][i],
                            st: cols[15][i] || [0, 0, 0, 0, 0]
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
        setInterval(refreshLiveSheetNow, 20000);
        window.addEventListener('focus', refreshLiveSheetNow);
    });
})();
