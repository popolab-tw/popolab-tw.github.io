/* =========================================================
   POPOLAB swarm — 自己寫的輕量版「游標蜂群」
   效果靈感來自多人協作設計工具的游標，以及 swarm-cursors（Swarm Rebuild，
   DhvanilPatel/swarm-cursors）的展示；程式碼為本站從頭撰寫，沒有使用它的原始碼。
   1. 施工開場：每次進入頁面，一群游標在幾秒內分工「蓋出」第一屏
      （拖框、打字、放大、鋼筆畫線、拉參考線、拖曳複製、點擊上色）
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
  /* ---------- 游標外觀：會依工具換形狀 ---------- */
  function arrowSVG(c, dark, w, h) {
    return '<svg viewBox="0 0 20 22" width="' + (w || 20) + '" height="' + (h || 22) + '" aria-hidden="true"><path d="M2.5 1.8l14.6 8.1-6.5 1.7-3.5 6.5z" fill="' + c + '" stroke="' + (dark ? '#111' : '#fff') + '" stroke-width="1.5" stroke-linejoin="round"/></svg>';
  }
  function stroke2(d, vb, w, h) {
    return '<svg viewBox="' + vb + '" width="' + w + '" height="' + h + '" fill="none" aria-hidden="true"><path d="' + d + '" stroke="#000" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/><path d="' + d + '" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
  var TOOLS = {
    cross: { ox: -10, oy: -10, svg: function () { return stroke2('M10 2v6M10 12v6M2 10h6M12 10h6', '0 0 20 20', 20, 20); } },
    ibeam: { ox: -6, oy: -11, svg: function () { return stroke2('M3 2h6M6 2v18M3 20h6', '0 0 12 22', 12, 22); } },
    resize: { ox: -10, oy: -10, svg: function () { return stroke2('M4 4l12 12M4 4h5M4 4v5M16 16h-5M16 16v-5', '0 0 20 20', 20, 20); } },
    move: { ox: -11, oy: -11, svg: function () { return stroke2('M11 2v18M2 11h18M11 2l-3 3M11 2l3 3M11 20l-3-3M11 20l3-3M2 11l3-3M2 11l3 3M20 11l-3-3M20 11l-3 3', '0 0 22 22', 22, 22); } },
    pen: { ox: -3, oy: -19, svg: function () { return stroke2('M3 19l2.5-7.5L14 3l3 3-8.5 8.5L3 19zM3 19l5-5', '0 0 20 22', 20, 22); } },
    dup: { ox: 0, oy: 0, svg: function (c, dark) { return '<svg viewBox="0 0 26 24" width="26" height="24" aria-hidden="true"><path d="M7.5 5.8l12.6 7-5.6 1.5-3 5.6z" fill="#fff" stroke="#111" stroke-width="1.3" stroke-linejoin="round" opacity=".85"/><path d="M2.5 1.8l14.6 8.1-6.5 1.7-3.5 6.5z" fill="' + c + '" stroke="' + (dark ? '#111' : '#fff') + '" stroke-width="1.5" stroke-linejoin="round"/></svg>'; } }
  };
  function ease(t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function esc(s) { return s.replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }
  function rgba(hex, a) { var n = parseInt(hex.slice(1), 16); return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')'; }
  function introOn() { return P.store.get('popolab-intro') !== 'off'; }
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  /* ---------- 游標代理人 ---------- */
  /* i < 10：有名字的游標（Claude Opus、Claude Fable、Popo…）；i >= 10：開場時來幫忙的無名游標 */
  function Agent(layer, i) {
    var named = i < ROSTER.length, r = named ? ROSTER[i] : { c: '#ffffff', dark: true };
    this.i = i; this.c = r.c; this.dark = !!r.dark; this.named = named;
    this.e = el('div', 'sw-agent' + (named ? '' : ' anon'), '<i class="tool"></i>' + (named ? '<b style="background:' + r.c + (r.dark ? ';color:#111' : '') + '">' + r.n + '</b>' : ''));
    this.toolEl = this.e.querySelector('.tool');
    this.setTool('arrow');
    layer.appendChild(this.e);
    var side = i % 2 ? 1 : -1;
    this.x = side > 0 ? innerWidth + rand(10, 50) : -rand(10, 50);
    this.y = rand(innerHeight * .15, innerHeight * .85);
    this.vx = 0; this.vy = 0; this.seg = null; this.queue = []; this.task = null; this.next = 0; this.recent = []; this.cont = null; this.anchor = null; this.hopAt = 0;
    this.home = { x: rand(innerWidth * .1, innerWidth * .9), y: rand(innerHeight * .2, innerHeight * .8) };
    this.ph = rand(0, Math.PI * 2); this.w = rand(.6, 1.2); this.r = rand(46, 120);
    this.draw();
  }
  Agent.prototype.setTool = function (name) {
    if (this.tool === name) return;
    this.tool = name;
    var t = TOOLS[name];
    this.toolEl.innerHTML = t ? t.svg(this.c, this.dark) : arrowSVG(this.c, this.dark);
    this.toolEl.style.transform = t ? 'translate(' + t.ox + 'px,' + t.oy + 'px)' : '';
  };
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
  /* 跑去做事：和開場同一條加速減速曲線，但時間拉長約 1.5 倍，最高速度比開場低一些 */
  Agent.prototype.travel = function (x, y) { return Math.max(340, Math.min(1000, Math.hypot(x - this.x, y - this.y) / 1.4)); };
  /* 開場時跑得比較快 */
  Agent.prototype.dash = function (x, y) { return Math.max(200, Math.min(560, Math.hypot(x - this.x, y - this.y) / 2.2)); };

  /* =========================================================
     1. 施工開場
     把第一屏拆成很多「圖層」，讓一群游標分工重建：
     - 十字游標拖出灰色佔位框，再填上真的內容（圖片由上往下掃出來）
     - 文字直接被建立在旁邊，再被拖回正確位置、同時拉伸；大標題先小小地出現，再拖曳角落放大
     - 鋼筆點出分隔線；從尺規拉出紅色參考線
     - 重複的元件先做一個，再拖曳複製出其他幾個，然後改字
     - 紅色按鈕先是灰的，被點一下才變紅
     ========================================================= */
  var S = { running: false, layer: null, agents: [], boxes: [], guides: [], hud: null, t0: 0, raf: 0, done: 0, total: 0, finished: false, tasks: [], touched: [] };

  function shouldBuild() {
    if (!document.querySelector('[data-build]')) return false;
    if (!P.motionOn() || !introOn()) return false;
    if (window.scrollY > 10 || location.hash) return false;
    return true;
  }
  function revealAll() {
    S.touched.forEach(function (n) { n.style.visibility = ''; n.style.clipPath = ''; n.style.transform = ''; n.style.transformOrigin = ''; n.style.filter = ''; n.style.transition = ''; n.style.position = ''; n.style.left = ''; n.style.top = ''; n.classList.remove('sw-in', 'sw-pop'); });
    document.querySelectorAll('[data-build]').forEach(function (n) { n.style.visibility = ''; n.style.opacity = ''; n.style.clipPath = ''; });
    S.touched = [];
    root.classList.remove('swarm-pending');
  }
  function touch(n) { if (S.touched.indexOf(n) < 0) S.touched.push(n); return n; }
  function hideEl(n) { touch(n).style.visibility = 'hidden'; }
  function showEl(n, anim) {
    touch(n).style.visibility = 'visible';
    var r = n.closest('[data-build]');
    if (r && r !== n) touch(r).style.visibility = 'visible';
    if (anim) { n.classList.remove(anim); void n.offsetWidth; n.classList.add(anim); }
  }

  /* ---- 把第一屏拆成圖層 ---- */
  function hasText(n) { for (var c = n.firstChild; c; c = c.nextSibling) if (c.nodeType === 3 && /\S/.test(c.nodeValue)) return true; return false; }
  function deco(n, cs) {
    var bg = cs.backgroundColor, hasBg = bg && bg !== 'transparent' && !/rgba\([^)]*,\s*0\)$/.test(bg);
    var sides = ['Top', 'Right', 'Bottom', 'Left'].map(function (s) { return parseFloat(cs['border' + s + 'Width']) > 0 && cs['border' + s + 'Style'] !== 'none'; });
    if (hasBg || (cs.backgroundImage !== 'none' && !/text/.test(cs.webkitBackgroundClip || cs.backgroundClip || ''))) return 'rect';
    if (sides.every(Boolean)) return 'rect';
    if (sides[0]) return 'line-top';
    if (sides[2]) return 'line-bottom';
    return null;
  }
  function gkey(n) { return n.tagName + '.' + (n.classList[0] || ''); }
  function similar(a, b) {
    var ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    if (!ra.height || !rb.height) return false;
    var hr = Math.max(ra.height, rb.height) / Math.min(ra.height, rb.height);
    return hr < 1.8 && a.children.length === b.children.length;
  }
  function inFirstScreen(r) { return r.width >= 1 && r.height >= 1 && r.top < innerHeight * .98 && r.bottom > 0; }
  function T_(type, n, r, deps) { var t = { type: type, el: n, r: r, deps: deps || [], done: false, taken: false }; hideEl(n); S.tasks.push(t); return t; }

  function walk(n, parent) {
    var cs = getComputedStyle(n);
    if (cs.display === 'none') return [];
    var r = n.getBoundingClientRect();
    if (!inFirstScreen(r)) return [];
    var before = S.tasks.length, deps = parent ? [parent] : [], tag = n.tagName;
    if (n.getAttribute('data-build') === 'mega') { T_('mega', n, r, deps); return S.tasks.slice(before); }
    if (tag === 'IMG' || tag === 'VIDEO' || tag === 'PICTURE' || tag === 'IFRAME') { T_('image', n, r, deps); return S.tasks.slice(before); }
    if (tag === 'svg' || tag === 'SVG') { T_(r.width > 40 ? 'image' : 'pop', n, r, deps); return S.tasks.slice(before); }
    var d = deco(n, cs), fs = parseFloat(cs.fontSize) || 16;
    if (hasText(n)) {
      var t = T_(d === 'rect' ? 'rect' : (fs >= 34 ? 'grow' : 'text'), n, r, deps);
      if (n.matches('.btn-red')) t.restyle = true;
      return S.tasks.slice(before);
    }
    var me = parent;
    if (d) { me = T_(d === 'rect' ? 'rect' : 'line', n, r, deps); me.edge = d; }
    walkKids(n, me);
    return S.tasks.slice(before);
  }
  function walkKids(n, me) {
    var kids = Array.prototype.slice.call(n.children).filter(function (k) { return k.tagName !== 'BR'; }), i = 0;
    while (i < kids.length) {
      var j = i + 1;
      while (j < kids.length && gkey(kids[j]) === gkey(kids[i]) && similar(kids[i], kids[j])) j++;
      if (j - i >= 2) group(kids.slice(i, j), me); else walk(kids[i], me);
      i = j;
    }
  }
  /* 一組重複元件：第一個正常做，其他用「拖曳複製」 */
  function group(list, parent) {
    var mt = walk(list[0], parent);
    if (!mt.length) { list.slice(1).forEach(function (k) { walk(k, parent); }); return; }
    list.slice(1).forEach(function (k) {
      var r = k.getBoundingClientRect();
      if (!inFirstScreen(r)) return;
      var t = T_('dup', k, r, mt.concat(parent ? [parent] : []));
      t.master = list[0];
    });
  }
  function collect() {
    S.tasks = [];
    var roots = Array.prototype.slice.call(document.querySelectorAll('[data-build]'));
    var used = [];
    roots.forEach(function (rt) {
      if (used.indexOf(rt) > -1) return;
      var r = rt.getBoundingClientRect();
      if (!inFirstScreen(r)) { touch(rt).style.visibility = 'visible'; return; }
      /* 相鄰、外觀一樣的幾個區塊（例如三個數據）也當成一組重複元件 */
      var run = [rt], nx = rt.nextElementSibling;
      while (nx && nx.hasAttribute('data-build') && gkey(nx) === gkey(rt) && similar(rt, nx)) { run.push(nx); nx = nx.nextElementSibling; }
      run.forEach(function (x) { used.push(x); });
      if (run.length > 1) group(run, null); else walk(rt, null);
    });
    /* 先做上面的，再做下面的；大區塊和參考線優先 */
    S.tasks.forEach(function (t, k) { t.order = Math.round(t.r.top / 70) * 10000 + t.r.left + k * .001; });
    S.tasks.sort(function (a, b) { return a.order - b.order; });
  }

  /* ---- 畫面上的施工輔助：尺規、參考線、框 ---- */
  function makeBox(parent, r, cls) {
    var b = el('div', 'sw-box' + (cls ? ' ' + cls : ''), '<i></i><i></i><i></i><i></i><em></em>');
    b.style.left = r.left + 'px'; b.style.top = r.top + 'px'; b.style.width = (r.width || 0) + 'px'; b.style.height = (r.height || 0) + 'px';
    parent.appendChild(b); return b;
  }
  function killBox(b, delay) { setTimeout(function () { b.classList.add('gone'); setTimeout(function () { b.remove(); }, 500); }, delay || 0); }
  function sizeBox(b, x, y, w, h) { b.style.left = x + 'px'; b.style.top = y + 'px'; b.style.width = Math.max(0, w) + 'px'; b.style.height = Math.max(0, h) + 'px'; b.querySelector('em').textContent = Math.round(w) + ' × ' + Math.round(h); }
  function addRulers() {
    var top = el('div', 'sw-ruler'), left = el('div', 'sw-ruler v'), html = '', vh = '';
    for (var x = 100; x < innerWidth; x += 100) html += '<span style="left:' + x + 'px">' + x + '</span>';
    for (var y = 100; y < innerHeight; y += 100) vh += '<span style="top:' + y + 'px">' + y + '</span>';
    top.innerHTML = html; left.innerHTML = vh;
    S.layer.appendChild(top); S.layer.appendChild(left); S.guides.push(top, left);
    requestAnimationFrame(function () { top.classList.add('on'); left.classList.add('on'); });
  }
  function hudUpdate() {
    if (!S.hud) return;
    S.hud.querySelector('.cnt').textContent = S.done + ' / ' + S.total + ' 圖層';
    S.hud.querySelector('.bar i').style.width = (S.total ? S.done / S.total * 100 : 0) + '%';
    var w = S.hud.querySelector('.who'); if (w) w.textContent = S.agents.length + ' 位 agent';
  }
  function makeHud() {
    var dots = '';
    for (var i = 0; i < 4; i++) dots += '<i style="background:' + ROSTER[i].c + '"></i>';
    var h = el('div', 'sw-hud', '<span class="dots">' + dots + '</span><span class="who"></span><span class="bar"><i></i></span><span class="cnt">0 / 0 圖層</span><button type="button" class="skip">略過</button><button type="button" class="never" title="之後進入頁面都不再播放開場">不再播放</button>');
    h.setAttribute('role', 'status');
    document.body.appendChild(h);
    h.querySelector('.skip').addEventListener('click', function () { finish(true); });
    h.querySelector('.never').addEventListener('click', function () { P.store.set('popolab-intro', 'off'); finish(true); });
    return h;
  }

  /* ---- 文字的位移與縮放（不改內容，版面不會跳動） ---- */
  /* 一般元素用 transform；行內元素或本來就有 transform 的元素，改用相對位移 */
  function mover(n) {
    var cs = getComputedStyle(n);
    var mode = (cs.display === 'inline' || cs.transform !== 'none') ? (cs.position === 'static' ? 'rel' : 'fade') : 'tf';
    touch(n).style.transition = 'none';
    return {
      mode: mode,
      set: function (x, y, sc) {
        if (mode === 'tf') { n.style.transformOrigin = '0 0'; n.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px) scale(' + sc.toFixed(3) + ')'; }
        else if (mode === 'rel') { n.style.position = 'relative'; n.style.left = x.toFixed(1) + 'px'; n.style.top = y.toFixed(1) + 'px'; }
      },
      clear: function () { n.style.transform = ''; n.style.transformOrigin = ''; n.style.position = ''; n.style.left = ''; n.style.top = ''; n.style.transition = ''; }
    };
  }

  /* ---- 每種圖層的做法 ---- */
  var DO = {
    rect: function (a, t, done) {
      var r = t.r;
      a.setTool('cross');
      a.go(r.left, r.top, a.dash(r.left, r.top), null, function () {
        var b = makeBox(S.layer, { left: r.left, top: r.top, width: 0, height: 0 }); S.boxes.push(b);
        a.go(r.right, r.bottom, Math.max(260, Math.min(520, (r.width + r.height) / 2.6)), function (p) { var e = ease(p); sizeBox(b, r.left, r.top, r.width * e, r.height * e); }, function () {
          b.classList.add('wire');
          setTimeout(function () {
            showEl(t.el, 'sw-in');
            if (!t.restyle) { killBox(b, 140); done(); return; }
            /* 紅色按鈕：先是灰的，點一下才變紅 */
            t.el.style.filter = 'grayscale(1) brightness(.55)'; t.el.style.transition = 'filter .35s ease';
            a.setTool('arrow');
            var cx = r.left + r.width * .5, cy = r.top + r.height * .5;
            a.go(cx, cy, 260, null, function () {
              a.press(); ripple(cx, cy, '#ff1e2d');
              t.el.style.filter = ''; killBox(b, 120);
              setTimeout(done, 200);
            });
          }, 140);
        });
      });
    },
    image: function (a, t, done) {
      var r = t.r;
      a.setTool('cross');
      a.go(r.left, r.top, a.dash(r.left, r.top), null, function () {
        var b = makeBox(S.layer, { left: r.left, top: r.top, width: 0, height: 0 }); S.boxes.push(b);
        a.go(r.right, r.bottom, Math.max(320, Math.min(620, (r.width + r.height) / 2.4)), function (p) { var e = ease(p); sizeBox(b, r.left, r.top, r.width * e, r.height * e); }, function () {
          b.classList.add('wire');
          t.el.style.clipPath = 'inset(0 0 100% 0)'; showEl(t.el);
          /* 由上往下掃出來 */
          a.go(r.right, r.top, 160, null, function () {
            a.go(r.right, r.bottom, Math.max(500, Math.min(900, r.height * 1.4)), function (p) { t.el.style.clipPath = 'inset(0 0 ' + ((1 - p) * 100).toFixed(1) + '% 0)'; }, function () {
              t.el.style.clipPath = ''; killBox(b, 100); done();
            }, true);
          });
        });
      });
    },
    text: function (a, t, done) {
      var r = t.r, n = t.el, mv = mover(n);
      var sc0 = mv.mode === 'tf' ? rand(.55, .75) : 1;
      var dx = mv.mode === 'fade' ? 0 : rand(-80, 80), dy = mv.mode === 'fade' ? 0 : rand(30, 64) * (Math.random() < .5 ? -1 : 1);
      var sx = r.left + dx, sy = r.top + dy, w0 = r.width * sc0, h0 = r.height * sc0;
      a.setTool('cross');
      a.go(sx, sy, a.dash(sx, sy), null, function () {
        var b = makeBox(S.layer, { left: sx, top: sy, width: 0, height: 0 }, 'text'); S.boxes.push(b);
        a.go(sx + w0, sy + h0, 220, function (p) { var e = ease(p); sizeBox(b, sx, sy, w0 * e, h0 * e); }, function () {
          /* 文字直接被建立出來 */
          mv.set(dx, dy, sc0); showEl(n, 'sw-in');
          if (mv.mode === 'fade') { killBox(b, 200); setTimeout(done, 200); return; }
          /* 換成移動游標，抓住文字拖回正確位置，同時拉伸到正確大小 */
          a.setTool('move');
          a.go(sx + w0 * .5, sy + h0 * .5, 150, null, function () {
            a.press();
            a.go(r.left + r.width * .5, r.top + r.height * .5, Math.max(420, Math.min(820, Math.hypot(dx, dy) * 6)), function (p) {
              var e = ease(p), k = 1 - e, sc = sc0 + (1 - sc0) * e;
              mv.set(dx * k, dy * k, sc);
              sizeBox(b, r.left + dx * k, r.top + dy * k, r.width * sc, r.height * sc);
            }, function () { mv.clear(); killBox(b, 100); done(); });
          });
        });
      });
    },
    /* 大標題：先小小地直接出現，再換成縮放游標拖曳右下角放大到正確大小 */
    grow: function (a, t, done, mega) {
      var r = t.r, n = t.el, cs = getComputedStyle(n), fs = parseFloat(cs.fontSize) || 40, mv = mover(n);
      if (mv.mode !== 'tf') { DO.text(a, t, done); return; }
      var s0 = mega ? .15 : Math.max(.24, Math.min(.6, 18 / fs));
      a.setTool('cross');
      a.go(r.left, r.top, a.dash(r.left, r.top), null, function () {
        var b = makeBox(S.layer, { left: r.left, top: r.top, width: 0, height: 0 }, 'text'); S.boxes.push(b);
        a.go(r.left + r.width * s0, r.top + r.height * s0, 260, function (p) { var e = ease(p); sizeBox(b, r.left, r.top, r.width * s0 * e, r.height * s0 * e); }, function () {
          mv.set(0, 0, s0); showEl(n, 'sw-in');
          var cx = r.left + r.width * s0, cy = r.top + r.height * s0;
          a.setTool('resize');
          a.go(cx, cy, 160, null, function () {
            a.press();
            a.go(r.right, r.bottom, mega ? 1300 : Math.max(650, Math.min(1100, (r.width + r.height) * 1.2)), function (p) {
              var e = ease(p), sc = s0 + (1 - s0) * e;
              mv.set(0, 0, sc); sizeBox(b, r.left, r.top, r.width * sc, r.height * sc);
            }, function () { mv.clear(); killBox(b, 120); done(); });
          });
        });
      });
    },
    mega: function (a, t, done) { DO.grow(a, t, done, true); },
    /* 鋼筆：點起點，拉出橡皮筋線，點終點 */
    line: function (a, t, done) {
      var r = t.r, y = t.edge === 'line-bottom' ? r.bottom - 1 : r.top;
      a.setTool('pen');
      a.go(r.left, y, a.dash(r.left, y), null, function () {
        a.press();
        var ln = el('div', 'sw-pen'); ln.style.left = r.left + 'px'; ln.style.top = y + 'px'; ln.style.width = '0px'; S.layer.appendChild(ln); S.boxes.push(ln);
        var dot = el('div', 'sw-dot'); dot.style.left = r.left + 'px'; dot.style.top = y + 'px'; S.layer.appendChild(dot); S.boxes.push(dot);
        a.go(r.right, y, Math.max(300, Math.min(700, r.width / 2.4)), function (p) { ln.style.width = (r.width * ease(p)) + 'px'; }, function () {
          a.press(); showEl(t.el);
          var d2 = el('div', 'sw-dot'); d2.style.left = r.right + 'px'; d2.style.top = y + 'px'; S.layer.appendChild(d2); S.boxes.push(d2);
          killBox(ln, 250); killBox(dot, 250); killBox(d2, 250); done();
        });
      });
    },
    /* 小圖示：點一下彈出來 */
    pop: function (a, t, done) {
      var r = t.r, cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      a.setTool('arrow');
      a.go(cx, cy, a.dash(cx, cy), null, function () { a.press(); showEl(t.el, 'sw-pop'); setTimeout(done, 160); });
    },
    /* 拖曳複製：選取第一個，按住拖到下一個位置，放開後改字 */
    dup: function (a, t, done) {
      var m = t.master.getBoundingClientRect(), r = t.r;
      var gx = m.left + m.width * .5, gy = m.top + m.height * .5;
      a.setTool('arrow');
      a.go(gx, gy, a.dash(gx, gy), null, function () {
        var sel = makeBox(S.layer, m, 'sel'); sel.querySelector('em').textContent = '⌥ 拖曳複製'; S.boxes.push(sel);
        setTimeout(function () {
          a.setTool('dup'); a.press();
          var ghost = makeBox(S.layer, m, 'ghost'); S.boxes.push(ghost);
          var dx = r.left - m.left, dy = r.top - m.top;
          var meas = el('div', 'sw-meas'); S.layer.appendChild(meas); S.boxes.push(meas);
          a.go(gx + dx, gy + dy, Math.max(380, Math.min(700, Math.hypot(dx, dy) * 1.1)), function (p) {
            var e = ease(p), x = m.left + dx * e, y = m.top + dy * e;
            ghost.style.left = x + 'px'; ghost.style.top = y + 'px';
            /* 紅色間距量測 */
            var horiz = Math.abs(dx) >= Math.abs(dy);
            if (horiz) { var gap = Math.max(0, x - m.right); meas.style.cssText = 'left:' + m.right + 'px;top:' + (m.top + m.height / 2) + 'px;width:' + gap + 'px;height:1px'; meas.setAttribute('data-v', Math.round(gap)); }
            else { var gp = Math.max(0, y - m.bottom); meas.style.cssText = 'left:' + (m.left + m.width / 2) + 'px;top:' + m.bottom + 'px;width:1px;height:' + gp + 'px'; meas.setAttribute('data-v', Math.round(gp)); }
          }, function () {
            showEl(t.el, 'sw-in');
            killBox(ghost, 60); killBox(sel, 60); killBox(meas, 300);
            a.setTool('arrow'); setTimeout(done, 120);
          });
        }, 160);
      });
    }
  };
  function ripple(x, y, c) { var rp = el('div', 'sw-ripple'); rp.style.left = x + 'px'; rp.style.top = y + 'px'; rp.style.borderColor = c; S.layer.appendChild(rp); setTimeout(function () { rp.remove(); }, 900); }

  /* ---- 一開始先從尺規拉兩條紅色參考線 ---- */
  function guideTask(a, vertical, pos, done) {
    a.setTool('arrow');
    var sx = vertical ? pos : 9, sy = vertical ? 9 : pos;
    a.go(vertical ? pos : 9, vertical ? 9 : pos, a.dash(sx, sy), null, function () {
      a.press();
      var g = el('div', 'sw-guide on red ' + (vertical ? 'v' : 'h')), lab = el('div', 'sw-gl');
      if (vertical) { g.style.left = pos + 'px'; } else { g.style.top = pos + 'px'; }
      S.layer.appendChild(g); S.layer.appendChild(lab); S.guides.push(g, lab);
      var from = vertical ? { x: pos, y: 9 } : { x: 9, y: pos };
      var to = vertical ? { x: pos, y: innerHeight * .55 } : { x: innerWidth * .45, y: pos };
      a.go(to.x, to.y, 520, function (p) {
        lab.style.left = (a.x + 14) + 'px'; lab.style.top = (a.y + 10) + 'px';
        lab.textContent = vertical ? 'X ' + Math.round(pos) : 'Y ' + Math.round(pos);
      }, function () { setTimeout(function () { lab.remove(); }, 400); done(); });
    });
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

  /* ---- 派工：每個閒著的游標挑「離自己最近、可以開工」的圖層 ---- */
  function pickTask(a) {
    var best = null, bd = 1e9, seen = 0;
    for (var i = 0; i < S.tasks.length && seen < 7; i++) {
      var t = S.tasks[i];
      if (t.taken || t.done) continue;
      var ok = true;
      for (var j = 0; j < t.deps.length; j++) if (!t.deps[j].done) { ok = false; break; }
      if (!ok) continue;
      seen++;
      var d = Math.hypot(t.r.left - a.x, t.r.top - a.y) + i * 18;
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  }
  function work(a) {
    if (S.finished) return;
    var t = pickTask(a);
    if (!t) {
      if (S.done >= S.total) { complete(); return; }
      a.task = null; setTimeout(function () { work(a); }, 90); return;
    }
    t.taken = true; a.task = t;
    try {
      DO[t.type](a, t, function () {
        if (t.done) return;
        t.done = true; S.done++; hudUpdate(); a.task = null; a.setTool('arrow');
        a.go(a.x + rand(-50, 50), a.y + rand(14, 50), 180, null, function () { work(a); });
      });
    } catch (err) { t.done = true; S.done++; showEl(t.el); work(a); }
  }

  function buildLoop(now) {
    if (!S.running) return;
    var dt = Math.min(50, now - (S.last || now)); S.last = now;
    S.agents.forEach(function (a) { if (!a.stepSeg(dt) && !a.task) a.idle(dt, now); a.draw(); });
    S.raf = requestAnimationFrame(buildLoop);
  }
  function start() {
    window.POPOLAB_SWARM_STARTED = true;
    Live.stop(true);
    root.classList.add('swarm-pending');
    S.finished = false; S.done = 0; S.boxes = []; S.guides = []; S.touched = [];
    S.layer = el('div', 'sw-layer'); S.layer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(S.layer);
    collect();
    var count = small ? 8 : 18;
    S.agents = [];
    for (var i = 0; i < count; i++) S.agents.push(new Agent(S.layer, i));
    S.total = S.tasks.length + 2;
    S.hud = makeHud(); hudUpdate();
    addRulers();
    S.t0 = performance.now(); S.running = true; S.last = 0;
    S.raf = requestAnimationFrame(buildLoop);
    bindInterrupts(true);
    /* 參考線：內容的左邊界、第一個大標題的底部 */
    var pg = document.querySelector('.page'), gx = 56, first = document.querySelector('[data-build="mega"]');
    if (pg) { var cs = getComputedStyle(pg); gx = pg.getBoundingClientRect().left + parseFloat(cs.paddingLeft); }
    var gy = first ? first.getBoundingClientRect().bottom - 6 : innerHeight * .4;
    var ga = S.agents[2], gb = S.agents[5 % count];
    ga.task = gb.task = { type: 'guide' };
    var gdone = function (a) { return function () { S.done++; hudUpdate(); a.task = null; a.setTool('arrow'); work(a); }; };
    setTimeout(function () { guideTask(ga, true, gx, gdone(ga)); }, 120);
    setTimeout(function () { guideTask(gb, false, gy, gdone(gb)); }, 260);
    S.agents.forEach(function (a, k) { if (a !== ga && a !== gb) setTimeout(function () { work(a); }, 60 + k * 28); });
    S.safety = setTimeout(function () { finish(true); }, 16000);
  }
  function complete() {
    if (S.finished || S.completing) return;
    S.completing = true;
    var secs = ((performance.now() - S.t0) / 1000).toFixed(1);
    if (S.hud) {
      S.hud.innerHTML = '<span class="dots">' + S.hud.querySelector('.dots').innerHTML + '</span><span>由 ' + S.agents.length + ' 位 agent 在 ' + secs + ' 秒內蓋好 ' + S.total + ' 個圖層</span><button type="button" class="go">上線 ✓</button>';
      S.hud.querySelector('.go').addEventListener('click', function () { finish(false); });
    }
    S.goTimer = setTimeout(function () { finish(false); }, 1400);
  }
  function finish(instant) {
    if (S.finished) return;
    S.finished = true; S.completing = false;
    clearTimeout(S.safety); clearTimeout(S.goTimer);
    bindInterrupts(false);
    revealAll();
    S.boxes.forEach(function (b) { killBox(b, 0); });
    S.guides.forEach(function (g) { g.classList.remove('on'); g.classList.add('gone'); });
    var guides = S.guides; setTimeout(function () { guides.forEach(function (g) { g.remove(); }); }, 500);
    if (S.hud) { var h = S.hud; h.classList.add('out'); setTimeout(function () { h.remove(); }, 500); S.hud = null; }
    S.running = false; cancelAnimationFrame(S.raf);
    var layer = S.layer, agents = S.agents;
    agents.forEach(function (a) { a.task = null; a.setTool('arrow'); });
    if (!P.motionOn()) { agents.forEach(function (a) { a.e.classList.add('fade'); }); setTimeout(function () { layer.remove(); }, 600); return; }
    /* 有名字的游標留下來，其他的飛走 */
    var keep = small ? 4 : ROSTER.length;
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
