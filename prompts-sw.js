/*
 * CREATA · Generador de Prompts IA — Service Worker exclusivo para prompts.html
 * - Registrado con scope './prompts' => nunca controla index.html, admin.html,
 *   inventario.html ni fotos-productos.html.
 * - Habilita instalación nativa como PWA en Android, iOS, Windows y Mac.
 * - Cachea el shell local con estrategia "red primero" y deja pasar intacto el
 *   tráfico hacia Render (https://buena-espero.onrender.com/).
 */
const CACHE_PREFIX = 'creata-prompts-app-';
const CACHE_NAME = CACHE_PREFIX + 'v9';
const PAGE_URL = './prompts.html';
const NETWORK_TIMEOUT_MS = 7000;

const SHELL_ASSETS = [
    './prompts.html',
    './prompts-styles.css?v=7',
    './creata-back-nav.js?v=1',
    './prompts-app.js?v=9',
    './prompts-manifest.json?v=3',
    './prompts-icon-192.png',
    './prompts-icon-512.png',
    './prompts-apple-icon.png'
];

// Bypass explícito de buena-espero.onrender.com y script.google.com (solo cachea shell local y Google Fonts)
function isCacheableHost(url) {
    return url.origin === self.location.origin ||
        url.hostname === 'fonts.googleapis.com' ||
        url.hostname === 'fonts.gstatic.com';
}

async function precachePromptsShell() {
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
        precachePromptsShell()
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

    // No interceptar tráfico hacia Render ni otros hosts externos no cacheables
    if (!isCacheableHost(url)) return;

    if (req.mode === 'navigate' || url.pathname.endsWith('/prompts.html')) {
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
