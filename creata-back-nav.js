/* ==========================================================================
   CREATA · Shared Phone Back-Button Navigation Engine (creata-back-nav.js)
   - Zero-dependency vanilla JS IIFE (browser + node:vm testable)
   - Chrome 124+ History Manipulation Intervention compatible (single push per gesture)
   - Live-state priority unwind + clean-root double-back exit guard + safe-area toast
   - Auto-disabled for history/popstate inside embedded iframes (?embed=1 / parent !== window)
   ========================================================================== */
(function () {
    'use strict';

    const ENGINE_VERSION = '1.1.0';
    const DEFAULT_STYLE_ID = 'creata-back-nav-style';
    const ZOOM_LOCK_STYLE_ID = 'creata-zoom-lock-style';
    const DEFAULT_TOAST_ID = 'creataBackNavToast';
    const DEFAULT_EXIT_MESSAGE = 'Presiona Atrás otra vez para salir';
    const DEFAULT_MAX_DEPTH = 12;
    const DEFAULT_EXIT_GUARD_MS = 2500;
    const DEFAULT_SAME_GESTURE_MS = 80;

    const _toastTimers = new Map();

    function getGlobalWindow(customWin) {
        if (customWin) return customWin;
        if (typeof window !== 'undefined') return window;
        return null;
    }

    function getGlobalDocument(customDoc, customWin) {
        if (customDoc) return customDoc;
        if (customWin && customWin.document) return customWin.document;
        if (typeof document !== 'undefined') return document;
        return null;
    }

    function ensureToastStyle(doc) {
        if (!doc || typeof doc.getElementById !== 'function' || typeof doc.createElement !== 'function') return;
        if (doc.getElementById(DEFAULT_STYLE_ID)) return;
        const styleEl = doc.createElement('style');
        styleEl.id = DEFAULT_STYLE_ID;
        styleEl.textContent = [
            '.creata-back-toast {',
            '  position: fixed;',
            '  left: 50%;',
            '  bottom: var(--creata-back-toast-bottom, calc(18px + env(safe-area-inset-bottom, 0px)));',
            '  transform: translateX(-50%) translateY(10px);',
            '  z-index: 2147483000;',
            '  max-width: min(calc(100vw - 32px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px)), 380px);',
            '  padding: 10px 16px;',
            '  border-radius: 999px;',
            '  background: rgba(15, 23, 42, 0.95);',
            '  color: #F8FAFC;',
            '  border: 1px solid rgba(204, 166, 107, 0.55);',
            '  font: 700 13px/1.3 "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;',
            '  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.45);',
            '  backdrop-filter: blur(8px);',
            '  -webkit-backdrop-filter: blur(8px);',
            '  pointer-events: none;',
            '  user-select: none;',
            '  -webkit-user-select: none;',
            '  text-align: center;',
            '  opacity: 0;',
            '  transition: opacity 0.18s ease, transform 0.18s ease;',
            '}',
            '.creata-back-toast.is-visible {',
            '  opacity: 1;',
            '  transform: translateX(-50%) translateY(0);',
            '}',
            '.creata-back-toast.hidden {',
            '  display: none !important;',
            '}',
            '@media print {',
            '  .creata-back-toast {',
            '    display: none !important;',
            '  }',
            '}'
        ].join('\n');

        const host = doc.head || doc.documentElement || doc.body;
        if (host && typeof host.appendChild === 'function') {
            host.appendChild(styleEl);
        }
    }

    function ensureToastElement(doc, toastId) {
        if (!doc || typeof doc.getElementById !== 'function') return null;
        const id = String(toastId || DEFAULT_TOAST_ID);
        ensureToastStyle(doc);
        let el = doc.getElementById(id);
        if (!el && typeof doc.createElement === 'function' && doc.body && typeof doc.body.appendChild === 'function') {
            el = doc.createElement('div');
            el.id = id;
            el.className = 'creata-back-toast hidden';
            if (typeof el.setAttribute === 'function') {
                el.setAttribute('role', 'status');
                el.setAttribute('aria-live', 'polite');
            }
            doc.body.appendChild(el);
        }
        return el;
    }

    function hideToast(opts) {
        const cfg = opts || {};
        const win = getGlobalWindow(cfg.win);
        const doc = getGlobalDocument(cfg.doc, win);
        const id = String(cfg.toastId || DEFAULT_TOAST_ID);
        const clearTimerFn = typeof cfg.clearTimer === 'function'
            ? cfg.clearTimer
            : (tid) => (win && typeof win.clearTimeout === 'function' ? win.clearTimeout(tid) : clearTimeout(tid));

        if (_toastTimers.has(id)) {
            try { clearTimerFn(_toastTimers.get(id)); } catch (e) {}
            _toastTimers.delete(id);
        }

        if (!doc || typeof doc.getElementById !== 'function') return;
        const el = doc.getElementById(id);
        if (!el) return;
        if (el.classList) {
            el.classList.remove('is-visible');
            el.classList.add('hidden');
        }
    }

    function showToast(message, opts) {
        const text = message === null || message === undefined ? '' : String(message).trim();
        if (!text) return null;
        const cfg = opts || {};
        const win = getGlobalWindow(cfg.win);
        const doc = getGlobalDocument(cfg.doc, win);
        const id = String(cfg.toastId || DEFAULT_TOAST_ID);
        const durationMs = typeof cfg.durationMs === 'number' && cfg.durationMs > 0 ? cfg.durationMs : 1900;
        const setTimerFn = typeof cfg.setTimer === 'function'
            ? cfg.setTimer
            : (fn, ms) => (win && typeof win.setTimeout === 'function' ? win.setTimeout(fn, ms) : setTimeout(fn, ms));
        const clearTimerFn = typeof cfg.clearTimer === 'function'
            ? cfg.clearTimer
            : (tid) => (win && typeof win.clearTimeout === 'function' ? win.clearTimeout(tid) : clearTimeout(tid));

        const el = ensureToastElement(doc, id);
        if (!el) return null;

        if (_toastTimers.has(id)) {
            try { clearTimerFn(_toastTimers.get(id)); } catch (e) {}
            _toastTimers.delete(id);
        }

        el.textContent = text;
        if (el.classList) {
            el.classList.remove('hidden');
            el.classList.add('is-visible');
        }

        if (durationMs > 0 && Number.isFinite(durationMs)) {
            const tid = setTimerFn(() => {
                _toastTimers.delete(id);
                hideToast({ doc, win, toastId: id, clearTimer: clearTimerFn });
            }, durationMs);
            _toastTimers.set(id, tid);
        }
        return el;
    }

    function replaceIframeUrl(frameEl, url, opts) {
        if (!frameEl || !url) return frameEl || null;
        const cfg = opts || {};
        const targetUrl = String(url);
        const forceReload = Boolean(cfg.forceReload);

        let sameOriginReplaceable = false;
        let currentHref = '';
        try {
            if (frameEl.contentWindow && frameEl.contentWindow.location) {
                currentHref = String(frameEl.contentWindow.location.href || '');
                if (typeof frameEl.contentWindow.location.replace === 'function') {
                    const winOrigin = (typeof window !== 'undefined' && window.location && window.location.origin) || '';
                    if (!currentHref || currentHref === 'about:blank' || (winOrigin && currentHref.indexOf(winOrigin) === 0)) {
                        sameOriginReplaceable = true;
                    }
                }
            }
        } catch (eCrossOrigin) {
            sameOriginReplaceable = false;
        }

        if (forceReload && !sameOriginReplaceable) {
            try {
                if (
                    frameEl.parentNode &&
                    typeof frameEl.cloneNode === 'function' &&
                    typeof frameEl.parentNode.replaceChild === 'function'
                ) {
                    const cloned = frameEl.cloneNode(false);
                    if (typeof cfg.onLoad === 'function' && typeof cloned.addEventListener === 'function') {
                        cloned.addEventListener('load', cfg.onLoad);
                    }
                    if (typeof cfg.onError === 'function' && typeof cloned.addEventListener === 'function') {
                        cloned.addEventListener('error', cfg.onError);
                    }
                    if (typeof cloned.setAttribute === 'function') {
                        cloned.setAttribute('src', targetUrl);
                    } else {
                        cloned.src = targetUrl;
                    }
                    frameEl.parentNode.replaceChild(cloned, frameEl);
                    return cloned;
                }
            } catch (eSwap) {}
        }

        if (sameOriginReplaceable) {
            try {
                frameEl.contentWindow.location.replace(targetUrl);
                return frameEl;
            } catch (eReplace) {}
        }

        try {
            if (typeof frameEl.setAttribute === 'function') {
                frameEl.setAttribute('src', targetUrl);
            }
        } catch (eAttr) {}
        try {
            frameEl.src = targetUrl;
        } catch (eSrc) {}

        return frameEl;
    }

    function createCreataBackNavController(config) {
        const cfg = config || {};
        const appId = String(cfg.appId || 'creata_app');
        const maxDepth = Math.max(1, Math.floor(Number(cfg.maxDepth) || DEFAULT_MAX_DEPTH));
        const exitGuardMs = Math.max(200, Math.floor(Number(cfg.exitGuardMs) || DEFAULT_EXIT_GUARD_MS));
        const exitMessage = String(cfg.exitMessage || DEFAULT_EXIT_MESSAGE);
        const toastId = String(cfg.toastId || DEFAULT_TOAST_ID);
        const sameGestureWindowMs = typeof cfg.sameGestureWindowMs === 'number' && cfg.sameGestureWindowMs >= 0
            ? cfg.sameGestureWindowMs
            : DEFAULT_SAME_GESTURE_MS;
        const steps = Array.isArray(cfg.steps) ? cfg.steps.slice() : [];

        const win = getGlobalWindow(cfg.win);
        const doc = getGlobalDocument(cfg.doc, win);
        const hist = cfg.history || (win && win.history) || null;
        const loc = cfg.location || (win && win.location) || null;
        const now = typeof cfg.now === 'function' ? cfg.now : () => Date.now();
        const setTimer = typeof cfg.setTimer === 'function'
            ? cfg.setTimer
            : (fn, ms) => (win && typeof win.setTimeout === 'function' ? win.setTimeout(fn, ms) : setTimeout(fn, ms));
        const clearTimer = typeof cfg.clearTimer === 'function'
            ? cfg.clearTimer
            : (tid) => (win && typeof win.clearTimeout === 'function' ? win.clearTimeout(tid) : clearTimeout(tid));

        const isEnabled = typeof cfg.isEnabled === 'function' ? cfg.isEnabled : () => true;
        const isEmbedded = typeof cfg.isEmbedded === 'function'
            ? cfg.isEmbedded
            : (typeof cfg.isEmbedded === 'boolean'
                ? () => cfg.isEmbedded
                : () => {
                    try {
                        if (win && win.parent && win.parent !== win) return true;
                    } catch (e) {
                        return true;
                    }
                    try {
                        const s = (loc && loc.search) || '';
                        if (/(?:^|[?&])embed=1(?:&|$)/.test(s)) return true;
                    } catch (e) {}
                    return false;
                });

        const onShowToast = typeof cfg.onShowToast === 'function' ? cfg.onShowToast : null;
        const onHideToast = typeof cfg.onHideToast === 'function' ? cfg.onHideToast : null;
        const onStep = typeof cfg.onStep === 'function' ? cfg.onStep : null;

        const sid = appId + '_' + String(now()) + '_' + Math.random().toString(36).slice(2, 8);

        let initialized = false;
        let destroyed = false;
        let currentDepth = 0;
        let lastPushAt = -Infinity;
        let exitArmedUntil = 0;
        let exitTimerId = null;
        let isHandlingPopstate = false;
        let suppressTargetDepth = null;

        function getSameUrl() {
            if (!loc) return '';
            const p = loc.pathname || '';
            const s = loc.search || '';
            const h = loc.hash || '';
            return p + s + h;
        }

        function makeState(depth) {
            return {
                __creataBackNav: true,
                appId: appId,
                sid: sid,
                depth: depth
            };
        }

        function emitShowToast(message, durationMs) {
            const msg = message === null || message === undefined ? '' : String(message).trim();
            if (!msg) return;
            if (onShowToast) {
                try { onShowToast(msg, durationMs); } catch (e) {}
            } else {
                showToast(msg, {
                    doc: doc,
                    win: win,
                    toastId: toastId,
                    durationMs: durationMs,
                    setTimer: setTimer,
                    clearTimer: clearTimer
                });
            }
        }

        function emitHideToast() {
            if (onHideToast) {
                try { onHideToast(); } catch (e) {}
            } else {
                hideToast({
                    doc: doc,
                    win: win,
                    toastId: toastId,
                    clearTimer: clearTimer
                });
            }
        }

        function clearExitGuard(alsoHideToast) {
            exitArmedUntil = 0;
            if (exitTimerId !== null) {
                try { clearTimer(exitTimerId); } catch (e) {}
                exitTimerId = null;
            }
            if (alsoHideToast) {
                emitHideToast();
            }
        }

        function computeTotalActiveWeight() {
            let total = 0;
            for (let i = 0; i < steps.length; i++) {
                const step = steps[i];
                if (!step || typeof step.isActive !== 'function') continue;
                let active = false;
                try { active = Boolean(step.isActive()); } catch (e) { active = false; }
                if (!active) continue;
                let w = 1;
                if (typeof step.depthWeight === 'function') {
                    try { w = Number(step.depthWeight()); } catch (e) { w = 1; }
                } else if (step.depthWeight !== undefined) {
                    w = Number(step.depthWeight);
                }
                if (!Number.isFinite(w) || w < 1) w = 1;
                total += Math.floor(w);
            }
            return total;
        }

        function computeTargetDepth() {
            const totalWeight = computeTotalActiveWeight();
            return Math.min(maxDepth, Math.max(1, totalWeight + 1));
        }

        function pushOneDepthEntry(fromUserGesture) {
            if (!hist || typeof hist.pushState !== 'function') return false;
            if (currentDepth >= maxDepth) return false;
            const nextDepth = currentDepth + 1;
            try {
                hist.pushState(makeState(nextDepth), '', getSameUrl());
                currentDepth = nextDepth;
                if (fromUserGesture) {
                    lastPushAt = now();
                }
                return true;
            } catch (e) {
                return false;
            }
        }

        function resolveStepToast(step) {
            if (!step || step.toast === undefined || step.toast === null) return '';
            if (typeof step.toast === 'function') {
                try { return String(step.toast() || ''); } catch (e) { return ''; }
            }
            return String(step.toast || '');
        }

        function syncDepthOnUserAction(_reason) {
            if (destroyed || isHandlingPopstate) return false;
            if (isEmbedded() || !isEnabled()) return false;
            if (exitArmedUntil > 0) {
                clearExitGuard(true);
            }
            const currentTs = now();
            if (sameGestureWindowMs > 0 && (currentTs - lastPushAt) < sameGestureWindowMs) {
                return false;
            }
            const targetDepth = computeTargetDepth();
            if (currentDepth < targetDepth) {
                return pushOneDepthEntry(true);
            }
            return false;
        }

        function armOnUserGesture(ev) {
            if (destroyed || isHandlingPopstate) return false;
            if (ev && ev.type === 'keydown' && ev.key === 'Escape') return false;
            if (isEmbedded() || !isEnabled()) return false;
            const currentTs = now();
            if (sameGestureWindowMs > 0 && (currentTs - lastPushAt) < sameGestureWindowMs) {
                return false;
            }
            if (exitArmedUntil > 0) {
                clearExitGuard(true);
            }
            const targetDepth = computeTargetDepth();
            if (currentDepth < targetDepth) {
                return pushOneDepthEntry(true);
            }
            return false;
        }

        function stepBackOnce(opts) {
            const options = opts || {};
            const source = options.source || 'manual';
            const escapeOnly = Boolean(options.escapeOnly);
            const silent = Boolean(options.silent);

            for (let i = 0; i < steps.length; i++) {
                const step = steps[i];
                if (!step || typeof step.isActive !== 'function') continue;
                if (escapeOnly && step.escapeAllowed === false) continue;

                let active = false;
                try { active = Boolean(step.isActive()); } catch (e) { active = false; }
                if (!active) continue;

                let raw;
                try {
                    raw = typeof step.undo === 'function'
                        ? step.undo({ source: source, stepId: step.id, depth: currentDepth })
                        : undefined;
                } catch (e) {
                    raw = undefined;
                }

                if (raw === false) continue;

                let handled = true;
                let blocked = false;
                let toast = resolveStepToast(step);

                if (raw && typeof raw === 'object') {
                    if (raw.handled === false && !raw.blocked) continue;
                    handled = raw.handled !== false;
                    blocked = Boolean(raw.blocked);
                    if (raw.toast !== undefined) {
                        toast = raw.toast ? String(raw.toast) : '';
                    }
                }

                if (handled || blocked) {
                    clearExitGuard(false);
                    const result = {
                        handled: true,
                        blocked: blocked,
                        stepId: step.id || ('step_' + i),
                        toast: toast,
                        source: source
                    };
                    if (!silent && toast) {
                        emitShowToast(toast, 1800);
                    }
                    if (onStep) {
                        try { onStep(result); } catch (e) {}
                    }
                    return result;
                }
            }

            return {
                handled: false,
                blocked: false,
                stepId: null,
                toast: '',
                source: source
            };
        }

        function handleEscape() {
            if (destroyed || !isEnabled()) {
                return { handled: false, blocked: false, stepId: null, toast: '', source: 'escape' };
            }
            return stepBackOnce({ source: 'escape', escapeOnly: true });
        }

        function resetToBase() {
            clearExitGuard(true);
            if (destroyed || isEmbedded()) return;
            if (currentDepth > 0 && hist && typeof hist.go === 'function') {
                const delta = -currentDepth;
                suppressTargetDepth = 0;
                try {
                    hist.go(delta);
                } catch (e) {
                    suppressTargetDepth = null;
                    currentDepth = 0;
                }
            }
        }

        function onPopState(ev) {
            if (destroyed) return;

            const st = ev && ev.state;
            let incomingDepth = 0;
            if (st && st.__creataBackNav && st.sid === sid && typeof st.depth === 'number') {
                incomingDepth = st.depth;
            } else {
                incomingDepth = 0;
            }

            if (suppressTargetDepth !== null && incomingDepth === suppressTargetDepth) {
                suppressTargetDepth = null;
                currentDepth = incomingDepth;
                return;
            }

            if (isHandlingPopstate) return;
            isHandlingPopstate = true;
            try {
                // Ignore Forward browser navigation and cancel any armed exit guard.
                // Keep suppressTargetDepth intact so a queued programmatic collapse is still suppressed.
                if (incomingDepth > currentDepth) {
                    clearExitGuard(true);
                    currentDepth = incomingDepth;
                    return;
                }

                // Do not leave suppressTargetDepth stuck if user navigated past the target depth
                if (suppressTargetDepth !== null && incomingDepth < suppressTargetDepth) {
                    suppressTargetDepth = null;
                }

                currentDepth = incomingDepth;

                if (!isEnabled()) {
                    clearExitGuard(true);
                    return;
                }

                const res = stepBackOnce({ source: 'popstate', silent: true });

                if (res.handled) {
                    clearExitGuard(false);
                    if (res.toast) {
                        emitShowToast(res.toast, 1800);
                    }
                    // Only re-push a 1-depth guard if we landed at base (0).
                    // Multi-step depth > 0 unwinds NEVER push inside popstate (Chrome 124+ safe).
                    if (currentDepth === 0) {
                        pushOneDepthEntry();
                    }
                    return;
                }

                // Clean root (no active undo steps)
                const currentTs = now();
                if (exitArmedUntil > 0 && currentTs <= exitArmedUntil) {
                    clearExitGuard(true);
                    if (hist) {
                        if (currentDepth > 0 && typeof hist.go === 'function') {
                            hist.go(-(currentDepth + 1));
                        } else if (typeof hist.back === 'function') {
                            hist.back();
                        }
                    }
                    return;
                }

                // First Back at clean root (or previous exit guard expired)
                clearExitGuard(false);
                exitArmedUntil = currentTs + exitGuardMs;
                emitShowToast(exitMessage, exitGuardMs);
                exitTimerId = setTimer(() => {
                    exitTimerId = null;
                    exitArmedUntil = 0;
                    emitHideToast();
                }, exitGuardMs);

                if (currentDepth > 1 && hist && typeof hist.go === 'function') {
                    const collapseDelta = -(currentDepth - 1);
                    suppressTargetDepth = 1;
                    try {
                        hist.go(collapseDelta);
                    } catch (e) {
                        suppressTargetDepth = null;
                    }
                } else if (currentDepth === 0) {
                    pushOneDepthEntry();
                }
            } finally {
                isHandlingPopstate = false;
            }
        }

        function init() {
            if (initialized || destroyed) return controller;
            initialized = true;

            if (isEmbedded()) {
                return controller;
            }

            if (hist && typeof hist.replaceState === 'function') {
                try {
                    hist.replaceState(makeState(0), '', getSameUrl());
                    currentDepth = 0;
                } catch (e) {}
            }

            if (win && typeof win.addEventListener === 'function') {
                win.addEventListener('popstate', onPopState);
            }
            if (doc && typeof doc.addEventListener === 'function') {
                doc.addEventListener('click', armOnUserGesture, false);
                doc.addEventListener('keydown', armOnUserGesture, false);
            }

            return controller;
        }

        function destroy() {
            if (destroyed) return;
            destroyed = true;
            clearExitGuard(true);
            if (!isEmbedded()) {
                if (win && typeof win.removeEventListener === 'function') {
                    win.removeEventListener('popstate', onPopState);
                }
                if (doc && typeof doc.removeEventListener === 'function') {
                    doc.removeEventListener('click', armOnUserGesture, false);
                    doc.removeEventListener('keydown', armOnUserGesture, false);
                }
            }
        }

        function getDebugState() {
            const activeStepIds = [];
            for (let i = 0; i < steps.length; i++) {
                const step = steps[i];
                if (!step || typeof step.isActive !== 'function') continue;
                try {
                    if (step.isActive()) activeStepIds.push(step.id || ('step_' + i));
                } catch (e) {}
            }
            return {
                version: ENGINE_VERSION,
                appId: appId,
                sid: sid,
                initialized: initialized,
                destroyed: destroyed,
                embedded: isEmbedded(),
                enabled: isEnabled(),
                currentDepth: currentDepth,
                maxDepth: maxDepth,
                exitArmedUntil: exitArmedUntil,
                activeStepIds: activeStepIds,
                totalActiveWeight: computeTotalActiveWeight()
            };
        }

        const controller = {
            init: init,
            syncDepthOnUserAction: syncDepthOnUserAction,
            pushStateStep: syncDepthOnUserAction,
            armOnUserGesture: armOnUserGesture,
            stepBackOnce: stepBackOnce,
            handleEscape: handleEscape,
            resetToBase: resetToBase,
            getDebugState: getDebugState,
            destroy: destroy
        };

        return controller;
    }

    function installZoomLock(opts) {
        const cfg = opts || {};
        const win = getGlobalWindow(cfg.win);
        const doc = getGlobalDocument(cfg.doc, win);
        if (!win || !doc) return false;

        try {
            let meta = typeof doc.querySelector === 'function' ? doc.querySelector('meta[name="viewport"]') : null;
            if (!meta && typeof doc.createElement === 'function') {
                const headHost = doc.head || doc.documentElement;
                if (headHost && typeof headHost.appendChild === 'function') {
                    meta = doc.createElement('meta');
                    if (typeof meta.setAttribute === 'function') {
                        meta.setAttribute('name', 'viewport');
                    } else {
                        meta.name = 'viewport';
                    }
                    headHost.appendChild(meta);
                }
            }
            if (meta && typeof meta.setAttribute === 'function') {
                const existing = typeof meta.getAttribute === 'function' ? String(meta.getAttribute('content') || '') : '';
                const hasInteractiveWidget = /\binteractive-widget\s*=\s*resizes-content\b/i.test(existing);
                const lockedContent = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no, viewport-fit=cover'
                    + (hasInteractiveWidget ? ', interactive-widget=resizes-content' : '');
                meta.setAttribute('content', lockedContent);
            }
        } catch (eMeta) {}

        try {
            if (typeof doc.getElementById === 'function' && typeof doc.createElement === 'function' && !doc.getElementById(ZOOM_LOCK_STYLE_ID)) {
                const styleEl = doc.createElement('style');
                styleEl.id = ZOOM_LOCK_STYLE_ID;
                styleEl.textContent = 'html, body { touch-action: pan-x pan-y; -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }';
                const host = doc.head || doc.documentElement || doc.body;
                if (host && typeof host.appendChild === 'function') {
                    host.appendChild(styleEl);
                }
            }
        } catch (eStyle) {}

        if (win.__creataZoomLockInstalled) return true;
        win.__creataZoomLockInstalled = true;

        if (typeof doc.addEventListener === 'function') {
            const preventGesture = function (e) {
                if (e && typeof e.preventDefault === 'function') e.preventDefault();
            };
            const preventMultiTouch = function (e) {
                if (e && e.touches && e.touches.length > 1 && typeof e.preventDefault === 'function') {
                    e.preventDefault();
                }
            };
            const preventCtrlWheel = function (e) {
                if (e && (e.ctrlKey || e.metaKey) && typeof e.preventDefault === 'function') {
                    e.preventDefault();
                }
            };
            const ZOOM_KEYS = { '+': true, '=': true, '-': true, '_': true, '0': true, Add: true, Subtract: true };
            const preventZoomKey = function (e) {
                if (e && (e.ctrlKey || e.metaKey) && ZOOM_KEYS[String(e.key || '')] && typeof e.preventDefault === 'function') {
                    e.preventDefault();
                }
            };
            try {
                doc.addEventListener('gesturestart', preventGesture, { passive: false });
                doc.addEventListener('gesturechange', preventGesture, { passive: false });
                doc.addEventListener('gestureend', preventGesture, { passive: false });
                doc.addEventListener('touchstart', preventMultiTouch, { passive: false });
                doc.addEventListener('touchmove', preventMultiTouch, { passive: false });
                doc.addEventListener('wheel', preventCtrlWheel, { passive: false });
                doc.addEventListener('keydown', preventZoomKey, { passive: false });
            } catch (eListen) {}
        }

        return true;
    }

    const api = Object.freeze({
        version: ENGINE_VERSION,
        createController: createCreataBackNavController,
        showToast: showToast,
        hideToast: hideToast,
        replaceIframeUrl: replaceIframeUrl,
        installZoomLock: installZoomLock
    });

    if (typeof window !== 'undefined') {
        window.createCreataBackNavController = createCreataBackNavController;
        window.CreataBackNav = api;
        if (typeof document !== 'undefined') {
            installZoomLock({ win: window, doc: document });
        }
    }
})();
