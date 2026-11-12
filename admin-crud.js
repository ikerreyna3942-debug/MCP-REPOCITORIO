function prevProduct() {
            if (currentProdIndex > 0) {
                currentProdIndex--;
                currentVariantIndex = 0;
                updateModalView(true);
            }
        }

        function nextProduct() {
            if (currentProdIndex < products.length - 1) {
                currentProdIndex++;
                currentVariantIndex = 0;
                updateModalView(true);
            }
        }

        function showAdminToast(msg, icon = '✨') {
            const toast = document.getElementById('adminToast');
            if (!toast) return;
            const iconEl = document.getElementById('adminToastIcon') || document.getElementById('toastIcon');
            const msgEl = document.getElementById('adminToastMsg') || document.getElementById('toastMsg');
            if (iconEl) iconEl.innerText = icon;
            if (msgEl) msgEl.innerText = msg;
            toast.classList.add('show');
            clearTimeout(window.__toastTimer);
            window.__toastTimer = setTimeout(() => {
                toast.classList.remove('show');
            }, 3000);
        }


        
        function toggleEditMode(forceState = null) {
            isEditMode = (forceState !== null) ? forceState : !isEditMode;
            const p = products[currentProdIndex];
            if (!p) return;
            const v = (p.variants && p.variants[currentVariantIndex]) ? p.variants[currentVariantIndex] : (p.variants ? p.variants[0] : {});

            const btnSave = document.getElementById('btnSaveModal');
            const btnIcon = document.getElementById('editBtnIcon');
            const btnText = document.getElementById('editBtnText');

            if (isEditMode) {
                if (btnSave) btnSave.classList.remove('hidden');
                if (btnIcon) btnIcon.innerText = '👁️';
                if (btnText) btnText.innerText = 'Ver Ficha';

                const titleEl = document.getElementById('modalTitle');
                if (titleEl) {
                    titleEl.innerHTML = `<input type="text" id="edit_title" class="editable-field-input text-base font-bold uppercase" value="${(p.model_name || '').replace(/"/g, '&quot;')}">`;
                }

                const provCatEl = document.getElementById('modalProviderCat');
                if (provCatEl) {
                    const stdCats = [
                        'SALAS & SOFÁS',
                        'SILLAS & SILLONES',
                        'COMEDORES',
                        'BUFETERAS & CREDENZAS',
                        'MESAS DE CENTRO & LATERALES',
                        'RECÁMARAS',
                        'COMPLEMENTOS'
                    ];
                    if (p.category && !stdCats.includes(p.category)) stdCats.push(p.category);
                    provCatEl.innerHTML = `
                        <div class="flex gap-2 mb-1">
                            <input type="text" id="edit_prov" class="editable-field-input w-28 uppercase font-bold text-xs" value="${p.provider_abbr || ''}" placeholder="PROV">
                            <select id="edit_cat" class="editable-field-input text-xs font-bold">
                                ${stdCats.map(c => `<option value="${c}" ${p.category === c ? 'selected' : ''}>${c}</option>`).join('')}
                            </select>
                        </div>
                    `;
                }

                const makeSpecInput = (id, val) => {
                    const el = document.getElementById(id);
                    if (el) {
                        el.parentElement.style.display = '';
                        el.innerHTML = `<input type="text" id="edit_${id}" class="editable-field-input text-center text-xs font-bold" value="${(val || '').replace(/"/g, '&quot;')}">`;
                    }
                };

                const getVal = (vVal, pVal) => (vVal !== undefined && vVal !== null) ? vVal : (pVal || '');

                makeSpecInput('mWidth', getVal(v.width, p.width));
                makeSpecInput('mDepth', getVal(v.depth, p.depth));
                makeSpecInput('mHeight', getVal(v.height, p.height));
                makeSpecInput('mSeat', getVal(v.seat, p.seat));
                makeSpecInput('mPackages', getVal(v.packages, p.packages));
                makeSpecInput('mVolume', getVal(v.volume, p.volume));

                const priceEl = document.getElementById('mPrice');
                if (priceEl) {
                    priceEl.innerHTML = `<input type="text" id="edit_price" class="editable-field-input text-right font-black text-emerald-700 text-sm" value="${(p.price || '').replace(/"/g, '&quot;')}">`;
                }

                const matEl = document.getElementById('mMaterials');
                if (matEl) {
                    if (matEl.parentElement) matEl.parentElement.style.display = '';
                    matEl.innerHTML = `<textarea id="edit_materials" rows="2" class="editable-field-input text-xs">${getVal(v.materials, p.materials)}</textarea>`;
                }

                const driveBtn = document.getElementById('modalDriveBtn');
                if (driveBtn) {
                    let driveInput = document.getElementById('edit_drive_wrap');
                    if (!driveInput) {
                        driveInput = document.createElement('div');
                        driveInput.id = 'edit_drive_wrap';
                        driveInput.className = 'mt-2';
                        driveInput.innerHTML = `<input type="url" id="edit_drive_url" class="editable-field-input text-[11px] text-blue-600" placeholder="Enlace de Ficha Técnica Google Drive" value="${getVal(v.drive_ficha_url, p.drive_ficha_url)}">`;
                        driveBtn.parentElement.appendChild(driveInput);
                    } else {
                        const inEl = document.getElementById('edit_drive_url');
                        if (inEl) inEl.value = getVal(v.drive_ficha_url, p.drive_ficha_url);
                    }
                    driveInput.style.display = '';
                }

            } else {
                if (btnSave) btnSave.classList.add('hidden');
                if (btnIcon) btnIcon.innerText = '✏️';
                if (btnText) btnText.innerText = 'Editar Ficha';

                const driveInput = document.getElementById('edit_drive_wrap');
                if (driveInput) driveInput.style.display = 'none';

                updateModalView(false);
            }
        }

        async function saveCurrentModalChanges() {
            const p = products[currentProdIndex];
            const v = (p.variants && p.variants[currentVariantIndex]) ? p.variants[currentVariantIndex] : (p.variants ? p.variants[0] : {});

            const titleInput = document.getElementById('edit_title');
            if (titleInput && titleInput.value.trim()) {
                const updatedName = titleInput.value.trim();
                p.model_name = updatedName;
                v.name = updatedName;
                (p.variants || []).forEach(vItem => {
                    vItem.model_name = updatedName;
                });
                const rp = rawProducts.find(item => item.id === p.id);
                if (rp) {
                    rp.model_name = updatedName;
                    (rp.variants || []).forEach(vItem => { vItem.model_name = updatedName; });
                }
            }

            const provInput = document.getElementById('edit_prov');
            if (provInput) {
                p.provider_abbr = provInput.value.trim().toUpperCase();
                p.provider = p.provider_abbr;
            }

            const catSelect = document.getElementById('edit_cat');
            if (catSelect) p.category = catSelect.value;

            const getSpecVal = (id) => {
                const inp = document.getElementById('edit_' + id);
                return inp ? inp.value.trim() : null;
            };

            const w = getSpecVal('mWidth');
            const d = getSpecVal('mDepth');
            const h = getSpecVal('mHeight');
            const s = getSpecVal('mSeat');
            const pkg = getSpecVal('mPackages');
            const vol = getSpecVal('mVolume');

            if (w !== null) { v.width = w; if (currentVariantIndex === 0 || !p.width) p.width = w; }
            if (d !== null) { v.depth = d; if (currentVariantIndex === 0 || !p.depth) p.depth = d; }
            if (h !== null) { v.height = h; if (currentVariantIndex === 0 || !p.height) p.height = h; }
            if (s !== null) { v.seat = s; if (currentVariantIndex === 0 || !p.seat) p.seat = s; }
            if (pkg !== null) { v.packages = pkg; if (currentVariantIndex === 0 || !p.packages) p.packages = pkg; }
            if (vol !== null) { v.volume = vol; if (currentVariantIndex === 0 || !p.volume) p.volume = vol; }

            const priceInput = document.getElementById('edit_price');
            if (priceInput) p.price = priceInput.value.trim();

            const matInput = document.getElementById('edit_materials');
            if (matInput) {
                v.materials = matInput.value.trim();
                if (currentVariantIndex === 0 || !p.materials) p.materials = v.materials;
            }

            const driveInput = document.getElementById('edit_drive_url');
            if (driveInput) {
                v.drive_ficha_url = driveInput.value.trim();
                if (currentVariantIndex === 0 || !p.drive_ficha_url) p.drive_ficha_url = v.drive_ficha_url;
            }

            await saveCatalogData();
            let cloudMsg = '';
            if (window.CreataCloud && window.CreataCloud.config.isConfigured()) {
                const syncRes = await window.CreataCloud.cloudPost('save_product', { product: p });
                if (syncRes && syncRes.ok) {
                    cloudMsg = ' · ☁️ Sheets en vivo';
                } else if (syncRes && syncRes.error) {
                    cloudMsg = ` · ⚠️ Error Sheets: ${syncRes.error}`;
                }
            }
            toggleEditMode(false);
            updateCategoryCounts();
            filterCatalog();
            updateAdminBadge();
            showAdminToast(`¡Cambios guardados con éxito${cloudMsg}!`, '✅');
        }

        async function deleteCurrentFurniture() {
            const p = products[currentProdIndex];
            if (!p) return;
            const deletedId = p.id;
            const deletedName = p.model_name;
            if (!confirm(`¿Estás seguro de eliminar "${deletedName}" del catálogo?\nEsta acción no se puede deshacer.`)) {
                return;
            }
            products.splice(currentProdIndex, 1);
            await saveCatalogData();
            if (window.CreataCloud && window.CreataCloud.config.isConfigured()) {
                await window.CreataCloud.cloudPost('delete_product', { productId: deletedId });
            }
            closeModal();
            updateCategoryCounts();
            filterCatalog();
            updateAdminBadge();
            showAdminToast(`"${deletedName}" eliminado correctamente`, '🗑️');
        }

        function openNewFurnitureModal() {
            const newProd = {
                id: 'PROD-' + Date.now(),
                archived: true,
                model_name: 'NUEVO MUEBLE',
                provider_abbr: 'ARM',
                provider: 'ARM',
                category: currentFilter !== 'ALL' && currentFilter !== 'ARCHIVED' ? currentFilter : 'SALAS & SOFÁS',
                width: '0 cm',
                depth: '0 cm',
                height: '0 cm',
                seat: '0 cm',
                packages: '1 bulto',
                volume: '1.00 m³',
                price: '$0.00',
                cost: '$0.00',
                drive_ficha_url: '',
                drive_file_id: '',
                materials: '',
                variants: [
                    {
                        id: 'VAR-' + Date.now(),
                        name: 'NUEVO MUEBLE',
                        color_label: 'Opción 1',
                        swatch_hex: '#B8893E',
                        swatch_img: '',
                        hero_b64: '',
                        gallery: {
                            ambiente: '',
                            finish: '',
                            finishes: [],
                            fabric: '',
                            view1: '',
                            view2: '',
                            view3: '',
                            view4: '',
                            all_views: []
                        }
                    }
                ]
            };

            products.unshift(newProd);
            currentProdIndex = 0;
            currentVariantIndex = 0;
            saveCatalogData();
            updateCategoryCounts();
            filterCatalog();
            updateAdminBadge();
            openModal(0, 0, 0, true);
            showAdminToast('Ficha creada en ARCHIVADO. Agrega fotos/precio y desarchívala para publicar.', '📦');
        }

        function updateAdminBadge() {
            const badge = document.getElementById('adminCountDisplay');
            if (badge) badge.innerText = products.length;
        }

        async function saveCatalogData() {
            try {
                const db = await openCatalogDB();
                const tx = db.transaction(STORE_NAME, 'readwrite');
                tx.objectStore(STORE_NAME).put(products, 'catalog_data');
                await new Promise(r => tx.oncomplete = r);
                localStorage.setItem('creata_catalog_v18_brand', 'true');
                localStorage.setItem('creata_catalog_v12_linked', 'true');
                if (window.CreataCloud && window.CreataCloud.notifyLiveCatalogSync) {
                    window.CreataCloud.notifyLiveCatalogSync({ action: 'local_save' });
                }
            } catch (e) {
                console.warn('[DB Error]', e);
            }
        }

        function exportCatalogJSON() {
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(products, null, 2));
            const dl = document.createElement('a');
            dl.setAttribute("href", dataStr);
            dl.setAttribute("download", `catalogo_creata_${new Date().toISOString().slice(0,10)}.json`);
            dl.click();
            dl.remove();
            showAdminToast('Respaldo JSON descargado', '💾');
        }

        function importCatalogJSON(event) {
            const file = event.target.files[0];
            event.target.value = '';
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const parsed = JSON.parse(e.target.result);
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        products = parsed;
                        await saveCatalogData();
                        renderGrid(products);
                        updateAdminBadge();
                        showAdminToast(`Se importaron ${products.length} muebles`, '📂');
                    } else {
                        alert(`El archivo no contiene un catálogo válido.`);
                    }
                } catch (err) {
                    alert('Error al leer el archivo JSON: ' + err.message);
                }
            };
            reader.readAsText(file);
        }

        
        // ==========================================================================
        // VACIADO DE FICHAS Y RESTAURACIÓN DE RESPALDO
        // ==========================================================================
        async function wipeAllProducts() {
            if (!confirm(`⚠️ ¿Estás seguro de que deseas ELIMINAR TODAS las fichas del catálogo actual?\n\nEsta acción borrará las fichas activas del editor. Puedes volver a recargarlas con "Recargar Base" o importando un respaldo JSON.`)) {
                return;
            }
            products = [];
            await saveCatalogData();
            updateCategoryCounts();
            filterCatalog();
            updateAdminBadge();
            showAdminToast('Todas las fichas anteriores han sido eliminadas. Catálogo limpio.', '🗑️');
        }

        async function resetDefaultCatalog() {
            if (!confirm('¿Recargar las 47 fichas oficiales limpias del catálogo? Se descartarán cambios locales no exportados.')) return;
            products = JSON.parse(JSON.stringify(rawProducts));
            await saveCatalogData();
            updateCategoryCounts();
            filterCatalog();
            updateAdminBadge();
            showAdminToast(`Catálogo oficial recargado: ${products.length} fichas`, '🔄');
        }

        // ==========================================================================
        // CONEXIÓN EN VIVO CON GOOGLE SHEETS & DRIVE (APPS SCRIPT)
        // ==========================================================================
        function setCloudFeedback(msg, isError = false) {
            const el = document.getElementById('cloudSyncFeedback');
            if (!el) return;
            el.textContent = msg;
            el.className = isError
                ? 'text-xs font-semibold text-red-400 mt-2'
                : 'text-xs font-semibold text-emerald-400 mt-2';
        }

        function updateCloudStatusUI() {
            const indicator = document.getElementById('cloudLiveIndicator');
            const connected = !!(window.CreataCloud && window.CreataCloud.config.isConfigured());
            const hasWrite = !!(window.CreataCloud && window.CreataCloud.config.hasWriteApi && window.CreataCloud.config.hasWriteApi());
            const hasGemini = !!(window.CreataCloud && window.CreataCloud.config.hasGeminiApiKey && window.CreataCloud.config.hasGeminiApiKey());

            if (indicator) {
                const baseTxt = hasWrite
                    ? 'Google Sheets En Vivo'
                    : (connected ? 'Google Sheets Conectado' : 'Modo Local');
                indicator.textContent = hasGemini ? `${baseTxt} · IA Gemini` : `${baseTxt} · IA Recorte`;
            }
        }

        function openCloudSetupModal() {
            const modal = document.getElementById('cloudSetupModal');
            if (!modal) return;
            const urlInp = document.getElementById('cloudApiUrlInput');
            const pinInp = document.getElementById('cloudPinInput');
            const gemInp = document.getElementById('cloudGeminiKeyInput');
            if (urlInp && window.CreataCloud) urlInp.value = window.CreataCloud.config.getApiUrl();
            if (pinInp && window.CreataCloud) pinInp.value = window.CreataCloud.config.getAdminPin();
            if (gemInp && window.CreataCloud && window.CreataCloud.config.getGeminiApiKey) {
                gemInp.value = window.CreataCloud.config.getGeminiApiKey();
            }
            setCloudFeedback('');
            updateCloudStatusUI();
            modal.classList.add('active');
        }

        function closeCloudSetupModal() {
            const modal = document.getElementById('cloudSetupModal');
            if (modal) modal.classList.remove('active');
        }

        async function refreshCatalogFromCloud() {
            if (!window.CreataCloud || !window.CreataCloud.config.isConfigured()) return null;
            const cloudList = await window.CreataCloud.fetchCloudCatalog('admin', 12000);
            if (!Array.isArray(cloudList)) return null;
            if (cloudList.length > 0) {
                products = cloudList;
                await saveCatalogData();
                updateCategoryCounts();
                filterCatalog();
                updateAdminBadge();
            }
            return cloudList;
        }

        async function saveCloudSetupConfig() {
            if (!window.CreataCloud) return;
            const url = (document.getElementById('cloudApiUrlInput')?.value || '').trim();
            const pin = (document.getElementById('cloudPinInput')?.value || '').trim();
            const geminiKey = (document.getElementById('cloudGeminiKeyInput')?.value || '').trim();

            if (url && !/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec/i.test(url)) {
                setCloudFeedback('La URL debe terminar en /exec (de script.google.com/macros/s/...).', true);
                return;
            }

            window.CreataCloud.config.setApiUrl(url);
            window.CreataCloud.config.setAdminPin(pin);
            if (window.CreataCloud.config.setGeminiApiKey) {
                window.CreataCloud.config.setGeminiApiKey(geminiKey);
            }
            updateCloudStatusUI();

            if (!url) {
                const gemNote = geminiKey ? ' · Clave Google AI Studio (Gemini) guardada.' : '';
                setCloudFeedback(`Conexión desconectada. Modo local activo${gemNote}`, false);
                showAdminToast(geminiKey ? 'Clave Gemini guardada ✅' : 'Modo local restaurado', 'ℹ️');
                return;
            }

            setCloudFeedback('Probando conexión con Google Sheets...');
            const cloudList = await refreshCatalogFromCloud();
            if (cloudList === null) {
                setCloudFeedback('No respondió el Web App. Verifica el PIN y que el acceso sea "Cualquier usuario".', true);
                return;
            }
            const gemMsg = geminiKey ? ' + IA Gemini 2.5 activa ✨' : ' + IA Recorte IS-Net activa ✨';
            if (cloudList.length === 0) {
                setCloudFeedback(`Conectado${gemMsg}. Sheets está vacío.`, false);
                showAdminToast(`Apps Script conectado correctamente${gemMsg}`, '✅');
            } else {
                setCloudFeedback(`Conectado en vivo (${cloudList.length} productos sincronizados)${gemMsg}.`, false);
                showAdminToast(`Conectado: ${cloudList.length} fichas sincronizadas${gemMsg}`, '✅');
            }
        }

        async function triggerCloudDriveSync() {
            if (!window.CreataCloud || !window.CreataCloud.config.isConfigured()) {
                openCloudSetupModal();
                setCloudFeedback('Primero pega y guarda la URL /exec de Apps Script.', true);
                return;
            }
            setCloudFeedback('Escaneando Drive con IA y creando filas ARCHIVADO en Sheets...');
            showAdminToast('Buscando fichas nuevas en Drive...', '⏳');

            const res = await window.CreataCloud.cloudPost('sync_drive', {}, 60000);
            if (!res || !res.ok) {
                const errMsg = (res && res.error) ? res.error : 'Error al sincronizar Drive';
                setCloudFeedback(errMsg, true);
                showAdminToast(errMsg, '❌');
                return;
            }

            const cloudList = await refreshCatalogFromCloud();
            const added = Number(res.added || 0);
            const skipped = Number(res.skipped || 0);
            if (added > 0) setFilter('ARCHIVED');

            const summary = added > 0
                ? `Se importaron ${added} fichas nuevas como ARCHIVADO (${skipped} ya existían).`
                : `Drive al día: 0 fichas nuevas (${skipped} ya registradas en Sheets).`;
            setCloudFeedback(summary + (cloudList ? ` Total en Sheets: ${cloudList.length}.` : ''));
            showAdminToast(summary, added > 0 ? '📥' : '✅');
        }

        async function pushAllProductsToSheets() {
            if (!window.CreataCloud || !window.CreataCloud.config.isConfigured()) {
                openCloudSetupModal();
                setCloudFeedback('Primero guarda la URL /exec de Apps Script.', true);
                return;
            }
            if (!Array.isArray(products) || products.length === 0) {
                setCloudFeedback('No hay productos cargados en el editor.', true);
                return;
            }

            const batchSize = 15;
            let uploaded = 0;
            for (let i = 0; i < products.length; i += batchSize) {
                const batch = products.slice(i, i + batchSize);
                setCloudFeedback(`Subiendo bloque ${Math.floor(i / batchSize) + 1} (${uploaded}/${products.length})...`);
                const res = await window.CreataCloud.cloudPost('bulk_seed', { products: batch }, 60000);
                if (!res || !res.ok) {
                    const errMsg = (res && res.error) ? res.error : 'Fallo durante bulk_seed';
                    setCloudFeedback(errMsg, true);
                    showAdminToast(errMsg, '❌');
                    return;
                }
                uploaded += Number(res.count || batch.length);
            }

            setCloudFeedback(`¡Listo! ${uploaded} fichas sincronizadas en Google Sheets.`, false);
            showAdminToast(`${uploaded} fichas cargadas en Google Sheets ☁️`, '✅');
        }
        // ==========================================================================
