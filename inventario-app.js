(function () {
    'use strict';

    const META = window.CREATA_INV_META || {
        sheetId: '1PSLq2QftivCNC5wr83A-hCvZDH2sdJ0J9t9NzTSKfxY',
        tabName: 'INVENTARIO_EN_VIVO',
        gid: 1757610943,
        warehouses: ['CEDIS', 'CASA CREATA', 'PUERTO CANCUN', 'COLOSIO', 'PLAYA']
    };
    const WAREHOUSES = META.warehouses || ['CEDIS', 'CASA CREATA', 'PUERTO CANCUN', 'COLOSIO', 'PLAYA'];
    const PAGE_SIZE = 80;
    const CART_KEY = 'creata_inv_open_cart_v1';
    const THRESH_KEY = 'creata_inv_warehouse_mins_v1';

    let allItems = Array.isArray(window.CREATA_INV_DATA) ? window.CREATA_INV_DATA : [];
    const bySkuMap = new Map();
    let filteredItems = [];
    let renderedCount = 0;
    let currentDetailItem = null;

    // Default yellow minimum = 2 pieces per warehouse (0 = Red, 1..min = Yellow, >min = Green)
    let warehouseMins = loadThresholds();
    let cart = loadCart();

    function normalizeText(str) {
        return String(str || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim();
    }

    function escapeHtml(str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function resolveDriveOrImgUrl(raw) {
        const s = String(raw || '').trim();
        if (!s) return '';
        const m = s.match(/\/d\/([a-zA-Z0-9_-]{15,})/) || s.match(/[?&]id=([a-zA-Z0-9_-]{15,})/);
        if (m) return 'https://drive.google.com/thumbnail?id=' + m[1] + '&sz=w1000';
        if (/^https?:\/\//i.test(s) || s.startsWith('data:image/')) return s;
        return '';
    }

    function indexItems() {
        bySkuMap.clear();
        for (let i = 0; i < allItems.length; i++) {
            const it = allItems[i];
            if (!Array.isArray(it.st)) it.st = [0, 0, 0, 0, 0];
            it._search = normalizeText([it.s, it.n, it.c, it.t, it.a, it.tl, it.m, it.p].join(' '));
            bySkuMap.set(String(it.s || '').trim().toUpperCase(), it);
        }
    }

    function loadThresholds() {
        try {
            const saved = JSON.parse(localStorage.getItem(THRESH_KEY) || 'null');
            if (Array.isArray(saved) && saved.length === WAREHOUSES.length) {
                return saved.map(n => Math.max(1, Number(n) || 2));
            }
        } catch (e) {}
        return WAREHOUSES.map(() => 2);
    }

    function saveThresholds() {
        try { localStorage.setItem(THRESH_KEY, JSON.stringify(warehouseMins)); } catch (e) {}
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
    // RENDERIZADO DEL LISTADO PRINCIPAL (ÚNICAMENTE NOMBRE, SKU Y BOTÓN +)
    // ------------------------------------------------------------------------
    function applyFilter(query) {
        const q = normalizeText(query);
        const clearBtn = document.getElementById('invClearBtn');
        if (clearBtn) clearBtn.style.display = q ? 'block' : 'none';

        if (!q) {
            filteredItems = allItems;
        } else {
            const tokens = q.split(/\s+/).filter(Boolean);
            filteredItems = allItems.filter(it => {
                for (let i = 0; i < tokens.length; i++) {
                    if (it._search.indexOf(tokens[i]) === -1) return false;
                }
                return true;
            });
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

        if (filteredItems.length === 0) {
            container.innerHTML = '<div class="text-center py-12 text-sm font-medium opacity-70">No se encontraron productos para esa búsqueda.</div>';
            if (moreWrap) moreWrap.classList.add('hidden');
            return;
        }

        const nextEnd = Math.min(renderedCount + PAGE_SIZE, filteredItems.length);
        const frag = document.createDocumentFragment();

        for (let i = renderedCount; i < nextEnd; i++) {
            const it = filteredItems[i];
            const skuKey = String(it.s || '').toUpperCase();
            const inCartQty = cart[skuKey] ? cart[skuKey].qty : 0;

            const row = document.createElement('div');
            row.className = 'inv-row';
            row.onclick = function () { openProductDetail(it.s); };
            row.innerHTML =
                '<div class="min-w-0 flex-1 pr-2">' +
                    '<div class="text-sm font-bold uppercase leading-snug" style="color:#252C32;">' + escapeHtml(it.n || it.s) + '</div>' +
                    '<div class="text-xs font-semibold tracking-wider mt-0.5" style="color:#A38251;">' + escapeHtml(it.s) + '</div>' +
                '</div>' +
                '<button type="button" data-sku-btn="' + escapeHtml(skuKey) + '" class="cart-plus-btn ' + (inCartQty > 0 ? 'in-cart' : '') + '" title="Agregar al carrito">' +
                    (inCartQty > 0 ? ('+' + inCartQty) : '+') +
                '</button>';

            const btn = row.querySelector('button');
            btn.onclick = function (ev) {
                ev.stopPropagation();
                addToCart(it.s, 1);
            };
            frag.appendChild(row);
        }

        container.appendChild(frag);
        renderedCount = nextEnd;

        if (moreWrap) {
            if (renderedCount < filteredItems.length) moreWrap.classList.remove('hidden');
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
    // VISTA DETALLE DE PRODUCTO + SEMÁFORO EN VIVO POR BODEGA
    // ------------------------------------------------------------------------
    window.openProductDetail = function (skuRaw) {
        const key = String(skuRaw || '').trim().toUpperCase();
        const it = bySkuMap.get(key);
        if (!it) return false;
        currentDetailItem = it;
        renderDetailModal(it);
        const modal = document.getElementById('productDetailModal');
        if (modal) modal.classList.add('open');
        refreshLiveSheetNow(false);
        return true;
    };

    window.closeProductDetail = function () {
        const modal = document.getElementById('productDetailModal');
        if (modal) modal.classList.remove('open');
        currentDetailItem = null;
    };

    function renderDetailModal(it) {
        document.getElementById('detSku').textContent = 'SKU · ' + (it.s || '-');
        document.getElementById('detName').textContent = it.n || it.s || '-';

        // Cuadro de 1 sola foto (vacío por ahora salvo que tenga link en la columna FOTO)
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

        // Stock Total y Semáforo por Bodega
        const stocks = Array.isArray(it.st) ? it.st : [0, 0, 0, 0, 0];
        let total = 0;
        const whHtml = [];

        for (let i = 0; i < WAREHOUSES.length; i++) {
            const qty = Math.max(0, Number(stocks[i]) || 0);
            total += qty;
            const minVal = Math.max(1, Number(warehouseMins[i]) || 2);

            let semClass = 'sem-green';
            let dotColor = '#10B981';
            let statusLabel = 'Disponible';
            if (qty <= 0) {
                semClass = 'sem-red';
                dotColor = '#EF4444';
                statusLabel = it.lt ? ('Agotado · Entrega ' + it.lt + ' días') : 'Agotado (0)';
            } else if (qty <= minVal) {
                semClass = 'sem-yellow';
                dotColor = '#F59E0B';
                statusLabel = 'Mínimo (≤ ' + minVal + ')';
            }

            whHtml.push(
                '<div class="rounded-xl border px-3.5 py-3 flex items-center justify-between ' + semClass + '">' +
                    '<div class="min-w-0 pr-2">' +
                        '<div class="flex items-center gap-2">' +
                            '<span class="w-2.5 h-2.5 rounded-full inline-block shrink-0" style="background:' + dotColor + ';"></span>' +
                            '<span class="text-xs font-extrabold uppercase tracking-wide">' + escapeHtml(WAREHOUSES[i]) + '</span>' +
                        '</div>' +
                        '<div class="text-[11px] font-semibold opacity-85 mt-0.5 pl-4">' + escapeHtml(statusLabel) + '</div>' +
                    '</div>' +
                    '<div class="text-right shrink-0">' +
                        '<span class="text-lg font-black">' + qty + '</span>' +
                        '<span class="text-[10px] font-bold uppercase block leading-none">pzas</span>' +
                    '</div>' +
                '</div>'
            );
        }

        document.getElementById('detTotalStock').textContent = total + (total === 1 ? ' pza' : ' pzas');
        document.getElementById('detWarehousesGrid').innerHTML = whHtml.join('');

        // Información Técnica del Producto
        const specs = [
            ['Categoría', it.c || 'Por clasificar'],
            ['Tono / Color', it.t || 'No especificado'],
            ['Acabado / Madera', it.a || 'No especificado'],
            ['Tela / Tapizado', it.tl || 'No aplica / No especificado'],
            ['Medidas', it.m || 'Pendiente'],
            ['Proveedor', it.p || 'No especificado'],
            ['Tiempo de entrega', it.lt ? (it.lt + ' días aprox.') : 'Por confirmar con proveedor']
        ];
        document.getElementById('detSpecsGrid').innerHTML = specs.map(([label, val]) =>
            '<div class="rounded-lg p-2.5 border" style="border-color:#E8E4DE; background:#FAFAFA;">' +
                '<span class="block text-[10px] font-extrabold uppercase tracking-wider" style="color:#A38251;">' + escapeHtml(label) + '</span>' +
                '<span class="block text-xs font-bold mt-0.5" style="color:#252C32;">' + escapeHtml(val) + '</span>' +
            '</div>'
        ).join('');

        renderThresholdInputs();
    }

    window.toggleThresholdsPanel = function () {
        const p = document.getElementById('thresholdsPanel');
        if (p) p.classList.toggle('hidden');
    };

    function renderThresholdInputs() {
        const grid = document.getElementById('thresholdsInputsGrid');
        if (!grid) return;
        grid.innerHTML = WAREHOUSES.map((w, idx) =>
            '<label class="block text-[10px] font-bold">' +
                '<span class="block truncate mb-1" style="color:#252C32;">' + escapeHtml(w) + '</span>' +
                '<input type="number" min="1" max="99" value="' + (warehouseMins[idx] || 2) + '" ' +
                'onchange="updateWarehouseMin(' + idx + ', this.value)" ' +
                'class="w-full rounded px-2 py-1 text-xs font-bold border bg-white" style="border-color:#A38251; color:#252C32;">' +
            '</label>'
        ).join('');
    }

    window.updateWarehouseMin = function (idx, val) {
        warehouseMins[idx] = Math.max(1, parseInt(val, 10) || 2);
        saveThresholds();
        if (currentDetailItem) renderDetailModal(currentDetailItem);
    };

    // ------------------------------------------------------------------------
    // CARRITO ABIERTO DE PRE-COTIZACIÓN (ETAPA 1)
    // ------------------------------------------------------------------------
    window.addToCart = function (skuRaw, delta) {
        const key = String(skuRaw || '').trim().toUpperCase();
        const it = bySkuMap.get(key);
        if (!it) return;
        if (!cart[key]) {
            cart[key] = { sku: it.s, name: it.n || it.s, qty: 0 };
        }
        cart[key].qty = Math.max(0, (Number(cart[key].qty) || 0) + (delta || 1));
        if (cart[key].qty <= 0) delete cart[key];
        saveCart();

        // Update row button if visible
        const btns = document.querySelectorAll('[data-sku-btn="' + CSS.escape(key) + '"]');
        btns.forEach(b => {
            const q = cart[key] ? cart[key].qty : 0;
            b.textContent = q > 0 ? ('+' + q) : '+';
            b.classList.toggle('in-cart', q > 0);
        });
        if (document.getElementById('cartModal').classList.contains('open')) {
            renderCartItems();
        }
    };

    window.addCurrentDetailToCart = function () {
        if (!currentDetailItem) return;
        addToCart(currentDetailItem.s, 1);
        const btn = document.getElementById('detAddCartBtn');
        if (btn) {
            const key = String(currentDetailItem.s).toUpperCase();
            const q = cart[key] ? cart[key].qty : 0;
            btn.textContent = '✓ En Carrito (' + q + ')';
            setTimeout(() => { if (btn) btn.textContent = '+ Carrito (' + q + ')'; }, 900);
        }
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
        applyFilter(document.getElementById('invSearchInput').value || '');
    };

    function renderCartItems() {
        const wrap = document.getElementById('cartItemsContainer');
        if (!wrap) return;
        const entries = Object.values(cart);
        if (!entries.length) {
            wrap.innerHTML = '<div class="text-center py-10 text-xs font-semibold opacity-60">Tu carrito está vacío. Usa el botón + en cualquier producto o escanea un SKU.</div>';
            return;
        }
        wrap.innerHTML = entries.map(row => {
            const key = String(row.sku).toUpperCase();
            return '<div class="rounded-xl border p-3 flex items-center justify-between gap-2" style="border-color:#E8E4DE;">' +
                '<div class="min-w-0 flex-1 cursor-pointer" onclick="closeCartModal(); openProductDetail(\'' + escapeHtml(key) + '\')">' +
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
            btn.textContent = '✓ Copiado';
            setTimeout(() => { btn.textContent = prev; }, 1200);
        }
    };

    // ------------------------------------------------------------------------
    // ESCÁNER BLUETOOTH (HID KEYBOARD WEDGE) + ENTER EN BUSCADOR
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

        // If user presses Enter inside the search box and an exact SKU or single match exists, open it immediately!
        if (isSearchFocused && ev.key === 'Enter') {
            const val = String(document.activeElement.value || '').trim();
            if (val) {
                if (openProductDetail(val)) {
                    ev.preventDefault();
                    document.activeElement.select();
                    return;
                }
                if (filteredItems.length === 1) {
                    ev.preventDefault();
                    openProductDetail(filteredItems[0].s);
                    return;
                }
            }
        }

        // Global Bluetooth barcode scanner capture when focus is NOT in an input
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
                if (!openProductDetail(code) && filteredItems.length === 1) {
                    openProductDetail(filteredItems[0].s);
                }
            }
        } else if (ev.key.length === 1 && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
            scanBuffer += ev.key;
        }
    });

    // ------------------------------------------------------------------------
    // SINCRONIZACIÓN EN VIVO CON LA PESTAÑA INVENTARIO_EN_VIVO DEL GOOGLE SHEET
    // ------------------------------------------------------------------------
    let liveSyncInFlight = false;

    function applyLiveRowsArray(rows) {
        if (!Array.isArray(rows) || rows.length < 2) return false;
        let updated = 0;
        for (let i = 1; i < rows.length; i++) {
            const r = rows[i];
            if (!r || !r[0]) continue;
            const sku = String(r[0]).trim();
            const key = sku.toUpperCase();
            let it = bySkuMap.get(key);
            if (!it) {
                it = {
                    s: sku,
                    n: String(r[1] || sku).trim(),
                    f: String(r[2] || '').trim(),
                    c: String(r[3] || '').trim(),
                    t: String(r[4] || '').trim(),
                    a: String(r[5] || '').trim(),
                    tl: String(r[6] || '').trim(),
                    m: String(r[7] || '').trim(),
                    p: String(r[8] || '').trim(),
                    lt: r[9] ? Number(r[9]) : '',
                    st: [0, 0, 0, 0, 0]
                };
                it._search = normalizeText([it.s, it.n, it.c, it.t, it.a, it.tl, it.m, it.p].join(' '));
                allItems.push(it);
                bySkuMap.set(key, it);
            } else {
                if (r[1]) it.n = String(r[1]).trim();
                it.f = String(r[2] || '').trim();
                if (r[3] != null) it.c = String(r[3]).trim();
                if (r[4] != null) it.t = String(r[4]).trim();
                if (r[5] != null) it.a = String(r[5]).trim();
                if (r[6] != null) it.tl = String(r[6]).trim();
                if (r[7] != null) it.m = String(r[7]).trim();
                if (r[8] != null) it.p = String(r[8]).trim();
                if (r[9] !== '' && r[9] != null) it.lt = Number(r[9]) || it.lt;
            }
            it.st = [
                Number(r[10]) || 0,
                Number(r[11]) || 0,
                Number(r[12]) || 0,
                Number(r[13]) || 0,
                Number(r[14]) || 0
            ];
            updated++;
        }
        if (updated > 0) {
            const inp = document.getElementById('invSearchInput');
            applyFilter(inp ? inp.value : '');
            if (currentDetailItem) {
                renderDetailModal(currentDetailItem);
            }
        }
        return updated > 0;
    }

    function tryGvizJsonp() {
        return new Promise((resolve) => {
            const cbName = '__creataInvGviz_' + Date.now() + '_' + Math.floor(Math.random() * 9999);
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
                if (!resp || !resp.table || !Array.isArray(resp.table.rows)) {
                    resolve(false);
                    return;
                }
                const rows = [['SKU']];
                resp.table.rows.forEach(r => {
                    const c = r.c || [];
                    rows.push(c.map(cell => (cell && cell.v != null) ? cell.v : ''));
                });
                resolve(applyLiveRowsArray(rows));
            };

            script.onerror = function () {
                cleanup();
                resolve(false);
            };
            script.src = 'https://docs.google.com/spreadsheets/d/' + META.sheetId +
                '/gviz/tq?tqx=responseHandler:' + cbName +
                '&gid=' + META.gid + '&_t=' + Date.now();
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
            if (json && json.ok && Array.isArray(json.rows)) {
                return applyLiveRowsArray(json.rows);
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
            const okGviz = await tryGvizJsonp();
            if (!okGviz) {
                await tryWebAppLiveSync();
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
                if (Array.isArray(cols) && cols.length >= 11 && Array.isArray(cols[0])) {
                    const len = cols[0].length;
                    const unpacked = new Array(len);
                    for (let i = 0; i < len; i++) {
                        unpacked[i] = {
                            s: cols[0][i] || '',
                            n: cols[1][i] || '',
                            f: cols[2][i] || '',
                            c: cols[3][i] || '',
                            t: cols[4][i] || '',
                            a: cols[5][i] || '',
                            tl: cols[6][i] || '',
                            m: cols[7][i] || '',
                            p: cols[8][i] || '',
                            lt: cols[9][i] || '',
                            st: cols[10][i] || [0, 0, 0, 0, 0]
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

    // ------------------------------------------------------------------------
    // INICIO
    // ------------------------------------------------------------------------
    document.addEventListener('DOMContentLoaded', async function () {
        await unpackInitialInventoryIfNeeded();
        indexItems();
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
