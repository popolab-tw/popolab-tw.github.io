/* POPOLAB 作品網站：共用互動（無追蹤、無分析） */
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

  /* ---- 重播開場 ---- */
  document.querySelectorAll('[data-replay]').forEach(function (b) {
    b.addEventListener('click', function () {
      store.set('popolab-built', '');
      if (location.pathname === '/' || /index\.html$/.test(location.pathname)) {
        window.scrollTo(0, 0);
        if (window.POPOLAB_SWARM) window.POPOLAB_SWARM.replay();
      } else {
        location.href = '/';
      }
    });
  });
})();
