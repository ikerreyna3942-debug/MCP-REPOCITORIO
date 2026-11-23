/*
 * CREATA · App de Fotos por Categoría — Service Worker SOLO para fotos-productos.html
 * - Registrado con scope './fotos-productos' => no controla index.html ni admin.html.
 * - Permite descargar/instalar la aplicación como PWA nativa en Android, iOS, Windows y Mac.
 * - Estrategia "red primero" para HTML/JS/CSS y caché rápida para miniaturas de Google Drive.
 */
const CACHE_PREFIX = 'creata-fotos-app-';
const CACHE_NAME = CACHE_PREFIX + 'v22';
const IMG_CACHE_NAME = CACHE_PREFIX + 'img-v22';
const MAX_CACHED_IMAGES = 350;
const PAGE_URL = './fotos-productos.html';
const NETWORK_TIMEOUT_MS = 4500;

function isOfflineNow() {
    return typeof navigator !== 'undefined' && navigator.onLine === false;
}

function isCacheableHost(url) {
    return url.origin === self.location.origin ||
        url.hostname === 'fonts.googleapis.com' ||
        url.hostname === 'fonts.gstatic.com';
}

function isProductImageHost(url) {
    return url.hostname === 'lh3.googleusercontent.com';
}

async function precacheFotosShell() {
    const cache = await caches.open(CACHE_NAME);
    const pageRes = await fetch(PAGE_URL, { cache: 'reload' });
    if (!pageRes || !pageRes.ok) return;
    await cache.put(PAGE_URL, pageRes.clone());
    try {
        const absPageUrl = new URL(PAGE_URL, self.location.href).href;
        await cache.put(absPageUrl, pageRes.clone());
    } catch (e) {}
    const html = await pageRes.text();
    const urls = new Set();
    const re = /<(?:script|link)\b([^>]*?)>/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
        const attrs = m[1] || '';
        if (/\brel\s*=\s*["'](?:preconnect|dns-prefetch)["']/i.test(attrs)) continue;
        const srcMatch = attrs.match(/\b(?:src|href)\s*=\s*["']([^"']+)["']/i);
        if (!srcMatch || !srcMatch[1]) continue;
        try {
            const u = new URL(srcMatch[1], self.location.href);
            if (!/^https?:$/.test(u.protocol) || !isCacheableHost(u)) continue;
            if (u.origin === self.location.origin && !/\.(?:js|css|json|png)$/i.test(u.pathname)) continue;
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
    event.waitUntil(precacheFotosShell().catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys
            .filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME && k !== IMG_CACHE_NAME)
            .map((k) => caches.delete(k)));
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

async function trimImageCache(cache) {
    try {
        const keys = await cache.keys();
        if (keys.length <= MAX_CACHED_IMAGES) return;
        const removeCount = keys.length - MAX_CACHED_IMAGES;
        for (let i = 0; i < removeCount; i++) {
            await cache.delete(keys[i]);
        }
    } catch (e) {}
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

    if (isProductImageHost(url)) {
        event.respondWith((async () => {
            const cache = await caches.open(IMG_CACHE_NAME);
            const cached = await cache.match(req);
            if (isOfflineNow()) {
                return cached || Response.error();
            }
            const networkFetch = fetch(req).then((res) => {
                // Guardar respuestas válidas u opacas (<img> cross-origin sin CORS en lh3.googleusercontent.com)
                const ct = (res && res.headers && res.headers.get('content-type') || '').toLowerCase();
                if (res && (res.type === 'opaque' || (res.ok && (!ct || ct.startsWith('image/'))))) {
                    cache.put(req, res.clone()).then(() => trimImageCache(cache)).catch(() => {});
                }
                return res;
            }).catch(() => null);

            if (cached) {
                networkFetch.catch(() => {});
                return cached;
            }
            const netRes = await networkFetch;
            return netRes || Response.error();
        })());
        return;
    }

    if (!isCacheableHost(url)) return;

    if (req.mode === 'navigate' || url.pathname.endsWith('/fotos-productos.html')) {
        event.respondWith((async () => {
            const cache = await caches.open(CACHE_NAME);
            if (isOfflineNow()) {
                const offCached = (await cache.match(req, { ignoreSearch: true })) || (await cache.match(PAGE_URL));
                if (offCached) return offCached;
            }
            try {
                const netRes = await fetchWithTimeout(req, NETWORK_TIMEOUT_MS);
                if (netRes && netRes.ok) {
                    cache.put(PAGE_URL, netRes.clone()).catch(() => {});
                    return netRes;
                }
            } catch (e) {}
            const cached = (await cache.match(req, { ignoreSearch: true })) || (await cache.match(PAGE_URL));
            return cached || Response.error();
        })());
        return;
    }

    event.respondWith((async () => {
        const cache = await caches.open(CACHE_NAME);
        if (isOfflineNow()) {
            const offCached = (await cache.match(req)) || (await cache.match(req, { ignoreSearch: true }));
            if (offCached) return offCached;
        }
        try {
            const netRes = await fetchWithTimeout(req, NETWORK_TIMEOUT_MS);
            if (netRes && (netRes.ok || netRes.type === 'opaque')) {
                cache.put(req, netRes.clone()).catch(() => {});
                return netRes;
            }
        } catch (e) {}
        const cached = (await cache.match(req)) || (await cache.match(req, { ignoreSearch: true }));
        return cached || Response.error();
    })());
});
