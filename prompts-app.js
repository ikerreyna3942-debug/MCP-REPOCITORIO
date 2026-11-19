(function () {
    'use strict';

    const RENDER_ORIGIN = 'https://buena-espero.onrender.com';
    const RENDER_EMBED_URL = RENDER_ORIGIN + '/?embed=true&embed_options=dark_theme';
    const RENDER_DIRECT_URL = RENDER_ORIGIN + '/';
    const RENDER_HEALTH_URL = RENDER_ORIGIN + '/_stcore/health';
    const BAR_COLLAPSED_KEY = 'creata_prompts_bar_collapsed_v1';

    let deferredInstallPrompt = null;
    let frameLoaded = false;
    let loadStartedAt = 0;
    let loadTimerInterval = null;
    let wakeProbeDone = false;

    function byId(id) {
        return document.getElementById(id);
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
        frame.src = targetUrl;
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
        applyCollapsedBarState(!!collapse);
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

    function registerPromptsServiceWorker() {
        try {
            if ('serviceWorker' in navigator && /^https?:$/i.test(window.location.protocol)) {
                navigator.serviceWorker
                    .register('./prompts-sw.js', { scope: './prompts' })
                    .catch(() => {});
            }
        } catch (e) {}
    }

    function initPromptsApp() {
        registerPromptsServiceWorker();

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

        // Tecla Escape para cerrar modal
        document.addEventListener('keydown', (ev) => {
            if (ev.key === 'Escape') {
                window.closePromptsInstallModal();
            }
        });

        // Seguimiento de carga del iframe
        const frame = byId('promptsAppFrame');
        if (frame) {
            frame.addEventListener('load', () => {
                if (!frame.src || frame.src === 'about:blank') return;
                frameLoaded = true;
                setConnectionStatus('online', 'En línea');
                hideLoadingOverlay();
            });
            frame.addEventListener('error', () => {
                frameLoaded = false;
                showLoadingOverlay(navigator.onLine === false);
            });
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
