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

  function detectCanvasStudioBounds(img) {
    var nw = img && img.naturalWidth ? img.naturalWidth : 0;
    var nh = img && img.naturalHeight ? img.naturalHeight : 0;
    if (nw < 16 || nh < 16) return null;
    try {
      var cap = 96;
      var scale = Math.min(1, cap / Math.max(nw, nh));
      var dw = Math.max(16, Math.round(nw * scale));
      var dh = Math.max(16, Math.round(nh * scale));
      var probe = document.createElement('canvas');
      probe.width = dw;
      probe.height = dh;
      var pCtx = probe.getContext('2d', { willReadFrequently: true });
      if (!pCtx) return null;
      pCtx.clearRect(0, 0, dw, dh);
      pCtx.drawImage(img, 0, 0, dw, dh);
      var rgba = pCtx.getImageData(0, 0, dw, dh).data;

      var ring = (dw < 24 || dh < 24) ? 1 : 2;
      var bCount = 0, tCount = 0, sR = 0, sG = 0, sB = 0;
      var samples = [];
      for (var y = 0; y < dh; y++) {
        for (var x = 0; x < dw; x++) {
          if (x >= ring && x < dw - ring && y >= ring && y < dh - ring) continue;
          var idx = (y * dw + x) * 4;
          bCount++;
          if (rgba[idx + 3] < 24) {
            tCount++;
          } else {
            sR += rgba[idx];
            sG += rgba[idx + 1];
            sB += rgba[idx + 2];
            samples.push(rgba[idx], rgba[idx + 1], rgba[idx + 2]);
          }
        }
      }
      var transRatio = bCount > 0 ? (tCount / bCount) : 0;
      var useAlpha = transRatio >= 0.08;
      var opqN = samples.length / 3;
      var mR = opqN > 0 ? sR / opqN : 255;
      var mG = opqN > 0 ? sG / opqN : 255;
      var mB = opqN > 0 ? sB / opqN : 255;
      var vSum = 0;
      for (var i = 0; i < samples.length; i += 3) {
        var dr = samples[i] - mR, dg = samples[i + 1] - mG, db = samples[i + 2] - mB;
        vSum += (dr * dr + dg * dg + db * db) / 3;
      }
      var stdDev = opqN > 0 ? Math.sqrt(vSum / opqN) : 0;
      var maxC = Math.max(mR, mG, mB);
      var minC = Math.min(mR, mG, mB);
      var isWhiteBg = useAlpha || (minC >= 244 && (maxC - minC) <= 12);
      if (!useAlpha && (!isWhiteBg || stdDev > 24)) return null;

      var thresh = Math.max(30, Math.min(64, Math.round(28 + stdDev * 2.2)));
      var mask = new Uint8Array(dw * dh);
      for (var my = 0; my < dh; my++) {
        var rOff = my * dw;
        for (var mx = 0; mx < dw; mx++) {
          var pIdx = (rOff + mx) * 4;
          if (rgba[pIdx + 3] <= 24) continue;
          if (useAlpha) {
            mask[rOff + mx] = 1;
          } else {
            var dist = Math.abs(rgba[pIdx] - mR) + Math.abs(rgba[pIdx + 1] - mG) + Math.abs(rgba[pIdx + 2] - mB);
            if (dist > thresh) mask[rOff + mx] = 1;
          }
        }
      }

      var minX = dw, minY = dh, maxX = -1, maxY = -1, fgN = 0;
      for (var fy = 0; fy < dh; fy++) {
        var fRow = fy * dw;
        var y0 = fy > 0 ? fy - 1 : 0;
        var y1 = fy < dh - 1 ? fy + 1 : dh - 1;
        for (var fx = 0; fx < dw; fx++) {
          if (!mask[fRow + fx]) continue;
          var x0 = fx > 0 ? fx - 1 : 0;
          var x1 = fx < dw - 1 ? fx + 1 : dw - 1;
          var hasNb = false;
          for (var ny = y0; ny <= y1 && !hasNb; ny++) {
            var nRow = ny * dw;
            for (var nx = x0; nx <= x1; nx++) {
              if (nx === fx && ny === fy) continue;
              if (mask[nRow + nx]) { hasNb = true; break; }
            }
          }
          if (!hasNb) continue;
          fgN++;
          if (fx < minX) minX = fx;
          if (fx > maxX) maxX = fx;
          if (fy < minY) minY = fy;
          if (fy > maxY) maxY = fy;
        }
      }
      if (fgN < Math.max(24, Math.floor(dw * dh * 0.008)) || maxX <= minX || maxY <= minY) return null;
      var bw = maxX - minX + 1;
      var bh = maxY - minY + 1;
      if (bw / dw < 0.08 || bh / dh < 0.08) return null;

      var padX = Math.round(nw * 0.015);
      var padY = Math.round(nh * 0.015);
      var sx = Math.max(0, Math.floor((minX / dw) * nw) - padX);
      var sy = Math.max(0, Math.floor((minY / dh) * nh) - padY);
      var sx2 = Math.min(nw, Math.ceil(((maxX + 1) / dw) * nw) + padX);
      var sy2 = Math.min(nh, Math.ceil(((maxY + 1) / dh) * nh) + padY);
      if ((sx2 - sx) < 12 || (sy2 - sy) < 12) return null;
      return { sx: sx, sy: sy, sw: sx2 - sx, sh: sy2 - sy };
    } catch (_) {
      return null;
    }
  }

  function renderCanvasImage(containerEl, imgUrl, altText, onFallback, options) {
    if (isBlocked || !containerEl || containerEl.nodeType !== 1) return;
    injectSilentStyle();

    var opts = (options && typeof options === 'object') ? options : {};
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
        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        var maxSide = 2400;

        var studioBounds = opts.autoFrame ? detectCanvasStudioBounds(img) : null;
        var pxW, pxH, drawX, drawY, drawW, drawH;

        if (studioBounds) {
          var targetFill = (typeof opts.targetFill === 'number' && opts.targetFill > 0.5 && opts.targetFill < 0.96)
            ? opts.targetFill
            : 0.78;
          var stageW = rect && rect.width > 16 ? rect.width : Math.max(800, Math.round(studioBounds.sw / targetFill));
          var stageH = rect && rect.height > 16 ? rect.height : Math.round(stageW * 0.75);
          pxW = Math.round(stageW * dpr);
          pxH = Math.round(stageH * dpr);
          if (pxW > maxSide || pxH > maxSide) {
            var clampStage = maxSide / Math.max(pxW, pxH);
            pxW = Math.max(1, Math.round(pxW * clampStage));
            pxH = Math.max(1, Math.round(pxH * clampStage));
          }
          var innerW = pxW * targetFill;
          var innerH = pxH * targetFill;
          var fitScale = Math.min(innerW / studioBounds.sw, innerH / studioBounds.sh);
          drawW = Math.max(1, Math.round(studioBounds.sw * fitScale));
          drawH = Math.max(1, Math.round(studioBounds.sh * fitScale));
          drawX = Math.round((pxW - drawW) / 2);
          drawY = Math.round((pxH - drawH) / 2);
        } else {
          var ratio = Math.min(boxW / nw, boxH / nh);
          var cssW = Math.max(1, Math.round(nw * ratio));
          var cssH = Math.max(1, Math.round(nh * ratio));
          pxW = Math.round(cssW * dpr);
          pxH = Math.round(cssH * dpr);
          if (pxW > maxSide || pxH > maxSide) {
            var clamp = maxSide / Math.max(pxW, pxH);
            pxW = Math.max(1, Math.round(pxW * clamp));
            pxH = Math.max(1, Math.round(pxH * clamp));
          }
          drawX = 0;
          drawY = 0;
          drawW = pxW;
          drawH = pxH;
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
        if (studioBounds) {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, pxW, pxH);
          ctx.drawImage(
            img,
            studioBounds.sx, studioBounds.sy, studioBounds.sw, studioBounds.sh,
            drawX, drawY, drawW, drawH
          );
        } else {
          ctx.drawImage(img, 0, 0, pxW, pxH);
        }
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
