/*
 * CREATA · Panel Suite Kevin — Service Worker exclusivo para panel.html
 * - Registrado con scope './panel' => nunca controla index.html, admin.html,
 *   inventario.html, fotos-productos.html ni prompts.html.
 * - Habilita instalación nativa como PWA en Android, iOS, Windows y Mac.
 * - Cachea el shell local con estrategia "red primero" y deja pasar intacto el
 *   tráfico hacia script.google.com y *.onrender.com.
 */
const CACHE_PREFIX = 'creata-panel-app-';
const CACHE_NAME = CACHE_PREFIX + 'v3';
const PAGE_URL = './panel.html';
const NETWORK_TIMEOUT_MS = 7000;

const SHELL_ASSETS = [
    './panel.html',
    './panel-styles.css?v=6',
    './creata-logo.js?v=32',
    './creata-cloud.js?v=32',
    './creata-back-nav.js?v=1',
    './panel-app.js?v=11',
    './panel-manifest.json?v=1',
    './inventario-icon-192.png',
    './inventario-icon-512.png',
    './inventario-apple-icon.png'
];

function isCacheableHost(url) {
    return url.origin === self.location.origin ||
        url.hostname === 'fonts.googleapis.com' ||
        url.hostname === 'fonts.gstatic.com';
}

async function precachePanelShell() {
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
        precachePanelShell()
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
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(request, { signal: controller.signal });
    } finally {
        clearTimeout(timer);
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

    if (req.mode === 'navigate' || url.pathname.endsWith('/panel.html')) {
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
