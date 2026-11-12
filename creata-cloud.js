// ==========================================================================
// CREATA MUEBLES — NUBE, COMPRESIÓN DE FOTOS, DETECCIÓN DE PIEZAS Y SEGURIDAD
// ==========================================================================
(function (global) {
    'use strict';

    const DEFAULT_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbwWdasvfk3W5FJVZvbEylibYXFxGAr0W4zVb3dq-ws0BqStyiSYQ8oZWLqOPagQBrxv/exec';
    const DRIVE_ID_BY_KEY = {"SALA-CARRARA":"1P6ClsL9t4BVkJL3u7n3Uwf8rHvPGwDQE","ARMCAR1PDERAC":"1P6ClsL9t4BVkJL3u7n3Uwf8rHvPGwDQE","ARMCARESQCUAC":"1P6ClsL9t4BVkJL3u7n3Uwf8rHvPGwDQE","ARMCAR1PIZQAC":"1P6ClsL9t4BVkJL3u7n3Uwf8rHvPGwDQE","ARMCAR1PMODTC":"1P6ClsL9t4BVkJL3u7n3Uwf8rHvPGwDQE","SALA-CARRARA-TOTAL":"1P6ClsL9t4BVkJL3u7n3Uwf8rHvPGwDQE","SALA-DONATI":"1r-0hno7d2-nfxLQ0SCZe0XJw-Y88Xanz","ARMDON1PDERR1":"1r-0hno7d2-nfxLQ0SCZe0XJw-Y88Xanz","ARMDONCHIZQR1":"1r-0hno7d2-nfxLQ0SCZe0XJw-Y88Xanz","ARMDON1PIZQR1":"1r-0hno7d2-nfxLQ0SCZe0XJw-Y88Xanz","ARMDONCHDERR1":"1r-0hno7d2-nfxLQ0SCZe0XJw-Y88Xanz","SALA-DONATI-TOTAL":"1r-0hno7d2-nfxLQ0SCZe0XJw-Y88Xanz","SALA-DYLAN":"1EwBmnU2RE46hc-Uryn_0_2_6v8NxvH7t","ARMDYL1PDEMPE":"1EwBmnU2RE46hc-Uryn_0_2_6v8NxvH7t","ARMDYL1PMOMPE":"1EwBmnU2RE46hc-Uryn_0_2_6v8NxvH7t","ARMDYLESQMPE":"1EwBmnU2RE46hc-Uryn_0_2_6v8NxvH7t","ARMDYL1PIZMPE":"1EwBmnU2RE46hc-Uryn_0_2_6v8NxvH7t","ARMDYLOTTOMPE":"1EwBmnU2RE46hc-Uryn_0_2_6v8NxvH7t","SALA-DYLAN-TOTAL":"1EwBmnU2RE46hc-Uryn_0_2_6v8NxvH7t","SALA-LUGANO":"1ummLABE7wAWSyogIt6nMxIZpXsXgCEYr","ARMLUG1PDERNL":"1ummLABE7wAWSyogIt6nMxIZpXsXgCEYr","ARMLUG1PMODNL":"1ummLABE7wAWSyogIt6nMxIZpXsXgCEYr","ARMLUGESQCUNL":"1ummLABE7wAWSyogIt6nMxIZpXsXgCEYr","ARMLUGCHIZQNL":"1ummLABE7wAWSyogIt6nMxIZpXsXgCEYr","ARMLUG1PIZQNL":"1ummLABE7wAWSyogIt6nMxIZpXsXgCEYr","ARMLUGCHDERNL":"1ummLABE7wAWSyogIt6nMxIZpXsXgCEYr","ARMLUGESQNL":"1ummLABE7wAWSyogIt6nMxIZpXsXgCEYr","SALA-LUGANO-TOTAL":"1ummLABE7wAWSyogIt6nMxIZpXsXgCEYr","SALA-MARENO":"1LiYMLLZE-mu_djkyBm7uQCqN-vBCEFr5","ARMMAR3PKECO":"1LiYMLLZE-mu_djkyBm7uQCqN-vBCEFr5","ARMMAR2PKECO":"1LiYMLLZE-mu_djkyBm7uQCqN-vBCEFr5","SALA-MARENO-TOTAL":"1LiYMLLZE-mu_djkyBm7uQCqN-vBCEFr5","SALA-MATERA":"1MRuQaKKEcepx0QsjrR3BphNjDwJRLiv7","ARMMAT1PDERSP":"1MRuQaKKEcepx0QsjrR3BphNjDwJRLiv7","ARMMAT1PIZQSP":"1MRuQaKKEcepx0QsjrR3BphNjDwJRLiv7","ARMMATCHDERSP":"1MRuQaKKEcepx0QsjrR3BphNjDwJRLiv7","ARMMATCHIZQSP":"1MRuQaKKEcepx0QsjrR3BphNjDwJRLiv7","SALA-MATERA-TOTAL":"1MRuQaKKEcepx0QsjrR3BphNjDwJRLiv7","SALA-MONACO":"1cZ43t5VFZ0tRuJYi-Q7bdzBi5pv-PM52","ARMMONIZQELBL":"1cZ43t5VFZ0tRuJYi-Q7bdzBi5pv-PM52","ARMMON1PMODFA":"1cZ43t5VFZ0tRuJYi-Q7bdzBi5pv-PM52","ARMMONESQFAPE":"1cZ43t5VFZ0tRuJYi-Q7bdzBi5pv-PM52","ARMMONOTTFAPE":"1cZ43t5VFZ0tRuJYi-Q7bdzBi5pv-PM52","ARMMONESQELBL":"1cZ43t5VFZ0tRuJYi-Q7bdzBi5pv-PM52","SALA-MONACO-TOTAL":"1cZ43t5VFZ0tRuJYi-Q7bdzBi5pv-PM52","SALA-MONET":"1HQV-Cg1yDLmyb3YEqHbiTeeQ7s2o4bnM","ARMMON3PFREFL":"1HQV-Cg1yDLmyb3YEqHbiTeeQ7s2o4bnM","ARMMON2PFRFL":"1HQV-Cg1yDLmyb3YEqHbiTeeQ7s2o4bnM","SALA-MONET-TOTAL":"1HQV-Cg1yDLmyb3YEqHbiTeeQ7s2o4bnM","SALA-SHELBY":"1UI1PsAk7dUaQhTr-LVtkkMUd-pUIasD_","ARMSHE1PDERN1":"1UI1PsAk7dUaQhTr-LVtkkMUd-pUIasD_","ARMSHE1PMODN1":"1UI1PsAk7dUaQhTr-LVtkkMUd-pUIasD_","ARMSHEESQNA01":"1UI1PsAk7dUaQhTr-LVtkkMUd-pUIasD_","ARMSHE1PIZQN1":"1UI1PsAk7dUaQhTr-LVtkkMUd-pUIasD_","ARMSHEOTTNA01":"1UI1PsAk7dUaQhTr-LVtkkMUd-pUIasD_","SALA-SHELBY-TOTAL":"1UI1PsAk7dUaQhTr-LVtkkMUd-pUIasD_","ARM1PASCNACR":"1fFQ2ZCayQzhzWzTNb_TFWLsCGB9ltdYa","ATXCAMAUQSGMB":"1unUhnZmmAMmBUeUwH2m1ZH9iK5J7njQ1","ATXCAMAUQSREB":"1unUhnZmmAMmBUeUwH2m1ZH9iK5J7njQ1","ATXCAMSFEKSGM":"1W6tV65Hj6pZU7w_xhSjbFiHstmhfIcUw","ATXCAMSFEKSLC":"1W6tV65Hj6pZU7w_xhSjbFiHstmhfIcUw","ATXBUFBALSPHA":"1Ds9EgYu8X1Hx2MJT7th6TbarVhy21SJA","ATXBUFLUMBENT":"1ddFajKSRVlBYeP-9P-0ADuDlnLJWJQvG","ATXBUFSTHNONT":"1jKQqkrQC8H7gNyqWJQxRAkRQlJwtRP-K","ATXLIBMAZENCA":"1KbXzNwVLOJEoxOHdfHJMw2ZBpbkgso7E","ATXMDCKUNROEN":"13Jc7n8B7OH_EyXx0wUYEimQ3euH_dIu4","ATXCENRENLABE":"15-DLVX22k-0CWVG9jQMSF0YlTVz3woBK","ATXMESLUMBENT":"15LaFnAPbjannLGwmWE4YYOKnh-seEoiM","ATXMLAKUNROEN":"1W0LJ7XLhBWmhwDdhS1yw-hAOSb2_pgKy","ATXSILAURBKHA":"1_0w2p5ZRQ5OC6itB0EC7SnDB12602WC7","ATXSILSTHPLLB":"1Zmn1HGy-NvivnNIYpr4LSBVX8Gra3SFl","ATX1PBALBOLB":"1N2DX4CKJrpvAFHcZN0JNy9BUoAGpZY5h","ATX1PBALRNLB":"1YWS4D_3_xMC2dsKM4eUiQwbJZe6beuhT","ATX3PAURBLTA":"1JHlzHN6YE5B41m0M2o3z5iiYvSNg3OG0","ATX3PSFEGJLB":"18jVnUVhXctmztYGIjMwEu1b1rJlmb-g_","BARSILSANPLRM":"1UTErufzcbjVX2P2qT5D4z5neXFBhHbbk","BARSOCSANRMKP":"1fPE_f3XUXDz2KG2MpAxH-7EnmJl8jepS","BARBUSAN120RM":"1pEXMuZ3wk3ZyTewuWFHbnxbdrNSXYRI0","BARBUFSAN18RM":"1tmfYj47E7heyvnnHXP7KPVQuFaqrV3o8","BARBURSAN60RM":"1_MIu6S-oUZCkIzGAaHZBBqCIs2HQiwzE","BARBURSANIZRM":"18G9zhew9Tkv7ZYWx9M3P6rXJKbfP2egq","BARTOCSAN14RM":"1Mtwx_6LlVTAIg4NDyiGoapqLfcugXije","BARSANMATPLRM":"11KtRQADeVVeqbgbg8y1pq5uNSsPJRRrFv6".replace("eqbgbg","eqbg"),"BARSANKSPLRM":"11KtRQADeVVeqbg8y1pq5uNSsPJRRrFv6","BARCRESAN14RM":"17eJa2o3TEgTtl0USeumvtvNdV7VyGwoV","BARESPSANRM18":"1sDeo5er-lf9VtF5269SKRmSSne_-fqdt","BARMDCSAN120R":"18668XDUGwfIRG2SPmNqegjMzf6IkXAW8","BARMDCSAN80RM":"1QlULQqhv8IkNxhCc7bVanHTbLvwSKL91","BARMLSANRM50":"1op5GSYWpEwth45MJhwss_5mGUc8A8kIn","BARMESSAN4PRM":"1r8IH_Jza6y2C1IFGflSUSjMUFQgJafc3","BARMESAN6PRM":"1r8IH_Jza6y2C1IFGflSUSjMUFQgJafc3","BARMESSAN8PRM":"1r8IH_Jza6y2C1IFGflSUSjMUFQgJafc3","CVVSALAARIOF":"1UlkgA_ncmutYpyez4AqbAdysbsxMcXmW","CVVSALAARIOI":"1gv3PG4ExZvYbX190kc9w75LWXL-6Jkeo","CVVSALLEXPROL":"1e3RcW3bKd-mjbu2WLGptNRwElH0B2xCK","CVVSALLUNBALI":"1Hlj0Bq-rpPM56X6XIDn9VEAK0ffwykrY","CVVSALLUNBAMU":"1gMJUMCCe5eSLEqEIVft7lYgmj7u1ysUA","CVVSALPIEFPBU":"1DNPEwh6PZK_XiLoPpq724HGJ6Yo2Xvbk","CVVSALPIEFPMO":"1xpErkahTfvxy1A5pfHrrUlDm8ym-Dzm-","KUDSALMAWHALI":"13c-yuej45wXcCmMB_2NKtqe8YMmkxgyB","KUDSCAASHBROA":"1BL7tHTVhb39OHTfLG2EtV0it5_MpIZ-K","KUDSCAUGABROA":"18P1W-ydM6nJ_7EqJfNKU24-eFfjUg5pI","GMM1PKATBEIWO":"1emgv3GRr89EULhY9XnTpbtZXDt-Cfdg7","GMM1PLEOBEI":"1t2CgTGgdsVKUMxezs-76CMKmL9Ab0pvL","GMMCAM9867":"18Wp_dynOuPujcpFrp3cFqlLASztNl67a","GMMCAM9866":"1PoVbSTeX7905HDoRZlknpVHfMvp2hPhn","GMMMTV7300":"1JLJ5M4q6Rau4uq1XHtqes53vuXAe8xMJ","GMMMES7141":"17gcx2wBilMdXRmDOIvTVGUyJeQdJsUCq","GMMMDC2818":"1ZQr3aocjjQZ4GsOmTUtuhmcoKIyztpax","GMMSIL7412":"1HCG4ufrsrJte0zwA92lV6WcLmaLkEVmi","GMMMES6908":"1QSKqVwG9vba4T9yBjkW7YVcO9Bn8Fvb6","GMMSIL2147":"1kxzKh4ccfYfq9f8AkSK1Bba2uOT0jecj","GMMSIL7411":"1k4RrYIX4k0nROyyIgSB9sI2ADG2FcFt4","GMM1P2010":"1gIwVUHmQfI9KitnAEy3y6f1WS-eI-psC","GMM1P2016":"1LqQ5s65NqkF_O7f5M1L-t7D3qmkEj4bE","GMM1P2017":"18n2AvhefvqJ91547W019Q9pOZNcFLjSW","LPCOMD36RMCL":"11d9QxIJVP7HlCOEKw6udpixUbKQuVIvd","LPBUR61RMCL":"1uCEEmLAmQxp6STDVGZKXj6ZWLNgKKsaF","MOBBASKSYUT":"1enK-6ZPBppLYZ8VGHaSbRECVc85Qf5Hs","MOBBURMADROMO":"11DmcfaobgXdvpyWvX_9h8vTG0UUbP8Zr","MOBBUFPLAPAR":"11DtR3y8LDp4WR_W_fDZv8Rgr8DC2ITm0","MOBCABMADKSRM":"1MtIuOFVYV6JUP1s-8hu3tqzejFqXwmWX","MOBCAJBARRMNU":"1HMVDzH4mSpvXXhBtorbMagxaqPwot8Ml","MOBCOMBEJROMO":"1mdTbd8mOVfFQiwTcWbZteL3gSeO-cpTD","MOBCTVPUERM":"1xlGqL1wm84d_74iYf-FiZyfU_SdlHPLR","MOBCREADA220":"19yMJuF7fl16yHwmzdBkcQKPknjzZtBiM","MOBCREBEJROMO":"1J4tolhHsfm_mq4TfyLvmaPbEx4M4GvF_","MOBESPESCPAR":"12CgDIdfi88DRHxm1pdq_QOxliTtGoT7h","MOBESPCOR45RM":"1eY5q3tzN-z5arEkcRqJnLQ8wxI8BsCRA","MOBMDCBEJROMO":"1z-HOmydgUDTPUhes_w9OfsV2GN55jzjl","MOBMESBAR8PRM":"16x-fvfbXMjn2Sm_T-NBFgrIDDdgLGcZi","MOBMESKAMRM":"16TPeZRbam9-Q5mZcLtJcxEw2VDb8lEU".replace("LtJcx","Lt4Jcx"),"MOBJGOMESPARM":"19LaXGRYR4LCUbKq0-p2OumTh1VYvNz57","MOBSILCANROMO":"1LGXaQFpg3UjlcXryUBzx-p984NQ1K8_m","MOBSILNAISOL":"11cYSxbWjVStfzlJjM__4DjurfyxipbKp","MOBBURAFRROMO":"1FpioS7NVcWWuiRZ2FAPNDCuDX_wX2kb0","MOBBURBARLED":"192wek99TiVdkNv-WPZlsqp8CBUHzDLRs","MOBURBEJRROMO":"1KzyxLBbhSM0z3SqgD4w_S-KTiYGDOZDe","MOBCOMMADROMO":"1oEj-cO_wKWClT-vEG3AtqZakbCTCK38g","MOBBURPLAPAR":"1m4y2N2rLxIpspamau3JUySOg8GNzRsBN","MOBBURYUTROMO":"1hrLWDGNNidWxoog_eeXmKO-KQeOKFJdr","PICMDCSOTSB":"1V4-WM2Xsfe8mHXfoiq5EwkLciIL-bPRF","PAYCAMSALKSRI":"1hlzwZyy88C5XBPhkUX1zvM7DR2EVqKEK","PAYCAMSAJKS":"1BPDp29-t-gVT33XtPyJwVkfBId3sqO_b","REVMLZEUPAR46":"1OC-07UD_wZPj5Gmeddd86p127yHTTKEJ","YO3PZAMALUIV":"1sgqzbDqz1TuRcZ-DGXr-fD9yuXNCFRUX","YO1PUNIBRBOPC":"1ZTbM6GhOhSroyB4J8Sh1-CxCn--3STPg","YO1PAARNOGRRM":"1IDIzlwO03SR9r3qyHRy_bOWzZ4m1eGG5","YO1PAURRUNARM":"1BF_lySyOyYs9iygJQjI3wA0HXyKfgWQu","YO1PDUEPIJERM":"1mAh2LzkmKh3A_SbUnlHSj0cpfXsecu9B","YO1PZURPIERM":"12EjKdITrKv9Q8cp6UY00UQ--e4sp710c","YO1PZURSA07RM":"1bnvrclEjyC2-4D79V9Vs_T1tYuPSJQEP"};

    const CREATA_CLOUD_CONFIG = {
        sheetId: '1xewqWPOlR5LMEFQXq1KsqvObg9PPlTkRGqfZ_4Iiv-8',
        driveFolderId: '1umQvzMJLXFiOwSyWL8d5v0aCWDpx8hQT',
        inventoryLocations: ['CEDIS', 'CASA CREATA', 'COLOSIO', 'PLAYA', 'PUERTO CANCUN'],
        githubOwner: 'ikerreyna3942-debug',
        githubRepo: 'MCP-REPOCITORIO',
        getApiUrl: function () {
            try {
                const localUrl = localStorage.getItem('creata_sheets_webapp_url');
                if (localUrl && /^https:\/\/script\.google(usercontent)?\.com\//i.test(localUrl.trim())) {
                    return localUrl.trim();
                }
            } catch (e) {}
            return DEFAULT_WEBAPP_URL;
        },
        setApiUrl: function (url) {
            const clean = (url || '').trim();
            if (!clean) {
                localStorage.removeItem('creata_sheets_webapp_url');
            } else {
                localStorage.setItem('creata_sheets_webapp_url', clean);
            }
            return clean;
        },
        getAdminPin: function () {
            try {
                return (localStorage.getItem('creata_admin_pin') || '').trim();
            } catch (e) {
                return '';
            }
        },
        setAdminPin: function (pin) {
            const clean = (pin || '').trim();
            if (!clean) {
                localStorage.removeItem('creata_admin_pin');
            } else {
                localStorage.setItem('creata_admin_pin', clean);
            }
            return clean;
        },
        hasWriteApi: function () {
            return !!this.getApiUrl();
        },
        isConfigured: function () {
            return !!this.sheetId || !!this.getApiUrl();
        }
    };

    try {
        if (global.location && global.location.search) {
            const params = new URLSearchParams(global.location.search);
            const paramUrl = params.get('webapp') || params.get('api');
            if (paramUrl && /^https:\/\/script\.google\.com\/macros\/s\/.+\/exec/i.test(paramUrl.trim())) {
                CREATA_CLOUD_CONFIG.setApiUrl(paramUrl.trim());
            }
            const paramPin = params.get('pin');
            if (paramPin) CREATA_CLOUD_CONFIG.setAdminPin(paramPin.trim());
        }
    } catch (e) {}

    function isValidPhotoUrl(val) {
        if (!val || typeof val !== 'string') return false;
        const s = val.trim();
        if (!s || s === 'undefined' || s === 'null' || s === '#') return false;
        return s.startsWith('data:image/') || s.startsWith('https://') || s.startsWith('http://') || s.startsWith('./') || s.startsWith('fotos/');
    }

    function scrubForbiddenPublicText(txt) {
        if (!txt || typeof txt !== 'string') return txt || '';
        return txt
            .replace(/JUEGO COMPLETO\s*\([^)]*\)/gi, '')
            .replace(/JUEGO COMPLETO/gi, '')
            .replace(/JUEGO MODULAR COMPLETO/gi, '')
            .replace(/\n?\[Composición\]:[\s\S]*$/i, '')
            .replace(/\bSin descripción\b\.?/gi, '')
            .trim();
    }

    function sanitizePublicProduct(prod) {
        if (!prod || typeof prod !== 'object') return null;
        const clone = {};
        const forbiddenKeys = new Set([
            'sku', 'sku_base', 'sku_mode', 'is_unified_sku',
            'temp_unified_sku', 'piece_composition', 'cost',
            'sheet_specs', 'drive_file_id', 'inventory'
        ]);
        Object.keys(prod).forEach((k) => {
            if (forbiddenKeys.has(k)) return;
            clone[k] = prod[k];
        });

        clone.model_name = scrubForbiddenPublicText(clone.model_name);
        clone.materials = scrubForbiddenPublicText(clone.materials);

        if (Array.isArray(clone.variants)) {
            clone.variants = clone.variants.map((v) => {
                const vc = {};
                Object.keys(v || {}).forEach((vk) => {
                    if (forbiddenKeys.has(vk)) return;
                    vc[vk] = v[vk];
                });
                vc.materials = scrubForbiddenPublicText(vc.materials);
                vc.color_label = inferColorLabelFromData(
                    scrubForbiddenPublicText(vc.color_label),
                    vc.materials || clone.materials,
                    ''
                );
                vc.finish_type = vc.finish_type || inferFinishType(vc.color_label, vc.materials || clone.materials);
                vc.hero_b64 = isValidPhotoUrl(vc.hero_b64) ? vc.hero_b64.trim() : '';
                vc.swatch_img = isValidPhotoUrl(vc.swatch_img) ? vc.swatch_img.trim() : '';
                if (vc.gallery && typeof vc.gallery === 'object') {
                    const g = Object.assign({}, vc.gallery);
                    g.ambiente = isValidPhotoUrl(g.ambiente) ? g.ambiente.trim() : '';
                    g.finish = isValidPhotoUrl(g.finish) ? g.finish.trim() : '';
                    g.fabric = isValidPhotoUrl(g.fabric) ? g.fabric.trim() : '';
                    ['view1', 'view2', 'view3', 'view4'].forEach((k) => {
                        g[k] = isValidPhotoUrl(g[k]) ? g[k].trim() : '';
                    });
                    if (Array.isArray(g.all_views)) {
                        g.all_views = g.all_views.map((u) => (isValidPhotoUrl(u) ? u.trim() : '')).filter(Boolean);
                    }
                    if (Array.isArray(g.finishes)) {
                        g.finishes = g.finishes.map((u) => (isValidPhotoUrl(u) ? u.trim() : '')).filter(Boolean);
                    }
                    const linkedFinish = vc.swatch_img || g.finish || g.fabric || (g.finishes && g.finishes[0]) || '';
                    vc.swatch_img = linkedFinish;
                    g.finish = linkedFinish;
                    g.fabric = linkedFinish;
                    if (linkedFinish) g.finishes = [linkedFinish];
                    if (vc.hero_b64 && /-finish-\d+\./i.test(vc.hero_b64) && !g.ambiente && (!g.all_views || g.all_views.length === 0)) {
                        vc.hero_b64 = '';
                    }
                    vc.gallery = g;
                }
                return vc;
            });
        } else {
            clone.variants = [];
        }

        if (Array.isArray(clone.sala_modules)) {
            clone.sala_modules = clone.sala_modules.map((m) => ({
                name: scrubForbiddenPublicText(m.name),
                price: parseFloat(m.price) || 0,
                width: m.width || '',
                depth: m.depth || '',
                height: m.height || '',
                qty: parseInt(m.qty, 10) || 1,
                checked: m.checked !== false
            }));
        }

        return clone;
    }

    function parseCurrencyValue(val) {
        if (val === undefined || val === null || val === '') return 0;
        if (typeof val === 'number') return isFinite(val) ? val : 0;
        const clean = val.toString().replace(/[^0-9.-]/g, '');
        const n = parseFloat(clean);
        return isNaN(n) ? 0 : n;
    }

    function formatCurrencyMXN(num) {
        const val = isFinite(num) ? Number(num) : 0;
        return '$' + val.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function detectProductPieces(product, skuDb, knownCatalog) {
        if (!product) return { isMultiPiece: false, count: 1, source: 'none', modules: [] };

        if (Array.isArray(product.sala_modules) && product.sala_modules.length > 1) {
            return {
                isMultiPiece: true,
                count: product.sala_modules.length,
                source: 'saved',
                modules: JSON.parse(JSON.stringify(product.sala_modules))
            };
        }

        const pSku = (product.sku || product.id || '').toUpperCase();
        const pModel = (product.model_name || '').toUpperCase();
        const cat = (product.category || '').toUpperCase();
        const mat = (product.materials || '').toUpperCase();
        const widthStr = (product.width || '').toString();
        const pkgStr = (product.packages || '').toString();

        // 1. Coincidencia exacta en catálogo modular conocido
        if (knownCatalog && typeof knownCatalog === 'object') {
            const matchedKey = Object.keys(knownCatalog).find((k) => {
                const aliasMap = {
                    'SALA-CARRARA': 'CARRARA', 'ARMCAR': 'CARRARA',
                    'SALA-DONATI': 'DONATI', 'ARMDON': 'DONATI',
                    'SALA-DYLAN': 'DYLAN', 'ARMDYL': 'DYLAN',
                    'SALA-LUGANO': 'LUGANO', 'ARMLUG': 'LUGANO',
                    'SALA-MARENO': 'MARENO', 'ARMMAR': 'MARENO',
                    'SALA-MATERA': 'MATERA', 'ARMMAT': 'MATERA',
                    'SALA-MONACO': 'MONACO', 'ARMMONACO': 'MONACO',
                    'SALA-MONET': 'MONET', 'ARMMON': 'MONET',
                    'SALA-SHELBY': 'SHELBY', 'ARMSHE': 'SHELBY'
                };
                const modelAlias = aliasMap[k] || k;
                return pSku.includes(k) || pModel.includes(modelAlias);
            });
            if (matchedKey) {
                const mods = JSON.parse(JSON.stringify(knownCatalog[matchedKey])).map((m) => ({
                    ...m,
                    qty: m.qty || 1,
                    checked: m.checked !== false
                }));
                return {
                    isMultiPiece: mods.length > 1,
                    count: mods.length,
                    source: 'known_catalog',
                    modules: mods
                };
            }
        }

        // 2. Búsqueda automática de piezas hermanas en SKU_DATABASE
        if (skuDb && typeof skuDb === 'object') {
            const basePrefix = pSku.replace(/[^A-Z0-9]/g, '').slice(0, 6);
            const modelRoot = pModel.replace(/^(SALA|SOFA|SOFÁ|COMEDOR|MESA|RECÁMARA|RECAMARA)\s+/i, '').trim();
            if (basePrefix.length >= 5 || modelRoot.length >= 4) {
                const siblingMatches = [];
                const seenSkus = new Set();
                Object.keys(skuDb).forEach((k) => {
                    const item = skuDb[k];
                    if (!item) return;
                    const itemSku = (item.sku || k).toUpperCase();
                    const itemModel = (item.model_name || '').toUpperCase();
                    const cleanSku = itemSku.replace(/[^A-Z0-9]/g, '');
                    const sameRoot = (basePrefix.length >= 6 && cleanSku.startsWith(basePrefix)) ||
                                     (modelRoot.length >= 4 && itemModel.includes(modelRoot));
                    const isComponentToken = /(1P|2P|3P|DER|IZQ|CHAISE|CEN|LAT|TAB|OTT|MOD|SILLA|BURO|BURÓ|CABECERA|BASE|BANCA)/i.test(itemSku + ' ' + itemModel);
                    if (sameRoot && isComponentToken && !seenSkus.has(itemSku)) {
                        seenSkus.add(itemSku);
                        siblingMatches.push({
                            name: item.model_name || itemSku,
                            code: itemSku.slice(-5),
                            sku: itemSku,
                            price: parseCurrencyValue(item.price),
                            width: item.width || '',
                            depth: item.depth || '',
                            height: item.height || '',
                            qty: 1,
                            checked: true,
                            photoSlot: `view${Math.min(4, siblingMatches.length + 1)}`
                        });
                    }
                });
                if (siblingMatches.length > 1) {
                    return {
                        isMultiPiece: true,
                        count: siblingMatches.length,
                        source: 'sku_database',
                        modules: siblingMatches
                    };
                }
            }
        }

        // 3. Detección inteligente por estructura de dimensiones, bultos o texto
        const dimParts = widthStr.split('/').map((s) => s.trim()).filter(Boolean);
        const pkgMatch = pkgStr.match(/(\d+)/);
        const pkgNum = pkgMatch ? parseInt(pkgMatch[1], 10) : 1;
        const textHintMulti = /(\+|CHAISE|LOVE\s*SEAT|ESQUINERA|MODULAR|MÓDULO|SILLAS|BUR[ÓO]S|PIEZA)/i.test(pModel + ' ' + mat);

        const isLikelyMulti = dimParts.length > 1 || pkgNum > 1 || textHintMulti || cat.includes('SALA') || cat.includes('COMEDOR');
        const totalPrice = parseCurrencyValue(product.price);

        if (dimParts.length > 1) {
            const count = dimParts.length;
            const splitPrice = totalPrice > 0 ? Math.round((totalPrice / count) * 100) / 100 : 0;
            const mods = dimParts.map((dimVal, idx) => ({
                name: cat.includes('SALA')
                    ? (count === 2 ? (idx === 0 ? 'Sofá / Módulo Principal' : 'Love Seat / Módulo 2') : `Módulo ${idx + 1}`)
                    : `Pieza ${idx + 1}`,
                code: `PZA-${idx + 1}`,
                sku: pSku ? `${pSku}-P${idx + 1}` : `MOD-${idx + 1}`,
                price: splitPrice,
                width: dimVal.includes('cm') ? dimVal : `${dimVal} cm`,
                depth: product.depth || '',
                height: product.height || '',
                qty: 1,
                checked: true,
                photoSlot: `view${Math.min(4, idx + 1)}`
            }));
            return { isMultiPiece: true, count: mods.length, source: 'dimensions', modules: mods };
        }

        if (isLikelyMulti) {
            const count = Math.max(2, Math.min(4, pkgNum > 1 ? pkgNum : 2));
            const splitPrice = totalPrice > 0 ? Math.round((totalPrice / count) * 100) / 100 : 0;
            const mods = [];
            for (let i = 0; i < count; i++) {
                let label = `Pieza ${i + 1}`;
                let code = `PZA-${i + 1}`;
                if (cat.includes('SALA')) {
                    label = i === 0 ? 'Módulo Derecho / 3P' : (i === 1 ? 'Módulo Izquierdo / 2P' : `Módulo ${i + 1}`);
                    code = i === 0 ? 'MOD-DER' : (i === 1 ? 'MOD-IZQ' : `MOD-${i + 1}`);
                } else if (cat.includes('COMEDOR')) {
                    label = i === 0 ? 'Mesa de Comedor' : 'Juego de Sillas';
                    code = i === 0 ? 'MESA' : 'SILLAS';
                } else if (cat.includes('REC')) {
                    label = i === 0 ? 'Cama / Cabecera' : `Buró / Complemento ${i}`;
                    code = i === 0 ? 'CAMA' : `PZA-${i + 1}`;
                }
                mods.push({
                    name: label,
                    code: code,
                    sku: pSku ? `${pSku}-${code}` : code,
                    price: splitPrice,
                    width: '',
                    depth: '',
                    height: '',
                    qty: 1,
                    checked: true,
                    photoSlot: `view${Math.min(4, i + 1)}`
                });
            }
            return { isMultiPiece: true, count: mods.length, source: 'structural', modules: mods };
        }

        return {
            isMultiPiece: false,
            count: 1,
            source: 'single',
            modules: [{
                name: product.model_name || 'Pieza Única',
                code: 'UNICA',
                sku: pSku || 'PIEZA-1',
                price: totalPrice,
                width: product.width || '',
                depth: product.depth || '',
                height: product.height || '',
                qty: 1,
                checked: true,
                photoSlot: 'view1'
            }]
        };
    }

    function inferFinishType(colorLabel, materials) {
        const lbl = String(colorLabel || '').trim();
        if (/MADERA|ROBLE|NOGAL|TZALAM|PAROTA|ENCINO|CHAPA|BELLOTA|PINO|FRESNO|TECA/i.test(lbl)) return 'MADERA';
        if (!lbl && /MADERA|ROBLE|NOGAL|TZALAM|PAROTA|ENCINO|CHAPA|BELLOTA/i.test(String(materials || '')) && !/TELA|PIEL|LINO|POLI[EÉ]STER|TERCIOPELO/i.test(String(materials || ''))) {
            return 'MADERA';
        }
        return 'TELA';
    }

    function inferColorLabelFromData(existingLabel, materials, baseLabel) {
        const cleanExisting = String(existingLabel || '').trim();
        if (cleanExisting && !/^(ACABADO FICHA T[EÉ]CNICA|OPCI[OÓ]N\s*1|EST[AÁ]NDAR|ACABADO)$/i.test(cleanExisting)) {
            return cleanExisting.toUpperCase();
        }
        const cleanBase = String(baseLabel || '').trim();
        if (cleanBase && !/^(ACABADO FICHA T[EÉ]CNICA|OPCI[OÓ]N\s*1|EST[AÁ]NDAR|ACABADO)$/i.test(cleanBase)) {
            return cleanBase.toUpperCase();
        }
        const mat = String(materials || '');
        const mTela = mat.match(/Tela(?:\s+Base\s*[A-Z]?)?\s*:\s*([^|(\n]+)/i);
        if (mTela && mTela[1]) {
            const candidate = mTela[1].trim();
            if (candidate && !/^\d+%/.test(candidate)) return candidate.toUpperCase();
        }
        const mMad = mat.match(/(?:Tono\s+madera|Madera|Acabado)\s*:\s*([^|(\n]+)/i);
        if (mMad && mMad[1]) return mMad[1].trim().toUpperCase();
        return cleanBase ? cleanBase.toUpperCase() : 'ACABADO OFICIAL';
    }

    let __imglyRemoveBgFn = null;
    async function loadImglyBackgroundRemover() {
        if (__imglyRemoveBgFn) return __imglyRemoveBgFn;
        try {
            const mod = await import('https://esm.sh/@imgly/background-removal@1.5.5');
            __imglyRemoveBgFn = mod.removeBackground || mod.default || null;
            return __imglyRemoveBgFn;
        } catch (err) {
            console.warn('[Creata BG AI fallback]', err);
            return null;
        }
    }

    function analyzeAndStripBackgroundCanvas(srcImg, maxWorkDim = 1000) {
        const origW = srcImg.naturalWidth || srcImg.width;
        const origH = srcImg.naturalHeight || srcImg.height;
        if (!origW || !origH) return null;

        const wScale = Math.min(1, maxWorkDim / Math.max(origW, origH));
        const w = Math.max(2, Math.round(origW * wScale));
        const h = Math.max(2, Math.round(origH * wScale));

        const workCanvas = document.createElement('canvas');
        workCanvas.width = w;
        workCanvas.height = h;
        const ctx = workCanvas.getContext('2d', { willReadFrequently: true });
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(srcImg, 0, 0, w, h);

        const imgData = ctx.getImageData(0, 0, w, h);
        const data = imgData.data;
        const totalPx = w * h;

        // 1. Verificar si la imagen ya viene sin fondo (canal alfa real)
        let transparentCount = 0;
        for (let i = 3; i < data.length; i += 16) {
            if (data[i] < 25) transparentCount++;
        }
        const approxTransRatio = transparentCount / Math.max(1, Math.floor(totalPx / 4));
        if (approxTransRatio > 0.04) {
            return { canvas: workCanvas, width: w, height: h, alreadyTransparent: true, complexBg: false };
        }

        // 2. Muestrear el perímetro exterior (bordes superior, inferior, izquierdo y derecho)
        const borderSamples = [];
        const stepX = Math.max(1, Math.floor(w / 60));
        const stepY = Math.max(1, Math.floor(h / 60));
        const margin = Math.max(1, Math.min(4, Math.floor(Math.min(w, h) * 0.015)));

        const pushPx = (px, py) => {
            const idx = (py * w + px) * 4;
            if (data[idx + 3] > 200) {
                borderSamples.push([data[idx], data[idx + 1], data[idx + 2]]);
            }
        };
        for (let x = 0; x < w; x += stepX) {
            pushPx(x, margin);
            pushPx(x, Math.max(0, h - 1 - margin));
        }
        for (let y = 0; y < h; y += stepY) {
            pushPx(margin, y);
            pushPx(Math.max(0, w - 1 - margin), y);
        }

        if (borderSamples.length < 8) {
            return { canvas: workCanvas, width: w, height: h, alreadyTransparent: false, complexBg: false };
        }

        let sumR = 0, sumG = 0, sumB = 0;
        borderSamples.forEach((s) => { sumR += s[0]; sumG += s[1]; sumB += s[2]; });
        const meanR = sumR / borderSamples.length;
        const meanG = sumG / borderSamples.length;
        const meanB = sumB / borderSamples.length;

        let varSum = 0;
        borderSamples.forEach((s) => {
            const dr = s[0] - meanR, dg = s[1] - meanG, db = s[2] - meanB;
            varSum += (dr * dr + dg * dg + db * db) / 3;
        });
        const borderStdDev = Math.sqrt(varSum / borderSamples.length);

        // Si el perímetro varía demasiado, es una foto de habitación/ambiente compleja
        const isComplexScene = borderStdDev > 36;

        // 3. Calcular mapa rápido de luminancia y gradiente de borde (barrera anti-fuga hacia tapicería clara)
        const lum = new Float32Array(totalPx);
        for (let i = 0, p = 0; p < totalPx; p++, i += 4) {
            lum[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        }
        const edgeGrad = new Float32Array(totalPx);
        for (let y = 1; y < h - 1; y++) {
            const rowOff = y * w;
            for (let x = 1; x < w - 1; x++) {
                const p = rowOff + x;
                const gx = Math.abs(lum[p + 1] - lum[p - 1]);
                const gy = Math.abs(lum[p + w] - lum[p - w]);
                edgeGrad[p] = gx + gy;
            }
        }

        // 4. Flood-Fill 8-conexo desde los bordes exteriores
        const bgMask = new Uint8Array(totalPx); // 1 = fondo confirmado
        const visited = new Uint8Array(totalPx);
        const queue = new Int32Array(totalPx);
        let qHead = 0, qTail = 0;

        const globalTolSq = isComplexScene ? (30 * 30) : (48 * 48);
        const stepTolSq = isComplexScene ? (13 * 13) : (18 * 18);
        const edgeBarrier = isComplexScene ? 18 : 26;

        const colorDistSqMean = (idx4) => {
            const dr = data[idx4] - meanR;
            const dg = data[idx4 + 1] - meanG;
            const db = data[idx4 + 2] - meanB;
            return dr * dr + dg * dg + db * db;
        };

        const trySeed = (x, y) => {
            const p = y * w + x;
            if (visited[p]) return;
            const idx4 = p * 4;
            const isNearWhite = data[idx4] > 232 && data[idx4 + 1] > 232 && data[idx4 + 2] > 232;
            if (isNearWhite || colorDistSqMean(idx4) <= globalTolSq * 1.35) {
                visited[p] = 1;
                bgMask[p] = 1;
                queue[qTail++] = p;
            }
        };

        for (let x = 0; x < w; x++) {
            trySeed(x, 0);
            trySeed(x, h - 1);
        }
        for (let y = 0; y < h; y++) {
            trySeed(0, y);
            trySeed(w - 1, y);
        }

        const dirsX = [-1, 1, 0, 0, -1, 1, -1, 1];
        const dirsY = [0, 0, -1, 1, -1, -1, 1, 1];

        while (qHead < qTail) {
            const curr = queue[qHead++];
            const cx = curr % w;
            const cy = (curr - cx) / w;
            const cIdx4 = curr * 4;
            const cr = data[cIdx4], cg = data[cIdx4 + 1], cb = data[cIdx4 + 2];

            for (let d = 0; d < 8; d++) {
                const nx = cx + dirsX[d];
                const ny = cy + dirsY[d];
                if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
                const np = ny * w + nx;
                if (visited[np]) continue;
                visited[np] = 1;

                if (edgeGrad[np] > edgeBarrier) continue;

                const nIdx4 = np * 4;
                const nr = data[nIdx4], ng = data[nIdx4 + 1], nb = data[nIdx4 + 2];
                const sdr = nr - cr, sdg = ng - cg, sdb = nb - cb;
                const stepD = sdr * sdr + sdg * sdg + sdb * sdb;
                if (stepD > stepTolSq) continue;

                const isPureStudioWhite = nr > 240 && ng > 240 && nb > 240;
                if (!isPureStudioWhite && colorDistSqMean(nIdx4) > globalTolSq * 1.6) continue;

                bgMask[np] = 1;
                queue[qTail++] = np;
            }
        }

        const removedRatio = qTail / totalPx;
        if (removedRatio < 0.03 || removedRatio > 0.96) {
            // Si casi nada o casi todo fue marcado, requiere IA o conservar intacto
            return { canvas: workCanvas, width: w, height: h, alreadyTransparent: false, complexBg: true };
        }

        // 5. Suavizado de bordes (Feathering de 2px + descontaminación de halo blanco)
        const alphaOut = new Uint8Array(totalPx);
        for (let p = 0; p < totalPx; p++) {
            alphaOut[p] = bgMask[p] ? 0 : data[p * 4 + 3];
        }

        for (let y = 1; y < h - 1; y++) {
            const rOff = y * w;
            for (let x = 1; x < w - 1; x++) {
                const p = rOff + x;
                if (bgMask[p]) continue;
                let bgNeighbors = 0;
                if (bgMask[p - 1]) bgNeighbors++;
                if (bgMask[p + 1]) bgNeighbors++;
                if (bgMask[p - w]) bgNeighbors++;
                if (bgMask[p + w]) bgNeighbors++;
                if (bgMask[p - w - 1]) bgNeighbors++;
                if (bgMask[p - w + 1]) bgNeighbors++;
                if (bgMask[p + w - 1]) bgNeighbors++;
                if (bgMask[p + w + 1]) bgNeighbors++;

                if (bgNeighbors > 0) {
                    const idx4 = p * 4;
                    const factor = Math.max(0.22, 1 - (bgNeighbors * 0.11));
                    alphaOut[p] = Math.round(alphaOut[p] * factor);
                    // Descontaminar halo del color de fondo en el contorno
                    const invA = 1 - factor;
                    data[idx4] = Math.max(0, Math.min(255, Math.round((data[idx4] - meanR * invA * 0.65) / (1 - invA * 0.65))));
                    data[idx4 + 1] = Math.max(0, Math.min(255, Math.round((data[idx4 + 1] - meanG * invA * 0.65) / (1 - invA * 0.65))));
                    data[idx4 + 2] = Math.max(0, Math.min(255, Math.round((data[idx4 + 2] - meanB * invA * 0.65) / (1 - invA * 0.65))));
                }
            }
        }

        for (let p = 0; p < totalPx; p++) {
            data[p * 4 + 3] = alphaOut[p];
        }
        ctx.putImageData(imgData, 0, 0);
        return { canvas: workCanvas, width: w, height: h, alreadyTransparent: false, complexBg: isComplexScene };
    }

    function frameTransparentFurnitureCanvas(sourceCanvas, targetW = 1000, targetH = 750, quality = 0.90) {
        const sw = sourceCanvas.width;
        const sh = sourceCanvas.height;
        const sCtx = sourceCanvas.getContext('2d', { willReadFrequently: true });
        const data = sCtx.getImageData(0, 0, sw, sh).data;

        let minX = sw, minY = sh, maxX = 0, maxY = 0;
        let solidCount = 0;

        for (let y = 0; y < sh; y++) {
            for (let x = 0; x < sw; x++) {
                const idx = (y * sw + x) * 4;
                if (data[idx + 3] > 22) {
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                    solidCount++;
                }
            }
        }

        const boxW = maxX - minX + 1;
        const boxH = maxY - minY + 1;
        const cropX = (solidCount > 30 && boxW >= 12 && boxH >= 12) ? minX : 0;
        const cropY = (solidCount > 30 && boxW >= 12 && boxH >= 12) ? minY : 0;
        const cropW = (solidCount > 30 && boxW >= 12 && boxH >= 12) ? boxW : sw;
        const cropH = (solidCount > 30 && boxW >= 12 && boxH >= 12) ? boxH : sh;

        const outCanvas = document.createElement('canvas');
        outCanvas.width = targetW;
        outCanvas.height = targetH;
        const outCtx = outCanvas.getContext('2d');
        // TRANSPARENCIA PURA (sin fondo blanco) y proporción óptica pareja para todas las tarjetas
        outCtx.clearRect(0, 0, targetW, targetH);

        const maxAllowedW = targetW * 0.86;
        const maxAllowedH = targetH * 0.82;
        const maxOpticalArea = targetW * targetH * 0.48;
        const areaScale = Math.sqrt(maxOpticalArea / Math.max(1, cropW * cropH));
        const scale = Math.min(maxAllowedW / cropW, maxAllowedH / cropH, areaScale);

        const drawW = Math.max(1, Math.round(cropW * scale));
        const drawH = Math.max(1, Math.round(cropH * scale));
        const drawX = Math.round((targetW - drawW) / 2);
        const drawY = Math.round((targetH - drawH) * 0.55);

        outCtx.imageSmoothingEnabled = true;
        outCtx.imageSmoothingQuality = 'high';
        outCtx.drawImage(sourceCanvas, cropX, cropY, cropW, cropH, drawX, drawY, drawW, drawH);

        try {
            const webp = outCanvas.toDataURL('image/webp', quality);
            if (webp && webp.startsWith('data:image/webp')) return webp;
        } catch (e) {}
        return outCanvas.toDataURL('image/png');
    }

    function encodeOpaqueSwatchOrScene(img, maxDim = 800, quality = 0.88) {
        const srcW = img.naturalWidth || img.width;
        const srcH = img.naturalHeight || img.height;
        const scale = Math.min(1, maxDim / Math.max(1, srcW, srcH));
        const outW = Math.max(1, Math.round(srcW * scale));
        const outH = Math.max(1, Math.round(srcH * scale));
        const c = document.createElement('canvas');
        c.width = outW;
        c.height = outH;
        const ctx = c.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, outW, outH);
        try {
            const webp = c.toDataURL('image/webp', quality);
            if (webp && webp.startsWith('data:image/webp')) return webp;
        } catch (e) {}
        return c.toDataURL('image/png');
    }

    function loadImageElementFromAnySource(src) {
        return new Promise((resolve) => {
            if (!src) { resolve(null); return; }
            if (typeof src === 'string') {
                const img = new Image();
                if (src.startsWith('https://') || src.startsWith('http://')) {
                    img.crossOrigin = 'anonymous';
                }
                img.onload = () => resolve({ img, rawDataUrl: src, blob: null });
                img.onerror = () => resolve(null);
                img.src = src;
                return;
            }
            const reader = new FileReader();
            reader.onload = (ev) => {
                const rawB64 = ev.target.result;
                const img = new Image();
                img.onload = () => resolve({ img, rawDataUrl: rawB64, blob: src });
                img.onerror = () => resolve(null);
                img.src = rawB64;
            };
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(src);
        });
    }

    async function compressImageFast(src, maxWidth = 1000, maxHeight = 750, quality = 0.90, options = {}) {
        if (!src) return null;
        const mode = (options && options.mode) || 'cutout'; // 'cutout' | 'swatch' | 'auto'
        const forceAi = !!(options && options.forceAi);

        const loaded = await loadImageElementFromAnySource(src);
        if (!loaded || !loaded.img) {
            return typeof src === 'string' ? src : null;
        }

        const { img, rawDataUrl, blob } = loaded;

        // 1. Muestras de tela o madera: conservar textura 100% íntegra sin recorte de fondo
        if (mode === 'swatch') {
            try {
                return encodeOpaqueSwatchOrScene(img, Math.min(maxWidth || 600, 600), quality);
            } catch (e) {
                return rawDataUrl;
            }
        }

        // 2. Recorte de fondo automático para vistas de muebles y foto de inicio
        try {
            let stripResult = null;
            if (!forceAi) {
                stripResult = analyzeAndStripBackgroundCanvas(img, Math.max(maxWidth || 1000, 1000));
            }

            // Si es fondo complejo o se solicitó IA explícitamente, usar segmentación neuronal en navegador (@imgly/background-removal)
            if (forceAi || (stripResult && stripResult.complexBg && mode === 'cutout')) {
                const aiRemove = await loadImglyBackgroundRemover();
                if (aiRemove) {
                    try {
                        let inputForAi = blob;
                        if (!inputForAi && rawDataUrl) {
                            const resp = await fetch(rawDataUrl);
                            inputForAi = await resp.blob();
                        }
                        if (inputForAi) {
                            const outBlob = await aiRemove(inputForAi, {
                                model: 'small',
                                output: { format: 'image/png', quality: 0.92 }
                            });
                            const aiLoaded = await loadImageElementFromAnySource(outBlob);
                            if (aiLoaded && aiLoaded.img) {
                                const c = document.createElement('canvas');
                                c.width = aiLoaded.img.naturalWidth || aiLoaded.img.width;
                                c.height = aiLoaded.img.naturalHeight || aiLoaded.img.height;
                                c.getContext('2d').drawImage(aiLoaded.img, 0, 0);
                                return frameTransparentFurnitureCanvas(c, 1000, 750, quality);
                            }
                        }
                    } catch (aiErr) {
                        console.warn('[Creata AI BG Fallback to FloodFill]', aiErr);
                        if (!stripResult) {
                            stripResult = analyzeAndStripBackgroundCanvas(img, Math.max(maxWidth || 1000, 1000));
                        }
                    }
                }
            }

            // En modo 'auto' (slot Ambiente): si es foto real de sala ambientada compleja, conservar escena; si es fondo de estudio, dejar sin fondo y pareja
            if (mode === 'auto' && stripResult && stripResult.complexBg && !stripResult.alreadyTransparent && !forceAi) {
                return encodeOpaqueSwatchOrScene(img, Math.max(maxWidth || 1200, 1200), quality);
            }

            if (stripResult && stripResult.canvas) {
                return frameTransparentFurnitureCanvas(stripResult.canvas, 1000, 750, quality);
            }
        } catch (err) {
            console.warn('[Creata Cutout Warning]', err);
        }

        try {
            return encodeOpaqueSwatchOrScene(img, Math.max(maxWidth || 1000, 1000), quality);
        } catch (e) {
            return rawDataUrl;
        }
    }

    let __gvizSeq = 0;
    let __discoverPromise = null;

    function gvizJsonpQuery(sheetName, timeoutMs = 6000) {
        return new Promise((resolve) => {
            if (!global.document || !CREATA_CLOUD_CONFIG.sheetId) {
                resolve(null);
                return;
            }
            const cbName = `__creataGvizCb_${Date.now()}_${++__gvizSeq}`;
            const script = global.document.createElement('script');
            let settled = false;

            const cleanup = () => {
                try { delete global[cbName]; } catch (e) { global[cbName] = undefined; }
                if (script && script.parentNode) script.parentNode.removeChild(script);
            };

            const timer = setTimeout(() => {
                if (settled) return;
                settled = true;
                cleanup();
                resolve(null);
            }, timeoutMs);

            global[cbName] = (payload) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                cleanup();
                if (payload && payload.status === 'ok' && payload.table) {
                    resolve(payload.table);
                } else {
                    resolve(null);
                }
            };

            script.onerror = () => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                cleanup();
                resolve(null);
            };

            const sid = encodeURIComponent(CREATA_CLOUD_CONFIG.sheetId);
            const sname = encodeURIComponent(sheetName);
            script.async = true;
            script.src = `https://docs.google.com/spreadsheets/d/${sid}/gviz/tq?tqx=responseHandler:${cbName}&sheet=${sname}&_t=${Date.now()}`;
            (global.document.head || global.document.body).appendChild(script);
        });
    }

    function gvizCell(row, idx) {
        if (!row || !Array.isArray(row.c) || !row.c[idx]) return '';
        const c = row.c[idx];
        if (c.v !== null && c.v !== undefined) return c.v;
        return c.f || '';
    }

    async function discoverWebAppUrlFromSheet() {
        if (CREATA_CLOUD_CONFIG.getApiUrl()) return CREATA_CLOUD_CONFIG.getApiUrl();
        if (__discoverPromise) return __discoverPromise;
        __discoverPromise = (async () => {
            try {
                const tbl = await gvizJsonpQuery('_CREATA_CONFIG', 4500);
                if (tbl && Array.isArray(tbl.rows)) {
                    for (let i = 0; i < tbl.rows.length; i++) {
                        const k = String(gvizCell(tbl.rows[i], 0) || '').trim().toUpperCase();
                        const v = String(gvizCell(tbl.rows[i], 1) || '').trim();
                        if ((k === 'WEBAPP_URL' || !k) && /^https:\/\/script\.google\.com\/macros\/s\/.+\/exec/i.test(v)) {
                            CREATA_CLOUD_CONFIG.setApiUrl(v);
                            return v;
                        }
                    }
                    if (Array.isArray(tbl.cols)) {
                        for (let j = 0; j < tbl.cols.length; j++) {
                            const lbl = String((tbl.cols[j] && tbl.cols[j].label) || '').trim();
                            if (/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec/i.test(lbl)) {
                                CREATA_CLOUD_CONFIG.setApiUrl(lbl);
                                return lbl;
                            }
                        }
                    }
                }
            } catch (e) {}
            return CREATA_CLOUD_CONFIG.getApiUrl();
        })();
        const res = await __discoverPromise;
        __discoverPromise = null;
        return res;
    }

    function fmtMeasureClient_(val, unit) {
        const s = String(val === null || val === undefined ? '' : val).trim();
        if (!s || s === '0') return '';
        return s.toLowerCase().includes(unit.toLowerCase()) ? s : `${s} ${unit}`;
    }

    function normalizeCategoryClient_(cat) {
        const c = String(cat || '').toUpperCase();
        if (c.includes('SALA') || c.includes('SOF')) return 'SALAS & SOFÁS';
        if (c.includes('SILLA') || c.includes('SILL')) return 'SILLAS & SILLONES';
        if (c.includes('COMEDOR') || c.includes('COMED')) return 'COMEDORES';
        if (c.includes('BUFET') || c.includes('CREDEN')) return 'BUFETERAS & CREDENZAS';
        if (c.includes('CENTRO') || c.includes('LATERAL')) return 'MESAS DE CENTRO';
        if (c.includes('REC') || c.includes('CAMA') || c.includes('BUR') || c.includes('CÓMODA') || c.includes('COMODA') || c.includes('CAJONERA')) return 'RECÁMARAS';
        return 'COMPLEMENTOS';
    }

    function resolveDriveUrlClient_(rawVal, ...lookupKeys) {
        const rawStr = String(rawVal || '').trim();
        if (/^https?:\/\//i.test(rawStr)) return rawStr;
        const candidates = [...lookupKeys, rawStr];
        for (let i = 0; i < candidates.length; i++) {
            const k = String(candidates[i] || '').trim().toUpperCase();
            if (k && DRIVE_ID_BY_KEY[k]) {
                return `https://drive.google.com/file/d/${DRIVE_ID_BY_KEY[k]}/view?usp=sharing`;
            }
        }
        return '';
    }

    function parseMasterTabsFromGviz_(salasTbl, indivTbl) {
        const invCols = CREATA_CLOUD_CONFIG.inventoryLocations || [];
        const salasById = {};
        const salasList = [];

        if (salasTbl && Array.isArray(salasTbl.rows)) {
            let curPieces = [];
            salasTbl.rows.forEach((sr) => {
                const sid = String(gvizCell(sr, 0) || '').trim();
                if (!sid || sid.toUpperCase() === 'ID SALA') return;
                const sname = scrubForbiddenPublicText(String(gvizCell(sr, 1) || '').trim());
                const psku = String(gvizCell(sr, 2) || '').trim().toUpperCase();
                const pname = scrubForbiddenPublicText(String(gvizCell(sr, 3) || '').trim());
                const qtyRaw = gvizCell(sr, 4);
                const qtyParsed = (qtyRaw === '' || qtyRaw === null || qtyRaw === undefined) ? 0 : Number(qtyRaw);
                const sheetQty = isNaN(qtyParsed) ? 0 : qtyParsed;
                const showFlag = String(gvizCell(sr, 12) || '').trim().toUpperCase();
                const rawLinkCell = gvizCell(sr, 13);

                const rowInv = {};
                invCols.forEach((locName, idx) => {
                    const rawInv = gvizCell(sr, 14 + idx);
                    if (rawInv !== '' && rawInv !== null && rawInv !== undefined) {
                        const n = Number(rawInv);
                        if (!isNaN(n) && n > 0) rowInv[locName] = n;
                    }
                });

                if (showFlag.includes('SÍ') || showFlag.includes('SI') || psku.includes('-TOTAL')) {
                    const totalPrice = parseCurrencyValue(gvizCell(sr, 10));
                    const sumChecked = curPieces
                        .filter((x) => x.checked)
                        .reduce((acc, x) => acc + (x.price * (x.qty || 1)), 0);
                    const finalTotal = totalPrice > 0 ? totalPrice : sumChecked;
                    const driveUrl = resolveDriveUrlClient_(rawLinkCell, sid, ...(curPieces.map((x) => x.sku)));
                    const salaObj = {
                        id: sid,
                        name: sname || sid,
                        totalPrice: finalTotal,
                        dimsSummary: String(gvizCell(sr, 11) || '').trim(),
                        driveUrl: driveUrl,
                        pieces: curPieces.slice(),
                        inventory: rowInv
                    };
                    salasById[sid.toUpperCase()] = salaObj;
                    salasList.push(salaObj);
                    curPieces = [];
                } else if (psku) {
                    curPieces.push({
                        sku: psku,
                        code: psku.slice(-6) || 'MOD',
                        name: pname || psku,
                        qty: sheetQty > 0 ? sheetQty : 1,
                        sheetQty: sheetQty,
                        checked: sheetQty > 0,
                        optional: sheetQty === 0,
                        width: fmtMeasureClient_(gvizCell(sr, 5), 'cm'),
                        depth: fmtMeasureClient_(gvizCell(sr, 6), 'cm'),
                        height: fmtMeasureClient_(gvizCell(sr, 7), 'cm'),
                        price: parseCurrencyValue(gvizCell(sr, 8)),
                        photoSlot: `view${Math.min(4, curPieces.length + 1)}`,
                        inventory: rowInv
                    });
                }
            });
        }

        const indivList = [];
        const indivBySku = {};
        if (indivTbl && Array.isArray(indivTbl.rows)) {
            indivTbl.rows.forEach((ir, rIdx) => {
                const sku = String(gvizCell(ir, 1) || '').trim().toUpperCase();
                if (!sku || sku === 'SKU') return;
                const prov = String(gvizCell(ir, 0) || 'CREATA').trim();
                const name = scrubForbiddenPublicText(String(gvizCell(ir, 2) || '').trim());
                if (!name) return;
                const cat = normalizeCategoryClient_(gvizCell(ir, 3));
                const rawFile = gvizCell(ir, 12);
                const rawLink = gvizCell(ir, 13);
                const driveUrl = resolveDriveUrlClient_(rawLink, sku, rawFile);
                const rowInv = {};
                invCols.forEach((locName, idx) => {
                    const rawInv = gvizCell(ir, 14 + idx);
                    if (rawInv !== '' && rawInv !== null && rawInv !== undefined) {
                        const n = Number(rawInv);
                        if (!isNaN(n) && n > 0) rowInv[locName] = n;
                    }
                });
                const pkgRaw = String(gvizCell(ir, 9) || '1 bulto').trim();
                const item = {
                    rowIdx: rIdx,
                    provider: prov,
                    sku: sku,
                    name: name,
                    category: cat,
                    width: fmtMeasureClient_(gvizCell(ir, 4), 'cm'),
                    depth: fmtMeasureClient_(gvizCell(ir, 5), 'cm'),
                    height: fmtMeasureClient_(gvizCell(ir, 6), 'cm'),
                    seat: fmtMeasureClient_(gvizCell(ir, 7), 'cm'),
                    volume: fmtMeasureClient_(gvizCell(ir, 8), 'm³'),
                    packages: /bulto|pieza/i.test(pkgRaw) ? pkgRaw : `${pkgRaw} bultos`,
                    priceNum: parseCurrencyValue(gvizCell(ir, 10)),
                    materials: scrubForbiddenPublicText(String(gvizCell(ir, 11) || '').trim()),
                    driveUrl: driveUrl,
                    inventory: rowInv
                };
                indivList.push(item);
                if (!indivBySku[sku]) indivBySku[sku] = [];
                indivBySku[sku].push(item);
            });
        }

        global.LIVE_SHEET_SALAS = salasById;
        global.LIVE_SHEET_INDIV = indivBySku;
        return { salasById, salasList, indivList, indivBySku };
    }

    function matchSalaKeyForProduct_(modelName, prodId, salasById) {
        const upId = String(prodId || '').trim().toUpperCase();
        if (salasById[upId]) return upId;
        const upName = String(modelName || '').trim().toUpperCase();
        if (upName.includes('MATERA') && salasById['SALA-MATERA']) return 'SALA-MATERA';
        if (upName.includes('MARENO') && !upName.includes('LOVE') && salasById['SALA-MARENO']) return 'SALA-MARENO';
        if (upName.includes('MONET') && !upName.includes('LOVE') && salasById['SALA-MONET']) return 'SALA-MONET';
        const foundKey = Object.keys(salasById).find((k) => {
            const s = salasById[k];
            return s && s.name && upName === s.name.toUpperCase();
        });
        return foundKey || '';
    }

    function buildArchivedSalaProduct_(sdata) {
        const pList = (sdata.pieces || []).map((x) => Object.assign({}, x));
        const activeP = pList.filter((x) => x.checked !== false);
        const totalQty = activeP.reduce((acc, x) => acc + (parseInt(x.qty, 10) || 1), 0) || pList.length || 1;
        const allSkus = pList.map((x) => x.sku).filter(Boolean).join(' / ') || (sdata.id + '-SET');
        const widthStr = pList.map((x) => x.width.replace(/\s*cm$/i, '').trim()).filter(Boolean).join(' / ');
        const fullWidth = widthStr ? `${widthStr} cm` : '';
        const depth = (pList[0] && pList[0].depth) || '';
        const height = (pList[0] && pList[0].height) || '';
        const priceFmt = formatCurrencyMXN(sdata.totalPrice || 0);
        return {
            id: sdata.id,
            archived: true,
            provider_abbr: 'ARM',
            provider: 'ARM',
            sku: allSkus,
            model_name: sdata.name,
            category: 'SALAS & SOFÁS',
            is_multipiece: pList.length > 1,
            width: fullWidth,
            depth: depth,
            height: height,
            seat: '',
            packages: `${totalQty} ${totalQty === 1 ? 'bulto' : 'bultos'}`,
            volume: '',
            price: priceFmt,
            materials: scrubForbiddenPublicText(sdata.dimsSummary || ''),
            drive_ficha_url: sdata.driveUrl || '',
            sala_modules: pList,
            inventory: sdata.inventory || {},
            variants: [{
                id: `${sdata.id}-v1`,
                name: sdata.name,
                finish_type: 'TELA',
                color_label: inferColorLabelFromData('', sdata.dimsSummary || (pList[0] && pList[0].name) || '', ''),
                swatch_hex: '#B8893E',
                swatch_img: '',
                hero_b64: '',
                width: fullWidth,
                depth: depth,
                height: height,
                seat: '',
                packages: `${totalQty} ${totalQty === 1 ? 'bulto' : 'bultos'}`,
                volume: '',
                materials: scrubForbiddenPublicText(sdata.dimsSummary || ''),
                drive_ficha_url: sdata.driveUrl || '',
                gallery: { ambiente: '', finish: '', finishes: [], fabric: '', view1: '', view2: '', view3: '', view4: '', all_views: [] }
            }]
        };
    }

    function buildArchivedIndivProduct_(it) {
        const pid = 'IND-' + it.sku;
        const priceFmt = formatCurrencyMXN(it.priceNum || 0);
        return {
            id: pid,
            archived: true,
            provider_abbr: it.provider || 'CREATA',
            provider: it.provider || 'CREATA',
            sku: it.sku,
            model_name: it.name,
            category: it.category || 'COMPLEMENTOS',
            is_multipiece: false,
            width: it.width,
            depth: it.depth,
            height: it.height,
            seat: it.seat,
            packages: it.packages || '1 bulto',
            volume: it.volume,
            price: priceFmt,
            materials: it.materials,
            drive_ficha_url: it.driveUrl || '',
            sala_modules: [],
            inventory: it.inventory || {},
            variants: [{
                id: `${pid}-v1`,
                name: it.name,
                finish_type: inferFinishType(inferColorLabelFromData('', it.materials, ''), it.materials),
                color_label: inferColorLabelFromData('', it.materials, ''),
                swatch_hex: '#B8893E',
                swatch_img: '',
                hero_b64: '',
                width: it.width,
                depth: it.depth,
                height: it.height,
                seat: it.seat,
                packages: it.packages || '1 bulto',
                volume: it.volume,
                materials: it.materials,
                drive_ficha_url: it.driveUrl || '',
                gallery: { ambiente: '', finish: '', finishes: [], fabric: '', view1: '', view2: '', view3: '', view4: '', all_views: [] }
            }]
        };
    }

    async function fetchDirectGvizCatalog(mode = 'public', timeoutMs = 15000) {
        const effTimeout = Math.max(Number(timeoutMs) || 0, 15000);
        const [prodTbl, pieceTbl, salasTbl, indivTbl] = await Promise.all([
            gvizJsonpQuery('CATALOGO_PRODUCTOS', effTimeout),
            gvizJsonpQuery('PIEZAS_MODULOS', effTimeout),
            gvizJsonpQuery('SALAS_MODULARES', effTimeout),
            gvizJsonpQuery('MUEBLES_INDIVIDUALES', effTimeout)
        ]);

        const master = parseMasterTabsFromGviz_(salasTbl, indivTbl);
        const hasCatalogRows = !!(prodTbl && Array.isArray(prodTbl.rows) && prodTbl.rows.some((r) => {
            const id = String(gvizCell(r, 0) || '').trim();
            return id && id.toUpperCase() !== 'ID_INTERNO';
        }));

        // Siempre cargamos primero lo guardado en CATALOGO_PRODUCTOS (ej. fotos nuevas o cambios de VISIBLE/ARCHIVADO),
        // y completamos en vivo cualquier mueble de los 47 base que aún no tenga fila en CATALOGO_PRODUCTOS
        // leyendo directamente SALAS_MODULARES (=CALCULAR_MONTO_SKU) y MUEBLES_INDIVIDUALES (=CALCULAR_PRECIO_SKU).
        if (!hasCatalogRows && master.salasList.length === 0 && master.indivList.length === 0) {
            return null;
        }

        const invCols = CREATA_CLOUD_CONFIG.inventoryLocations || [];
        const piecesByParent = {};
        if (pieceTbl && Array.isArray(pieceTbl.rows)) {
            pieceTbl.rows.forEach((pr) => {
                const parentId = String(gvizCell(pr, 0) || '').trim();
                if (!parentId || parentId.toUpperCase() === 'ID_PADRE') return;
                const qtyRaw = gvizCell(pr, 4);
                const qtyParsed = (qtyRaw === '' || qtyRaw === null || qtyRaw === undefined) ? 1 : Number(qtyRaw);
                const sheetQty = isNaN(qtyParsed) ? 1 : qtyParsed;
                const pieceInv = {};
                invCols.forEach((locName, idx) => {
                    const rawInv = gvizCell(pr, 10 + idx);
                    if (rawInv !== '' && rawInv !== null && rawInv !== undefined) {
                        const n = Number(rawInv);
                        if (!isNaN(n) && n > 0) pieceInv[locName] = n;
                    }
                });
                const pSku = String(gvizCell(pr, 2) || '').trim().toUpperCase();
                if (!piecesByParent[parentId]) piecesByParent[parentId] = [];
                piecesByParent[parentId].push({
                    sku: pSku,
                    code: pSku.slice(-6) || 'MOD',
                    name: scrubForbiddenPublicText(String(gvizCell(pr, 3) || '').trim()),
                    qty: sheetQty > 0 ? sheetQty : 1,
                    sheetQty: sheetQty,
                    width: fmtMeasureClient_(gvizCell(pr, 5), 'cm'),
                    depth: fmtMeasureClient_(gvizCell(pr, 6), 'cm'),
                    height: fmtMeasureClient_(gvizCell(pr, 7), 'cm'),
                    price: parseCurrencyValue(gvizCell(pr, 8)),
                    checked: sheetQty > 0,
                    optional: sheetQty === 0,
                    inventory: pieceInv
                });
            });
        }

        const baseRaw = (mode === 'admin' && (global.ADMIN_RAW_P1 || global.ADMIN_RAW_P2))
            ? [...(global.ADMIN_RAW_P1 || []), ...(global.ADMIN_RAW_P2 || [])]
            : [...(global.CREATA_CATALOG_P1 || global.ADMIN_RAW_P1 || []), ...(global.CREATA_CATALOG_P2 || global.ADMIN_RAW_P2 || [])];

        const baseById = {};
        const baseByModel = {};
        baseRaw.forEach((bp) => {
            if (!bp) return;
            if (bp.id) baseById[String(bp.id).trim().toUpperCase()] = bp;
            const bm = scrubForbiddenPublicText(String(bp.model_name || '')).toUpperCase();
            if (bm) baseByModel[bm] = bp;
        });

        const out = [];
        const seenIds = new Set();
        const seenSkus = new Set();
        const seenModels = new Set();
        const usedSalasInCat = {};

        const catalogRows = (prodTbl && Array.isArray(prodTbl.rows)) ? prodTbl.rows : [];
        catalogRows.forEach((r) => {
            const id = String(gvizCell(r, 0) || '').trim();
            if (!id || id.toUpperCase() === 'ID_INTERNO') return;
            seenIds.add(id.toUpperCase());

            let sku = String(gvizCell(r, 3) || '').trim();
            sku.split('/').forEach((s) => {
                if (s.trim()) seenSkus.add(s.trim().toUpperCase());
            });

            const modelName = scrubForbiddenPublicText(String(gvizCell(r, 4) || '').trim());
            if (!modelName) return;
            seenModels.add(modelName.toUpperCase());

            const estado = String(gvizCell(r, 1) || 'ARCHIVADO').trim().toUpperCase();
            const isArchived = estado !== 'VISIBLE';
            if (mode === 'public' && isArchived) return;

            const prov = String(gvizCell(r, 2) || 'CREATA').trim();

            const cat = normalizeCategoryClient_(gvizCell(r, 5));
            const isMulti = String(gvizCell(r, 6) || '').trim().toUpperCase() === 'SI';
            const width = fmtMeasureClient_(gvizCell(r, 8), 'cm');
            const depth = fmtMeasureClient_(gvizCell(r, 9), 'cm');
            const height = fmtMeasureClient_(gvizCell(r, 10), 'cm');
            const seat = fmtMeasureClient_(gvizCell(r, 11), 'cm');
            const pkgRaw = String(gvizCell(r, 12) || '1').trim();
            const packages = /bulto|pieza/i.test(pkgRaw) ? pkgRaw : `${pkgRaw} bultos`;
            const volume = fmtMeasureClient_(gvizCell(r, 13), 'm³');
            let priceNum = parseCurrencyValue(gvizCell(r, 14));
            const materials = scrubForbiddenPublicText(String(gvizCell(r, 15) || '').trim());
            const driveUrl = resolveDriveUrlClient_(gvizCell(r, 16), id, sku);
            let heroUrl = isValidPhotoUrl(String(gvizCell(r, 17) || '')) ? String(gvizCell(r, 17)).trim() : '';
            const ambUrl = isValidPhotoUrl(String(gvizCell(r, 18) || '')) ? String(gvizCell(r, 18)).trim() : '';
            let finUrl = isValidPhotoUrl(String(gvizCell(r, 19) || '')) ? String(gvizCell(r, 19)).trim() : '';

            let viewsArr = [];
            try {
                const rawJson = String(gvizCell(r, 20) || '[]').trim();
                const parsedV = JSON.parse(rawJson || '[]');
                if (Array.isArray(parsedV)) {
                    viewsArr = parsedV.filter((u) => isValidPhotoUrl(String(u || ''))).map((u) => String(u).trim());
                }
            } catch (e) {}

            // Si anteriormente una foto de muestra (-finish-) se copió accidentalmente a portada sin haber foto de mueble, vincularla solo a tela/acabado
            if (heroUrl && /-finish-\d+\./i.test(heroUrl) && !ambUrl && viewsArr.length === 0) {
                if (!finUrl) finUrl = heroUrl;
                heroUrl = '';
            }

            // Desempaquetar metadatos enriquecidos de variantes (nombre exacto de tela/madera, icono 🧵/🪵, color hex y múltiples opciones)
            const rawMetaCell = String(gvizCell(r, 21) || '').trim();
            let unpackedDriveId = rawMetaCell;
            let savedMetaVars = null;
            if (rawMetaCell.startsWith('{')) {
                try {
                    const parsedMeta = JSON.parse(rawMetaCell);
                    if (parsedMeta && parsedMeta._cm) {
                        unpackedDriveId = String(parsedMeta.did || '');
                        if (Array.isArray(parsedMeta.vars) && parsedMeta.vars.length > 0) {
                            savedMetaVars = parsedMeta.vars;
                        }
                    }
                } catch (e) {}
            }

            const baseMatch = baseById[id.toUpperCase()] || baseByModel[modelName.toUpperCase()] || null;
            const baseVar0 = (baseMatch && Array.isArray(baseMatch.variants) && baseMatch.variants[0]) ? baseMatch.variants[0] : {};

            const prodInv = {};
            invCols.forEach((locName, idx) => {
                const rawInv = gvizCell(r, 23 + idx);
                if (rawInv !== '' && rawInv !== null && rawInv !== undefined) {
                    const n = Number(rawInv);
                    if (!isNaN(n) && n > 0) prodInv[locName] = n;
                }
            });

            let mods = piecesByParent[id] ? piecesByParent[id].slice() : [];
            const sKey = matchSalaKeyForProduct_(modelName, id, master.salasById);
            if (sKey && master.salasById[sKey]) {
                usedSalasInCat[sKey] = true;
                const masterPieces = master.salasById[sKey].pieces || [];
                if (masterPieces.length > 0) {
                    const savedBySku = {};
                    mods.forEach((m) => { if (m && m.sku) savedBySku[m.sku] = m; });
                    mods = masterPieces.map((mp) => {
                        const sv = savedBySku[mp.sku];
                        if (!sv) return Object.assign({}, mp);
                        return Object.assign({}, mp, {
                            checked: sv.checked,
                            qty: sv.qty || mp.qty
                        });
                    });
                }
                if (mods.length > 0) {
                    sku = mods.map((m) => m.sku).filter(Boolean).join(' / ') || sku;
                    mods.forEach((m) => { if (m.sku) seenSkus.add(m.sku); });
                }
                if (priceNum <= 0 && master.salasById[sKey].totalPrice > 0) {
                    priceNum = master.salasById[sKey].totalPrice;
                }
            }

            let builtVariants = [];
            if (savedMetaVars && savedMetaVars.length > 0) {
                builtVariants = savedMetaVars.map((sv, vIdx) => {
                    const isFirst = vIdx === 0;
                    const vLabel = inferColorLabelFromData(sv.cl, sv.mat || materials, isFirst ? baseVar0.color_label : '');
                    const vType = sv.ft || inferFinishType(vLabel, sv.mat || materials);
                    const linkedFinish = isValidPhotoUrl(sv.sw || '') ? sv.sw : (isValidPhotoUrl(sv.fin || '') ? sv.fin : (isFirst ? finUrl : ''));
                    const vHeroRaw = isValidPhotoUrl(sv.hero || '') ? sv.hero : (isFirst ? heroUrl : '');
                    const vAmbRaw = isValidPhotoUrl(sv.amb || '') ? sv.amb : (isFirst ? ambUrl : '');
                    const vHero = (vHeroRaw && /-finish-\d+\./i.test(vHeroRaw) && !vAmbRaw) ? '' : vHeroRaw;
                    const vViews = Array.isArray(sv.vw) ? sv.vw.map((u) => (isValidPhotoUrl(String(u || '')) ? String(u).trim() : '')) : (isFirst ? [viewsArr[0] || '', viewsArr[1] || '', viewsArr[2] || '', viewsArr[3] || ''] : ['', '', '', '']);
                    return {
                        id: `${id}-v${vIdx + 1}`,
                        name: modelName,
                        finish_type: vType,
                        color_label: vLabel,
                        swatch_hex: sv.hex || baseVar0.swatch_hex || (vType === 'MADERA' ? '#A2703F' : '#B8893E'),
                        swatch_img: linkedFinish,
                        hero_b64: vHero,
                        width: sv.w !== undefined ? sv.w : (isFirst ? width : ''),
                        depth: sv.d !== undefined ? sv.d : (isFirst ? depth : ''),
                        height: sv.h !== undefined ? sv.h : (isFirst ? height : ''),
                        seat: sv.s !== undefined ? sv.s : (isFirst ? seat : ''),
                        packages: sv.pk !== undefined ? sv.pk : (isFirst ? packages : ''),
                        volume: sv.vl !== undefined ? sv.vl : (isFirst ? volume : ''),
                        materials: sv.mat !== undefined ? scrubForbiddenPublicText(sv.mat) : (isFirst ? materials : ''),
                        drive_ficha_url: sv.du || driveUrl,
                        gallery: {
                            ambiente: vAmbRaw,
                            finish: linkedFinish,
                            finishes: linkedFinish ? [linkedFinish] : [],
                            fabric: linkedFinish,
                            view1: vViews[0] || '',
                            view2: vViews[1] || '',
                            view3: vViews[2] || '',
                            view4: vViews[3] || '',
                            all_views: vViews.filter(Boolean)
                        }
                    };
                });
            } else {
                const resolvedLabel = inferColorLabelFromData('', materials, baseVar0.color_label);
                const resolvedType = baseVar0.finish_type || inferFinishType(resolvedLabel, materials);
                builtVariants = [{
                    id: `${id}-v1`,
                    name: modelName,
                    finish_type: resolvedType,
                    color_label: resolvedLabel,
                    swatch_hex: baseVar0.swatch_hex || (resolvedType === 'MADERA' ? '#A2703F' : '#B8893E'),
                    swatch_img: finUrl,
                    hero_b64: heroUrl,
                    width: width,
                    depth: depth,
                    height: height,
                    seat: seat,
                    packages: packages,
                    volume: volume,
                    materials: materials,
                    drive_ficha_url: driveUrl,
                    gallery: {
                        ambiente: ambUrl,
                        finish: finUrl,
                        finishes: finUrl ? [finUrl] : [],
                        fabric: finUrl,
                        view1: viewsArr[0] || '',
                        view2: viewsArr[1] || '',
                        view3: viewsArr[2] || '',
                        view4: viewsArr[3] || '',
                        all_views: viewsArr
                    }
                }];
            }

            const prodObj = {
                id: id,
                archived: isArchived,
                provider_abbr: prov,
                provider: prov,
                model_name: modelName,
                category: cat,
                is_multipiece: isMulti || mods.length > 1,
                width: width,
                depth: depth,
                height: height,
                seat: seat,
                packages: packages,
                volume: volume,
                price: formatCurrencyMXN(priceNum),
                materials: materials,
                drive_ficha_url: driveUrl,
                sala_modules: mods,
                variants: builtVariants
            };

            if (mode === 'admin') {
                prodObj.sku = sku;
                prodObj.drive_file_id = unpackedDriveId;
                prodObj.inventory = prodInv;
                out.push(prodObj);
            } else {
                const cleanPub = sanitizePublicProduct(prodObj);
                if (cleanPub) out.push(cleanPub);
            }
        });

        // Completar los muebles base visibles (47) que aún no tengan fila guardada en CATALOGO_PRODUCTOS
        const usedIndivRows = {};

        baseRaw.forEach((bp) => {
            if (!bp) return;
            const pid = String(bp.id || '').trim();
            if (pid && seenIds.has(pid.toUpperCase())) return;
            const bpModel = scrubForbiddenPublicText(String(bp.model_name || '')).toUpperCase();
            if (bpModel && seenModels.has(bpModel)) return;
            let rawSku = String(bp.sku || pid).trim().toUpperCase();
            const skuParts = rawSku.split('/').map((s) => s.trim().toUpperCase()).filter(Boolean);
            if (skuParts.length > 0 && skuParts.every((s) => seenSkus.has(s))) return;

            const clone = JSON.parse(JSON.stringify(bp));
            const modelName = scrubForbiddenPublicText(String(clone.model_name || ''));
            clone.model_name = modelName;
            clone.category = normalizeCategoryClient_(clone.category);
            clone.archived = false;
            if (pid) seenIds.add(pid.toUpperCase());
            if (modelName) seenModels.add(modelName.toUpperCase());

            if (Array.isArray(clone.variants)) {
                clone.variants.forEach((v) => {
                    v.color_label = inferColorLabelFromData(v.color_label, v.materials || clone.materials, v.color_label);
                    v.finish_type = v.finish_type || inferFinishType(v.color_label, v.materials || clone.materials);
                    v.hero_b64 = '';
                    v.swatch_img = '';
                    v.gallery = { ambiente: '', finish: '', finishes: [], fabric: '', view1: '', view2: '', view3: '', view4: '', all_views: [] };
                });
            }

            skuParts.forEach((sk) => {
                seenSkus.add(sk);
                if (master.indivBySku[sk]) {
                    master.indivBySku[sk].forEach((m, mIdx) => {
                        usedIndivRows[m.rowIdx] = true;
                        if (mIdx === 0) {
                            if (m.priceNum > 0) clone.price = formatCurrencyMXN(m.priceNum);
                            if (!clone.drive_ficha_url && m.driveUrl) clone.drive_ficha_url = m.driveUrl;
                            clone.inventory = m.inventory || {};
                        }
                    });
                }
            });

            const sKey = matchSalaKeyForProduct_(modelName, pid, master.salasById);
            if (sKey && master.salasById[sKey]) {
                usedSalasInCat[sKey] = true;
                const sdata = master.salasById[sKey];
                const pList = sdata.pieces.map((x) => Object.assign({}, x));
                clone.sala_modules = pList;
                clone.is_multipiece = pList.length > 1;
                rawSku = pList.map((x) => x.sku).filter(Boolean).join(' / ') || rawSku;
                pList.forEach((x) => { if (x.sku) seenSkus.add(x.sku); });
                if (sdata.totalPrice > 0) clone.price = formatCurrencyMXN(sdata.totalPrice);
                if (sdata.driveUrl) {
                    clone.drive_ficha_url = sdata.driveUrl;
                    if (clone.variants && clone.variants[0]) clone.variants[0].drive_ficha_url = sdata.driveUrl;
                }
                clone.inventory = sdata.inventory || {};
            }

            if (mode === 'admin') {
                clone.sku = rawSku;
                out.push(clone);
            } else {
                const pub = sanitizePublicProduct(clone);
                if (pub) out.push(pub);
            }
        });

        // En modo admin, reflejar al instante cualquier fila adicional en SALAS_MODULARES o MUEBLES_INDIVIDUALES como ARCHIVADO
        if (mode === 'admin') {
            master.salasList.forEach((sdata) => {
                const sKey = sdata.id.toUpperCase();
                const hasAnyPiece = (sdata.pieces || []).some((p) => seenSkus.has(p.sku));
                if (!usedSalasInCat[sKey] && !seenIds.has(sKey) && !hasAnyPiece) {
                    out.push(buildArchivedSalaProduct_(sdata));
                }
            });
            master.indivList.forEach((it) => {
                if (!usedIndivRows[it.rowIdx] && !seenSkus.has(it.sku) && !seenIds.has('IND-' + it.sku) && !seenIds.has(it.sku)) {
                    out.push(buildArchivedIndivProduct_(it));
                    seenSkus.add(it.sku);
                }
            });
        }

        return out;
    }

    async function fetchCloudCatalog(mode = 'public', timeoutMs = 15000) {
        const effTimeout = Math.max(Number(timeoutMs) || 0, 15000);
        discoverWebAppUrlFromSheet().catch(() => {});

        const directRows = await fetchDirectGvizCatalog(mode, effTimeout);
        if (Array.isArray(directRows) && directRows.length > 0) {
            return directRows;
        }

        const apiUrl = CREATA_CLOUD_CONFIG.getApiUrl();
        if (apiUrl) {
            const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
            const timer = controller ? setTimeout(() => controller.abort(), effTimeout) : null;
            try {
                const sep = apiUrl.includes('?') ? '&' : '?';
                let targetUrl = `${apiUrl}${sep}mode=${encodeURIComponent(mode)}&_t=${Date.now()}`;
                if (mode === 'admin') {
                    const pin = CREATA_CLOUD_CONFIG.getAdminPin();
                    if (pin) targetUrl += `&pin=${encodeURIComponent(pin)}`;
                }
                const resp = await fetch(targetUrl, {
                    method: 'GET',
                    signal: controller ? controller.signal : undefined
                });
                if (resp.ok) {
                    const data = await resp.json();
                    if (data && data.ok && Array.isArray(data.products) && data.products.length > 0) {
                        return data.products;
                    }
                }
            } catch (err) {
                console.warn('[Creata Cloud WebApp Fetch]', err);
            } finally {
                if (timer) clearTimeout(timer);
            }
        }
        return null;
    }

    function packProductForCloudSave(prod) {
        if (!prod || typeof prod !== 'object') return prod;
        const pClone = JSON.parse(JSON.stringify(prod));
        let rawDid = String(pClone.drive_file_id || '').trim();
        if (rawDid.startsWith('{')) {
            try {
                const prev = JSON.parse(rawDid);
                rawDid = String((prev && prev.did) || '');
            } catch (e) { rawDid = ''; }
        }
        const compactVars = (Array.isArray(pClone.variants) ? pClone.variants : []).map((v) => {
            const g = (v && v.gallery) || {};
            const linkedFinish = v.swatch_img || g.finish || g.fabric || (Array.isArray(g.finishes) && g.finishes[0]) || '';
            if (v) {
                v.swatch_img = linkedFinish;
                if (!v.gallery) v.gallery = {};
                v.gallery.finish = linkedFinish;
                v.gallery.fabric = linkedFinish;
                v.gallery.finishes = linkedFinish ? [linkedFinish] : [];
            }
            const isRemote = (u) => typeof u === 'string' && !u.startsWith('data:');
            return {
                cl: String((v && v.color_label) || '').trim(),
                ft: String((v && v.finish_type) || inferFinishType(v && v.color_label, (v && v.materials) || pClone.materials)),
                hex: String((v && v.swatch_hex) || '#B8893E'),
                sw: isRemote(linkedFinish) ? linkedFinish : '',
                fin: isRemote(linkedFinish) ? linkedFinish : '',
                hero: isRemote(v && v.hero_b64) ? v.hero_b64 : '',
                amb: isRemote(g.ambiente) ? g.ambiente : '',
                vw: [g.view1 || '', g.view2 || '', g.view3 || '', g.view4 || ''].map((u) => (isRemote(u) ? u : '')),
                w: v && v.width !== undefined ? v.width : undefined,
                d: v && v.depth !== undefined ? v.depth : undefined,
                h: v && v.height !== undefined ? v.height : undefined,
                s: v && v.seat !== undefined ? v.seat : undefined,
                pk: v && v.packages !== undefined ? v.packages : undefined,
                vl: v && v.volume !== undefined ? v.volume : undefined,
                mat: v && v.materials !== undefined ? v.materials : undefined,
                du: v && v.drive_ficha_url ? v.drive_ficha_url : undefined
            };
        });
        pClone.drive_file_id = JSON.stringify({ _cm: 1, did: rawDid, vars: compactVars });
        return pClone;
    }

    function notifyLiveCatalogSync(detail) {
        try {
            if (typeof BroadcastChannel !== 'undefined') {
                const bc = new BroadcastChannel('creata_live_sync');
                bc.postMessage(Object.assign({ ts: Date.now() }, detail || {}));
                bc.close();
            }
        } catch (e) {}
        try {
            localStorage.setItem('creata_live_sync_ping', JSON.stringify({ ts: Date.now(), detail: detail || {} }));
        } catch (e) {}
    }

    async function cloudPost(action, payload, timeoutMs = 25000) {
        let apiUrl = CREATA_CLOUD_CONFIG.getApiUrl();
        if (!apiUrl) {
            apiUrl = await discoverWebAppUrlFromSheet();
        }
        if (!apiUrl) return { ok: false, offline: true, error: 'Web App pendiente de publicar en Apps Script' };

        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
        try {
            const preparedPayload = Object.assign({}, payload || {});
            if (action === 'save_product' && preparedPayload.product) {
                preparedPayload.product = packProductForCloudSave(preparedPayload.product);
            }
            const body = Object.assign({}, preparedPayload, {
                action: action,
                pin: CREATA_CLOUD_CONFIG.getAdminPin()
            });
            const resp = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(body),
                signal: controller ? controller.signal : undefined
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const resJson = await resp.json();
            if (resJson && !resJson.ok && /PIN de administrador/i.test(resJson.error || '') && !payload?.__retriedPin && typeof global.prompt === 'function') {
                const entered = global.prompt('Ingresa tu PIN de administrador configurado en Apps Script (se guardará automáticamente en este navegador):');
                if (entered && entered.trim()) {
                    CREATA_CLOUD_CONFIG.setAdminPin(entered.trim());
                    return await cloudPost(action, Object.assign({}, payload || {}, { __retriedPin: true }), timeoutMs);
                }
            }
            if (resJson && resJson.ok && (action === 'save_product' || action === 'upload_photo' || action === 'toggle_archive' || action === 'delete_product')) {
                notifyLiveCatalogSync({ action });
            }
            return resJson;
        } catch (err) {
            console.warn(`[Creata Cloud POST:${action}]`, err);
            return { ok: false, error: err.message || 'Error de red' };
        } finally {
            if (timer) clearTimeout(timer);
        }
    }

    async function cloudUploadPhoto(product, variantIdx, slotKey, dataUrl) {
        let apiUrl = CREATA_CLOUD_CONFIG.getApiUrl();
        if (!apiUrl) {
            apiUrl = await discoverWebAppUrlFromSheet();
        }
        if (!apiUrl) {
            return { ok: true, localOnly: true, url: dataUrl };
        }
        const safeId = ((product && (product.id || product.model_name)) || 'mueble')
            .toString()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 40);
        const res = await cloudPost('upload_photo', {
            productId: (product && product.id) || '',
            modelName: (product && product.model_name) || '',
            variantIndex: variantIdx || 0,
            slot: slotKey || 'hero',
            filePrefix: safeId,
            dataUrl: dataUrl
        }, 35000);
        if (res && res.ok && res.url) {
            return { ok: true, localOnly: false, url: res.url };
        }
        return { ok: false, fallbackUrl: dataUrl, error: (res && res.error) || 'No se pudo subir a la nube' };
    }

    global.CREATA_CLOUD_CONFIG = CREATA_CLOUD_CONFIG;
    global.CreataCloud = {
        config: CREATA_CLOUD_CONFIG,
        isValidPhotoUrl,
        scrubForbiddenPublicText,
        sanitizePublicProduct,
        inferFinishType,
        inferColorLabelFromData,
        parseCurrencyValue,
        formatCurrencyMXN,
        detectProductPieces,
        compressImageFast,
        notifyLiveCatalogSync,
        discoverWebAppUrlFromSheet,
        fetchDirectGvizCatalog,
        fetchCloudCatalog,
        cloudPost,
        cloudUploadPhoto
    };
})(window);
