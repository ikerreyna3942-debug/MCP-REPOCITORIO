// MÓDULOS DE SALA: LECTURA EN VIVO DE LOS SKUs DE SALAS_MODULARES Y SUMA DINÁMICA
        // ==========================================================================
        const KNOWN_SALA_MODULES = {
  "SALA-CARRARA": [
    {"name":"Sillón con brazo derecho (Altman Cotton)","code":"PDERAC","sku":"ARMCAR1PDERAC","price":8392.6,"width":"155 cm","depth":"114 cm","height":"90 cm","qty":1,"sheetQty":1,"checked":true,"optional":false,"photoSlot":"view1"},
    {"name":"Esquinero curvo (Altman Cotton)","code":"SQCUAC","sku":"ARMCARESQCUAC","price":8560.8,"width":"140 cm","depth":"140 cm","height":"90 cm","qty":1,"sheetQty":1,"checked":true,"optional":false,"photoSlot":"view2"},
    {"name":"Sillón con brazo izquierdo (Altman Cotton)","code":"PIZQAC","sku":"ARMCAR1PIZQAC","price":8392.6,"width":"155 cm","depth":"114 cm","height":"90 cm","qty":1,"sheetQty":1,"checked":true,"optional":false,"photoSlot":"view3"},
    {"name":"Sillón sin brazos opcional (Módulo central)","code":"PMODTC","sku":"ARMCAR1PMODTC","price":5469.4,"width":"101 cm","depth":"103 cm","height":"90 cm","qty":1,"sheetQty":0,"checked":false,"optional":true,"photoSlot":"view4"}
  ],
  "SALA-DONATI": [
    {"name":"Sillón / Love con brazo derecho (Roble 01)","code":"PDERR1","sku":"ARMDON1PDERR1","price":9193,"width":"150 cm","depth":"112 cm","height":"88 cm","qty":1,"sheetQty":1,"checked":true,"optional":false,"photoSlot":"view1"},
    {"name":"Chaise longue con brazo izquierdo (Roble 01)","code":"HIZQR1","sku":"ARMDONCHIZQR1","price":10793.8,"width":"150 cm","depth":"157 cm","height":"88 cm","qty":1,"sheetQty":1,"checked":true,"optional":false,"photoSlot":"view2"},
    {"name":"Sillón / Love con brazo izquierdo (Opción opuesta)","code":"PIZQR1","sku":"ARMDON1PIZQR1","price":9193,"width":"150 cm","depth":"112 cm","height":"88 cm","qty":1,"sheetQty":0,"checked":false,"optional":true,"photoSlot":"view3"},
    {"name":"Chaise longue con brazo derecho (Opción opuesta)","code":"HDERR1","sku":"ARMDONCHDERR1","price":10793.8,"width":"150 cm","depth":"157 cm","height":"88 cm","qty":1,"sheetQty":0,"checked":false,"optional":true,"photoSlot":"view4"}
  ],
  "SALA-DYLAN": [
    {"name":"Sillón con brazo derecho (Mercury Peyote)","code":"PDEMPE","sku":"ARMDYL1PDEMPE","price":8027.2,"width":"152 cm","depth":"113 cm","height":"91 cm","qty":1,"sheetQty":1,"checked":true,"optional":false,"photoSlot":"view1"},
    {"name":"Sillón sin brazos (Mercury Peyote)","code":"PMOMPE","sku":"ARMDYL1PMOMPE","price":7128.2,"width":"135 cm","depth":"113 cm","height":"91 cm","qty":1,"sheetQty":1,"checked":true,"optional":false,"photoSlot":"view2"},
    {"name":"Esquinero (Mercury Peyote)","code":"ESQMPE","sku":"ARMDYLESQMPE","price":6733.8,"width":"113 cm","depth":"113 cm","height":"91 cm","qty":1,"sheetQty":1,"checked":true,"optional":false,"photoSlot":"view3"},
    {"name":"Sillón con brazo izquierdo (Mercury Peyote)","code":"PIZMPE","sku":"ARMDYL1PIZMPE","price":8027.2,"width":"152 cm","depth":"113 cm","height":"91 cm","qty":1,"sheetQty":1,"checked":true,"optional":false,"photoSlot":"view4"},
    {"name":"Ottoman (Mercury Peyote)","code":"TTOMPE","sku":"ARMDYLOTTOMPE","price":4976.4,"width":"135 cm","depth":"113 cm","height":"48 cm","qty":1,"sheetQty":0,"checked":false,"optional":true,"photoSlot":"view4"}
  ],
  "SALA-LUGANO": [
    {"name":"Sillón con brazo derecho (Nature Linen)","code":"PDERNL","sku":"ARMLUG1PDERNL","price":6675.8,"width":"120 cm","depth":"105 cm","height":"94 cm","qty":1,"sheetQty":1,"checked":true,"optional":false,"photoSlot":"view1"},
    {"name":"Sillón sin brazos (Nature Linen)","code":"PMODNL","sku":"ARMLUG1PMODNL","price":5370.8,"width":"102 cm","depth":"105 cm","height":"94 cm","qty":1,"sheetQty":1,"checked":true,"optional":false,"photoSlot":"view2"},
    {"name":"Esquinero curvo (Nature Linen)","code":"SQCUNL","sku":"ARMLUGESQCUNL","price":5562.2,"width":"135 cm","depth":"135 cm","height":"94 cm","qty":1,"sheetQty":1,"checked":true,"optional":false,"photoSlot":"view3"},
    {"name":"Chaise lounge izquierdo (Nature Linen)","code":"HIZQNL","sku":"ARMLUGCHIZQNL","price":10080.4,"width":"120 cm","depth":"205 cm","height":"94 cm","qty":1,"sheetQty":1,"checked":true,"optional":false,"photoSlot":"view4"},
    {"name":"Sillón con brazo izquierdo (Opción)","code":"PIZQNL","sku":"ARMLUG1PIZQNL","price":6675.8,"width":"120 cm","depth":"105 cm","height":"94 cm","qty":1,"sheetQty":0,"checked":false,"optional":true,"photoSlot":"view4"},
    {"name":"Chaise lounge derecho (Opción)","code":"HDERNL","sku":"ARMLUGCHDERNL","price":10080.4,"width":"120 cm","depth":"205 cm","height":"94 cm","qty":1,"sheetQty":0,"checked":false,"optional":true,"photoSlot":"view4"},
    {"name":"Esquinero recto 90° (Opción)","code":"GESQNL","sku":"ARMLUGESQNL","price":5562.2,"width":"105 cm","depth":"105 cm","height":"94 cm","qty":1,"sheetQty":0,"checked":false,"optional":true,"photoSlot":"view4"}
  ],
  "SALA-MARENO": [
    {"name":"Sofá 3 plazas (Kelsi Cotton)","code":"3PKECO","sku":"ARMMAR3PKECO","price":11942.2,"width":"245 cm","depth":"106 cm","height":"90 cm","qty":1,"sheetQty":1,"checked":true,"optional":false,"photoSlot":"view1"},
    {"name":"Love seat 2 plazas (Kelsi Cotton)","code":"2PKECO","sku":"ARMMAR2PKECO","price":9297.4,"width":"188 cm","depth":"106 cm","height":"90 cm","qty":1,"sheetQty":1,"checked":true,"optional":false,"photoSlot":"view2"}
  ],
  "SALA-MATERA": [
    {"name":"Sillón brazo derecho (Scar Putty)","code":"PDERSP","sku":"ARMMAT1PDERSP","price":11107,"width":"155 cm","depth":"134 cm","height":"94 cm","qty":1,"sheetQty":0,"checked":false,"optional":true,"photoSlot":"view1"},
    {"name":"Sillón brazo izquierdo (Scar Putty)","code":"PIZQSP","sku":"ARMMAT1PIZQSP","price":11107,"width":"155 cm","depth":"134 cm","height":"94 cm","qty":1,"sheetQty":1,"checked":true,"optional":false,"photoSlot":"view2"},
    {"name":"Chaise longue derecho (Opción)","code":"HDERSP","sku":"ARMMATCHDERSP","price":12731,"width":"139 cm","depth":"182 cm","height":"94 cm","qty":1,"sheetQty":1,"checked":true,"optional":false,"photoSlot":"view3"},
    {"name":"Chaise longue izquierdo (Opción)","code":"HIZQSP","sku":"ARMMATCHIZQSP","price":12731,"width":"139 cm","depth":"182 cm","height":"94 cm","qty":1,"sheetQty":0,"checked":false,"optional":true,"photoSlot":"view4"}
  ],
  "SALA-MONACO": [
    {"name":"Sillón brazo izquierdo (Bikendi Linen)","code":"ZQELBL","sku":"ARMMONIZQELBL","price":6281.4,"width":"117 cm","depth":"103 cm","height":"93 cm","qty":1,"sheetQty":1,"checked":true,"optional":false,"photoSlot":"view1"},
    {"name":"Sillón sin brazos (Fancy Pewter)","code":"PMODFA","sku":"ARMMON1PMODFA","price":4593.6,"width":"101 cm","depth":"103 cm","height":"93 cm","qty":1,"sheetQty":1,"checked":true,"optional":false,"photoSlot":"view2"},
    {"name":"Esquinero (Fancy Pewter)","code":"SQFAPE","sku":"ARMMONESQFAPE","price":5411.4,"width":"103 cm","depth":"103 cm","height":"93 cm","qty":1,"sheetQty":1,"checked":true,"optional":false,"photoSlot":"view3"},
    {"name":"Ottoman (Fancy Pewter)","code":"TTFAPE","sku":"ARMMONOTTFAPE","price":3828,"width":"101 cm","depth":"103 cm","height":"48 cm","qty":1,"sheetQty":0,"checked":false,"optional":true,"photoSlot":"view4"},
    {"name":"Esquinero (Bikendi Linen - variante)","code":"SQELBL","sku":"ARMMONESQELBL","price":5869.6,"width":"103 cm","depth":"103 cm","height":"93 cm","qty":1,"sheetQty":0,"checked":false,"optional":true,"photoSlot":"view4"}
  ],
  "SALA-MONET": [
    {"name":"Sofá 3 plazas (Fresh Flax)","code":"PFREFL","sku":"ARMMON3PFREFL","price":16037,"width":"284 cm","depth":"108 cm","height":"98 cm","qty":1,"sheetQty":1,"checked":true,"optional":false,"photoSlot":"view1"},
    {"name":"Love seat 2 plazas (Fresh Flax)","code":"2PFRFL","sku":"ARMMON2PFRFL","price":12725.2,"width":"225 cm","depth":"108 cm","height":"98 cm","qty":1,"sheetQty":1,"checked":true,"optional":false,"photoSlot":"view2"}
  ],
  "SALA-SHELBY": [
    {"name":"Sillón con brazo derecho (Napoli 01)","code":"PDERN1","sku":"ARMSHE1PDERN1","price":7806.8,"width":"152 cm","depth":"113 cm","height":"91 cm","qty":1,"sheetQty":1,"checked":true,"optional":false,"photoSlot":"view1"},
    {"name":"Sillón sin brazos (Napoli 01)","code":"PMODN1","sku":"ARMSHE1PMODN1","price":6507.6,"width":"135 cm","depth":"113 cm","height":"91 cm","qty":1,"sheetQty":1,"checked":true,"optional":false,"photoSlot":"view2"},
    {"name":"Esquinero (Napoli 01)","code":"SQNA01","sku":"ARMSHEESQNA01","price":6797.6,"width":"113 cm","depth":"113 cm","height":"91 cm","qty":1,"sheetQty":1,"checked":true,"optional":false,"photoSlot":"view3"},
    {"name":"Sillón con brazo izquierdo (Napoli 01)","code":"PIZQN1","sku":"ARMSHE1PIZQN1","price":7806.8,"width":"152 cm","depth":"113 cm","height":"91 cm","qty":1,"sheetQty":1,"checked":true,"optional":false,"photoSlot":"view4"},
    {"name":"Ottoman (Napoli 01)","code":"TTNA01","sku":"ARMSHEOTTNA01","price":5011.2,"width":"135 cm","depth":"113 cm","height":"48 cm","qty":1,"sheetQty":0,"checked":false,"optional":true,"photoSlot":"view4"}
  ]
};

        function parseCurrencyNum(val) {
            if (!val) return 0;
            if (typeof val === 'number') return val;
            const clean = val.toString().replace(/[^0-9.-]/g, '');
            const parsed = parseFloat(clean);
            return isNaN(parsed) ? 0 : parsed;
        }

        function getLiveOrKnownSalaCatalog_() {
            const merged = Object.assign({}, KNOWN_SALA_MODULES);
            if (window.LIVE_SHEET_SALAS && typeof window.LIVE_SHEET_SALAS === 'object') {
                Object.keys(window.LIVE_SHEET_SALAS).forEach((k) => {
                    const s = window.LIVE_SHEET_SALAS[k];
                    if (s && Array.isArray(s.pieces) && s.pieces.length > 0) {
                        merged[k] = s.pieces.map((m) => Object.assign({}, m));
                    }
                });
            }
            return merged;
        }

        function analyzeSalaPhotosAndModules() {
            const p = products[currentProdIndex];
            if (!p) return;
            const isSalaCat = String(p.category || '').toUpperCase().includes('SALA') || /^SALA-|^ARM(MAT|MAR|MON|CAR|DON|DYL|LUG|SHE)/i.test(String(p.id || ''));
            if (!isSalaCat) {
                p.sala_modules = [];
                p.is_multipiece = false;
                renderSalaModulesUI();
                showAdminToast('El desglose multi-pieza solo aplica para Salas', 'ℹ️');
                return;
            }
            const v = p.variants ? p.variants[currentVariantIndex] : null;
            const g = (v && v.gallery) ? v.gallery : {};

            let modules = [];
            const catalogMap = getLiveOrKnownSalaCatalog_();
            const upId = String(p.id || '').toUpperCase();
            const upName = String(p.model_name || '').toUpperCase();

            // Priorizar coincidencia exacta en SALAS_MODULARES del Google Sheet para traer TODOS los SKUs (incluyendo opcionales CANT=0)
            const directKey = Object.keys(catalogMap).find((k) => {
                if (upId === k) return true;
                const cleanAlias = k.replace(/^SALA-/, '');
                if (cleanAlias === 'MONET') return upName.includes('MONET') && !upName.includes('LOVE');
                if (cleanAlias === 'MARENO') return upName.includes('MARENO') && !upName.includes('LOVE');
                return cleanAlias.length >= 4 && upName.includes(cleanAlias);
            });

            if (directKey && Array.isArray(catalogMap[directKey])) {
                modules = JSON.parse(JSON.stringify(catalogMap[directKey]));
            } else if (window.CreataCloud && window.CreataCloud.detectProductPieces) {
                const detected = window.CreataCloud.detectProductPieces(p, typeof SKU_DATABASE !== 'undefined' ? SKU_DATABASE : {}, catalogMap);
                modules = detected.modules || [];
            }

            modules.forEach((mod, idx) => {
                if (typeof mod.checked !== 'boolean') {
                    mod.checked = mod.sheetQty !== undefined ? mod.sheetQty > 0 : true;
                }
                const parsedQ = parseInt(mod.qty, 10);
                mod.qty = (!isNaN(parsedQ) && parsedQ > 0) ? parsedQ : 1;
                if (idx === 0) mod.photoSrc = g.view1 || g.ambiente || '';
                else if (idx === 1) mod.photoSrc = g.view2 || '';
                else if (idx === 2) mod.photoSrc = g.view3 || '';
                else if (idx === 3) mod.photoSrc = g.view4 || '';
            });

            p.sala_modules = modules;
            if (modules.length > 1) {
                p.sku = modules.map((m) => m.sku).filter(Boolean).join(' / ') || p.sku;
                const skuInp = document.getElementById('inputAutoSku');
                if (skuInp) skuInp.value = p.sku;
            }
            renderSalaModulesUI();
            if (typeof renderPieceSkuComposer === 'function') renderPieceSkuComposer();
            showAdminToast(`Cargados ${modules.length} SKUs desde SALAS_MODULARES`, '🧩');
        }

        function renderSalaModulesUI() {
            const p = products[currentProdIndex];
            if (!p) return;
            const panel = document.getElementById('salaModulesAnalyzerPanel');
            const listEl = document.getElementById('salaModulesList');
            if (!panel || !listEl) return;

            const isSalaCat = String(p.category || '').toUpperCase().includes('SALA') || /^SALA-|^ARM(MAT|MAR|MON|CAR|DON|DYL|LUG|SHE)/i.test(String(p.id || ''));
            if (!isSalaCat) {
                p.sala_modules = [];
                p.is_multipiece = false;
                panel.style.display = 'none';
                listEl.innerHTML = '';
                return;
            }

            const catalogMap = getLiveOrKnownSalaCatalog_();
            const upId = String(p.id || '').toUpperCase();
            const upName = String(p.model_name || '').toUpperCase();
            const directKey = Object.keys(catalogMap).find((k) => {
                if (upId === k) return true;
                const cleanAlias = k.replace(/^SALA-/, '');
                if (cleanAlias === 'MONET') return upName.includes('MONET') && !upName.includes('LOVE');
                if (cleanAlias === 'MARENO') return upName.includes('MARENO') && !upName.includes('LOVE');
                return cleanAlias.length >= 4 && upName.includes(cleanAlias);
            });

            if (directKey && Array.isArray(catalogMap[directKey])) {
                if (!Array.isArray(p.sala_modules) || p.sala_modules.length < catalogMap[directKey].length) {
                    const prevBySku = {};
                    (p.sala_modules || []).forEach((m) => { if (m && m.sku) prevBySku[m.sku] = m; });
                    p.sala_modules = JSON.parse(JSON.stringify(catalogMap[directKey])).map((m) => {
                        return prevBySku[m.sku] ? Object.assign({}, m, prevBySku[m.sku]) : m;
                    });
                }
            } else if (!p.sala_modules || p.sala_modules.length === 0) {
                if (window.CreataCloud && window.CreataCloud.detectProductPieces) {
                    const detected = window.CreataCloud.detectProductPieces(p, typeof SKU_DATABASE !== 'undefined' ? SKU_DATABASE : {}, catalogMap);
                    if (detected && detected.isMultiPiece) {
                        p.sala_modules = detected.modules || [];
                    }
                }
            }

            const hasMultiplePieces = Array.isArray(p.sala_modules) && p.sala_modules.length > 1;
            panel.style.display = hasMultiplePieces ? 'block' : 'none';
            if (!hasMultiplePieces) return;

            // Mostrar todos los SKUs claramente en el campo superior SKU / Clave
            const allSalaSkus = p.sala_modules.map((m) => m.sku).filter(Boolean).join(' / ');
            if (allSalaSkus) {
                p.sku = allSalaSkus;
                const skuInp = document.getElementById('inputAutoSku');
                if (skuInp) skuInp.value = allSalaSkus;
            }

            const activeCount = p.sala_modules.filter((m) => m.checked !== false).length;
            const totalSkus = p.sala_modules.length;
            const headerBadge = document.getElementById('salaSkuCountBadge');
            if (headerBadge) {
                headerBadge.textContent = `${totalSkus} SKUs (${activeCount} activos${totalSkus - activeCount > 0 ? ` · ${totalSkus - activeCount} opc.` : ''})`;
            }

            listEl.innerHTML = p.sala_modules.map((m, idx) => {
                const isChecked = m.checked !== false;
                const dimsTxt = [m.width, m.depth, m.height].map((d) => String(d || '').replace(/\s*cm$/i, '').trim()).filter(Boolean).join('×');
                const invEntries = m.inventory ? Object.entries(m.inventory).filter(([, v]) => Number(v) > 0) : [];
                const invHtml = invEntries.length > 0
                    ? `<div class="flex flex-wrap gap-1 mt-1">${invEntries.map(([loc, qty]) => `<span class="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-extrabold text-[8px]">${loc}: ${qty}</span>`).join('')}</div>`
                    : '';
                return `
                <div class="flex items-center justify-between gap-1.5 p-2 bg-white border ${isChecked ? 'border-amber-400 bg-amber-50/40' : 'border-slate-200 opacity-85'} rounded-lg text-[10px] shadow-3xs">
                    <label class="flex items-start gap-1.5 flex-1 min-w-0 cursor-pointer">
                        <input type="checkbox" ${isChecked ? 'checked' : ''} onchange="toggleSalaModuleChecked(${idx}, this.checked)" class="accent-amber-600 shrink-0 mt-1">
                        <div class="min-w-0 flex-1">
                            <div class="flex items-center gap-1.5 flex-wrap mb-0.5">
                                <code class="font-mono font-extrabold text-[10px] px-1.5 py-0.5 rounded ${isChecked ? 'bg-amber-200/80 text-amber-950' : 'bg-slate-100 text-slate-700'}">${m.sku || '-'}</code>
                                <span class="text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded-full ${isChecked ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}">${isChecked ? 'Incluida' : 'Opcional (Cant. 0)'}</span>
                                ${dimsTxt ? `<span class="text-[8.5px] text-slate-500 font-semibold">${dimsTxt} cm</span>` : ''}
                            </div>
                            <input type="text" value="${(m.name || '').replace(/"/g, '&quot;')}" onchange="updateSalaModuleField(${idx}, 'name', this.value)" class="w-full font-bold text-slate-800 bg-transparent border-b border-transparent focus:border-amber-400 outline-none text-[10px]">
                            ${invHtml}
                        </div>
                    </label>
                    <div class="flex items-center gap-1 shrink-0">
                        <input type="number" min="1" value="${m.qty || 1}" title="Cantidad" onchange="updateSalaModuleField(${idx}, 'qty', this.value)" class="w-9 text-center font-bold text-slate-700 px-1 py-0.5 bg-slate-50 border border-slate-200 rounded text-[9.5px] outline-none">
                        <div class="flex items-center">
                            <span class="text-[9px] text-slate-500 font-bold mr-0.5">$</span>
                            <input type="number" step="0.01" value="${m.price || 0}" onchange="updateSalaModulePrice(${idx}, this.value)" class="w-20 text-right font-mono font-bold text-slate-800 px-1 py-0.5 bg-slate-50 border border-slate-200 rounded text-[9.5px] outline-none">
                        </div>
                    </div>
                </div>
            `;
            }).join('');

            updateSalaCalculation();
        }

        function updateSalaModuleField(idx, field, val) {
            const p = products[currentProdIndex];
            if (!p || !p.sala_modules || !p.sala_modules[idx]) return;
            p.sala_modules[idx][field] = field === 'qty' ? Math.max(1, parseInt(val, 10) || 1) : val;
            updateSalaCalculation();
        }

        function addSalaModuleManual() {
            const p = products[currentProdIndex];
            if (!p) return;
            if (!Array.isArray(p.sala_modules)) p.sala_modules = [];
            const idx = p.sala_modules.length + 1;
            const pSku = (p.sku || p.id || 'MUEBLE').split('/')[0].split(' + ')[0].trim();
            p.sala_modules.push({
                name: `Pieza ${idx}`,
                code: `PZA-${idx}`,
                sku: `${pSku}-P${idx}`,
                price: 0,
                width: '',
                qty: 1,
                checked: true,
                photoSlot: `view${Math.min(4, idx)}`
            });
            renderSalaModulesUI();
        }

        function updateSalaCalculation() {
            const p = products[currentProdIndex];
            if (!p || !p.sala_modules) return;

            const activeMods = p.sala_modules.filter(m => m.checked !== false);
            const sumPrice = activeMods.reduce((acc, m) => acc + ((parseFloat(m.price) || 0) * (parseInt(m.qty, 10) || 1)), 0);

            const activeSkus = activeMods.map(m => m.sku || m.code || 'PZA');
            const tempSku = activeSkus.length > 0 ? activeSkus.join(' + ') : (p.id || 'SALA');

            p.temp_unified_sku = tempSku;
            p.temp_unified_price = sumPrice;

            const priceEl = document.getElementById('salaSummedPriceDisplay');
            const skuEl = document.getElementById('salaTempUnifiedSkuDisplay');
            if (priceEl) priceEl.innerText = '$' + sumPrice.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            if (skuEl) skuEl.innerText = tempSku;
            if (window.CreataCloud && typeof window.CreataCloud.renderModulePricesBox === 'function') {
                window.CreataCloud.renderModulePricesBox('mModulePrices', p, true);
            }
        }

        function toggleSalaModuleChecked(idx, checked) {
            const p = products[currentProdIndex];
            if (!p || !p.sala_modules || !p.sala_modules[idx]) return;
            p.sala_modules[idx].checked = checked;
            if (checked && (!p.sala_modules[idx].qty || p.sala_modules[idx].qty < 1)) {
                p.sala_modules[idx].qty = 1;
            }
            updateSalaCalculation();
            renderSalaModulesUI();
        }

        function updateSalaModulePrice(idx, newPrice) {
            const p = products[currentProdIndex];
            if (!p || !p.sala_modules || !p.sala_modules[idx]) return;
            p.sala_modules[idx].price = parseFloat(newPrice) || 0;
            updateSalaCalculation();
        }

        async function applySalaUnifiedPriceAndSku() {
            const p = products[currentProdIndex];
            if (!p || !p.temp_unified_sku) return;

            const activeMods = (p.sala_modules || []).filter(m => m.checked !== false);
            if (activeMods.length === 0) {
                showAdminToast('Selecciona al menos 1 pieza o módulo', '⚠️');
                return;
            }

            p.price = '$' + p.temp_unified_price.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            const mPriceEl = document.getElementById('mPrice');
            if (mPriceEl) mPriceEl.innerText = p.price;

            const modWidths = activeMods.map(m => (m.width || '').trim()).filter(Boolean);
            if (modWidths.length > 1) {
                p.width = modWidths.join(' / ');
                const mwEl = document.getElementById('mWidth');
                if (mwEl) mwEl.innerText = p.width;
            }

            p.sku = (p.sala_modules || []).map(m => m.sku).filter(Boolean).join(' / ') || p.temp_unified_sku;
            p.is_unified_sku = true;
            const skuInput = document.getElementById('inputAutoSku');
            if (skuInput) skuInput.value = p.sku;

            const totalQty = activeMods.reduce((acc, m) => acc + (parseInt(m.qty, 10) || 1), 0);
            p.packages = `${totalQty} ${totalQty === 1 ? 'bulto' : 'bultos'}`;
            const mPack = document.getElementById('mPackages');
            if (mPack) mPack.innerText = p.packages;

            await saveCatalogData();
            if (window.CreataCloud && window.CreataCloud.config.isConfigured()) {
                window.CreataCloud.cloudPost('save_product', { product: p });
            }
            renderGrid(products);
            showAdminToast(`¡Configuración de ${totalQty} piezas aplicada! Precio: ${p.price}`, '⚡');
        }