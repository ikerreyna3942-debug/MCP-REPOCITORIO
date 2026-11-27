    // ========================================================================
    // CALCULADORA INFORMATIVA DE PRECIOS Y DESCUENTOS (MENÚ FLOTANTE "+")
    // - 100% aislada de la cotización final (NUNCA modifica cart ni quoteDrafts)
    // - Índice pre-normalizado + debounce + actualizaciones in-place (0 lag)
    // ========================================================================
    let priceCalcItems = [];
    let priceCalcGlobalDiscountPct = 0;
    let priceCalcLastQuery = '';
    let priceCalcDelegatedBound = false;
    let priceCalcSearchIndex = null;
    let priceCalcSearchIndexSig = '';
    let priceCalcSearchDebounceTimer = null;
    let priceCalcSearchRenderCount = 0;

    function roundCalcMoney(n) {
        const v = Number(n) || 0;
        return Math.round(v * 100) / 100;
    }

    function clampCalcPct(raw) {
        const s = String(raw == null ? '' : raw).replace(',', '.').trim();
        if (!s) return 0;
        const n = parseFloat(s);
        if (isNaN(n) || !isFinite(n) || n < 0) return 0;
        return Math.min(100, Math.round(n * 100) / 100);
    }

    function clampCalcQty(raw) {
        const n = parseInt(String(raw == null ? '' : raw).trim(), 10);
        if (isNaN(n) || !isFinite(n) || n < 1) return 1;
        return Math.min(999, n);
    }

    function formatCalcCurrency(num) {
        const v = Math.max(0, roundCalcMoney(num));
        return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function resolveCalcCatalogItem(skuRaw) {
        const key = String(skuRaw || '').trim().toUpperCase();
        if (!key) return null;
        const direct = bySkuMap.get(key);
        if (direct) return direct;
        const norm = key.replace(/[^A-Z0-9]+/g, '');
        if (norm) {
            const byNorm = bySkuNormMap.get(norm);
            if (byNorm) return byNorm;
        }
        if (Array.isArray(allItems)) {
            for (let i = 0; i < allItems.length; i++) {
                if (String((allItems[i] && allItems[i].s) || '').trim().toUpperCase() === key) {
                    return allItems[i];
                }
            }
        }
        return null;
    }

    function getCalcItemUnitPrice(it) {
        if (!it) return 0;
        const direct = parsePriceNum(it.pr);
        if (direct > 0) return direct;
        const key = String(it.s || '').trim().toUpperCase();
        if (key) {
            const livePr = parsePriceNum(liveErpPricesBySku.get(key));
            if (livePr > 0) return livePr;
            const erpEntry = liveErpCatalogBySku.get(key);
            if (erpEntry) {
                const erpPr = parsePriceNum(erpEntry.pr);
                if (erpPr > 0) return erpPr;
            }
        }
        return 0;
    }

    function getPriceCalcSearchIndex() {
        const pool = Array.isArray(allItems) && allItems.length > 0 ? allItems : Array.from(bySkuMap.values());
        const sig = String(pool.length) + ':' + String(lastLiveSignature || '') + ':' + String(liveErpPricesBySku.size || 0);
        if (priceCalcSearchIndex && priceCalcSearchIndexSig === sig) {
            return priceCalcSearchIndex;
        }
        const seen = new Set();
        const idx = [];
        for (let i = 0; i < pool.length; i++) {
            const it = pool[i];
            if (!it) continue;
            const sku = String(it.s || '').trim().toUpperCase();
            if (!sku || seen.has(sku)) continue;
            const unitPrice = getCalcItemUnitPrice(it);
            if (unitPrice <= 0) continue;
            seen.add(sku);
            const name = stripDimensionsFromProductText(cleanStr(it.n)) || sku;
            const variant = cleanStr(it.vr || it.tl);
            const availKind = getItemAvailabilityKind(it);
            const availTxt = availKind === 'STOCK' || availKind === 'LPPT_STOCK' ? 'En stock' : (availKind === 'LPPT' ? 'LPPT' : 'Catálogo');
            const hay = normSearch([sku, it.n, it.mo, it.vr, it.tl, it.c].filter(Boolean).join(' '));
            idx.push({
                item: it,
                sku: sku,
                skuNorm: sku.replace(/[^A-Z0-9]+/g, ''),
                hay: hay,
                name: name,
                variant: variant,
                availTxt: availTxt,
                unitPrice: unitPrice,
                quotableBonus: isQuotableItem(it) ? 20 : 0
            });
        }
        priceCalcSearchIndex = idx;
        priceCalcSearchIndexSig = sig;
        return idx;
    }

    function findPriceCalcMatches(rawQuery) {
        const qTrim = String(rawQuery || '').trim();
        if (!qTrim) return [];
        const qUpper = qTrim.toUpperCase();
        const qNorm = normSearch(qTrim);
        const tokens = qNorm.split(/\s+/).filter(Boolean);
        if (!tokens.length) return [];

        const index = getPriceCalcSearchIndex();
        const singleCharOnly = qTrim.length < 2;
        const qCompact = qUpper.replace(/[^A-Z0-9]+/g, '');
        const ranked = [];

        for (let i = 0; i < index.length; i++) {
            const rec = index[i];
            if (rec.sku === qUpper || (qCompact.length >= 3 && rec.skuNorm === qCompact)) {
                ranked.push({
                    item: rec.item,
                    sku: rec.sku,
                    name: rec.name,
                    variant: rec.variant,
                    availTxt: rec.availTxt,
                    unitPrice: rec.unitPrice,
                    score: 1000 + rec.quotableBonus
                });
                continue;
            }
            if (singleCharOnly) continue;
            let allMatch = true;
            for (let t = 0; t < tokens.length; t++) {
                if (rec.hay.indexOf(tokens[t]) === -1) {
                    allMatch = false;
                    break;
                }
            }
            if (!allMatch) continue;
            let score = 50 + rec.quotableBonus;
            if (rec.sku.indexOf(qUpper) === 0) score += 400;
            else if (rec.sku.indexOf(qUpper) !== -1) score += 200;
            ranked.push({
                item: rec.item,
                sku: rec.sku,
                name: rec.name,
                variant: rec.variant,
                availTxt: rec.availTxt,
                unitPrice: rec.unitPrice,
                score: score
            });
        }

        ranked.sort(function (a, b) {
            if (b.score !== a.score) return b.score - a.score;
            return a.name.localeCompare(b.name, 'es');
        });
        return ranked.slice(0, 20);
    }

    function computePriceCalcBreakdown() {
        const lines = [];
        let totalPieces = 0;
        let sumList = 0;
        let totalFinal = 0;

        for (let i = 0; i < priceCalcItems.length; i++) {
            const row = priceCalcItems[i];
            if (!row) continue;
            const liveIt = resolveCalcCatalogItem(row.sku);
            const livePrice = liveIt ? getCalcItemUnitPrice(liveIt) : 0;
            const unitPrice = livePrice > 0 ? livePrice : parsePriceNum(row.unitPrice);
            if (unitPrice <= 0) continue;
            const qty = clampCalcQty(row.qty);
            const discPct = clampCalcPct(row.discountPct);
            const lineList = roundCalcMoney(unitPrice * qty);
            const unitFinal = unitPrice * (1 - (discPct / 100));
            const lineFinal = Math.max(0, roundCalcMoney(unitFinal * qty));
            const lineDiscount = Math.max(0, roundCalcMoney(lineList - lineFinal));

            totalPieces += qty;
            sumList = roundCalcMoney(sumList + lineList);
            totalFinal = roundCalcMoney(totalFinal + lineFinal);

            lines.push({
                sku: String(row.sku || '').toUpperCase(),
                name: (liveIt && stripDimensionsFromProductText(cleanStr(liveIt.n))) || row.name || row.sku,
                variant: (liveIt && cleanStr(liveIt.vr || liveIt.tl)) || row.variant || '',
                photoUrl: (liveIt && photoUrlForItem(liveIt)) || row.photoUrl || '',
                unitPrice: unitPrice,
                qty: qty,
                discountPct: discPct,
                lineList: lineList,
                unitFinal: roundCalcMoney(unitFinal),
                lineFinal: lineFinal,
                lineDiscount: lineDiscount
            });
        }

        const totalDiscount = Math.max(0, roundCalcMoney(sumList - totalFinal));
        const effectiveDiscountPct = sumList > 0 ? (totalDiscount / sumList) * 100 : 0;
        const subtotalNoIva = roundCalcMoney(totalFinal / 1.16);
        const ivaAmount = Math.max(0, roundCalcMoney(totalFinal - subtotalNoIva));

        return {
            lines: lines,
            totalProducts: lines.length,
            totalPieces: totalPieces,
            sumList: sumList,
            totalDiscount: totalDiscount,
            effectiveDiscountPct: effectiveDiscountPct,
            subtotalNoIva: subtotalNoIva,
            ivaAmount: ivaAmount,
            totalFinal: totalFinal,
            globalDiscountPct: priceCalcGlobalDiscountPct
        };
    }

    function syncPriceCalcFabBadge(totalPieces) {
        const badge = document.getElementById('fabCalcCount');
        if (!badge) return;
        const count = Math.max(0, Number(totalPieces) || 0);
        badge.textContent = String(count);
        badge.classList.toggle('hidden', count <= 0);
    }

    function syncPriceCalcSearchButtonBadges() {
        const box = document.getElementById('calcSearchResults');
        if (!box || box.classList.contains('hidden')) return;
        const btns = typeof box.querySelectorAll === 'function'
            ? box.querySelectorAll('button[data-calc-action="add"]')
            : [];
        if (!btns || !btns.length) return;
        const qtyBySku = new Map();
        for (let i = 0; i < priceCalcItems.length; i++) {
            const it = priceCalcItems[i];
            if (it && it.sku) qtyBySku.set(String(it.sku).toUpperCase(), clampCalcQty(it.qty));
        }
        btns.forEach(function (btn) {
            const sku = String(btn.getAttribute('data-sku') || '').toUpperCase();
            const q = qtyBySku.get(sku) || 0;
            btn.textContent = q > 0 ? ('+1 (en lista: ' + q + ')') : '+ Agregar';
            btn.classList.toggle('is-in-list', q > 0);
        });
    }

    function renderPriceCalcSearchResults() {
        const box = document.getElementById('calcSearchResults');
        const clearBtn = document.getElementById('calcSearchClearBtn');
        const q = String(priceCalcLastQuery || '').trim();
        if (clearBtn) clearBtn.classList.toggle('hidden', !q);
        if (!box) return;
        if (!q) {
            box.innerHTML = '';
            box.classList.add('hidden');
            return;
        }
        priceCalcSearchRenderCount++;
        const matches = findPriceCalcMatches(q);
        box.classList.remove('hidden');
        if (!matches.length) {
            if (q.length < 2) {
                box.innerHTML = '<div class="inv-calc-empty" style="border:none;border-radius:0;">Escribe al menos 2 letras o escanea el SKU completo.</div>';
            } else {
                box.innerHTML = '<div class="inv-calc-empty" style="border:none;border-radius:0;">Sin productos con precio para “' + escapeHtml(q) + '”. Prueba otro nombre o SKU.</div>';
            }
            return;
        }
        const qtyBySku = new Map();
        for (let i = 0; i < priceCalcItems.length; i++) {
            const it = priceCalcItems[i];
            if (it && it.sku) qtyBySku.set(String(it.sku).toUpperCase(), clampCalcQty(it.qty));
        }
        box.innerHTML = matches.map(function (entry) {
            const it = entry.item;
            const sku = entry.sku;
            const rawPhoto = photoUrlForItem(it);
            const thumbSrc = rawPhoto ? resolveVisualImgSrc(rawPhoto) : '';
            const existingQty = qtyBySku.get(sku) || 0;
            const btnLabel = existingQty > 0 ? ('+1 (en lista: ' + existingQty + ')') : '+ Agregar';
            return '<div class="inv-calc-res-row">' +
                '<div class="inv-calc-thumb">' + (thumbSrc ? '<img width="34" height="34" src="' + escapeHtml(thumbSrc) + '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">' : '🪑') + '</div>' +
                '<div class="inv-calc-res-info">' +
                    '<div class="inv-calc-res-name">' + escapeHtml(entry.name) + '</div>' +
                    '<div class="inv-calc-res-meta">' +
                        '<span>' + escapeHtml(sku) + '</span>' +
                        (entry.variant ? '<span>· ' + escapeHtml(entry.variant) + '</span>' : '') +
                        '<span>· ' + escapeHtml(entry.availTxt) + '</span>' +
                        '<span class="inv-calc-res-price">· ' + escapeHtml(formatCalcCurrency(entry.unitPrice)) + '</span>' +
                    '</div>' +
                '</div>' +
                '<button type="button" class="inv-calc-add-btn' + (existingQty > 0 ? ' is-in-list' : '') + '" data-calc-action="add" data-sku="' + escapeHtml(sku) + '">' + escapeHtml(btnLabel) + '</button>' +
            '</div>';
        }).join('');
    }

    function renderPriceCalcSummaryOnly(bd, forceGlobalInputSync) {
        const data = bd || computePriceCalcBreakdown();
        const countEl = document.getElementById('calcItemsCount');
        const sumListEl = document.getElementById('calcSumList');
        const discLblEl = document.getElementById('calcDiscountLabel');
        const sumDiscEl = document.getElementById('calcSumDiscount');
        const subNoIvaEl = document.getElementById('calcSubtotalNoIva');
        const ivaEl = document.getElementById('calcIvaAmount');
        const totalEl = document.getElementById('calcTotalFinal');
        const globalInp = document.getElementById('calcGlobalDiscountInput');

        syncPriceCalcFabBadge(data.totalPieces);

        if (countEl) {
            countEl.textContent = data.totalProducts + (data.totalProducts === 1 ? ' producto' : ' productos') +
                ' · ' + data.totalPieces + (data.totalPieces === 1 ? ' pieza' : ' piezas');
        }
        if (sumListEl) sumListEl.textContent = formatCalcCurrency(data.sumList);
        if (discLblEl) {
            const pctStr = data.effectiveDiscountPct > 0 ? data.effectiveDiscountPct.toFixed(1).replace(/\.0$/, '') : '0';
            discLblEl.textContent = 'Descuento aplicado (' + pctStr + '%):';
        }
        if (sumDiscEl) sumDiscEl.textContent = '-' + formatCalcCurrency(data.totalDiscount);
        if (subNoIvaEl) subNoIvaEl.textContent = formatCalcCurrency(data.subtotalNoIva);
        if (ivaEl) ivaEl.textContent = formatCalcCurrency(data.ivaAmount);
        if (totalEl) {
            totalEl.textContent = formatCalcCurrency(data.totalFinal);
            totalEl.classList.toggle('has-disc', data.totalDiscount > 0.004);
        }
        if (globalInp && (forceGlobalInputSync || document.activeElement !== globalInp)) {
            globalInp.value = String(priceCalcGlobalDiscountPct);
        }

        const presetBtns = document.querySelectorAll('#priceCalculatorModal .inv-calc-preset-btn');
        if (presetBtns && presetBtns.length) {
            presetBtns.forEach(function (btn) {
                const p = Number(btn.getAttribute('data-calc-pct'));
                btn.classList.toggle('is-active', Math.abs(p - priceCalcGlobalDiscountPct) < 0.001);
            });
        }
    }

    function syncPriceCalcItemRowsInPlace(bd, opts) {
        const data = bd || computePriceCalcBreakdown();
        const o = opts || {};
        const container = document.getElementById('calcItemsContainer');
        if (!container || typeof container.querySelectorAll !== 'function') return false;
        const cards = container.querySelectorAll('.inv-calc-item-card');
        if (!cards || cards.length !== data.lines.length) return false;
        const lineBySku = new Map();
        for (let i = 0; i < data.lines.length; i++) {
            lineBySku.set(data.lines[i].sku, data.lines[i]);
        }
        let updatedAny = true;
        cards.forEach(function (card) {
            const sku = String(card.getAttribute('data-calc-sku') || '').toUpperCase();
            const ln = lineBySku.get(sku);
            if (!ln) {
                updatedAny = false;
                return;
            }
            if (o.onlySku && o.onlySku !== sku) return;
            const qtyInp = card.querySelector('input[data-calc-input="qty"]');
            if (qtyInp && (!o.preserveFocus || document.activeElement !== qtyInp)) {
                qtyInp.value = String(ln.qty);
            }
            const discInp = card.querySelector('input[data-calc-input="disc"]');
            if (discInp && (!o.preserveFocus || document.activeElement !== discInp)) {
                discInp.value = String(ln.discountPct);
            }
            const totalsEl = card.querySelector('.inv-calc-item-totals');
            if (totalsEl) {
                const hasDisc = ln.discountPct > 0.001;
                totalsEl.innerHTML = (hasDisc ? '<span class="inv-calc-line-old">' + escapeHtml(formatCalcCurrency(ln.lineList)) + '</span>' : '') +
                    '<span class="inv-calc-line-final' + (hasDisc ? ' has-disc' : '') + '">' + escapeHtml(formatCalcCurrency(ln.lineFinal)) + '</span>';
            }
        });
        return updatedAny;
    }

    function renderPriceCalcItemsOnly(bd) {
        const container = document.getElementById('calcItemsContainer');
        const data = bd || computePriceCalcBreakdown();
        if (!container) return;
        if (!data.lines.length) {
            container.innerHTML = '<div class="inv-calc-empty">Busca arriba una sala, producto o SKU, o <strong>escanea cualquier código</strong> para agregarlo en automático.<br>Este cálculo es solo informativo y no afecta tu cotización.</div>';
            return;
        }

        container.innerHTML = data.lines.map(function (ln) {
            const thumbSrc = ln.photoUrl ? resolveVisualImgSrc(ln.photoUrl) : '';
            const hasDisc = ln.discountPct > 0.001;
            return '<div class="inv-calc-item-card" data-calc-sku="' + escapeHtml(ln.sku) + '">' +
                '<div class="inv-calc-item-top">' +
                    '<div class="inv-calc-thumb">' + (thumbSrc ? '<img width="34" height="34" src="' + escapeHtml(thumbSrc) + '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">' : '🪑') + '</div>' +
                    '<div class="inv-calc-res-info">' +
                        '<div class="inv-calc-res-name">' + escapeHtml(ln.name) + '</div>' +
                        '<div class="inv-calc-res-meta">' +
                            '<span>' + escapeHtml(ln.sku) + '</span>' +
                            (ln.variant ? '<span>· ' + escapeHtml(ln.variant) + '</span>' : '') +
                            '<span class="inv-calc-res-price">· ' + escapeHtml(formatCalcCurrency(ln.unitPrice)) + ' c/u</span>' +
                        '</div>' +
                    '</div>' +
                    '<button type="button" class="inv-calc-item-rm" data-calc-action="remove" data-sku="' + escapeHtml(ln.sku) + '" title="Quitar de calculadora" aria-label="Quitar producto">✕</button>' +
                '</div>' +
                '<div class="inv-calc-item-controls">' +
                    '<div class="inv-calc-qty-group" aria-label="Cantidad">' +
                        '<button type="button" class="inv-calc-qty-btn" data-calc-action="dec" data-sku="' + escapeHtml(ln.sku) + '" aria-label="Disminuir cantidad">−</button>' +
                        '<input type="number" inputmode="numeric" min="1" max="999" value="' + ln.qty + '" class="inv-calc-qty-inp" data-calc-input="qty" data-sku="' + escapeHtml(ln.sku) + '" aria-label="Cantidad de piezas">' +
                        '<button type="button" class="inv-calc-qty-btn" data-calc-action="inc" data-sku="' + escapeHtml(ln.sku) + '" aria-label="Aumentar cantidad">+</button>' +
                    '</div>' +
                    '<label class="inv-calc-item-disc">' +
                        '<span>Desc.</span>' +
                        '<input type="number" inputmode="decimal" min="0" max="100" step="0.5" value="' + ln.discountPct + '" class="inv-input" data-calc-input="disc" data-sku="' + escapeHtml(ln.sku) + '" aria-label="Descuento de la pieza">' +
                        '<span>%</span>' +
                    '</label>' +
                    '<div class="inv-calc-item-totals">' +
                        (hasDisc ? '<span class="inv-calc-line-old">' + escapeHtml(formatCalcCurrency(ln.lineList)) + '</span>' : '') +
                        '<span class="inv-calc-line-final' + (hasDisc ? ' has-disc' : '') + '">' + escapeHtml(formatCalcCurrency(ln.lineFinal)) + '</span>' +
                    '</div>' +
                '</div>' +
            '</div>';
        }).join('');
    }

    function renderPriceCalculator(opts) {
        const o = opts || {};
        const bd = computePriceCalcBreakdown();
        renderPriceCalcSummaryOnly(bd, Boolean(o.forceGlobalInputSync));
        renderPriceCalcItemsOnly(bd);
        if (o.rebuildSearch) {
            renderPriceCalcSearchResults();
        } else {
            syncPriceCalcSearchButtonBadges();
        }
    }

    function bindPriceCalculatorListeners() {
        if (priceCalcDelegatedBound) return;
        const target = document.getElementById('calcModalCard') || document.getElementById('priceCalculatorModal');
        if (!target) return;
        priceCalcDelegatedBound = true;

        target.addEventListener('click', function (ev) {
            const btn = ev.target && typeof ev.target.closest === 'function'
                ? ev.target.closest('[data-calc-action]')
                : null;
            if (!btn) return;
            const action = btn.getAttribute('data-calc-action');
            const sku = btn.getAttribute('data-sku') || '';
            if (action === 'add') {
                window.addPriceCalcItem(sku);
            } else if (action === 'inc') {
                window.stepPriceCalcItemQty(sku, 1);
            } else if (action === 'dec') {
                window.stepPriceCalcItemQty(sku, -1);
            } else if (action === 'remove') {
                window.removePriceCalcItem(sku);
            }
        });

        target.addEventListener('input', function (ev) {
            const el = ev.target;
            if (!el || typeof el.getAttribute !== 'function') return;
            const kind = el.getAttribute('data-calc-input');
            const sku = el.getAttribute('data-sku') || '';
            if (!kind || !sku) return;
            if (kind === 'qty') {
                window.setPriceCalcItemQty(sku, el.value, true);
            } else if (kind === 'disc') {
                window.setPriceCalcItemDiscount(sku, el.value, true);
            }
        });

        target.addEventListener('change', function (ev) {
            const el = ev.target;
            if (!el || typeof el.getAttribute !== 'function') return;
            const kind = el.getAttribute('data-calc-input');
            const sku = el.getAttribute('data-sku') || '';
            if (!kind || !sku) return;
            if (kind === 'qty') {
                window.setPriceCalcItemQty(sku, el.value, false);
            } else if (kind === 'disc') {
                window.setPriceCalcItemDiscount(sku, el.value, false);
            }
        });

        target.addEventListener('keydown', function (ev) {
            const el = ev.target;
            if (!el || el.tagName !== 'INPUT' || el.type !== 'number') return;
            if (ev.key === 'Enter' || ev.keyCode === 13) {
                try { if (typeof el.blur === 'function') el.blur(); } catch (e) {}
            }
        });
    }

    function handleScannedBarcodeForPriceCalculator(res, cleanedRaw) {
        const cleaned = normalizeScannedBarcodeText(cleanedRaw || (res && res.rawCode) || '');
        const clearCalcInpIfMatches = function () {
            const inp = document.getElementById('calcSearchInput');
            if (inp && inp.value) {
                priceCalcLastQuery = '';
                inp.value = '';
                renderPriceCalcSearchResults();
            }
        };

        // 1. Producto exacto resuelto (con stock, LPPT o catálogo con precio)
        let targetItem = (res && res.item) ? res.item : null;
        if (!targetItem && cleaned) {
            targetItem = resolveCalcCatalogItem(cleaned);
        }
        if (targetItem) {
            if (getCalcItemUnitPrice(targetItem) > 0 && window.addPriceCalcItem(targetItem.s, 1)) {
                clearCalcInpIfMatches();
                if (res) {
                    res.addedToCalculator = true;
                    res.addedSku = String(targetItem.s || '').toUpperCase();
                }
                showToast('✓ Agregado a calculadora: ' + targetItem.s);
                return res;
            }
            showToast('⚠ Sin precio registrado para: ' + (targetItem.s || cleaned));
            return res;
        }

        // 2. Grupo resuelto (si tiene 1 pieza con precio se agrega directo; si tiene varias se muestran para elegir)
        if (res && res.status === 'search_group' && res.group && Array.isArray(res.group.items)) {
            const pricedItems = res.group.items.filter(function (it) { return getCalcItemUnitPrice(it) > 0; });
            if (pricedItems.length === 1 && window.addPriceCalcItem(pricedItems[0].s, 1)) {
                clearCalcInpIfMatches();
                res.addedToCalculator = true;
                res.addedSku = String(pricedItems[0].s || '').toUpperCase();
                showToast('✓ Agregado a calculadora: ' + pricedItems[0].s);
                return res;
            }
            if (pricedItems.length > 1) {
                const inp = document.getElementById('calcSearchInput');
                if (inp) inp.value = cleaned;
                priceCalcLastQuery = cleaned;
                renderPriceCalcSearchResults();
                showToast('Escaneado: ' + cleaned + ' · elige el módulo en la lista');
                return res;
            }
        }

        // 3. Coincidencia única en catálogo con precio
        const calcMatches = cleaned ? findPriceCalcMatches(cleaned) : [];
        if (calcMatches.length === 1 && window.addPriceCalcItem(calcMatches[0].sku, 1)) {
            clearCalcInpIfMatches();
            if (res) {
                res.addedToCalculator = true;
                res.addedSku = calcMatches[0].sku;
            }
            showToast('✓ Agregado a calculadora: ' + calcMatches[0].sku);
            return res;
        }
        if (calcMatches.length > 1) {
            const inp = document.getElementById('calcSearchInput');
            if (inp) inp.value = cleaned;
            priceCalcLastQuery = cleaned;
            renderPriceCalcSearchResults();
            showToast('Escaneado: ' + cleaned + ' · ' + calcMatches.length + ' coincidencias');
            return res;
        }

        showToast('⚠ Código no encontrado en catálogo: ' + cleaned);
        return res;
    }

    window.addPriceCalcItem = function (skuRaw, qtyToAdd) {
        const it = resolveCalcCatalogItem(skuRaw);
        if (!it) return false;
        const unitPrice = getCalcItemUnitPrice(it);
        if (unitPrice <= 0) {
            showToast('Este producto no tiene precio registrado.');
            return false;
        }
        const sku = String(it.s || skuRaw).trim().toUpperCase();
        const addQty = clampCalcQty(qtyToAdd == null ? 1 : qtyToAdd);
        const existing = priceCalcItems.find(function (r) { return r.sku === sku; });
        if (existing) {
            existing.qty = Math.min(999, clampCalcQty(existing.qty) + addQty);
            existing.unitPrice = unitPrice;
            const bd = computePriceCalcBreakdown();
            renderPriceCalcSummaryOnly(bd, false);
            if (!syncPriceCalcItemRowsInPlace(bd, { onlySku: sku })) {
                renderPriceCalcItemsOnly(bd);
            }
            syncPriceCalcSearchButtonBadges();
            return true;
        }
        priceCalcItems.push({
            sku: sku,
            name: stripDimensionsFromProductText(cleanStr(it.n)) || sku,
            variant: cleanStr(it.vr || it.tl),
            unitPrice: unitPrice,
            qty: addQty,
            discountPct: priceCalcGlobalDiscountPct,
            photoUrl: photoUrlForItem(it) || ''
        });
        renderPriceCalculator({ rebuildSearch: false });
        return true;
    };

    window.stepPriceCalcItemQty = function (skuRaw, delta) {
        const sku = String(skuRaw || '').trim().toUpperCase();
        const row = priceCalcItems.find(function (r) { return r.sku === sku; });
        if (!row) return false;
        row.qty = Math.max(1, Math.min(999, clampCalcQty(row.qty) + (Number(delta) || 0)));
        const bd = computePriceCalcBreakdown();
        renderPriceCalcSummaryOnly(bd, false);
        if (!syncPriceCalcItemRowsInPlace(bd, { onlySku: sku })) {
            renderPriceCalcItemsOnly(bd);
        }
        syncPriceCalcSearchButtonBadges();
        return true;
    };

    window.setPriceCalcItemQty = function (skuRaw, rawQty, preserveFocus) {
        const sku = String(skuRaw || '').trim().toUpperCase();
        const row = priceCalcItems.find(function (r) { return r.sku === sku; });
        if (!row) return false;
        row.qty = clampCalcQty(rawQty);
        const bd = computePriceCalcBreakdown();
        renderPriceCalcSummaryOnly(bd, false);
        if (!syncPriceCalcItemRowsInPlace(bd, { onlySku: sku, preserveFocus: Boolean(preserveFocus) })) {
            renderPriceCalcItemsOnly(bd);
        }
        syncPriceCalcSearchButtonBadges();
        return true;
    };

    window.setPriceCalcItemDiscount = function (skuRaw, rawPct, preserveFocus) {
        const sku = String(skuRaw || '').trim().toUpperCase();
        const row = priceCalcItems.find(function (r) { return r.sku === sku; });
        if (!row) return false;
        row.discountPct = clampCalcPct(rawPct);
        const bd = computePriceCalcBreakdown();
        renderPriceCalcSummaryOnly(bd, false);
        if (!syncPriceCalcItemRowsInPlace(bd, { onlySku: sku, preserveFocus: Boolean(preserveFocus) })) {
            renderPriceCalcItemsOnly(bd);
        }
        return true;
    };

    window.removePriceCalcItem = function (skuRaw) {
        const sku = String(skuRaw || '').trim().toUpperCase();
        priceCalcItems = priceCalcItems.filter(function (r) { return r.sku !== sku; });
        renderPriceCalculator({ rebuildSearch: false });
        return true;
    };

    window.applyPriceCalcGlobalDiscount = function (rawPct, fromPreset) {
        const pct = clampCalcPct(rawPct);
        priceCalcGlobalDiscountPct = pct;
        for (let i = 0; i < priceCalcItems.length; i++) {
            if (priceCalcItems[i]) priceCalcItems[i].discountPct = pct;
        }
        const globalInp = document.getElementById('calcGlobalDiscountInput');
        if (globalInp && fromPreset) {
            globalInp.value = String(pct);
            try { if (document.activeElement === globalInp && typeof globalInp.blur === 'function') globalInp.blur(); } catch (e) {}
        }
        const bd = computePriceCalcBreakdown();
        renderPriceCalcSummaryOnly(bd, Boolean(fromPreset));
        if (!syncPriceCalcItemRowsInPlace(bd, { preserveFocus: false })) {
            renderPriceCalcItemsOnly(bd);
        }
        return pct;
    };

    let calcBurstFirstTs = 0;
    let calcBurstLastTs = 0;
    let calcBurstEvents = 0;
    let calcBurstTimer = null;

    function resetCalcScanBurst() {
        calcBurstFirstTs = 0;
        calcBurstLastTs = 0;
        calcBurstEvents = 0;
        if (calcBurstTimer) {
            clearTimeout(calcBurstTimer);
            calcBurstTimer = null;
        }
        if (priceCalcSearchDebounceTimer) {
            clearTimeout(priceCalcSearchDebounceTimer);
            priceCalcSearchDebounceTimer = null;
        }
    }

    window.searchPriceCalculatorProducts = function (rawQuery) {
        const val = String(rawQuery || '');
        if (calcBurstTimer) {
            clearTimeout(calcBurstTimer);
            calcBurstTimer = null;
        }
        if (priceCalcSearchDebounceTimer) {
            clearTimeout(priceCalcSearchDebounceTimer);
            priceCalcSearchDebounceTimer = null;
        }
        if (/[\r\n]/.test(val)) {
            const cleanedScan = normalizeScannedBarcodeText(val);
            resetCalcScanBurst();
            if (cleanedScan && isModalOpenById('priceCalculatorModal')) {
                processScannedBarcode(cleanedScan, { source: 'Calculadora / Escáner' });
                return;
            }
        }
        priceCalcLastQuery = val;
        const clearBtn = document.getElementById('calcSearchClearBtn');
        if (clearBtn) clearBtn.classList.toggle('hidden', !val.trim());

        const nowTs = Date.now();
        if (!val.trim()) {
            resetCalcScanBurst();
            renderPriceCalcSearchResults();
            return;
        }
        if (!calcBurstFirstTs || (nowTs - calcBurstLastTs) > 420) {
            calcBurstFirstTs = nowTs;
            calcBurstEvents = 1;
        } else {
            calcBurstEvents++;
        }
        calcBurstLastTs = nowTs;
        const cleanedCand = normalizeScannedBarcodeText(val);
        const elapsed = Math.max(1, nowTs - calcBurstFirstTs);
        const avgPerChar = elapsed / Math.max(1, cleanedCand.length - 1);
        // Detección automática para lectores P2300L/USB sin sufijo Enter cuando el cursor está en el buscador
        if (cleanedCand.length >= 4 && calcBurstEvents >= 2 && avgPerChar <= 95 && elapsed <= 1600) {
            calcBurstTimer = setTimeout(function () {
                calcBurstTimer = null;
                if (!isModalOpenById('priceCalculatorModal')) return;
                const inp = document.getElementById('calcSearchInput');
                const latest = normalizeScannedBarcodeText(inp ? inp.value : priceCalcLastQuery);
                if (latest.length >= 4) {
                    const hit = resolveScannedBarcode(latest);
                    if (hit && hit.item && getCalcItemUnitPrice(hit.item) > 0) {
                        resetCalcScanBurst();
                        processScannedBarcode(latest, { source: 'Calculadora / Escáner' });
                    }
                }
            }, 260);
        }

        // Debounce ligero (90ms) para evitar trabajo redundante mientras se escribe rápido
        priceCalcSearchDebounceTimer = setTimeout(function () {
            priceCalcSearchDebounceTimer = null;
            renderPriceCalcSearchResults();
        }, 90);
    };

    window.clearCalcSearchInput = function () {
        resetCalcScanBurst();
        priceCalcLastQuery = '';
        const inp = document.getElementById('calcSearchInput');
        if (inp) {
            inp.value = '';
            try { inp.focus(); } catch (e) {}
        }
        renderPriceCalcSearchResults();
    };

    window.onCalcSearchKeydown = function (ev) {
        if (!ev) return;
        const isCommit = ev.key === 'Enter' || ev.key === 'Tab' || ev.key === 'Go' || ev.key === 'Search' || ev.key === 'Accept' || ev.keyCode === 13 || ev.keyCode === 9;
        if (!isCommit) return;
        const inp = document.getElementById('calcSearchInput');
        const raw = normalizeScannedBarcodeText(inp ? inp.value : priceCalcLastQuery);
        if (!raw) return;
        const scanRes = resolveScannedBarcode(raw);
        if (scanRes && scanRes.item && getCalcItemUnitPrice(scanRes.item) > 0) {
            ev.preventDefault();
            resetCalcScanBurst();
            processScannedBarcode(raw, { source: 'Calculadora / Escáner', force: true });
            return;
        }
        if (ev.key === 'Tab' || ev.keyCode === 9) return;
        ev.preventDefault();
        resetCalcScanBurst();
        const matches = findPriceCalcMatches(raw);
        if (matches.length === 1) {
            if (window.addPriceCalcItem(matches[0].sku, 1)) {
                showToast('✓ Agregado a calculadora: ' + matches[0].sku);
                window.clearCalcSearchInput();
            }
        } else {
            priceCalcLastQuery = raw;
            renderPriceCalcSearchResults();
        }
    };

    window.clearPriceCalculator = function (silent) {
        resetCalcScanBurst();
        priceCalcItems = [];
        priceCalcGlobalDiscountPct = 0;
        priceCalcLastQuery = '';
        const inp = document.getElementById('calcSearchInput');
        if (inp) inp.value = '';
        const globalInp = document.getElementById('calcGlobalDiscountInput');
        if (globalInp) globalInp.value = '0';
        renderPriceCalculator({ rebuildSearch: true, forceGlobalInputSync: true });
        if (!silent) {
            showToast('Calculadora limpiada');
        }
    };

    window.openPriceCalculatorModal = function () {
        if (!activeAdvisorSession || activeAdvisorSession.mustChangeKey) {
            openAuthModalForStartup();
            return;
        }
        if (isGuestSession()) return;
        bindPriceCalculatorListeners();
        const modal = document.getElementById('priceCalculatorModal');
        if (!modal) return;
        try {
            if (document.activeElement && document.activeElement !== document.body && typeof document.activeElement.blur === 'function') {
                document.activeElement.blur();
            }
        } catch (eBlur) {}
        modal.classList.add('open');
        notifyInvBackStatePush('price_calculator_modal');
        renderPriceCalculator({ rebuildSearch: Boolean(String(priceCalcLastQuery || '').trim()), forceGlobalInputSync: true });
    };

    window.closePriceCalculatorModal = function () {
        resetCalcScanBurst();
        const modal = document.getElementById('priceCalculatorModal');
        if (modal) modal.classList.remove('open');
    };

    if (typeof window !== 'undefined') {
        window.__creataPriceCalc = {
            getItems: function () { return priceCalcItems.map(function (r) { return Object.assign({}, r); }); },
            getBreakdown: computePriceCalcBreakdown,
            findMatches: findPriceCalcMatches,
            getSearchIndexSize: function () { return getPriceCalcSearchIndex().length; },
            getSearchRenderCount: function () { return priceCalcSearchRenderCount; },
            addItem: window.addPriceCalcItem,
            stepQty: window.stepPriceCalcItemQty,
            setQty: window.setPriceCalcItemQty,
            setItemDiscount: window.setPriceCalcItemDiscount,
            applyGlobalDiscount: window.applyPriceCalcGlobalDiscount,
            removeItem: window.removePriceCalcItem,
            clear: window.clearPriceCalculator
        };
    }

    try {
        purgeLegacySyncedPendingKeys();
        applyAllProductOverridesToCatalog();
        setTimeout(() => { syncProductOverridesFromCloud(false); }, 250);
    } catch (eBootOvr) {}

    if (typeof window !== 'undefined') {
        window.__CREATA_INV_AUDIT__ = {
            FABRIC_CANONICAL_ALIASES: FABRIC_CANONICAL_ALIASES,
            BED_GROUPABLE_TYPE_KEYS: BED_GROUPABLE_TYPE_KEYS,
            ADMIN_PERM_COLUMNS_CLIENT: ADMIN_PERM_COLUMNS_CLIENT,
            UNIFIED_STORE_COLUMNS_CLIENT: UNIFIED_STORE_COLUMNS_CLIENT,
            isAdministrativeUnifiedRowClient: isAdministrativeUnifiedRowClient,
            extractAssignedStoresFromRowClient: extractAssignedStoresFromRowClient,
            defaultAdminPermissionsForEmailClient: defaultAdminPermissionsForEmailClient,
            parseAdminPermCellClient: parseAdminPermCellClient,
            extractAdminPermissionsFromRowClient: extractAdminPermissionsFromRowClient,
            hasAdminPerm: hasAdminPerm,
            getActiveAdminPermissions: getActiveAdminPermissions,
            settingsTeamPresenceState: settingsTeamPresenceState,
            CANONICAL_SQUARE_UPLOAD_PX: CANONICAL_SQUARE_UPLOAD_PX,
            buildOutOfStockRequestContext: buildOutOfStockRequestContext,
            computeStockSummaryForDemandItem: computeStockSummaryForDemandItem,
            canonicalizeFabricAliases: canonicalizeFabricAliases,
            stripFabricGradeAndVendorNoise: stripFabricGradeAndVendorNoise,
            normalizeFabricLookupKey: normalizeFabricLookupKey,
            sanitizeVisualOverrideUrl: sanitizeVisualOverrideUrl,
            sanitizeProductOverridesMap: sanitizeProductOverridesMap,
            validateAndNormalizeFabricColorAgainstName: validateAndNormalizeFabricColorAgainstName,
            runInventoryFabricColorAudit: runInventoryFabricColorAudit,
            cleanFabricVariationName: cleanFabricVariationName,
            resolveItemFabricVariation: resolveItemFabricVariation,
            resolveItemBedSize: resolveItemBedSize,
            resolveItemBedPieceInfo: resolveItemBedPieceInfo,
            resolveItemBedColorOrFinish: resolveItemBedColorOrFinish,
            resolveBedUnifiedTitlePrefix: resolveBedUnifiedTitlePrefix,
            countDistinctBedSizesForGroup: countDistinctBedSizesForGroup,
            countDistinctBedColorsForGroup: countDistinctBedColorsForGroup,
            isBedGroupWoodOnly: isBedGroupWoodOnly,
            classifyItemSubcategory: classifyItemSubcategory,
            getVisualOverridePhotoUrl: getVisualOverridePhotoUrl,
            getGroupVisualCoverPhotoUrl: getGroupVisualCoverPhotoUrl,
            getUploadedFabricSwatchEntries: getUploadedFabricSwatchEntries,
            matchFabricTextAgainstUploadedSwatches: matchFabricTextAgainstUploadedSwatches,
            getFabricSwatchPhotoUrl: getFabricSwatchPhotoUrl,
            findMatchingFabricSwatchForItem: findMatchingFabricSwatchForItem,
            DEFAULT_WOOD_SWATCHES_CATALOG: DEFAULT_WOOD_SWATCHES_CATALOG,
            isPureWoodDescriptor: isPureWoodDescriptor,
            isWoodOnlyProductForFabricGuard: isWoodOnlyProductForFabricGuard,
            getUploadedWoodSwatchEntries: getUploadedWoodSwatchEntries,
            matchWoodTextAgainstUploadedSwatches: matchWoodTextAgainstUploadedSwatches,
            getWoodSwatchPhotoUrl: getWoodSwatchPhotoUrl,
            findMatchingWoodSwatchForItem: findMatchingWoodSwatchForItem,
            resolveVisualImgSrc: resolveVisualImgSrc,
            extractDrivePhotoRev: extractDrivePhotoRev,
            buildDriveLh3Url: buildDriveLh3Url,
            resolveDriveOrImgUrl: resolveDriveOrImgUrl,
            buildThumbHtml: buildThumbHtml,
            applyStoredFotosOverridesToItems: applyStoredFotosOverridesToItems,
            buildFabricSwatchOverrideKey: buildFabricSwatchOverrideKey,
            buildWoodSwatchOverrideKey: buildWoodSwatchOverrideKey,
            buildVisualCoverOverrideKey: buildVisualCoverOverrideKey,
            saveLocalProductOverridesMap: saveLocalProductOverridesMap,
            persistVisualPhotoOverride: persistVisualPhotoOverride,
            normalizeInventoryItemLive: normalizeInventoryItemLive,
            buildCleanProductSpecRows: buildCleanProductSpecRows,
            formatGroupBadgeLabel: formatGroupBadgeLabel,
            renderGroupVariantsStep: renderGroupVariantsStep,
            indexItemsAndGroups: indexItemsAndGroups,
            setAllItems: function (arr) { allItems = Array.isArray(arr) ? arr : []; },
            getAllItems: function () { return allItems; },
            getAllGroups: function () { return allGroups; },
            getFilteredGroups: function () { return filteredGroups; },
            getCurrentGroupState: function () {
                return {
                    groupKey: currentGroup ? currentGroup.key : '',
                    bedSizeKey: currentGroupBedSizeKey,
                    fabricKey: currentGroupFabricKey,
                    detailSku: currentDetailItem ? currentDetailItem.s : ''
                };
            }
        };
    }
