(function () {
  'use strict';

  var renderSeq = 0;

  function hasAutomationProperty(obj) {
    if (!obj) return false;
    var knownGlobals = [
      '__playwright',
      '__pw_manual',
      '__PW_inspect',
      '_phantom',
      'callPhantom',
      '__nightmare',
      '_selenium',
      '__selenium_unwrapped',
      '__webdriver_evaluate',
      '__driver_evaluate',
      '__webdriver_unwrapped',
      '__fxdriver_evaluate',
      '__fxdriver_unwrapped',
      'domAutomation',
      'domAutomationController'
    ];
    for (var i = 0; i < knownGlobals.length; i++) {
      try {
        if (knownGlobals[i] in obj && obj[knownGlobals[i]] !== undefined) {
          return true;
        }
      } catch (_) {}
    }
    try {
      var names = Object.getOwnPropertyNames(obj);
      for (var j = 0; j < names.length; j++) {
        var k = names[j];
        if (k && (/^\$?cdc_/i.test(k) || /^__(webdriver|driver|selenium|playwright|pw_)/i.test(k))) {
          return true;
        }
      }
    } catch (_) {}
    return false;
  }

  function detectAutomation() {
    try {
      if (typeof navigator !== 'undefined') {
        if (navigator.webdriver === true) return true;
        var ua = String(navigator.userAgent || '');
        if (/HeadlessChrome|PhantomJS|SlimerJS|Playwright|Puppeteer|Selenium/i.test(ua)) {
          return true;
        }
      }
    } catch (_) {}
    if (typeof window !== 'undefined' && hasAutomationProperty(window)) return true;
    if (typeof document !== 'undefined' && hasAutomationProperty(document)) return true;
    return false;
  }

  var isBlocked = detectAutomation();

  function silentSuppressDocument() {
    try {
      if (document.documentElement) {
        document.documentElement.style.display = 'none';
      }
    } catch (_) {}

    function clearDom() {
      try {
        document.title = '';
      } catch (_) {}
      try {
        if (document.head) {
          document.head.textContent = '';
        }
      } catch (_) {}
      try {
        if (document.body) {
          document.body.textContent = '';
        }
      } catch (_) {}
    }

    clearDom();
    try {
      setTimeout(clearDom, 0);
    } catch (_) {}
  }

  function neutralizeNetwork() {
    try {
      if (typeof window !== 'undefined') {
        var noopFetch = function () {
          return new Promise(function () {});
        };
        try {
          Object.defineProperty(window, 'fetch', {
            value: noopFetch,
            writable: false,
            configurable: false
          });
        } catch (_) {
          window.fetch = noopFetch;
        }
      }
    } catch (_) {}

    try {
      if (typeof XMLHttpRequest !== 'undefined' && XMLHttpRequest.prototype) {
        XMLHttpRequest.prototype.open = function () {};
        XMLHttpRequest.prototype.send = function () {};
      }
    } catch (_) {}

    try {
      if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        navigator.sendBeacon = function () { return false; };
      }
    } catch (_) {}
  }

  function injectSilentStyle() {
    try {
      if (document.getElementById('creata-guard-style')) return;
      var style = document.createElement('style');
      style.id = 'creata-guard-style';
      style.textContent =
        '.creata-img-wrap{position:relative;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;}' +
        '.creata-img-protected{pointer-events:none!important;user-select:none!important;-webkit-user-select:none!important;-webkit-touch-callout:none!important;-webkit-user-drag:none!important;}' +
        '.creata-img-shield{position:absolute;inset:0;z-index:2;background:transparent;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;-webkit-user-drag:none;}' +
        '.creata-canvas-protected{user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;-webkit-user-drag:none;}';
      var target = document.head || document.documentElement;
      if (target) target.appendChild(style);
    } catch (_) {}
  }

  function preventSilent(e) {
    if (e) {
      e.preventDefault();
    }
    return false;
  }

  function isProtectedMediaTarget(target) {
    if (!target || target.nodeType !== 1) return false;
    var tag = target.tagName;
    if (tag === 'IMG' || tag === 'CANVAS') return true;
    if (
      target.classList &&
      (target.classList.contains('creata-img-shield') ||
        target.classList.contains('creata-img-protected') ||
        target.classList.contains('creata-img-wrap') ||
        target.classList.contains('creata-canvas-protected'))
    ) {
      return true;
    }
    if (typeof target.closest === 'function') {
      return !!target.closest('.creata-img-wrap, .creata-img-shield, .creata-img-protected, .creata-canvas-protected, img, canvas');
    }
    return false;
  }

  function installGlobalListeners() {
    injectSilentStyle();

    document.addEventListener(
      'keydown',
      function (e) {
        if (!e) return;
        var key = String(e.key || '').toLowerCase();
        var code = e.keyCode || 0;
        var mod = !!(e.ctrlKey || e.metaKey);

        if (
          key === 'f12' ||
          code === 123 ||
          (mod && !e.altKey && (key === 's' || key === 'u')) ||
          (mod && e.shiftKey && (key === 'i' || key === 'j' || key === 'c'))
        ) {
          e.preventDefault();
          e.stopPropagation();
        }
      },
      true
    );

    document.addEventListener(
      'contextmenu',
      function (e) {
        if (e && isProtectedMediaTarget(e.target)) {
          e.preventDefault();
          e.stopPropagation();
        }
      },
      true
    );

    document.addEventListener(
      'dragstart',
      function (e) {
        if (e && isProtectedMediaTarget(e.target)) {
          e.preventDefault();
          e.stopPropagation();
        }
      },
      true
    );

    document.addEventListener(
      'selectstart',
      function (e) {
        if (e && isProtectedMediaTarget(e.target)) {
          e.preventDefault();
        }
      },
      true
    );
  }

  function hasDirectShield(parent) {
    if (!parent || !parent.children) return false;
    for (var i = 0; i < parent.children.length; i++) {
      var child = parent.children[i];
      if (child && child.classList && child.classList.contains('creata-img-shield')) {
        return true;
      }
    }
    return false;
  }

  function protectSingleImage(img) {
    if (!img || img.nodeType !== 1 || img.tagName !== 'IMG') return;
    img.draggable = false;
    img.setAttribute('draggable', 'false');
    img.setAttribute('referrerpolicy', 'no-referrer');
    img.classList.add('creata-img-protected');
    img.style.pointerEvents = 'none';
    img.style.userSelect = 'none';
    img.style.webkitUserSelect = 'none';
    img.style.webkitTouchCallout = 'none';
    img.style.webkitUserDrag = 'none';

    var parent = img.parentElement;
    if (parent && parent !== document.body && parent !== document.documentElement) {
      var hasInteractive = !!(
        parent.querySelector &&
        parent.querySelector('button, input, select, textarea, a, label, [role="button"]')
      );
      if (!hasInteractive) {
        try {
          var pos = window.getComputedStyle ? window.getComputedStyle(parent).position : '';
          if (!pos || pos === 'static') {
            parent.style.position = 'relative';
          }
        } catch (_) {
          if (!parent.style.position) {
            parent.style.position = 'relative';
          }
        }
        parent.classList.add('creata-img-wrap');

        if (!hasDirectShield(parent)) {
          var shield = document.createElement('div');
          shield.className = 'creata-img-shield';
          shield.setAttribute('aria-hidden', 'true');
          shield.style.position = 'absolute';
          shield.style.inset = '0';
          shield.style.zIndex = '2';
          shield.style.background = 'transparent';
          shield.style.userSelect = 'none';
          shield.style.webkitUserSelect = 'none';
          shield.style.webkitTouchCallout = 'none';
          shield.addEventListener('contextmenu', preventSilent);
          shield.addEventListener('dragstart', preventSilent);
          shield.addEventListener('selectstart', preventSilent);
          parent.appendChild(shield);
        }
      }
    }
  }

  function protectImages(rootEl) {
    if (isBlocked) return 0;
    injectSilentStyle();
    var root = rootEl || document;
    var count = 0;
    try {
      if (root.nodeType === 1 && root.tagName === 'IMG') {
        protectSingleImage(root);
        return 1;
      }
      if (typeof root.querySelectorAll === 'function') {
        var imgs = root.querySelectorAll('img');
        for (var i = 0; i < imgs.length; i++) {
          protectSingleImage(imgs[i]);
          count++;
        }
      }
    } catch (_) {}
    return count;
  }

  function renderCanvasImage(containerEl, imgUrl, altText, onFallback) {
    if (isBlocked || !containerEl || containerEl.nodeType !== 1) return;
    injectSilentStyle();

    var url = String(imgUrl || '').trim();
    var alt = String(altText || '').trim();
    var token = ++renderSeq;
    containerEl.__creataCanvasToken = token;
    containerEl.textContent = '';

    if (!url) {
      if (typeof onFallback === 'function') {
        try { onFallback(new Error('empty_url')); } catch (_) {}
      }
      return;
    }

    function applyFallback(err) {
      if (containerEl.__creataCanvasToken !== token) return;
      containerEl.textContent = '';
      var fallbackImg = document.createElement('img');
      fallbackImg.src = url;
      fallbackImg.alt = alt;
      fallbackImg.draggable = false;
      fallbackImg.setAttribute('draggable', 'false');
      fallbackImg.setAttribute('referrerpolicy', 'no-referrer');
      fallbackImg.style.maxWidth = '100%';
      fallbackImg.style.maxHeight = '100%';
      fallbackImg.style.width = '100%';
      fallbackImg.style.height = '100%';
      fallbackImg.style.objectFit = 'contain';
      fallbackImg.style.display = 'block';
      fallbackImg.style.margin = 'auto';
      containerEl.appendChild(fallbackImg);
      protectImages(containerEl);
      if (typeof onFallback === 'function') {
        try { onFallback(err); } catch (_) {}
      }
    }

    var img = new Image();
    img.crossOrigin = 'anonymous';
    img.referrerPolicy = 'no-referrer';

    img.onload = function () {
      if (containerEl.__creataCanvasToken !== token) return;
      var nw = img.naturalWidth || 0;
      var nh = img.naturalHeight || 0;
      if (!nw || !nh) {
        applyFallback(new Error('empty_dimensions'));
        return;
      }

      try {
        var rect = containerEl.getBoundingClientRect ? containerEl.getBoundingClientRect() : null;
        var boxW = rect && rect.width > 16 ? rect.width : nw;
        var boxH = rect && rect.height > 16 ? rect.height : nh;
        var ratio = Math.min(boxW / nw, boxH / nh);
        var drawW = Math.max(1, Math.round(nw * ratio));
        var drawH = Math.max(1, Math.round(nh * ratio));
        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        var maxSide = 2400;
        var pxW = Math.round(drawW * dpr);
        var pxH = Math.round(drawH * dpr);
        if (pxW > maxSide || pxH > maxSide) {
          var clamp = maxSide / Math.max(pxW, pxH);
          pxW = Math.max(1, Math.round(pxW * clamp));
          pxH = Math.max(1, Math.round(pxH * clamp));
        }

        var canvas = document.createElement('canvas');
        canvas.className = 'creata-canvas-protected';
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', alt);
        canvas.width = pxW;
        canvas.height = pxH;
        canvas.style.width = 'auto';
        canvas.style.height = 'auto';
        canvas.style.maxWidth = '100%';
        canvas.style.maxHeight = '100%';
        canvas.style.aspectRatio = pxW + ' / ' + pxH;
        canvas.style.display = 'block';
        canvas.style.margin = 'auto';
        canvas.style.userSelect = 'none';
        canvas.style.webkitUserSelect = 'none';
        canvas.style.webkitTouchCallout = 'none';
        canvas.addEventListener('contextmenu', preventSilent);
        canvas.addEventListener('dragstart', preventSilent);
        canvas.addEventListener('selectstart', preventSilent);

        var ctx = canvas.getContext('2d');
        if (!ctx) {
          applyFallback(new Error('no_2d_context'));
          return;
        }
        ctx.imageSmoothingEnabled = true;
        if ('imageSmoothingQuality' in ctx) {
          ctx.imageSmoothingQuality = 'high';
        }
        ctx.drawImage(img, 0, 0, pxW, pxH);
        ctx.getImageData(0, 0, 1, 1);

        containerEl.textContent = '';
        containerEl.appendChild(canvas);
      } catch (err) {
        applyFallback(err);
      }
    };

    img.onerror = function () {
      applyFallback(new Error('image_load_error'));
    };

    img.src = url;
  }

  if (isBlocked) {
    silentSuppressDocument();
    neutralizeNetwork();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', silentSuppressDocument, true);
    }
  } else {
    installGlobalListeners();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', injectSilentStyle, true);
    }
  }

  var api = {};
  Object.defineProperty(api, 'blocked', {
    value: isBlocked,
    writable: false,
    enumerable: true,
    configurable: false
  });
  Object.defineProperty(api, 'isBlocked', {
    value: isBlocked,
    writable: false,
    enumerable: true,
    configurable: false
  });
  Object.defineProperty(api, 'protectImages', {
    value: protectImages,
    writable: false,
    enumerable: true,
    configurable: false
  });
  Object.defineProperty(api, 'renderCanvasImage', {
    value: renderCanvasImage,
    writable: false,
    enumerable: true,
    configurable: false
  });

  if (typeof window !== 'undefined') {
    try {
      Object.defineProperty(window, 'CreataGuard', {
        value: Object.freeze(api),
        writable: false,
        enumerable: true,
        configurable: false
      });
    } catch (_) {
      window.CreataGuard = api;
    }
  }
})();
