/* =========================================================
   POPOLAB swarm — 自己寫的輕量版「游標蜂群施工」
   靈感來自多人協作設計工具的游標；程式為本站原創。
   - 首頁第一次造訪：一群游標在約 6 秒內「蓋出」第一屏
   - 可略過（按鈕 / Esc / 捲動），只播一次，尊重「減少動態效果」
   - 之後（桌機）：幾個游標在畫面上跟著你的滑鼠
   ========================================================= */
(function () {
  'use strict';
  var P = window.POPOLAB || { store: { get: function () { return null; }, set: function () {} }, motionOn: function () { return true; } };
  var root = document.documentElement;
  var COLORS = ['#ff1e2d', '#2f8cff', '#ffb800', '#22c55e', '#a855f7', '#ff5fc8', '#00c8b4', '#ff7a1a', '#ffffff', '#8ab4ff'];
  var NAMES = ['波波', 'Claude', null, 'Claude 2', null, null, 'Claude 3', null, null, null];
  var fine = window.matchMedia && matchMedia('(pointer: fine)').matches;
  var small = window.innerWidth < 820;

  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function cursorSVG(c) {
    return '<svg viewBox="0 0 20 22" aria-hidden="true"><path d="M2.5 1.8l14.6 8.1-6.5 1.7-3.5 6.5z" fill="' + c + '" stroke="' + (c === '#ffffff' ? '#111' : '#fff') + '" stroke-width="1.5" stroke-linejoin="round"/></svg>';
  }
  function ease(t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function esc(s) { return s.replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }

  /* ---------- 游標代理人 ---------- */
  function Agent(layer, i) {
    this.c = COLORS[i % COLORS.length];
    this.e = el('div', 'sw-agent', cursorSVG(this.c) + (NAMES[i] ? '<b style="background:' + this.c + (this.c === '#ffffff' || this.c === '#ffb800' ? ';color:#111' : '') + '">' + NAMES[i] + '</b>' : ''));
    layer.appendChild(this.e);
    var side = i % 2 ? 1 : -1;
    this.x = side > 0 ? innerWidth + rand(20, 120) : -rand(20, 120);
    this.y = rand(innerHeight * .15, innerHeight * .85);
    this.vx = 0; this.vy = 0;
    this.seg = null; this.queue = []; this.busy = false;
    this.home = { x: rand(innerWidth * .1, innerWidth * .9), y: rand(innerHeight * .2, innerHeight * .8) };
    this.ph = rand(0, Math.PI * 2); this.w = rand(.6, 1.2); this.r = rand(46, 120);
    this.draw();
  }
  Agent.prototype.draw = function () { this.e.style.transform = 'translate3d(' + this.x.toFixed(1) + 'px,' + this.y.toFixed(1) + 'px,0)'; };
  Agent.prototype.go = function (x, y, dur, onUpdate, onDone) { this.queue.push({ x: x, y: y, dur: dur, u: onUpdate, d: onDone }); };
  Agent.prototype.step = function (dt, now) {
    if (!this.seg && this.queue.length) {
      this.seg = this.queue.shift(); this.seg.fx = this.x; this.seg.fy = this.y; this.seg.t = 0;
    }
    if (this.seg) {
      var s = this.seg; s.t += dt;
      var p = Math.min(1, s.t / s.dur), e = ease(p);
      this.x = s.fx + (s.x - s.fx) * e; this.y = s.fy + (s.y - s.fy) * e;
      if (s.u) s.u(p);
      if (p >= 1) { this.seg = null; if (s.d) s.d(); }
    } else {
      /* 閒著時在自己的位置附近晃 */
      var hx = this.home.x + Math.cos(now / 900 * this.w + this.ph) * 26;
      var hy = this.home.y + Math.sin(now / 1100 * this.w + this.ph) * 18;
      this.vx += (hx - this.x) * .0025 * dt; this.vy += (hy - this.y) * .0025 * dt;
      this.vx *= .86; this.vy *= .86;
      this.x += this.vx; this.y += this.vy;
    }
    this.draw();
  };

  /* ---------- 施工開場 ---------- */
  var S = { running: false, layer: null, agents: [], boxes: [], guides: [], hud: null, t0: 0, raf: 0, done: 0, total: 0, finished: false };

  function shouldBuild() {
    if (!document.querySelector('.hero [data-build]')) return false;
    if (!P.motionOn()) return false;
    if (P.store.get('popolab-built')) return false;
    if (window.scrollY > 10 || location.hash) return false;
    return true;
  }

  function revealAll() {
    document.querySelectorAll('[data-build]').forEach(function (n) { n.style.opacity = ''; n.style.clipPath = ''; n.style.transition = ''; });
    root.classList.remove('swarm-pending');
  }

  function buildTargets() {
    var list = Array.prototype.slice.call(document.querySelectorAll('[data-build]'));
    var vis = [], rest = [];
    list.forEach(function (n) {
      var r = n.getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || r.top > innerHeight * 1.02) rest.push(n); else vis.push({ n: n, r: r, type: n.getAttribute('data-build') || 'rect' });
    });
    rest.forEach(function (n) { n.style.opacity = '1'; });
    return vis;
  }

  function makeBox(r) {
    var b = el('div', 'sw-box', '<i></i><i></i><i></i><i></i><em></em>');
    b.style.left = r.left + 'px'; b.style.top = r.top + 'px'; b.style.width = '0px'; b.style.height = '0px';
    S.layer.appendChild(b); S.boxes.push(b); return b;
  }
  function killBox(b, delay) { setTimeout(function () { b.classList.add('gone'); setTimeout(function () { b.remove(); }, 500); }, delay || 0); }

  function hudUpdate() {
    if (!S.hud) return;
    S.hud.querySelector('.cnt').textContent = S.done + ' / ' + S.total + ' 圖層';
    S.hud.querySelector('.bar i').style.width = (S.total ? S.done / S.total * 100 : 0) + '%';
  }

  function runTask(a, t, next) {
    var r = t.r, n = t.n;
    var travel = Math.max(240, Math.min(620, Math.hypot(r.left - a.x, r.top - a.y) / 2.1));
    a.go(r.left, r.top, travel, null, function () {
      var b = makeBox(r), lab = b.querySelector('em');
      var w = Math.max(r.width, 4), h = Math.max(r.height, 4);
      a.go(r.left + w, r.top + h, Math.max(320, Math.min(560, (w + h) / 2.4)), function (p) {
        var e = ease(p);
        b.style.width = (w * e) + 'px'; b.style.height = (h * e) + 'px';
        lab.textContent = Math.round(w * e) + ' × ' + Math.round(h * e);
      }, function () {
        if (t.type === 'mega') {
          n.style.clipPath = 'inset(0 100% 0 0)'; n.style.opacity = '1';
          a.go(r.left, r.top + h * .55, 260, null, function () {
            a.go(r.left + w, r.top + h * .55, 900, function (p) { n.style.clipPath = 'inset(0 ' + ((1 - ease(p)) * 100).toFixed(2) + '% 0 0)'; }, function () {
              n.style.clipPath = ''; killBox(b, 150); finishTask(a, next);
            });
          });
        } else if (t.type === 'type') {
          var html = n.innerHTML, text = n.textContent, i = 0;
          n.innerHTML = '<span class="sw-caret"></span>'; n.style.opacity = '1'; b.classList.add('wire');
          var iv = setInterval(function () {
            i++;
            n.innerHTML = esc(text.slice(0, i)) + '<span class="sw-caret" style="display:inline-block;width:2px;height:.9em;background:#2f8cff;vertical-align:-.08em;margin-left:2px"></span>';
            var c = n.querySelector('.sw-caret').getBoundingClientRect();
            a.x = c.left + 2; a.y = c.top + c.height * .5; a.draw();
            if (i >= text.length || S.finished) { clearInterval(iv); n.innerHTML = html; killBox(b, 120); finishTask(a, next); }
          }, small ? 70 : 85);
        } else {
          b.classList.add('wire');
          setTimeout(function () {
            n.style.transition = 'opacity .35s ease'; n.style.opacity = '1';
            killBox(b, 180); finishTask(a, next);
          }, small ? 160 : 220);
        }
      });
    });
  }
  function finishTask(a, next) {
    S.done++; hudUpdate();
    a.go(a.x + rand(-60, 60), a.y + rand(20, 70), 220, null, next);
  }

  function addGuides() {
    var ruler = el('div', 'sw-ruler'), html = '';
    for (var x = 100; x < innerWidth; x += 100) html += '<span style="left:' + x + 'px">' + x + '</span>';
    ruler.innerHTML = html; S.layer.appendChild(ruler); S.guides.push(ruler);
    var xs = [], hl = document.querySelector('.hero-left'), hr = document.querySelector('.hero-right'), mg = document.querySelector('.mega');
    if (hl) xs.push([hl.getBoundingClientRect().left, true]);
    xs.push([innerWidth / 2, false]);
    if (hr) xs.push([hr.getBoundingClientRect().right, false]);
    xs.forEach(function (v) { var g = el('div', 'sw-guide v' + (v[1] ? ' red' : '')); g.style.left = v[0] + 'px'; S.layer.appendChild(g); S.guides.push(g); });
    if (mg) { var mr = mg.getBoundingClientRect(); [mr.top + mr.height * .12, mr.bottom - mr.height * .08].forEach(function (y) { var g = el('div', 'sw-guide h'); g.style.top = y + 'px'; S.layer.appendChild(g); S.guides.push(g); }); }
    requestAnimationFrame(function () { S.guides.forEach(function (g) { g.classList.add('on'); }); });
  }

  function makeHud(n) {
    var dots = '';
    for (var i = 0; i < 4; i++) dots += '<i style="background:' + COLORS[i] + '"></i>';
    var h = el('div', 'sw-hud', '<span class="dots">' + dots + '</span><span class="who">' + n + ' 位 agent</span><span class="bar"><i></i></span><span class="cnt">0 / 0 圖層</span><button type="button" class="skip">略過 ✕</button>');
    h.setAttribute('role', 'status');
    document.body.appendChild(h);
    h.querySelector('.skip').addEventListener('click', function () { finish(true); });
    return h;
  }

  function loop(now) {
    if (!S.running) return;
    var dt = Math.min(50, now - (S.last || now)); S.last = now;
    S.agents.forEach(function (a) { a.step(dt, now); });
    S.raf = requestAnimationFrame(loop);
  }

  function interrupt(e) {
    if (e.type === 'keydown' && e.key !== 'Escape') return;
    if (e.type === 'scroll' && window.scrollY < 40) return;
    finish(true);
  }
  function bindInterrupts(on) {
    var f = on ? 'addEventListener' : 'removeEventListener';
    window[f]('wheel', interrupt, { passive: true });
    window[f]('touchmove', interrupt, { passive: true });
    window[f]('keydown', interrupt);
    window[f]('scroll', interrupt, { passive: true });
  }

  function start() {
    window.POPOLAB_SWARM_STARTED = true;
    root.classList.add('swarm-pending');
    S.finished = false; S.done = 0; S.boxes = []; S.guides = [];
    S.layer = el('div', 'sw-layer'); S.layer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(S.layer);
    var targets = buildTargets();
    S.total = targets.length;
    var count = small ? 6 : 10, workers = small ? 3 : 4;
    S.agents = [];
    for (var i = 0; i < count; i++) S.agents.push(new Agent(S.layer, i));
    S.hud = makeHud(count); hudUpdate();
    addGuides();
    S.t0 = performance.now(); S.running = true; S.last = 0;
    S.raf = requestAnimationFrame(loop);
    bindInterrupts(true);
    /* 依序把工作分給前幾個游標 */
    var qi = 0, active = 0;
    function pump(a) {
      if (S.finished) return;
      if (qi >= targets.length) { active--; if (active <= 0) complete(); return; }
      var t = targets[qi++];
      runTask(a, t, function () { pump(a); });
    }
    for (var k = 0; k < workers; k++) { active++; (function (a, d) { setTimeout(function () { pump(a); }, d); })(S.agents[k], 250 + k * 160); }
    /* 保險：最久 12 秒一定結束 */
    S.safety = setTimeout(function () { finish(true); }, 12000);
  }

  function complete() {
    if (S.finished) return;
    var secs = ((performance.now() - S.t0) / 1000).toFixed(1);
    if (S.hud) {
      S.hud.innerHTML = '<span class="dots">' + S.hud.querySelector('.dots').innerHTML + '</span><span>由 ' + S.agents.length + ' 位 agent 在 ' + secs + ' 秒內蓋好</span><button type="button" class="go">上線 ✓</button>';
      S.hud.querySelector('.go').addEventListener('click', function () { finish(false); });
    }
    S.goTimer = setTimeout(function () { finish(false); }, 1500);
  }

  function finish(instant) {
    if (S.finished) return;
    S.finished = true;
    clearTimeout(S.safety); clearTimeout(S.goTimer);
    bindInterrupts(false);
    P.store.set('popolab-built', '1');
    revealAll();
    S.boxes.forEach(function (b) { killBox(b, 0); });
    S.guides.forEach(function (g) { g.classList.remove('on'); });
    if (S.hud) { var h = S.hud; h.classList.add('out'); setTimeout(function () { h.remove(); }, 500); S.hud = null; }
    var layer = S.layer, agents = S.agents;
    S.running = false; cancelAnimationFrame(S.raf);
    setTimeout(function () { S.guides.forEach(function (g) { g.remove(); }); }, 500);
    if (fine && P.motionOn()) {
      /* 桌機：把游標交給「跟隨」模式 */
      Flock.adopt(layer, agents.slice(0, 8));
      agents.slice(8).forEach(function (a) { a.e.classList.add('fade'); setTimeout(function () { a.e.remove(); }, 600); });
    } else {
      /* 手機：游標飛走 */
      S.running = true; S.last = 0;
      agents.forEach(function (a) { a.queue = []; a.seg = null; a.go(a.x < innerWidth / 2 ? -80 : innerWidth + 80, a.y + rand(-80, 80), instant ? 400 : 700); });
      S.raf = requestAnimationFrame(loop);
      setTimeout(function () { S.running = false; cancelAnimationFrame(S.raf); layer.remove(); }, 900);
    }
  }

  /* ---------- 跟隨模式（桌機） ---------- */
  var Flock = {
    layer: null, agents: [], raf: 0, mx: -1, my: -1, lastMove: 0, on: false,
    adopt: function (layer, agents) {
      this.layer = layer; this.agents = agents;
      layer.className = 'sw-flock';
      agents.forEach(function (a) { a.queue = []; a.seg = null; a.vx = a.vy = 0; });
      this.start();
    },
    fresh: function () {
      var layer = el('div', 'sw-flock'); layer.setAttribute('aria-hidden', 'true'); document.body.appendChild(layer);
      var list = [];
      for (var i = 0; i < 8; i++) list.push(new Agent(layer, i));
      this.adopt(layer, list);
    },
    start: function () {
      if (this.on) return; this.on = true;
      var self = this, last = 0;
      function tick(now) {
        if (!self.on) return;
        var dt = Math.min(40, now - (last || now)); last = now;
        var idle = self.mx < 0 || now - self.lastMove > 4500;
        var n = self.agents.length;
        for (var i = 0; i < n; i++) {
          var a = self.agents[i], tx, ty;
          if (idle) {
            tx = innerWidth * (.5 + .36 * Math.sin(now / 5200 + a.ph)) + Math.cos(now / 1300 * a.w + a.ph) * 40;
            ty = innerHeight * (.5 + .3 * Math.sin(now / 3900 * a.w + a.ph * 1.7));
          } else {
            var ang = a.ph + now / 1000 * .55 * a.w;
            tx = self.mx + Math.cos(ang) * a.r + 10; ty = self.my + Math.sin(ang) * a.r * .8 + 14;
          }
          var k = idle ? .00055 : .0016;
          a.vx += (tx - a.x) * k * dt; a.vy += (ty - a.y) * k * dt;
          for (var j = 0; j < n; j++) {
            if (j === i) continue;
            var b = self.agents[j], dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy;
            if (d2 < 900 && d2 > .01) { var f = (900 - d2) / 900 * .06 * dt; var d = Math.sqrt(d2); a.vx += dx / d * f; a.vy += dy / d * f; }
          }
          a.vx *= .9; a.vy *= .9;
          var sp = Math.hypot(a.vx, a.vy), mxs = idle ? 2.2 : 9;
          if (sp > mxs) { a.vx *= mxs / sp; a.vy *= mxs / sp; }
          a.x += a.vx; a.y += a.vy; a.draw();
        }
        self.raf = requestAnimationFrame(tick);
      }
      this.raf = requestAnimationFrame(tick);
    },
    stop: function () {
      this.on = false; cancelAnimationFrame(this.raf);
      if (this.layer) { var l = this.layer; this.agents.forEach(function (a) { a.e.classList.add('fade'); }); setTimeout(function () { l.remove(); }, 600); }
      this.layer = null; this.agents = [];
    }
  };
  window.addEventListener('pointermove', function (e) { if (e.pointerType === 'mouse') { Flock.mx = e.clientX; Flock.my = e.clientY; Flock.lastMove = performance.now(); } }, { passive: true });
  document.addEventListener('mouseleave', function () { Flock.lastMove = 0; });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { if (Flock.on) { Flock.on = false; cancelAnimationFrame(Flock.raf); Flock._paused = true; } }
    else if (Flock._paused) { Flock._paused = false; Flock.start(); }
  });
  document.addEventListener('popolab:motion', function (e) {
    if (!e.detail.on) { if (S.running && !S.finished) finish(true); Flock.stop(); }
    else if (fine && !Flock.layer) Flock.fresh();
  });

  /* ---------- 進入點 ---------- */
  function boot() {
    if (shouldBuild()) {
      var go = function () { if (!S.running && !S.finished) start(); };
      if (document.fonts && document.fonts.ready) { Promise.race([document.fonts.ready, new Promise(function (r) { setTimeout(r, 900); })]).then(go); }
      else go();
    } else {
      revealAll();
      if (fine && P.motionOn()) Flock.fresh();
    }
  }
  window.POPOLAB_SWARM = {
    replay: function () {
      Flock.stop();
      S.running = false; S.finished = false;
      if (P.motionOn()) { P.store.set('popolab-built', ''); setTimeout(start, 350); }
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
