/* POPOLAB 作品網站：共用互動（這個檔案不做任何追蹤；瀏覽人次由 GoatCounter 計算） */
(function () {
  'use strict';
  var root = document.documentElement;

  /* ---- 動態開關（記在這台裝置的瀏覽器裡） ---- */
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function motionOn() { return !reduce && store.get('popolab-motion') !== 'off'; }
  window.POPOLAB = { store: store, motionOn: motionOn, reduce: reduce };
  if (motionOn()) root.classList.add('motion-ok');

  function paintToggle() {
    var on = motionOn();
    document.querySelectorAll('.motion-toggle').forEach(function (b) {
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.querySelector('.ic').textContent = on ? '▶' : '❚❚';
      b.querySelector('.st').textContent = on ? '開' : '關';
    });
  }
  document.querySelectorAll('.motion-toggle').forEach(function (b) {
    if (reduce) { b.hidden = true; return; }
    b.addEventListener('click', function () {
      var on = motionOn();
      store.set('popolab-motion', on ? 'off' : 'on');
      root.classList.toggle('motion-ok', !on);
      paintToggle();
      document.dispatchEvent(new CustomEvent('popolab:motion', { detail: { on: !on } }));
    });
  });
  paintToggle();

  /* ---- 進場淡入 ---- */
  var ups = document.querySelectorAll('.rv-up');
  if ('IntersectionObserver' in window && motionOn()) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px' });
    ups.forEach(function (el) { io.observe(el); });
  } else {
    ups.forEach(function (el) { el.classList.add('in'); });
  }

  /* ---- 導覽列：目前段落 ---- */
  var navLinks = Array.prototype.slice.call(document.querySelectorAll('.nav a[href^="#"]'));
  if (navLinks.length && 'IntersectionObserver' in window) {
    var map = {};
    navLinks.forEach(function (a) { var s = document.querySelector(a.getAttribute('href')); if (s) map[s.id] = a; });
    var nio = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.isIntersecting) {
          navLinks.forEach(function (a) { a.classList.remove('on'); });
          if (map[e.target.id]) map[e.target.id].classList.add('on');
        }
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    Object.keys(map).forEach(function (id) { nio.observe(document.getElementById(id)); });
  }

  /* ---- 作品分類頁籤 ---- */
  var tabs = document.querySelectorAll('.tab[data-filter]');
  tabs.forEach(function (t) {
    t.addEventListener('click', function () {
      var f = t.getAttribute('data-filter');
      tabs.forEach(function (x) { x.setAttribute('aria-selected', x === t ? 'true' : 'false'); });
      document.querySelectorAll('.work-grid .card[data-cat]').forEach(function (c) {
        var cats = c.getAttribute('data-cat').split(' ');
        c.hidden = !(f === 'all' || cats.indexOf(f) > -1);
      });
    });
  });

  /* ---- 拖曳對比 ---- */
  document.querySelectorAll('.ba').forEach(function (ba) {
    var input = ba.querySelector('input[type=range]');
    function set(v) { ba.style.setProperty('--pos', v + '%'); if (input) input.value = v; }
    if (input) input.addEventListener('input', function () { set(input.value); });
    var dragging = false;
    function fromEvent(e) {
      var r = ba.getBoundingClientRect();
      var x = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
      set(Math.max(0, Math.min(100, x / r.width * 100)).toFixed(1));
    }
    ba.addEventListener('pointerdown', function (e) { dragging = true; fromEvent(e); });
    window.addEventListener('pointermove', function (e) { if (dragging) fromEvent(e); });
    window.addEventListener('pointerup', function () { dragging = false; });
    /* 第一次看到時自動示範一次 */
    if ('IntersectionObserver' in window && motionOn()) {
      var demo = new IntersectionObserver(function (es) {
        if (!es[0].isIntersecting) return;
        demo.disconnect();
        var t0 = performance.now();
        (function tick(t) {
          var p = Math.min(1, (t - t0) / 1600);
          if (dragging) return;
          set((50 + Math.sin(p * Math.PI * 2) * 22).toFixed(1));
          if (p < 1) requestAnimationFrame(tick);
        })(t0);
      }, { threshold: .6 });
      demo.observe(ba);
    }
  });

  /* ---- YouTube：按下才載入（按之前不連到 YouTube） ---- */
  document.querySelectorAll('[data-yt]').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      var id = btn.getAttribute('data-yt');
      var f = document.createElement('iframe');
      f.src = 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&rel=0&playsinline=1';
      f.title = btn.getAttribute('data-title') || 'YouTube 影片';
      f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
      f.allowFullscreen = true;
      f.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0';
      btn.replaceWith(f);
    });
  });

  /* ---- MV 語言切換（中文版／English） ---- */
  document.querySelectorAll('.yt-lang').forEach(function (b) {
    b.addEventListener('click', function () {
      var wrap = b.closest('.w-media') || document;
      var frame = wrap.querySelector('.media-frame');
      wrap.querySelectorAll('.yt-lang').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
      var id = b.getAttribute('data-yt-id');
      var facade = frame && frame.querySelector('[data-yt]');
      if (facade) {
        facade.setAttribute('data-yt', id);
        facade.setAttribute('data-title', b.getAttribute('data-title'));
        facade.setAttribute('aria-label', '播放 ' + b.getAttribute('data-title'));
        var img = facade.querySelector('img'); if (img) img.src = b.getAttribute('data-poster');
        var cap = facade.querySelector('.media-cap'); if (cap) cap.textContent = b.getAttribute('data-cap');
      } else if (frame) {
        var f = frame.querySelector('iframe');
        if (f) { f.src = 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&rel=0&playsinline=1'; f.title = b.getAttribute('data-title'); }
      }
    });
  });

  /* ---- 信箱：點了才組出來，降低被爬蟲收集 ---- */
  document.querySelectorAll('[data-mail]').forEach(function (el) {
    el.addEventListener('click', function (e) {
      var parts = el.getAttribute('data-mail').split('|');
      var addr = parts[0] + '@' + parts[1];
      if (el.getAttribute('data-shown') !== '1') {
        e.preventDefault();
        el.setAttribute('data-shown', '1');
        el.setAttribute('href', 'mailto:' + addr);
        var t = el.querySelector('[data-mail-text]');
        if (t) t.textContent = addr;
      }
    });
  });

  /* ---- 年份 ---- */
  document.querySelectorAll('[data-year]').forEach(function (el) { el.textContent = new Date().getFullYear(); });

  /* ---- 重播開場（任何頁面都可以） ---- */
  document.querySelectorAll('[data-replay]').forEach(function (b) {
    b.addEventListener('click', function () {
      store.set('popolab-intro', 'on');
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      if (window.POPOLAB_SWARM) setTimeout(function () { window.POPOLAB_SWARM.replay(); }, 60);
    });
  });

  /* ---- 圖片放大（教學包圖組） ---- */
  var zooms = Array.prototype.slice.call(document.querySelectorAll('[data-zoom]'));
  if (zooms.length) {
    var lb = document.createElement('div');
    lb.className = 'lb'; lb.hidden = true;
    lb.setAttribute('role', 'dialog'); lb.setAttribute('aria-modal', 'true'); lb.setAttribute('aria-label', '放大檢視');
    lb.innerHTML = '<div class="lb-top"><p class="label">Preview / <b class="lb-n"></b></p><button class="lb-btn lb-close" type="button" aria-label="關閉">✕</button></div>' +
      '<div class="lb-stage"><img alt=""><button class="lb-btn lb-prev" type="button" aria-label="上一張">←</button><button class="lb-btn lb-next" type="button" aria-label="下一張">→</button></div>' +
      '<p class="lb-cap"></p>';
    document.body.appendChild(lb);
    var lbImg = lb.querySelector('img'), lbCap = lb.querySelector('.lb-cap'), lbN = lb.querySelector('.lb-n'), cur = 0, opener = null;
    var show = function (i) {
      cur = (i + zooms.length) % zooms.length;
      var a = zooms[cur];
      lbImg.src = a.getAttribute('href');
      lbImg.alt = a.getAttribute('data-cap') || '';
      lbCap.textContent = a.getAttribute('data-cap') || '';
      lbN.textContent = String(cur + 1).padStart(2, '0') + ' / ' + String(zooms.length).padStart(2, '0');
    };
    var close = function () {
      lb.hidden = true; document.documentElement.classList.remove('lb-open');
      if (opener) opener.focus();
    };
    zooms.forEach(function (a, i) {
      a.addEventListener('click', function (e) {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
        e.preventDefault(); opener = a; show(i);
        lb.hidden = false; document.documentElement.classList.add('lb-open');
        lb.querySelector('.lb-close').focus();
      });
    });
    lb.querySelector('.lb-close').addEventListener('click', close);
    lb.querySelector('.lb-prev').addEventListener('click', function () { show(cur - 1); });
    lb.querySelector('.lb-next').addEventListener('click', function () { show(cur + 1); });
    lb.addEventListener('click', function (e) { if (e.target === lb || e.target.classList.contains('lb-stage')) close(); });
    document.addEventListener('keydown', function (e) {
      if (lb.hidden) return;
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft') show(cur - 1);
      else if (e.key === 'ArrowRight') show(cur + 1);
      else if (e.key === 'Tab') {
        var f = Array.prototype.slice.call(lb.querySelectorAll('button')), k = f.indexOf(document.activeElement);
        e.preventDefault(); f[(k + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
      }
    });
    /* 手機：左右滑動換圖 */
    var sx = null;
    lb.addEventListener('touchstart', function (e) { sx = e.touches[0].clientX; }, { passive: true });
    lb.addEventListener('touchend', function (e) {
      if (sx === null) return;
      var dx = e.changedTouches[0].clientX - sx; sx = null;
      if (Math.abs(dx) > 50) show(cur + (dx < 0 ? 1 : -1));
    });
  }
})();
