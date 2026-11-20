(function () {
    'use strict';

    const RENDER_ORIGIN = 'https://buena-espero.onrender.com';
    const RENDER_EMBED_URL = RENDER_ORIGIN + '/?embed=true&embed_options=dark_theme';
    const RENDER_DIRECT_URL = RENDER_ORIGIN + '/';
    const RENDER_HEALTH_URL = RENDER_ORIGIN + '/_stcore/health';
    const BAR_COLLAPSED_KEY = 'creata_prompts_bar_collapsed_v1';

    let deferredInstallPrompt = null;
    let frameLoaded = false;
    let frameNavigationRequested = false;
    let loadStartedAt = 0;
    let loadTimerInterval = null;
    let wakeProbeDone = false;
    let promptsBackNav = null;
    let skuInputHadValue = false;

    function byId(id) {
        return document.getElementById(id);
    }

    function isElHidden(id) {
        const el = byId(id);
        return !el || el.classList.contains('hidden');
    }

    function syncPromptsBackDepth(reason) {
        if (promptsBackNav && typeof promptsBackNav.syncDepthOnUserAction === 'function') {
            promptsBackNav.syncDepthOnUserAction(reason);
        }
    }

    function isStandaloneMode() {
        try {
            if (window.navigator && window.navigator.standalone === true) return true;
            if (window.matchMedia && (
                window.matchMedia('(display-mode: standalone)').matches ||
                window.matchMedia('(display-mode: window-controls-overlay)').matches ||
                window.matchMedia('(display-mode: fullscreen)').matches
            )) {
                return true;
            }
        } catch (e) {}
        return false;
    }

    function detectPlatformTab() {
        try {
            const ua = String(navigator.userAgent || '');
            const isIOS = /iPad|iPhone|iPod/i.test(ua) ||
                (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
            if (isIOS) return 'ios';
            if (/Android/i.test(ua)) return 'android';
        } catch (e) {}
        return 'pc';
    }

    function setConnectionStatus(mode, label) {
        const pill = byId('promptsStatusPill');
        const txt = byId('promptsStatusText');
        if (pill) {
            pill.classList.remove('is-online', 'is-loading', 'is-offline');
            if (mode === 'online') pill.classList.add('is-online');
            else if (mode === 'offline') pill.classList.add('is-offline');
            else pill.classList.add('is-loading');
        }
        if (txt && label) {
            txt.textContent = label;
        }
    }

    function stopLoadTimer() {
        if (loadTimerInterval) {
            clearInterval(loadTimerInterval);
            loadTimerInterval = null;
        }
    }

    function hideLoadingOverlay() {
        stopLoadTimer();
        const overlay = byId('promptsLoadingOverlay');
        if (!overlay) return;
        overlay.classList.add('is-fading');
        setTimeout(() => {
            if (frameLoaded) overlay.classList.add('hidden');
        }, 300);
    }

    function showLoadingOverlay(isOffline) {
        const overlay = byId('promptsLoadingOverlay');
        const spinner = byId('overlaySpinner');
        const title = byId('overlayTitle');
        const sub = byId('overlaySub');
        const timerEl = byId('overlayTimer');
        const actions = byId('overlayActions');
        if (!overlay) return;

        overlay.classList.remove('hidden', 'is-fading');

        if (isOffline) {
            stopLoadTimer();
            if (spinner) spinner.classList.add('hidden');
            if (title) title.textContent = 'Sin conexión a internet';
            if (sub) sub.textContent = 'El Generador de Prompts IA necesita conexión para comunicarse con Gemini y Google Drive.';
            if (timerEl) timerEl.textContent = '';
            if (actions) actions.classList.remove('hidden');
            setConnectionStatus('offline', 'Sin red');
            return;
        }

        if (spinner) spinner.classList.remove('hidden');
        if (title) title.textContent = 'Iniciando Generador de Prompts IA';
        if (sub) sub.textContent = 'Conectando con Estudio IA en la nube...';
        if (timerEl) timerEl.textContent = '';
        if (actions) actions.classList.add('hidden');
        setConnectionStatus('loading', 'Conectando');

        loadStartedAt = Date.now();
        stopLoadTimer();
        loadTimerInterval = setInterval(() => {
            if (frameLoaded) {
                stopLoadTimer();
                return;
            }
            const elapsedSec = Math.floor((Date.now() - loadStartedAt) / 1000);
            if (timerEl && elapsedSec >= 2) {
                timerEl.textContent = 'Tiempo de espera: ' + elapsedSec + 's';
            }
            if (elapsedSec >= 4 && sub) {
                sub.textContent = 'Despertando servidor en Render (en reposo puede tardar 15 a 40 segundos)...';
            }
            if (elapsedSec >= 12 && actions) {
                actions.classList.remove('hidden');
            }
        }, 1000);
    }

    function wakeRenderServerSilently() {
        if (wakeProbeDone) return;
        wakeProbeDone = true;
        try {
            fetch(RENDER_HEALTH_URL, { method: 'GET', mode: 'no-cors', cache: 'no-store' }).catch(() => {});
        } catch (e) {}
    }

    function onGeneratorFrameLoad() {
        const currentFrame = byId('promptsAppFrame');
        const currentSrc = currentFrame ? String(currentFrame.src || '') : '';
        if (!frameNavigationRequested && (!currentSrc || currentSrc === 'about:blank')) return;
        frameLoaded = true;
        setConnectionStatus('online', 'En línea');
        hideLoadingOverlay();
    }

    function onGeneratorFrameError() {
        frameLoaded = false;
        showLoadingOverlay(typeof navigator !== 'undefined' && navigator.onLine === false);
    }

    function loadGeneratorFrame(forceBust) {
        const frame = byId('promptsAppFrame');
        if (!frame) return;

        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            frameLoaded = false;
            showLoadingOverlay(true);
            return;
        }

        frameLoaded = false;
        showLoadingOverlay(false);
        wakeRenderServerSilently();

        const targetUrl = forceBust
            ? RENDER_EMBED_URL + '&_r=' + Date.now()
            : RENDER_EMBED_URL;
        frameNavigationRequested = true;
        if (window.CreataBackNav && typeof window.CreataBackNav.replaceIframeUrl === 'function') {
            window.CreataBackNav.replaceIframeUrl(frame, targetUrl, {
                forceReload: true,
                onLoad: onGeneratorFrameLoad,
                onError: onGeneratorFrameError
            });
        } else {
            frame.src = targetUrl;
        }
    }

    function syncInstallControls() {
        const installed = isStandaloneMode();
        const topBtn = byId('btnInstallPromptsApp');
        const nativeBanner = byId('nativeInstallBanner');

        if (topBtn) {
            topBtn.classList.toggle('hidden', installed);
            topBtn.textContent = deferredInstallPrompt ? '📲 Instalar App' : '📲 Descargar App';
        }
        if (nativeBanner) {
            nativeBanner.classList.toggle('hidden', installed || !deferredInstallPrompt);
        }
    }

    function selectInstallTab(tabKey) {
        const tabs = document.querySelectorAll('[data-install-tab]');
        const panels = document.querySelectorAll('[data-install-panel]');
        tabs.forEach((btn) => {
            const active = btn.getAttribute('data-install-tab') === tabKey;
            btn.classList.toggle('is-active', active);
            btn.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        panels.forEach((panel) => {
            const active = panel.getAttribute('data-install-panel') === tabKey;
            panel.classList.toggle('hidden', !active);
        });
    }

    function applyCollapsedBarState(collapsed) {
        const shell = byId('promptsShell');
        const expandBtn = byId('floatingExpandBarBtn');
        if (shell) shell.classList.toggle('is-bar-collapsed', !!collapsed);
        if (expandBtn) expandBtn.classList.toggle('hidden', !collapsed);
        try {
            localStorage.setItem(BAR_COLLAPSED_KEY, collapsed ? '1' : '0');
        } catch (e) {}
    }

    window.togglePromptsTopbar = function (collapse) {
        const nextCollapsed = !!collapse;
        applyCollapsedBarState(nextCollapsed);
        if (nextCollapsed) {
            syncPromptsBackDepth('collapsed_topbar');
        }
    };

    window.reloadPromptsGenerator = function () {
        wakeProbeDone = false;
        loadGeneratorFrame(true);
    };

    window.openPromptsDirectTab = function () {
        window.open(RENDER_DIRECT_URL, '_blank', 'noopener');
    };

    window.selectPromptsInstallTab = function (tabKey) {
        selectInstallTab(tabKey);
    };

    window.closePromptsInstallModal = function () {
        const modal = byId('promptsInstallModal');
        if (modal) modal.classList.add('hidden');
    };

    window.openPromptsInstallModal = function () {
        const modal = byId('promptsInstallModal');
        if (!modal) return;
        syncInstallControls();
        selectInstallTab(detectPlatformTab());
        const fb = byId('copyAppLinkFeedback');
        if (fb) fb.textContent = '';
        modal.classList.remove('hidden');
        syncPromptsBackDepth('install_modal');
    };

    window.runNativePromptsInstall = async function () {
        if (!deferredInstallPrompt) {
            window.openPromptsInstallModal();
            return;
        }
        try {
            deferredInstallPrompt.prompt();
            const choice = await deferredInstallPrompt.userChoice;
            if (choice && choice.outcome === 'accepted') {
                deferredInstallPrompt = null;
                window.closePromptsInstallModal();
            }
        } catch (e) {
            window.openPromptsInstallModal();
        } finally {
            syncInstallControls();
        }
    };

    window.triggerPromptsInstall = function () {
        if (deferredInstallPrompt) {
            window.runNativePromptsInstall();
            return;
        }
        window.openPromptsInstallModal();
    };

    window.copyPromptsAppUrl = async function () {
        const fb = byId('copyAppLinkFeedback');
        const url = window.location.href.split('#')[0];
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(url);
            } else {
                const ta = document.createElement('textarea');
                ta.value = url;
                ta.setAttribute('readonly', '');
                ta.style.position = 'fixed';
                ta.style.opacity = '0';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
            }
            if (fb) fb.textContent = 'Enlace copiado';
        } catch (e) {
            if (fb) fb.textContent = 'Copia la URL desde la barra';
        }
    };

    const SUBIR_PROPT_FOLDER_ID = '1Xc-gaDUJHNSd_XSTob3b39CNYoC9UreX';
    const ALLOWED_PROJECT_B_FOLDER_IDS = {
        '1lfq8VBF1q-Kg9m6_qd2GU5zxwEywYw_B': true,
        '10UIhDWLKL0ySmzdcMemA5K5831YozuBa': true,
        '1z-Ne0hBzXIi1dTfJOxtz1kUUPYQQNpTR': true,
        '12gsKZVs6rFonOO8CIxokuE73bxhq8tS9': true,
        '13inkyy1ZfGn7yD0ceSr6RSMquaA3OBO1': true,
        '1rwRk-bZtb8m4Hso9pCJE1A0_QiS-rqUQ': true,
        '1Xc-gaDUJHNSd_XSTob3b39CNYoC9UreX': true
    };
    const INBOX_DELETABLE_FOLDER_IDS = {
        '1rwRk-bZtb8m4Hso9pCJE1A0_QiS-rqUQ': true,
        '1Xc-gaDUJHNSd_XSTob3b39CNYoC9UreX': true
    };
    const SCRIPT_URL_STORAGE_KEY = 'creata_prompts_webapp_url_v1';
    const OWNER_EMAIL_STORAGE_KEY = 'creata_prompts_owner_email_v1';
    const PIN_STORAGE_KEY = 'creata_prompts_pin_v1';
    const DEFAULT_OWNER_EMAIL = 'kevin.reyna@grupoanipa.com';
    const APPS_SCRIPT_TIMEOUT_MS = 30000;

    let proptDrawerOpen = false;
    let proptFilesCache = [];
    let lastSkuMatch = null;
    let pendingSuggestedScriptUrl = '';
    let pinInputManuallyEdited = false;

    function escapeHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function isValidDriveId(id) {
        return /^[A-Za-z0-9_-]{4,}$/.test(String(id || '').trim());
    }

    function sanitizeSafeDriveUrl(url, fallbackUrl) {
        const raw = String(url || '').trim();
        if (/^https:\/\/(?:lh3\.googleusercontent\.com|drive\.google\.com)\//i.test(raw)) {
            return raw;
        }
        return String(fallbackUrl || '').trim();
    }

    function formatBytes(bytes) {
        const n = Number(bytes || 0);
        if (!n) return '—';
        if (n < 1024) return n + ' B';
        if (n < 1024 * 1024) return (n / 1024).toFixed(0) + ' KB';
        return (n / (1024 * 1024)).toFixed(1) + ' MB';
    }

    function isValidAppsScriptUrl(url) {
        return /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/i.test(String(url || '').trim());
    }

    function getProptConfig() {
        let scriptUrl = '';
        let ownerEmail = DEFAULT_OWNER_EMAIL;
        let pin = '';
        try {
            scriptUrl = String(localStorage.getItem(SCRIPT_URL_STORAGE_KEY) || '').trim();
            ownerEmail = String(localStorage.getItem(OWNER_EMAIL_STORAGE_KEY) || '').trim() || DEFAULT_OWNER_EMAIL;
            pin = String(localStorage.getItem(PIN_STORAGE_KEY) || '').trim();
        } catch (e) {}
        return { scriptUrl: scriptUrl, ownerEmail: ownerEmail, pin: pin };
    }

    function syncProptConfigInputs() {
        const cfg = getProptConfig();
        const urlEl = byId('proptScriptUrlInput');
        const emailEl = byId('proptOwnerEmailInput');
        const pinEl = byId('proptPinInput');
        const effectiveUrl = pendingSuggestedScriptUrl || cfg.scriptUrl;
        const differsFromSaved = Boolean(pendingSuggestedScriptUrl && pendingSuggestedScriptUrl !== cfg.scriptUrl);
        if (urlEl) urlEl.value = effectiveUrl;
        if (emailEl) emailEl.value = cfg.ownerEmail;
        if (pinEl) {
            pinEl.value = differsFromSaved ? '' : cfg.pin;
        }
        pinInputManuallyEdited = false;
    }

    function setProptConnPill(state, text) {
        const pill = byId('proptConnStatus');
        if (!pill) return;
        pill.classList.remove('is-ok', 'is-err', 'is-idle');
        pill.classList.add(state === 'ok' ? 'is-ok' : (state === 'err' ? 'is-err' : 'is-idle'));
        pill.textContent = text;
    }

    function showProptFeedback(msg, isOk) {
        const el = byId('proptFeedback');
        if (!el) return;
        if (!msg) {
            el.classList.add('hidden');
            el.textContent = '';
            return;
        }
        el.classList.remove('hidden', 'is-ok', 'is-err');
        el.classList.add(isOk ? 'is-ok' : 'is-err');
        el.textContent = msg;
    }

    function updateProptCountBadges(count) {
        const badge = byId('proptCountBadge');
        const lbl = byId('proptListCountLabel');
        const n = Number(count || 0);
        if (badge) {
            badge.textContent = String(n);
            badge.classList.toggle('hidden', n <= 0);
        }
        if (lbl) {
            lbl.textContent = n + (n === 1 ? ' foto' : ' fotos');
        }
    }

    async function callPromptsAppsScript(action, extraPayload) {
        const cfg = getProptConfig();
        if (!isValidAppsScriptUrl(cfg.scriptUrl)) {
            throw new Error('Configura primero la URL /exec de AppsScript_Prompts_Odoo.gs.');
        }

        const body = Object.assign(
            {
                action: action,
                ownerEmail: cfg.ownerEmail || DEFAULT_OWNER_EMAIL
            },
            cfg.pin ? { pin: cfg.pin } : {},
            extraPayload || {}
        );

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), APPS_SCRIPT_TIMEOUT_MS);
        try {
            const res = await fetch(cfg.scriptUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(body),
                signal: controller.signal
            });
            const rawText = await res.text();
            let parsed;
            try {
                parsed = JSON.parse(rawText);
            } catch (eJson) {
                throw new Error('Respuesta no JSON del Apps Script (verifica el despliegue Web App).');
            }
            return parsed;
        } finally {
            clearTimeout(timer);
        }
    }

    function renderProptGallery(files, folderIdHint) {
        const grid = byId('proptGalleryGrid');
        if (!grid) return;
        const rawList = Array.isArray(files) ? files : [];
        const list = rawList.filter((f) => f && isValidDriveId(f.id));
        proptFilesCache = list;
        updateProptCountBadges(list.length);

        if (!list.length) {
            grid.innerHTML = '<div class="propt-empty">Sin fotos recientes en la carpeta seleccionada de Odoo.</div>';
            return;
        }

        const allowDelete = !folderIdHint || Boolean(INBOX_DELETABLE_FOLDER_IDS[String(folderIdHint)]);

        grid.innerHTML = list.map((f) => {
            const rawId = String(f.id).trim();
            const fid = escapeHtml(rawId);
            const fname = escapeHtml(f.name || 'foto.jpg');
            const defaultThumb = 'https://lh3.googleusercontent.com/d/' + rawId + '=w800';
            const defaultFallback = 'https://drive.google.com/thumbnail?id=' + rawId + '&sz=w480';
            const defaultView = 'https://drive.google.com/file/d/' + rawId + '/view?usp=sharing';
            const thumb = escapeHtml(sanitizeSafeDriveUrl(f.thumbUrl, defaultThumb));
            const fallbackThumb = escapeHtml(sanitizeSafeDriveUrl(defaultFallback, defaultThumb));
            const viewUrl = escapeHtml(sanitizeSafeDriveUrl(f.viewUrl, defaultView));
            const delBtn = allowDelete
                ? '<button type="button" class="propt-mini-btn is-danger" data-del-id="' + fid + '" onclick="deleteProptFileById(this.getAttribute(\'data-del-id\'))" title="Enviar a papelera por ID">🗑</button>'
                : '';
            return (
                '<article class="propt-photo-card" data-file-id="' + fid + '">' +
                    '<div class="propt-photo-thumb-wrap">' +
                        '<img class="propt-photo-thumb" src="' + thumb + '" data-fb-src="' + fallbackThumb + '" alt="' + fname + '" loading="lazy" decoding="async" referrerpolicy="no-referrer" ' +
                        'onerror="if(!this.dataset.fb){this.dataset.fb=\'1\';this.src=this.getAttribute(\'data-fb-src\')||\'\';}">' +
                    '</div>' +
                    '<div class="propt-photo-info">' +
                        '<div class="propt-photo-name" title="' + fname + '">' + fname + '</div>' +
                        '<div class="propt-photo-foot">' +
                            '<span class="propt-photo-size">' + escapeHtml(formatBytes(f.sizeBytes)) + '</span>' +
                            '<div class="propt-photo-actions">' +
                                '<a class="propt-mini-btn" href="' + viewUrl + '" target="_blank" rel="noopener" title="Abrir en Drive">↗</a>' +
                                delBtn +
                            '</div>' +
                        '</div>' +
                    '</div>' +
                '</article>'
            );
        }).join('');
    }

    function readFileAsDataUrl(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(new Error('No se pudo leer el archivo local.'));
            reader.readAsDataURL(file);
        });
    }

    window.toggleProptConfigPanel = function (forceShow) {
        const box = byId('proptConfigBox');
        if (!box) return;
        const shouldShow = typeof forceShow === 'boolean' ? forceShow : box.classList.contains('hidden');
        box.classList.toggle('hidden', !shouldShow);
        if (shouldShow) {
            syncProptConfigInputs();
            if (proptDrawerOpen && isValidAppsScriptUrl(getProptConfig().scriptUrl) && !pendingSuggestedScriptUrl) {
                syncPromptsBackDepth('propt_config');
            }
        }
    };

    window.toggleProptDrawer = function (forceOpen) {
        const drawer = byId('proptDrawer');
        const backdrop = byId('proptDrawerBackdrop');
        if (!drawer) return;
        const nextOpen = typeof forceOpen === 'boolean' ? forceOpen : !proptDrawerOpen;
        proptDrawerOpen = nextOpen;
        drawer.classList.toggle('hidden', !nextOpen);
        if (backdrop) backdrop.classList.toggle('hidden', !nextOpen);
        if (nextOpen) {
            syncProptConfigInputs();
            const cfg = getProptConfig();
            if (pendingSuggestedScriptUrl) {
                window.toggleProptConfigPanel(true);
                setProptConnPill('idle', 'Confirmar URL');
                showProptFeedback('URL recibida por enlace. Verifica que sea tu despliegue, ingresa tu PROMPTS_PIN y haz clic en "Guardar y conectar".', false);
            } else if (isValidAppsScriptUrl(cfg.scriptUrl)) {
                window.toggleProptConfigPanel(false);
                window.refreshProptDrawerData();
            } else {
                window.toggleProptConfigPanel(true);
                setProptConnPill('idle', 'Sin configurar');
            }
            syncPromptsBackDepth('propt_drawer');
        }
    };

    window.saveProptScriptConfig = async function () {
        const urlEl = byId('proptScriptUrlInput');
        const emailEl = byId('proptOwnerEmailInput');
        const pinEl = byId('proptPinInput');
        const urlVal = String((urlEl && urlEl.value) || '').trim();
        const emailVal = String((emailEl && emailEl.value) || '').trim() || DEFAULT_OWNER_EMAIL;
        const pinVal = String((pinEl && pinEl.value) || '').trim();

        if (!isValidAppsScriptUrl(urlVal)) {
            setProptConnPill('err', 'URL inválida');
            showProptFeedback('Ingresa una URL válida de Google Apps Script (https://script.google.com/macros/s/.../exec).', false);
            return;
        }

        const prevCfg = getProptConfig();
        const urlChanged = Boolean(prevCfg.scriptUrl && prevCfg.scriptUrl !== urlVal);
        if (urlChanged) {
            if (!pinVal || (prevCfg.pin && pinVal === prevCfg.pin && !pinInputManuallyEdited)) {
                if (pinEl) pinEl.value = '';
                pinInputManuallyEdited = false;
                setProptConnPill('err', 'Confirma PIN');
                showProptFeedback('Cambiaste la URL del Apps Script: vuelve a escribir tu PROMPTS_PIN para confirmar y haz clic en "Guardar y conectar".', false);
                return;
            }
        }

        try {
            localStorage.setItem(SCRIPT_URL_STORAGE_KEY, urlVal);
            localStorage.setItem(OWNER_EMAIL_STORAGE_KEY, emailVal);
            if (pinVal) localStorage.setItem(PIN_STORAGE_KEY, pinVal);
            else localStorage.removeItem(PIN_STORAGE_KEY);
        } catch (e) {}

        pendingSuggestedScriptUrl = '';
        pinInputManuallyEdited = false;

        showProptFeedback('Probando conexión con AppsScript_Prompts_Odoo.gs...', true);
        const ok = await window.refreshProptDrawerData();
        if (ok) {
            window.toggleProptConfigPanel(false);
        }
    };

    window.clearProptScriptConfig = function () {
        pendingSuggestedScriptUrl = '';
        pinInputManuallyEdited = false;
        try {
            localStorage.removeItem(SCRIPT_URL_STORAGE_KEY);
            localStorage.removeItem(PIN_STORAGE_KEY);
        } catch (e) {}
        syncProptConfigInputs();
        setProptConnPill('idle', 'Sin configurar');
        proptFilesCache = [];
        updateProptCountBadges(0);
        const warnEl = byId('proptHealthWarning');
        if (warnEl) warnEl.classList.add('hidden');
        const grid = byId('proptGalleryGrid');
        if (grid) grid.innerHTML = '<div class="propt-empty">Conecta la URL de AppsScript_Prompts_Odoo.gs para subir fotos directo a Odoo y registrarlas en Base de Datos Generales.</div>';
        showProptFeedback('Configuración borrada de este navegador.', true);
    };

    function syncProptTipoFromDest(destValue) {
        const destEl = byId('proptDestSelect');
        const tipoEl = byId('proptTipoSelect');
        const destChoice = String(
            destValue !== undefined ? destValue : ((destEl && destEl.value) || '')
        ).trim().toUpperCase();
        if (!tipoEl) return '';
        if (destChoice === 'TELAS') {
            tipoEl.value = 'TELA';
            return 'TELA';
        }
        if (destChoice === 'MUEBLES') {
            tipoEl.value = 'MUEBLE';
            return 'MUEBLE';
        }
        return String(tipoEl.value || '').trim().toUpperCase();
    }

    window.syncProptTipoFromDest = syncProptTipoFromDest;

    window.onProptDestChange = function () {
        syncProptTipoFromDest();
        if (typeof window.refreshProptDrawerData === 'function') {
            return window.refreshProptDrawerData();
        }
        return Promise.resolve(false);
    };

    function ensureProptUploadConfigReady() {
        const cfg = getProptConfig();
        if (!isValidAppsScriptUrl(cfg.scriptUrl)) {
            window.toggleProptConfigPanel(true);
            setProptConnPill('err', 'Falta URL /exec');
            showProptFeedback(
                'Configura primero la URL /exec de AppsScript_Prompts_Odoo.gs arriba (⚙) y pulsa "Guardar y conectar" para subir fotos.',
                false
            );
            const urlEl = byId('proptScriptUrlInput');
            if (urlEl && typeof urlEl.focus === 'function') {
                try { urlEl.focus(); } catch (e) {}
            }
            return false;
        }
        if (!cfg.pin) {
            window.toggleProptConfigPanel(true);
            setProptConnPill('err', 'Falta PIN');
            showProptFeedback(
                'Falta configurar tu PROMPTS_PIN arriba (⚙) y pulsar "Guardar y conectar". Si aún no existe, ejecuta CREATA Prompts & Odoo → Configurar PIN en Base de Datos Generales.',
                false
            );
            const pinEl = byId('proptPinInput');
            if (pinEl && typeof pinEl.focus === 'function') {
                try { pinEl.focus(); } catch (e) {}
            }
            return false;
        }
        return true;
    }

    window.triggerProptUploadInput = function (inputId) {
        if (!ensureProptUploadConfigReady()) return false;
        const target = byId(inputId || 'proptFileInput');
        if (target && typeof target.click === 'function') {
            target.click();
            return true;
        }
        return false;
    };

    function formatProptErrorWithGuidance(rawError) {
        const msg = String(rawError || '').trim();
        if (!msg) return 'No se pudo completar la operación con AppsScript_Prompts_Odoo.gs.';
        if (/Configura PROMPTS_PIN/i.test(msg)) {
            window.toggleProptConfigPanel(true);
            setProptConnPill('err', 'Configurar PIN');
            return 'Falta crear PROMPTS_PIN en Apps Script: abre Base de Datos Generales → menú CREATA Prompts & Odoo → Configurar PIN, luego ingrésalo arriba y guarda.';
        }
        if (/PIN inv[áa]lido|PROMPTS_PIN|No autorizado|acceso denegado/i.test(msg)) {
            window.toggleProptConfigPanel(true);
            setProptConnPill('err', 'Revisar PIN');
            return 'PROMPTS_PIN inválido o faltante. Verifica tu PIN en Configuración (⚙) y pulsa "Guardar y conectar".';
        }
        if (/Respuesta no JSON|despliegue Web App/i.test(msg)) {
            window.toggleProptConfigPanel(true);
            setProptConnPill('err', 'Revisar /exec');
            return 'La URL /exec no devolvió JSON válido. Verifica que AppsScript_Prompts_Odoo.gs esté implementado como Aplicación web con acceso "Cualquier usuario".';
        }
        return msg;
    }

    window.refreshProptDrawerData = async function () {
        const cfg = getProptConfig();
        const warnEl = byId('proptHealthWarning');
        if (!isValidAppsScriptUrl(cfg.scriptUrl)) {
            setProptConnPill('idle', 'Sin configurar');
            return false;
        }
        setProptConnPill('idle', 'Conectando...');

        const destSelectEl = byId('proptDestSelect');
        const destChoice = String((destSelectEl && destSelectEl.value) || '').trim().toUpperCase();
        let listAction = 'prompts_propt_list';
        let listPayload = {};
        if (destChoice === 'BUZON') {
            listAction = 'odoo_buzon_list';
        } else if (destChoice) {
            listAction = 'odoo_final_list';
            listPayload = { subfolderKey: destChoice, limit: 40 };
        }

        try {
            let [healthRes, listRes] = await Promise.all([
                callPromptsAppsScript('prompts_health'),
                callPromptsAppsScript(listAction, listPayload)
            ]);

            // Respaldo transparente si el Apps Script desplegado aún no incluye odoo_final_list
            if (listAction === 'odoo_final_list' && (!listRes || !listRes.ok) && /no reconocida/i.test(String((listRes && listRes.error) || ''))) {
                listRes = await callPromptsAppsScript('odoo_buzon_list');
            }

            const healthWarnings = (healthRes && Array.isArray(healthRes.warnings)) ? healthRes.warnings.slice() : [];
            if (healthRes && healthRes.ok && healthRes.pinConfigured === false) {
                healthWarnings.unshift('PROMPTS_PIN aún no está configurado en AppsScript_Prompts_Odoo.gs (Base de Datos Generales → CREATA Prompts & Odoo → Configurar PIN).');
            }
            if (healthWarnings.length && warnEl) {
                warnEl.textContent = '⚠️ ' + healthWarnings.join(' · ');
                warnEl.classList.remove('hidden');
            } else if (warnEl) {
                warnEl.classList.add('hidden');
            }

            if (!listRes || !listRes.ok) {
                const rawErr = (listRes && listRes.error) || (
                    !cfg.pin
                        ? 'Falta configurar PROMPTS_PIN en Configuración (⚙).'
                        : 'No se pudo listar la carpeta de Odoo.'
                );
                setProptConnPill('err', 'Error');
                showProptFeedback(formatProptErrorWithGuidance(rawErr), false);
                return false;
            }

            if (listRes.folderId && !ALLOWED_PROJECT_B_FOLDER_IDS[String(listRes.folderId)]) {
                setProptConnPill('err', 'Carpeta inválida');
                showProptFeedback('Bloqueado: el endpoint devolvió una carpeta no autorizada para Odoo/Sheet.', false);
                return false;
            }

            setProptConnPill('ok', 'Conectado');
            renderProptGallery(listRes.files || [], listRes.folderId || '');
            showProptFeedback('', true);
            return true;
        } catch (err) {
            setProptConnPill('err', 'Sin conexión');
            showProptFeedback(
                formatProptErrorWithGuidance((err && err.message) ? err.message : 'Error de red al conectar Apps Script.'),
                false
            );
            return false;
        }
    };

    function buildSafeUploadFileName(file, tipoChoice, index) {
        const rawName = String((file && file.name) || '').trim();
        if (rawName) return rawName;
        const prefix = String(tipoChoice || 'FOTO').toLowerCase().replace(/[^a-z0-9]+/g, '_') || 'foto';
        const stamp = Date.now().toString(36) + '_' + (index + 1);
        return prefix + '_' + stamp + '.jpg';
    }

    window.uploadFilesToSubirPropt = async function (inputEl) {
        const rawFiles = inputEl && inputEl.files ? Array.from(inputEl.files) : [];
        if (inputEl && typeof inputEl.value === 'string') inputEl.value = '';
        const imageFiles = rawFiles.filter((f) => {
            if (!f) return false;
            const mime = String(f.type || '').toLowerCase();
            return mime.indexOf('image/') === 0 || /\.(jpe?g|png|webp|gif|avif|bmp|heic|heif)$/i.test(f.name || '');
        });
        if (!imageFiles.length) {
            if (rawFiles.length > 0) {
                showProptFeedback('Selecciona una imagen válida (JPG, PNG o WEBP).', false);
            }
            return;
        }

        if (!ensureProptUploadConfigReady()) return;

        const destSelectEl = byId('proptDestSelect');
        const tipoSelectEl = byId('proptTipoSelect');
        const regCheckEl = byId('proptRegisterSheetCheck');
        const skuInputEl = byId('proptSkuInput');

        const destChoice = String((destSelectEl && destSelectEl.value) || 'MUEBLES').trim().toUpperCase();
        const tipoChoice = String((tipoSelectEl && tipoSelectEl.value) || (destChoice === 'TELAS' ? 'TELA' : 'MUEBLE')).trim().toUpperCase();
        const registerSheet = regCheckEl ? Boolean(regCheckEl.checked) : true;
        const activeSku = String((lastSkuMatch && lastSkuMatch.sku) || (skuInputEl && skuInputEl.value) || '').trim().toUpperCase();

        const btn = byId('btnUploadSubirPropt');
        const camBtn = byId('btnCameraSubirPropt');
        if (btn) btn.disabled = true;
        if (camBtn) camBtn.disabled = true;
        let uploaded = 0;
        let registeredCount = 0;
        let lastErr = '';
        let abortedForConfig = false;
        try {
            for (let i = 0; i < imageFiles.length; i++) {
                const file = imageFiles[i];
                const uploadName = buildSafeUploadFileName(file, tipoChoice, i);
                showProptFeedback('Subiendo ' + (i + 1) + '/' + imageFiles.length + ' (' + destChoice + ' · ' + tipoChoice + '): ' + uploadName + '...', true);
                try {
                    const dataUrl = await readFileAsDataUrl(file);
                    let res = await callPromptsAppsScript('odoo_direct_upload_and_register', {
                        fileName: uploadName,
                        dataUrl: dataUrl,
                        dest: destChoice === 'BUZON' ? 'buzon' : 'final',
                        subfolderKey: destChoice === 'BUZON' ? '' : destChoice,
                        tipo: tipoChoice,
                        registerSheet: registerSheet,
                        sku: registerSheet ? activeSku : ''
                    });
                    if ((!res || !res.ok) && /no reconocida/i.test(String((res && res.error) || ''))) {
                        // Respaldo compatible si el despliegue aún no fue actualizado con odoo_direct_upload_and_register
                        res = await callPromptsAppsScript('odoo_buzon_upload', {
                            fileName: uploadName,
                            dataUrl: dataUrl
                        });
                        if (res && res.ok && registerSheet && res.file && res.file.viewUrl) {
                            const stem = String(uploadName || 'foto').replace(/\.(jpe?g|png|webp|gif|avif|bmp|heic|heif)$/i, '').trim() || 'foto';
                            const regRes = await callPromptsAppsScript('odoo_register_foto', Object.assign(
                                { tipo: tipoChoice, nombre: stem, link: res.file.viewUrl },
                                activeSku ? { sku: activeSku, updateDatosGeneral: true } : {}
                            ));
                            res.sheetRegistration = regRes;
                        }
                    }
                    if (res && res.ok) {
                        uploaded++;
                        if (res.sheetRegistration && res.sheetRegistration.ok) {
                            registeredCount++;
                        }
                    } else {
                        const rawErr = (res && res.error) || ('No se pudo subir ' + uploadName);
                        lastErr = formatProptErrorWithGuidance(rawErr);
                        if (/PROMPTS_PIN|PIN inv[áa]lido|Configura PROMPTS_PIN|No autorizado|Respuesta no JSON/i.test(String(rawErr))) {
                            abortedForConfig = true;
                            break;
                        }
                    }
                } catch (eOne) {
                    const rawErr = (eOne && eOne.message) || ('Error al subir ' + uploadName);
                    lastErr = formatProptErrorWithGuidance(rawErr);
                    if (/Configura primero|PROMPTS_PIN|Respuesta no JSON/i.test(String(rawErr))) {
                        abortedForConfig = true;
                        break;
                    }
                }
            }
            if (uploaded > 0) {
                await window.refreshProptDrawerData();
                const sheetNote = registeredCount > 0
                    ? (' · Registrada(s) en Sheet (' + registeredCount + ' · ' + tipoChoice + ')')
                    : '';
                showProptFeedback('✅ ' + uploaded + ' foto(s) subida(s) a ' + destChoice + sheetNote + '.' + (lastErr ? (' · Aviso: ' + lastErr) : ''), true);
            } else {
                showProptFeedback(lastErr || (abortedForConfig ? 'Revisa la configuración de URL /exec y PROMPTS_PIN.' : 'No se pudo subir la imagen.'), false);
            }
        } finally {
            if (btn) btn.disabled = false;
            if (camBtn) camBtn.disabled = false;
        }
    };

    window.deleteProptFileById = async function (fileId) {
        const cleanId = String(fileId || '').trim();
        if (!isValidDriveId(cleanId)) return;
        const found = proptFilesCache.find((item) => item && item.id === cleanId);
        const label = (found && found.name) || cleanId;
        if (typeof window.confirm === 'function' && !window.confirm('¿Enviar a la papelera de Drive "' + label + '" (solo en SUBIR PROPT)?')) {
            return;
        }
        showProptFeedback('Eliminando ' + label + '...', true);
        try {
            const res = await callPromptsAppsScript('prompts_propt_delete', { fileId: cleanId });
            if (!res || !res.ok) {
                showProptFeedback((res && res.error) || 'No se pudo eliminar el archivo.', false);
                return;
            }
            const nextList = proptFilesCache.filter((item) => item && item.id !== cleanId);
            renderProptGallery(nextList);
            showProptFeedback('🗑 Archivo enviado a la papelera desde SUBIR PROPT.', true);
        } catch (err) {
            showProptFeedback((err && err.message) || 'Error al eliminar.', false);
        }
    };

    window.clearPromptsSkuSearch = function (opts) {
        lastSkuMatch = null;
        skuInputHadValue = false;
        const input = byId('proptSkuInput');
        const box = byId('proptSkuResult');
        if (input) {
            input.value = '';
            if ((!opts || opts.focus !== true) && typeof input.blur === 'function') {
                try { input.blur(); } catch (e) {}
            }
        }
        if (box) {
            box.classList.add('hidden');
            box.innerHTML = '';
        }
    };

    window.lookupPromptsSku = async function () {
        const input = byId('proptSkuInput');
        const box = byId('proptSkuResult');
        const query = String((input && input.value) || '').trim();
        if (!box) return;
        if (query.length < 3) {
            box.classList.remove('hidden');
            box.innerHTML = '<div class="propt-sku-meta">Escribe al menos 3 caracteres del SKU.</div>';
            syncPromptsBackDepth('propt_sku_search');
            return;
        }
        box.classList.remove('hidden');
        box.innerHTML = '<div class="propt-sku-meta">Consultando Base de Datos Generales...</div>';
        syncPromptsBackDepth('propt_sku_search');
        try {
            const res = await callPromptsAppsScript('prompts_sku_lookup', { sku: query });
            if (!res || !res.ok) {
                lastSkuMatch = null;
                box.innerHTML = '<div class="propt-sku-meta">' + escapeHtml((res && res.error) || 'No se pudo consultar el SKU.') + '</div>';
                return;
            }
            if (!res.found || !res.match) {
                lastSkuMatch = null;
                box.innerHTML = '<div class="propt-sku-meta">Sin coincidencias para <strong>' + escapeHtml(query) + '</strong> en DATOS GENERAL.</div>';
                return;
            }
            const m = res.match;
            lastSkuMatch = m;
            box.innerHTML =
                '<div class="propt-sku-result-head">' +
                    '<span class="propt-sku-code">' + escapeHtml(m.sku) + '</span>' +
                    '<button type="button" class="propt-mini-btn" onclick="copySkuLookupSummary()">📋 Copiar</button>' +
                '</div>' +
                '<div class="propt-sku-meta"><strong>Nombre:</strong> ' + escapeHtml(m.nombre || '—') + '</div>' +
                '<div class="propt-sku-meta"><strong>Tipo:</strong> ' + escapeHtml(m.tipo_mueble || '—') + '</div>' +
                '<div class="propt-sku-meta"><strong>Medidas:</strong> ' + escapeHtml(m.medidas || '—') + '</div>' +
                (m.foto_mueble_nom ? ('<div class="propt-sku-meta"><strong>Foto mueble:</strong> ' + escapeHtml(m.foto_mueble_nom) + '</div>') : '');
        } catch (err) {
            lastSkuMatch = null;
            box.innerHTML = '<div class="propt-sku-meta">' + escapeHtml((err && err.message) || 'Error al consultar SKU.') + '</div>';
        }
    };

    window.copySkuLookupSummary = async function () {
        if (!lastSkuMatch) return;
        const text = [
            'SKU: ' + (lastSkuMatch.sku || ''),
            lastSkuMatch.tipo_mueble ? ('Tipo: ' + lastSkuMatch.tipo_mueble) : '',
            lastSkuMatch.medidas ? ('Medidas: ' + lastSkuMatch.medidas) : '',
            lastSkuMatch.nombre ? ('Nombre: ' + lastSkuMatch.nombre) : ''
        ].filter(Boolean).join(' | ');
        let copied = false;
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(text);
                copied = true;
            } else if (document && typeof document.createElement === 'function' && typeof document.execCommand === 'function') {
                const ta = document.createElement('textarea');
                ta.value = text;
                ta.setAttribute('readonly', '');
                ta.style.position = 'fixed';
                ta.style.opacity = '0';
                document.body.appendChild(ta);
                ta.select();
                copied = Boolean(document.execCommand('copy'));
                document.body.removeChild(ta);
            }
        } catch (e) {
            copied = false;
        }
        if (copied) {
            showProptFeedback('📋 Datos del SKU copiados al portapapeles.', true);
        } else {
            showProptFeedback('No se pudo copiar automáticamente.', false);
        }
    };

    function ingestQueryScriptUrl() {
        try {
            const params = new URLSearchParams(window.location.search || '');
            if (!params.has('scriptUrl')) return;
            const qUrl = String(params.get('scriptUrl') || '').trim();

            // Retirar ?scriptUrl= de la barra de direcciones inmediatamente
            params.delete('scriptUrl');
            const cleanSearch = params.toString();
            const cleanLocation =
                (window.location.pathname || '') +
                (cleanSearch ? ('?' + cleanSearch) : '') +
                (window.location.hash || '');
            if (window.history && typeof window.history.replaceState === 'function') {
                window.history.replaceState(null, '', cleanLocation);
            }

            if (!qUrl || !isValidAppsScriptUrl(qUrl)) return;

            // Nunca sobrescribir localStorage silenciosamente: solo prellenar y exigir confirmación manual
            pendingSuggestedScriptUrl = qUrl;
            const cfg = getProptConfig();
            const urlEl = byId('proptScriptUrlInput');
            const pinEl = byId('proptPinInput');
            if (urlEl) urlEl.value = qUrl;
            if (pinEl && cfg.scriptUrl !== qUrl) {
                pinEl.value = '';
                pinInputManuallyEdited = false;
            }
            const box = byId('proptConfigBox');
            if (box) box.classList.remove('hidden');
            setProptConnPill('idle', 'Confirmar URL');
            showProptFeedback('URL detectada en el enlace. Verifica la URL, ingresa tu PROMPTS_PIN y haz clic en "Guardar y conectar" para confirmar.', false);
        } catch (e) {}
    }

    function registerPromptsServiceWorker() {
        try {
            if ('serviceWorker' in navigator && /^https?:$/i.test(window.location.protocol)) {
                navigator.serviceWorker
                    .register('./prompts-sw.js', { scope: './prompts' })
                    .catch(() => {});
            }
        } catch (e) {}
    }

    function fallbackSingleStepEscape() {
        if (!isElHidden('promptsInstallModal')) {
            window.closePromptsInstallModal();
            return;
        }
        if (proptDrawerOpen && !isElHidden('proptConfigBox') && isValidAppsScriptUrl(getProptConfig().scriptUrl) && !pendingSuggestedScriptUrl) {
            window.toggleProptConfigPanel(false);
            return;
        }
        if (
            proptDrawerOpen &&
            (Boolean(lastSkuMatch) || !isElHidden('proptSkuResult') || Boolean(String((byId('proptSkuInput') && byId('proptSkuInput').value) || '').trim()))
        ) {
            window.clearPromptsSkuSearch({ focus: false });
            return;
        }
        if (proptDrawerOpen || !isElHidden('proptDrawer')) {
            window.toggleProptDrawer(false);
        }
    }

    function initPromptsBackNav() {
        if (!window.CreataBackNav || typeof window.CreataBackNav.createController !== 'function') {
            return;
        }
        promptsBackNav = window.CreataBackNav.createController({
            appId: 'prompts',
            exitGuardMs: 2500,
            exitMessage: 'Presiona Atrás otra vez para salir',
            steps: [
                {
                    id: 'install_modal',
                    isActive: () => !isElHidden('promptsInstallModal'),
                    undo: () => { window.closePromptsInstallModal(); },
                    escapeAllowed: true
                },
                {
                    id: 'propt_config',
                    isActive: () => proptDrawerOpen && !isElHidden('proptConfigBox') && isValidAppsScriptUrl(getProptConfig().scriptUrl) && !pendingSuggestedScriptUrl,
                    undo: () => { window.toggleProptConfigPanel(false); },
                    escapeAllowed: true,
                    toast: 'Configuración cerrada'
                },
                {
                    id: 'propt_sku_search',
                    isActive: () => proptDrawerOpen && (Boolean(lastSkuMatch) || !isElHidden('proptSkuResult') || Boolean(String((byId('proptSkuInput') && byId('proptSkuInput').value) || '').trim())),
                    undo: () => { window.clearPromptsSkuSearch({ focus: false }); },
                    escapeAllowed: true,
                    toast: 'Consulta SKU limpiada'
                },
                {
                    id: 'propt_drawer',
                    isActive: () => proptDrawerOpen || !isElHidden('proptDrawer'),
                    undo: () => { window.toggleProptDrawer(false); },
                    escapeAllowed: true,
                    toast: 'Panel SUBIR PROPT cerrado'
                },
                {
                    id: 'collapsed_topbar',
                    isActive: () => Boolean(byId('promptsShell') && byId('promptsShell').classList.contains('is-bar-collapsed')),
                    undo: () => { window.togglePromptsTopbar(false); },
                    escapeAllowed: false,
                    toast: 'Barra superior restaurada'
                }
            ]
        });
        promptsBackNav.init();
        window.__CREATA_PROMPTS_BACK_NAV__ = promptsBackNav;
        window.handlePromptsBackAction = function (opts) {
            return promptsBackNav
                ? promptsBackNav.stepBackOnce(opts)
                : { handled: false, blocked: false, stepId: null, toast: '', source: 'manual' };
        };
    }

    const KEVIN_OWNER_EMAIL = 'kevin.reyna@grupoanipa.com';
    const KEVIN_SUITE_SESSION_KEYS = [
        'creata_private_kevin_panel_v1',
        'creata_inv_advisor_session_v1',
        'creata_private_kevin_fotos_v1',
        'creata_private_kevin_hist_v1'
    ];

    function hasActiveKevinOwnerSession() {
        try {
            if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('creata_inv_kevin_advisor_preview_v1') === '1') {
                return false;
            }
        } catch (e) {}
        for (let i = 0; i < KEVIN_SUITE_SESSION_KEYS.length; i++) {
            try {
                const raw = localStorage.getItem(KEVIN_SUITE_SESSION_KEYS[i]);
                if (!raw) continue;
                const obj = JSON.parse(raw);
                const email = String((obj && obj.correo) || '').trim().toLowerCase().replace(/,/g, '.');
                if (email === KEVIN_OWNER_EMAIL && !obj.mustChangeKey) {
                    return true;
                }
            } catch (e) {}
        }
        return false;
    }

    function syncKevinSuiteNavLinks() {
        const isEmbedded = !!(typeof window !== 'undefined' && window.parent && window.parent !== window);
        const showLinks = !isEmbedded && hasActiveKevinOwnerSession();
        const cotLink = byId('promptsKevinCotizadorLink');
        const fotosLink = byId('promptsKevinFotosLink');
        if (cotLink) cotLink.classList.toggle('hidden', !showLinks);
        if (fotosLink) fotosLink.classList.toggle('hidden', !showLinks);
    }

    window.syncPromptsKevinSuiteNav = syncKevinSuiteNavLinks;

    function initPromptsApp() {
        registerPromptsServiceWorker();
        syncProptConfigInputs();
        ingestQueryScriptUrl();
        initPromptsBackNav();
        syncKevinSuiteNavLinks();

        const pinEl = byId('proptPinInput');
        if (pinEl) {
            pinEl.addEventListener('input', () => {
                pinInputManuallyEdited = true;
            });
        }
        const urlEl = byId('proptScriptUrlInput');
        if (urlEl) {
            urlEl.addEventListener('input', () => {
                const cfg = getProptConfig();
                const currentVal = String(urlEl.value || '').trim();
                if (cfg.scriptUrl && currentVal !== cfg.scriptUrl && pinEl) {
                    pinEl.value = '';
                    pinInputManuallyEdited = false;
                }
            });
        }
        const destEl = byId('proptDestSelect');
        if (destEl) {
            syncProptTipoFromDest(destEl.value);
            destEl.addEventListener('change', () => {
                syncProptTipoFromDest(destEl.value);
            });
        }
        const skuEl = byId('proptSkuInput');
        if (skuEl) {
            skuInputHadValue = Boolean(String(skuEl.value || '').trim());
            skuEl.addEventListener('input', () => {
                const hasValue = Boolean(String(skuEl.value || '').trim());
                if (!skuInputHadValue && hasValue) {
                    syncPromptsBackDepth('propt_sku_search');
                }
                skuInputHadValue = hasValue;
            });
        }

        // Restaurar preferencia de barra colapsada
        try {
            const savedCollapsed = localStorage.getItem(BAR_COLLAPSED_KEY) === '1';
            if (savedCollapsed) applyCollapsedBarState(true);
        } catch (e) {}

        // Eventos PWA nativos (Android Chrome/Edge + PC Windows/Mac Chrome/Edge)
        window.addEventListener('beforeinstallprompt', (ev) => {
            ev.preventDefault();
            deferredInstallPrompt = ev;
            syncInstallControls();
        });

        window.addEventListener('appinstalled', () => {
            deferredInstallPrompt = null;
            syncInstallControls();
            window.closePromptsInstallModal();
        });

        window.addEventListener('storage', syncKevinSuiteNavLinks);
        window.addEventListener('focus', syncKevinSuiteNavLinks);

        // Estado de red
        window.addEventListener('offline', () => {
            frameLoaded = false;
            showLoadingOverlay(true);
        });

        window.addEventListener('online', () => {
            if (!frameLoaded) {
                loadGeneratorFrame(false);
            } else {
                setConnectionStatus('online', 'En línea');
            }
        });

        // Tecla Escape para cerrar solo 1 capa superior a la vez
        document.addEventListener('keydown', (ev) => {
            if (ev.key === 'Escape') {
                if (promptsBackNav) {
                    promptsBackNav.handleEscape();
                } else {
                    fallbackSingleStepEscape();
                }
            }
        });

        // Seguimiento de carga del iframe
        const frame = byId('promptsAppFrame');
        if (frame) {
            frame.addEventListener('load', onGeneratorFrameLoad);
            frame.addEventListener('error', onGeneratorFrameError);
        }

        syncInstallControls();
        loadGeneratorFrame(false);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initPromptsApp);
    } else {
        initPromptsApp();
    }
})();
