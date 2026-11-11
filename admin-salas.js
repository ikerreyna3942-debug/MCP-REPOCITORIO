// MÓDULOS DE SALA: ANÁLISIS DE FOTOS, SUMA DE PRECIOS Y SKU TEMPORAL UNIFICADO
        // ==========================================================================
        const KNOWN_SALA_MODULES = {
            'ARMMAT': [
                { name: 'Sillón Brazo Derecho Matera', code: '1PDER', sku: 'ARMMAT1PDERSP', price: 35242.96, photoSlot: 'view1' },
                { name: 'Sillón Brazo Izquierdo Matera', code: '1PIZQ', sku: 'ARMMAT1PIZQSP', price: 35242.96, photoSlot: 'view2' },
                { name: 'Chaise Longue Matera', code: 'CHAISE', sku: 'ARMMATCHIZQSP', price: 40396.00, photoSlot: 'view3' }
            ],
            'ARMMAR': [
                { name: 'Sofá 3 Plazas Mareno', code: '3P', sku: 'ARMMAR3PKECO', price: 37893.08, photoSlot: 'view1' },
                { name: 'Love Seat 2 Plazas Mareno', code: '2P', sku: 'ARMMAR2PKECO', price: 29501.02, photoSlot: 'view2' }
            ],
            'ARMMON': [
                { name: 'Sofá 3 Plazas Monet', code: '3P', sku: 'ARMMON3PFREFL', price: 50886.04, photoSlot: 'view1' },
                { name: 'Love Seat 2 Plazas Monet', code: '2P', sku: 'ARMMON2PFRFL', price: 40377.57, photoSlot: 'view2' }
            ],
            'ARMDON': [
                { name: 'Sillón Brazo Derecho Donati', code: '1PDER', sku: 'ARMDON1PDERR1', price: 32000.00, photoSlot: 'view1' },
                { name: 'Sillón Brazo Izquierdo Donati', code: '1PIZQ', sku: 'ARMDON1PIZQR1', price: 32000.00, photoSlot: 'view2' },
                { name: 'Chaise Longue Donati', code: 'CHAISE', sku: 'ARMDONCHIZQR1', price: 36000.00, photoSlot: 'view3' }
            ],
            'CVVSALPIE': [
                { name: 'Módulo Central Piero', code: 'MOD-CEN', sku: 'CVVSALPIEFPBU', price: 50149.90, photoSlot: 'view1' },
                { name: 'Módulo Chaise Piero', code: 'CHAISE', sku: 'CVVSALPIEFPMO', price: 50149.90, photoSlot: 'view2' }
            ],
            'CVVSALAARIO': [
                { name: 'Módulo Principal Aria', code: 'MOD-1', sku: 'CVVSALAARIOI', price: 42724.03, photoSlot: 'view1' },
                { name: 'Chaise / L Aria', code: 'MOD-2', sku: 'CVVSALAARIOF', price: 49296.97, photoSlot: 'view2' }
            ]
        };

        function parseCurrencyNum(val) {
            if (!val) return 0;
            if (typeof val === 'number') return val;
            const clean = val.toString().replace(/[^0-9.-]/g, '');
            const parsed = parseFloat(clean);
            return isNaN(parsed) ? 0 : parsed;
        }

        function analyzeSalaPhotosAndModules() {
            const p = products[currentProdIndex];
            if (!p) return;
            const v = p.variants ? p.variants[currentVariantIndex] : null;
            const g = (v && v.gallery) ? v.gallery : {};

            let modules = [];
            if (window.CreataCloud && window.CreataCloud.detectProductPieces) {
                const detected = window.CreataCloud.detectProductPieces(p, typeof SKU_DATABASE !== 'undefined' ? SKU_DATABASE : {}, KNOWN_SALA_MODULES);
                modules = detected.modules || [];
            } else {
                const pSku = (p.sku || p.id || '').toUpperCase();
                const basePrice = parseCurrencyNum(p.price);
                const halfPrice = basePrice > 0 ? Math.round(basePrice / 2) : 25000;
                modules = [
                    { name: 'Módulo Derecho', code: 'MOD-DER', sku: `${pSku}-DER`, price: halfPrice, qty: 1, photoSlot: 'view1' },
                    { name: 'Módulo Izquierdo', code: 'MOD-IZQ', sku: `${pSku}-IZQ`, price: halfPrice, qty: 1, photoSlot: 'view2' }
                ];
            }

            modules.forEach((mod, idx) => {
                mod.checked = mod.checked !== false;
                mod.qty = mod.qty || 1;
                if (idx === 0) mod.photoSrc = g.view1 || g.ambiente || '';
                else if (idx === 1) mod.photoSrc = g.view2 || '';
                else if (idx === 2) mod.photoSrc = g.view3 || '';
                else if (idx === 3) mod.photoSrc = g.view4 || '';
            });

            p.sala_modules = modules;
            renderSalaModulesUI();
            showAdminToast(`Detección automática: ${modules.length} ${modules.length === 1 ? 'pieza' : 'piezas'}`, '🧩');
        }

        function renderSalaModulesUI() {
            const p = products[currentProdIndex];
            if (!p) return;
            const panel = document.getElementById('salaModulesAnalyzerPanel');
            const listEl = document.getElementById('salaModulesList');
            if (!panel || !listEl) return;

            if (!p.sala_modules || p.sala_modules.length === 0) {
                if (window.CreataCloud && window.CreataCloud.detectProductPieces) {
                    const detected = window.CreataCloud.detectProductPieces(p, typeof SKU_DATABASE !== 'undefined' ? SKU_DATABASE : {}, KNOWN_SALA_MODULES);
                    p.sala_modules = detected.modules || [];
                }
            }

            const hasMultiplePieces = Array.isArray(p.sala_modules) && p.sala_modules.length > 1;
            const isSala = (p.category || '').toUpperCase().includes('SALA') || (p.model_name || '').toUpperCase().includes('SALA');
            panel.style.display = (hasMultiplePieces || isSala) ? 'block' : 'none';
            if (!hasMultiplePieces && !isSala) return;

            if (!p.sala_modules || p.sala_modules.length === 0) {
                analyzeSalaPhotosAndModules();
                return;
            }

            listEl.innerHTML = p.sala_modules.map((m, idx) => `
                <div class="flex items-center justify-between gap-1.5 p-1.5 bg-white border ${m.checked !== false ? 'border-amber-400 bg-amber-50/40' : 'border-slate-200'} rounded text-[9.5px]">
                    <label class="flex items-center gap-1.5 flex-1 min-w-0 cursor-pointer">
                        <input type="checkbox" ${m.checked !== false ? 'checked' : ''} onchange="toggleSalaModuleChecked(${idx}, this.checked)" class="accent-amber-600 shrink-0">
                        <div class="min-w-0 flex-1">
                            <input type="text" value="${(m.name || '').replace(/"/g, '&quot;')}" onchange="updateSalaModuleField(${idx}, 'name', this.value)" class="w-full font-bold text-slate-800 bg-transparent border-b border-transparent focus:border-amber-400 outline-none text-[10px]">
                            <div class="flex items-center gap-1.5 text-[8.5px] text-slate-500">
                                <span class="font-mono">SKU: ${m.sku || '-'}</span>
                                ${m.width ? `<span>· ${m.width}</span>` : ''}
                            </div>
                        </div>
                    </label>
                    <div class="flex items-center gap-1 shrink-0">
                        <input type="number" min="1" value="${m.qty || 1}" title="Cantidad" onchange="updateSalaModuleField(${idx}, 'qty', this.value)" class="w-10 text-center font-bold text-slate-700 px-1 py-0.5 bg-slate-50 border border-slate-200 rounded text-[9px] outline-none">
                        <div class="flex items-center">
                            <span class="text-[9px] text-slate-500 font-bold mr-0.5">$</span>
                            <input type="number" step="0.01" value="${m.price || 0}" onchange="updateSalaModulePrice(${idx}, this.value)" class="w-20 text-right font-mono font-bold text-slate-800 px-1 py-0.5 bg-slate-50 border border-slate-200 rounded text-[9.5px] outline-none">
                        </div>
                    </div>
                </div>
            `).join('');

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
            const pSku = (p.sku || p.id || 'MUEBLE').split(' + ')[0];
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

            const pSku = (p.sku_base || p.sku || p.id || 'MUEBLE').split(' + ')[0].split('-UNIF')[0].trim();
            const modCodes = activeMods.map(m => m.code || 'PZA').join('+');
            const tempSku = activeMods.length > 1 ? `${pSku}-UNIF-${modCodes}` : (activeMods.length === 1 ? (activeMods[0].sku || pSku) : pSku);

            p.temp_unified_sku = tempSku;
            p.temp_unified_price = sumPrice;

            const priceEl = document.getElementById('salaSummedPriceDisplay');
            const skuEl = document.getElementById('salaTempUnifiedSkuDisplay');
            if (priceEl) priceEl.innerText = '$' + sumPrice.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            if (skuEl) skuEl.innerText = tempSku;
        }

        function toggleSalaModuleChecked(idx, checked) {
            const p = products[currentProdIndex];
            if (!p || !p.sala_modules || !p.sala_modules[idx]) return;
            p.sala_modules[idx].checked = checked;
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

            // 1. Asignar precio sumado oficial
            p.price = '$' + p.temp_unified_price.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            const mPriceEl = document.getElementById('mPrice');
            if (mPriceEl) mPriceEl.innerText = p.price;

            // 2. Asignar medidas combinadas si las piezas tienen anchos definidos
            const modWidths = activeMods.map(m => (m.width || '').trim()).filter(Boolean);
            if (modWidths.length > 1) {
                p.width = modWidths.join(' / ');
                const mwEl = document.getElementById('mWidth');
                if (mwEl) mwEl.innerText = p.width;
            }

            // 3. SKU interno unificado (oculto para el catálogo público)
            p.sku = p.temp_unified_sku;
            p.is_unified_sku = true;
            const skuInput = document.getElementById('inputAutoSku');
            if (skuInput) skuInput.value = p.sku;

            // 4. Actualizar bultos totales
            const totalQty = activeMods.reduce((acc, m) => acc + (parseInt(m.qty, 10) || 1), 0);
            p.packages = `${totalQty} ${totalQty === 1 ? 'bulto' : 'bultos'}`;
            const mPack = document.getElementById('mPackages');
            if (mPack) mPack.innerText = p.packages;

            await saveCatalogData();
            if (window.CreataCloud && window.CreataCloud.config.isConfigured()) {
                window.CreataCloud.cloudPost('save_product', { product: p });
            }
            renderGrid(products);
            showAdminToast(`¡Suma de ${totalQty} piezas aplicada! Precio: ${p.price}`, '⚡');
        }
