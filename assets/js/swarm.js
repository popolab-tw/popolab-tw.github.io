/* =========================================================
   POPOLAB swarm — 自己寫的輕量版「游標蜂群」
   靈感來自多人協作設計工具的游標；程式為本站原創。
   1. 施工開場：每次進入頁面，游標在幾秒內「蓋出」第一屏
      （可略過、可設定不再播放、捲動即結束、尊重「減少動態效果」）
   2. 常駐游標：開場後留在畫面上
      - 滑鼠在動：大多數游標跟著你
      - 滑鼠停下：游標會自己去讀某一行字、點按鈕、框選圖片
      - 只是視覺效果：不會真的點擊，也不會擋住任何操作
   ========================================================= */
(function () {
  'use strict';
  var P = window.POPOLAB || { store: { get: function () { return null; }, set: function () {} }, motionOn: function () { return true; } };
  var root = document.documentElement;
  /* 只用名字和接近品牌的顏色，不用任何 logo */
  var ROSTER = [
    { n: 'Claude Opus', c: '#d97757' },
    { n: 'Claude Fable', c: '#f0a37c', dark: true },
    { n: 'Popo', c: '#ff1e2d' },
    { n: 'ChatGPT', c: '#10a37f' },
    { n: 'Gemini', c: '#4c8df6' },
    { n: 'Grok', c: '#ffffff', dark: true },
    { n: 'DeepSeek', c: '#4d6bfe' },
    { n: 'Copilot', c: '#9b6bff' },
    { n: 'Perplexity', c: '#20b8cd' },
    { n: 'Llama', c: '#ff6b9a' }
  ];
  var fine = window.matchMedia && matchMedia('(pointer: fine)').matches;
  var small = window.innerWidth < 820;
  /* 常駐游標的節奏：同時做事的數量、讀字速度、休息時間、最高速度 */
  var T = {
    tasks: true,
    maxBusy: small ? 2 : 3,                 /* 安全上限：很少碰到，只防止剛好同時一起動 */
    readSpeed: small ? 110 : 150,           /* 讀字速度（px/秒） */
    travelSpeed: .32,                       /* 框選拉框的速度（px/毫秒） */
    restMin: small ? 14000 : 18000,         /* 做完一件事後，在原地飄多久（隨機） */
    restMax: small ? 44000 : 54000,
    followMax: 9
  };
  var READ_SEL = '.hero-desc,.hero-role,.lede,.w-hook,.prose p,.prose li,.tip p,.row .rt,.tl .what,.card .hook,.step span span,.big-sub,.support p,.small,.ci .ct,.wins .wt,.quote-card blockquote,.h-zh';
  var CLICK_SEL = '.btn,.tab,.card .thumb,.hd-cta,.ci,.play-link,.chip,.wins li a,.tl summary,.link,.circle-cta,.pager a,.motion-toggle,.yt-facade,.media-link,.crumbs a';
  var INSPECT_SEL = '.card .thumb img,.hero-visual img,.h-en,.w-title,.big-stat,.quote-card,.ba,.media-frame,.tilt-card,.stat,.gallery img,.w-stat,.tip';

  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function cursorSVG(c, dark) {
    return '<svg viewBox="0 0 20 22" aria-hidden="true"><path d="M2.5 1.8l14.6 8.1-6.5 1.7-3.5 6.5z" fill="' + c + '" stroke="' + (dark ? '#111' : '#fff') + '" stroke-width="1.5" stroke-linejoin="round"/></svg>';
  }
  function ease(t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function esc(s) { return s.replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }
  function rgba(hex, a) { var n = parseInt(hex.slice(1), 16); return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')'; }
  function introOn() { return P.store.get('popolab-intro') !== 'off'; }
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  /* ---------- 游標代理人 ---------- */
  function Agent(layer, i) {
    var r = ROSTER[i % ROSTER.length];
    this.i = i; this.c = r.c;
    this.e = el('div', 'sw-agent', cursorSVG(r.c, r.dark) + '<b style="background:' + r.c + (r.dark ? ';color:#111' : '') + '">' + r.n + '</b>');
    layer.appendChild(this.e);
    var side = i % 2 ? 1 : -1;
    this.x = side > 0 ? innerWidth + rand(20, 120) : -rand(20, 120);
    this.y = rand(innerHeight * .15, innerHeight * .85);
    this.vx = 0; this.vy = 0; this.seg = null; this.queue = []; this.task = null; this.next = 0; this.recent = []; this.cont = null; this.anchor = null; this.hopAt = 0;
    this.home = { x: rand(innerWidth * .1, innerWidth * .9), y: rand(innerHeight * .2, innerHeight * .8) };
    this.ph = rand(0, Math.PI * 2); this.w = rand(.6, 1.2); this.r = rand(46, 120);
    this.draw();
  }
  Agent.prototype.draw = function () { this.e.style.transform = 'translate3d(' + this.x.toFixed(1) + 'px,' + this.y.toFixed(1) + 'px,0)'; };
  Agent.prototype.go = function (x, y, dur, onUpdate, onDone, curve) { this.queue.push({ x: x, y: y, dur: dur, u: onUpdate, d: onDone, ez: curve === true ? 'lin' : curve }); };
  Agent.prototype.clear = function () { this.queue = []; this.seg = null; };
  Agent.prototype.stepSeg = function (dt) {
    if (!this.seg && this.queue.length) { this.seg = this.queue.shift(); this.seg.fx = this.x; this.seg.fy = this.y; this.seg.t = 0; }
    if (!this.seg) return false;
    var s = this.seg; s.t += dt;
    var p = Math.min(1, s.t / s.dur), ez = s.ez || (this.soft ? 'sine' : 'cubic');
    var e = ez === 'lin' ? p : ez === 'sine' ? (1 - Math.cos(Math.PI * p)) / 2 : ez === 'quad' ? (p < .5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2) : ease(p);
    this.x = s.fx + (s.x - s.fx) * e; this.y = s.fy + (s.y - s.fy) * e;
    if (s.u) s.u(p);
    if (p >= 1) { this.seg = null; if (s.d) s.d(); }
    return true;
  };
  Agent.prototype.idle = function (dt, now) {
    var hx = this.home.x + Math.cos(now / 900 * this.w + this.ph) * 26;
    var hy = this.home.y + Math.sin(now / 1100 * this.w + this.ph) * 18;
    this.vx += (hx - this.x) * .0025 * dt; this.vy += (hy - this.y) * .0025 * dt;
    this.vx *= .86; this.vy *= .86; this.x += this.vx; this.y += this.vy;
  };
  Agent.prototype.press = function () { var e = this.e; e.classList.add('press'); setTimeout(function () { e.classList.remove('press'); }, 170); };
  /* 走過去要花的時間：距離 ÷ 速度上限（約每秒 160px，加上緩動，最快約每秒 300px） */
  /* 跑去做事：和開場同一條加速減速曲線，但時間拉長約 1.5 倍，最高速度比開場低一些 */
  Agent.prototype.travel = function (x, y) { return Math.max(340, Math.min(1000, Math.hypot(x - this.x, y - this.y) / 1.4)); };

  /* =========================================================
     1. 施工開場
     ========================================================= */
  var S = { running: false, layer: null, agents: [], boxes: [], guides: [], hud: null, t0: 0, raf: 0, done: 0, total: 0, finished: false };

  function shouldBuild() {
    if (!document.querySelector('[data-build]')) return false;
    if (!P.motionOn() || !introOn()) return false;
    if (window.scrollY > 10 || location.hash) return false;
    return true;
  }
  function revealAll() {
    document.querySelectorAll('[data-build]').forEach(function (n) { n.style.opacity = ''; n.style.clipPath = ''; n.style.transition = ''; });
    root.classList.remove('swarm-pending');
  }
  function buildTargets() {
    var vis = [];
    document.querySelectorAll('[data-build]').forEach(function (n) {
      var r = n.getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || r.top > innerHeight * 1.02) n.style.opacity = '1';
      else vis.push({ n: n, r: r, type: n.getAttribute('data-build') || 'rect' });
    });
    return vis;
  }
  function makeBox(parent, r, cls) {
    var b = el('div', 'sw-box' + (cls ? ' ' + cls : ''), '<i></i><i></i><i></i><i></i><em></em>');
    b.style.left = r.left + 'px'; b.style.top = r.top + 'px'; b.style.width = (r.width || 0) + 'px'; b.style.height = (r.height || 0) + 'px';
    parent.appendChild(b); return b;
  }
  function killBox(b, delay) { setTimeout(function () { b.classList.add('gone'); setTimeout(function () { b.remove(); }, 500); }, delay || 0); }
  function hudUpdate() {
    if (!S.hud) return;
    S.hud.querySelector('.cnt').textContent = S.done + ' / ' + S.total + ' 圖層';
    S.hud.querySelector('.bar i').style.width = (S.total ? S.done / S.total * 100 : 0) + '%';
  }
  function runTask(a, t, next) {
    var r = t.r, n = t.n;
    a.go(r.left, r.top, Math.max(240, Math.min(620, Math.hypot(r.left - a.x, r.top - a.y) / 2.1)), null, function () {
      var b = makeBox(S.layer, { left: r.left, top: r.top, width: 0, height: 0 }), lab = b.querySelector('em');
      S.boxes.push(b);
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
          n.innerHTML = ''; n.style.opacity = '1'; b.classList.add('wire');
          var iv = setInterval(function () {
            i++;
            if (i >= text.length || S.finished) { clearInterval(iv); n.innerHTML = html; killBox(b, 120); finishTask(a, next); return; }
            n.innerHTML = esc(text.slice(0, i)) + '<span class="sw-caret"></span>';
            var c = n.querySelector('.sw-caret').getBoundingClientRect();
            a.x = c.left + 2; a.y = c.top + c.height * .5; a.draw();
          }, Math.max(45, Math.min(90, 1200 / Math.max(text.length, 1))));
        } else {
          b.classList.add('wire');
          setTimeout(function () { n.style.transition = 'opacity .35s ease'; n.style.opacity = '1'; killBox(b, 180); finishTask(a, next); }, small ? 160 : 220);
        }
      });
    });
  }
  function finishTask(a, next) { S.done++; hudUpdate(); a.go(a.x + rand(-60, 60), a.y + rand(20, 70), 220, null, next); }
  function addGuides() {
    var ruler = el('div', 'sw-ruler'), html = '';
    for (var x = 100; x < innerWidth; x += 100) html += '<span style="left:' + x + 'px">' + x + '</span>';
    ruler.innerHTML = html; S.layer.appendChild(ruler); S.guides.push(ruler);
    var first = document.querySelector('[data-build="mega"]') || document.querySelector('[data-build]');
    var xs = [[innerWidth / 2, false]];
    var pg = document.querySelector('.page');
    if (pg) { var cs = getComputedStyle(pg); var pl = pg.getBoundingClientRect().left + parseFloat(cs.paddingLeft); xs.push([pl, true]); xs.push([pg.getBoundingClientRect().right - parseFloat(cs.paddingRight), false]); }
    xs.forEach(function (v) { var g = el('div', 'sw-guide v' + (v[1] ? ' red' : '')); g.style.left = v[0] + 'px'; S.layer.appendChild(g); S.guides.push(g); });
    if (first) { var mr = first.getBoundingClientRect(); [mr.top + mr.height * .1, mr.bottom - mr.height * .08].forEach(function (y) { var g = el('div', 'sw-guide h'); g.style.top = y + 'px'; S.layer.appendChild(g); S.guides.push(g); }); }
    requestAnimationFrame(function () { S.guides.forEach(function (g) { g.classList.add('on'); }); });
  }
  function makeHud(n) {
    var dots = '';
    for (var i = 0; i < 4; i++) dots += '<i style="background:' + ROSTER[i].c + '"></i>';
    var h = el('div', 'sw-hud', '<span class="dots">' + dots + '</span><span class="who">' + n + ' 位 agent</span><span class="bar"><i></i></span><span class="cnt">0 / 0 圖層</span><button type="button" class="skip">略過</button><button type="button" class="never" title="之後進入頁面都不再播放開場">不再播放</button>');
    h.setAttribute('role', 'status');
    document.body.appendChild(h);
    h.querySelector('.skip').addEventListener('click', function () { finish(true); });
    h.querySelector('.never').addEventListener('click', function () { P.store.set('popolab-intro', 'off'); finish(true); });
    return h;
  }
  function buildLoop(now) {
    if (!S.running) return;
    var dt = Math.min(50, now - (S.last || now)); S.last = now;
    S.agents.forEach(function (a) { if (!a.stepSeg(dt)) a.idle(dt, now); a.draw(); });
    S.raf = requestAnimationFrame(buildLoop);
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
    Live.stop(true);
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
    S.raf = requestAnimationFrame(buildLoop);
    bindInterrupts(true);
    var qi = 0, active = 0;
    function pump(a) {
      if (S.finished) return;
      if (qi >= targets.length) { active--; if (active <= 0) complete(); return; }
      runTask(a, targets[qi++], function () { pump(a); });
    }
    for (var k = 0; k < workers; k++) { active++; (function (a, d) { setTimeout(function () { pump(a); }, d); })(S.agents[k], 250 + k * 160); }
    S.safety = setTimeout(function () { finish(true); }, 12000);
  }
  function complete() {
    if (S.finished) return;
    var secs = ((performance.now() - S.t0) / 1000).toFixed(1);
    if (S.hud) {
      S.hud.innerHTML = '<span class="dots">' + S.hud.querySelector('.dots').innerHTML + '</span><span>由 ' + S.agents.length + ' 位 agent 在 ' + secs + ' 秒內蓋好</span><button type="button" class="go">上線 ✓</button>';
      S.hud.querySelector('.go').addEventListener('click', function () { finish(false); });
    }
    S.goTimer = setTimeout(function () { finish(false); }, 1400);
  }
  function finish(instant) {
    if (S.finished) return;
    S.finished = true;
    clearTimeout(S.safety); clearTimeout(S.goTimer);
    bindInterrupts(false);
    revealAll();
    S.boxes.forEach(function (b) { killBox(b, 0); });
    S.guides.forEach(function (g) { g.classList.remove('on'); });
    var guides = S.guides; setTimeout(function () { guides.forEach(function (g) { g.remove(); }); }, 500);
    if (S.hud) { var h = S.hud; h.classList.add('out'); setTimeout(function () { h.remove(); }, 500); S.hud = null; }
    S.running = false; cancelAnimationFrame(S.raf);
    var layer = S.layer, agents = S.agents;
    if (!P.motionOn()) { agents.forEach(function (a) { a.e.classList.add('fade'); }); setTimeout(function () { layer.remove(); }, 600); return; }
    var keep = small ? 4 : agents.length;
    var stay = agents.slice(0, keep), leave = agents.slice(keep);
    leave.forEach(function (a) { a.clear(); a.go(a.x < innerWidth / 2 ? -90 : innerWidth + 90, a.y + rand(-60, 60), instant ? 380 : 700, null, function () { a.e.remove(); }); });
    Live.adopt(layer, stay, leave);
  }

  /* =========================================================
     2. 常駐游標：跟隨 / 讀字 / 點擊 / 框選
     ========================================================= */
  var Live = {
    on: false, layer: null, fx: null, agents: [], leaving: [], raf: 0, mx: -1, my: -1, lastMove: 0, busy: [],
    adopt: function (layer, agents, leaving) {
      this.stop(true);
      this.layer = layer; layer.className = 'sw-live';
      this.fx = el('div', 'sw-fx'); this.fx.setAttribute('aria-hidden', 'true'); document.body.appendChild(this.fx);
      this.agents = agents; this.leaving = leaving || [];
      var now = performance.now();
      agents.forEach(function (a) { a.clear(); a.task = null; a.vx = a.vy = 0; a.soft = false; a.anchor = null; a.hopAt = 0; a.next = now + rand(1500, small ? 20000 : 26000); });
      this.on = true; this.last = 0;
      var self = this;
      this.raf = requestAnimationFrame(function t(n) { self.tick(n); if (self.on) self.raf = requestAnimationFrame(t); });
    },
    fresh: function () {
      var layer = el('div', 'sw-live'); layer.setAttribute('aria-hidden', 'true'); document.body.appendChild(layer);
      var list = [], n = small ? 4 : ROSTER.length;
      for (var i = 0; i < n; i++) list.push(new Agent(layer, i));
      this.adopt(layer, list);
    },
    stop: function (instant) {
      this.on = false; cancelAnimationFrame(this.raf);
      this.clearFx();
      var l = this.layer, f = this.fx;
      if (l) { this.agents.forEach(function (a) { a.e.classList.add('fade'); }); setTimeout(function () { l.remove(); }, instant ? 0 : 600); }
      if (f) setTimeout(function () { f.remove(); }, instant ? 0 : 450);
      this.layer = null; this.fx = null; this.agents = []; this.leaving = []; this.busy = [];
    },
    clearFx: function () {
      if (!this.fx) return;
      Array.prototype.forEach.call(this.fx.children, function (c) { c.classList.add('gone'); setTimeout(function () { c.remove(); }, 420); });
      document.querySelectorAll('.sw-hover').forEach(function (e) { e.classList.remove('sw-hover'); });
    },
    interruptAll: function () {
      if (!this.on) return;
      var now = performance.now();
      this.agents.forEach(function (a) { a.cont = null; a.anchor = null; if (a.task) { a.clear(); a.task = null; a.next = now + rand(3000, 10000); } });
      this.busy = [];
      this.clearFx();
    },
    isBusy: function (e) { for (var i = 0; i < this.busy.length; i++) if (this.busy[i] === e || this.busy[i].contains(e) || e.contains(this.busy[i])) return true; return false; },
    release: function (a, e, quick) {
      var i = this.busy.indexOf(e); if (i > -1) this.busy.splice(i, 1);
      a.task = null; a.anchor = null; a.hopAt = 0;
      a.next = performance.now() + (quick ? rand(300, 900) : rand(T.restMin, T.restMax));
      a.recent.unshift(e); if (a.recent.length > 4) a.recent.pop();
    },
    inView: function (r, pad) { pad = pad || 0; return r.width > 8 && r.height > 6 && r.top > 72 + pad && r.bottom < innerHeight - 24 - pad && r.left > -2 && r.right < innerWidth + 2; },
    lines: function (e) {
      var rg = document.createRange(); rg.selectNodeContents(e);
      var rs = Array.prototype.slice.call(rg.getClientRects()), lines = [];
      rs.forEach(function (r) {
        if (r.width < 2 || r.height < 6) return;
        for (var i = 0; i < lines.length; i++) {
          var L = lines[i];
          if (Math.abs(L.top - r.top) < 6 || (r.top < L.bottom - 4 && r.bottom > L.top + 4)) { L.left = Math.min(L.left, r.left); L.right = Math.max(L.right, r.right); L.top = Math.min(L.top, r.top); L.bottom = Math.max(L.bottom, r.bottom); return; }
        }
        lines.push({ left: r.left, right: r.right, top: r.top, bottom: r.bottom });
      });
      var self = this;
      return lines.filter(function (L) { return L.right - L.left > 60 && self.inView({ width: L.right - L.left, height: L.bottom - L.top, top: L.top, bottom: L.bottom, left: L.left, right: L.right }); })
                  .sort(function (p, q) { return p.top - q.top; });
    },
    /* 收集三種任務的候選目標，依「離這個游標多近」排序 */
    options: function (a) {
      var self = this, out = [];
      [['read', READ_SEL], ['click', CLICK_SEL], ['inspect', INSPECT_SEL]].forEach(function (pair) {
        document.querySelectorAll(pair[1]).forEach(function (e) {
          if (e.closest('.sw-hud') || self.isBusy(e) || a.recent.indexOf(e) > -1) return;
          var r = e.getBoundingClientRect();
          if (r.bottom < 80 || r.top > innerHeight - 30 || r.width < 8) return;
          var nx = Math.max(r.left, Math.min(a.x, r.right)), ny = Math.max(r.top, Math.min(a.y, r.bottom));
          out.push({ type: pair[0], e: e, d: Math.hypot(nx - a.x, ny - a.y) * rand(.85, 1.15) });
        });
      });
      return out.sort(function (p, q) { return p.d - q.d; });
    },
    /* ---- 讀一行字：慢慢掃過去，留下反白 ---- */
    doRead: function (a, e, L) {
      var self = this, fx = this.fx, h = L.bottom - L.top, y = L.top + h * .5;
      this.busy.push(e); a.task = 'read';
      a.go(L.left - 3, y, a.travel(L.left - 3, y), null, function () {
        var hl = el('div', 'sw-hl');
        hl.style.cssText = 'left:' + L.left + 'px;top:' + (L.top + 1) + 'px;height:' + (h - 2) + 'px;width:0;background:' + rgba(a.c, .22) + ';box-shadow:inset -2px 0 0 ' + a.c;
        fx.appendChild(hl);
        var w = L.right - L.left;
        a.go(L.right, y, Math.max(900, w / T.readSpeed * 1000), function (p) { hl.style.width = (w * p) + 'px'; }, function () {
          setTimeout(function () { hl.classList.add('gone'); setTimeout(function () { hl.remove(); }, 900); }, 550);
          var more = self.lines(e).some(function (l) { return l.top > L.top + 4; }) && Math.random() < .6;
          a.cont = more ? { e: e, top: L.top } : null;
          a.go(a.x + rand(6, 20), a.y + rand(6, 16), 350, null, function () { self.release(a, e, more); });
        }, true);
      });
    },
    /* ---- 點一下按鈕或卡片 ---- */
    doClick: function (a, e) {
      var r = e.getBoundingClientRect();
      if (!this.inView(r)) return false;
      var x = r.left + r.width * rand(.3, .7), y = r.top + r.height * rand(.35, .65), self = this, fx = this.fx;
      var host = e.closest('.card') || e;
      this.busy.push(e); a.task = 'click';
      a.go(x, y, a.travel(x, y), null, function () {
        var box = makeBox(fx, r, 'sel'), lab = box.querySelector('em');
        box.style.borderColor = a.c; lab.style.background = a.c;
        if (a.c === '#ffffff' || a.c === '#f0a37c') lab.style.color = '#111';
        var label = (e.getAttribute('aria-label') || e.textContent || '').replace(/\s+/g, ' ').trim();
        lab.textContent = label ? (label.length > 12 ? label.slice(0, 12) + '…' : label) : 'Click';
        host.classList.add('sw-hover');
        setTimeout(function () {
          if (!self.on) return;
          a.press();
          var rp = el('div', 'sw-ripple'); rp.style.left = x + 'px'; rp.style.top = y + 'px'; rp.style.borderColor = a.c; fx.appendChild(rp);
          setTimeout(function () { rp.remove(); }, 1500);
        }, 400);
        setTimeout(function () {
          host.classList.remove('sw-hover'); box.classList.add('gone'); setTimeout(function () { box.remove(); }, 900);
          a.go(a.x + rand(-40, 40), a.y + rand(20, 50), 450, null, function () { self.release(a, e); });
        }, 1600);
      });
      return true;
    },
    /* ---- 框選一張圖或標題，標出尺寸 ---- */
    doInspect: function (a, e) {
      var r = e.getBoundingClientRect();
      if (!this.inView(r, 4) || r.width > innerWidth * .9) return false;
      var self = this, fx = this.fx;
      this.busy.push(e); a.task = 'inspect';
      a.go(r.left, r.top, a.travel(r.left, r.top), null, function () {
        var b = makeBox(fx, { left: r.left, top: r.top, width: 0, height: 0 }), lab = b.querySelector('em');
        b.style.borderColor = a.c; lab.style.background = a.c;
        if (a.c === '#ffffff' || a.c === '#f0a37c') lab.style.color = '#111';
        a.go(r.right, r.bottom, Math.max(600, Math.hypot(r.width, r.height) / T.travelSpeed), function (p) {
          var q = ease(p); b.style.width = (r.width * q) + 'px'; b.style.height = (r.height * q) + 'px';
          lab.textContent = Math.round(r.width * q) + ' × ' + Math.round(r.height * q);
        }, function () {
          setTimeout(function () { b.classList.add('gone'); setTimeout(function () { b.remove(); }, 900); self.release(a, e); }, 1200);
        });
      });
      return true;
    },
    startTask: function (a) {
      /* 1. 剛讀完的段落還有下一行：優先接著讀 */
      var c = a.cont; a.cont = null;
      if (c && document.contains(c.e) && !this.isBusy(c.e)) {
        var ls = this.lines(c.e);
        for (var i = 0; i < ls.length; i++) if (ls[i].top > c.top + 4) { this.doRead(a, c.e, ls[i]); return true; }
      }
      /* 2. 否則挑附近的東西：越近越優先，保留一點隨機 */
      var opts = this.options(a);
      for (var k = 0; k < opts.length && k < 10; k++) {
        if (k < opts.length - 1 && Math.random() < .3) continue;
        var o = opts[k];
        if (o.type === 'read') {
          var lines = this.lines(o.e);
          if (!lines.length) continue;
          lines.sort(function (p, q) { return Math.abs((p.top + p.bottom) / 2 - a.y) - Math.abs((q.top + q.bottom) / 2 - a.y); });
          this.doRead(a, o.e, lines[0]); return true;
        }
        if (o.type === 'click' && this.doClick(a, o.e)) return true;
        if (o.type === 'inspect' && this.doInspect(a, o.e)) return true;
      }
      return false;
    },
    /* 待機：在做完事的地方小幅度、慢慢地飄 */
    drift: function (a, now, dt) {
      if (!a.anchor) a.anchor = { x: Math.max(30, Math.min(innerWidth - 60, a.x)), y: Math.max(90, Math.min(innerHeight - 50, a.y)) };
      var hx = a.anchor.x + Math.cos(now / 1500 * a.w + a.ph) * 34;
      var hy = a.anchor.y + Math.sin(now / 1900 * a.w + a.ph * 1.3) * 24;
      a.vx += (hx - a.x) * .0012 * dt; a.vy += (hy - a.y) * .0012 * dt;
      a.vx *= .88; a.vy *= .88;
      a.x += a.vx; a.y += a.vy;
    },
    tick: function (now) {
      var dt = Math.min(40, now - (this.last || now)); this.last = now;
      this.leaving.forEach(function (a) { a.stepSeg(dt); a.draw(); });
      var mouseActive = fine && this.mx >= 0 && now - this.lastMove < 2800;
      var running = 0, n = this.agents.length, i, a;
      for (i = 0; i < n; i++) if (this.agents[i].task) running++;
      for (i = 0; i < n; i++) {
        a = this.agents[i];
        if (a.task) { a.stepSeg(dt); a.draw(); continue; }
        if (T.tasks && now >= a.next) {
          if (running < T.maxBusy && this.startTask(a)) { running++; a.stepSeg(dt); a.draw(); continue; }
          a.next = now + rand(2000, 6000);
        }
        if (mouseActive) {
          /* 滑鼠在動：圍著滑鼠跑 */
          if (a.seg || a.queue.length) a.clear();
          a.anchor = null;
          var ang = a.ph + now / 1000 * .55 * a.w;
          var tx = this.mx + Math.cos(ang) * a.r + 10, ty = this.my + Math.sin(ang) * a.r * .8 + 14;
          a.vx += (tx - a.x) * .0016 * dt; a.vy += (ty - a.y) * .0016 * dt;
          for (var j = 0; j < n; j++) {
            if (j === i) continue;
            var b = this.agents[j], dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy;
            if (d2 < 900 && d2 > .01) { var f = (900 - d2) / 900 * .06 * dt, d = Math.sqrt(d2); a.vx += dx / d * f; a.vy += dy / d * f; }
          }
          a.vx *= .9; a.vy *= .9;
          var sp = Math.hypot(a.vx, a.vy);
          if (sp > T.followMax) { a.vx *= T.followMax / sp; a.vy *= T.followMax / sp; }
          a.x += a.vx; a.y += a.vy;
        } else {
          /* 滑鼠停著：在原地慢慢飄 */
          if (a.seg || a.queue.length) a.stepSeg(dt);
          else this.drift(a, now, dt);
        }
        a.draw();
      }
    }
  };

  window.addEventListener('pointermove', function (e) { if (e.pointerType === 'mouse') { Live.mx = e.clientX; Live.my = e.clientY; Live.lastMove = performance.now(); } }, { passive: true });
  document.addEventListener('mouseleave', function () { Live.lastMove = 0; });
  window.addEventListener('scroll', function () { Live.interruptAll(); }, { passive: true });
  window.addEventListener('resize', function () { Live.interruptAll(); small = window.innerWidth < 820; });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { if (Live.on) { cancelAnimationFrame(Live.raf); Live._paused = true; } }
    else if (Live._paused && Live.on) { Live._paused = false; Live.last = 0; Live.raf = requestAnimationFrame(function t(n) { Live.tick(n); if (Live.on) Live.raf = requestAnimationFrame(t); }); }
  });
  document.addEventListener('popolab:motion', function (e) {
    if (!e.detail.on) { if (S.running && !S.finished) finish(true); Live.stop(); }
    else if (!Live.on) Live.fresh();
  });

  /* ---------- 進入點 ---------- */
  function boot() {
    if (shouldBuild()) {
      var go = function () { if (!S.running && !S.finished) start(); };
      if (document.fonts && document.fonts.ready) Promise.race([document.fonts.ready, new Promise(function (r) { setTimeout(r, 900); })]).then(go);
      else go();
    } else {
      revealAll();
      if (P.motionOn()) Live.fresh();
    }
  }
  window.POPOLAB_SWARM = {
    replay: function () {
      P.store.set('popolab-intro', 'on');
      if (!P.motionOn()) return;
      Live.stop(true);
      S.running = false; S.finished = false;
      (function wait(n) { if (window.scrollY < 10 || n > 40) setTimeout(start, 200); else { window.scrollTo(0, 0); setTimeout(function () { wait(n + 1); }, 50); } })(0);
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
