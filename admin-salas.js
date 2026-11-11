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

            const pSku = (p.sku || p.id || '').toUpperCase();
            const pModel = (p.model_name || '').toUpperCase();
            let matchedKey = Object.keys(KNOWN_SALA_MODULES).find(k => pSku.includes(k) || pModel.includes(k.replace('CVVSAL', 'PIERO').replace('ARMMAT', 'MATERA')));

            let modules = [];
            if (matchedKey) {
                modules = JSON.parse(JSON.stringify(KNOWN_SALA_MODULES[matchedKey]));
            } else {
                const basePrice = parseCurrencyNum(p.price);
                const halfPrice = basePrice > 0 ? Math.round(basePrice / 2) : 25000;
                modules = [
                    { name: 'Módulo Derecho', code: 'MOD-DER', sku: `${pSku}-DER`, price: halfPrice, photoSlot: 'view1' },
                    { name: 'Módulo Izquierdo', code: 'MOD-IZQ', sku: `${pSku}-IZQ`, price: halfPrice, photoSlot: 'view2' }
                ];
            }

            modules.forEach((mod, idx) => {
                mod.checked = true;
                if (idx === 0) mod.photoSrc = g.view1 || g.ambiente || '';
                else if (idx === 1) mod.photoSrc = g.view2 || '';
                else if (idx === 2) mod.photoSrc = g.view3 || '';
            });

            p.sala_modules = modules;
            renderSalaModulesUI();
            showAdminToast(`Análisis de fotos: ${modules.length} módulos detectados`, '🛋️');
        }

        function renderSalaModulesUI() {
            const p = products[currentProdIndex];
            if (!p) return;
            const panel = document.getElementById('salaModulesAnalyzerPanel');
            const listEl = document.getElementById('salaModulesList');
            if (!panel || !listEl) return;

            const isSala = (p.category || '').toUpperCase().includes('SALA') || (p.model_name || '').toUpperCase().includes('SALA');
            panel.style.display = isSala ? 'block' : 'none';
            if (!isSala) return;

            if (!p.sala_modules || p.sala_modules.length === 0) {
                analyzeSalaPhotosAndModules();
                return;
            }

            listEl.innerHTML = p.sala_modules.map((m, idx) => `
                <div class="flex items-center justify-between p-1.5 bg-white border ${m.checked ? 'border-amber-400 bg-amber-50/40' : 'border-slate-200'} rounded text-[9.5px]">
                    <label class="flex items-center gap-1.5 flex-1 cursor-pointer">
                        <input type="checkbox" ${m.checked ? 'checked' : ''} onchange="toggleSalaModuleChecked(${idx}, this.checked)" class="accent-amber-600">
                        <div>
                            <strong class="text-slate-800 block">${m.name}</strong>
                            <span class="text-[8.5px] font-mono text-slate-500">SKU: ${m.sku}</span>
                        </div>
                    </label>
                    <div class="flex items-center gap-2">
                        <span class="text-[8px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-bold uppercase">${m.photoSlot || 'FOTO'}</span>
                        <div class="flex items-center">
                            <span class="text-[9px] text-slate-500 font-bold mr-0.5">$</span>
                            <input type="number" step="0.01" value="${m.price || 0}" onchange="updateSalaModulePrice(${idx}, this.value)" class="w-20 text-right font-mono font-bold text-slate-800 px-1 py-0.5 bg-slate-50 border border-slate-200 rounded text-[9.5px] outline-none">
                        </div>
                    </div>
                </div>
            `).join('');

            updateSalaCalculation();
        }

        function updateSalaCalculation() {
            const p = products[currentProdIndex];
            if (!p || !p.sala_modules) return;

            const activeMods = p.sala_modules.filter(m => m.checked);
            const sumPrice = activeMods.reduce((acc, m) => acc + (parseFloat(m.price) || 0), 0);

            const pSku = (p.sku_base || p.sku || p.id || 'SALA').split(' + ')[0].split('-UNIF')[0].trim();
            const modCodes = activeMods.map(m => m.code).join('+');
            const tempSku = activeMods.length > 1 ? `${pSku}-UNIF-${modCodes}` : (activeMods.length === 1 ? activeMods[0].sku : pSku);

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

            const activeMods = (p.sala_modules || []).filter(m => m.checked);
            if (activeMods.length === 0) {
                showAdminToast('Selecciona al menos 1 módulo', '⚠️');
                return;
            }

            // 1. Asignar precio sumado
            p.price = '$' + p.temp_unified_price.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            const mPriceEl = document.getElementById('mPrice');
            if (mPriceEl) mPriceEl.innerText = p.price;

            // 2. Asignar SKU Temporal Unificado
            p.sku = p.temp_unified_sku;
            p.is_unified_sku = true;
            const skuInput = document.getElementById('inputAutoSku');
            if (skuInput) skuInput.value = p.sku;

            // 3. Actualizar bultos
            p.packages = `${activeMods.length} bultos / piezas`;
            const mPack = document.getElementById('mPackages');
            if (mPack) mPack.innerText = p.packages;

            // 4. Detalle en especificaciones
            const breakdown = activeMods.map(m => `${m.name} (${m.sku}): $${(parseFloat(m.price)||0).toLocaleString('es-MX', {minimumFractionDigits:2})}`).join(' + ');
            p.materials = (p.materials ? p.materials.split('\n[Composición]')[0] : '') + `\n[Composición]: ${breakdown}`;
            const mMat = document.getElementById('mMaterials');
            if (mMat) mMat.innerText = p.materials;

            await saveCatalogData();
            renderGrid(products);
            showAdminToast(`¡Unificación aplicada! Precio: ${p.price} | SKU: ${p.sku}`, '⚡');
        }
