    // ------------------------------------------------------------------------
    // BUSCADOR Y ALTA DE CLIENTES REGISTRADOS
    // ------------------------------------------------------------------------
    let lastErpClientSearchResults = [];
    let erpClientSearchInFlight = false;
    let erpClientCreateInFlight = false;

    function syncDynamicClientModeOption() {
        quoteDraftMeta.clientMode = FIXED_QUOTE_CLIENT_MODE;
        quoteDraftMeta.categoryLabel = FIXED_QUOTE_CATEGORY_LABEL;
        const sel = document.getElementById('quoteClientModeSelect');
        if (sel) sel.value = FIXED_QUOTE_CLIENT_MODE;
        const catSel = document.getElementById('quoteCategorySelect');
        if (catSel) catSel.value = FIXED_QUOTE_CATEGORY_LABEL;
    }

    function renderSelectedErpClientBadge() {
        const badge = document.getElementById('quoteSelectedErpClientBadge');
        if (!badge) return;
        const cid = Number(quoteDraftMeta.erpClientId) || 0;
        const lid = Number(quoteDraftMeta.erpLeadId) || 0;
        const isLocalRef = cid <= 0 && lid <= 0 && cleanStr(quoteDraftMeta.erpClientSource).toUpperCase() === 'COTIZACION' && cleanStr(quoteDraftMeta.clientName);
        if (cid <= 0 && lid <= 0 && !isLocalRef) {
            badge.innerHTML = '';
            badge.classList.add('hidden');
            return;
        }
        const nm = cleanStr(quoteDraftMeta.clientName) || 'Cliente seleccionado';
        const tag = cid > 0
            ? ('Cliente #' + cid + (quoteDraftMeta.erpNoCliente ? (' · No. ' + quoteDraftMeta.erpNoCliente) : ''))
            : (lid > 0
                ? ('Prospecto #' + lid)
                : ('Cotización previa' + (quoteDraftMeta.erpNoCliente ? (' · ' + quoteDraftMeta.erpNoCliente) : '')));
        const extraInfo = [cleanStr(quoteDraftMeta.clientPhone), cleanStr(quoteDraftMeta.clientEmail), cleanStr(quoteDraftMeta.erpClientAddress)]
            .filter(Boolean)
            .join(' · ');
        badge.innerHTML =
            '<div class="min-w-0">' +
                '<div class="font-extrabold uppercase leading-snug break-words">✓ ' + escapeHtml(tag) + ': ' + escapeHtml(nm) + '</div>' +
                (extraInfo ? ('<div class="text-[11px] font-semibold opacity-85 break-words mt-0.5">' + escapeHtml(extraInfo) + '</div>') : '') +
            '</div>' +
            '<button type="button" onclick="clearSelectedErpClient()" class="inv-erp-client-unlink-btn px-2.5 py-1 rounded-full text-[11px] font-extrabold uppercase border shrink-0" style="border-color:#065F46; background:#FFFFFF; color:#065F46;">Desvincular</button>';
        badge.classList.remove('hidden');
    }

    window.onQuoteClientModeSelectChange = function () {
        quoteDraftMeta.clientMode = FIXED_QUOTE_CLIENT_MODE;
        quoteDraftMeta.categoryLabel = FIXED_QUOTE_CATEGORY_LABEL;
        saveQuoteDraftMeta();
    };

    window.clearSelectedErpClient = function () {
        if (isActiveQuoteCompleted()) return;
        quoteDraftMeta.erpClientId = 0;
        quoteDraftMeta.erpLeadId = 0;
        quoteDraftMeta.erpNoCliente = '';
        quoteDraftMeta.erpClientAddress = '';
        quoteDraftMeta.erpClientSource = '';
        quoteDraftMeta.clientMode = FIXED_QUOTE_CLIENT_MODE;
        quoteDraftMeta.categoryLabel = FIXED_QUOTE_CATEGORY_LABEL;
        const sel = document.getElementById('quoteClientModeSelect');
        if (sel) sel.value = FIXED_QUOTE_CLIENT_MODE;
        renderSelectedErpClientBadge();
        saveQuoteDraftMeta();
    };

    function selectErpClientObject(cli) {
        if (!cli || typeof cli !== 'object') return;
        const cid = parseInt(cli.idCliente, 10) || 0;
        const lid = cid > 0 ? 0 : (parseInt(cli.idLead, 10) || 0);
        const fullName = cleanStr(cli.nombre || cli.nombreCompleto);
        const phone = cleanStr(cli.celular || cli.telefono);
        const email = cleanStr(cli.correo);
        const addr = cleanStr(cli.direccion);

        quoteDraftMeta.erpClientId = cid;
        quoteDraftMeta.erpLeadId = lid;
        quoteDraftMeta.erpNoCliente = cleanStr(cli.noCliente || cli.lastFolio);
        quoteDraftMeta.erpClientAddress = addr;
        quoteDraftMeta.erpClientSource = cleanStr(cli.type || (cid > 0 ? 'CLIENTE' : (lid > 0 ? 'LEAD' : 'COTIZACION')));
        if (fullName) quoteDraftMeta.clientName = fullName;
        if (phone) quoteDraftMeta.clientPhone = phone;
        if (email) quoteDraftMeta.clientEmail = email;

        const nameInp = document.getElementById('quoteClientNameInput');
        const phoneInp = document.getElementById('quoteClientPhoneInput');
        const emailInp = document.getElementById('quoteClientEmailInput');
        if (nameInp && fullName) nameInp.value = fullName;
        if (phoneInp && phone) phoneInp.value = phone;
        if (emailInp && email) emailInp.value = email;

        syncDynamicClientModeOption();
        renderSelectedErpClientBadge();
        const resEl = document.getElementById('quoteErpClientResults');
        if (resEl) {
            resEl.innerHTML = '';
            resEl.classList.add('hidden');
        }
        const searchInp = document.getElementById('quoteErpClientSearchInput');
        if (searchInp && typeof searchInp.blur === 'function') {
            try { searchInp.blur(); } catch (eB) {}
        }
        saveQuoteDraftMeta();
    }

    window.selectErpClientFromSearch = function (idx) {
        if (isActiveQuoteCompleted()) return;
        const cli = lastErpClientSearchResults[idx];
        if (cli) selectErpClientObject(cli);
    };

    function searchLocalRecentClientsInMemory(rawQuery) {
        const qNorm = String(rawQuery || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
        const tokens = qNorm.split(/\s+/).filter(t => t.length >= 2);
        const qDigits = String(rawQuery || '').replace(/\D+/g, '');
        if (!qNorm && qDigits.length < 3) return [];
        const list = Array.isArray(myRecentQuotesList) ? myRecentQuotesList : [];
        const out = [];
        const seen = new Set();
        for (let i = 0; i < list.length; i++) {
            const q = list[i] || {};
            const nm = cleanStr(q.cliente || q.clientName || q.clienteProyecto || '');
            const tel = cleanStr(q.telefono || q.clientPhone || '');
            const em = cleanStr(q.correo || q.clientEmail || '');
            const fol = cleanStr(q.folio || q.folioErp || q.ordenSucursal || '');
            if (!nm && !tel) continue;
            const hayPlain = (nm + ' ' + em + ' ' + fol).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
            const hayDig = (tel + ' ' + fol).replace(/\D+/g, '');
            const matched = (qDigits.length >= 4 && hayDig.includes(qDigits)) ||
                (qNorm && hayPlain.includes(qNorm)) ||
                (tokens.length > 0 && tokens.every(tok => hayPlain.includes(tok)));
            if (!matched) continue;
            const key = hayPlain.slice(0, 60) + '|' + tel.replace(/\D+/g, '').slice(-10);
            if (seen.has(key)) continue;
            seen.add(key);
            out.push({
                type: 'COTIZACION',
                idCliente: 0,
                idLead: 0,
                noCliente: fol,
                lastFolio: fol,
                nombre: nm || tel,
                telefono: tel,
                celular: tel,
                correo: em,
                direccion: ''
            });
            if (out.length >= 10) break;
        }
        return out;
    }

    function renderErpClientSearchResultsList(resEl, clients, warningMsg) {
        if (!resEl) return;
        const warnHtml = warningMsg
            ? ('<div class="rounded-lg border px-3 py-1.5 text-[11px] font-bold sem-yellow">' + escapeHtml(warningMsg) + '</div>')
            : '';
        resEl.innerHTML = warnHtml + clients.map((c, idx) => {
            const isCli = Number(c.idCliente) > 0;
            const isLead = !isCli && Number(c.idLead) > 0;
            const badgeTxt = isCli
                ? ('CLIENTE #' + c.idCliente + (c.noCliente ? (' · No. ' + c.noCliente) : ''))
                : (isLead
                    ? ('PROSPECTO #' + c.idLead)
                    : ('COTIZACIÓN PREVIA' + (c.lastFolio || c.noCliente ? (' · ' + (c.lastFolio || c.noCliente)) : '')));
            const badgeBg = isCli ? '#1A1816' : (isLead ? '#9E7B4F' : '#475569');
            const subParts = [cleanStr(c.telefono || c.celular), cleanStr(c.correo), cleanStr(c.direccion)].filter(Boolean);
            return '<div class="inv-erp-client-card rounded-lg border px-3 py-2 bg-white flex items-center justify-between gap-2 hover:shadow-sm transition" style="border-color:#E6E1D8;">' +
                '<div class="min-w-0 flex-1">' +
                    '<div class="flex flex-wrap items-center gap-1.5">' +
                        '<span class="px-2 py-0.5 rounded-full text-[11px] font-extrabold uppercase" style="background:' + badgeBg + '; color:#FFFFFF;">' + escapeHtml(badgeTxt) + '</span>' +
                        '<span class="text-[11px] font-extrabold uppercase break-words leading-snug" style="color:#1A1816;">' + escapeHtml(c.nombre || '') + '</span>' +
                    '</div>' +
                    (subParts.length ? ('<div class="text-[11px] font-semibold opacity-80 break-words mt-0.5" style="color:#1A1816;">' + escapeHtml(subParts.join(' · ')) + '</div>') : '') +
                '</div>' +
                '<button type="button" onclick="selectErpClientFromSearch(' + idx + ')" class="inv-erp-client-pick-btn px-3 py-1.5 rounded-full text-[11px] font-extrabold uppercase shrink-0" style="background:#9E7B4F; color:#FFFFFF;">Elegir</button>' +
            '</div>';
        }).join('');
    }

    window.searchErpClientsLive = async function () {
        if (isGuestSession() || erpClientSearchInFlight) return;
        const inp = document.getElementById('quoteErpClientSearchInput');
        const btn = document.getElementById('btnSearchErpClients');
        const resEl = document.getElementById('quoteErpClientResults');
        if (!resEl) return;

        if (isActiveQuoteCompleted()) {
            resEl.innerHTML = '<div class="rounded-lg border px-3 py-2 text-[11px] font-bold sem-yellow">Esta cotización ya fue generada. Pulsa <strong>+ Nueva</strong> para crear otra y buscar cliente.</div>';
            resEl.classList.remove('hidden');
            return;
        }
        if (!activeAdvisorSession || activeAdvisorSession.mustChangeKey) {
            openAuthModalForStartup();
            return;
        }

        const q = cleanStr(inp ? inp.value : '');
        if (q.length < 2) {
            resEl.innerHTML = '<div class="rounded-lg border px-3 py-2 text-[11px] font-bold sem-yellow">Escribe al menos 2 caracteres para buscar.</div>';
            resEl.classList.remove('hidden');
            if (inp) inp.focus();
            return;
        }

        if (inp && typeof inp.blur === 'function') {
            try { inp.blur(); } catch (eB) {}
        }

        erpClientSearchInFlight = true;
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Buscando...';
        }
        resEl.innerHTML = '<div class="rounded-lg border px-3 py-2 text-[11px] font-semibold bg-white" style="border-color:#E6E1D8; color:#1A1816;">Buscando cliente en S Mueblería...</div>';
        resEl.classList.remove('hidden');

        try {
            const res = await callInvWebAppPost('inv_search_erp_clients', {
                authToken: activeAdvisorSession.authToken || '',
                sheetTab: activeAdvisorSession.sheetTab || '',
                advisorEmail: activeAdvisorSession.correo || '',
                query: q
            }, 40000, true);

            const isSilentAuthReject = Boolean(res && !res.ok && !res.unavailable && !res.needsRedeploy && !cleanStr(res.error));
            if ((res && res.authRequired) || isSilentAuthReject) {
                const msg = (res && res.error) || 'Tu sesión requiere confirmación para buscar clientes.';
                resEl.innerHTML =
                    '<div class="rounded-lg border px-3 py-2 text-[11px] font-bold sem-yellow flex flex-wrap items-center justify-between gap-2">' +
                        '<span>' + escapeHtml(msg) + '</span>' +
                        '<button type="button" onclick="promptSessionReauth(\'Confirma tu contraseña para buscar clientes.\', function(){ searchErpClientsLive(); })" class="px-3 py-1.5 rounded-full text-[11px] font-extrabold uppercase" style="background:#1A1816; color:#FFFFFF;">Confirmar sesión</button>' +
                    '</div>';
                promptSessionReauth(msg, () => { searchErpClientsLive(); });
                return;
            }

            if (!res || res.needsRedeploy || res.unavailable || !res.ok) {
                const localHits = searchLocalRecentClientsInMemory(q);
                if (localHits.length) {
                    lastErpClientSearchResults = localHits;
                    renderErpClientSearchResultsList(resEl, localHits, 'S Mueblería no respondió a tiempo; mostrando coincidencias de tus cotizaciones recientes.');
                    return;
                }
                const errText = (res && res.error)
                    ? res.error
                    : 'No se pudo conectar con S Mueblería en este momento. Intenta de nuevo o registra el cliente.';
                resEl.innerHTML =
                    '<div class="rounded-lg border px-3 py-2.5 text-[11px] font-bold sem-red flex flex-wrap items-center justify-between gap-2">' +
                        '<span class="min-w-0 flex-1">' + escapeHtml(errText) + '</span>' +
                        '<div class="flex items-center gap-1.5 shrink-0">' +
                            '<button type="button" onclick="searchErpClientsLive()" class="px-2.5 py-1 rounded-full text-[11px] font-extrabold uppercase" style="background:#1A1816; color:#FFFFFF;">Reintentar</button>' +
                            '<button type="button" onclick="toggleNewErpClientForm(true)" class="px-2.5 py-1 rounded-full text-[11px] font-extrabold uppercase" style="background:#9E7B4F; color:#FFFFFF;">+ Nuevo cliente</button>' +
                        '</div>' +
                    '</div>';
                return;
            }

            lastErpClientSearchResults = Array.isArray(res.clients) ? res.clients : [];
            if (!lastErpClientSearchResults.length) {
                const localHits = searchLocalRecentClientsInMemory(q);
                if (localHits.length) {
                    lastErpClientSearchResults = localHits;
                    renderErpClientSearchResultsList(resEl, localHits, 'Sin coincidencias exactas en S Mueblería; mostrando coincidencias de tus cotizaciones recientes.');
                    return;
                }
                resEl.innerHTML =
                    '<div class="rounded-lg border px-3 py-2.5 text-[11px] font-semibold bg-white flex flex-wrap items-center justify-between gap-2" style="border-color:#E6E1D8; color:#1A1816;">' +
                        '<span>Sin coincidencias para <strong>' + escapeHtml(q) + '</strong>.</span>' +
                        '<button type="button" onclick="toggleNewErpClientForm(true)" class="px-3 py-1.5 rounded-full text-[11px] font-extrabold uppercase" style="background:#9E7B4F; color:#FFFFFF;">+ Nuevo cliente</button>' +
                    '</div>';
                return;
            }

            renderErpClientSearchResultsList(resEl, lastErpClientSearchResults, cleanStr(res.warning || ''));
        } finally {
            erpClientSearchInFlight = false;
            if (btn) {
                btn.disabled = isActiveQuoteCompleted();
                btn.textContent = 'Buscar cliente';
            }
        }
    };

    window.toggleNewErpClientForm = function (forceState) {
        const panel = document.getElementById('quoteNewErpClientPanel');
        const msg = document.getElementById('newErpClientMsg');
        if (!panel) return;
        const nextOpen = (typeof forceState === 'boolean') ? forceState : panel.classList.contains('hidden');
        if (nextOpen && isActiveQuoteCompleted()) return;
        panel.classList.toggle('hidden', !nextOpen);
        if (msg) {
            msg.textContent = '';
            msg.classList.add('hidden');
        }
        if (nextOpen) {
            notifyInvBackStatePush('cart_new_client_form');
            const searchInp = document.getElementById('quoteErpClientSearchInput');
            const nomInp = document.getElementById('newCliNombre');
            if (nomInp && !cleanStr(nomInp.value) && searchInp && cleanStr(searchInp.value) && !/\d{4,}/.test(searchInp.value)) {
                nomInp.value = cleanStr(searchInp.value);
            }
            if (nomInp) setTimeout(() => nomInp.focus(), 40);
        }
    };

    function showNewErpClientMsg(text, tone) {
        const el = document.getElementById('newErpClientMsg');
        if (!el) return;
        if (!text) {
            el.textContent = '';
            el.classList.add('hidden');
            return;
        }
        el.textContent = text;
        el.className = 'rounded-lg border px-3 py-2 text-[11px] font-bold ' +
            (tone === 'ok' ? 'sem-green' : (tone === 'warn' ? 'sem-yellow' : 'sem-red'));
    }

    window.submitNewErpClientLive = async function () {
        if (isGuestSession() || erpClientCreateInFlight || isActiveQuoteCompleted()) return;
        if (!activeAdvisorSession || activeAdvisorSession.mustChangeKey) {
            openAuthModalForStartup();
            return;
        }

        const valOf = id => cleanStr((document.getElementById(id) || {}).value);
        const nombre = valOf('newCliNombre');
        const paterno = valOf('newCliPaterno');
        const materno = valOf('newCliMaterno');
        const telefono = valOf('newCliTelefono');
        const correo = valOf('newCliCorreo');
        const empresa = valOf('newCliEmpresa');
        const rfc = valOf('newCliRfc').toUpperCase();
        const calle = valOf('newCliCalle');
        const colonia = valOf('newCliColonia');
        const cp = valOf('newCliCp');
        const ciudad = valOf('newCliCiudad');
        const estado = valOf('newCliEstado') || 'QUINTANA ROO';

        if (!nombre) {
            showNewErpClientMsg('Ingresa el nombre del cliente.', 'err');
            const nEl = document.getElementById('newCliNombre');
            if (nEl) nEl.focus();
            return;
        }
        if (!telefono) {
            showNewErpClientMsg('Ingresa el teléfono o celular del cliente.', 'err');
            const tEl = document.getElementById('newCliTelefono');
            if (tEl) tEl.focus();
            return;
        }

        const btn = document.getElementById('btnSaveNewErpClient');
        erpClientCreateInFlight = true;
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Guardando...';
        }
        showNewErpClientMsg('Registrando cliente...', 'warn');

        try {
            const sess = enrichAdvisorLocation(activeAdvisorSession);
            const effAdvId = sess.isAdmin
                ? (cleanStr(quoteDraftMeta.erpAdvisorId) || cleanStr(sess.erpAdvisorId))
                : cleanStr(sess.erpAdvisorId);

            const res = await callInvWebAppPost('inv_create_erp_client', {
                authToken: sess.authToken || '',
                sheetTab: sess.sheetTab || '',
                advisorEmail: sess.correo || '',
                erpStore: cleanStr(quoteDraftMeta.erpStore) || cleanStr(sess.erpStore),
                erpAdvisorId: effAdvId,
                nombre: nombre,
                paterno: paterno,
                materno: materno,
                telefono: telefono,
                celular: telefono,
                correo: correo,
                empresa: empresa,
                rfc: rfc,
                calle: calle,
                colonia: colonia,
                cp: cp,
                ciudad: ciudad,
                estado: estado
            }, 30000);

            if (res && res.authRequired) {
                showNewErpClientMsg('Confirma tu contraseña para registrar clientes.', 'warn');
                promptSessionReauth(res.error || 'Confirma tu contraseña para continuar.', null);
                return;
            }

            if (!res || res.needsRedeploy || res.unavailable) {
                showNewErpClientMsg('Registro de clientes no disponible en este momento.', 'warn');
                return;
            }

            if (!res.ok || !res.client) {
                showNewErpClientMsg(res.error || 'No fue posible registrar al cliente.', 'err');
                return;
            }

            selectErpClientObject(res.client);
            ['newCliNombre', 'newCliPaterno', 'newCliMaterno', 'newCliTelefono', 'newCliCorreo', 'newCliEmpresa', 'newCliRfc', 'newCliCalle', 'newCliColonia', 'newCliCp', 'newCliCiudad'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
            toggleNewErpClientForm(false);
        } finally {
            erpClientCreateInFlight = false;
            if (btn) {
                btn.disabled = isActiveQuoteCompleted();
                btn.textContent = 'Guardar cliente';
            }
        }
    };

    window.setCartItemDiscount = function (skuRaw, rawPct) {
        if (isGuestSession() || isActiveQuoteCompleted()) return;
        const key = String(skuRaw || '').trim().toUpperCase();
        if (!cart[key]) return;
        let pct = Number(rawPct);
        if (isNaN(pct) || !isFinite(pct)) pct = 0;
        const maxPct = getMaxDiscountPct();
        if (pct > maxPct) {
            alert('Tu cuenta (' + getAdvisorRoleInfo().puesto + ') permite un descuento máximo de ' + maxPct + '% por partida.');
        }
        pct = Math.max(0, Math.min(maxPct, pct));
        cart[key].discountPct = pct;
        saveCart();
        renderCartItems();
    };

    function syncSkuCartControls(key) {
        if (isGuestSession()) {
            const ctrlWraps = document.querySelectorAll('[data-sku-ctrl="' + CSS.escape(key) + '"]');
            ctrlWraps.forEach(wrapEl => {
                if (wrapEl.parentNode) wrapEl.parentNode.removeChild(wrapEl);
            });
            const addBtn = document.getElementById('detAddCartBtn');
            const subBtn = document.getElementById('detSubCartBtn');
            const remAllBtn = document.getElementById('detRemoveAllCartBtn');
            if (addBtn) addBtn.classList.add('hidden');
            if (subBtn) subBtn.classList.add('hidden');
            if (remAllBtn) remAllBtn.classList.add('hidden');
            return;
        }
        const q = (!isActiveQuoteCompleted() && cart[key]) ? (Number(cart[key].qty) || 0) : 0;

        // Actualizar controles inline (- qty + / +) en fichas de portada, listado y variantes
        const ctrlWraps = document.querySelectorAll('[data-sku-ctrl="' + CSS.escape(key) + '"]');
        ctrlWraps.forEach(wrapEl => {
            const parent = wrapEl.parentNode;
            if (!parent) return;
            const prevOnclick = wrapEl.onclick;
            const temp = document.createElement('div');
            temp.innerHTML = buildCardCartControlHtml(key);
            const nextWrap = temp.firstElementChild;
            if (nextWrap) {
                nextWrap.onclick = prevOnclick;
                parent.replaceChild(nextWrap, wrapEl);
            }
        });

        // Compatibilidad si existe algún botón simple con data-sku-btn
        const btns = document.querySelectorAll('[data-sku-btn="' + CSS.escape(key) + '"]');
        btns.forEach(b => {
            b.textContent = q > 0 ? ('+' + q) : '+';
            b.classList.toggle('in-cart', q > 0);
        });

        if (currentDetailItem && String(currentDetailItem.s).toUpperCase() === key) {
            const addBtn = document.getElementById('detAddCartBtn');
            const subBtn = document.getElementById('detSubCartBtn');
            const remAllBtn = document.getElementById('detRemoveAllCartBtn');
            if (addBtn) {
                addBtn.textContent = q > 0 ? ('Agregar (' + q + ')') : 'Agregar';
            }
            if (subBtn) {
                subBtn.classList.toggle('hidden', q <= 0);
            }
            if (remAllBtn) {
                remAllBtn.classList.add('hidden');
            }
        }
    }

    window.addToCart = function (skuRaw, delta) {
        if (isGuestSession()) return;
        const key = String(skuRaw || '').trim().toUpperCase();
        if (!key) return;
        const stepDelta = (typeof delta === 'number' && !isNaN(delta)) ? delta : 1;
        // Si había una cotización recién terminada y se agrega un producto nuevo, abrir en automático una cotización nueva limpia
        if (isActiveQuoteCompleted()) {
            if (stepDelta <= 0) return;
            purgeCompletedAndActivateBlankDraft();
        }
        const it = bySkuMap.get(key);
        if (!cart[key]) {
            if (stepDelta <= 0 || !it || !isQuotableItem(it)) return;
            if (getBodegaPisoStock(it) < 1 && typeof hasValidErpPrice === 'function' && !hasValidErpPrice(it)) return;
            cart[key] = {
                sku: it.s,
                name: cleanStr(it.n) || it.s,
                price: formatPrice(it.pr),
                qty: 0,
                discountPct: 0
            };
        } else if (it && it.pr) {
            cart[key].price = formatPrice(it.pr);
            cart[key].name = cleanStr(it.n) || cleanStr(cart[key].name) || it.s;
        }
        cart[key].qty = Math.max(0, (Number(cart[key].qty) || 0) + stepDelta);
        if (cart[key].qty <= 0) {
            delete cart[key];
        }
        saveCart();
        syncSkuCartControls(key);

        const cartModalEl = document.getElementById('cartModal');
        if (cartModalEl && cartModalEl.classList.contains('open')) {
            renderCartItems();
        }
    };

    window.removeFromCart = function (skuRaw) {
        if (isActiveQuoteCompleted()) return;
        const key = String(skuRaw || '').trim().toUpperCase();
        if (!key || !cart[key]) return;
        delete cart[key];
        saveCart();
        syncSkuCartControls(key);

        const cartModalEl = document.getElementById('cartModal');
        if (cartModalEl && cartModalEl.classList.contains('open')) {
            renderCartItems();
        }
    };

    window.addCurrentDetailToCart = function () {
        if (!currentDetailItem) return;
        addToCart(currentDetailItem.s, 1);
    };

    window.subtractCurrentDetailFromCart = function () {
        if (!currentDetailItem) return;
        addToCart(currentDetailItem.s, -1);
    };

    window.removeCurrentDetailFromCart = function () {
        if (!currentDetailItem) return;
        removeFromCart(currentDetailItem.s);
    };

    window.openCartModal = async function () {
        if (isGuestSession()) return;
        if (!activeAdvisorSession || activeAdvisorSession.mustChangeKey) {
            openAuthModalForStartup();
            return;
        }
        pruneExpiredQuoteDrafts(false);
        if (!erpAdvisorsCatalog.length) {
            loadErpCatalogLiveFromSheet().then(() => populateQuoteAdvisorControls()).catch(() => {});
        }
        populateQuoteAdvisorControls();
        renderQuoteDraftsBar();
        renderCartItems();
        applyQuoteCompletedLockUI();
        renderMyRecentQuotes(myRecentQuotesList);
        document.getElementById('cartModal').classList.add('open');
        notifyInvBackStatePush('cart_modal');
        if (typeof scheduleSaveInvWorkspaceCheckpoint === 'function') {
            scheduleSaveInvWorkspaceCheckpoint();
        }
        refreshMyLiveQuotesInfo();
    };

    window.closeCartModal = function () {
        if (typeof window.closeQuoteConfirmCreateModal === 'function') {
            window.closeQuoteConfirmCreateModal();
        }
        if (typeof window.closeQuoteGeneratedPdfsModal === 'function') {
            window.closeQuoteGeneratedPdfsModal();
        }
        const modalEl = document.getElementById('cartModal');
        if (modalEl) modalEl.classList.remove('open');
        // Cuando se termina una cotización y se cierra la pestaña/ventana, descartar la terminada y dejar lista únicamente una nueva cotización
        if (quoteDrafts.some(d => d && d.completed)) {
            purgeCompletedAndActivateBlankDraft();
        }
        if (typeof scheduleSaveInvWorkspaceCheckpoint === 'function') {
            scheduleSaveInvWorkspaceCheckpoint();
        }
    };

    window.clearCart = function () {
        if (isActiveQuoteCompleted()) return;
        const prevKeys = Object.keys(cart);
        cart = {};
        lastSubmittedQuoteMeta = null;
        saveCart();
        prevKeys.forEach(k => syncSkuCartControls(k));
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
        let sumList = 0;
        const maxPct = getMaxDiscountPct();

        for (let i = 0; i < entries.length; i++) {
            const row = entries[i];
            const key = String(row.sku || '').toUpperCase();
            const liveIt = bySkuMap.get(key);
            const rawCartName = (row.name && String(row.name).trim().toUpperCase() !== key) ? row.name : '';
            const itemName = stripDimensionsFromProductText((liveIt && cleanStr(liveIt.n)) || rawCartName) || 'PRODUCTO COTIZADO';
            const itemPriceStr = (liveIt && formatPrice(liveIt.pr)) || formatPrice(row.price);
            const unitList = parsePriceNum(itemPriceStr);
            const qty = Math.max(1, Number(row.qty) || 1);
            const discPct = Math.max(0, Math.min(maxPct, Number(row.discountPct) || 0));
            const unitFinal = unitList * (1 - (discPct / 100));
            const lineSubtotal = unitFinal * qty;
            sumLines += lineSubtotal;
            sumList += unitList * qty;

            lines.push({
                key: key,
                sku: row.sku,
                name: itemName,
                qty: qty,
                discountPct: discPct,
                unitList: unitList,
                unitFinal: unitFinal,
                lineSubtotal: lineSubtotal,
                photoUrl: liveIt ? photoUrlForItem(liveIt) : '',
                measures: liveIt ? cleanStr(liveIt.m) : '',
                variant: liveIt ? cleanStr(liveIt.vr) : ''
            });
        }

        // El descuento total (partidas + descuento extra en $) no puede superar el % permitido en la columna Descuento
        const minAllowedTotal = sumList * (1 - (maxPct / 100));
        const maxExtraAllowed = Math.max(0, Math.floor((sumLines - minAllowedTotal) * 100) / 100);
        const requestedExtra = Math.max(0, Number(quoteDraftMeta.extraDiscount) || 0);
        const extraDiscount = Math.min(requestedExtra, maxExtraAllowed);
        const totalWithIva = Math.max(0, sumLines - extraDiscount);
        const subtotalNoIva = totalWithIva / 1.16;
        const ivaAmount = totalWithIva - subtotalNoIva;

        return {
            lines: lines,
            sumLines: sumLines,
            sumList: sumList,
            maxPct: maxPct,
            maxExtraAllowed: maxExtraAllowed,
            requestedExtra: requestedExtra,
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
        const limitEl = document.getElementById('quoteDiscountLimitInfo');
        const bd = computeQuoteBreakdown();

        if (!bd.lines.length) {
            if (totalBar) totalBar.classList.add('hidden');
            return;
        }
        if (totalBar) totalBar.classList.remove('hidden');
        if (limitEl) {
            const role = getAdvisorRoleInfo();
            const effPct = bd.sumList > 0 ? ((bd.sumList - bd.totalWithIva) / bd.sumList) * 100 : 0;
            const promoSuffix = (!role.isManager && isAdvisorDiscount30Active() && role.maxPct === ADVISOR_PROMO_MAX_DISCOUNT_PCT)
                ? ' (vigente hasta 30/11/2026)'
                : '';
            let html = 'Puesto: <strong>' + escapeHtml(role.puesto) + '</strong> · Descuento autorizado: <strong>' + role.maxPct + '%' + promoSuffix + '</strong>' +
                ' · Descuento aplicado: <strong>' + effPct.toFixed(1) + '%</strong>';
            if (bd.requestedExtra > bd.extraDiscount + 0.004) {
                html += '<div style="color:#991B1B;margin-top:3px;">El descuento extra se ajustó a ' + escapeHtml(formatPrice(bd.extraDiscount) || '$0.00') +
                    ' para no superar el ' + role.maxPct + '% autorizado.</div>';
            }
            limitEl.innerHTML = html;
        }
        if (subEl) subEl.textContent = formatPrice(bd.subtotalNoIva) || '$0.00';
        if (ivaEl) ivaEl.textContent = formatPrice(bd.ivaAmount) || '$0.00';
        if (totalAmtEl) totalAmtEl.textContent = formatPrice(bd.totalWithIva) || '$0.00';
    }

    function renderCartItems() {
        const wrap = document.getElementById('cartItemsContainer');
        const countLbl = document.getElementById('quoteItemsCountLabel');
        if (!wrap) return;

        const locked = isActiveQuoteCompleted();

        const bd = computeQuoteBreakdown();
        if (countLbl) {
            countLbl.textContent = bd.lines.length + (bd.lines.length === 1 ? ' partida' : ' partidas') +
                (bd.lines.length > 15 ? ' (excede límite de 15)' : '');
            countLbl.style.color = bd.lines.length > 15 ? '#991B1B' : '#252C32';
        }

        if (!bd.lines.length) {
            wrap.innerHTML = '<div class="text-center py-6 rounded-xl border text-[11px] font-semibold opacity-60" style="border-color:#E8E4DE;">No hay productos agregados a la plantilla de cotización.</div>';
            renderQuoteTotalsOnly();
            return;
        }

        const disAttr = locked ? ' disabled' : '';
        wrap.innerHTML = bd.lines.map((ln, idx) => {
            const unitStr = ln.unitList > 0 ? formatPrice(ln.unitList) : 'Sin precio';
            const lineSubStr = ln.lineSubtotal > 0 ? formatPrice(ln.lineSubtotal) : '$0.00';
            const skuLabel = cleanStr(ln.sku || ln.key);
            return '<div class="inv-cart-item-card">' +
                '<div class="inv-cart-item-main" data-inv-act="cart-open-detail" data-sku="' + escapeHtml(ln.key) + '">' +
                    (function () { const liveIt = bySkuMap.get(ln.key); return liveIt ? buildThumbHtml(liveIt, { compact: true }) : ''; })() +
                    '<div class="inv-cart-item-info">' +
                        '<div class="inv-cart-item-title">' +
                            '<span class="inv-cart-item-num">' + (idx + 1) + '.</span>' +
                            escapeHtml(ln.name) +
                        '</div>' +
                        (skuLabel ? ('<span class="inv-cart-item-sku">SKU: ' + escapeHtml(skuLabel) + '</span>') : '') +
                        '<div class="inv-cart-item-prices">' +
                            '<span class="inv-cart-price-list">P. Lista: ' + escapeHtml(unitStr) + '</span>' +
                            '<span class="inv-cart-price-sub">Importe: ' + escapeHtml(lineSubStr) + '</span>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
                '<div class="inv-cart-item-controls">' +
                    '<div class="inv-cart-item-disc" title="Descuento">' +
                        '<span class="inv-cart-disc-label">Desc% <span class="inv-cart-disc-max">(máx ' + bd.maxPct + ')</span></span>' +
                        '<input type="number" inputmode="decimal" min="0" max="' + bd.maxPct + '" step="0.5" value="' + (ln.discountPct || 0) + '"' + disAttr + ' ' +
                               'data-inv-change="cart-discount" data-sku="' + escapeHtml(ln.key) + '" ' +
                               'aria-label="Descuento porcentaje" ' +
                               'class="inv-cart-disc-input">' +
                    '</div>' +
                    (locked
                        ? ('<span class="inv-cart-locked-qty">Cant: ' + ln.qty + '</span>')
                        : ('<div class="inv-cart-item-qty-group">' +
                            '<button type="button" title="Restar 1" aria-label="Restar 1" data-inv-act="cart-qty" data-delta="-1" data-sku="' + escapeHtml(ln.key) + '" class="inv-cart-qty-btn">−</button>' +
                            '<span class="inv-cart-qty-val">' + ln.qty + '</span>' +
                            '<button type="button" title="Sumar 1" aria-label="Sumar 1" data-inv-act="cart-qty" data-delta="1" data-sku="' + escapeHtml(ln.key) + '" class="inv-cart-qty-btn is-plus">+</button>' +
                            '<button type="button" title="Quitar" aria-label="Quitar producto" data-inv-act="cart-remove" data-sku="' + escapeHtml(ln.key) + '" class="inv-cart-remove-btn">✕</button>' +
                        '</div>')) +
                '</div>' +
            '</div>';
        }).join('');

        if (window.CreataGuard && typeof window.CreataGuard.protectImages === 'function') {
            window.CreataGuard.protectImages(wrap);
        }
        renderQuoteTotalsOnly();
    }

    function collectQuoteSubmissionPayload(sendToErp) {
        if (!isActiveQuoteCompleted()) {
            saveQuoteDraftMeta();
        }
        const bd = computeQuoteBreakdown();
        const sess = activeAdvisorSession ? enrichAdvisorLocation(activeAdvisorSession) : null;
        const isAdmin = isEffectiveAdminSession();
        const previewStore = isKevinAdvisorPreviewActive() ? getKevinAdvisorPreviewStore() : '';
        const erpStore = isAdmin
            ? (cleanStr(quoteDraftMeta.erpStore) || (sess && sess.erpStore) || 'CEDIS')
            : (previewStore || (sess && sess.erpStore) || 'CREATA PUERTO CANCUN');
        const isProy = /PROYECTO/i.test(erpStore) || (!isAdmin && !previewStore && !!(sess && sess.isProyecto));
        const prefix = getStoreFolioPrefix(erpStore, previewStore ? '' : (sess && sess.orderPrefix));
        const erpAdvisorLabel = isAdmin
            ? (cleanStr(quoteDraftMeta.erpAdvisorLabel) || (sess && sess.erpAdvisorLabel) || ((sess ? (sess.nombre || sess.correo).toUpperCase() : '') + ' | ' + erpStore))
            : ((sess && sess.erpAdvisorLabel) || (sess ? ((sess.nombre || sess.correo).toUpperCase() + ' | ' + erpStore) : ''));
        const erpAdvisorId = isAdmin
            ? (cleanStr(quoteDraftMeta.erpAdvisorId) || extractErpIdFromLabel(erpAdvisorLabel) || (sess && sess.erpAdvisorId) || '')
            : ((sess && sess.erpAdvisorId) || extractErpIdFromLabel(erpAdvisorLabel) || '');

        const activeFolio = (lastSubmittedQuoteMeta && lastSubmittedQuoteMeta.folio)
            || (lastSubmittedQuoteMeta && lastSubmittedQuoteMeta.orderCode)
            || getEstimatedStoreFolio(erpStore, prefix);

        return {
            sendToErp: !!sendToErp,
            authToken: sess ? (sess.authToken || '') : '',
            sheetTab: sess ? (sess.sheetTab || '') : '',
            advisorEmail: sess ? sess.correo : '',
            advisorName: sess ? sess.nombre : '',
            branchLabel: isAdmin ? erpStore : (sess ? sess.branchLabel : ''),
            orderPrefix: prefix,
            orderCode: activeFolio,
            quoteType: isProy ? 'PROYECTO' : (isAdmin ? 'ADMINISTRATIVO' : (sess ? sess.quoteType : 'SUCURSAL')),
            isProyecto: isProy,
            isAdmin: isAdmin,
            erpStore: erpStore,
            erpAdvisorLabel: erpAdvisorLabel,
            erpAdvisorId: erpAdvisorId,
            categoryLabel: FIXED_QUOTE_CATEGORY_LABEL,
            clientMode: FIXED_QUOTE_CLIENT_MODE,
            clientName: cleanStr(quoteDraftMeta.clientName) || (isProy ? 'PROYECTO CREATA' : 'PROSPECTO EN TIENDA'),
            clientPhone: cleanStr(quoteDraftMeta.clientPhone),
            clientEmail: cleanStr(quoteDraftMeta.clientEmail),
            erpClientId: Number(quoteDraftMeta.erpClientId) || 0,
            erpLeadId: Number(quoteDraftMeta.erpLeadId) || 0,
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

    const INV_PDF_DOC_NAME_PREF_KEY = 'creata_inv_pdf_doc_name_v1';
    const DEFAULT_PDF_DOC_PREFIX = 'CREATA-muebles-cotización';

    function readPdfDocNamePrefs() {
        const def = {
            prefix: DEFAULT_PDF_DOC_PREFIX,
            includeFolio: true,
            includeClient: true
        };
        try {
            const raw = localStorage.getItem(INV_PDF_DOC_NAME_PREF_KEY);
            if (!raw) return def;
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return def;
            const cleanPfx = sanitizePdfDocPrefix(parsed.prefix);
            return {
                prefix: cleanPfx || DEFAULT_PDF_DOC_PREFIX,
                includeFolio: parsed.includeFolio !== false,
                includeClient: parsed.includeClient !== false
            };
        } catch (e) {
            return def;
        }
    }

    function sanitizePdfDocPrefix(raw) {
        return String(raw || '')
            .replace(/[\\/:*?"<>|\r\n\t]+/g, ' ')
            .replace(/\s+/g, '-')
            .replace(/\.pdf$/i, '')
            .replace(/^-+|-+$/g, '')
            .slice(0, 60);
    }

    function buildFormalQuotePdfFileName(folio, clientName, overridePrefs) {
        const prefs = overridePrefs || readPdfDocNamePrefs();
        const basePrefix = sanitizePdfDocPrefix(prefs.prefix) || DEFAULT_PDF_DOC_PREFIX;
        const cleanFolio = cleanStr(folio).replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'CREATA';
        const cleanClient = cleanStr(clientName)
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
            .slice(0, 32);
        const parts = [basePrefix];
        if (prefs.includeFolio !== false && cleanFolio) parts.push(cleanFolio);
        if (prefs.includeClient !== false && cleanClient) parts.push(cleanClient);
        return parts.join('_') + '.pdf';
    }

    function buildFormattedQuoteText(payload) {
        const bd = payload.breakdown;
        const officialFolio = (lastSubmittedQuoteMeta && lastSubmittedQuoteMeta.folio) || payload.orderCode || '';
        const lines = [
            'CREATA-muebles-cotización',
            'Folio: ' + officialFolio,
            'Sucursal: ' + payload.erpStore,
            'Asesor: ' + (payload.erpAdvisorLabel || payload.advisorName || ''),
            'Cliente: ' + payload.clientName,
            payload.clientPhone ? ('Teléfono: ' + payload.clientPhone) : '',
            payload.clientEmail ? ('Correo: ' + payload.clientEmail) : '',
            'Entrega: ' + payload.deliveryDate,
            payload.notes ? ('Notas: ' + payload.notes) : '',
            '----------------------------------------',
            'PARTIDAS:'
        ].filter(Boolean);

        bd.lines.forEach((ln, i) => {
            const discTxt = ln.discountPct > 0 ? (' (-' + ln.discountPct + '%)') : '';
            lines.push(
                (i + 1) + '. ' + ln.name +
                ' | Cant: ' + ln.qty +
                ' | P. Lista: ' + (formatPrice(ln.unitList) || '$0.00') +
                discTxt +
                ' | Importe: ' + (formatPrice(ln.lineSubtotal) || '$0.00')
            );
        });

        lines.push('----------------------------------------');
        if (bd.extraDiscount > 0) {
            lines.push('Descuento: -' + formatPrice(bd.extraDiscount));
        }
        lines.push('Subtotal: ' + (formatPrice(bd.subtotalNoIva) || '$0.00'));
        lines.push('IVA (16%): ' + (formatPrice(bd.ivaAmount) || '$0.00'));
        lines.push('TOTAL: ' + (formatPrice(bd.totalWithIva) || '$0.00'));
        return lines.join('\n');
    }

    window.copyCartSummary = function () {
        const bd = computeQuoteBreakdown();
        if (!bd.lines.length) return;
        const payload = collectQuoteSubmissionPayload(false);
        const text = buildFormattedQuoteText(payload);
        if (navigator.clipboard && navigator.clipboard.writeText) {
            Promise.resolve(navigator.clipboard.writeText(text)).catch(() => {});
        }
        const btn = document.getElementById('copyCartBtn');
        if (btn) {
            const prev = btn.textContent;
            btn.textContent = '✓ Copiado';
            setTimeout(() => { btn.textContent = prev; }, 1100);
        }
    };

    let lastAcceptedQuoteSnapshot = null;

    function openPrintableQuoteWindow(payload, submittedMeta) {
        if (!payload || !payload.breakdown || !Array.isArray(payload.breakdown.lines) || !payload.breakdown.lines.length) return;
        const bd = payload.breakdown;
        const todayStr = formatDateDMY(new Date());
        const rawLogoSrc = String(window.CREATA_LOGO_B64 || '').trim();
        const safeLogoSrc = (rawLogoSrc &&
            !/[\u0000-\u001f\u007f"'<>\\]/.test(rawLogoSrc) &&
            (
                /^data:image\/(?:png|jpe?g|webp|gif|avif);base64,[a-z0-9+/=\s]+$/i.test(rawLogoSrc) ||
                (!/^\/\//.test(rawLogoSrc) && !/(?:^|\/)\.\.(?:\/|\?|$)/.test(rawLogoSrc) && /^[a-z0-9_./-]+\.(?:png|jpe?g|webp|gif|avif)$/i.test(rawLogoSrc))
            ))
            ? rawLogoSrc
            : '';
        const folioTxt = (submittedMeta && submittedMeta.folio) || payload.orderCode || '';
        const docHeading = 'CREATA-muebles-cotización';

        const rowsHtml = bd.lines.map((ln, idx) => {
            const rawQty = Number(ln && ln.qty);
            const safeQty = Number.isFinite(rawQty) ? Math.max(0, Math.round(rawQty)) : 0;
            const rawDisc = Number(ln && ln.discountPct);
            const safeDisc = Number.isFinite(rawDisc) ? Math.max(0, Math.min(100, rawDisc)) : 0;
            const safeDiscLabel = safeDisc > 0 ? (Number(safeDisc.toFixed(2)) + '%') : '0%';
            const rawPhotoUrl = String((ln && ln.photoUrl) || '').trim();
            const safePhotoUrl = (rawPhotoUrl &&
                !/[\u0000-\u001f\u007f"'<>\\]/.test(rawPhotoUrl) &&
                (
                    /^https?:\/\/\S+$/i.test(rawPhotoUrl) ||
                    /^data:image\/(?:png|jpe?g|webp|gif|avif);base64,[a-z0-9+/=\s]+$/i.test(rawPhotoUrl) ||
                    (!/^[a-z][a-z0-9+.-]*:/i.test(rawPhotoUrl) && !/^\/\//.test(rawPhotoUrl) && !/(?:^|\/)\.\.(?:\/|\?|$)/.test(rawPhotoUrl) && /^(?:\.?\/)?[^:?#]+(?:\?[^#]*)?$/.test(rawPhotoUrl))
                ))
                ? rawPhotoUrl
                : '';
            return '<tr>' +
                '<td style="padding:8px;border-bottom:1px solid #E6E1D8;text-align:center;">' + (idx + 1) + '</td>' +
                '<td style="padding:6px;border-bottom:1px solid #E6E1D8;text-align:center;">' +
                    (safePhotoUrl ? ('<img src="' + escapeHtml(safePhotoUrl) + '" width="64" height="64" loading="lazy" decoding="async" style="width:64px;height:64px;object-fit:contain;border:1px solid #E6E1D8;border-radius:6px;background:#FFF;">') : '') +
                '</td>' +
                '<td style="padding:8px;border-bottom:1px solid #E6E1D8;font-weight:600;">' + escapeHtml(ln.name) +
                    (ln.measures ? ('<div style="font-size:10px;color:#6F6860;margin-top:2px;font-weight:400;">Medidas: ' + escapeHtml(ln.measures) + '</div>') : '') +
                '</td>' +
                '<td style="padding:8px;border-bottom:1px solid #E6E1D8;text-align:center;font-weight:700;">' + safeQty + '</td>' +
                '<td style="padding:8px;border-bottom:1px solid #E6E1D8;text-align:right;">' + escapeHtml(formatPrice(ln.unitList) || '$0.00') + '</td>' +
                '<td style="padding:8px;border-bottom:1px solid #E6E1D8;text-align:center;">' + escapeHtml(safeDiscLabel) + '</td>' +
                '<td style="padding:8px;border-bottom:1px solid #E6E1D8;text-align:right;font-weight:700;">' + escapeHtml(formatPrice(ln.lineSubtotal) || '$0.00') + '</td>' +
            '</tr>';
        }).join('');

        const win = window.open('', '_blank');
        if (!win) return;
        win.document.write(
            '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>' + escapeHtml(docHeading) + (folioTxt ? (' — ' + escapeHtml(folioTxt)) : '') + ' — ' + escapeHtml(payload.clientName) + '</title>' +
            '<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap" rel="stylesheet">' +
            '<style>body{font-family:"Plus Jakarta Sans",sans-serif;color:#1A1816;margin:28px;font-size:12px;} ' +
            'table{width:100%;border-collapse:collapse;margin-top:16px;} th{background:#1A1816;color:#FFF;padding:9px 8px;text-transform:uppercase;font-size:11px;letter-spacing:0.04em;} ' +
            '.box{border:1px solid #E6E1D8;border-radius:10px;padding:12px 14px;margin-top:12px;background:#F8F6F2;} ' +
            '@media print{.no-print{display:none!important;}}</style></head><body>' +
            '<div style="display:flex;align-items:center;justify-content:space-between;background:#1A1816;color:#FFF;padding:16px 20px;border-radius:12px;">' +
                '<div>' + (safeLogoSrc ? ('<img src="' + escapeHtml(safeLogoSrc) + '" width="138" height="48" decoding="async" fetchpriority="high" style="height:48px;object-fit:contain;filter:brightness(0) invert(1);">') : '<strong>CREATA MUEBLES</strong>') + '</div>' +
                '<div style="text-align:right;">' +
                    '<div style="font-size:15px;font-weight:800;letter-spacing:0.04em;">' + escapeHtml(docHeading) + '</div>' +
                    '<div style="color:#DFCCB2;font-size:11px;margin-top:3px;">Folio: <strong>' + escapeHtml(folioTxt) + '</strong></div>' +
                    '<div style="color:#DFCCB2;font-size:11px;margin-top:2px;">Fecha: ' + escapeHtml(todayStr) + ' · ' + escapeHtml(payload.erpStore) + '</div>' +
                '</div>' +
            '</div>' +
            '<div class="box" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
                '<div><strong>Cliente:</strong> ' + escapeHtml(payload.clientName) + '</div>' +
                '<div><strong>Sucursal:</strong> ' + escapeHtml(payload.erpStore) + '</div>' +
                '<div><strong>Teléfono:</strong> ' + escapeHtml(payload.clientPhone || 'Por definir') + '</div>' +
                '<div><strong>Entrega:</strong> ' + escapeHtml(payload.deliveryDate) + '</div>' +
                (payload.clientEmail ? ('<div><strong>Correo:</strong> ' + escapeHtml(payload.clientEmail) + '</div>') : '') +
                '<div><strong>Asesor:</strong> ' + escapeHtml(payload.erpAdvisorLabel || payload.advisorName) + '</div>' +
                (payload.notes ? ('<div style="grid-column:span 2;"><strong>Notas:</strong> ' + escapeHtml(payload.notes) + '</div>') : '') +
            '</div>' +
            '<table><thead><tr><th>#</th><th>Imagen</th><th style="text-align:left;">Descripción</th><th>Cant.</th><th style="text-align:right;">Precio Lista</th><th>% Desc.</th><th style="text-align:right;">Importe</th></tr></thead>' +
            '<tbody>' + rowsHtml + '</tbody></table>' +
            '<div style="margin-left:auto;max-width:300px;margin-top:16px;border:1px solid #E6E1D8;border-radius:10px;padding:12px 14px;background:#F8F6F2;">' +
                (bd.extraDiscount > 0 ? ('<div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span>Descuento:</span><strong>-' + escapeHtml(formatPrice(bd.extraDiscount)) + '</strong></div>') : '') +
                '<div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span>Subtotal:</span><strong>' + escapeHtml(formatPrice(bd.subtotalNoIva) || '$0.00') + '</strong></div>' +
                '<div style="display:flex;justify-content:space-between;margin-bottom:8px;"><span>IVA (16%):</span><strong>' + escapeHtml(formatPrice(bd.ivaAmount) || '$0.00') + '</strong></div>' +
                '<div style="display:flex;justify-content:space-between;border-top:1px solid #E6E1D8;padding-top:8px;font-size:14px;font-weight:800;color:#9E7B4F;"><span>TOTAL:</span><span>' + escapeHtml(formatPrice(bd.totalWithIva) || '$0.00') + '</span></div>' +
            '</div>' +
            '<div class="no-print" style="margin-top:20px;text-align:right;">' +
                '<button onclick="window.print()" style="background:#9E7B4F;color:#FFF;border:none;padding:10px 20px;border-radius:999px;font-weight:800;cursor:pointer;text-transform:uppercase;">Imprimir / Guardar PDF</button>' +
            '</div>' +
            '</body></html>'
        );
        win.document.close();
    }

    window.printQuoteTemplate = function () {
        const bd = computeQuoteBreakdown();
        if (!bd.lines.length) return;
        const payload = collectQuoteSubmissionPayload(false);
        openPrintableQuoteWindow(payload, lastSubmittedQuoteMeta);
    };

    window.closeQuoteConfirmCreateModal = function () {};
    window.confirmCreateQuoteInErp = function () {
        window.submitQuoteToSystem(true, true);
    };

    function setAcceptedModalPdfStatus(tone, htmlText) {
        const stEl = document.getElementById('quoteAcceptedPdfStatus');
        if (!stEl) return;
        if (!htmlText) {
            stEl.innerHTML = '';
            stEl.classList.add('hidden');
            return;
        }
        if (tone === 'ok') {
            stEl.style.background = '#ECFDF5';
            stEl.style.borderColor = '#6EE7B7';
            stEl.style.color = '#065F46';
        } else if (tone === 'warn') {
            stEl.style.background = '#FFFBEB';
            stEl.style.borderColor = '#FDE68A';
            stEl.style.color = '#92400E';
        } else {
            stEl.style.background = '#FEF2F2';
            stEl.style.borderColor = '#FECACA';
            stEl.style.color = '#991B1B';
        }
        stEl.innerHTML = htmlText;
        stEl.classList.remove('hidden');
    }

    const ACCEPTED_QUOTE_MODAL_STORAGE_KEY = 'creata_inv_accepted_quote_modal_v1';
    let erpPdfDownloadPromise = null;
    let erpPdfDownloadKey = '';
    let erpPdfWantBrowserDownload = false;

    function base64ToPdfBlob(base64Str) {
        const cleanB64 = String(base64Str || '').replace(/\s+/g, '');
        const binaryStr = window.atob(cleanB64);
        const len = binaryStr.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryStr.charCodeAt(i);
        }
        return new Blob([bytes], { type: 'application/pdf' });
    }

    function triggerBase64PdfBrowserDownload(base64Str, fileName) {
        const blob = base64ToPdfBlob(base64Str);
        const safeName = cleanStr(fileName) || 'CREATA-muebles-cotización.pdf';
        const finalName = /\.pdf$/i.test(safeName) ? safeName : (safeName + '.pdf');

        // En iPhone instalado en Pantalla de Inicio (standalone), <a download> suele bloquearse:
        // usar Hoja de Compartir nativa de iOS o abrir vista previa PDF con botón Guardar/Compartir.
        const isIosStandalone = typeof navigator !== 'undefined' && navigator.standalone === true;
        if (isIosStandalone && typeof File === 'function' && typeof navigator.canShare === 'function' && typeof navigator.share === 'function') {
            try {
                const pdfFile = new File([blob], finalName, { type: 'application/pdf' });
                if (navigator.canShare({ files: [pdfFile] })) {
                    navigator.share({ files: [pdfFile], title: finalName }).catch(function () {});
                    return blob;
                }
            } catch (eIosShare) {}
        }

        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        if (isIosStandalone) {
            link.target = '_blank';
        } else {
            link.download = finalName;
        }
        link.rel = 'noopener';
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        setTimeout(() => {
            if (link.parentNode) link.parentNode.removeChild(link);
        }, 250);
        setTimeout(() => {
            try { URL.revokeObjectURL(blobUrl); } catch (e) {}
        }, 60000);
        return blob;
    }

    function persistAcceptedQuoteModalCheckpoint() {
        try {
            if (!lastAcceptedQuoteSnapshot || !lastAcceptedQuoteSnapshot.payload) {
                localStorage.removeItem(ACCEPTED_QUOTE_MODAL_STORAGE_KEY);
                return;
            }
            const copy = {
                ts: Date.now(),
                payload: lastAcceptedQuoteSnapshot.payload,
                submittedMeta: lastAcceptedQuoteSnapshot.submittedMeta || null,
                isQueued: !!lastAcceptedQuoteSnapshot.isQueued,
                pdfFileName: cleanStr(lastAcceptedQuoteSnapshot.pdfFileName),
                pdfDriveUrl: cleanStr(lastAcceptedQuoteSnapshot.pdfDriveUrl),
                pdfDownloadUrl: cleanStr(lastAcceptedQuoteSnapshot.pdfDownloadUrl)
            };
            localStorage.setItem(ACCEPTED_QUOTE_MODAL_STORAGE_KEY, JSON.stringify(copy));
        } catch (e) {}
    }

    function clearAcceptedQuoteModalCheckpoint() {
        try {
            localStorage.removeItem(ACCEPTED_QUOTE_MODAL_STORAGE_KEY);
        } catch (e) {}
    }

    window.downloadOriginalErpQuotePdf = async function (opts) {
        const o = opts || {};
        if (isGuestSession()) return false;
        if (!activeAdvisorSession || activeAdvisorSession.mustChangeKey) {
            if (!o.autoTriggered) openAuthModalForStartup();
            return false;
        }

        const qid = cleanStr(o.quoteId);
        const rawFolio = cleanStr(o.folio);
        const folio = (!/^(EN PROCESO|PENDIENTE)$/i.test(rawFolio) && !/^ID-\d+$/i.test(rawFolio)) ? rawFolio : '';
        const qidClean = qid || ((/^ID-(\d+)$/i.test(rawFolio)) ? rawFolio.replace(/^ID-/i, '') : '');
        const uid = cleanStr(o.erpUserId || activeAdvisorSession.erpAdvisorId);
        const cli = cleanStr(o.clientName);
        const store = cleanStr(o.erpStore || activeAdvisorSession.erpStore);
        const reqKey = (qidClean ? ('ID:' + qidClean) : '') || (folio ? ('F:' + folio.toUpperCase()) : '');

        if (!qidClean && !folio) {
            if (!o.autoTriggered) {
                setAcceptedModalPdfStatus('warn', '⏳ Cotización en proceso.');
            }
            return false;
        }

        if (erpPdfDownloadInFlight && erpPdfDownloadPromise) {
            if (reqKey && reqKey === erpPdfDownloadKey) {
                if (!o.skipBrowserDownload) {
                    erpPdfWantBrowserDownload = true;
                    const mEl = document.getElementById('quoteAcceptedModal');
                    if (mEl && mEl.classList.contains('open')) {
                        setAcceptedModalPdfStatus('warn', '⏳ Preparando descarga de PDF...');
                    }
                }
                return erpPdfDownloadPromise;
            }
            if (o.skipBrowserDownload) return false;
            try { await erpPdfDownloadPromise; } catch (ePrevPdf) {}
        }

        const modalEl = document.getElementById('quoteAcceptedModal');
        const modalOpen = !!(modalEl && modalEl.classList.contains('open'));
        const modalPdfBtn = document.getElementById('btnDownloadErpPdfModal');
        const activeBtn = o.triggerBtn || (modalOpen ? modalPdfBtn : null);
        const prevBtnHtml = activeBtn ? activeBtn.innerHTML : '';

        erpPdfDownloadInFlight = true;
        erpPdfDownloadKey = reqKey;
        erpPdfWantBrowserDownload = !o.skipBrowserDownload;
        if (activeBtn && !o.skipBrowserDownload) {
            activeBtn.disabled = true;
            activeBtn.innerHTML = '⏳ Descargando PDF...';
        }
        if (modalPdfBtn && modalPdfBtn !== activeBtn && !o.skipBrowserDownload) {
            modalPdfBtn.disabled = true;
        }
        if (modalOpen && !o.skipBrowserDownload) {
            setAcceptedModalPdfStatus('warn', '⏳ Preparando PDF...');
        }

        let downloadedOk = false;
        const runPromise = (async function () {
            try {
                const res = await callInvWebAppPost('inv_download_erp_quote_pdf', {
                    authToken: activeAdvisorSession.authToken || '',
                    sheetTab: activeAdvisorSession.sheetTab || '',
                    advisorEmail: activeAdvisorSession.correo || '',
                    quoteId: qidClean,
                    folio: folio,
                    erpUserId: uid,
                    clientName: cli,
                    erpStore: store,
                    createShareLink: !!o.createShareLink
                }, 45000);

                const shouldDownloadNow = !o.skipBrowserDownload || erpPdfWantBrowserDownload;

                if (res && res.authRequired) {
                    if (!o.autoTriggered || shouldDownloadNow) {
                        pendingPdfDownloadRetryOpts = {
                            quoteId: qidClean,
                            folio: folio,
                            erpUserId: uid,
                            clientName: cli,
                            erpStore: store,
                            autoTriggered: false,
                            triggerBtn: o.triggerBtn || null
                        };
                        promptSessionReauth(
                            res.error || 'Confirma tu contraseña para descargar el PDF.',
                            null
                        );
                    }
                    return false;
                }

                if (res && res.ok && res.pdfBase64) {
                    const finalFile = buildFormalQuotePdfFileName(folio || ('ID-' + qidClean), cli);
                    const pdfBlob = shouldDownloadNow
                        ? triggerBase64PdfBrowserDownload(res.pdfBase64, finalFile)
                        : base64ToPdfBlob(res.pdfBase64);
                    let pdfFileObj = null;
                    try {
                        if (typeof File === 'function') {
                            pdfFileObj = new File([pdfBlob], finalFile, { type: 'application/pdf' });
                        }
                    } catch (eFile) {}
                    if (lastAcceptedQuoteSnapshot) {
                        lastAcceptedQuoteSnapshot.pdfBase64 = res.pdfBase64;
                        lastAcceptedQuoteSnapshot.pdfFileName = finalFile;
                        lastAcceptedQuoteSnapshot.pdfBlob = pdfBlob;
                        lastAcceptedQuoteSnapshot.pdfFile = pdfFileObj;
                        if (cleanStr(res.pdfDriveUrl)) {
                            lastAcceptedQuoteSnapshot.pdfDriveUrl = cleanStr(res.pdfDriveUrl);
                        }
                        if (cleanStr(res.pdfDownloadUrl)) {
                            lastAcceptedQuoteSnapshot.pdfDownloadUrl = cleanStr(res.pdfDownloadUrl);
                        }
                        persistAcceptedQuoteModalCheckpoint();
                    }
                    downloadedOk = true;
                    if (shouldDownloadNow) {
                        if (modalOpen) {
                            setAcceptedModalPdfStatus('ok', '✓ PDF descargado: <strong>' + escapeHtml(finalFile) + '</strong>');
                        } else if (!o.triggerBtn) {
                            renderQuoteStatusBanner('ok', '<div>✓ PDF descargado: <strong>' + escapeHtml(finalFile) + '</strong></div>');
                        }
                        if (activeBtn) {
                            activeBtn.innerHTML = '✓ PDF descargado';
                            setTimeout(() => {
                                if (activeBtn) activeBtn.innerHTML = prevBtnHtml;
                            }, 2200);
                        }
                    } else if (modalOpen) {
                        setAcceptedModalPdfStatus('ok', '✓ PDF listo: <strong>' + escapeHtml(finalFile) + '</strong>');
                    }
                    return true;
                }

                if (res && (res.needsRedeploy || res.unavailable)) {
                    if (shouldDownloadNow) {
                        const msgHtml = '<div>PDF temporalmente no disponible.</div>';
                        if (modalOpen) setAcceptedModalPdfStatus('warn', msgHtml);
                        else renderQuoteStatusBanner('warn', msgHtml);
                    }
                    return false;
                }

                if (shouldDownloadNow) {
                    const errMsg = cleanStr((res && res.error) || 'No se pudo obtener el PDF.');
                    if (modalOpen) setAcceptedModalPdfStatus('err', '⚠️ ' + escapeHtml(errMsg));
                    else renderQuoteStatusBanner('err', '<div>⚠️ ' + escapeHtml(errMsg) + '</div>');
                }
                return false;
            } catch (dlErr) {
                if (!o.skipBrowserDownload || erpPdfWantBrowserDownload) {
                    const msg = cleanStr((dlErr && dlErr.message) || dlErr || 'Error de conexión al descargar el PDF.');
                    if (modalOpen) setAcceptedModalPdfStatus('err', '⚠️ ' + escapeHtml(msg));
                    else renderQuoteStatusBanner('err', '<div>⚠️ ' + escapeHtml(msg) + '</div>');
                }
                return false;
            } finally {
                erpPdfDownloadInFlight = false;
                erpPdfDownloadPromise = null;
                erpPdfDownloadKey = '';
                erpPdfWantBrowserDownload = false;
                if (activeBtn && !o.skipBrowserDownload) {
                    activeBtn.disabled = false;
                    if (!downloadedOk) activeBtn.innerHTML = prevBtnHtml;
                }
                if (modalPdfBtn && modalPdfBtn !== activeBtn && !o.skipBrowserDownload) {
                    modalPdfBtn.disabled = false;
                }
            }
        })();
        erpPdfDownloadPromise = runPromise;
        return runPromise;
    };

    window.downloadAcceptedQuoteOriginalPdf = function (btnEl) {
        const snap = lastAcceptedQuoteSnapshot;
        const meta = (snap && snap.submittedMeta) || lastSubmittedQuoteMeta || {};
        const pay = (snap && snap.payload) || {};
        if (snap && snap.pdfBase64) {
            const formalName = buildFormalQuotePdfFileName(meta.folio || meta.orderCode || pay.orderCode || '', pay.clientName || '');
            snap.pdfFileName = formalName;
            triggerBase64PdfBrowserDownload(snap.pdfBase64, formalName);
            setAcceptedModalPdfStatus('ok', '✓ PDF descargado: <strong>' + escapeHtml(formalName) + '</strong>');
            return Promise.resolve(true);
        }
        return window.downloadOriginalErpQuotePdf({
            quoteId: meta.quoteId || '',
            folio: meta.folio || meta.orderCode || '',
            erpUserId: meta.erpUserId || pay.erpAdvisorId || '',
            clientName: pay.clientName || '',
            erpStore: pay.erpStore || '',
            autoTriggered: false,
            skipBrowserDownload: false,
            triggerBtn: btnEl || document.getElementById('btnDownloadErpPdfModal')
        });
    };

    function encodeQuoteDocToken(obj) {
        try {
            const jsonStr = JSON.stringify(obj);
            const utf8Bytes = encodeURIComponent(jsonStr).replace(/%([0-9A-F]{2})/g, function (_, p1) {
                return String.fromCharCode(parseInt(p1, 16));
            });
            return window.btoa(utf8Bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        } catch (e) {
            return '';
        }
    }

    function decodeQuoteDocToken(token) {
        try {
            const clean = String(token || '').trim().replace(/-/g, '+').replace(/_/g, '/');
            if (!clean) return null;
            const pad = clean.length % 4;
            const padded = pad ? (clean + '===='.slice(pad)) : clean;
            const bin = window.atob(padded);
            const pctStr = Array.prototype.map.call(bin, function (ch) {
                return '%' + ('00' + ch.charCodeAt(0).toString(16)).slice(-2);
            }).join('');
            return JSON.parse(decodeURIComponent(pctStr));
        } catch (e) {
            return null;
        }
    }

    function buildShareableQuoteDocumentUrl(payload, submittedMeta, pdfDriveUrl) {
        const bd = (payload && payload.breakdown) || computeQuoteBreakdown();
        const folioTxt = cleanStr((submittedMeta && (submittedMeta.folio || submittedMeta.orderCode)) || (payload && payload.orderCode));
        const qidTxt = cleanStr(submittedMeta && submittedMeta.quoteId);
        const lines = Array.isArray(bd && bd.lines) ? bd.lines : [];
        const docObj = {
            v: 1,
            f: folioTxt,
            q: qidTxt,
            d: formatDateDMY(new Date()),
            p: !!(payload && payload.isProyecto),
            s: cleanStr(payload && payload.erpStore),
            a: cleanStr(payload && (payload.erpAdvisorLabel || payload.advisorName)),
            ae: cleanStr(payload && payload.advisorEmail),
            c: cleanStr(payload && payload.clientName),
            ph: cleanStr(payload && payload.clientPhone),
            em: cleanStr(payload && payload.clientEmail),
            dl: cleanStr(payload && payload.deliveryDate),
            nt: cleanStr(payload && payload.notes),
            ex: Math.round((Number(bd && bd.extraDiscount) || 0) * 100) / 100,
            sub: Math.round((Number(bd && bd.subtotalNoIva) || 0) * 100) / 100,
            iva: Math.round((Number(bd && bd.ivaAmount) || 0) * 100) / 100,
            tot: Math.round((Number(bd && bd.totalWithIva) || 0) * 100) / 100,
            u: cleanStr(pdfDriveUrl),
            i: lines.map(ln => [
                cleanStr(ln.sku),
                cleanStr(ln.name),
                Math.max(1, Number(ln.qty) || 1),
                Math.round((Number(ln.unitList) || 0) * 100) / 100,
                Number(ln.discountPct) || 0,
                Math.round((Number(ln.lineSubtotal) || 0) * 100) / 100,
                cleanStr(ln.measures)
            ])
        };
        const token = encodeQuoteDocToken(docObj);
        let baseUrl = 'https://ikerreyna3942-debug.github.io/MCP-REPOCITORIO/inventario.html';
        try {
            if (window.location && /^https?:$/i.test(window.location.protocol)) {
                baseUrl = window.location.origin + window.location.pathname;
            }
        } catch (e) {}
        return token ? (baseUrl + '?cotizacion=' + token) : baseUrl;
    }

    function checkAndRenderSharedQuoteDocumentMode() {
        try {
            if (typeof URLSearchParams === 'undefined' || !window.location) return false;
            const params = new URLSearchParams(window.location.search || '');
            const token = params.get('cotizacion');
            if (!token) return false;
            const doc = decodeQuoteDocToken(token);
            if (!doc || typeof doc !== 'object') return false;

            const docHeading = 'CREATA-muebles-cotización';
            const folioTxt = cleanStr(doc.f) || 'En proceso';
            const logoSrc = window.CREATA_LOGO_B64 || '';
            const items = Array.isArray(doc.i) ? doc.i : [];

            const rowsHtml = items.map((arr, idx) => {
                const sku = cleanStr(arr && arr[0]);
                const name = cleanStr(arr && arr[1]) || sku || 'PRODUCTO COTIZADO';
                const qty = Math.max(1, Number(arr && arr[2]) || 1);
                const unitList = Number(arr && arr[3]) || 0;
                const discPct = Number(arr && arr[4]) || 0;
                const lineSubtotal = Number(arr && arr[5]) || 0;
                const measures = cleanStr(arr && arr[6]);
                const liveIt = sku ? bySkuMap.get(sku.toUpperCase()) : null;
                const photoUrl = liveIt ? photoUrlForItem(liveIt) : '';
                return '<tr>' +
                    '<td style="padding:10px 8px;border-bottom:1px solid #E6E1D8;text-align:center;">' + (idx + 1) + '</td>' +
                    '<td style="padding:8px;border-bottom:1px solid #E6E1D8;text-align:center;">' +
                        (photoUrl ? ('<img src="' + escapeHtml(photoUrl) + '" width="60" height="60" loading="lazy" decoding="async" style="width:60px;height:60px;object-fit:contain;border:1px solid #E6E1D8;border-radius:8px;background:#FFF;">') : '<span style="font-size:10px;color:#6F6860;">' + escapeHtml(sku) + '</span>') +
                    '</td>' +
                    '<td style="padding:10px 8px;border-bottom:1px solid #E6E1D8;font-weight:700;">' +
                        escapeHtml(name) +
                        (sku ? ('<div style="font-size:10px;color:#9E7B4F;margin-top:2px;">SKU: ' + escapeHtml(sku) + '</div>') : '') +
                        (measures ? ('<div style="font-size:10px;color:#6F6860;margin-top:2px;font-weight:500;">Medidas: ' + escapeHtml(measures) + '</div>') : '') +
                    '</td>' +
                    '<td style="padding:10px 8px;border-bottom:1px solid #E6E1D8;text-align:center;font-weight:800;">' + qty + '</td>' +
                    '<td style="padding:10px 8px;border-bottom:1px solid #E6E1D8;text-align:right;">' + escapeHtml(formatPrice(unitList) || '$0.00') + '</td>' +
                    '<td style="padding:10px 8px;border-bottom:1px solid #E6E1D8;text-align:center;">' + (discPct > 0 ? (discPct + '%') : '0%') + '</td>' +
                    '<td style="padding:10px 8px;border-bottom:1px solid #E6E1D8;text-align:right;font-weight:800;">' + escapeHtml(formatPrice(lineSubtotal) || '$0.00') + '</td>' +
                '</tr>';
            }).join('');

            const safeDocPdfUrl = sanitizeVisualOverrideUrl(cleanStr(doc.u));
            document.title = docHeading + ' — ' + folioTxt + ' — ' + cleanStr(doc.c || 'CREATA Muebles');
            document.body.innerHTML =
                '<div style="max-width:920px;margin:24px auto;padding:0 16px;font-family:\'Plus Jakarta Sans\',sans-serif;color:#1A1816;font-size:12px;">' +
                    '<div class="no-print" style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;margin-bottom:16px;background:#FFFFFF;border:1px solid #E6E1D8;padding:12px 16px;border-radius:14px;">' +
                        '<div style="font-weight:800;font-size:13px;color:#1A1816;">' + escapeHtml(docHeading) + '</div>' +
                        '<div style="display:flex;flex-wrap:wrap;gap:8px;">' +
                            (safeDocPdfUrl ? ('<a href="' + escapeHtml(safeDocPdfUrl) + '" target="_blank" rel="noopener noreferrer" style="background:#1A1816;color:#FFF;text-decoration:none;padding:9px 16px;border-radius:999px;font-weight:800;font-size:11px;text-transform:uppercase;letter-spacing:0.04em;">⬇ Descargar PDF</a>') : '') +
                            '<button type="button" onclick="window.print()" style="background:#9E7B4F;color:#FFF;border:none;padding:9px 18px;border-radius:999px;font-weight:800;font-size:11px;cursor:pointer;text-transform:uppercase;letter-spacing:0.04em;">Imprimir / PDF</button>' +
                        '</div>' +
                    '</div>' +
                    '<div style="background:#FFFFFF;border:1px solid #E6E1D8;border-radius:16px;padding:22px;">' +
                        '<div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;background:#1A1816;color:#FFF;padding:16px 20px;border-radius:12px;">' +
                            '<div>' + (logoSrc ? ('<img src="' + logoSrc + '" width="133" height="46" decoding="async" fetchpriority="high" style="height:46px;object-fit:contain;filter:brightness(0) invert(1);">') : '<strong>CREATA MUEBLES</strong>') + '</div>' +
                            '<div style="text-align:right;">' +
                                '<div style="font-size:15px;font-weight:800;letter-spacing:0.04em;">' + escapeHtml(docHeading) + '</div>' +
                                '<div style="color:#DFCCB2;font-size:12px;margin-top:3px;">Folio: <strong>' + escapeHtml(folioTxt) + '</strong></div>' +
                                '<div style="color:#DFCCB2;font-size:11px;margin-top:2px;">Fecha: ' + escapeHtml(cleanStr(doc.d)) + (doc.s ? (' · ' + escapeHtml(doc.s)) : '') + '</div>' +
                            '</div>' +
                        '</div>' +
                        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px;border:1px solid #E1DBC5;border-radius:12px;padding:14px 16px;margin-top:14px;background:#FAF9F6;">' +
                            '<div><strong>' + (doc.p ? 'Proyecto / Cliente:' : 'Cliente:') + '</strong> ' + escapeHtml(cleanStr(doc.c) || 'Por definir') + '</div>' +
                            '<div><strong>Sucursal:</strong> ' + escapeHtml(cleanStr(doc.s) || 'CREATA Muebles') + '</div>' +
                            (doc.ph ? ('<div><strong>Teléfono:</strong> ' + escapeHtml(doc.ph) + '</div>') : '') +
                            (doc.dl ? ('<div><strong>Entrega Tentativa:</strong> ' + escapeHtml(doc.dl) + '</div>') : '') +
                            (doc.em ? ('<div><strong>Correo Cliente:</strong> ' + escapeHtml(doc.em) + '</div>') : '') +
                            (doc.a ? ('<div><strong>Asesor:</strong> ' + escapeHtml(doc.a) + '</div>') : '') +
                            (doc.nt ? ('<div style="grid-column:1 / -1;"><strong>Notas:</strong> ' + escapeHtml(doc.nt) + '</div>') : '') +
                        '</div>' +
                        '<div style="overflow-x:auto;margin-top:16px;">' +
                            '<table style="width:100%;border-collapse:collapse;">' +
                                '<thead><tr style="background:#252C32;color:#FFF;text-transform:uppercase;font-size:11px;letter-spacing:0.04em;">' +
                                    '<th style="padding:10px 8px;">#</th>' +
                                    '<th style="padding:10px 8px;">Imagen</th>' +
                                    '<th style="padding:10px 8px;text-align:left;">Descripción</th>' +
                                    '<th style="padding:10px 8px;">Cant.</th>' +
                                    '<th style="padding:10px 8px;text-align:right;">Precio Lista</th>' +
                                    '<th style="padding:10px 8px;">% Desc.</th>' +
                                    '<th style="padding:10px 8px;text-align:right;">Importe</th>' +
                                '</tr></thead>' +
                                '<tbody>' + rowsHtml + '</tbody>' +
                            '</table>' +
                        '</div>' +
                        '<div style="margin-left:auto;max-width:320px;margin-top:18px;border:1px solid #E1DBC5;border-radius:12px;padding:14px 16px;background:#FAF9F6;">' +
                            (Number(doc.ex) > 0 ? ('<div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span>Descuento Extra:</span><strong style="color:#065F46;">-' + escapeHtml(formatPrice(doc.ex)) + '</strong></div>') : '') +
                            '<div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span>Subtotal (sin IVA):</span><strong>' + escapeHtml(formatPrice(doc.sub) || '$0.00') + '</strong></div>' +
                            '<div style="display:flex;justify-content:space-between;margin-bottom:8px;"><span>IVA (16%):</span><strong>' + escapeHtml(formatPrice(doc.iva) || '$0.00') + '</strong></div>' +
                            '<div style="display:flex;justify-content:space-between;border-top:1px solid #E1DBC5;padding-top:8px;font-size:15px;font-weight:800;color:#A38251;"><span>TOTAL COTIZACIÓN:</span><span>' + escapeHtml(formatPrice(doc.tot) || '$0.00') + '</span></div>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
                '<style>@media print{.no-print{display:none!important;} body{background:#FFF!important;}}</style>';
            return true;
        } catch (e) {
            return false;
        }
    }

    function extractClientPhone10Digits(rawPhone) {
        const digits = String(rawPhone || '').replace(/\D+/g, '');
        if (!digits) return '';
        if (digits.length === 10) return digits;
        if (digits.length === 12 && digits.startsWith('52')) return digits.slice(2);
        if (digits.length === 13 && digits.startsWith('521')) return digits.slice(3);
        if (digits.length > 10) return digits.slice(-10);
        return '';
    }

    window.sendAcceptedQuoteToClientWhatsApp = function () {
        let snap = lastAcceptedQuoteSnapshot;
        if (!snap || !snap.payload) {
            const fallbackPayload = collectQuoteSubmissionPayload(false);
            snap = {
                payload: fallbackPayload,
                submittedMeta: lastSubmittedQuoteMeta ? Object.assign({}, lastSubmittedQuoteMeta) : null,
                isQueued: false
            };
            lastAcceptedQuoteSnapshot = snap;
        }

        const payload = snap.payload || collectQuoteSubmissionPayload(false);
        const metaObj = snap.submittedMeta || lastSubmittedQuoteMeta || {};
        const folioTxt = cleanStr((metaObj && (metaObj.folio || metaObj.orderCode)) || (payload && payload.orderCode)) || 'En proceso';
        const cliName = cleanStr(payload.clientName) || 'Cliente';
        const advName = cleanStr((payload.erpAdvisorLabel || payload.advisorName || '')).split('|')[0].trim() || 'Asesor CREATA';
        const storeName = cleanStr(payload.erpStore) || 'CREATA Muebles';

        let phone10 = extractClientPhone10Digits(payload.clientPhone || quoteDraftMeta.clientPhone);
        if (!phone10) {
            const prompted = window.prompt(
                'WhatsApp del cliente (10 dígitos):',
                cleanStr(payload.clientPhone || quoteDraftMeta.clientPhone)
            );
            if (prompted === null) return;
            phone10 = extractClientPhone10Digits(prompted);
            if (!phone10) {
                setAcceptedModalPdfStatus('warn', '⚠️ Ingresa 10 dígitos válidos.');
                return;
            }
            payload.clientPhone = phone10;
            quoteDraftMeta.clientPhone = phone10;
            const phoneInp = document.getElementById('quoteClientPhoneInput');
            if (phoneInp) phoneInp.value = phone10;
            try {
                const jsonMeta = JSON.stringify(quoteDraftMeta);
                localStorage.setItem(QUOTE_META_STORAGE, jsonMeta);
                localStorage.setItem(QUOTE_META_STORAGE_ALT, jsonMeta);
            } catch (e) {}
            if (typeof syncActiveQuoteDraftStorage === 'function') syncActiveQuoteDraftStorage();
            try {
                const segPhones = JSON.parse(localStorage.getItem('creata_seg_phones_v1') || '{}');
                if (folioTxt) segPhones[folioTxt] = phone10;
                localStorage.setItem('creata_seg_phones_v1', JSON.stringify(segPhones));
            } catch (ePh) {}
            try {
                const bridgeKey = 'creata_live_app_quotes_bridge_v1';
                const prevList = JSON.parse(localStorage.getItem(bridgeKey) || '[]');
                if (Array.isArray(prevList)) {
                    prevList.forEach(item => {
                        if (item && cleanStr(item.folio).toUpperCase() === folioTxt.toUpperCase()) {
                            item.clientPhone = phone10;
                        }
                    });
                    localStorage.setItem(bridgeKey, JSON.stringify(prevList));
                }
            } catch (eBr) {}
            persistAcceptedQuoteModalCheckpoint();
        }

        // Handoff inmediato SIN texto predefinido, SIN ?text=, SIN enlaces
        const isTouchMobile = (typeof window !== 'undefined') && (window.innerWidth < 1024) && ('ontouchstart' in window || (navigator && navigator.maxTouchPoints > 0));
        let pdfFileObj = snap.pdfFile || null;
        if (!pdfFileObj && snap.pdfBlob && typeof File === 'function') {
            try {
                const formalName = snap.pdfFileName || buildFormalQuotePdfFileName(folioTxt, cliName);
                pdfFileObj = new File([snap.pdfBlob], formalName, { type: 'application/pdf' });
                snap.pdfFile = pdfFileObj;
            } catch (eFile) {}
        }

        let sharedViaNative = false;
        if (isTouchMobile && pdfFileObj && typeof navigator !== 'undefined' && typeof navigator.canShare === 'function' && typeof navigator.share === 'function') {
            try {
                if (navigator.canShare({ files: [pdfFileObj] })) {
                    sharedViaNative = true;
                    navigator.share({ files: [pdfFileObj] }).catch(function () {});
                }
            } catch (eShare) {
                sharedViaNative = false;
            }
        }

        if (!sharedViaNative) {
            const waUrl = 'https://wa.me/52' + phone10;
            const isIosNav = isIosMobileDevice();
            const openedWa = isIosNav ? null : window.open(waUrl, '_blank', 'noopener');
            if (!openedWa) {
                window.location.href = waUrl;
            }
        }

        setAcceptedModalPdfStatus(
            'ok',
            sharedViaNative
                ? '✓ Compartiendo PDF con <strong>' + escapeHtml(cliName) + '</strong>.'
                : '✓ Chat abierto con <strong>' + escapeHtml(cliName) + '</strong> (' + escapeHtml(phone10) + ').'
        );

        const nowD = new Date();
        const pad2 = (n) => String(n).padStart(2, '0');
        const avisoStamp = nowD.getFullYear() + '-' + pad2(nowD.getMonth() + 1) + '-' + pad2(nowD.getDate()) + ' ' + pad2(nowD.getHours()) + ':' + pad2(nowD.getMinutes());
        try {
            const contactedMap = JSON.parse(localStorage.getItem('creata_seg_contacted_v1') || '{}');
            if (folioTxt) contactedMap[folioTxt] = avisoStamp;
            localStorage.setItem('creata_seg_contacted_v1', JSON.stringify(contactedMap));
        } catch (eContact) {}

        callInvWebAppPost('seg_action', {
            authToken: (activeAdvisorSession && activeAdvisorSession.authToken) || '',
            subAction: 'SEG_WHATSAPP',
            folio: folioTxt,
            usuario: advName,
            sucursal: storeName,
            payload: {
                folio: folioTxt,
                cliente: cliName,
                telefono: phone10,
                asesor: advName,
                sucursal: storeName,
                fecha_aviso: avisoStamp,
                origen: 'COTIZADOR_MODAL_ENVIAR'
            }
        }, 10000).catch(() => {});
    };

    function openQuoteAcceptedModal(payload, metaObj, opts) {
        const o = opts || {};
        const folioTxt = cleanStr((metaObj && (metaObj.folio || metaObj.orderCode)) || (payload && payload.orderCode));
        const qidTxt = cleanStr(metaObj && metaObj.quoteId);
        const bd = (payload && payload.breakdown) || computeQuoteBreakdown();
        const totalQty = (bd && Array.isArray(bd.lines))
            ? bd.lines.reduce((s, ln) => s + (Number(ln && ln.qty) || 0), 0)
            : 0;
        const formalFileName = buildFormalQuotePdfFileName(folioTxt || ('ID-' + qidTxt), payload && payload.clientName);
        const prevSnap = lastAcceptedQuoteSnapshot;
        const prevFolio = prevSnap ? cleanStr((prevSnap.submittedMeta && (prevSnap.submittedMeta.folio || prevSnap.submittedMeta.orderCode)) || (prevSnap.payload && prevSnap.payload.orderCode)) : '';
        const samePrevQuote = !!(prevSnap && folioTxt && prevFolio && prevFolio === folioTxt);
        lastAcceptedQuoteSnapshot = {
            payload: payload,
            submittedMeta: metaObj ? Object.assign({}, metaObj) : null,
            isQueued: !!o.isQueued,
            pdfBase64: (o.pdfBase64 || (samePrevQuote && prevSnap.pdfBase64)) || '',
            pdfFileName: formalFileName,
            pdfBlob: samePrevQuote ? (prevSnap.pdfBlob || null) : null,
            pdfFile: samePrevQuote ? (prevSnap.pdfFile || null) : null,
            pdfDriveUrl: (o.pdfDriveUrl || (samePrevQuote && prevSnap.pdfDriveUrl)) || '',
            pdfDownloadUrl: (o.pdfDownloadUrl || (samePrevQuote && prevSnap.pdfDownloadUrl)) || ''
        };
        persistAcceptedQuoteModalCheckpoint();

        const modalEl = document.getElementById('quoteAcceptedModal');
        const titleEl = document.getElementById('quoteAcceptedTitle');
        const sumEl = document.getElementById('quoteAcceptedSummary');
        const pdfBtn = document.getElementById('btnDownloadErpPdfModal');
        if (!modalEl || !sumEl) return;

        setAcceptedModalPdfStatus('', '');
        if (pdfBtn) {
            const hasErpRef = !o.isQueued && !!(qidTxt || folioTxt);
            pdfBtn.classList.toggle('hidden', !hasErpRef);
            pdfBtn.disabled = false;
            pdfBtn.innerHTML = '⬇ Descargar PDF';
        }

        if (titleEl) {
            titleEl.textContent = o.isQueued ? 'CREATA-muebles-cotización · En cola' : 'CREATA-muebles-cotización';
        }
        sumEl.style.background = o.isQueued ? '#FEF7EA' : '#EDF8F2';
        sumEl.style.borderColor = o.isQueued ? '#F5D59B' : '#B5E4CC';
        sumEl.style.color = o.isQueued ? '#8E5409' : '#146342';

        sumEl.innerHTML =
            '<div class="font-extrabold uppercase">' +
                (o.isQueued ? '⏳ Cotización en cola' : '✓ Cotización creada') +
            '</div>' +
            (folioTxt ? ('<div>Folio: <strong class="text-[11px] font-extrabold">' + escapeHtml(folioTxt) + '</strong></div>') : '') +
            '<div>Cliente: <strong>' + escapeHtml((payload && payload.clientName) || 'Por definir') + '</strong>' +
                (payload && payload.clientPhone ? (' · Tel: <strong>' + escapeHtml(payload.clientPhone) + '</strong>') : '') +
            '</div>' +
            '<div>Asesor: <strong>' + escapeHtml((payload && (payload.erpAdvisorLabel || payload.advisorName)) || '') + '</strong></div>' +
            '<div>Sucursal: <strong>' + escapeHtml((payload && payload.erpStore) || '') + '</strong> · Piezas: <strong>' + totalQty + '</strong> · Total: <strong>' + escapeHtml(formatPrice(bd && bd.totalWithIva) || '$0.00') + '</strong></div>';

        modalEl.classList.add('open');
        if (!invWorkspaceRestoring) {
            notifyInvBackStatePush('quote_accepted_modal');
        }
        if (!invWorkspaceRestoring && window.CreataLiveAlerts && typeof window.CreataLiveAlerts.notifyQuoteCreated === 'function') {
            const alertPayload = {
                folio: folioTxt || ('ID-' + qidTxt),
                clientName: (payload && payload.clientName) || 'Cliente',
                erpStore: (payload && payload.erpStore) || '',
                advisorName: (payload && (payload.erpAdvisorLabel || payload.advisorName)) || '',
                total: formatPrice(bd && bd.totalWithIva) || '$0.00',
                isQueued: !!o.isQueued
            };
            setTimeout(function () {
                if (window.CreataLiveAlerts && typeof window.CreataLiveAlerts.notifyQuoteCreated === 'function') {
                    window.CreataLiveAlerts.notifyQuoteCreated(alertPayload);
                }
            }, 450);
        }
    }

    window.acceptGeneratedQuoteAndReset = function () {
        const modalEl = document.getElementById('quoteAcceptedModal');
        if (modalEl) modalEl.classList.remove('open');
        clearAcceptedQuoteModalCheckpoint();
        purgeCompletedAndActivateBlankDraft();
        const cartScroll = document.querySelector('#cartModal .overflow-y-auto');
        if (cartScroll) cartScroll.scrollTop = 0;
        window.closeCartModal();
        scheduleSaveInvWorkspaceCheckpoint();
    };

    window.printAcceptedQuoteSnapshot = function () {
        if (lastAcceptedQuoteSnapshot && lastAcceptedQuoteSnapshot.payload) {
            openPrintableQuoteWindow(lastAcceptedQuoteSnapshot.payload, lastAcceptedQuoteSnapshot.submittedMeta);
        } else {
            window.printQuoteTemplate();
        }
    };

    function renderQuoteStatusBanner(tone, htmlContent) {
        const box = document.getElementById('quoteSystemStatusBox');
        if (!box) return;
        if (!htmlContent) {
            box.innerHTML = '';
            box.classList.add('hidden');
            return;
        }
        box.className = 'rounded-xl border p-3.5 text-[11px] space-y-1.5 ' +
            (tone === 'ok' ? 'sem-green' : (tone === 'warn' ? 'sem-yellow' : 'sem-red'));
        box.innerHTML = htmlContent;
        box.classList.remove('hidden');
        if (box.scrollIntoView) {
            setTimeout(() => box.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 40);
        }
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

    window.submitQuoteToSystem = async function (sendToErp, confirmed) {
        if (isGuestSession() || quoteSubmitInFlight) return;
        if (!activeAdvisorSession || activeAdvisorSession.mustChangeKey) {
            openAuthModalForStartup();
            return;
        }
        if (isActiveQuoteCompleted()) {
            renderQuoteStatusBanner(
                'warn',
                '<div>Esta cotización ya fue terminada y cerrada. Presiona <strong>+ Agregar nueva cotización</strong> o cierra esta ventana para capturar una nueva.</div>'
            );
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

        const payload = collectQuoteSubmissionPayload(sendToErp);
        const nameInp = document.getElementById('quoteClientNameInput');
        if (nameInp && !cleanStr(nameInp.value)) {
            nameInp.focus();
            renderQuoteStatusBanner(
                'warn',
                '<div>Ingresa el <strong>' +
                    (payload.isProyecto ? 'Nombre del Proyecto / Cliente' : 'Nombre del Cliente / Prospecto') +
                '</strong> para registrar la cotización.</div>'
            );
            return;
        }

        // Creación directa en 1 paso sin modal intermedio de confirmación
        const btnRev = document.getElementById('btnLoadPlantillaReview');
        const btnSend = document.getElementById('btnSendQuoteErp');
        quoteSubmitInFlight = true;
        if (btnRev) btnRev.disabled = true;
        if (btnSend) {
            btnSend.disabled = true;
            btnSend.textContent = 'Creando...';
        }

        renderQuoteStatusBanner(
            'warn',
            '<div class="font-extrabold uppercase">' +
                (sendToErp ? 'Creando cotización...' : 'Guardando revisión...') +
            '</div>' +
            '<div>Sucursal: <strong>' + escapeHtml(payload.erpStore) + '</strong> · Folio: <strong>' + escapeHtml(payload.orderCode) + '</strong></div>'
        );

        try {
            const res = await callInvWebAppPost('inv_submit_quote', payload, 65000);

            if (res && res.authRequired) {
                renderQuoteStatusBanner(
                    'warn',
                    '<div class="font-extrabold uppercase">Verificación requerida</div>' +
                    '<div>' + escapeHtml(res.error || 'Confirma tu contraseña para continuar.') + '</div>'
                );
                promptSessionReauth(
                    res.error || 'Confirma tu contraseña para emitir tu cotización.',
                    !!sendToErp
                );
                return;
            }

            if (res && res.ok) {
                if (res.nextFolioByStore) {
                    applyServerFolioMap(res.nextFolioByStore);
                }
                const folioFromRes = cleanStr(res.folio);
                if (folioFromRes) {
                    registerObservedFolio(folioFromRes, payload.erpStore);
                }
                const assignedFolio = folioFromRes ||
                    ((res.orderCode && !/^[A-Z]+-\d+$/i.test(String(res.orderCode))) ? cleanStr(res.orderCode) : '') ||
                    payload.orderCode;

                if (res.nextOrderCode && !/^[A-Z]+-\d+$/i.test(String(res.nextOrderCode))) {
                    currentNextOrderCode = cleanStr(res.nextOrderCode);
                    liveNextFolioByStore[String(payload.erpStore).toUpperCase()] = currentNextOrderCode;
                } else {
                    currentNextOrderCode = getEstimatedStoreFolio(payload.erpStore, payload.orderPrefix);
                }
                if (Array.isArray(res.recentQuotes)) {
                    myRecentQuotesList = res.recentQuotes;
                    renderMyRecentQuotes(myRecentQuotesList);
                }
                populateQuoteAdvisorControls();

                if (!sendToErp) {
                    lastSubmittedQuoteMeta = {
                        orderCode: assignedFolio,
                        folio: '',
                        quoteId: '',
                        createdAt: cleanStr(res.lastSync),
                        quoteType: res.quoteType || payload.quoteType
                    };
                    syncActiveQuoteDraftStorage();
                    renderQuoteStatusBanner(
                        'ok',
                        '<div class="font-extrabold uppercase">✓ Revisión guardada</div>' +
                        '<div>Sucursal: <strong>' + escapeHtml(res.erpStore || payload.erpStore) + '</strong></div>'
                    );
                    return;
                }

                const prependNewlyGeneratedQuotePdfToView = function (metaObj) {
                    if (!metaObj) return;
                    const qidClean = cleanStr(metaObj.quoteId);
                    const folClean = cleanStr(metaObj.folio || metaObj.orderCode);
                    if (!qidClean && (!folClean || /^[A-Z]+-\d+$/i.test(folClean))) return;
                    newlyGeneratedQuoteHighlightKey = (qidClean ? ('ID:' + qidClean) : '') || (folClean ? ('F:' + folClean) : '');
                    const alreadyPresent = Array.isArray(myRecentQuotesList) && myRecentQuotesList.some(existing => {
                        if (!existing) return false;
                        if (qidClean && cleanStr(existing.quoteId) === qidClean) return true;
                        if (folClean && (cleanStr(existing.folio) === folClean || cleanStr(existing.orderCode) === folClean)) return true;
                        return false;
                    });
                    if (!alreadyPresent) {
                        const skusTxt = Array.isArray(bd.lines)
                            ? bd.lines.map(ln => cleanStr(ln.sku) + ' x' + (Number(ln.qty) || 1)).join(', ')
                            : '';
                        const newEntry = {
                            orderCode: folClean || qidClean,
                            folio: folClean,
                            quoteId: qidClean,
                            createdAt: cleanStr(metaObj.createdAt) || new Date().toLocaleString('es-MX'),
                            quoteType: cleanStr(metaObj.quoteType || payload.quoteType),
                            branchTab: cleanStr(activeAdvisorSession && activeAdvisorSession.sheetTab),
                            erpStore: cleanStr(payload.erpStore),
                            advisorEmail: String((activeAdvisorSession && activeAdvisorSession.correo) || payload.advisorEmail || '').trim().toLowerCase(),
                            advisorName: cleanStr((activeAdvisorSession && activeAdvisorSession.nombre) || payload.advisorName),
                            erpAdvisor: cleanStr(payload.erpAdvisorLabel),
                            erpUserId: cleanStr(metaObj.erpUserId || payload.erpAdvisorId),
                            clientName: cleanStr(payload.clientName),
                            itemsCount: String(Array.isArray(bd.lines) ? bd.lines.length : 0),
                            skusSummary: skusTxt,
                            total: formatPrice(bd && bd.totalWithIva) || '',
                            status: 'COTIZACIÓN REGISTRADA'
                        };
                        myRecentQuotesList = [newEntry].concat(Array.isArray(myRecentQuotesList) ? myRecentQuotesList : []);
                    }
                    renderMyRecentQuotes(myRecentQuotesList);

                    // Puente local inmediato hacia Seguimiento + evitar duplicados si el servidor ya registró
                    try {
                        const segFolio = folClean || qidClean;
                        if (segFolio) {
                            const segBridgeQuote = {
                                folio: segFolio,
                                quoteId: qidClean,
                                fecha: new Date().toISOString().slice(0, 10),
                                sheetTab: cleanStr((activeAdvisorSession && activeAdvisorSession.sheetTab) || payload.sheetTab),
                                erpStore: cleanStr(payload.erpStore),
                                advisorEmail: String((activeAdvisorSession && activeAdvisorSession.correo) || payload.advisorEmail || '').trim().toLowerCase(),
                                advisorName: cleanStr((activeAdvisorSession && activeAdvisorSession.nombre) || payload.advisorName),
                                clientName: cleanStr(payload.clientName),
                                clientPhone: cleanStr(payload.clientPhone),
                                items: Array.isArray(bd.lines) ? bd.lines.map(ln => {
                                    const lnSku = cleanStr(ln.sku).toUpperCase();
                                    const catIt = bySkuMap.get(lnSku);
                                    return {
                                        sku: lnSku,
                                        name: cleanStr(ln.name),
                                        model: cleanStr(ln.model || (catIt && catIt.mo) || ''),
                                        qty: Math.max(1, Number(ln.qty) || 1),
                                        price: Number(ln.unitFinal !== undefined ? ln.unitFinal : (ln.unitDiscounted || ln.unitList || 0)) || 0
                                    };
                                }) : []
                            };
                            try {
                                const bridgeKey = 'creata_live_app_quotes_bridge_v1';
                                const prevList = JSON.parse(localStorage.getItem(bridgeKey) || '[]');
                                const cleanList = Array.isArray(prevList)
                                    ? prevList.filter(x => x && cleanStr(x.folio).toUpperCase() !== segFolio.toUpperCase())
                                    : [];
                                cleanList.unshift(segBridgeQuote);
                                localStorage.setItem(bridgeKey, JSON.stringify(cleanList.slice(0, 120)));
                            } catch (eLs) {}
                            if (!res.serverLoggedHistorial) {
                                callInvWebAppPost('inv_log_event', {
                                    authToken: (activeAdvisorSession && activeAdvisorSession.authToken) || '',
                                    classification: 'MOVIMIENTO',
                                    module: 'SEGUIMIENTO_COTIZACIONES',
                                    event: 'SEG_NUEVA_COTIZACION_APP',
                                    status: '✅ OK',
                                    user: segBridgeQuote.advisorName || segBridgeQuote.advisorEmail || 'Asesor',
                                    branch: segBridgeQuote.erpStore || segBridgeQuote.sheetTab || 'SUCURSAL',
                                    ref: segFolio,
                                    detail: JSON.stringify(segBridgeQuote),
                                    analysis: 'Cotización creada en inventario.'
                                }, 12000).catch(() => {});
                            }
                            if (!res.serverLoggedSeguimiento) {
                                callInvWebAppPost('seg_action', {
                                    authToken: (activeAdvisorSession && activeAdvisorSession.authToken) || '',
                                    subAction: 'SEG_NUEVA_COTIZACION_APP',
                                    folio: segFolio,
                                    payload: segBridgeQuote
                                }, 12000).catch(() => {});
                            }
                            if (window.CreataSeguimientoModule && typeof window.CreataSeguimientoModule.refresh === 'function') {
                                window.CreataSeguimientoModule.refresh();
                            }
                            if (window.CreataHistorialModule && typeof window.CreataHistorialModule.refresh === 'function') {
                                window.CreataHistorialModule.refresh();
                            }
                        }
                    } catch (eSeg) {}
                };

                if (res.sentLiveToErp) {
                    const folioTxt = folioFromRes || assignedFolio || ('ID-' + cleanStr(res.quoteId));
                    const qidTxt = cleanStr(res.quoteId);
                    const uidTxt = cleanStr(res.erpUserId || payload.erpAdvisorId);
                    lastSubmittedQuoteMeta = {
                        orderCode: folioTxt,
                        folio: folioTxt,
                        quoteId: qidTxt,
                        erpUserId: uidTxt,
                        createdAt: cleanStr(res.lastSync),
                        quoteType: res.quoteType || payload.quoteType
                    };
                    prependNewlyGeneratedQuotePdfToView(lastSubmittedQuoteMeta);
                    markActiveQuoteCompleted(lastSubmittedQuoteMeta);
                    renderQuoteStatusBanner(
                        'ok',
                        '<div class="font-extrabold uppercase">✓ CREATA-muebles-cotización creada</div>' +
                        '<div>Folio (' + escapeHtml(payload.erpStore) + '): <strong>' + escapeHtml(folioTxt) + '</strong></div>' +
                        '<div class="pt-1 flex flex-wrap items-center gap-3">' +
                            '<button type="button" onclick="downloadAcceptedQuoteOriginalPdf(this)" class="underline font-extrabold" style="color:#146342;">⬇ Descargar PDF</button>' +
                            '<button type="button" onclick="sendAcceptedQuoteToClientWhatsApp(this)" class="underline font-extrabold" style="color:#146342;">📲 Enviar</button>' +
                            '<button type="button" onclick="printQuoteTemplate()" class="underline font-extrabold">Vista</button>' +
                            '<button type="button" onclick="startFreshQuoteAfterCompleted()" class="underline font-extrabold" style="color:#1A1816;">+ Nueva</button>' +
                        '</div>'
                    );
                    openQuoteAcceptedModal(payload, lastSubmittedQuoteMeta, { isQueued: false });
                    // Pre-cargar PDF en segundo plano sin abrir descarga automática del navegador (listo para 1-tap Enviar / Descargar)
                    window.downloadOriginalErpQuotePdf({
                        quoteId: qidTxt,
                        folio: folioTxt,
                        erpUserId: uidTxt,
                        clientName: payload.clientName,
                        erpStore: payload.erpStore,
                        autoTriggered: true,
                        skipBrowserDownload: true,
                        triggerBtn: document.getElementById('btnDownloadErpPdfModal')
                    });
                    return;
                }

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
                    if (folioFallback) registerObservedFolio(folioFallback, payload.erpStore);
                    const uidFallback = cleanStr((latest && latest.erpUserId) || payload.erpAdvisorId);
                    lastSubmittedQuoteMeta = {
                        orderCode: folioFallback || assignedFolio,
                        folio: folioFallback,
                        quoteId: qidFallback,
                        erpUserId: uidFallback,
                        createdAt: cleanStr(latest && latest.lastSync),
                        quoteType: payload.quoteType
                    };
                    prependNewlyGeneratedQuotePdfToView(lastSubmittedQuoteMeta);
                    markActiveQuoteCompleted(lastSubmittedQuoteMeta);
                    populateQuoteAdvisorControls();
                    renderQuoteStatusBanner(
                        'ok',
                        '<div class="font-extrabold uppercase">✓ CREATA-muebles-cotización registrada</div>' +
                        '<div>Folio: <strong>' + escapeHtml(folioFallback || assignedFolio) + '</strong></div>' +
                        '<div class="pt-1 flex flex-wrap items-center gap-3">' +
                            '<button type="button" onclick="downloadAcceptedQuoteOriginalPdf(this)" class="underline font-extrabold" style="color:#146342;">⬇ Descargar PDF</button>' +
                            '<button type="button" onclick="sendAcceptedQuoteToClientWhatsApp(this)" class="underline font-extrabold" style="color:#146342;">📲 Enviar</button>' +
                            '<button type="button" onclick="printQuoteTemplate()" class="underline font-extrabold">Vista</button>' +
                            '<button type="button" onclick="startFreshQuoteAfterCompleted()" class="underline font-extrabold" style="color:#1A1816;">+ Nueva</button>' +
                        '</div>'
                    );
                    openQuoteAcceptedModal(payload, lastSubmittedQuoteMeta, { isQueued: false });
                    window.downloadOriginalErpQuotePdf({
                        quoteId: qidFallback,
                        folio: folioFallback || assignedFolio,
                        erpUserId: uidFallback,
                        clientName: payload.clientName,
                        erpStore: payload.erpStore,
                        autoTriggered: true,
                        skipBrowserDownload: true,
                        triggerBtn: document.getElementById('btnDownloadErpPdfModal')
                    });
                } else if (res.queuedForDaemon) {
                    lastSubmittedQuoteMeta = {
                        orderCode: assignedFolio,
                        folio: '',
                        quoteId: '',
                        createdAt: cleanStr(res.lastSync),
                        quoteType: payload.quoteType
                    };
                    markActiveQuoteCompleted(lastSubmittedQuoteMeta);
                    renderQuoteStatusBanner(
                        'warn',
                        '<div class="font-extrabold uppercase">⏳ Cotización en cola</div>' +
                        '<div class="pt-1 flex flex-wrap items-center gap-3">' +
                            '<button type="button" onclick="sendAcceptedQuoteToClientWhatsApp(this)" class="underline font-extrabold" style="color:#146342;">📲 Enviar</button>' +
                            '<button type="button" onclick="printQuoteTemplate()" class="underline font-extrabold">Vista</button>' +
                            '<button type="button" onclick="startFreshQuoteAfterCompleted()" class="underline font-extrabold" style="color:#1A1816;">+ Nueva</button>' +
                        '</div>'
                    );
                    openQuoteAcceptedModal(payload, lastSubmittedQuoteMeta, { isQueued: true });
                } else {
                    renderQuoteStatusBanner(
                        'warn',
                        '<div class="font-extrabold uppercase">Cotización registrada en revisión</div>'
                    );
                }
                return;
            }

            if (res && !res.ok && !res.unavailable && !res.needsRedeploy && res.error) {
                renderQuoteStatusBanner(
                    'err',
                    '<div class="font-extrabold uppercase">No se pudo registrar la cotización</div>' +
                    '<div>' + escapeHtml(res.error) + '</div>'
                );
                return;
            }

            if (sendToErp && (!res || res.unavailable)) {
                try {
                    const liveHeaderCheck = await readLivePlantillaHeaderStatus();
                    const recFolio = cleanStr(liveHeaderCheck && liveHeaderCheck.folio);
                    const recQid = cleanStr(liveHeaderCheck && liveHeaderCheck.quoteId);
                    const recStatus = cleanStr(liveHeaderCheck && liveHeaderCheck.erpStatus);
                    const recStore = cleanStr(liveHeaderCheck && liveHeaderCheck.erpStore).toUpperCase();
                    const expectedStore = cleanStr(payload.erpStore).toUpperCase();
                    const alreadyKnown = Array.isArray(myRecentQuotesList) && myRecentQuotesList.some(existing => {
                        if (!existing) return false;
                        if (recQid && cleanStr(existing.quoteId) === recQid) return true;
                        if (recFolio && (cleanStr(existing.folio) === recFolio || cleanStr(existing.orderCode) === recFolio)) return true;
                        return false;
                    });
                    if ((recFolio || recQid) && !alreadyKnown && !/ERROR/i.test(recStatus) && (!expectedStore || !recStore || recStore === expectedStore)) {
                        if (recFolio) registerObservedFolio(recFolio, payload.erpStore);
                        const recUid = cleanStr((liveHeaderCheck && liveHeaderCheck.erpUserId) || payload.erpAdvisorId);
                        lastSubmittedQuoteMeta = {
                            orderCode: recFolio || payload.orderCode,
                            folio: recFolio,
                            quoteId: recQid,
                            erpUserId: recUid,
                            createdAt: cleanStr(liveHeaderCheck && liveHeaderCheck.lastSync),
                            quoteType: payload.quoteType
                        };
                        markActiveQuoteCompleted(lastSubmittedQuoteMeta);
                        populateQuoteAdvisorControls();
                        renderQuoteStatusBanner(
                            'ok',
                            '<div class="font-extrabold uppercase">✓ Cotización confirmada en S Mueblería</div>' +
                            '<div>Folio: <strong>' + escapeHtml(recFolio || payload.orderCode) + '</strong></div>' +
                            '<div class="pt-1 flex flex-wrap items-center gap-3">' +
                                '<button type="button" onclick="downloadAcceptedQuoteOriginalPdf(this)" class="underline font-extrabold" style="color:#146342;">⬇ Descargar PDF</button>' +
                                '<button type="button" onclick="sendAcceptedQuoteToClientWhatsApp(this)" class="underline font-extrabold" style="color:#146342;">📲 Enviar</button>' +
                                '<button type="button" onclick="startFreshQuoteAfterCompleted()" class="underline font-extrabold" style="color:#1A1816;">+ Nueva</button>' +
                            '</div>'
                        );
                        openQuoteAcceptedModal(payload, lastSubmittedQuoteMeta, { isQueued: false });
                        refreshMyLiveQuotesInfo(true);
                        return;
                    }
                } catch (eLiveChk) {}
            }

            window.copyCartSummary();
            renderQuoteStatusBanner(
                'warn',
                '<div class="font-extrabold uppercase">Plantilla generada y copiada al portapapeles</div>' +
                '<div>Actualiza la versión publicada de <code>AppsScript_Creata_Drive_Sheets.gs</code> en <em>Extensiones → Apps Script → Implementar → Administrar implementaciones → Editar → Nueva versión</em> para registrar directamente la cotización.</div>' +
                '<div class="pt-1"><button type="button" onclick="printQuoteTemplate()" class="underline font-extrabold">Abrir Vista / PDF de esta Cotización →</button></div>'
            );
        } catch (quoteErr) {
            const msgErr = (quoteErr && quoteErr.message) ? quoteErr.message : String(quoteErr);
            reportSystemHistoryEvent({
                classification: 'FALLO DE CÓDIGO',
                module: 'inventario-app.js · submitQuoteOrder',
                event: 'EXCEPCIÓN EN ENVÍO DE COTIZACIÓN',
                status: '❌ ERROR',
                ref: payload.orderCode || '',
                detail: msgErr,
                analysis: cleanStr(quoteErr && quoteErr.stack) || 'Excepción en cliente durante el flujo de envío de cotización.'
            });
            renderQuoteStatusBanner(
                'err',
                '<div class="font-extrabold uppercase">Ocurrió un error al procesar la cotización</div>' +
                '<div>' + escapeHtml(msgErr) + '</div>'
            );
        } finally {
            quoteSubmitInFlight = false;
            const lockedNow = isActiveQuoteCompleted();
            if (btnRev) btnRev.disabled = lockedNow;
            if (btnSend) {
                btnSend.disabled = lockedNow;
                btnSend.textContent = 'Crear Cotización';
            }
        }
    };

