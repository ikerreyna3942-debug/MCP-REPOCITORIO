/*
 * CREATA · Suite 3 en 1 — Service Worker independiente (scope './' dentro de /suite/)
 * - Controla exclusivamente /suite/ => nunca interfiere con index.html, admin.html,
 *   inventario.html, fotos-productos.html, prompts.html ni panel.html.
 * - Habilita instalación nativa 100% independiente (sin barra de URL superior) en
 *   Android, iOS, Windows y Mac.
 */
const CACHE_PREFIX = 'creata-suite-app-';
const CACHE_NAME = CACHE_PREFIX + 'v1';
const PAGE_URL = './index.html';
const NETWORK_TIMEOUT_MS = 7000;

const SHELL_ASSETS = [
    './',
    './index.html',
    './manifest.json?v=1',
    './icon-192.png',
    './icon-512.png',
    './apple-icon.png',
    '../panel-styles.css?v=6',
    '../creata-logo.js?v=32',
    '../creata-cloud.js?v=32',
    '../creata-back-nav.js?v=1',
    '../panel-app.js?v=11'
];

function isCacheableHost(url) {
    return url.origin === self.location.origin ||
        url.hostname === 'fonts.googleapis.com' ||
        url.hostname === 'fonts.gstatic.com';
}

async function precacheSuiteShell() {
    const cache = await caches.open(CACHE_NAME);
    const urls = new Set(SHELL_ASSETS.map((p) => new URL(p, self.location.href).href));

    try {
        const pageRes = await fetch(PAGE_URL, { cache: 'reload' });
        if (pageRes && pageRes.ok) {
            await cache.put(PAGE_URL, pageRes.clone());
            const html = await pageRes.text();
            const re = /<(?:script|link)\b[^>]*?(?:src|href)\s*=\s*["']([^"']+)["']/gi;
            let m;
            while ((m = re.exec(html)) !== null) {
                try {
                    const u = new URL(m[1], self.location.href);
                    if (!/^https?:$/.test(u.protocol) || !isCacheableHost(u)) continue;
                    if (u.origin === self.location.origin && !/\.(?:js|css|json|png|svg|webp)$/i.test(u.pathname)) continue;
                    urls.add(u.href);
                } catch (e) {}
            }
        }
    } catch (e) {}

    await Promise.all(Array.from(urls).map(async (href) => {
        try {
            const sameOrigin = new URL(href).origin === self.location.origin;
            const req = new Request(href, sameOrigin ? { cache: 'reload' } : { mode: 'no-cors' });
            const res = await fetch(req);
            if (res && (res.ok || res.type === 'opaque')) {
                await cache.put(href, res);
            }
        } catch (e) {}
    }));
}

self.addEventListener('install', (event) => {
    event.waitUntil(
        precacheSuiteShell()
            .catch(() => {})
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(
            keys
                .filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME)
                .map((k) => caches.delete(k))
        );
        await self.clients.claim();
    })());
});

async function fetchWithTimeout(request, timeoutMs) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
        return await fetch(request, controller ? { signal: controller.signal } : undefined);
    } finally {
        if (timer) clearTimeout(timer);
    }
}

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (!req || req.method !== 'GET') return;

    let url;
    try {
        url = new URL(req.url);
    } catch (e) {
        return;
    }

    if (!isCacheableHost(url)) return;

    if (req.mode === 'navigate' || /\/suite\/(?:index\.html)?$/i.test(url.pathname)) {
        event.respondWith((async () => {
            const cache = await caches.open(CACHE_NAME);
            try {
                const netRes = await fetchWithTimeout(req, NETWORK_TIMEOUT_MS);
                if (netRes && netRes.ok) {
                    cache.put(PAGE_URL, netRes.clone()).catch(() => {});
                    return netRes;
                }
            } catch (e) {}
            const cached =
                (await cache.match(req, { ignoreSearch: true })) ||
                (await cache.match(PAGE_URL));
            return cached || Response.error();
        })());
        return;
    }

    event.respondWith((async () => {
        const cache = await caches.open(CACHE_NAME);
        try {
            const netRes = await fetchWithTimeout(req, NETWORK_TIMEOUT_MS);
            if (netRes && (netRes.ok || netRes.type === 'opaque')) {
                cache.put(req, netRes.clone()).catch(() => {});
                return netRes;
            }
        } catch (e) {}
        const cached =
            (await cache.match(req)) ||
            (await cache.match(req, { ignoreSearch: true }));
        return cached || Response.error();
    })());
});
