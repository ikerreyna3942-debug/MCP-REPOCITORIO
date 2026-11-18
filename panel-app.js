(function () {
    'use strict';

    const OWNER_EMAIL = 'kevin.reyna@grupoanipa.com';
    const OWNER_DISPLAY_NAME = 'Kevin Reyna';
    const SHEET_ID = '1xewqWPOlR5LMEFQXq1KsqvObg9PPlTkRGqfZ_4Iiv-8';
    const CANONICAL_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbwWdasvfk3W5FJVZvbEylibYXFxGAr0W4zVb3dq-ws0BqStyiSYQ8oZWLqOPagQBrxv/exec';

    const PANEL_SESSION_KEY = 'creata_private_kevin_panel_v1';
    const FOTOS_SESSION_KEY = 'creata_private_kevin_fotos_v1';
    const FOTOS_SECRET_SESSION_KEY = 'creata_private_kevin_fotos_sec_v1';
    const HIST_SESSION_KEY = 'creata_private_kevin_hist_v1';
    const INV_SESSION_KEY = 'creata_inv_advisor_session_v1';
    const PENDING_KEYS_STORAGE = 'creata_inv_updated_keys_v1';
    const MANUAL_LOCK_FLAG = 'creata_private_panel_manual_lock';

    const PINNED_STORAGE_KEY = 'creata_panel_pinned_projects_v1';
    const LAST_OPENED_STORAGE_KEY = 'creata_panel_last_opened_v1';

    // Escena completa guardada de Casa CREATA (Colosio PB · 69 muebles) como respaldo opcional del enlace corto
    const CASA_CREATA_PRESET_URL = 'https://ikerreyna3942-debug.github.io/Casa-creata/#eyJ2IjoyLCJzdG9yZSI6ImNvbG9zaW8iLCJmbG9vciI6IlBCIiwibXVyb3MiOjI3LCJjYW0iOnsicG9zIjpbOS42OSw5LjksMTkuNTJdLCJ0YXJnZXQiOlsxMC40OCwxLjc0LDEuMjldfSwiZnVybml0dXJlIjpbeyJpZCI6ImNhYmVjZXJhX21hZHJpZCIsImx2bCI6IlBCIiwieCI6OS45NTUsInoiOi05LjM1NywiciI6MS41NzF9LHsiaWQiOiJidXJvX2JlanVjbyIsImx2bCI6IlBCIiwieCI6OS42NzIsInoiOi03LjkzMywiciI6NC43MTJ9LHsiaWQiOiJiYXNlX3l1dGUiLCJsdmwiOiJQQiIsIngiOjcuNDg4LCJ6IjotMTguNzI3LCJyIjo0LjcxMn0seyJpZCI6ImJ1ZmV0ZXJhX3NhbnRob21hcyIsImx2bCI6IlBCIiwieCI6MTEuODU2LCJ6IjotMTEuNjU1LCJyIjowfSx7ImlkIjoic29mYV96YW1hX2l2b3J5IiwibHZsIjoiUEIiLCJ4IjoxNS4zMDEsInoiOi05LjE2MiwiciI6NC43MTN9LHsiaWQiOiJtZXNhX2NvbWVkb3JfcGFsc2VhIiwibHZsIjoiUEIiLCJ4IjoxMS43NjksInoiOi05LjQ0LCJyIjoxLjU3MX0seyJpZCI6InNpbGxhX3Bhcm1lIiwibHZsIjoiUEIiLCJ4IjoxMS4yMTksInoiOi04Ljg0NCwiciI6Ny44NTR9LHsiaWQiOiJzaWxsYV9wYXJtZSIsImx2bCI6IlBCIiwieCI6MTEuMjE5LCJ6IjotOS40NjUsInIiOjcuODU0fSx7ImlkIjoic2lsbGFfcGFybWUiLCJsdmwiOiJQQiIsIngiOjExLjIxOCwieiI6LTEwLjEyMSwiciI6Ny44NTR9LHsiaWQiOiJzaWxsYV9wYXJtZSIsImx2bCI6IlBCIiwieCI6MTIuNDM3LCJ6IjotMTAuMTI4LCJyIjoxMC45OTZ9LHsiaWQiOiJzaWxsYV9wYXJtZSIsImx2bCI6IlBCIiwieCI6MTIuNDE5LCJ6IjotOS41MDcsInIiOjEwLjk5Nn0seyJpZCI6InNpbGxhX3Bhcm1lIiwibHZsIjoiUEIiLCJ4IjoxMi40MTksInoiOi04LjgzNiwiciI6MTAuOTk2fSx7ImlkIjoic2lsbG9uX2F1cmVuIiwibHZsIjoiUEIiLCJ4IjoxNC4zOTIsInoiOi0xMS40MzgsInIiOjE5LjYzNX0seyJpZCI6InNpbGxvbl9iYWxpX29saXZlIiwibHZsIjoiUEIiLCJ4Ijo3LjU3OSwieiI6LTEyLjU5OCwiciI6Mi44NDV9LHsiaWQiOiJjcmVkZW56YV9iZWp1Y28iLCJsdmwiOiJQQiIsIngiOjYuNzUsInoiOi0xMS40MjEsInIiOjcuODU0fSx7ImlkIjoic2lsbG9uX2JhbGlfb2xpdmUiLCJsdmwiOiJQQiIsIngiOjkuMzMxLCJ6IjotMTIuNjU0LCJyIjozLjYzfSx7ImlkIjoic2hlbGJ5X3Npbl9icmF6b3MiLCJsdmwiOiJQQiIsIngiOjE3LjU4MSwieiI6LTUuMDg1LCJyIjoxMi41NjZ9LHsiaWQiOiJzaGVsYnlfZXNxdWluZXJvIiwibHZsIjoiUEIiLCJ4IjoxOC44MjMsInoiOi01LjA4NSwiciI6MTIuNTY2fSx7ImlkIjoic2hlbGJ5X2JyYXpvX2RlcmVjaG8iLCJsdmwiOiJQQiIsIngiOjE4LjgwOCwieiI6LTIuNDA3LCJyIjo0LjcxMn0seyJpZCI6InNoZWxieV9vdHRvbWFuIiwibHZsIjoiUEIiLCJ4IjoxOC44MDgsInoiOi0zLjg0NCwiciI6NC43MTJ9LHsiaWQiOiJzaGVsYnlfYnJhem9faXpxdWllcmRvIiwibHZsIjoiUEIiLCJ4IjoxNi4xNDUsInoiOi01LjA4NSwiciI6MTIuNTY2fSx7ImlkIjoic2lsbG9uX3p1cl9yb2phIiwibHZsIjoiUEIiLCJ4IjoxNy4zNzUsInoiOi0xLjc5MSwiciI6My4xMjR9LHsiaWQiOiJidXJvX2JlanVjbyIsImx2bCI6IlBCIiwieCI6OS42NzQsInoiOi0xMC42OTcsInIiOjQuNzEyfSx7ImlkIjoiY2FtYV9zYWxvbmlfa3MiLCJsdmwiOiJQQiIsIngiOjE4Ljc3OSwieiI6LTkuNDMsInIiOjQuNzEyfSx7ImlkIjoic2FsYV9tYXdpIiwibHZsIjoiUEIiLCJ4IjoxOS4wMjQsInoiOi0xNS43NDUsInIiOjQuNzEyfSx7ImlkIjoibWVzYV9jb21lZG9yX2thbWtvIiwibHZsIjoiUEIiLCJ4IjoxOC4yMDgsInoiOi0xMi45NjUsInIiOjB9LHsiaWQiOiJzaWxsYV9zYW50aG9tYXMiLCJsdmwiOiJQQiIsIngiOjE4LjU5LCJ6IjotMTMuNjgxLCJyIjowfSx7ImlkIjoic2lsbGFfc2FudGhvbWFzIiwibHZsIjoiUEIiLCJ4IjoxOS40NDgsInoiOi0xMi45NCwiciI6NC43MTJ9LHsiaWQiOiJzaWxsYV9zYW50aG9tYXMiLCJsdmwiOiJQQiIsIngiOjE4LjYwNiwieiI6LTEyLjE5OSwiciI6My4xNDJ9LHsiaWQiOiJzaWxsYV9zYW50aG9tYXMiLCJsdmwiOiJQQiIsIngiOjE3Ljc2MywieiI6LTEyLjE5NywiciI6My4xNDJ9LHsiaWQiOiJzaWxsYV9zYW50aG9tYXMiLCJsdmwiOiJQQiIsIngiOjE3Ljc3MywieiI6LTEzLjY4MSwiciI6MH0seyJpZCI6InNpbGxhX3NhbnRob21hcyIsImx2bCI6IlBCIiwieCI6MTYuODYzLCJ6IjotMTIuOTg5LCJyIjo3Ljg1NH0seyJpZCI6ImNhbWFfYXVyYV9nZWxsYXIiLCJsdmwiOiJQQiIsIngiOjE4Ljg2LCJ6IjotMTguNzUyLCJyIjoxMC45OTZ9LHsiaWQiOiJidXJvX21hZHJpZCIsImx2bCI6IlBCIiwieCI6MTkuNDY5LCJ6IjotMTcuNzM1LCJyIjoxMC45OTZ9LHsiaWQiOiJjYWpvbmVyYV9iZWp1Y28iLCJsdmwiOiJQQiIsIngiOjguNDY4LCJ6IjotMTEuNjYsInIiOjB9LHsiaWQiOiJjYW1hX3NhbnRhX2ZlX2tnIiwibHZsIjoiUEIiLCJ4IjoxMi42MiwieiI6LTE5LjE1NiwiciI6Ni4yODN9LHsiaWQiOiJidXJvX2JhcnBlIiwibHZsIjoiUEIiLCJ4IjoxNC4wOTEsInoiOi0xOS43NiwiciI6MH0seyJpZCI6ImJ1cm9fYmFycGUiLCJsdmwiOiJQQiIsIngiOjExLjE0OSwieiI6LTE5Ljc2LCJyIjowfSx7ImlkIjoiYnVmZXRlcmFfYmFycGUiLCJsdmwiOiJQQiIsIngiOjE0Ljk5MSwieiI6LTE4LjUwMiwiciI6NC43MTJ9LHsiaWQiOiJzb2ZhX3NhbnRhX2ZlX2Jha2VyX2xpbmVuIiwibHZsIjoiUEIiLCJ4IjoxMi42MTYsInoiOi0xNi43NjQsInIiOjMuMTQyfSx7ImlkIjoibWVzYV9jb21lZG9yX2JhcnJpbF84cCIsImx2bCI6IlBCIiwieCI6Mi4zMzcsInoiOi0xMi43OTUsInIiOjB9LHsiaWQiOiJzb2ZhX2NhbWFfdWdhbmRhX29hdCIsImx2bCI6IlBCIiwieCI6NS42ODgsInoiOi05LjEsInIiOjEuNTcxfSx7ImlkIjoiYnVyb19tYWRyaWQiLCJsdmwiOiJQQiIsIngiOjE5LjQ2OSwieiI6LTE5Ljc1OCwiciI6MTAuOTk2fSx7ImlkIjoiY3JlZGVuemFfYWRhbmEiLCJsdmwiOiJQQiIsIngiOjEyLjU4NCwieiI6LTE2LjA3OSwiciI6MH0seyJpZCI6ImNvbW9kYV8zNiIsImx2bCI6IlBCIiwieCI6MTcuODk1LCJ6IjotMTEuMjEsInIiOjB9LHsiaWQiOiJidXJvX21vZF82MSIsImx2bCI6IlBCIiwieCI6MTkuNzQ5LCJ6IjotMTAuOTA2LCJyIjo0LjcxMn0seyJpZCI6ImJ1cm9fbW9kXzYxIiwibHZsIjoiUEIiLCJ4IjoxOS43NDksInoiOi03Ljk1NCwiciI6NC43MTJ9LHsiaWQiOiJzaWxsYV9uYWlyb3ZpIiwibHZsIjoiUEIiLCJ4IjoyLjA1MiwieiI6LTEzLjQ5OCwiciI6Ni4yODN9LHsiaWQiOiJzaWxsYV9uYWlyb3ZpIiwibHZsIjoiUEIiLCJ4IjoyLjY3NCwieiI6LTEzLjUwNiwiciI6Ni4yODN9LHsiaWQiOiJzaWxsYV9uYWlyb3ZpIiwibHZsIjoiUEIiLCJ4IjoyLjY4NCwieiI6LTEyLjEzMiwiciI6OS40MjV9LHsiaWQiOiJzaWxsYV9uYWlyb3ZpIiwibHZsIjoiUEIiLCJ4IjoyLjA1OCwieiI6LTEyLjEzMiwiciI6OS40MjV9LHsiaWQiOiJzaWxsYV9uYWlyb3ZpIiwibHZsIjoiUEIiLCJ4IjozLjI5MSwieiI6LTEyLjc3OSwiciI6MTcuMjc5fSx7ImlkIjoic2lsbGFfbmFpcm92aSIsImx2bCI6IlBCIiwieCI6MS4zMjQsInoiOi0xMi43NzcsInIiOjIwLjQyfSx7ImlkIjoibGlicmVyb19tYXphdGlfYmVsbG90YSIsImx2bCI6IlBCIiwieCI6MTkuNzE1LCJ6IjotMS43ODUsInIiOjQuNzEyfSx7ImlkIjoiYnVmZXRlcmFfbWFkcmlkIiwibHZsIjoiUEIiLCJ4IjoxNS41NTgsInoiOi0xOC43MjgsInIiOjcuODU0fSx7ImlkIjoibGlicmVyb19tYXphdGlfYmVsbG90YSIsImx2bCI6IlBCIiwieCI6MTkuNzE1LCJ6IjotNS43ODIsInIiOjQuNzEyfSx7ImlkIjoic2lsbG9uX2thdGUiLCJsdmwiOiJQQiIsIngiOjIuNTgzLCJ6IjotMTAuMjgsInIiOjB9LHsiaWQiOiJzYWxhX3BpZXJvX2Rlcl9tb3NzIiwibHZsIjoiUEIiLCJ4IjoxMS44NTIsInoiOi0xMy4wMjIsInIiOjMuMTQyfSx7ImlkIjoic2FsYV9sdW1ub19iYWtlcl9saW5lbiIsImx2bCI6IlBCIiwieCI6Mi4zODYsInoiOi04LjY3OCwiciI6Mi42NTN9LHsiaWQiOiJtZXNhX2xhdGVyYWxfemV1cyIsImx2bCI6IlBCIiwieCI6MTYuNjQzLCJ6IjotMi4wNzksInIiOjB9LHsiaWQiOiJzaWxsb25fdW5pcGF0YSIsImx2bCI6IlBCIiwieCI6MTAuOCwieiI6LTE2LjYsInIiOjEuNTcxfSx7ImlkIjoic29mYV9yZW5uZXNfZ3JleSIsImx2bCI6IlBCIiwieCI6Ny45MDQsInoiOi0xNS40NCwiciI6MH0seyJpZCI6Im1lc2FfY2VudHJvX3NvdHRhbmEiLCJsdmwiOiJQQiIsIngiOjguNzgxLCJ6IjotMTMuNTM3LCJyIjowfSx7ImlkIjoic2lsbG9uX2xlb25pIiwibHZsIjoiUEIiLCJ4IjoxNC4yODYsInoiOi0xMi43OTYsInIiOjguNjM5fSx7ImlkIjoibWVzYV9jZW50cm9fc290dGFuYSIsImx2bCI6IlBCIiwieCI6MTguMTQsInoiOi0xNi4zMjEsInIiOjEuNTcxfSx7ImlkIjoic2lsbG9uX3VuaXBhdGEiLCJsdmwiOiJQQiIsIngiOjEzLjQwOSwieiI6LTEzLjk0MywiciI6NC43MTJ9LHsiaWQiOiJzaWxsb25fa2F0ZSIsImx2bCI6IlBCIiwieCI6My43NTgsInoiOi0xMC4yOCwiciI6MH0seyJpZCI6InNpbGxvbl96dXJfcm9qYSIsImx2bCI6IlBCIiwieCI6MTUuODkyLCJ6IjotMS43ODEsInIiOjMuMTI0fSx7ImlkIjoic2lsbG9uX2xlb25pIiwibHZsIjoiUEIiLCJ4Ijo3Ljc4NiwieiI6LTMuNTA1LCJyIjo4LjYzOX0seyJpZCI6Im1lc2FfY2VudHJvX2JpY29sb3IiLCJsdmwiOiJQQiIsIngiOjguNDIyLCJ6IjotMy4xMDYsInIiOjB9LHsiaWQiOiJjYW1hX2FtYXJldG8iLCJsdmwiOiJQQiIsIngiOjExLjUyLCJ6IjotNC43MzYsInIiOjB9XX0%3D';

    // LOS 9 PROYECTOS OFICIALES DE KEVIN REYNA
    const PROJECTS = [
        {
            id: 'cotizador',
            num: '01',
            group: 'VENTAS',
            areaLabel: 'Ventas · ERP S Mueblería',
            title: 'Creación de Cotización e Inventario en Vivo',
            whenToOpen: 'Ábrelo para consultar existencias reales (Bodega/Piso y LPPT), calcular descuentos y emitir cotizaciones con Folio oficial y PDF en S Mueblería.',
            url: 'https://ikerreyna3942-debug.github.io/MCP-REPOCITORIO/inventario.html',
            displayUrl: 'ikerreyna3942-debug.github.io/MCP-REPOCITORIO/inventario.html',
            hostType: 'github',
            keywords: 'cotizar cotizacion inventario stock existencias lppt descuento pdf bodega piso smuebleria ventas'
        },
        {
            id: 'seguimiento',
            num: '02',
            group: 'VENTAS',
            areaLabel: 'Comercial · CRM',
            title: 'Seguimiento de Cotización',
            whenToOpen: 'Ábrelo para dar seguimiento a prospectos con cotizaciones activas, revisar avances comerciales por asesor y concretar cierres de venta.',
            url: 'https://creata-muebles-qa8x.onrender.com/',
            displayUrl: 'creata-muebles-qa8x.onrender.com',
            hostType: 'render',
            keywords: 'seguimiento cotizacion clientes prospectos crm cierre estatus comercial asesores render'
        },
        {
            id: 'catalogo',
            num: '03',
            group: 'CATALOGO',
            areaLabel: 'Exhibición · Clientes',
            title: 'Catálogo Digital CREATA',
            whenToOpen: 'Ábrelo para mostrar el catálogo visual de muebles, salas modulares, medidas y acabados a clientes en sala de exhibición o en línea.',
            url: 'https://ikerreyna3942-debug.github.io/MCP-REPOCITORIO/index.html',
            displayUrl: 'ikerreyna3942-debug.github.io/MCP-REPOCITORIO/index.html',
            hostType: 'github',
            keywords: 'catalogo digital publico muebles salas modulares acabados telas maderas exhibicion cliente'
        },
        {
            id: 'precios',
            num: '04',
            group: 'ADMIN',
            areaLabel: 'Precios · Administración',
            title: 'Cambios de Precio Web',
            whenToOpen: 'Ábrelo cuando necesites modificar, actualizar o sincronizar precios de lista, promociones y ajustes tarifarios en la plataforma web.',
            url: 'https://creata-control-precios.onrender.com/',
            displayUrl: 'creata-control-precios.onrender.com',
            hostType: 'render',
            keywords: 'cambios precio precios web tarifas lista actualizar promociones descuento ajuste render'
        },
        {
            id: 'casa3d',
            num: '05',
            group: 'CATALOGO',
            areaLabel: 'Arquitectura · Plano 3D',
            title: 'Mapa 3D · Casa CREATA',
            whenToOpen: 'Ábrelo para acomodar muebles a escala real en el mapa 3D de tienda (Colosio PB / niveles), probar distribuciones y recorrer el showroom.',
            url: 'https://ikerreyna3942-debug.github.io/Casa-creata/',
            secondaryUrl: CASA_CREATA_PRESET_URL,
            secondaryLabel: 'Escena Colosio PB ↗',
            displayUrl: 'ikerreyna3942-debug.github.io/Casa-creata/ (enlace corto)',
            hostType: 'github',
            keywords: '3d mapa casa creata plano acomodo distribucion muebles tienda colosio showroom recorrido'
        },
        {
            id: 'prompts',
            num: '06',
            group: 'ADMIN',
            areaLabel: 'Inteligencia Artificial',
            title: 'Creación de Prompts',
            whenToOpen: 'Ábrelo para redactar y generar prompts estructurados de IA (renders de producto, ambientaciones, descripciones o flujos creativos).',
            url: 'https://buena-espero.onrender.com/',
            displayUrl: 'buena-espero.onrender.com',
            hostType: 'render',
            keywords: 'prompts ia creacion inteligencia artificial imagenes renders textos generador buena espero'
        },
        {
            id: 'odoo',
            num: '07',
            group: 'ADMIN',
            areaLabel: 'ERP · Altas de Catálogo',
            title: 'Alta de Productos en Odoo',
            whenToOpen: 'Ábrelo cuando vayas a dar de alta productos nuevos, variantes, SKUs, categorías o fichas maestras para cargar en Odoo.',
            url: 'https://app-1-3y7y.onrender.com/',
            displayUrl: 'app-1-3y7y.onrender.com',
            hostType: 'render',
            keywords: 'alta odoo productos nuevos sku variantes registro erp importar catalogo'
        },
        {
            id: 'historial',
            num: '08',
            group: 'VENTAS',
            areaLabel: 'Auditoría · Solo Titular',
            title: 'Historial de Cotización y Bitácora',
            whenToOpen: 'Ábrelo para auditar todas las cotizaciones emitidas en todas las tiendas, descargar PDFs generados y revisar el historial técnico en vivo.',
            url: 'https://ikerreyna3942-debug.github.io/MCP-REPOCITORIO/historial.html',
            displayUrl: 'ikerreyna3942-debug.github.io/MCP-REPOCITORIO/historial.html',
            hostType: 'github',
            keywords: 'historial cotizacion bitacora auditoria folios pdfs fallos movimientos tiendas titular'
        },
        {
            id: 'fotos',
            num: '09',
            group: 'CATALOGO',
            areaLabel: 'Drive SUBIR · Hoja "1"',
            title: 'Gestor de Fotografías (Hoja "1" y SUBIR)',
            whenToOpen: 'Ábrelo para buscar un SKU o Nombre en la Hoja "1", ver la foto actual vs la nueva de Drive SUBIR, moverla a su categoría y guardar el link en Columna D.',
            url: 'https://ikerreyna3942-debug.github.io/MCP-REPOCITORIO/fotos-productos.html',
            displayUrl: 'ikerreyna3942-debug.github.io/MCP-REPOCITORIO/fotos-productos.html',
            hostType: 'github',
            keywords: 'fotos fotografias imagenes hoja 1 subir drive categorias sku columna d link reemplazar acomodar'
        }
    ];

    const state = {
        unlocked: false,
        groupFilter: 'ALL',
        searchQuery: '',
        highlightedId: '',
        pinnedIds: new Set(),
        lastOpenedMap: {},
        pingStatus: {} // id -> { state: 'ready' | 'waking' | 'online', ms: 0 }
    };

    // =========================================================================
    // UTILIDADES
    // =========================================================================
    function cleanStr(val) {
        if (val === null || val === undefined) return '';
        return String(val).trim();
    }

    function normalizeEmail(raw) {
        return cleanStr(raw).toLowerCase().replace(/,/g, '.');
    }

    function normalizeSearch(str) {
        return String(str || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .trim();
    }

    function escapeHtml(str) {
        return String(str === null || str === undefined ? '' : str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function cleanKeyCellValue(val) {
        if (val === null || val === undefined) return '';
        if (typeof val === 'number') {
            return Number.isInteger(val) ? String(val) : String(Math.trunc(val));
        }
        let s = String(val).trim();
        if (/^\d+\.0+$/.test(s)) s = s.replace(/\.0+$/, '');
        return s;
    }

    function keysMatchNormalized(a, b) {
        const s1 = String(a || '').trim();
        const s2 = String(b || '').trim();
        if (!s1 || !s2) return false;
        if (s1 === s2) return true;
        const c1 = s1.replace(/\s+/g, '');
        const c2 = s2.replace(/\s+/g, '');
        return !!c1 && c1 === c2;
    }

    function formatRelativeTime(ts) {
        if (!ts) return 'Aún no abierto aquí';
        const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
        if (diffSec < 60) return 'Abierto hace unos segundos';
        if (diffSec < 3600) return 'Abierto hace ' + Math.floor(diffSec / 60) + ' min';
        if (diffSec < 86400) return 'Abierto hace ' + Math.floor(diffSec / 3600) + ' h';
        const d = new Date(ts);
        return 'Última vez: ' + d.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit' });
    }

    // =========================================================================
    // PERSISTENCIA LOCAL (FIJADOS Y ÚLTIMO USO)
    // =========================================================================
    function loadPreferences() {
        try {
            const rawPins = JSON.parse(localStorage.getItem(PINNED_STORAGE_KEY) || '[]');
            if (Array.isArray(rawPins)) {
                state.pinnedIds = new Set(rawPins);
            }
        } catch (e) {}

        try {
            const rawLast = JSON.parse(localStorage.getItem(LAST_OPENED_STORAGE_KEY) || '{}');
            if (rawLast && typeof rawLast === 'object') {
                state.lastOpenedMap = rawLast;
            }
        } catch (e) {}
    }

    function savePinnedPreferences() {
        try {
            localStorage.setItem(PINNED_STORAGE_KEY, JSON.stringify(Array.from(state.pinnedIds)));
        } catch (e) {}
    }

    window.recordProjectOpen = function (projectId) {
        if (!projectId) return;
        state.lastOpenedMap[projectId] = Date.now();
        try {
            localStorage.setItem(LAST_OPENED_STORAGE_KEY, JSON.stringify(state.lastOpenedMap));
        } catch (e) {}
        setTimeout(renderProjectsGrid, 150);
    };

    window.togglePinProject = function (projectId, ev) {
        if (ev && ev.stopPropagation) ev.stopPropagation();
        if (state.pinnedIds.has(projectId)) {
            state.pinnedIds.delete(projectId);
        } else {
            state.pinnedIds.add(projectId);
        }
        savePinnedPreferences();
        renderProjectsGrid();
    };

    window.copyProjectUrl = async function (projectId, btnEl) {
        const proj = PROJECTS.find((p) => p.id === projectId);
        if (!proj) return;
        try {
            await navigator.clipboard.writeText(proj.url);
            if (btnEl) {
                const prev = btnEl.textContent;
                btnEl.textContent = '✓ Copiada';
                setTimeout(() => { btnEl.textContent = prev; }, 1800);
            }
        } catch (e) {}
    };

    // =========================================================================
    // VALIDACIÓN DE ACCESO EXCLUSIVO (kevin.reyna@grupoanipa.com)
    // =========================================================================
    function parseCsvSimple(text) {
        const rows = [];
        let row = [];
        let cur = '';
        let inQuotes = false;
        for (let i = 0; i < text.length; i++) {
            const ch = text[i];
            if (inQuotes) {
                if (ch === '"') {
                    if (i + 1 < text.length && text[i + 1] === '"') {
                        cur += '"';
                        i++;
                    } else {
                        inQuotes = false;
                    }
                } else {
                    cur += ch;
                }
            } else if (ch === '"') {
                inQuotes = true;
            } else if (ch === ',') {
                row.push(cur);
                cur = '';
            } else if (ch === '\r') {
                if (i + 1 < text.length && text[i + 1] === '\n') i++;
                row.push(cur);
                rows.push(row);
                row = [];
                cur = '';
            } else if (ch === '\n') {
                row.push(cur);
                rows.push(row);
                row = [];
                cur = '';
            } else {
                cur += ch;
            }
        }
        if (cur.length > 0 || row.length > 0) {
            row.push(cur);
            rows.push(row);
        }
        return rows;
    }

    async function fetchProyectosRowsFallback() {
        const csvUrl = 'https://docs.google.com/spreadsheets/d/' + encodeURIComponent(SHEET_ID) +
            '/gviz/tq?tqx=out:csv&headers=0&sheet=PROYECTOS&range=A1%3AI40&_t=' + Date.now();
        try {
            const resp = await fetch(csvUrl, { cache: 'no-store' });
            if (resp && resp.ok) {
                const txt = await resp.text();
                if (txt && !txt.trim().startsWith('<')) return parseCsvSimple(txt);
            }
        } catch (e) {}
        return null;
    }

    async function callWebAppLogin(typedKey) {
        const cfgUrl = (window.CREATA_CLOUD_CONFIG && typeof window.CREATA_CLOUD_CONFIG.getApiUrl === 'function')
            ? window.CREATA_CLOUD_CONFIG.getApiUrl()
            : '';
        const targetUrl = cfgUrl || CANONICAL_WEBAPP_URL;
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = controller ? setTimeout(() => controller.abort(), 9500) : null;
        try {
            const resp = await fetch(targetUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({
                    action: 'inv_login',
                    email: OWNER_EMAIL,
                    accessKey: typedKey,
                    sheetTab: 'PROYECTOS'
                }),
                signal: controller ? controller.signal : undefined
            });
            if (!resp.ok) return { ok: false, unavailable: true };
            return (await resp.json()) || { ok: false, unavailable: true };
        } catch (e) {
            return { ok: false, unavailable: true };
        } finally {
            if (timer) clearTimeout(timer);
        }
    }

    function setGateAlert(msg, tone) {
        const el = document.getElementById('hubGateAlert');
        if (!el) return;
        if (!msg) {
            el.textContent = '';
            el.className = 'gate-alert hidden';
            return;
        }
        el.textContent = msg;
        el.className = 'gate-alert ' + (tone === 'warn' ? 'is-warn' : 'is-error');
    }

    function checkExistingOwnerSession() {
        try {
            if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(MANUAL_LOCK_FLAG) === '1') {
                return { valid: false, otherEmail: '' };
            }
        } catch (e) {}

        const keys = [PANEL_SESSION_KEY, FOTOS_SESSION_KEY, HIST_SESSION_KEY, INV_SESSION_KEY];
        for (let i = 0; i < keys.length; i++) {
            try {
                const raw = localStorage.getItem(keys[i]);
                if (!raw) continue;
                const obj = JSON.parse(raw);
                if (!obj) continue;
                const em = normalizeEmail(obj.correo);
                if (em === OWNER_EMAIL && !obj.mustChangeKey) {
                    return { valid: true };
                }
                if (em && em !== OWNER_EMAIL && keys[i] === INV_SESSION_KEY) {
                    return { valid: false, otherEmail: em };
                }
            } catch (e) {}
        }
        return { valid: false, otherEmail: '' };
    }

    function unlockHub() {
        state.unlocked = true;
        try {
            if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(MANUAL_LOCK_FLAG);
        } catch (e) {}

        const gate = document.getElementById('hubGateBackdrop');
        const main = document.getElementById('hubMainShell');
        if (gate) gate.classList.add('hidden');
        if (main) main.classList.remove('hidden');

        renderProjectsGrid();
        window.wakeAndCheckAllProjects();
    }

    window.lockHubPortal = function () {
        state.unlocked = false;
        try {
            localStorage.removeItem(PANEL_SESSION_KEY);
            if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(MANUAL_LOCK_FLAG, '1');
        } catch (e) {}

        const gate = document.getElementById('hubGateBackdrop');
        const main = document.getElementById('hubMainShell');
        const pwd = document.getElementById('hubOwnerPassword');
        if (pwd) pwd.value = '';
        setGateAlert('Panel bloqueado. Ingresa tu contraseña personal para volver a entrar.', 'warn');
        if (main) main.classList.add('hidden');
        if (gate) gate.classList.remove('hidden');
        if (pwd) setTimeout(() => pwd.focus(), 60);
    };

    window.toggleHubPwdVisibility = function () {
        const inp = document.getElementById('hubOwnerPassword');
        const btn = document.getElementById('btnToggleHubPwd');
        if (!inp) return;
        const isPwd = inp.type === 'password';
        inp.type = isPwd ? 'text' : 'password';
        if (btn) btn.textContent = isPwd ? 'Ocultar' : 'Mostrar';
    };

    window.submitHubOwnerLogin = async function (ev) {
        if (ev && ev.preventDefault) ev.preventDefault();
        const emailInp = document.getElementById('hubOwnerEmail');
        const pwdInp = document.getElementById('hubOwnerPassword');
        const btn = document.getElementById('btnHubLoginSubmit');

        const typedEmail = normalizeEmail(emailInp ? emailInp.value : OWNER_EMAIL);
        const typedKey = cleanStr(pwdInp ? pwdInp.value : '');

        if (typedEmail !== OWNER_EMAIL) {
            setGateAlert('Acceso restringido exclusivamente a ' + OWNER_EMAIL + '.', 'error');
            return;
        }
        if (!typedKey) {
            setGateAlert('Ingresa tu contraseña personal.', 'error');
            return;
        }

        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Verificando titularidad...';
        }
        setGateAlert('', '');

        try {
            const cloudRes = await callWebAppLogin(typedKey);
            let verified = false;

            if (cloudRes && cloudRes.ok) {
                verified = true;
            } else if (cloudRes && !cloudRes.unavailable && cloudRes.error && !/Acci[óo]n no reconocida/i.test(cloudRes.error)) {
                setGateAlert(cloudRes.error, 'error');
                return;
            } else {
                const rows = await fetchProyectosRowsFallback();
                if (!rows || rows.length < 2) {
                    setGateAlert('No se pudo verificar con Google Sheets. Revisa tu conexión.', 'error');
                    return;
                }
                let localKeyMap = {};
                try {
                    localKeyMap = JSON.parse(localStorage.getItem(PENDING_KEYS_STORAGE) || '{}') || {};
                } catch (e) {}

                for (let i = 0; i < rows.length; i++) {
                    const r = rows[i] || [];
                    if (normalizeEmail(r[4]) !== OWNER_EMAIL) continue;
                    let tempKey = cleanKeyCellValue(r[5]);
                    let defKey = cleanKeyCellValue(r[6]);
                    const localUpd = localKeyMap[OWNER_EMAIL];
                    if (!defKey && localUpd && localUpd.newKey) {
                        defKey = localUpd.newKey;
                        tempKey = '';
                    }
                    if ((defKey && keysMatchNormalized(typedKey, defKey)) || (!defKey && tempKey && keysMatchNormalized(typedKey, tempKey))) {
                        verified = true;
                        break;
                    }
                }
                if (!verified) {
                    setGateAlert('Contraseña incorrecta.', 'error');
                    return;
                }
            }

            if (verified) {
                const issuedToken = cleanStr(
                    (cloudRes && (cloudRes.authToken || (cloudRes.user && cloudRes.user.authToken))) || ''
                );
                const sessionPayload = JSON.stringify({
                    correo: OWNER_EMAIL,
                    nombre: OWNER_DISPLAY_NAME,
                    sheetTab: 'PROYECTOS',
                    authToken: issuedToken,
                    verifiedAt: Date.now()
                });
                // Sincronizar sesión con Historial y Gestor de Fotos para no pedir doble login al saltar entre módulos
                try {
                    localStorage.setItem(PANEL_SESSION_KEY, sessionPayload);
                    localStorage.setItem(FOTOS_SESSION_KEY, sessionPayload);
                    localStorage.setItem(HIST_SESSION_KEY, sessionPayload);
                    if (typeof sessionStorage !== 'undefined') {
                        sessionStorage.setItem(FOTOS_SECRET_SESSION_KEY, typedKey);
                    }
                } catch (e) {}
                if (pwdInp) pwdInp.value = '';
                unlockHub();
            }
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Entrar al Panel de Control';
            }
        }
    };

    // =========================================================================
    // DESPERTADOR Y VERIFICADOR EN VIVO DE LOS 9 PROYECTOS (GITHUB + RENDER)
    // =========================================================================
    async function pingSingleProject(proj) {
        state.pingStatus[proj.id] = {
            state: proj.hostType === 'render' ? 'waking' : 'ready',
            ms: 0
        };
        renderProjectsGrid();
        updateLiveSummaryText();

        const t0 = performance.now();
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = controller ? setTimeout(() => controller.abort(), 35000) : null;
        try {
            await fetch(proj.url, {
                method: 'GET',
                mode: 'no-cors',
                cache: 'no-store',
                signal: controller ? controller.signal : undefined
            });
            const ms = Math.max(12, Math.round(performance.now() - t0));
            state.pingStatus[proj.id] = { state: 'online', ms: ms };
        } catch (err) {
            state.pingStatus[proj.id] = {
                state: proj.hostType === 'github' ? 'online' : 'waking',
                ms: 0
            };
        } finally {
            if (timer) clearTimeout(timer);
            renderProjectsGrid();
            updateLiveSummaryText();
        }
    }

    window.wakeAndCheckAllProjects = function () {
        if (!state.unlocked) return;
        PROJECTS.forEach((proj) => {
            pingSingleProject(proj);
        });
    };

    function updateLiveSummaryText() {
        const el = document.getElementById('hubLiveSummary');
        if (!el) return;
        let onlineCount = 0;
        let wakingRender = 0;
        PROJECTS.forEach((p) => {
            const st = state.pingStatus[p.id];
            if (st && st.state === 'online') onlineCount++;
            else if (p.hostType === 'render') wakingRender++;
        });

        if (wakingRender > 0) {
            el.textContent = onlineCount + '/9 listos · Despertando ' + wakingRender + ' servidor(es) en Render...';
        } else {
            el.textContent = '✓ Los 9 proyectos están en línea y listos para abrir';
        }
    }

    // =========================================================================
    // BÚSQUEDA, FILTROS POR TAREA Y RENDERIZADO DE TARJETAS
    // =========================================================================
    window.setHubGroupFilter = function (group) {
        state.groupFilter = group || 'ALL';
        state.highlightedId = '';
        document.querySelectorAll('.group-tab[data-group]').forEach((btn) => {
            btn.classList.toggle('active', btn.getAttribute('data-group') === state.groupFilter);
        });
        renderProjectsGrid();
    };

    window.clearHubSearch = function () {
        const inp = document.getElementById('hubSearchInput');
        const clr = document.getElementById('hubSearchClearBtn');
        if (inp) inp.value = '';
        if (clr) clr.classList.add('hidden');
        state.searchQuery = '';
        state.highlightedId = '';
        renderProjectsGrid();
        if (inp) inp.focus();
    };

    window.focusProjectById = function (projectId) {
        state.groupFilter = 'ALL';
        state.searchQuery = '';
        state.highlightedId = projectId;
        const inp = document.getElementById('hubSearchInput');
        const clr = document.getElementById('hubSearchClearBtn');
        if (inp) inp.value = '';
        if (clr) clr.classList.add('hidden');
        document.querySelectorAll('.group-tab[data-group]').forEach((btn) => {
            btn.classList.toggle('active', btn.getAttribute('data-group') === 'ALL');
        });
        renderProjectsGrid();

        const cardEl = document.getElementById('projectCard_' + projectId);
        if (cardEl && typeof cardEl.scrollIntoView === 'function') {
            cardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    };

    function getFilteredProjects() {
        const q = normalizeSearch(state.searchQuery);
        const tokens = q ? q.split(' ').filter(Boolean) : [];

        const filtered = PROJECTS.filter((p) => {
            if (state.groupFilter === 'PINNED' && !state.pinnedIds.has(p.id)) return false;
            if (state.groupFilter !== 'ALL' && state.groupFilter !== 'PINNED' && p.group !== state.groupFilter) {
                return false;
            }
            if (tokens.length > 0) {
                const hay = normalizeSearch(p.num + ' ' + p.title + ' ' + p.whenToOpen + ' ' + p.areaLabel + ' ' + p.keywords + ' ' + p.displayUrl);
                for (let i = 0; i < tokens.length; i++) {
                    if (hay.indexOf(tokens[i]) === -1) return false;
                }
            }
            return true;
        });

        // Mostrar primero los proyectos fijados con ★ manteniendo el orden numérico 01–09 dentro de cada bloque
        filtered.sort((a, b) => {
            const aPin = state.pinnedIds.has(a.id) ? 0 : 1;
            const bPin = state.pinnedIds.has(b.id) ? 0 : 1;
            if (aPin !== bPin) return aPin - bPin;
            return a.num.localeCompare(b.num);
        });

        return filtered;
    }

    function renderStatusBadgeHtml(proj) {
        const st = state.pingStatus[proj.id];
        if (!st) {
            return '<span class="live-badge"><span class="live-dot"></span>Listo</span>';
        }
        if (st.state === 'waking') {
            return '<span class="live-badge is-waking"><span class="live-dot"></span>Render despertando...</span>';
        }
        const hostLabel = proj.hostType === 'render'
            ? ('Render activo' + (st.ms ? (' · ' + st.ms + ' ms') : ''))
            : 'GitHub activo';
        return '<span class="live-badge"><span class="live-dot"></span>' + escapeHtml(hostLabel) + '</span>';
    }

    function renderProjectsGrid() {
        const grid = document.getElementById('projectsGridContainer');
        if (!grid) return;

        // Actualizar contador de fijados en pestaña
        const pinTab = document.querySelector('.group-tab[data-group="PINNED"]');
        if (pinTab) {
            pinTab.textContent = '★ Fijados (' + state.pinnedIds.size + ')';
        }

        const list = getFilteredProjects();
        if (!list.length) {
            grid.innerHTML =
                '<div style="grid-column:1/-1;background:#FFFFFF;border:1px solid #E5E0D2;border-radius:16px;padding:32px;text-align:center;color:#4C555D;font-weight:600;">' +
                    (state.groupFilter === 'PINNED'
                        ? 'Aún no has fijado proyectos favoritos. Haz clic en el botón ★ de cualquier tarjeta para fijarla arriba.'
                        : 'Ningún proyecto coincide con esa búsqueda. Prueba otra palabra o haz clic en "Todos (9)".') +
                '</div>';
            return;
        }

        grid.innerHTML = list.map((p) => {
            const isPinned = state.pinnedIds.has(p.id);
            const isHighlighted = state.highlightedId === p.id;
            const lastTs = state.lastOpenedMap[p.id] || 0;

            return (
                '<article id="projectCard_' + escapeHtml(p.id) + '" class="project-card' + (isHighlighted ? ' is-highlighted' : '') + '">' +
                    '<div class="card-top">' +
                        '<div class="card-meta-bar">' +
                            '<div class="card-num-group">' +
                                '<span class="card-index">#' + escapeHtml(p.num) + '</span>' +
                                '<span class="card-area-tag">' + escapeHtml(p.areaLabel) + '</span>' +
                            '</div>' +
                            '<div class="card-right-tools">' +
                                renderStatusBadgeHtml(p) +
                                '<button type="button" class="pin-btn' + (isPinned ? ' pinned' : '') + '" title="' + (isPinned ? 'Quitar de fijados' : 'Fijar arriba') + '" onclick="togglePinProject(\'' + escapeHtml(p.id) + '\', event)">★</button>' +
                            '</div>' +
                        '</div>' +

                        '<h3 class="card-title">' + escapeHtml(p.title) + '</h3>' +

                        '<div class="when-box">' +
                            '<div class="when-label">¿Qué resuelves al abrirlo?</div>' +
                            '<p class="when-text">' + escapeHtml(p.whenToOpen) + '</p>' +
                        '</div>' +
                    '</div>' +

                    '<div class="card-bottom">' +
                        '<div class="url-strip">' +
                            '<span class="url-text" title="' + escapeHtml(p.url) + '">' + escapeHtml(p.displayUrl) + '</span>' +
                            '<button type="button" class="copy-url-btn" onclick="copyProjectUrl(\'' + escapeHtml(p.id) + '\', this)">Copiar URL</button>' +
                        '</div>' +

                        '<div class="card-cta-row">' +
                            '<a href="' + escapeHtml(p.url) + '" target="_blank" rel="noopener" class="btn-open-primary" onclick="recordProjectOpen(\'' + escapeHtml(p.id) + '\')">' +
                                'Abrir Proyecto #' + escapeHtml(p.num) + ' ↗' +
                            '</a>' +
                            (p.secondaryUrl
                                ? ('<a href="' + escapeHtml(p.secondaryUrl) + '" target="_blank" rel="noopener" class="btn-open-secondary" title="Abrir escena exacta guardada de Colosio PB con los 69 muebles posicionados" onclick="recordProjectOpen(\'' + escapeHtml(p.id) + '\')">' +
                                    escapeHtml(p.secondaryLabel) +
                                   '</a>')
                                : '') +
                        '</div>' +

                        '<div class="last-used-line">' +
                            '<span>' + escapeHtml(formatRelativeTime(lastTs)) + '</span>' +
                            '<span>Tecla rápida: <strong>' + escapeHtml(String(parseInt(p.num, 10))) + '</strong></span>' +
                        '</div>' +
                    '</div>' +
                '</article>'
            );
        }).join('');
    }

    // =========================================================================
    // INICIALIZACIÓN
    // =========================================================================
    function initHubApp() {
        if (window.CREATA_LOGO_B64) {
            document.querySelectorAll('[data-creata-logo]').forEach((img) => {
                img.src = window.CREATA_LOGO_B64;
            });
        }

        loadPreferences();

        const searchInp = document.getElementById('hubSearchInput');
        const clrBtn = document.getElementById('hubSearchClearBtn');
        if (searchInp) {
            searchInp.addEventListener('input', () => {
                const v = searchInp.value || '';
                if (clrBtn) clrBtn.classList.toggle('hidden', !v.trim());
                state.searchQuery = v;
                state.highlightedId = '';
                renderProjectsGrid();
            });
        }

        // Atajos numéricos 1 al 9 para abrir rápidamente cada proyecto cuando no se está escribiendo en un campo
        document.addEventListener('keydown', (ev) => {
            if (!state.unlocked) return;
            if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
            const tag = (ev.target && ev.target.tagName) ? ev.target.tagName.toUpperCase() : '';
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
            if (/^[1-9]$/.test(ev.key)) {
                const idx = parseInt(ev.key, 10) - 1;
                const proj = PROJECTS[idx];
                if (proj) {
                    window.recordProjectOpen(proj.id);
                    window.open(proj.url, '_blank', 'noopener');
                }
            }
        });

        const sess = checkExistingOwnerSession();
        if (sess.valid) {
            unlockHub();
        } else {
            if (sess.otherEmail) {
                setGateAlert(
                    'Sesión detectada de ' + sess.otherEmail + '. Este panel es exclusivo para ' + OWNER_EMAIL + '.',
                    'error'
                );
            }
            const pwdInp = document.getElementById('hubOwnerPassword');
            if (pwdInp) setTimeout(() => pwdInp.focus(), 80);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initHubApp);
    } else {
        initHubApp();
    }
})();
