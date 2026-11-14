/*
 * CREATA · Inventario en Vivo — Service Worker SOLO para inventario.html
 * - Registrado con scope './inventario' => no controla index.html (Catálogo) ni admin.html.
 * - Estrategia "red primero": con internet siempre se usa la versión más reciente;
 *   sin internet se abre la última copia guardada de la página y sus scripts.
 * - Google Sheets / Apps Script / Drive / S Mueblería NO pasan por aquí (siempre directo, en vivo).
 */
const CACHE_PREFIX = 'creata-inventario-offline-';
const CACHE_NAME = CACHE_PREFIX + 'v4';
const PAGE_URL = './inventario.html';
const NETWORK_TIMEOUT_MS = 9000;

function isCacheableHost(url) {
    return url.origin === self.location.origin ||
        url.hostname === 'cdn.tailwindcss.com' ||
        url.hostname === 'fonts.googleapis.com' ||
        url.hostname === 'fonts.gstatic.com';
}

async function precacheInventoryShell() {
    const cache = await caches.open(CACHE_NAME);
    const pageRes = await fetch(PAGE_URL, { cache: 'reload' });
    if (!pageRes || !pageRes.ok) return;
    await cache.put(PAGE_URL, pageRes.clone());
    const html = await pageRes.text();
    const urls = new Set();
    const re = /<(?:script|link)\b[^>]*?(?:src|href)\s*=\s*["']([^"']+)["']/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
        try {
            const u = new URL(m[1], self.location.href);
            if (!/^https?:$/.test(u.protocol) || !isCacheableHost(u)) continue;
            if (u.origin === self.location.origin && !/\.(?:js|css)$/i.test(u.pathname)) continue;
            urls.add(u.href);
        } catch (e) {}
    }
    await Promise.all(Array.from(urls).map(async (href) => {
        try {
            const sameOrigin = new URL(href).origin === self.location.origin;
            const req = new Request(href, sameOrigin ? { cache: 'reload' } : { mode: 'no-cors' });
            const res = await fetch(req);
            if (res && (res.ok || res.type === 'opaque')) await cache.put(href, res);
        } catch (e) {}
    }));
}

self.addEventListener('install', (event) => {
    event.waitUntil(precacheInventoryShell().catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys
            .filter((k) => k.indexOf(CACHE_PREFIX) === 0 && k !== CACHE_NAME)
            .map((k) => caches.delete(k)));
        await self.clients.claim();
    })());
});

async function matchFromCache(cache, req, isNav) {
    let hit = await cache.match(req);
    if (!hit) hit = await cache.match(req, { ignoreSearch: true });
    if (!hit && isNav) hit = await cache.match(PAGE_URL, { ignoreSearch: true });
    return hit || null;
}

async function networkFirst(event) {
    const req = event.request;
    const isNav = req.mode === 'navigate';
    const cache = await caches.open(CACHE_NAME);

    const networkPromise = fetch(req).then((res) => {
        if (res && (res.ok || res.type === 'opaque')) {
            cache.put(isNav ? PAGE_URL : req, res.clone()).catch(() => {});
        }
        return res;
    });
    networkPromise.catch(() => {});

    // Si la red tarda demasiado (señal débil en tienda), usar la copia guardada
    const timeoutPromise = new Promise((resolve) => {
        setTimeout(() => resolve(null), NETWORK_TIMEOUT_MS);
    });

    try {
        const first = await Promise.race([networkPromise, timeoutPromise]);
        if (first) return first;
        const cachedSlow = await matchFromCache(cache, req, isNav);
        return cachedSlow || await networkPromise;
    } catch (err) {
        const cached = await matchFromCache(cache, req, isNav);
        if (cached) return cached;
        throw err;
    }
}

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;
    let url;
    try { url = new URL(req.url); } catch (e) { return; }
    if (!/^https?:$/.test(url.protocol) || !isCacheableHost(url)) return;
    event.respondWith(networkFirst(event));
});
