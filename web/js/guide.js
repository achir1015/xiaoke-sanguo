// 遊戲教學／系統說明：SVG 動畫舞台＋語音旁白（諸葛亮講解）＋練習題
// openGuide('game' | 'system', { onClose }) 自己建立全螢幕畫面，關閉時停止語音與所有計時器。
import { h, sleep } from './util.js';
import { narrator } from './tts.js';

// ======================================================================
// SVG 小工具
// ======================================================================
const NS = 'http://www.w3.org/2000/svg';
function S(tag, attrs = {}, ...kids) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) if (v != null && v !== false) el.setAttribute(k, v);
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}
const lerp = (a, b, k) => a + (b - a) * k;
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const EASE = {
  lin: (p) => p,
  io: (p) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2),
  out: (p) => 1 - Math.pow(1 - p, 3),
  in: (p) => p * p * p,
  back: (p) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); },
};
const asset = (p) => { try { return new URL('../' + p, import.meta.url).href; } catch { return p; } };
const CN = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四', '十五'];
const cn = (n) => CN[n] || String(n);

// 定位：translate + rotate + scale（記在 el._p 供補間使用）
function place(el, x, y, sc = 1, rot = 0) {
  el._p = { x, y, sc, rot };
  el.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})${rot ? ` rotate(${rot.toFixed(1)})` : ''}${sc !== 1 ? ` scale(${sc.toFixed(3)})` : ''}`);
  return el;
}
function grp(par, x = 0, y = 0, sc = 1, cls) { const g = S('g', cls ? { class: cls } : {}); place(g, x, y, sc); par.append(g); return g; }
function tx(par, x, y, str, cls = 'gd-t', attrs = {}) { const t = S('text', { x, y, class: cls, ...attrs }, str); par.append(t); return t; }
function txg(par, x, y, str, cls = 'gd-t', sc = 1) { const g = grp(par, x, y, sc); tx(g, 0, 0, str, cls); return g; }
function smooth(p) {
  if (p.length < 3) return `M${p[0][0]} ${p[0][1]} L${p[1][0]} ${p[1][1]}`;
  let d = `M${p[0][0]} ${p[0][1]}`;
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] || p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}
function wrap(str, n) { const out = []; for (let i = 0; i < str.length; i += n) out.push(str.slice(i, i + n)); return out; }

function defs() {
  const lg = (id, stops, v = true) => S('linearGradient', { id, x1: 0, y1: 0, x2: v ? 0 : 1, y2: v ? 1 : 0 },
    ...stops.map(([o, c]) => S('stop', { offset: o, 'stop-color': c })));
  return S('defs', {},
    S('radialGradient', { id: 'gd-gv', cx: 0.5, cy: 0.42, r: 0.8 }, S('stop', { offset: 0, 'stop-color': '#2e2417' }), S('stop', { offset: 1, 'stop-color': '#100c08' })),
    lg('gd-gland', [[0, '#3a2f1e'], [1, '#2a2116']]),
    lg('gd-gsky', [[0, '#1d2733'], [0.55, '#4a3b2a'], [1, '#7a5c34']]),
    lg('gd-gground', [[0, '#4d3d22'], [1, '#241b10']]),
    lg('gd-gfire', [[0, '#ffe08a'], [0.45, '#f39c12'], [1, '#c0392b']]),
    lg('gd-ggold', [[0, '#f6e2a0'], [1, '#b68a2c']]),
    lg('gd-gpaper', [[0, '#f7ecd2'], [1, '#e2cfa4']]),
    lg('gd-gbtn', [[0, '#4a3a22'], [1, '#2a2015']]),
    lg('gd-gbtnp', [[0, '#e9c96e'], [1, '#a77f28']]),
    S('filter', { id: 'gd-glow', x: '-50%', y: '-50%', width: '200%', height: '200%' },
      S('feGaussianBlur', { stdDeviation: 5, result: 'b' }), S('feMerge', {}, S('feMergeNode', { in: 'b' }), S('feMergeNode', { in: 'SourceGraphic' }))));
}

// ======================================================================
// 舞台：自己的時鐘（暫停時凍結、可變速），每一步重建
// ======================================================================
class Stage {
  constructor(host) {
    this.svg = S('svg', { viewBox: '0 0 960 540', class: 'gd-svg', preserveAspectRatio: 'xMidYMid meet', 'aria-hidden': 'true' });
    this.svg.append(defs());
    this.root = S('g');
    this.svg.append(this.root);
    host.append(this.svg);
    this.clock = 0; this.speed = 1; this.paused = false; this.jobs = [];
    let last = performance.now();
    const tick = (now) => {
      const dt = Math.min(250, Math.max(0, now - last)); last = now;
      if (!this.paused) { this.clock += dt * this.speed; this.step(); }
    };
    const raf = (now) => { if (this.dead) return; this.raf = requestAnimationFrame(raf); tick(now); };
    this.raf = requestAnimationFrame(raf);
    // 視窗被遮住時 rAF 會停，用計時器補上，動畫流程才不會卡住
    this.iv = setInterval(() => { const now = performance.now(); if (now - last > 180) tick(now); }, 200);
  }
  step() {
    const now = this.clock, list = this.jobs, keep = [];
    this.jobs = [];
    for (const j of list) {
      if (j.dur != null) {
        if (now < j.start) { keep.push(j); continue; }
        const p = Math.min(1, (now - j.start) / j.dur);
        try { j.fn(j.ease(p), p); } catch (e) { console.error(e); }
        if (p < 1) keep.push(j); else if (j.done) j.done();
      } else if (now >= j.at) { try { j.fn(); } catch (e) { console.error(e); } } else keep.push(j);
    }
    this.jobs = keep.concat(this.jobs);
  }
  reset() { this.jobs = []; this.root.replaceChildren(); this.root.removeAttribute('class'); }
  destroy() { this.dead = true; cancelAnimationFrame(this.raf); clearInterval(this.iv); this.jobs = []; }
  setPaused(b) { this.paused = b; this.svg.classList.toggle('gd-paused', b); }
  after(ms, fn) { this.jobs.push({ at: this.clock + ms, fn }); }
  wait(ms) { return new Promise((r) => this.after(ms, r)); }
  tween(ms, fn, ease = 'io', delay = 0) {
    return new Promise((r) => this.jobs.push({ start: this.clock + delay, dur: Math.max(1, ms), fn, ease: EASE[ease] || ease, done: r }));
  }
  every(ms, fn) { const loop = () => { if (fn() !== false) this.after(ms, loop); }; this.after(0, loop); }
  move(el, to, ms = 600, ease = 'io', delay = 0) {
    let a = null;
    return this.tween(ms, (k) => {
      if (!a) a = { x: 0, y: 0, sc: 1, rot: 0, ...el._p };
      place(el, lerp(a.x, to.x ?? a.x, k), lerp(a.y, to.y ?? a.y, k), lerp(a.sc, to.sc ?? a.sc, k), lerp(a.rot, to.rot ?? a.rot, k));
    }, ease, delay);
  }
  fade(el, to, ms = 400, delay = 0) {
    let a = null;
    return this.tween(ms, (k) => { if (a == null) a = el.style.opacity === '' ? 1 : +el.style.opacity; el.style.opacity = lerp(a, to, k); }, 'lin', delay);
  }
  pop(el, ms = 480, delay = 0) {
    const t = { x: 0, y: 0, sc: 1, rot: 0, ...el._p };
    const sc = el._full ?? t.sc; delete el._full;
    place(el, t.x, t.y, 0.001, t.rot);
    return this.tween(ms, (k) => place(el, t.x, t.y, Math.max(0.001, sc * k), t.rot), 'back', delay);
  }
}
const hide = (el) => { el.style.opacity = 0; return el; };
// 先縮成看不見，之後 pop 會長回原本大小
function shrink(el) { const p = { x: 0, y: 0, sc: 1, rot: 0, ...el._p }; el._full = p.sc; place(el, p.x, p.y, 0.001, p.rot); return el; }

// 線條「畫出來」
function drawIn(s, el, ms = 600, delay = 0) {
  let L = 0;
  try { L = el.getTotalLength(); } catch { /* 無長度 */ }
  if (!L) return s.wait(delay + ms);
  el.style.strokeDasharray = `${L} ${L}`; el.style.strokeDashoffset = L;
  return s.tween(ms, (k) => {
    el.style.strokeDashoffset = L * (1 - k);
    if (k >= 1) { el.style.strokeDasharray = ''; el.style.strokeDashoffset = ''; }
  }, 'io', delay);
}

// ======================================================================
// 畫圖積木
// ======================================================================
function bg(s, kind = 'ink') {
  const r = s.root;
  if (kind === 'field') {
    // 舞台比 16:9 寬時，兩側也要有畫面（超出 viewBox 的部分仍會顯示）
    r.append(S('rect', { x: -600, y: -300, width: 2160, height: 1140, fill: '#1d2733' }),
      S('rect', { x: -600, y: 0, width: 2160, height: 540, fill: 'url(#gd-gsky)' }),
      S('path', { d: 'M-600 230 L-480 190 L-380 224 L-260 184 L-140 226 L-60 200 L0 236 L70 196 L140 226 L230 176 L330 226 L420 200 L520 232 L600 190 L700 228 L790 186 L880 222 L960 200 L1060 230 L1160 188 L1280 226 L1400 196 L1560 230 L1560 260 L-600 260 Z', class: 'gd-hill' }),
      S('path', { d: 'M-600 246 Q-360 226 -120 246 T240 246 T480 240 T720 250 T960 236 T1300 244 T1560 238 L1560 840 L-600 840 Z', fill: 'url(#gd-gground)' }));
    for (let i = 0; i < 40; i++) { const x = -300 + (i * 137) % 1560, y = 290 + (i * 71) % 230; r.append(S('path', { d: `M${x} ${y} l3 -9 l2 9 l3 -7 l1 7`, class: 'gd-tuft' })); }
  } else {
    r.append(S('rect', { x: -600, y: -300, width: 2160, height: 1140, fill: '#120e09' }), S('rect', { x: -240, y: -60, width: 1440, height: 660, fill: 'url(#gd-gv)' }));
    for (let i = 0; i < 5; i++) r.append(S('path', { d: `M${-40 + i * 230} ${470 - (i % 2) * 380} q40 -26 80 0 t80 0 t80 0`, class: 'gd-cloud' }));
  }
}

function flagPath(color) {
  return S('path', { d: 'M0 -50 Q10 -54 20 -49 T38 -48 L38 -34 Q28 -37 20 -35 T0 -36 Z', class: 'gd-flag', fill: color || 'none', style: color ? '' : 'display:none' });
}

// 城池圖示（底部中心在 0,0）
function castle(par, x, y, o = {}) {
  const sc = o.sc || 1;
  const g = grp(par, x, y, sc, 'gd-castle');
  g.append(S('ellipse', { cx: 0, cy: 6, rx: 34, ry: 8, class: 'gd-shadow' }),
    S('rect', { x: -24, y: -14, width: 48, height: 20, class: 'gd-wall' }),
    ...[-22, -13, -4, 5, 14].map((cx) => S('rect', { x: cx, y: -19, width: 6, height: 6, class: 'gd-wall' })),
    S('rect', { x: -31, y: -26, width: 13, height: 32, class: 'gd-tower' }),
    S('rect', { x: 18, y: -26, width: 13, height: 32, class: 'gd-tower' }),
    S('path', { d: 'M-34 -26 L-24.5 -37 L-15 -26 Z', class: 'gd-roof' }),
    S('path', { d: 'M15 -26 L24.5 -37 L34 -26 Z', class: 'gd-roof' }),
    S('path', { d: 'M-7 6 V-3 A7 7 0 0 1 7 -3 V6 Z', class: 'gd-gate' }),
    S('line', { x1: 0, y1: -14, x2: 0, y2: -52, class: 'gd-pole' }));
  const flag = flagPath(o.color);
  g.append(flag);
  let ring = null;
  if (o.name) tx(g, 0, 22 + (o.fs || 15) / sc * 0.75, o.name, 'gd-t gd-cname', { 'font-size': ((o.fs || 15) / sc).toFixed(1) });
  return {
    g, flag,
    setColor(c) { flag.setAttribute('fill', c || 'none'); flag.style.display = c ? '' : 'none'; },
    ring(on = true) { if (ring) ring.remove(); ring = null; if (on) { ring = S('ellipse', { cx: 0, cy: 0, rx: 46, ry: 18, class: 'gd-ring' }); g.prepend(ring); } },
  };
}

// 軍隊方陣
function army(par, x, y, color, o = {}) {
  const R = o.rows || 3, C = o.cols || 4, d = 15;
  const g = grp(par, x, y, o.sc || 1, 'gd-army');
  const inner = S('g', { transform: o.flip ? 'scale(-1 1)' : '' });
  g.append(S('ellipse', { cx: 0, cy: R * d / 2 + 4, rx: C * d / 2 + 12, ry: 8, class: 'gd-shadow' }), inner);
  g.sols = [];
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
    const sg = S('g', { class: 'gd-sol' });
    place(sg, (c - (C - 1) / 2) * d, (r - (R - 1) / 2) * d);
    sg.append(S('rect', { x: -5, y: -3, width: 10, height: 10, rx: 2, fill: color, class: 'gd-solb' }),
      S('circle', { cx: 0, cy: -6, r: 3.6, class: 'gd-head' }),
      o.bow ? S('path', { d: 'M6 -8 Q12 0 6 8', class: 'gd-bow' }) : S('line', { x1: 6, y1: 7, x2: 9, y2: -13, class: 'gd-spear-s' }));
    inner.append(sg); g.sols.push(sg);
  }
  const px = -(C / 2) * d - 8;
  inner.append(S('line', { x1: px, y1: R * d / 2, x2: px, y2: -R * d / 2 - 30, class: 'gd-pole' }));
  const fl = S('path', { d: `M${px} ${-R * d / 2 - 30} l26 3 l-4 8 l4 8 l-26 -2 Z`, fill: color, class: 'gd-flag' });
  inner.append(fl);
  if (o.label != null) g.lab = tx(g, 0, R * d / 2 + 26, o.label, 'gd-t gd-t-sm');
  return g;
}

// 人物（站立）
function person(par, x, y, color, o = {}) {
  const g = grp(par, x, y, o.sc || 1, 'gd-person');
  g.append(S('ellipse', { cx: 0, cy: 2, rx: 14, ry: 4, class: 'gd-shadow' }));
  g.body = S('path', { d: 'M-12 0 L-9 -27 Q0 -33 9 -27 L12 0 Z', fill: color, class: 'gd-body' });
  g.append(g.body, S('circle', { cx: 0, cy: -36, r: 8.5, class: 'gd-head' }));
  if (o.crown) g.crown = g.appendChild(S('path', { d: 'M-8 -44 L-8 -52 L-4 -47 L0 -54 L4 -47 L8 -52 L8 -44 Z', class: 'gd-crown' }));
  else if (o.hat !== false) g.append(S('path', { d: 'M-9 -40 Q0 -52 9 -40 Z', class: 'gd-hat' }));
  if (o.name) tx(g, 0, 20, o.name, 'gd-t gd-t-sm');
  return g;
}

// 騎馬武將（單挑）
function warrior(par, x, y, color, name, flip) {
  const g = grp(par, x, y, 1, 'gd-warrior');
  const inner = S('g', { transform: flip ? 'scale(-1 1)' : '' });
  inner.append(
    S('ellipse', { cx: 0, cy: 4, rx: 48, ry: 9, class: 'gd-shadow' }),
    S('path', { d: 'M-30 -30 L-34 2 M-18 -30 L-16 2 M18 -30 L14 2 M30 -30 L34 2', class: 'gd-horse-leg' }),
    S('path', { d: 'M-38 -48 Q-58 -44 -52 -18', class: 'gd-horse-leg' }),
    S('path', { d: 'M-40 -30 Q-44 -56 -10 -56 L22 -56 Q36 -74 48 -70 L54 -58 Q44 -56 38 -44 L34 -28 Z', class: 'gd-horse' }),
    S('path', { d: 'M-10 -54 L-6 -94 Q4 -100 12 -94 L14 -54 Z', fill: color, class: 'gd-body' }),
    S('circle', { cx: 4, cy: -104, r: 10, class: 'gd-head' }),
    S('path', { d: 'M-7 -106 Q4 -124 15 -106 Z', class: 'gd-helm' }),
    S('path', { d: 'M4 -122 Q-6 -136 -16 -130', class: 'gd-plume' }),
    S('line', { x1: -22, y1: -40, x2: 62, y2: -124, class: 'gd-spear' }),
    S('path', { d: 'M62 -124 l12 -16 l-3 19 Z', class: 'gd-blade' }));
  g.append(inner);
  if (name) tx(g, 0, 30, name, 'gd-t gd-t-name');
  return g;
}

// 戰場城牆（左下角 0,0）
function bigWall(par, x, y, color) {
  const g = grp(par, x, y, 1, 'gd-bigwall');
  g.append(S('rect', { x: 0, y: -150, width: 260, height: 150, class: 'gd-wall' }));
  for (let i = 0; i < 9; i++) g.append(S('rect', { x: 4 + i * 29, y: -166, width: 18, height: 18, class: 'gd-wall' }));
  for (let r = 1; r < 5; r++) g.append(S('line', { x1: 0, y1: -150 + r * 30, x2: 260, y2: -150 + r * 30, class: 'gd-brick' }));
  g.append(S('path', { d: 'M95 0 V-58 A35 35 0 0 1 165 -58 V0 Z', class: 'gd-gate' }),
    S('rect', { x: 100, y: -214, width: 60, height: 50, class: 'gd-tower' }),
    S('path', { d: 'M88 -214 L130 -246 L172 -214 Z', class: 'gd-roof' }),
    S('line', { x1: 130, y1: -246, x2: 130, y2: -310, class: 'gd-pole' }));
  const fg = grp(g, 130, -258, 1.7);
  const flag = flagPath(color); fg.append(flag);
  const cracks = [
    'M40 -140 l10 18 l-8 14 l12 20', 'M200 -120 l-12 16 l10 12 l-8 22', 'M70 -60 l14 10 l-6 16', 'M215 -50 l-10 14 l12 10',
  ].map((d) => { const p = S('path', { d, class: 'gd-crack' }); hide(p); g.append(p); return p; });
  return { g, flag, cracks, setColor(c) { flag.setAttribute('fill', c); } };
}

// 盾牆
function shields(par, x, y, color, n = 5) {
  const g = grp(par, x, y, 1, 'gd-shields');
  for (let i = 0; i < n; i++) {
    const sg = grp(g, (i % 2) * 8, (i - (n - 1) / 2) * 32);
    sg.append(S('rect', { x: -12, y: -16, width: 24, height: 32, rx: 6, fill: color, class: 'gd-shield' }), S('circle', { r: 4, class: 'gd-boss' }));
  }
  return g;
}

// 火焰
function fire(par, x, y, sc = 1) {
  const g = grp(par, x, y, sc, 'gd-fire');
  g.append(S('path', { d: 'M0 0 C-22 -6 -18 -30 -6 -44 C-6 -30 4 -30 2 -50 C18 -36 24 -12 0 0 Z', class: 'gd-flame' }),
    S('path', { d: 'M0 -2 C-10 -6 -10 -20 -2 -28 C0 -18 6 -20 6 -30 C14 -18 12 -6 0 -2 Z', class: 'gd-flame2' }));
  return g;
}

// 爆擊星
function burst(s, par, x, y, sc = 1, cls = 'gd-burst') {
  const g = grp(par, x, y, sc);
  const pts = []; for (let i = 0; i < 16; i++) { const r = i % 2 ? 12 : 30, a = (i / 16) * Math.PI * 2; pts.push(`${(Math.cos(a) * r).toFixed(1)},${(Math.sin(a) * r).toFixed(1)}`); }
  g.append(S('polygon', { points: pts.join(' '), class: cls }));
  s.pop(g, 260).then(() => s.fade(g, 0, 380)).then(() => g.remove());
  return g;
}

function floatUp(s, par, x, y, str, cls = 'gd-t gd-t-gold') {
  const g = txg(par, x, y, str, cls);
  s.move(g, { y: y - 46 }, 1300, 'out');
  s.fade(g, 0, 500, 900).then(() => g.remove());
  return g;
}

function flyIcon(s, par, str, [x1, y1], [x2, y2], ms = 800, delay = 0, cls = 'gd-emo') {
  const g = txg(par, x1, y1, str, cls); hide(g);
  const cx = (x1 + x2) / 2, cy = Math.min(y1, y2) - 90;
  return s.tween(ms, (k) => {
    g.style.opacity = k < 0.9 ? 1 : (1 - k) * 10;
    const a = 1 - k;
    place(g, a * a * x1 + 2 * a * k * cx + k * k * x2, a * a * y1 + 2 * a * k * cy + k * k * y2);
  }, 'io', delay).then(() => g.remove());
}

// 箭雨
function volley(s, par, [x1, y1], [x2, y2], n = 8, ms = 900, delay = 0) {
  let last;
  for (let i = 0; i < n; i++) {
    const a = grp(par, x1, y1); hide(a);
    a.append(S('line', { x1: -16, y1: 0, x2: 10, y2: 0, class: 'gd-arrowshaft' }), S('path', { d: 'M14 0 L6 -4 L6 4 Z', class: 'gd-arrowtip' }));
    const tx2 = x2 + ((i * 37) % 60) - 30, ty2 = y2 + ((i * 23) % 40) - 20, sx = x1 + ((i * 13) % 24) - 12, sy = y1 + ((i * 29) % 30) - 15;
    const cx = (sx + tx2) / 2, cy = Math.min(sy, ty2) - 150;
    last = s.tween(ms, (k) => {
      a.style.opacity = k < 0.95 ? 1 : 0;
      const b = 1 - k;
      const px = b * b * sx + 2 * b * k * cx + k * k * tx2, py = b * b * sy + 2 * b * k * cy + k * k * ty2;
      const dx = 2 * b * (cx - sx) + 2 * k * (tx2 - cx), dy = 2 * b * (cy - sy) + 2 * k * (ty2 - cy);
      place(a, px, py, 1, Math.atan2(dy, dx) * 180 / Math.PI);
    }, 'lin', delay + i * 70).then(() => a.remove());
  }
  return last;
}

// 箭頭線（可畫出）
function arrowLine(par, pts, color = '#d8b45a', cls = '') {
  const g = S('g', { class: 'gd-arrowline ' + cls, style: `--c:${color}` });
  const path = S('path', { d: smooth(pts), class: 'gd-arrow-path' });
  const [x1, y1] = pts[pts.length - 2], [x2, y2] = pts[pts.length - 1];
  const head = S('path', { d: 'M2 0 L-16 -10 L-11 0 L-16 10 Z', class: 'gd-arrow-head', transform: `translate(${x2} ${y2}) rotate(${(Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI).toFixed(1)})` });
  head.style.opacity = 0;
  g.append(path, head); par.append(g);
  g.path = path; g.head = head;
  return g;
}
async function showArrow(s, a, ms = 700, delay = 0) { await drawIn(s, a.path, ms, delay); a.head.style.opacity = 1; }

// 標籤（圓角色塊）
function tag(par, x, y, text, color = '#d8b45a', o = {}) {
  const fs = o.fs || 18, w = o.w || ([...text].length * fs * 1.02 + 26), hgt = fs + 16;
  const g = grp(par, x, y, 1, 'gd-tag');
  g.append(S('rect', { x: -w / 2, y: -hgt / 2, width: w, height: hgt, rx: hgt / 2, fill: color, class: 'gd-tagbg' + (o.ghost ? ' gd-ghost' : '') }));
  tx(g, 0, fs * 0.36, text, 'gd-t gd-tag-t' + (o.dark ? ' gd-dark' : ''), { 'font-size': fs });
  return g;
}

// 數值條
function bar(par, x, y, w, label, v, max, color = '#d8b45a', o = {}) {
  const g = grp(par, x, y, 1, 'gd-barg');
  tx(g, 0, -8, label, 'gd-t gd-t-sm', { 'text-anchor': 'start' });
  const val = tx(g, w, -8, o.max ? `${fmt(v)} / ${fmt(max)}` : fmt(v), 'gd-t gd-t-sm gd-t-gold', { 'text-anchor': 'end' });
  g.append(S('rect', { x: 0, y: 0, width: w, height: 13, rx: 6.5, class: 'gd-track' }));
  const fill = S('rect', { x: 0, y: 0, width: Math.max(0, w * v / max), height: 13, rx: 6.5, fill: color, class: 'gd-fill' });
  g.append(fill);
  let cur = v;
  return {
    g,
    set(s, nv, ms = 900, delay = 0) {
      const a = cur; cur = nv;
      return s.tween(ms, (k) => {
        const z = lerp(a, nv, k);
        fill.setAttribute('width', Math.max(0, w * Math.min(1, z / max)).toFixed(1));
        val.textContent = o.max ? `${fmt(z)} / ${fmt(max)}` : fmt(z);
      }, 'io', delay);
    },
  };
}

// 資源方塊（圖示＋名稱＋數字）
function chip(par, x, y, icon, label, v, o = {}) {
  const w = o.w || 190;
  const g = grp(par, x, y, 1, 'gd-chip');
  const box = S('rect', { x: -w / 2, y: -23, width: w, height: 46, rx: 10, class: 'gd-chipbg' });
  g.append(box);
  tx(g, -w / 2 + 22, 9, icon, 'gd-emo-s');
  tx(g, -w / 2 + 42, 7, label, 'gd-t gd-t-sm', { 'text-anchor': 'start' });
  const val = tx(g, w / 2 - 14, 8, fmt(v), 'gd-t gd-t-num', { 'text-anchor': 'end' });
  let cur = v;
  return {
    g,
    set(s, nv, ms = 900, delay = 0) {
      const a = cur; cur = nv;
      s.after(delay, () => { box.classList.add(nv >= a ? 'gd-up' : 'gd-down'); s.after(ms + 500, () => box.classList.remove('gd-up', 'gd-down')); });
      return s.tween(ms, (k) => { val.textContent = fmt(lerp(a, nv, k)); }, 'io', delay);
    },
  };
}

// 紙牌卡片
function card(par, x, y, w, hgt, o = {}) {
  const g = grp(par, x, y, 1, 'gd-card');
  g.append(S('rect', { x: -w / 2 + 4, y: -hgt / 2 + 6, width: w, height: hgt, rx: 12, class: 'gd-cardsh' }),
    S('rect', { x: -w / 2, y: -hgt / 2, width: w, height: hgt, rx: 12, class: o.dark ? 'gd-cardbg-d' : 'gd-cardbg' }));
  if (o.icon) tx(g, 0, -hgt / 2 + (o.iconY || 62), o.icon, 'gd-emo-l');
  if (o.title) tx(g, 0, o.titleY ?? (o.icon ? -hgt / 2 + 104 : 8), o.title, o.dark ? 'gd-t gd-t-cardt-d' : 'gd-t gd-t-cardt');
  (o.lines || []).forEach((ln, i) => tx(g, 0, (o.linesY ?? -hgt / 2 + 136) + i * 26, ln, o.dark ? 'gd-t gd-t-sm' : 'gd-t gd-t-sm gd-dark'));
  return g;
}

// 頭像（圖片載入失敗時顯示文字）
let CLIP = 0;
const IMG = { adv: null, player: null }; // null 未知、true 有、false 沒有
function probeImages() {
  const probe = (key, src) => { if (IMG[key] != null) return; const im = new Image(); im.onload = () => { IMG[key] = true; }; im.onerror = () => { IMG[key] = false; }; im.src = src; };
  probe('adv', asset('assets/portraits/adv01.svg'));
  probe('player', asset('assets/portraits/m01.svg'));
}
function portrait(par, x, y, r, o = {}) {
  const g = grp(par, x, y, 1, 'gd-port');
  const id = 'gd-clip' + (++CLIP);
  g.append(S('clipPath', { id }, S('circle', { r })), S('circle', { r, fill: o.color || '#3a2e1d', class: 'gd-port-bg' }));
  const fb = tx(g, 0, r * 0.36, o.ch || '？', 'gd-port-ch', { 'font-size': (r * 1.0).toFixed(1) });
  if (o.src && IMG[o.kind || 'adv'] !== false) {
    const im = S('image', { href: o.src, x: -r, y: -r, width: r * 2, height: r * 2, 'clip-path': `url(#${id})`, preserveAspectRatio: 'xMidYMin slice' });
    im.addEventListener('load', () => { fb.style.display = 'none'; });
    im.addEventListener('error', () => im.remove());
    g.append(im);
  }
  g.append(S('circle', { r, class: 'gd-port-ring' }));
  if (o.name) tx(g, 0, r + 22, o.name, 'gd-t gd-t-sm');
  return g;
}
const advSrc = (i) => asset(`assets/portraits/adv${String(i).padStart(2, '0')}.svg`);

// 對話泡泡（tail：left / right / down）
function bubble(par, x, y, text, o = {}) {
  const n = o.n || 12, fs = o.fs || 19, lines = wrap(text, n);
  const w = o.w || (Math.min(n, [...text].length) * fs + 34), hgt = lines.length * (fs + 8) + 24;
  const g = grp(par, x, y, 1, 'gd-bubble');
  const t = o.tail || 'down';
  g.append(S('rect', { x: -w / 2, y: -hgt / 2, width: w, height: hgt, rx: 14, class: 'gd-bub' }),
    S('path', { d: t === 'left' ? `M${-w / 2 + 2} -6 L${-w / 2 - 16} 4 L${-w / 2 + 2} 10 Z` : t === 'right' ? `M${w / 2 - 2} -6 L${w / 2 + 16} 4 L${w / 2 - 2} 10 Z` : `M-10 ${hgt / 2 - 2} L0 ${hgt / 2 + 16} L10 ${hgt / 2 - 2} Z`, class: 'gd-bub' }));
  lines.forEach((ln, i) => tx(g, 0, -hgt / 2 + 12 + (i + 1) * (fs + 8) - 8, ln, 'gd-t gd-dark', { 'font-size': fs }));
  return g;
}

// 介面按鈕
function button(par, x, y, w, hgt, text, o = {}) {
  const g = grp(par, x, y, 1, 'gd-ubtn' + (o.primary ? ' gd-ubtn-p' : ''));
  g.append(S('rect', { x: -w / 2, y: -hgt / 2, width: w, height: hgt, rx: 9, class: 'gd-ubtn-bg' }));
  tx(g, 0, (o.fs || 18) * 0.36, text, 'gd-t gd-ubtn-t', { 'font-size': o.fs || 18 });
  return g;
}
async function press(s, b) {
  b.classList.add('gd-pressed');
  const sc = (b._p && b._p.sc) || 1;
  await s.move(b, { sc: sc * 0.92 }, 110);
  await s.move(b, { sc }, 160);
  s.after(300, () => b.classList.remove('gd-pressed'));
}

// 滑鼠游標
function pointer(s) {
  const g = grp(s.root, 990, 580, 1, 'gd-pointer');
  g.append(S('path', { d: 'M0 0 L0 30 L8 23 L14 36 L20 33 L14 21 L25 21 Z', class: 'gd-cursor' }));
  return g;
}
async function clickAt(s, ptr, x, y, ms = 650) {
  await s.move(ptr, { x, y }, ms);
  const ring = S('circle', { cx: x, cy: y, r: 4, class: 'gd-ripple' });
  s.root.insertBefore(ring, ptr);
  s.tween(500, (k) => { ring.setAttribute('r', 4 + k * 26); ring.style.opacity = 1 - k; }, 'out').then(() => ring.remove());
  await s.move(ptr, { sc: 0.82 }, 100);
  await s.move(ptr, { sc: 1 }, 140);
}

// 標題文字（舞台上方）
function heading(s, text, y = 54) { const g = txg(s.root, 480, y, text, 'gd-t gd-t-head'); hide(g); s.fade(g, 1, 500); return g; }

// 月曆
function calendar(par, x, y, year, month) {
  const g = grp(par, x, y, 1, 'gd-cal');
  const page = grp(g, 0, 0);
  page.append(S('rect', { x: -75, y: -80, width: 150, height: 160, rx: 10, class: 'gd-cardbg' }),
    S('rect', { x: -75, y: -80, width: 150, height: 40, rx: 10, class: 'gd-calhd' }),
    S('rect', { x: -75, y: -52, width: 150, height: 12, class: 'gd-calhd' }));
  tx(page, 0, -53, `西元 ${year} 年`, 'gd-t gd-t-sm');
  const m = tx(page, 0, 40, `${month} 月`, 'gd-t gd-t-cal');
  return {
    g,
    async set(s, nm) {
      await s.tween(260, (k) => page.setAttribute('transform', `scale(1 ${Math.max(0.001, 1 - k).toFixed(3)})`));
      m.textContent = `${nm} 月`;
      await s.tween(260, (k) => page.setAttribute('transform', `scale(1 ${Math.max(0.001, k).toFixed(3)})`));
    },
  };
}

// 農田
function field(par, x, y, cols = 6, rows = 3, size = 46) {
  const g = grp(par, x, y, 1, 'gd-field');
  g.tiles = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const t = grp(g, (c - (cols - 1) / 2) * (size + 6), (r - (rows - 1) / 2) * (size * 0.62 + 6));
    t.append(S('rect', { x: -size / 2, y: -size * 0.31, width: size, height: size * 0.62, rx: 5, class: 'gd-soil' }));
    const crop = shrink(grp(t, 0, size * 0.2, 1));
    crop.append(S('path', { d: 'M-12 0 V-18 M0 0 V-24 M12 0 V-18', class: 'gd-stalk' }),
      S('ellipse', { cx: -12, cy: -20, rx: 3.4, ry: 6, class: 'gd-ear' }), S('ellipse', { cx: 0, cy: -26, rx: 3.4, ry: 6, class: 'gd-ear' }), S('ellipse', { cx: 12, cy: -20, rx: 3.4, ry: 6, class: 'gd-ear' }));
    t.crop = crop;
    g.tiles.push(t);
  }
  return g;
}

// 市集攤位
function stall(par, x, y, color = '#c0392b') {
  const g = grp(par, x, y, 1, 'gd-stall');
  g.append(S('rect', { x: -34, y: -8, width: 68, height: 30, class: 'gd-wood' }),
    S('line', { x1: -30, y1: -8, x2: -30, y2: -50, class: 'gd-pole' }), S('line', { x1: 30, y1: -8, x2: 30, y2: -50, class: 'gd-pole' }),
    S('path', { d: 'M-42 -46 L42 -46 L36 -62 L-36 -62 Z', fill: color, class: 'gd-awn' }),
    S('path', { d: 'M-42 -46 q7 10 14 0 q7 10 14 0 q7 10 14 0 q7 10 14 0 q7 10 14 0 q7 10 14 0', class: 'gd-awn2' }));
  tx(g, 0, 4, '🏺', 'gd-emo-s');
  return g;
}

// 牢籠
function cage(par, x, y) {
  const g = grp(par, x, y, 1, 'gd-cage');
  g.append(S('rect', { x: -44, y: -96, width: 88, height: 100, rx: 4, class: 'gd-cagebg' }));
  for (let i = 0; i < 5; i++) g.append(S('line', { x1: -36 + i * 18, y1: -96, x2: -36 + i * 18, y2: 4, class: 'gd-bar' }));
  g.append(S('rect', { x: -48, y: -102, width: 96, height: 10, rx: 3, class: 'gd-wood' }), S('rect', { x: -48, y: 0, width: 96, height: 10, rx: 3, class: 'gd-wood' }));
  return g;
}

// 戰術徽章
const TAC = { 突擊: ['🐎', '#c0392b'], 齊射: ['🏹', '#2f9a4a'], 固守: ['🛡️', '#2f5fb3'], 計策: ['🔥', '#d07a2a'], 單挑: ['⚔️', '#7b3fa0'] };
function badge(par, x, y, name, r = 52) {
  const [ic, col] = TAC[name];
  const g = grp(par, x, y, 1, 'gd-badge');
  g.append(S('circle', { r: r + 6, class: 'gd-badge-o' }), S('circle', { r, fill: col, class: 'gd-badge-i' }));
  tx(g, 0, -2, ic, 'gd-emo', { 'font-size': r * 0.7 });
  tx(g, 0, r * 0.62, name, 'gd-t gd-badge-t', { 'font-size': r * 0.38 });
  return g;
}

// 戰術牌（可翻面）
function tacCard(par, x, y, name) {
  const g = grp(par, x, y, 1, 'gd-taccard');
  const back = S('g'), front = S('g');
  back.append(S('rect', { x: -48, y: -64, width: 96, height: 128, rx: 10, class: 'gd-cardbg-d' }), S('text', { x: 0, y: 18, class: 'gd-t gd-t-q' }, '？'));
  const [ic, col] = TAC[name];
  front.append(S('rect', { x: -48, y: -64, width: 96, height: 128, rx: 10, fill: col, class: 'gd-taccard-f' }), S('text', { x: 0, y: 4, class: 'gd-emo' }, ic), S('text', { x: 0, y: 46, class: 'gd-t gd-t-cardt-w' }, name));
  front.style.display = 'none';
  g.append(back, front);
  g.flip = async (s) => {
    const p = g._p;
    await s.tween(220, (k) => g.setAttribute('transform', `translate(${p.x} ${p.y}) scale(${Math.max(0.001, 1 - k).toFixed(3)} 1)`));
    back.style.display = 'none'; front.style.display = '';
    await s.tween(220, (k) => g.setAttribute('transform', `translate(${p.x} ${p.y}) scale(${Math.max(0.001, k).toFixed(3)} 1)`));
  };
  return g;
}

// 直立滑桿
function vslider(par, x, y, hgt, v, label, icon) {
  const g = grp(par, x, y, 1, 'gd-vs');
  g.append(S('rect', { x: -5, y: 0, width: 10, height: hgt, rx: 5, class: 'gd-track' }));
  const fill = S('rect', { x: -5, y: hgt * (1 - v), width: 10, height: hgt * v, rx: 5, class: 'gd-vsfill' });
  const knob = S('circle', { cx: 0, cy: hgt * (1 - v), r: 11, class: 'gd-knob' });
  g.append(fill, knob);
  if (icon) tx(g, 0, -14, icon, 'gd-emo-s');
  if (label) tx(g, 0, hgt + 26, label, 'gd-t gd-t-sm');
  let cur = v;
  return {
    g, knobPos: () => [x, y + hgt * (1 - cur)],
    set(s, nv, ms = 900) {
      const a = cur; cur = nv;
      return s.tween(ms, (k) => { const z = lerp(a, nv, k); fill.setAttribute('y', hgt * (1 - z)); fill.setAttribute('height', hgt * z); knob.setAttribute('cy', hgt * (1 - z)); });
    },
  };
}

// 視窗外框
function panel(par, x, y, w, hgt, title) {
  const g = grp(par, x, y, 1, 'gd-panel');
  g.append(S('rect', { x: 0, y: 0, width: w, height: hgt, rx: 14, class: 'gd-panelbg' }));
  if (title) { g.append(S('rect', { x: 0, y: 0, width: w, height: 44, rx: 14, class: 'gd-panelhd' }), S('rect', { x: 0, y: 30, width: w, height: 14, class: 'gd-panelhd' })); tx(g, 20, 29, title, 'gd-t gd-t-gold', { 'text-anchor': 'start' }); }
  return g;
}

// 王冠
function crownEl(par, x, y, sc = 1) { const g = grp(par, x, y, sc); g.append(S('path', { d: 'M-16 8 L-16 -8 L-8 0 L0 -14 L8 0 L16 -8 L16 8 Z', class: 'gd-crown' })); return g; }

// 印章
function stamp(s, par, x, y, text, color = '#b3261e', rot = -12) {
  const g = grp(par, x, y, 1, 'gd-stamp');
  const w = [...text].length * 34 + 30;
  g.append(S('rect', { x: -w / 2, y: -30, width: w, height: 60, rx: 8, stroke: color, class: 'gd-stampbox' }));
  tx(g, 0, 12, text, 'gd-t gd-stamp-t', { fill: color });
  place(g, x, y, 1, rot);
  s.pop(g, 420);
  return g;
}

// ======================================================================
// 地圖資料（與 sanguo/data.py 一致）
// ======================================================================
const CITY = {
  beiping: ['北平', 84, 6], ji: ['薊', 76, 11], nanpi: ['南皮', 80, 21], pingyuan: ['平原', 73, 27], ye: ['鄴', 65, 25],
  jinyang: ['晉陽', 55, 15], beihai: ['北海', 88, 31], puyang: ['濮陽', 71, 35], chenliu: ['陳留', 68, 42], luoyang: ['洛陽', 57, 40],
  changan: ['長安', 41, 41], tianshui: ['天水', 27, 41], wuwei: ['武威', 15, 26], xiaopei: ['小沛', 78, 44], xiapi: ['下邳', 85, 47],
  xuchang: ['許昌', 64, 49], runan: ['汝南', 69, 56], shouchun: ['壽春', 79, 57], wan: ['宛', 57, 53], hanzhong: ['漢中', 37, 53],
  xinye: ['新野', 56, 60], xiangyang: ['襄陽', 55, 66], jiangling: ['江陵', 51, 74], jiangxia: ['江夏', 64, 71], lujiang: ['廬江', 75, 66],
  jianye: ['建業', 86, 62], wu: ['吳', 91, 70], kuaiji: ['會稽', 90, 80], chaisang: ['柴桑', 72, 76], changsha: ['長沙', 61, 83],
  wuling: ['武陵', 50, 84], lingling: ['零陵', 54, 93], guiyang: ['桂陽', 65, 93], zitong: ['梓潼', 32, 62], chengdu: ['成都', 26, 72],
  jiangzhou: ['江州', 37, 77], yongan: ['永安', 44, 71], jianning: ['建寧', 27, 90],
};
const ROADS = ('beiping-ji ji-nanpi ji-jinyang:p nanpi-pingyuan nanpi-ye nanpi-beihai pingyuan-ye pingyuan-beihai pingyuan-puyang:r '
  + 'ye-jinyang:p ye-puyang:r ye-luoyang:r jinyang-changan:p beihai-xiaopei beihai-xiapi puyang-chenliu puyang-xiaopei '
  + 'chenliu-luoyang chenliu-xuchang chenliu-xiaopei luoyang-changan:p luoyang-xuchang luoyang-wan:p '
  + 'changan-tianshui changan-hanzhong:p changan-wan:p tianshui-wuwei tianshui-hanzhong:p '
  + 'xiaopei-xiapi xiaopei-runan xiapi-shouchun xiapi-jianye:r xuchang-runan xuchang-wan '
  + 'runan-shouchun runan-xinye runan-jiangxia shouchun-lujiang shouchun-jianye:r wan-xinye wan-hanzhong:p '
  + 'hanzhong-zitong:p hanzhong-yongan:p xinye-xiangyang:r xiangyang-jiangling xiangyang-jiangxia '
  + 'jiangling-yongan:r jiangling-jiangxia:r jiangling-wuling:r jiangling-changsha:r jiangxia-lujiang:r jiangxia-chaisang:r '
  + 'jiangxia-changsha:r lujiang-chaisang:r lujiang-jianye:r jianye-wu wu-kuaiji chaisang-changsha chaisang-kuaiji '
  + 'changsha-wuling changsha-lingling changsha-guiyang wuling-lingling lingling-guiyang wuling-jiangzhou:m zitong-chengdu:p '
  + 'zitong-jiangzhou chengdu-jiangzhou chengdu-jianning:m jiangzhou-yongan:r jiangzhou-jianning:m wuling-jianning:m')
  .split(' ').map((t) => { const [ab, k] = t.split(':'); const [a, b] = ab.split('-'); return [a, b, { r: 'river', p: 'pass', m: 'mount' }[k] || 'land']; });
const F194 = [
  ['曹操', '#2f5fb3', 'chenliu xuchang wan'], ['劉備', '#2f9a4a', 'xiapi xiaopei'], ['孫策', '#c0392b', 'wu kuaiji'],
  ['袁紹', '#c9a227', 'ye nanpi pingyuan jinyang'], ['呂布', '#7b3fa0', 'puyang'],
  ['劉表', '#1f8a8a', 'xiangyang jiangxia jiangling changsha wuling lingling guiyang xinye'],
  ['劉璋', '#a0622a', 'chengdu jiangzhou zitong yongan jianning'], ['馬騰', '#d07a2a', 'wuwei tianshui'], ['張魯', '#8a8f99', 'hanzhong'],
  ['公孫瓚', '#e5e7eb', 'beiping ji'], ['袁術', '#8b1e3f', 'shouchun runan lujiang'], ['李傕', '#5b6472', 'changan'],
];
const F220 = [
  ['魏', '#2f5fb3', 'luoyang xuchang ye changan tianshui wan xiangyang shouchun chenliu puyang pingyuan nanpi ji beiping jinyang beihai xiaopei xiapi runan wuwei xinye'],
  ['蜀', '#2f9a4a', 'chengdu hanzhong zitong jiangzhou yongan jianning'],
  ['吳', '#c0392b', 'jianye jiangling jiangxia lujiang wu kuaiji chaisang changsha wuling lingling guiyang'],
];
const owners = (F) => { const o = {}; for (const [, c, cs] of F) for (const k of cs.split(' ')) o[k] = c; return o; };
const ME = '#2f9a4a', FOE = '#2f5fb3';
const MX = (x) => 140 + x * 6.9, MY = (y) => 34 + y * 4.75;
const cpos = (k) => [MX(CITY[k][1]), MY(CITY[k][2])];
function bfs(start) {
  const adj = {}; for (const [a, b] of ROADS) { (adj[a] ||= []).push(b); (adj[b] ||= []).push(a); }
  const seen = new Set([start]), q = [start];
  for (let i = 0; i < q.length; i++) for (const n of adj[q[i]] || []) if (!seen.has(n)) { seen.add(n); q.push(n); }
  return q;
}

// 地圖（可移動鏡頭）
function drawMap(s, o = {}) {
  const g = S('g', { class: 'gd-map' });
  s.root.append(g);
  g.append(S('rect', { x: -600, y: -500, width: 2200, height: 1600, fill: 'url(#gd-gland)' }),
    S('path', { d: 'M820 -500 C800 60 868 150 846 250 C826 340 796 400 812 470 C826 540 840 700 860 1100 L1700 1100 L1700 -500 Z', class: 'gd-sea' }));
  for (let i = 0; i < 6; i++) g.append(S('path', { d: `M${870 + (i % 2) * 30} ${40 + i * 80} q12 -8 24 0 t24 0`, class: 'gd-wave' }));
  for (const [x, y] of [[30, 48], [34, 58], [22, 64], [47, 20], [51, 11], [20, 84], [41, 64], [47, 66], [33, 32], [13, 36], [44, 88]]) {
    g.append(S('path', { d: `M${MX(x) - 22} ${MY(y) + 10} L${MX(x) - 6} ${MY(y) - 14} L${MX(x) + 4} ${MY(y) - 2} L${MX(x) + 12} ${MY(y) - 10} L${MX(x) + 26} ${MY(y) + 10} Z`, class: 'gd-mt' }));
  }
  const riv = (pts, w) => g.append(S('path', { d: smooth(pts.map(([x, y]) => [MX(x), MY(y)])), class: 'gd-river', 'stroke-width': w }));
  riv([[8, 27], [22, 34], [36, 37], [48, 35], [58, 34], [64, 31], [70, 30], [77, 28], [86, 25], [100, 23]], 7);
  riv([[20, 84], [32, 81], [42, 75], [50, 78], [58, 77.5], [64, 75], [70, 72], [76, 66], [81, 60], [90, 57], [100, 56]], 8);
  riv([[36, 57], [46, 57], [56, 63], [61, 69], [64, 74]], 4);
  const roadsG = S('g'), citiesG = S('g'), over = S('g');
  g.append(roadsG, citiesG, over);
  const roads = {};
  for (const [a, b, k] of ROADS) {
    const [x1, y1] = cpos(a), [x2, y2] = cpos(b);
    const el = S('line', { x1, y1, x2, y2, class: 'gd-road gd-road-' + k });
    roadsG.append(el); roads[a + '-' + b] = el; roads[b + '-' + a] = el;
    if (o.hideRoads) hide(el);
  }
  const castles = {};
  const own = o.owners || {};
  for (const k of Object.keys(CITY)) {
    const [x, y] = cpos(k);
    castles[k] = castle(citiesG, x, y, { sc: o.sc || 0.5, color: own[k], name: o.names === false ? '' : CITY[k][0], fs: 13 });
    if (o.hideCities) shrink(castles[k].g);
  }
  g._cam = { cx: 480, cy: 270, z: 1, r: 0 };
  const m = {
    g, roads, castles, over, citySc: o.sc || 0.5,
    road: (a, b) => roads[a + '-' + b],
    setCam(c) { g._cam = c; g.setAttribute('transform', `translate(480 270) rotate(${c.r.toFixed(2)}) scale(${c.z.toFixed(3)}) translate(${(-c.cx).toFixed(1)} ${(-c.cy).toFixed(1)})`); },
    cam(s2, to, ms = 1200) { const a = { ...g._cam }; const b = { ...a, ...to }; return s2.tween(ms, (k) => m.setCam({ cx: lerp(a.cx, b.cx, k), cy: lerp(a.cy, b.cy, k), z: lerp(a.z, b.z, k), r: lerp(a.r, b.r, k) })); },
    screen(k) { const [x, y] = cpos(k); const c = g._cam; const rad = c.r * Math.PI / 180; const dx = (x - c.cx) * c.z, dy = (y - c.cy) * c.z; return [480 + dx * Math.cos(rad) - dy * Math.sin(rad), 270 + dx * Math.sin(rad) + dy * Math.cos(rad)]; },
    async capture(s2, k, color) {
      const [x, y] = cpos(k);
      burst(s2, over, x, y - 14, 0.9);
      castles[k].setColor(color);
    },
  };
  if (o.cam) m.setCam({ cx: 480, cy: 270, z: 1, r: 0, ...o.cam });
  return m;
}

// 戰場回合計數
function roundBox(s, n = 1) {
  const g = grp(s.root, 480, 40, 1, 'gd-round');
  g.append(S('rect', { x: -110, y: -22, width: 220, height: 44, rx: 22, class: 'gd-chipbg' }));
  const t = tx(g, 0, 8, `第 ${n}／10 回合`, 'gd-t gd-t-gold');
  return { g, set(k) { t.textContent = `第 ${k}／10 回合`; } };
}

// 首頁畫面
const HOME_BTNS = ['新遊戲', '繼續遊戲', '遠端對戰', '遊戲教學', '系統說明', '設定', '檢查更新'];
function homeScreen(s, o = {}) {
  bg(s);
  const R = s.root;
  const m = grp(R, 150, 360, 1);
  castle(m, 0, 0, { sc: 2.4, color: ME });
  tx(R, 480, 74, '小柯機器人三國志', 'gd-t gd-t-title2');
  const btns = HOME_BTNS.map((t, i) => button(R, 480, 128 + i * 54, 270, 42, t, { primary: i === 0 }));
  portrait(R, 800, 300, 70, { src: advSrc(1), ch: '亮', color: '#2c3d2a', name: '軍師 諸葛亮' });
  return btns;
}

// 遊戲上方工具列
function topBar(s, items = []) {
  const R = s.root;
  R.append(S('rect', { x: -600, y: -300, width: 2160, height: 364, class: 'gd-topbar' }));
  tx(R, 250, 40, '西元 196 年 3 月・劉備', 'gd-t gd-t-gold', { 'text-anchor': 'start' });
  return items.map(([t, x, w]) => button(R, x, 32, w || 100, 38, t, { fs: 16 }));
}

// ======================================================================
// 課程內容：遊戲教學
// ======================================================================
const ADVISORS = [['諸葛亮', '均衡'], ['司馬懿', '守成'], ['郭嘉', '進攻'], ['周瑜', '進攻'], ['龐統', '謀略'], ['荀彧', '內政'], ['賈詡', '謀略'], ['魯肅', '內政'],
  ['陸遜', '守成'], ['徐庶', '均衡'], ['荀攸', '謀略'], ['法正', '進攻'], ['陳宮', '謀略'], ['田豐', '守成'], ['沮授', '均衡'], ['程昱', '進攻'], ['張昭', '內政'],
  ['呂蒙', '進攻'], ['姜維', '進攻'], ['鄧艾', '謀略'], ['黃月英', '內政'], ['蔡文姬', '均衡'], ['辛憲英', '守成'], ['王異', '進攻'], ['貂蟬', '謀略'], ['大喬', '內政'],
  ['小喬', '均衡'], ['孫尚香', '進攻'], ['甄宓', '守成'], ['鮑三娘', '進攻']];
const STYLE_COL = { 進攻: '#c0392b', 守成: '#2f5fb3', 內政: '#2f9a4a', 謀略: '#7b3fa0', 均衡: '#b68a2c' };

function hourglass(s, par, x, y, sc = 1) {
  const g = grp(par, x, y, sc, 'gd-hg');
  g.append(S('rect', { x: -40, y: -64, width: 80, height: 10, rx: 4, class: 'gd-wood' }), S('rect', { x: -40, y: 54, width: 80, height: 10, rx: 4, class: 'gd-wood' }),
    S('path', { d: 'M-32 -54 L32 -54 L4 0 L32 54 L-32 54 L-4 0 Z', class: 'gd-glass' }));
  const top = S('path', { class: 'gd-sand' }), bot = S('path', { class: 'gd-sand' }), stream = S('line', { x1: 0, y1: 0, x2: 0, y2: 52, class: 'gd-stream' });
  g.append(top, bot, stream);
  const draw = (k) => {
    const L = 46 * (1 - k), wl = 26 * L / 50;
    top.setAttribute('d', `M${-wl} ${-L} L${wl} ${-L} L0 0 Z`);
    const H = 40 * k, wb = 30 * (52 - H) / 52;
    bot.setAttribute('d', `M-30 52 L30 52 L${wb} ${52 - H} L${-wb} ${52 - H} Z`);
    stream.style.opacity = k < 0.98 ? 1 : 0;
  };
  draw(0);
  const loop = () => s.tween(3200, draw, 'lin').then(loop);
  loop();
  return g;
}

function cmdCard(par, x, y, icon, title, lines) { return card(par, x, y, 170, 230, { icon, title, lines }); }

export const GAME_LESSONS = [
  // ---------------------------------------------------------------- 1
  { title: '遊戲目標與劇本', steps: [
    { say: '歡迎來到小柯機器人三國志！我是軍師諸葛亮，接下來由我為主公講解遊戲的玩法。', scene: async (s) => {
      bg(s); const m = drawMap(s, { owners: owners(F194), names: false }); m.g.style.opacity = 0.16;
      const t = txg(s.root, 480, 150, '小柯機器人', 'gd-t gd-t-head'); hide(t); s.fade(t, 1, 600);
      [...'三國志'].forEach((ch, i) => { const g = txg(s.root, 340 + i * 140, 320, ch, 'gd-t-title'); s.pop(g, 600, 300 + i * 260); });
      const sub = txg(s.root, 480, 410, '群雄並起・一統天下', 'gd-t gd-t-gold'); hide(sub); s.fade(sub, 1, 600, 1300);
      const st = grp(s.root, 790, 380); st.append(S('rect', { x: -38, y: -38, width: 76, height: 76, rx: 10, class: 'gd-seal' })); tx(st, 0, -4, '小柯', 'gd-t gd-seal-t'); tx(st, 0, 24, '機器人', 'gd-t gd-seal-t2');
      place(st, 790, 380, 1, -8); s.pop(st, 500, 1700);
    } },
    { say: '您要選一位君主，帶領他的勢力攻佔城池。把其他勢力全部消滅，就是一統天下！', scene: async (s) => {
      bg(s); const m = drawMap(s, { owners: owners(F194) });
      heading(s, '攻佔城池・一統天下', 30);
      await s.wait(1200);
      for (const k of bfs('xiapi')) { await s.wait(110); m.capture(s, k, ME); }
      const b = tag(s.root, 480, 270, '🏆 一統天下！', '#7a1f16', { fs: 34 }); s.pop(b, 600);
    } },
    { say: '也可以設定期限，例如三年、五年或十年。期限一到，國力分數最高的勢力獲勝。', scene: async (s) => {
      bg(s); heading(s, '設定期限：比國力分數');
      const cards = ['3 年', '5 年', '10 年'].map((t, i) => { const c = card(s.root, 330 + i * 150, 140, 120, 70, { title: t, titleY: 10 }); s.pop(c, 400, i * 200); return c; });
      hourglass(s, s.root, 130, 330, 1.2);
      await s.wait(900);
      cards[1].classList.add('gd-hot');
      const data = [['曹操', '#2f5fb3', 820], ['劉備', ME, 960], ['孫策', '#c0392b', 700], ['袁紹', '#c9a227', 760]];
      const bars = data.map(([n, c, v], i) => {
        const x = 330 + i * 140; const r = S('rect', { x: x - 34, y: 480, width: 68, height: 0, rx: 6, fill: c, class: 'gd-col' }); s.root.append(r);
        tx(s.root, x, 510, n, 'gd-t gd-t-sm'); const num = tx(s.root, x, 470, '0', 'gd-t gd-t-gold');
        s.tween(1600, (k) => { const hh = v * 0.24 * k; r.setAttribute('y', 480 - hh); r.setAttribute('height', hh); num.setAttribute('y', 470 - hh); num.textContent = fmt(v * k); }, 'out', 300 + i * 150);
        return x;
      });
      await s.wait(2400);
      const cr = crownEl(s.root, bars[1], 120, 1.6); s.pop(cr, 500); await s.move(cr, { y: 210 }, 600, 'out');
    } },
    { say: '第一個劇本是群雄割據，西元 194 年，共有十二個勢力：曹操、劉備、孫策、袁紹、呂布、劉表、劉璋、馬騰、張魯、公孫瓚、袁術和李傕，另外還有幾座無主的空城。', scene: async (s) => {
      bg(s); drawMap(s, { owners: owners(F194), names: false });
      heading(s, '劇本一：群雄割據（西元 194 年）', 30);
      await s.wait(500);
      for (const [n, c, cs] of F194) { const [x, y] = cpos(cs.split(' ')[0]); const t = tag(s.root, x, y - 40, n, c, { fs: 15, dark: c === '#e5e7eb' || c === '#c9a227' }); s.pop(t, 380); await s.wait(520); }
      for (const k of ['beihai', 'luoyang', 'jianye', 'chaisang']) { const [x, y] = cpos(k); const t = tag(s.root, x, y + 26, '無主', '#3a3127', { fs: 13, ghost: true }); s.pop(t, 300); await s.wait(150); }
    } },
    { say: '第二個劇本是三分天下，西元 220 年，魏、蜀、吳三國鼎立，看誰能一統天下。', scene: async (s) => {
      bg(s); drawMap(s, { owners: owners(F220), names: false });
      heading(s, '劇本二：三分天下（西元 220 年）', 30);
      for (const [[n, c], [x, y]] of [[F220[0], [64, 30]], [F220[1], [29, 70]], [F220[2], [72, 80]]].map(([f, p], i) => [[f[0], f[1]], p, i])) {
        const g = grp(s.root, MX(x), MY(y)); g.append(S('circle', { r: 50, fill: c, class: 'gd-bigseal' })); tx(g, 0, 22, n, 'gd-t gd-t-kingdom');
        s.pop(g, 600); await s.wait(700);
      }
    } },
    { say: '練習題：設定了五年期限，期限到了，由哪一個勢力獲勝？', quiz: {
      options: ['國力分數最高的勢力', '城池最多的勢力', '武將最多的勢力'], answer: 0,
      why: ['期限到時，比的就是國力分數。', '城池多通常國力也高，但最後比的是國力分數。', '武將多不一定贏，最後比的是國力分數。'],
    }, scene: async (s) => {
      bg(s); hourglass(s, s.root, 300, 280, 1.6);
      const q = txg(s.root, 600, 300, '？', 'gd-t-title'); s.pop(q, 600);
      heading(s, '期限到了……');
    } },
  ] },
  // ---------------------------------------------------------------- 2
  { title: '地圖與城池', steps: [
    { say: '地圖上一共有 38 座城池，城與城之間有道路相連。', scene: async (s) => {
      bg(s); const m = drawMap(s, { owners: owners(F194), hideRoads: true, hideCities: true });
      const cnt = txg(s.root, 110, 70, '0 座城', 'gd-t gd-t-head'); let n = 0;
      const keys = Object.keys(CITY);
      keys.forEach((k, i) => s.after(i * 55, () => { s.pop(m.castles[k].g, 380); cnt.firstChild.textContent = `${++n} 座城`; }));
      await s.wait(keys.length * 55 + 300);
      ROADS.forEach(([a, b], i) => { const el = m.road(a, b); el.style.opacity = 1; drawIn(s, el, 500, i * 22); });
    } },
    { say: '道路分成三種：平常的陸路、要過大江大河的渡河，還有險要山路上的關隘。', scene: async (s) => {
      bg(s); const m = drawMap(s, { owners: owners(F194) });
      await m.cam(s, { cx: MX(55), cy: MY(36), z: 2.1 }, 1300);
      const legend = [['陸路', 'land', ['chenliu', 'luoyang']], ['渡河', 'river', ['ye', 'luoyang']], ['關隘', 'pass', ['luoyang', 'changan']]];
      const lg = grp(s.root, 0, 0);
      lg.append(S('rect', { x: 210, y: 460, width: 540, height: 60, rx: 14, class: 'gd-chipbg' }));
      const items = legend.map(([t, k], i) => { const g = grp(lg, 300 + i * 180, 490); g.append(S('line', { x1: -50, y1: 0, x2: -6, y2: 0, class: 'gd-road gd-road-' + k, 'stroke-width': 5 })); tx(g, 30, 7, t, 'gd-t'); return g; });
      for (let i = 0; i < legend.length; i++) {
        items[i].classList.add('gd-hot');
        const [a, b] = legend[i][2]; const [x1, y1] = cpos(a), [x2, y2] = cpos(b);
        const hl = S('line', { x1, y1, x2, y2, class: 'gd-road-hi' }); m.over.append(hl); drawIn(s, hl, 700);
        await s.wait(1600);
      }
    } },
    { say: '城上旗子的顏色代表它屬於哪一個勢力；沒有旗子的，就是無主的空城。', scene: async (s) => {
      bg(s); const m = drawMap(s, { owners: owners(F194), cam: { cx: MX(66), cy: MY(40), z: 1.8 } });
      const show = [['曹操', '#2f5fb3'], ['劉備', ME], ['呂布', '#7b3fa0'], ['袁紹', '#c9a227'], ['袁術', '#8b1e3f']];
      show.forEach(([n, c], i) => { const t = tag(s.root, 150 + i * 135, 500, n, c, { fs: 16, dark: c === '#c9a227' }); s.pop(t, 350, 300 + i * 220); });
      const t = tag(s.root, 150 + 5 * 135, 500, '無主空城', '#3a3127', { fs: 16, ghost: true }); s.pop(t, 350, 1500);
      await s.wait(1700);
      const [x, y] = cpos('luoyang'); const r = S('circle', { cx: x, cy: y - 8, r: 30, class: 'gd-pulse' }); m.over.append(r);
    } },
    { say: '用滑鼠點一下城池，就能看到城的詳細資料：金錢、糧食、人口、農業、商業、城防、民心，還有士兵、訓練、士氣和城裡的武將。', scene: async (s) => {
      bg(s); const m = drawMap(s, { owners: owners(F194), cam: { cx: MX(64) + 110, cy: MY(49), z: 2.2 } });
      const p = pointer(s);
      const [sx, sy] = m.screen('xuchang');
      await clickAt(s, p, sx + 4, sy - 6, 800);
      m.castles.xuchang.ring(true);
      const pn = panel(s.root, 980, 26, 330, 490, '許昌（曹操）');
      await s.move(pn, { x: 610 }, 500, 'out');
      const rows = [['💰', '金錢', 1200], ['🌾', '糧食', 8000], ['👥', '人口', 72000], ['🌱', '農業', 620, 1000], ['🏪', '商業', 580, 1000], ['🏯', '城防', 700, 1100], ['❤️', '民心', 72, 100], ['⚔️', '士兵', 12000], ['🎯', '訓練', 60, 100], ['🔥', '士氣', 70, 100]];
      rows.forEach(([ic, t, v, mx], i) => {
        const y = 74 + i * 36; tx(pn, 22, y + 6, ic, 'gd-emo-s', { 'text-anchor': 'start' }); tx(pn, 56, y + 6, t, 'gd-t gd-t-sm', { 'text-anchor': 'start' });
        const val = tx(pn, 310, y + 6, '0', 'gd-t gd-t-num', { 'text-anchor': 'end' });
        if (mx) { pn.append(S('rect', { x: 110, y: y - 5, width: 120, height: 10, rx: 5, class: 'gd-track' })); const f = S('rect', { x: 110, y: y - 5, width: 0, height: 10, rx: 5, class: 'gd-fillg' }); pn.append(f); s.tween(900, (k) => f.setAttribute('width', 120 * v / mx * k), 'out', i * 90); }
        s.tween(900, (k) => { val.textContent = fmt(v * k); }, 'out', i * 90);
      });
      tx(pn, 22, 456, '武將：曹仁、于禁、程昱、李典', 'gd-t gd-t-sm', { 'text-anchor': 'start' });
    } },
    { say: '在地圖上按住滑鼠拖曳，可以旋轉視角；滾動滑鼠滾輪，可以放大或縮小。', scene: async (s) => {
      bg(s); const m = drawMap(s, { owners: owners(F194) });
      const mouse = grp(s.root, 860, 430, 1, 'gd-mouse'); mouse.append(S('rect', { x: -30, y: -46, width: 60, height: 92, rx: 30, class: 'gd-mousebody' }), S('line', { x1: 0, y1: -46, x2: 0, y2: -10, class: 'gd-mouseline' }));
      const wheel = S('rect', { x: -5, y: -36, width: 10, height: 18, rx: 5, class: 'gd-wheel' }); mouse.append(wheel);
      const lab = txg(s.root, 860, 510, '按住拖曳：旋轉', 'gd-t gd-t-gold');
      const p = pointer(s);
      await s.move(p, { x: 520, y: 300 }, 600);
      p.classList.add('gd-grab');
      await Promise.all([s.move(p, { x: 380 }, 1300), m.cam(s, { r: -14 }, 1300)]);
      await Promise.all([s.move(p, { x: 600 }, 1500), m.cam(s, { r: 10 }, 1500)]);
      await Promise.all([s.move(p, { x: 500 }, 800), m.cam(s, { r: 0 }, 800)]);
      p.classList.remove('gd-grab');
      lab.firstChild.textContent = '滾輪：放大／縮小';
      wheel.classList.add('gd-hotfill');
      await m.cam(s, { z: 1.9, cx: MX(62), cy: MY(48) }, 1400);
      await s.wait(400);
      await m.cam(s, { z: 1, cx: 480, cy: 270 }, 1200);
    } },
  ] },
  // ---------------------------------------------------------------- 3
  { title: '回合流程', steps: [
    { say: '一個回合就是一個月。各勢力輪流下令，輪到您的時候，畫面上方會顯示「輪到您下令」。', scene: async (s) => {
      bg(s); const cal = calendar(s.root, 160, 260, 194, 1);
      const fs = F194.slice(0, 6);
      const toks = fs.map(([n, c], i) => { const g = grp(s.root, 330 + i * 100, 400); g.append(S('circle', { r: 34, fill: c, class: 'gd-tok' })); tx(g, 0, 7, n, 'gd-t gd-t-sm' + (c === '#e5e7eb' || c === '#c9a227' ? ' gd-dark' : '')); return g; });
      tx(s.root, 580, 470, '各勢力輪流下令', 'gd-t gd-t-sm');
      await s.wait(600); await cal.set(s, 2);
      for (let k = 0; k < 8; k++) { toks.forEach((t, i) => t.classList.toggle('gd-hot', i === k % 6)); await s.wait(320); }
      toks.forEach((t, i) => t.classList.toggle('gd-hot', i === 1));
      const ban = grp(s.root, 580, -60, 1, 'gd-banner'); ban.append(S('rect', { x: -190, y: -30, width: 380, height: 60, rx: 12, class: 'gd-banner-bg' })); tx(ban, 0, 11, '📣 輪到您下令', 'gd-t gd-t-banner');
      await s.move(ban, { y: 110 }, 600, 'back');
    } },
    { say: '每位武將每個月可以執行一個指令。全部用完之後，按「結束回合」。', scene: async (s) => {
      bg(s); const names = [['關羽', '訓練'], ['張飛', '徵兵'], ['糜竺', '開墾'], ['孫乾', '商業']];
      const cards = names.map(([n], i) => { const c = card(s.root, 170 + i * 205, 230, 170, 230, {}); person(c, 0, -10, ME, { sc: 1.5 }); tx(c, 0, 40, n, 'gd-t gd-t-cardt'); c.st = tag(c, 0, 82, '待命', '#6b5a3a', { fs: 15 }); return c; });
      const end = button(s.root, 480, 470, 200, 50, '結束回合 ▶', { primary: true });
      const p = pointer(s);
      for (let i = 0; i < 4; i++) {
        await clickAt(s, p, 170 + i * 205, 250, 500);
        cards[i].st.remove(); cards[i].st = tag(cards[i], 0, 82, names[i][1], '#2f6b3a', { fs: 15 }); s.pop(cards[i].st, 300);
        stamp(s, cards[i], 30, -60, '已行動', '#b3261e', -14);
        await s.wait(250);
      }
      await clickAt(s, p, 480, 470, 600); press(s, end);
      floatUp(s, s.root, 480, 420, '下一個月 ➜');
    } },
    { say: '所有勢力都下完令，就進行月底結算：依商業與民心收金錢，依農業收糧食。', scene: async (s) => {
      bg(s); heading(s, '月底結算');
      castle(s.root, 480, 320, { sc: 2.4, color: ME, name: '下邳', fs: 18 });
      stall(s.root, 170, 210); tx(s.root, 170, 260, '商業＋民心', 'gd-t gd-t-sm');
      const f = field(s.root, 170, 400, 3, 2, 40); f.tiles.forEach((t) => place(t.crop, 0, 8, 1)); tx(s.root, 170, 470, '農業', 'gd-t gd-t-sm');
      const gold = chip(s.root, 790, 210, '💰', '金錢', 1000), food = chip(s.root, 790, 400, '🌾', '糧食', 5000);
      for (let i = 0; i < 6; i++) flyIcon(s, s.root, '🪙', [170, 190], [750, 210], 800, i * 140);
      gold.set(s, 1600, 900, 600);
      await s.wait(1700);
      for (let i = 0; i < 6; i++) flyIcon(s, s.root, '🌾', [170, 380], [750, 400], 800, i * 140);
      await food.set(s, 6500, 900, 600);
    } },
    { say: '每年七月是秋收，糧食會大豐收！', scene: async (s) => {
      bg(s); const cal = calendar(s.root, 150, 240, 194, 6);
      const f = field(s.root, 480, 300, 5, 3, 56);
      const food = chip(s.root, 820, 140, '🌾', '糧食', 5000);
      f.tiles.forEach((t, i) => s.pop(t.crop, 600, i * 60));
      await s.wait(700); await cal.set(s, 7);
      f.classList.add('gd-ripe');
      await food.set(s, 20000, 1200);
      floatUp(s, s.root, 480, 170, '🎉 秋收大豐收！');
    } },
    { say: '士兵每個月都要吃糧。糧食不夠的話，士兵就會逃亡。', scene: async (s) => {
      bg(s); const a = army(s.root, 400, 300, ME, { rows: 4, cols: 6, sc: 1.8 });
      const food = chip(s.root, 800, 200, '🌾', '糧食', 1200), sol = chip(s.root, 800, 300, '⚔️', '士兵', 10000);
      for (let m = 0; m < 3; m++) {
        for (let i = 0; i < 3; i++) flyIcon(s, s.root, '🌾', [760, 200], [400, 280], 700, i * 120);
        await food.set(s, Math.max(0, 1200 - (m + 1) * 500), 700, 300);
        await s.wait(350);
      }
      const warn = tag(s.root, 480, 470, '⚠ 糧食不足，士兵逃亡！', '#8a1c14', { fs: 20 }); s.pop(warn, 400);
      a.sols.filter((_, i) => i % 3 === 0).forEach((sg, i) => { s.move(sg, { x: sg._p.x + 160, y: sg._p.y + (i % 2 ? 30 : -30) }, 1200, 'in', i * 60); s.fade(sg, 0, 700, 600 + i * 60); });
      await sol.set(s, 7600, 1100, 300);
    } },
    { say: '練習題：哪一個月是秋收，糧食會大豐收？', quiz: {
      options: ['一月', '七月', '十二月'], answer: 1,
      why: ['一月是新的一年開始，不是秋收。', '每年七月秋收，糧食大豐收。', '十二月是年底，不是秋收。'],
    }, scene: async (s) => {
      bg(s); const cal = calendar(s.root, 330, 280, 195, '？'); s.pop(cal.g, 500);
      const f = field(s.root, 650, 300, 3, 3, 50); f.classList.add('gd-ripe'); f.tiles.forEach((t, i) => s.pop(t.crop, 500, i * 70));
    } },
  ] },
  // ---------------------------------------------------------------- 4
  { title: '內政指令', steps: [
    { say: '內政指令能讓城池越來越富強，一共有四種：開墾、商業、修城和撫民。', scene: async (s) => {
      bg(s); heading(s, '內政指令');
      const cs = [['🌾', '開墾', ['農業 ↑', '花 100 金', '看 政治']], ['💰', '商業', ['商業 ↑', '花 100 金', '看 政治']], ['🏯', '修城', ['城防 ↑', '花 100 金', '看 統率']], ['❤️', '撫民', ['民心 ↑', '花 100 糧', '看 魅力']]];
      cs.forEach(([ic, t, ls], i) => { const c = cmdCard(s.root, 480, 640, ic, t, ls); s.move(c, { x: 180 + i * 200, y: 300, rot: (i - 1.5) * 3 }, 700, 'out', i * 300); });
    } },
    { say: '開墾可以提高農業，要花 100 金，效果看武將的政治。農業越高，收到的糧食越多。', scene: async (s) => {
      bg(s); heading(s, '🌾 開墾');
      const f = field(s.root, 330, 300, 5, 3, 60);
      const gold = chip(s.root, 760, 160, '💰', '金錢', 1000), b = bar(s.root, 640, 260, 250, '🌱 農業', 300, 1000, '#7fb04a', { max: true });
      tag(s.root, 760, 340, '效果看：政治', '#3d5a2a', { fs: 17 });
      gold.set(s, 900, 700, 300);
      f.tiles.forEach((t, i) => { s.after(400 + i * 120, () => t.firstChild.classList.add('gd-tilled')); s.pop(t.crop, 400, 400 + i * 120); });
      await b.set(s, 420, 1800, 600);
    } },
    { say: '商業可以提高商業值，同樣花 100 金，看政治。商業越高，每個月收到的金錢越多。', scene: async (s) => {
      bg(s); heading(s, '💰 商業');
      const st = [['#c0392b', 200], ['#2f5fb3', 330], ['#c9a227', 460]].map(([c, x], i) => { const g = stall(s.root, x, 330, c); s.pop(g, 450, 300 + i * 300); return g; });
      const gold = chip(s.root, 760, 160, '💰', '金錢', 1000), b = bar(s.root, 640, 260, 250, '🏪 商業', 300, 1000, '#d8b45a', { max: true });
      tag(s.root, 760, 340, '效果看：政治', '#3d5a2a', { fs: 17 });
      gold.set(s, 900, 700, 300);
      await s.wait(1200);
      st.forEach((g, i) => { for (let k = 0; k < 3; k++) s.after(i * 200 + k * 400, () => floatUp(s, s.root, g._p.x, 260, '🪙', 'gd-emo')); });
      await b.set(s, 410, 1500, 200);
    } },
    { say: '修城可以提高城防，花 100 金，效果看統率。城防越高，敵人就越難攻進來。', scene: async (s) => {
      bg(s); heading(s, '🏯 修城');
      const w = bigWall(s.root, 160, 430, ME);
      w.cracks.forEach((c) => { c.style.opacity = 1; });
      const gold = chip(s.root, 760, 160, '💰', '金錢', 1000), b = bar(s.root, 640, 260, 250, '🏯 城防', 500, 1100, '#8fa3c8', { max: true });
      tag(s.root, 760, 340, '效果看：統率', '#2f4a6b', { fs: 17 });
      gold.set(s, 900, 700, 300);
      for (let i = 0; i < 4; i++) { await s.wait(450); s.fade(w.cracks[i], 0, 400); const [cx, cy] = [[210, 300], [370, 320], [240, 380], [385, 390]][i]; burst(s, s.root, cx, cy, 0.6, 'gd-spark'); }
      await b.set(s, 640, 1200);
    } },
    { say: '撫民可以提高民心，要花 100 糧，效果看魅力。民心高，收入也會跟著變多。', scene: async (s) => {
      bg(s); heading(s, '❤️ 撫民');
      const ps = [0, 1, 2, 3, 4].map((i) => person(s.root, 150 + i * 85, 360 + (i % 2) * 30, ['#7a6a52', '#8a5a3a', '#5a6a7a', '#7a4a5a', '#6a7a4a'][i], { sc: 1.5 }));
      const food = chip(s.root, 760, 160, '🌾', '糧食', 5000), b = bar(s.root, 640, 260, 250, '❤️ 民心', 55, 100, '#e0607a', { max: true });
      tag(s.root, 760, 340, '效果看：魅力', '#6b2f4a', { fs: 17 });
      food.set(s, 4900, 700, 300);
      for (let k = 0; k < 3; k++) ps.forEach((p, i) => s.after(500 + k * 700 + i * 120, () => floatUp(s, s.root, p._p.x, p._p.y - 70, '❤️', 'gd-emo')));
      await b.set(s, 70, 2000, 600);
    } },
    { say: '練習題：想增加糧食，應該用哪一個指令？', quiz: {
      options: ['開墾', '商業', '修城', '撫民'], answer: 0,
      why: ['開墾提高農業，農業越高收的糧食越多。', '商業增加的是金錢，不是糧食。', '修城提高城防，不會增加糧食。', '撫民提高民心，還要花糧食。'],
    }, scene: async (s) => {
      bg(s); [['🌾', '開墾'], ['💰', '商業'], ['🏯', '修城'], ['❤️', '撫民']].forEach(([ic, t], i) => { const c = cmdCard(s.root, 180 + i * 200, 290, ic, t, ['？']); s.pop(c, 400, i * 150); });
      const q = tag(s.root, 480, 70, '🌾 糧食 ↑ ＝ ？', '#5a4320', { fs: 24 }); s.pop(q, 400);
    } },
  ] },
  // ---------------------------------------------------------------- 5
  { title: '軍事指令', steps: [
    { say: '徵兵可以增加士兵，每一千兵大約要 150 金。不過會減少人口和民心，而且新兵的訓練度比較低。', scene: async (s) => {
      bg(s); heading(s, '⚔️ 徵兵');
      castle(s.root, 330, 360, { sc: 2.6, color: ME });
      for (let i = 0; i < 6; i++) { const p = person(s.root, -30, 410 + (i % 2) * 18, '#7a6a52'); s.move(p, { x: 320 }, 1500, 'lin', i * 260).then(() => s.fade(p, 0, 200).then(() => p.remove())); }
      const c1 = chip(s.root, 760, 130, '⚔️', '士兵', 5000), c2 = chip(s.root, 760, 190, '💰', '金錢', 800), c3 = chip(s.root, 760, 250, '👥', '人口', 50000), c4 = chip(s.root, 760, 310, '❤️', '民心', 70);
      const b = bar(s.root, 665, 380, 190, '🎯 訓練', 60, 100, '#d8b45a');
      tag(s.root, 330, 470, '每 1000 兵 ≈ 150 金', '#5a4320', { fs: 18 });
      await s.wait(1400);
      c1.set(s, 6000); c2.set(s, 650, 900, 200); c3.set(s, 49000, 900, 400); c4.set(s, 66, 900, 600); b.set(s, 52, 900, 800);
    } },
    { say: '訓練可以提高部隊的訓練度和士氣，效果看武將的統率。', scene: async (s) => {
      bg(s, 'field'); heading(s, '🎯 訓練');
      const a = army(s.root, 330, 360, ME, { rows: 3, cols: 5, sc: 2 }); a.classList.add('gd-drill');
      const b1 = bar(s.root, 640, 220, 250, '🎯 訓練', 50, 100, '#d8b45a'), b2 = bar(s.root, 640, 290, 250, '🔥 士氣', 60, 100, '#e07a3a');
      tag(s.root, 765, 360, '效果看：統率', '#2f4a6b', { fs: 17 });
      for (let i = 0; i < 5; i++) s.after(400 + i * 450, () => burst(s, s.root, 260 + (i * 53) % 150, 300 + (i * 37) % 120, 0.5, 'gd-spark'));
      b1.set(s, 70, 2000, 400); await b2.set(s, 75, 2000, 600);
    } },
    { say: '運輸可以把金錢、糧食和士兵送到相鄰的我方城；移動則是讓武將搬到相鄰的我方城。', scene: async (s) => {
      bg(s);
      const A = castle(s.root, 190, 330, { sc: 2.2, color: ME, name: '小沛', fs: 18 }), B = castle(s.root, 770, 330, { sc: 2.2, color: ME, name: '下邳', fs: 18 });
      s.root.insertBefore(S('path', { d: 'M260 340 Q480 300 700 340', class: 'gd-road gd-road-land', 'stroke-width': 6 }), A.g);
      const t1 = tag(s.root, 480, 100, '運輸：金錢・糧食・士兵', '#5a4320', { fs: 20 }); s.pop(t1, 400);
      const cart = grp(s.root, 250, 320, 1.4, 'gd-cart');
      cart.append(S('rect', { x: -26, y: -24, width: 52, height: 24, rx: 4, class: 'gd-wood' }), S('circle', { cx: -14, cy: 4, r: 8, class: 'gd-wheel2' }), S('circle', { cx: 14, cy: 4, r: 8, class: 'gd-wheel2' }));
      tx(cart, 0, -30, '💰🌾', 'gd-emo-s');
      await s.move(cart, { x: 700 }, 2600, 'io');
      s.fade(cart, 0, 300);
      const t2 = tag(s.root, 480, 160, '移動：武將', '#2f4a6b', { fs: 20 }); s.pop(t2, 400);
      const p = person(s.root, 250, 380, ME, { sc: 1.6, name: '簡雍' });
      await s.move(p, { x: 700 }, 2200, 'io');
    } },
    { say: '出征是從城裡派出一到三位武將，帶至少 500 兵，去攻打相鄰的城。', scene: async (s) => {
      bg(s, 'field');
      castle(s.root, 150, 380, { sc: 2.4, color: ME }); castle(s.root, 820, 360, { sc: 2.4, color: FOE });
      [['關', '關羽'], ['張', '張飛'], ['趙', '趙雲']].forEach(([c, n], i) => { const g = portrait(s.root, 90 + i * 70, 150, 28, { ch: c, color: '#2c4a2a', name: n }); s.pop(g, 400, i * 300); });
      const t = tag(s.root, 480, 70, '1～3 位武將＋至少 500 兵', '#5a4320', { fs: 20 }); s.pop(t, 400, 900);
      await s.wait(1300);
      const ar = arrowLine(s.root, [[230, 400], [480, 360], [730, 380]], '#e0b04a'); showArrow(s, ar, 900);
      const a = army(s.root, 240, 410, ME, { label: '5,000 兵', sc: 1.3 });
      await s.move(a, { x: 690, y: 400 }, 2400, 'io');
      burst(s, s.root, 760, 360, 1.2);
    } },
    { say: '出征時要帶兵數十分之一的糧食。例如帶五千兵，就要帶五百糧。', scene: async (s) => {
      bg(s); heading(s, '出征要帶的糧食');
      const a = army(s.root, 170, 290, ME, { label: '5,000 兵', sc: 1.6 }); s.pop(a, 400);
      const parts = [[340, '÷ 10'], [480, '＝']].map(([x, t], i) => { const g = txg(s.root, x, 300, t, 'gd-t gd-t-big'); s.pop(g, 400, 600 + i * 500); return g; });
      const sack = grp(s.root, 680, 290); [[-30, 10], [30, 10], [0, -22]].forEach(([x, y]) => tx(sack, x, y + 18, '🌾', 'gd-emo-l'));
      tx(sack, 0, 90, '500 糧', 'gd-t gd-t-big');
      s.pop(sack, 500, 1700);
      void parts;
    } },
    { say: '練習題：帶三千兵出征，至少要帶多少糧食？', quiz: {
      options: ['30 糧', '300 糧', '3,000 糧'], answer: 1,
      why: ['30 太少了，要帶兵數的十分之一。', '三千的十分之一就是三百。', '不用帶那麼多，十分之一就夠了。'],
    }, scene: async (s) => {
      bg(s); const a = army(s.root, 220, 290, ME, { label: '3,000 兵', sc: 1.6 }); s.pop(a, 400);
      txg(s.root, 430, 300, '÷ 10 ＝', 'gd-t gd-t-big');
      const q = txg(s.root, 640, 310, '？', 'gd-t-title'); s.pop(q, 500, 500);
    } },
  ] },
  // ---------------------------------------------------------------- 6
  { title: '人事指令', steps: [
    { say: '搜索可能找到在野的人才，也可能找到金錢或糧食，效果看武將的智力。', scene: async (s) => {
      bg(s); heading(s, '🔍 搜索（看智力）');
      for (const [x, y, sc] of [[150, 330, 1.2], [420, 300, 1], [700, 340, 1.3], [300, 420, 0.9], [820, 430, 1]]) { const t = grp(s.root, x, y, sc); t.append(S('path', { d: 'M0 -60 L-24 -10 L-10 -10 L-30 20 L30 20 L10 -10 L24 -10 Z', class: 'gd-tree' }), S('rect', { x: -4, y: 20, width: 8, height: 14, class: 'gd-wood' })); }
      const who = person(s.root, 560, 400, '#6a6a6a', { sc: 1.6 }); hide(who);
      const lens = grp(s.root, 120, 200, 1, 'gd-lens'); lens.append(S('circle', { r: 50, class: 'gd-lensg' }), S('line', { x1: 36, y1: 36, x2: 80, y2: 80, class: 'gd-lensh' }));
      await s.move(lens, { x: 360, y: 260 }, 1000); await s.move(lens, { x: 560, y: 340 }, 900);
      s.fade(who, 1, 300); burst(s, s.root, 560, 330, 1, 'gd-spark');
      const c = card(s.root, 760, 220, 220, 120, { title: '發現在野武將！', titleY: -10, lines: ['可以用「登用」招攬'], linesY: 30 }); s.pop(c, 450);
      await s.wait(1200);
      floatUp(s, s.root, 300, 420, '💰 ＋300 金'); await s.wait(500); floatUp(s, s.root, 420, 440, '🌾 ＋500 糧');
    } },
    { say: '找到人才以後，用登用來招攬，成功率看魅力。俘虜也可以登用，忠誠越低越容易成功。', scene: async (s) => {
      bg(s); heading(s, '🤝 登用（看魅力）');
      person(s.root, 250, 360, ME, { sc: 2, crown: true, name: '劉備' });
      const who = person(s.root, 560, 360, '#7a7a7a', { sc: 2, name: '在野武將' });
      const b1 = bubble(s.root, 250, 210, '願意為我效力嗎？', { n: 9 }); s.pop(b1, 400, 300);
      await s.wait(1500);
      const b2 = bubble(s.root, 560, 210, '願效犬馬之勞！', { n: 9 }); s.pop(b2, 400);
      await s.wait(700);
      who.body.setAttribute('fill', ME); burst(s, s.root, 560, 300, 1.1, 'gd-spark'); floatUp(s, s.root, 560, 250, '❤️', 'gd-emo');
      await s.wait(900);
      const pc = card(s.root, 820, 360, 210, 220, { title: '俘虜', titleY: -60 }); s.pop(pc, 400);
      cage(pc, 0, 40).setAttribute('transform', 'translate(0 40) scale(0.7)');
      const lb = bar(pc, -80, 80, 160, '忠誠', 30, 100, '#e07a3a'); void lb;
      tag(s.root, 820, 500, '忠誠低 → 容易登用', '#5a4320', { fs: 15 });
    } },
    { say: '褒賞要花 100 金，可以提高武將的忠誠。忠誠太低的武將，可能會離開。', scene: async (s) => {
      bg(s); heading(s, '🎁 褒賞');
      const a = person(s.root, 280, 380, ME, { sc: 2, name: '陳到' });
      const la = bar(s.root, 200, 230, 160, '忠誠', 45, 100, '#d8b45a');
      const gold = chip(s.root, 120, 110, '💰', '金錢', 1000);
      for (let i = 0; i < 4; i++) flyIcon(s, s.root, '🪙', [120, 110], [280, 300], 700, 300 + i * 150);
      gold.set(s, 900, 700, 300);
      await la.set(s, 78, 1200, 800);
      floatUp(s, s.root, 280, 280, '忠誠 ↑');
      const b = person(s.root, 680, 380, ME, { sc: 2, name: '某武將' });
      const lb = bar(s.root, 600, 230, 160, '忠誠', 18, 100, '#c0392b'); void lb;
      await s.wait(600);
      const bb = bubble(s.root, 680, 160, '另謀高就吧……', { n: 8 }); s.pop(bb, 400);
      await s.wait(1200);
      b.body.setAttribute('fill', '#7a7a7a');
      s.move(b, { x: 1000 }, 1800, 'in'); s.fade(b, 0, 1200, 600);
    } },
    { say: '不想留下的俘虜，也可以把他釋放。', scene: async (s) => {
      bg(s); heading(s, '🕊️ 釋放俘虜');
      const p = person(s.root, 480, 400, FOE, { sc: 2 });
      const c = cage(s.root, 480, 410); c.setAttribute('transform', 'translate(480 410) scale(1.3)');
      await s.wait(1200);
      await s.fade(c, 0, 600);
      await s.move(p, { x: 980 }, 2000, 'in');
    } },
    { say: '練習題：武將的忠誠太低，可能會發生什麼事？', quiz: {
      options: ['可能會離開', '武力會變高', '完全沒有影響'], answer: 0,
      why: ['忠誠太低的武將可能會離開，記得用褒賞提高忠誠。', '忠誠和武力沒有關係。', '忠誠太低是有風險的，武將可能會離開。'],
    }, scene: async (s) => {
      bg(s); person(s.root, 480, 400, ME, { sc: 2.4 });
      const b = bar(s.root, 380, 200, 200, '忠誠', 15, 100, '#c0392b'); void b;
      const q = txg(s.root, 640, 300, '？', 'gd-t-title'); s.pop(q, 500);
    } },
  ] },
  // ---------------------------------------------------------------- 7
  { title: '戰鬥與戰術', steps: [
    { say: '攻城的時候會進入 3D 戰場，最多打十個回合。每個回合，雙方同時選一種戰術。', scene: async (s) => {
      bg(s, 'field'); const rb = roundBox(s);
      army(s.root, 190, 340, ME, { label: '我軍' }); army(s.root, 190, 450, ME);
      bigWall(s.root, 660, 470, FOE);
      const c1 = tacCard(s.root, 360, 200, '突擊'), c2 = tacCard(s.root, 600, 160, '固守');
      s.pop(c1, 400); s.pop(c2, 400);
      for (let r = 1; r <= 3; r++) {
        rb.set(r); await s.wait(900);
        if (r === 1) { c1.flip(s); await c2.flip(s); }
        await s.wait(600);
      }
    } },
    { say: '戰術互相克制：突擊剋計策，計策剋固守，固守剋突擊。', scene: async (s) => {
      bg(s); heading(s, '三角相剋', 40);
      const P = { 突擊: [480, 150], 計策: [680, 420], 固守: [280, 420] };
      for (const [n, [x, y]] of Object.entries(P)) s.pop(badge(s.root, x, y, n), 450);
      await s.wait(700);
      for (const [a, b] of [['突擊', '計策'], ['計策', '固守'], ['固守', '突擊']]) {
        const [x1, y1] = P[a], [x2, y2] = P[b]; const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
        const ox = (480 - mx) * -0.25, oy = (330 - my) * -0.25;
        const k1 = 66 / Math.hypot(x2 - x1, y2 - y1);
        const ar = arrowLine(s.root, [[x1 + (x2 - x1) * k1, y1 + (y2 - y1) * k1], [mx + ox, my + oy], [x2 - (x2 - x1) * k1, y2 - (y2 - y1) * k1]], '#e9c96e');
        await showArrow(s, ar, 700);
        s.pop(tag(s.root, mx + ox * 1.9, my + oy * 1.9, '剋', '#7a1f16', { fs: 20 }), 300);
        await s.wait(500);
      }
    } },
    { say: '齊射是穩定的弓弩傷害，可以剋固守，但是怕對方突擊。', scene: async (s) => {
      bg(s); heading(s, '齊射：剋固守、怕突擊', 40);
      const P = { 突擊: [480, 150], 計策: [700, 430], 固守: [260, 430], 齊射: [480, 340] };
      for (const [n, [x, y]] of Object.entries(P)) s.pop(badge(s.root, x, y, n, n === '齊射' ? 56 : 44), 400);
      await s.wait(600);
      const a1 = arrowLine(s.root, [[430, 365], [340, 400], [310, 420]], '#6fcf7f'); await showArrow(s, a1, 700);
      s.pop(tag(s.root, 360, 360, '剋', '#2f6b3a', { fs: 20 }), 300);
      await s.wait(500);
      const a2 = arrowLine(s.root, [[480, 205], [500, 245], [480, 280]], '#e05a4a'); await showArrow(s, a2, 700);
      s.pop(tag(s.root, 560, 240, '怕', '#8a1c14', { fs: 20 }), 300);
    } },
    { say: '突擊是全軍衝鋒，打齊射和計策特別痛；可是撞上固守，自己反而吃虧。', scene: async (s) => {
      bg(s, 'field'); heading(s, '🐎 突擊', 40);
      const me = army(s.root, 160, 350, ME, { sc: 1.6 }), foe = army(s.root, 760, 350, FOE, { sc: 1.6, bow: true, flip: true, label: '齊射' });
      const hpMe = bar(s.root, 80, 130, 200, '我軍兵力', 100, 100, ME), hpFoe = bar(s.root, 680, 130, 200, '敵軍兵力', 100, 100, FOE);
      await s.wait(500);
      await s.move(me, { x: 640 }, 900, 'in');
      burst(s, s.root, 700, 340, 1.4); hpFoe.set(s, 50, 600); floatUp(s, s.root, 760, 260, '傷害 ×1.5', 'gd-t gd-t-red');
      await s.move(me, { x: 160 }, 800, 'out');
      s.fade(foe, 0, 300); const sh = shields(s.root, 720, 350, FOE, 5); hide(sh); s.fade(sh, 1, 300);
      const lab = tag(s.root, 760, 470, '固守', FOE, { fs: 16 }); s.pop(lab, 300);
      await s.wait(600);
      await s.move(me, { x: 660 }, 900, 'in');
      burst(s, s.root, 690, 340, 1.1, 'gd-spark'); hpMe.set(s, 70, 600); floatUp(s, s.root, 600, 260, '吃虧！', 'gd-t gd-t-red');
      await s.move(me, { x: 300 }, 600, 'out');
    } },
    { say: '齊射是弓弩齊發，每回合都能造成穩定的傷害。', scene: async (s) => {
      bg(s, 'field'); heading(s, '🏹 齊射', 40);
      army(s.root, 200, 360, ME, { sc: 1.6, bow: true }); army(s.root, 760, 360, FOE, { sc: 1.6, flip: true });
      const hp = bar(s.root, 680, 130, 200, '敵軍兵力', 100, 100, FOE);
      for (let w = 0; w < 3; w++) { await volley(s, s.root, [210, 330], [760, 350], 9, 900); hp.set(s, 100 - (w + 1) * 12, 400); burst(s, s.root, 760, 350, 0.6, 'gd-spark'); }
    } },
    { say: '固守時受到的傷害會大大減少，還會反擊衝過來的敵人；不過，固守最怕火計。', scene: async (s) => {
      bg(s, 'field'); heading(s, '🛡️ 固守', 40);
      const sh = shields(s.root, 300, 360, ME, 5);
      const foe = army(s.root, 780, 360, FOE, { sc: 1.6, flip: true });
      const hpMe = bar(s.root, 80, 130, 200, '我軍兵力', 100, 100, ME), hpFoe = bar(s.root, 680, 130, 200, '敵軍兵力', 100, 100, FOE);
      await s.wait(400);
      await s.move(foe, { x: 380 }, 900, 'in');
      burst(s, s.root, 330, 350, 1.2, 'gd-spark'); hpFoe.set(s, 72, 600); hpMe.set(s, 96, 600); floatUp(s, s.root, 420, 270, '反擊！', 'gd-t gd-t-gold');
      await s.move(foe, { x: 780 }, 800, 'out');
      await s.wait(300);
      for (let i = 0; i < 5; i++) { const f = fire(s.root, 290 + (i % 2) * 20, 330 + (i - 2) * 32, 1); s.pop(f, 300, i * 160); }
      floatUp(s, s.root, 300, 230, '怕火計！', 'gd-t gd-t-red');
      await hpMe.set(s, 55, 1000, 500);
      void sh;
    } },
    { say: '計策是火計和伏兵，成功率看雙方智力的高低。', scene: async (s) => {
      bg(s, 'field'); heading(s, '🔥 計策：比智力', 40);
      portrait(s.root, 150, 170, 40, { ch: '亮', color: '#2c4a2a', name: '智力 98', src: advSrc(1) });
      portrait(s.root, 810, 170, 40, { ch: '敵', color: '#23324f', name: '智力 60' });
      const cmp = txg(s.root, 480, 180, '98 ＞ 60 → 成功率高', 'gd-t gd-t-big'); hide(cmp); s.fade(cmp, 1, 500, 400);
      army(s.root, 200, 380, ME, { sc: 1.4 });
      const foe = army(s.root, 720, 380, FOE, { sc: 1.6, flip: true });
      const hp = bar(s.root, 620, 470, 200, '敵軍兵力', 100, 100, FOE);
      await s.wait(1200);
      for (let i = 0; i < 6; i++) { const f = fire(s.root, 680 + (i % 3) * 36, 360 + Math.floor(i / 3) * 40, 1.1); s.pop(f, 300, i * 150); }
      await hp.set(s, 52, 1400, 400);
      const amb = army(s.root, 960, 300, ME, { sc: 0.9, rows: 2, cols: 3 }); await s.move(amb, { x: 850 }, 600, 'out'); floatUp(s, s.root, 850, 260, '伏兵！');
      void foe;
    } },
    { say: '守城的一方有城防保護。攻方用突擊、齊射或計策，都會打壞城牆。', scene: async (s) => {
      bg(s, 'field'); heading(s, '城防', 40);
      const me = army(s.root, 190, 400, ME, { sc: 1.5 });
      const w = bigWall(s.root, 620, 470, FOE);
      const hp = bar(s.root, 650, 90, 220, '🏯 城防', 1000, 1000, '#8fa3c8', { max: true });
      await s.wait(500);
      await s.move(me, { x: 560 }, 800, 'in'); burst(s, s.root, 625, 400, 1.2); s.fade(w.cracks[2], 1, 300); hp.set(s, 880, 500); await s.move(me, { x: 190 }, 700);
      await volley(s, s.root, [200, 370], [720, 360], 9, 900); s.fade(w.cracks[0], 1, 300); hp.set(s, 820, 500);
      for (let i = 0; i < 3; i++) s.pop(fire(s.root, 700 + i * 70, 420, 1), 300, i * 120);
      s.fade(w.cracks[1], 1, 300, 500); s.fade(w.cracks[3], 1, 300, 700); await hp.set(s, 700, 800, 400);
    } },
    { say: '兵力歸零或士氣崩潰就算戰敗；打滿十回合還攻不下來，攻方就退兵。攻方也可以主動撤退，保留兵力。', scene: async (s) => {
      bg(s);
      const P = [[170, '兵力歸零'], [480, '士氣崩潰'], [790, '十回合攻不下']];
      const pans = P.map(([x, t]) => { const p = panel(s.root, x - 140, 70, 280, 300, t); s.pop(p, 400); return p; });
      const b1 = bar(pans[0], 40, 120, 200, '兵力', 100, 100, '#c0392b'), b2 = bar(pans[1], 40, 120, 200, '士氣', 100, 100, '#e07a3a');
      const rt = tx(pans[2], 140, 140, '第 7／10 回合', 'gd-t gd-t-gold');
      const ar = army(pans[2], 180, 230, ME, { sc: 1.1 });
      b1.set(s, 0, 1300, 300); b2.set(s, 0, 1300, 600);
      await s.wait(1300);
      stamp(s, pans[0], 140, 220, '戰敗'); stamp(s, pans[1], 140, 220, '戰敗');
      for (let r = 8; r <= 10; r++) { await s.wait(400); rt.textContent = `第 ${r}／10 回合`; }
      ar.setAttribute('class', 'gd-army'); await s.move(ar, { x: 60 }, 900); stamp(s, pans[2], 150, 210, '退兵', '#8a5a1a');
      const btn = button(s.root, 480, 450, 220, 54, '🏳️ 撤退（保留兵力）'); s.pop(btn, 400);
      const p = pointer(s); await clickAt(s, p, 480, 450, 700); press(s, btn);
    } },
    { say: '練習題：敵軍連續好幾回合都用固守，我方應該用哪一招？', quiz: {
      options: ['突擊', '齊射', '固守', '計策'], answer: [1, 3],
      why: ['突擊撞上固守會吃虧。', '齊射剋固守，可以穩穩打傷對方。', '雙方都固守，誰也打不痛誰。', '計策的火計正好剋固守。'],
    }, scene: async (s) => {
      bg(s, 'field'); shields(s.root, 700, 360, FOE, 5);
      ['第 1 回合：固守', '第 2 回合：固守', '第 3 回合：？'].forEach((t, i) => s.pop(tag(s.root, 300, 180 + i * 70, t, i < 2 ? FOE : '#5a4320', { fs: 19 }), 400, i * 400));
    } },
    { say: '練習題：哪一個戰術剋突擊？', quiz: {
      options: ['齊射', '固守', '計策'], answer: 1,
      why: ['齊射怕突擊，會被衝散。', '固守會大減傷害，還能反擊衝鋒的敵人。', '計策被突擊衝過來會吃虧。'],
    }, scene: async (s) => {
      bg(s, 'field'); const a = army(s.root, 760, 360, FOE, { sc: 1.6, flip: true }); s.pop(badge(s.root, 760, 170, '突擊', 44), 400);
      s.move(a, { x: 600 }, 1500, 'io');
      const q = txg(s.root, 260, 360, '？', 'gd-t-title'); s.pop(q, 500);
    } },
  ] },
  // ---------------------------------------------------------------- 8
  { title: '單挑', steps: [
    { say: '如果雙方都有武力 55 以上的武將，就可以選擇「單挑」。', scene: async (s) => {
      bg(s, 'field'); heading(s, '⚔️ 單挑的條件', 40);
      const a = warrior(s.root, 250, 430, ME, '關羽'), b = warrior(s.root, 710, 430, FOE, '夏侯惇', true);
      s.pop(a, 500); s.pop(b, 500, 200);
      const ta = tag(s.root, 250, 150, '武力 97 ✔', '#2f6b3a', { fs: 20 }), tb = tag(s.root, 710, 150, '武力 90 ✔', '#2f4a6b', { fs: 20 });
      s.pop(ta, 400, 800); s.pop(tb, 400, 1100);
      const r = card(s.root, 480, 230, 260, 80, { title: '雙方都要 55 以上', titleY: 8 }); s.pop(r, 400, 1500);
    } },
    { say: '雙方主將一對一交手好幾個回合，武力比較高的一方比較有利。', scene: async (s) => {
      bg(s, 'field');
      const a = warrior(s.root, 220, 440, ME, '關羽'), b = warrior(s.root, 740, 440, FOE, '夏侯惇', true);
      const ha = bar(s.root, 120, 120, 200, '關羽', 100, 100, ME), hb = bar(s.root, 640, 120, 200, '夏侯惇', 100, 100, FOE);
      const dmg = [[8, 22], [12, 20], [6, 24], [10, 34]];
      let A = 100, B = 100;
      for (const [da, db] of dmg) {
        await Promise.all([s.move(a, { x: 400 }, 450, 'in'), s.move(b, { x: 560 }, 450, 'in')]);
        burst(s, s.root, 480, 330, 1.2, 'gd-spark');
        A -= da; B -= db; ha.set(s, A, 400); hb.set(s, B, 400);
        await Promise.all([s.move(a, { x: 280 }, 450, 'out'), s.move(b, { x: 680 }, 450, 'out')]);
      }
    } },
    { say: '單挑的勝方士氣大振，敗方士氣大跌。敗將可能負傷、被擒，甚至戰死。', scene: async (s) => {
      bg(s, 'field');
      warrior(s.root, 280, 440, ME, '關羽');
      const b = warrior(s.root, 680, 440, FOE, '夏侯惇', true);
      await s.wait(400);
      await s.move(b, { rot: 70, y: 470 }, 700, 'in'); s.fade(b, 0.45, 400);
      ['負傷', '被擒', '戰死'].forEach((t, i) => s.pop(tag(s.root, 600 + i * 90, 250, t, '#5a2a1a', { fs: 17 }), 350, 600 + i * 250));
      const m1 = bar(s.root, 120, 110, 220, '我軍士氣', 60, 100, '#e0b04a'), m2 = bar(s.root, 620, 110, 220, '敵軍士氣', 60, 100, '#e07a3a');
      await s.wait(800);
      m1.set(s, 95, 1000); m2.set(s, 20, 1000);
      floatUp(s, s.root, 230, 200, '士氣大振！'); floatUp(s, s.root, 730, 200, '士氣大跌…', 'gd-t gd-t-red');
    } },
    { say: '如果對方不敢應戰，拒絕的一方士氣也會大跌。', scene: async (s) => {
      bg(s, 'field');
      warrior(s.root, 260, 440, ME, '張飛');
      army(s.root, 720, 400, FOE, { sc: 1.6, flip: true });
      const b1 = bubble(s.root, 260, 180, '誰敢與我一戰！', { n: 8 }); s.pop(b1, 400, 300);
      await s.wait(1500);
      const b2 = bubble(s.root, 720, 220, '……不敢應戰', { n: 8 }); s.pop(b2, 400);
      const m = bar(s.root, 620, 110, 220, '敵軍士氣', 70, 100, '#e07a3a');
      await m.set(s, 35, 1200, 400);
      floatUp(s, s.root, 720, 300, '士氣大跌…', 'gd-t gd-t-red');
    } },
    { say: '練習題：單挑主要比的是武將的哪一項能力？', quiz: {
      options: ['武力', '智力', '政治'], answer: 0,
      why: ['單挑是一對一交手，看的就是武力高低。', '智力影響的是計策，不是單挑。', '政治影響的是內政，不是單挑。'],
    }, scene: async (s) => {
      bg(s, 'field'); warrior(s.root, 250, 440, ME, ''); warrior(s.root, 710, 440, FOE, '', true);
      const q = txg(s.root, 480, 300, '？', 'gd-t-title'); s.pop(q, 500);
    } },
  ] },
  // ---------------------------------------------------------------- 9
  { title: '攻城之後', steps: [
    { say: '攻下城池之後，城上的旗子就會換成我方的顏色。', scene: async (s) => {
      bg(s, 'field');
      const c = castle(s.root, 560, 400, { sc: 3.6, color: FOE });
      const a = army(s.root, 120, 430, ME, { sc: 1.5 });
      await s.move(a, { x: 470 }, 1800, 'io');
      s.fade(a, 0, 300);
      burst(s, s.root, 560, 220, 1.6);
      c.setColor(ME);
      const t = tag(s.root, 560, 90, '🎉 攻下城池！', '#2f6b3a', { fs: 26 }); s.pop(t, 500);
      for (let i = 0; i < 5; i++) s.after(300 + i * 280, () => burst(s, s.root, 300 + i * 120, 120 + (i % 2) * 60, 0.7, 'gd-spark'));
    } },
    { say: '原本的守將，可能逃到相鄰的己方城，也可能被我方俘虜。', scene: async (s) => {
      bg(s, 'field');
      s.root.append(S('path', { d: 'M480 400 Q680 330 830 330', class: 'gd-road gd-road-land', 'stroke-width': 6 }));
      castle(s.root, 400, 420, { sc: 2.6, color: ME, name: '小沛', fs: 18 }); castle(s.root, 850, 320, { sc: 1.6, color: FOE, name: '陳留', fs: 16 });
      const g1 = person(s.root, 480, 410, FOE, { sc: 1.4 }), g2 = person(s.root, 260, 470, FOE, { sc: 1.4 });
      await s.wait(500);
      const t1 = tag(s.root, 680, 250, '逃到相鄰己方城', '#2f4a6b', { fs: 17 }); s.pop(t1, 300);
      await s.move(g1, { x: 820, y: 340 }, 1600, 'io'); s.fade(g1, 0, 300);
      const cg = cage(s.root, 260, -120); cg.setAttribute('transform', 'translate(260 -120)'); cg._p = { x: 260, y: -120, sc: 1, rot: 0 };
      await s.move(cg, { y: 478 }, 700, 'in');
      burst(s, s.root, 260, 470, 0.8, 'gd-spark');
      s.pop(tag(s.root, 260, 330, '被俘', '#8a1c14', { fs: 18 }), 300);
      void g2;
    } },
    { say: '俘虜可以登用或釋放；不過，俘虜每個月也有可能逃走。', scene: async (s) => {
      bg(s);
      const p = person(s.root, 380, 400, FOE, { sc: 2 }); const c = cage(s.root, 380, 410); c.setAttribute('transform', 'translate(380 410) scale(1.3)');
      const b1 = button(s.root, 700, 260, 180, 50, '🤝 登用', { primary: true }), b2 = button(s.root, 700, 330, 180, 50, '🕊️ 釋放');
      const ptr = pointer(s);
      await s.move(ptr, { x: 700, y: 262 }, 700); b1.classList.add('gd-hover'); await s.wait(600); b1.classList.remove('gd-hover');
      await s.move(ptr, { x: 700, y: 332 }, 500); b2.classList.add('gd-hover'); await s.wait(600); b2.classList.remove('gd-hover');
      await s.move(ptr, { x: 990, y: 580 }, 500);
      const t = tag(s.root, 380, 120, '每個月可能逃走！', '#8a1c14', { fs: 18 }); s.pop(t, 300);
      await s.fade(c, 0.35, 400);
      await s.move(p, { x: 120, y: 470 }, 1400, 'io'); s.fade(p, 0, 400);
      floatUp(s, s.root, 160, 380, '？', 'gd-t gd-t-big');
    } },
    { say: '君主被擒或去世的時候，會由其他武將繼位。', scene: async (s) => {
      bg(s);
      const lord = person(s.root, 330, 400, FOE, { sc: 2.4 }), heir = person(s.root, 640, 400, FOE, { sc: 2.4, name: '' });
      const cr = crownEl(s.root, 330, 270, 1.3);
      const t = tag(s.root, 330, 480, '被擒／去世', '#5a2a1a', { fs: 17 }); s.pop(t, 300, 400);
      await s.wait(900); s.fade(lord, 0.35, 600);
      await s.move(cr, { x: 640, y: 270 }, 1400, 'io');
      burst(s, s.root, 640, 260, 1, 'gd-spark');
      s.pop(tag(s.root, 640, 480, '繼位', '#2f6b3a', { fs: 18 }), 300);
      void heir;
    } },
    { say: '一座城池都沒有的勢力，就滅亡了。', scene: async (s) => {
      bg(s);
      castle(s.root, 200, 380, { sc: 2, color: ME }); castle(s.root, 380, 250, { sc: 2, color: ME });
      const c = castle(s.root, 720, 360, { sc: 2.6, color: '#7b3fa0', name: '濮陽', fs: 18 });
      const ban = tag(s.root, 760, 110, '呂布 勢力', '#7b3fa0', { fs: 22 }); s.pop(ban, 300);
      const ar = arrowLine(s.root, [[260, 380], [480, 340], [650, 360]], '#e0b04a'); await showArrow(s, ar, 900);
      burst(s, s.root, 720, 300, 1.4); c.setColor(ME);
      await s.wait(500);
      s.fade(ban, 0.4, 400); stamp(s, s.root, 760, 110, '滅亡');
    } },
  ] },
  // ---------------------------------------------------------------- 10
  { title: 'AI 軍師', steps: [
    { say: '開始遊戲之前，要選一位 AI 軍師陪同，一共有三十位，例如諸葛亮、司馬懿、郭嘉、周瑜，還有黃月英、蔡文姬和貂蟬。', scene: async (s) => {
      bg(s); heading(s, '30 位 AI 軍師', 50);
      const row = grp(s.root, 0, 0);
      ADVISORS.forEach(([n, st], i) => {
        const c = card(row, 120 + i * 150, 290, 130, 200, { dark: true });
        portrait(c, 0, -30, 44, { src: advSrc(i + 1), ch: n[0], color: STYLE_COL[st] });
        tx(c, 0, 50, n, 'gd-t gd-t-cardt-d');
        tag(c, 0, 80, st, STYLE_COL[st], { fs: 14 });
      });
      await s.wait(600);
      await s.tween(9000, (k) => place(row, -k * (ADVISORS.length * 150 - 840), 0), 'io');
    } },
    { say: '軍師的風格分成五種：進攻、守成、內政、謀略和均衡。', scene: async (s) => {
      bg(s); heading(s, '五種風格');
      [['進攻', '⚔️', '郭嘉'], ['守成', '🛡️', '司馬懿'], ['內政', '🌾', '荀彧'], ['謀略', '🔥', '賈詡'], ['均衡', '☯️', '諸葛亮']].forEach(([n, ic, who], i) => {
        const c = card(s.root, 140 + i * 170, 290, 150, 220, { icon: ic, title: n, lines: [`例：${who}`] });
        c.querySelector('.gd-cardbg').setAttribute('stroke', STYLE_COL[n]);
        s.pop(c, 450, i * 350);
      });
    } },
    { say: '按「請教軍師」，軍師就會說出建議，還可以一鍵執行。', scene: async (s) => {
      bg(s); const btns = topBar(s, [['請教軍師', 620, 120], ['軍師代打', 750, 120], ['結束回合', 880, 110]]);
      portrait(s.root, 160, 300, 70, { src: advSrc(1), ch: '亮', color: '#2c3d2a', name: '諸葛亮' });
      const p = pointer(s);
      await clickAt(s, p, 620, 34, 800); press(s, btns[0]);
      const b = bubble(s.root, 520, 250, '主公，許昌糧草不足，宜派糜竺開墾。', { n: 10, tail: 'left' }); s.pop(b, 450);
      const go = button(s.root, 520, 380, 200, 50, '✔ 一鍵執行', { primary: true }); s.pop(go, 400, 400);
      await s.wait(1200);
      await clickAt(s, p, 520, 380, 600); press(s, go);
      floatUp(s, s.root, 520, 440, '已執行：糜竺 開墾');
    } },
    { say: '戰鬥的時候，軍師也會建議該用哪一種戰術。', scene: async (s) => {
      bg(s, 'field'); shields(s.root, 760, 330, FOE, 5); army(s.root, 330, 340, ME, { sc: 1.4 });
      portrait(s.root, 110, 120, 50, { src: advSrc(4), ch: '瑜', color: '#7a1f16', name: '周瑜' });
      const b = bubble(s.root, 360, 110, '敵軍固守，宜用計策火攻！', { n: 12, tail: 'left' }); s.pop(b, 400, 300);
      const names = ['突擊', '齊射', '固守', '計策'];
      const bs = names.map((n, i) => { const g = badge(s.root, 300 + i * 120, 470, n, 36); return g; });
      await s.wait(1300);
      bs[3].classList.add('gd-hot'); await s.move(bs[3], { sc: 1.2 }, 300);
    } },
    { say: '按「軍師代打」，可以把主位交給 AI 軍師自動下令；想自己來的時候，按「取回主位」就換回來了。', scene: async (s) => {
      bg(s);
      const seat = grp(s.root, 480, 300); seat.append(S('path', { d: 'M-80 90 L-80 -80 Q0 -120 80 -80 L80 90 Z', class: 'gd-throne' }), S('rect', { x: -95, y: 40, width: 190, height: 30, rx: 8, class: 'gd-wood' }));
      const me = portrait(s.root, 480, 260, 54, { ch: '您', color: '#2c4a2a', kind: 'player' });
      const adv = portrait(s.root, 1050, 260, 54, { src: advSrc(1), ch: '亮', color: '#2c3d2a' });
      const b1 = button(s.root, 300, 470, 190, 50, '🤖 軍師代打', { primary: true }), b2 = button(s.root, 660, 470, 190, 50, '🙋 取回主位');
      const p = pointer(s);
      await clickAt(s, p, 300, 470, 700); press(s, b1);
      await Promise.all([s.move(me, { x: -100 }, 700), s.move(adv, { x: 480 }, 700)]);
      const gear = txg(s.root, 600, 170, '⚙️', 'gd-emo-l'); gear.firstChild.classList.add('gd-spin');
      const t = txg(s.root, 480, 120, 'AI 自動下令中…', 'gd-t gd-t-gold');
      await s.wait(1600);
      await clickAt(s, p, 660, 470, 600); press(s, b2);
      gear.remove(); t.remove();
      await Promise.all([s.move(adv, { x: 1050 }, 700), s.move(me, { x: 480 }, 700)]);
    } },
    { say: '遊戲中途也可以換軍師。如果有輸入 Claude 金鑰，還能直接用文字問軍師問題。', scene: async (s) => {
      bg(s);
      const pn = panel(s.root, 160, 50, 640, 440, '💬 請教軍師');
      const sw = button(pn, 560, 22, 120, 32, '🔁 換軍師', { fs: 15 }); sw.classList.add('gd-hover');
      portrait(pn, 60, 150, 34, { src: advSrc(3), ch: '嘉', color: '#7a1f16' });
      pn.append(S('rect', { x: 20, y: 370, width: 480, height: 48, rx: 10, class: 'gd-input' }));
      const send = button(pn, 570, 394, 120, 48, '送出', { primary: true });
      const typed = tx(pn, 36, 401, '', 'gd-t gd-dark', { 'text-anchor': 'start' });
      const q = '下一步該攻打哪一座城？';
      await s.wait(500);
      for (let i = 1; i <= q.length; i++) { typed.textContent = q.slice(0, i); await s.wait(110); }
      await press(s, send);
      typed.textContent = '';
      const ub = bubble(pn, 470, 110, q, { n: 12, tail: 'right' }); s.pop(ub, 300);
      await s.wait(600);
      const ans = '壽春守軍薄弱，可趁勢出兵！';
      const ab = bubble(pn, 280, 220, ans, { n: 13, tail: 'left' }); s.pop(ab, 400);
      tag(s.root, 480, 520, '需要在設定中輸入 Claude 金鑰', '#3a3127', { fs: 14, ghost: true });
    } },
    { say: '練習題：想讓軍師幫您自動下令，要按哪一個按鈕？', quiz: {
      options: ['軍師代打', '結束回合', '存檔'], answer: 0,
      why: ['按軍師代打，軍師就會自動幫您下令；按取回主位就換回自己。', '結束回合只是結束這個月的指令。', '存檔是把遊戲進度存起來。'],
    }, scene: async (s) => {
      bg(s); topBar(s, [['存檔', 520, 90], ['請教軍師', 640, 120], ['？？？', 770, 110], ['結束回合', 890, 110]]);
      const p = pointer(s); s.move(p, { x: 770, y: 50 }, 900);
      portrait(s.root, 480, 320, 80, { src: advSrc(1), ch: '亮', color: '#2c3d2a' });
    } },
  ] },
];

// ======================================================================
// 課程內容：系統說明
// ======================================================================
async function hoverBtns(s, btns, idx, ptr) {
  for (const i of idx) { await s.move(ptr, { x: 480 + 90, y: btns[i]._p.y + 6 }, 550); btns.forEach((b, j) => b.classList.toggle('gd-hover', j === i)); await s.wait(800); }
}

export const SYSTEM_LESSONS = [
  { title: '首頁按鈕', steps: [
    { say: '這是遊戲首頁，一共有七個按鈕：新遊戲、繼續遊戲、遠端對戰、遊戲教學、系統說明、設定和檢查更新。', scene: async (s) => {
      const btns = homeScreen(s);
      btns.forEach((b, i) => s.pop(b, 380, 300 + i * 420));
    } },
    { say: '按「新遊戲」開始新的一局；按「繼續遊戲」可以讀取之前的存檔，接著玩。', scene: async (s) => {
      const btns = homeScreen(s); const p = pointer(s); await hoverBtns(s, btns, [0, 1], p);
    } },
    { say: '「遠端對戰」用來加入朋友開的房間；「遊戲教學」和「系統說明」就是您現在看的動畫教學。', scene: async (s) => {
      const btns = homeScreen(s); const p = pointer(s); await hoverBtns(s, btns, [2, 3, 4], p);
    } },
    { say: '「設定」可以調整語音、AI 速度和 Claude 金鑰；「檢查更新」可以下載最新的版本。', scene: async (s) => {
      const btns = homeScreen(s); const p = pointer(s); await hoverBtns(s, btns, [5, 6], p);
    } },
  ] },
  { title: '開新遊戲', steps: [
    { say: '開新遊戲時，先選模式：真人對 AI、AI 對 AI 觀戰、真人對真人遠端，或是同一台電腦多人輪流。', scene: async (s) => {
      bg(s); heading(s, '① 選擇模式', 46);
      const ms = [['👤 對 🤖', '真人對 AI'], ['🤖 對 🤖', 'AI 對 AI 觀戰'], ['👤 對 👤', '真人對真人遠端'], ['👥', '同機多人輪流']];
      const cs = ms.map(([ic, t], i) => { const c = card(s.root, 165 + i * 210, 290, 190, 220, { icon: ic, title: t, dark: true, iconY: 80, titleY: 50 }); s.pop(c, 400, i * 250); return c; });
      const p = pointer(s); await s.wait(1200);
      for (let i = 0; i < 4; i++) { await clickAt(s, p, 165 + i * 210, 300, 500); cs.forEach((c, j) => c.classList.toggle('gd-hot', j === i)); await s.wait(400); }
      await clickAt(s, p, 165, 300, 600); cs.forEach((c, j) => c.classList.toggle('gd-hot', j === 0));
    } },
    { say: '再選劇本：群雄割據，或是三分天下。', scene: async (s) => {
      bg(s); heading(s, '② 選擇劇本', 46);
      const c1 = card(s.root, 300, 290, 300, 260, { dark: true, title: '群雄割據', titleY: 70, lines: ['西元 194 年・12 個勢力'], linesY: 105 });
      const c2 = card(s.root, 660, 290, 300, 260, { dark: true, title: '三分天下', titleY: 70, lines: ['西元 220 年・魏蜀吳'], linesY: 105 });
      const mini = (par, F) => { const g = grp(par, 0, -40, 0.24); const fake = { root: g }; void fake; for (const k of Object.keys(CITY)) { const [x, y] = cpos(k); const o = owners(F)[k]; g.append(S('circle', { cx: x - 480, cy: y - 270, r: 16, fill: o || '#5a4a35' })); } return g; };
      mini(c1, F194); mini(c2, F220);
      s.pop(c1, 400); s.pop(c2, 400, 250);
      const p = pointer(s); await s.wait(800);
      await clickAt(s, p, 300, 300, 700); c1.classList.add('gd-hot');
    } },
    { say: '每個勢力可以設定成玩家、電腦（簡單、普通或困難），或是遠端玩家。', scene: async (s) => {
      bg(s); heading(s, '③ 設定每個勢力', 46);
      const rows = [['曹操', '#2f5fb3', '電腦（困難）'], ['劉備', ME, '電腦（普通）'], ['孫策', '#c0392b', '電腦（普通）'], ['袁紹', '#c9a227', '電腦（簡單）'], ['呂布', '#7b3fa0', '電腦（普通）']];
      const vals = rows.map(([n, c, v], i) => {
        const y = 120 + i * 72; const g = grp(s.root, 0, 0);
        g.append(S('rect', { x: 200, y: y - 26, width: 560, height: 56, rx: 10, class: 'gd-chipbg' }), S('circle', { cx: 236, cy: y + 2, r: 13, fill: c }));
        tx(g, 262, y + 9, n, 'gd-t', { 'text-anchor': 'start' });
        g.append(S('rect', { x: 500, y: y - 18, width: 240, height: 40, rx: 8, class: 'gd-select' }));
        const t = tx(g, 516, y + 9, v, 'gd-t gd-dark', { 'text-anchor': 'start' }); tx(g, 724, y + 9, '▾', 'gd-t gd-dark');
        return t;
      });
      const p = pointer(s); await s.wait(500);
      await clickAt(s, p, 640, 194, 700); vals[1].textContent = '玩家'; vals[1].classList.add('gd-t-green'); burst(s, s.root, 700, 192, 0.5, 'gd-spark');
      const cyc = ['電腦（簡單）', '電腦（普通）', '電腦（困難）', '遠端玩家'];
      await clickAt(s, p, 640, 410, 600);
      for (const v of cyc) { vals[4].textContent = v; await s.wait(500); }
    } },
    { say: '接著選您自己的半身照，男女各有二十張，再選一位陪同的 AI 軍師。', scene: async (s) => {
      bg(s); heading(s, '④ 選半身照與軍師', 46);
      const cols = ['#4a3a6a', '#2c4a5a', '#5a3a2a', '#2c4a2a', '#6a2a2a'];
      const pics = [];
      for (let i = 0; i < 40; i++) {
        const f = i >= 20, n = (i % 20) + 1, x = 130 + (i % 10) * 58, y = 120 + Math.floor(i / 10) * 66;
        const g = portrait(s.root, x, y, 25, { src: asset(`assets/portraits/${f ? 'f' : 'm'}${String(n).padStart(2, '0')}.svg`), kind: 'player', ch: f ? '女' : '男', color: cols[i % 5] });
        s.pop(g, 300, i * 30); pics.push(g);
      }
      tx(s.root, 80, 160, '男', 'gd-t gd-t-gold'); tx(s.root, 80, 292, '女', 'gd-t gd-t-gold');
      const advs = [0, 1, 2, 3, 20, 21].map((k, i) => { const g = portrait(s.root, 760 + (i % 2) * 90, 120 + Math.floor(i / 2) * 100, 34, { src: advSrc(k + 1), ch: ADVISORS[k][0][0], color: STYLE_COL[ADVISORS[k][1]], name: ADVISORS[k][0] }); s.pop(g, 300, 1200 + i * 100); return g; });
      tx(s.root, 805, 440, 'AI 軍師（30 位）', 'gd-t gd-t-sm');
      const p = pointer(s); await s.wait(1600);
      await clickAt(s, p, pics[2]._p.x, pics[2]._p.y, 700); pics[2].classList.add('gd-hot');
      s.pop(tag(s.root, 400, 410, '已選：白袍銀槍', '#2f6b3a', { fs: 17 }), 300);
      await clickAt(s, p, advs[0]._p.x, advs[0]._p.y, 700); advs[0].classList.add('gd-hot');
    } },
    { say: '最後設定期限：不限、三年、五年或十年，然後按「開始遊戲」。', scene: async (s) => {
      bg(s); heading(s, '⑤ 設定期限並開始', 46);
      const ch = ['不限', '3 年', '5 年', '10 年'].map((t, i) => button(s.root, 255 + i * 150, 220, 130, 56, t));
      const go = button(s.root, 480, 400, 260, 64, '▶ 開始遊戲', { primary: true, fs: 24 });
      const p = pointer(s);
      await clickAt(s, p, 555, 220, 800); ch.forEach((b, i) => b.classList.toggle('gd-sel', i === 2));
      await s.wait(500);
      await clickAt(s, p, 480, 400, 700); press(s, go);
      burst(s, s.root, 480, 400, 1.6, 'gd-spark');
    } },
  ] },
  { title: '遠端對戰邀約', steps: [
    { say: '房主開新遊戲時，把某一個勢力設成「遠端玩家」，就會得到一組六位數的房號。', scene: async (s) => {
      bg(s); heading(s, '房主：設定遠端玩家', 46);
      const g = grp(s.root, 0, 0); g.append(S('rect', { x: 200, y: 104, width: 560, height: 56, rx: 10, class: 'gd-chipbg' }), S('circle', { cx: 236, cy: 132, r: 13, fill: '#c0392b' }));
      tx(g, 262, 139, '孫策', 'gd-t', { 'text-anchor': 'start' }); g.append(S('rect', { x: 500, y: 112, width: 240, height: 40, rx: 8, class: 'gd-select' }));
      const v = tx(g, 516, 139, '電腦（普通）', 'gd-t gd-dark', { 'text-anchor': 'start' });
      const p = pointer(s); await clickAt(s, p, 640, 132, 700); v.textContent = '遠端玩家'; v.classList.add('gd-t-green');
      await s.move(p, { x: 990, y: 580 }, 500);
      const pn = panel(s.root, 230, 210, 500, 230, '房號'); s.pop(pn, 400);
      const code = '382916';
      for (let i = 0; i < 6; i++) { pn.append(S('rect', { x: 40 + i * 72, y: 80, width: 60, height: 80, rx: 10, class: 'gd-digit' })); }
      for (let i = 0; i < 6; i++) { await s.wait(250); const d = txg(pn, 70 + i * 72, 136, code[i], 'gd-t gd-t-digit'); s.pop(d, 300); }
      tx(pn, 250, 205, '把房號告訴朋友', 'gd-t gd-t-sm');
    } },
    { say: '把房號告訴朋友。', scene: async (s) => {
      bg(s);
      person(s.root, 220, 400, ME, { sc: 2.2, name: '房主' }); person(s.root, 740, 400, '#c0392b', { sc: 2.2, name: '朋友' });
      const b = bubble(s.root, 300, 200, '房號 382916', { n: 9 }); s.pop(b, 400);
      await s.wait(600);
      const msg = txg(s.root, 320, 250, '📨', 'gd-emo-l');
      await s.move(msg, { x: 680, y: 250 }, 1200, 'io'); burst(s, s.root, 680, 250, 0.8, 'gd-spark');
    } },
    { say: '朋友在首頁按「遠端對戰」，再按「加入房間」，輸入房號就能連線。', scene: async (s) => {
      const btns = homeScreen(s); const p = pointer(s);
      await clickAt(s, p, 480, btns[2]._p.y, 800); press(s, btns[2]);
      const pn = panel(s.root, 250, 150, 460, 300, '遠端對戰'); s.pop(pn, 350);
      const join = button(pn, 230, 90, 220, 50, '加入房間', { primary: true });
      await clickAt(s, p, 480, 240, 600); press(s, join);
      for (let i = 0; i < 6; i++) pn.append(S('rect', { x: 34 + i * 68, y: 140, width: 56, height: 70, rx: 9, class: 'gd-digit' }));
      const code = '382916';
      await s.move(p, { x: 990, y: 580 }, 400);
      for (let i = 0; i < 6; i++) { await s.wait(260); txg(pn, 62 + i * 68, 188, code[i], 'gd-t gd-t-digit'); }
      await s.wait(400);
      const ok = tag(pn, 230, 252, '✔ 連線成功', '#2f6b3a', { fs: 18 }); s.pop(ok, 400);
    } },
    { say: '連線之後可以語音通話，按麥克風按鈕就能邊玩邊聊。', scene: async (s) => {
      bg(s);
      portrait(s.root, 220, 280, 70, { ch: '房', color: '#2c4a2a', name: '房主' }); portrait(s.root, 740, 280, 70, { ch: '友', color: '#5a2a2a', name: '朋友' });
      const mic = button(s.root, 480, 440, 110, 60, '🎤', { primary: true, fs: 30 });
      const p = pointer(s); await clickAt(s, p, 480, 440, 700); press(s, mic);
      for (let i = 0; i < 3; i++) {
        const w1 = S('path', { d: `M${320 + i * 30} 240 q12 40 0 80`, class: 'gd-wavearc' }), w2 = S('path', { d: `M${640 - i * 30} 240 q-12 40 0 80`, class: 'gd-wavearc' });
        w1.style.animationDelay = w2.style.animationDelay = `${i * 0.25}s`; s.root.append(w1, w2);
      }
    } },
    { say: '練習題：朋友要加入房間，需要輸入什麼？', quiz: {
      options: ['六位數的房號', '朋友的密碼', 'Claude 金鑰'], answer: 0,
      why: ['房主把勢力設成遠端玩家後，會得到六位數房號，朋友輸入它就能加入。', '加入房間不需要任何密碼。', 'Claude 金鑰是用來跟軍師聊天的，和加入房間無關。'],
    }, scene: async (s) => {
      bg(s); const pn = panel(s.root, 250, 150, 460, 240, '加入房間'); s.pop(pn, 350);
      for (let i = 0; i < 6; i++) { pn.append(S('rect', { x: 34 + i * 68, y: 90, width: 56, height: 70, rx: 9, class: 'gd-digit' })); tx(pn, 62 + i * 68, 138, '？', 'gd-t gd-t-digit'); }
    } },
  ] },
  { title: '背景音樂與音量', steps: [
    { say: '遊戲有二十首背景音樂。按右上角的音符按鈕，可以播放或暫停。', scene: async (s) => {
      bg(s); topBar(s);
      const pn = panel(s.root, 780, 76, 170, 250); void pn;
      const note = button(s.root, 865, 32, 56, 40, '♫', { fs: 22 });
      const v1 = vslider(s.root, 830, 120, 140, 0.6, '音樂', '🎵'), v2 = vslider(s.root, 900, 120, 140, 0.5, '音效', '🔔'); void v1; void v2;
      const lab = txg(s.root, 400, 300, '♪ 背景音樂：共 20 首', 'gd-t gd-t-big');
      const p = pointer(s);
      await clickAt(s, p, 865, 34, 800); press(s, note); note.classList.add('gd-sel');
      for (let i = 0; i < 6; i++) s.after(i * 300, () => floatUp(s, s.root, 840 + (i % 3) * 20, 60, ['♪', '♫', '♬'][i % 3], 'gd-t gd-t-gold'));
      lab.firstChild.textContent = '▶ 播放中：第 3 首';
      await s.wait(2200);
      await clickAt(s, p, 865, 34, 400); press(s, note); note.classList.remove('gd-sel');
      lab.firstChild.textContent = '⏸ 已暫停';
    } },
    { say: '音符旁邊的直立滑桿往上拉就大聲，往下拉就小聲。', scene: async (s) => {
      bg(s); topBar(s); panel(s.root, 780, 76, 170, 250);
      button(s.root, 865, 32, 56, 40, '♫', { fs: 22 });
      const v1 = vslider(s.root, 830, 120, 140, 0.4, '音樂', '🎵'); vslider(s.root, 900, 120, 140, 0.5, '音效', '🔔');
      const spk = txg(s.root, 400, 300, '🔉', 'gd-emo-xl');
      const lab = txg(s.root, 400, 400, '音樂音量 40%', 'gd-t gd-t-big');
      const p = pointer(s);
      await s.move(p, { x: 834, y: 120 + 140 * 0.6 + 4 }, 700);
      p.classList.add('gd-grab');
      await Promise.all([v1.set(s, 0.95, 1200), s.move(p, { y: 120 + 140 * 0.05 + 4 }, 1200), s.tween(1200, (k) => { lab.firstChild.textContent = `音樂音量 ${Math.round(lerp(40, 95, k))}%`; })]);
      spk.firstChild.textContent = '🔊'; await s.wait(600);
      await Promise.all([v1.set(s, 0.2, 1200), s.move(p, { y: 120 + 140 * 0.8 + 4 }, 1200), s.tween(1200, (k) => { lab.firstChild.textContent = `音樂音量 ${Math.round(lerp(95, 20, k))}%`; })]);
      spk.firstChild.textContent = '🔈'; p.classList.remove('gd-grab');
    } },
    { say: '另一個直立滑桿是音效的音量，例如戰鬥的刀劍聲和戰鼓聲。', scene: async (s) => {
      bg(s); topBar(s); panel(s.root, 780, 76, 170, 250);
      button(s.root, 865, 32, 56, 40, '♫', { fs: 22 });
      vslider(s.root, 830, 120, 140, 0.6, '音樂', '🎵'); const v2 = vslider(s.root, 900, 120, 140, 0.3, '音效', '🔔');
      v2.g.classList.add('gd-hot');
      const p = pointer(s);
      await s.move(p, { x: 904, y: 120 + 140 * 0.7 + 4 }, 700);
      await Promise.all([v2.set(s, 0.9, 1300), s.move(p, { y: 120 + 140 * 0.1 + 4 }, 1300)]);
      ['⚔️', '🥁', '🐎', '🏹'].forEach((ic, i) => { const g = txg(s.root, 220 + i * 130, 320, ic, 'gd-emo-xl'); s.pop(g, 400, i * 250); });
    } },
    { say: '您也可以加入自己的音樂，放進播放清單裡。', scene: async (s) => {
      bg(s);
      const pn = panel(s.root, 470, 60, 380, 420, '🎵 播放清單');
      ['第 1 首', '第 2 首', '第 3 首', '…', '第 20 首'].forEach((t, i) => tx(pn, 30, 86 + i * 44, `♪ ${t}`, 'gd-t', { 'text-anchor': 'start' }));
      const file = card(s.root, 180, 280, 200, 120, { icon: '🎶', iconY: 50, title: '我的音樂.mp3', titleY: 40, dark: true });
      const add = button(s.root, 660, 440, 240, 46, '＋ 加入自己的音樂', { primary: true });
      const p = pointer(s);
      await clickAt(s, p, 660, 440, 800); press(s, add);
      await s.move(file, { x: 660, y: 340, sc: 0.5 }, 1100, 'io'); s.fade(file, 0, 200);
      const row = tx(pn, 30, 86 + 5 * 44, '♪ 我的音樂', 'gd-t gd-t-green', { 'text-anchor': 'start' }); void row;
      burst(s, s.root, 600, 360, 0.6, 'gd-spark');
    } },
  ] },
  { title: '存檔、讀檔與更新', steps: [
    { say: '遊戲中按「存檔」，就能把目前的進度存起來。', scene: async (s) => {
      bg(s); const b = topBar(s, [['💾 存檔', 600, 110], ['請教軍師', 730, 120], ['結束回合', 870, 110]]);
      const p = pointer(s); await clickAt(s, p, 600, 34, 800); press(s, b[0]);
      const c = card(s.root, 480, 290, 420, 120, { dark: true, title: '存檔 1', titleY: -14, lines: ['西元 196 年 3 月・劉備・8 座城'], linesY: 22 }); s.pop(c, 450);
      await s.wait(500); stamp(s, s.root, 640, 250, '已存檔', '#2f6b3a', -10);
    } },
    { say: '下次回到首頁按「繼續遊戲」，選擇存檔，就能接著玩。', scene: async (s) => {
      const btns = homeScreen(s); const p = pointer(s);
      await clickAt(s, p, 480, btns[1]._p.y, 800); press(s, btns[1]);
      const pn = panel(s.root, 230, 130, 500, 300, '繼續遊戲'); s.pop(pn, 350);
      const slot = button(pn, 250, 100, 440, 60, '存檔 1：西元 196 年 3 月・劉備', { fs: 17 });
      await clickAt(s, p, 480, 230, 600); press(s, slot);
      pn.append(S('rect', { x: 40, y: 200, width: 420, height: 16, rx: 8, class: 'gd-track' })); const f = S('rect', { x: 40, y: 200, width: 0, height: 16, rx: 8, class: 'gd-fillg' }); pn.append(f);
      tx(pn, 250, 250, '讀取中…', 'gd-t gd-t-sm');
      await s.tween(1400, (k) => f.setAttribute('width', 420 * k));
    } },
    { say: '在首頁或設定裡按「檢查更新」，有新版本時會顯示更新內容，按「立即更新」就會自動下載、安裝，然後重新開啟。', scene: async (s) => {
      const btns = homeScreen(s); const p = pointer(s);
      await clickAt(s, p, 480, btns[6]._p.y, 800); press(s, btns[6]);
      const pn = panel(s.root, 210, 80, 540, 390, '🔔 發現新版本 v1.1.0'); s.pop(pn, 400);
      ['・新增更多武將與劇本', '・AI 軍師建議更聰明', '・修正已知問題'].forEach((t, i) => tx(pn, 40, 90 + i * 40, t, 'gd-t', { 'text-anchor': 'start' }));
      const up = button(pn, 270, 250, 220, 54, '⬇ 立即更新', { primary: true });
      await clickAt(s, p, 480, 330, 800); press(s, up);
      pn.append(S('rect', { x: 50, y: 300, width: 440, height: 18, rx: 9, class: 'gd-track' })); const f = S('rect', { x: 50, y: 300, width: 0, height: 18, rx: 9, class: 'gd-fillg' }); pn.append(f);
      const pct = tx(pn, 270, 352, '下載中 0%', 'gd-t gd-t-sm');
      await s.tween(2200, (k) => { f.setAttribute('width', 440 * k); pct.textContent = `下載中 ${Math.round(k * 100)}%`; });
      pct.textContent = '✔ 安裝完成，正在重新開啟…';
    } },
  ] },
  { title: '設定', steps: [
    { say: '在設定裡可以開關語音旁白，也可以選擇喜歡的聲音。', scene: async (s) => {
      bg(s); const pn = panel(s.root, 200, 50, 560, 440, '⚙ 設定'); s.pop(pn, 350);
      tx(pn, 40, 100, '語音旁白', 'gd-t', { 'text-anchor': 'start' });
      const sw = grp(pn, 460, 94); sw.append(S('rect', { x: -32, y: -17, width: 64, height: 34, rx: 17, class: 'gd-switch' })); const knob = S('circle', { cx: -15, cy: 0, r: 13, class: 'gd-knob' }); sw.append(knob);
      tx(pn, 40, 180, '聲音', 'gd-t', { 'text-anchor': 'start' });
      pn.append(S('rect', { x: 200, y: 154, width: 320, height: 42, rx: 8, class: 'gd-select' }));
      const v = tx(pn, 216, 182, 'Microsoft Hanhan（台灣）', 'gd-t gd-dark', { 'text-anchor': 'start' });
      const p = pointer(s);
      await clickAt(s, p, 660, 146, 800);
      sw.classList.add('gd-on'); await s.tween(250, (k) => knob.setAttribute('cx', lerp(-15, 15, k)));
      await clickAt(s, p, 560, 226, 700);
      const list = grp(pn, 0, 0); list.append(S('rect', { x: 200, y: 200, width: 320, height: 132, rx: 8, class: 'gd-cardbg' }));
      ['Microsoft Hanhan（台灣）', 'Microsoft Yating（台灣）', 'Microsoft Zhiwei（台灣）'].forEach((t, i) => tx(list, 216, 230 + i * 40, t, 'gd-t gd-dark', { 'text-anchor': 'start' }));
      await clickAt(s, p, 520, 296, 600);
      list.remove(); v.textContent = 'Microsoft Yating（台灣）';
    } },
    { say: 'AI 速度可以調整電腦下令的快慢，觀戰時調快一點，就不用等太久。', scene: async (s) => {
      bg(s); const pn = panel(s.root, 200, 50, 560, 440, '⚙ 設定'); s.pop(pn, 350);
      tx(pn, 40, 110, 'AI 速度', 'gd-t', { 'text-anchor': 'start' });
      const opts = ['慢', '普通', '快'].map((t, i) => button(pn, 260 + i * 110, 102, 100, 44, t));
      opts[1].classList.add('gd-sel');
      const a = army(pn, 120, 290, FOE, { sc: 1.2 });
      const p = pointer(s);
      await clickAt(s, p, 200 + 480, 152, 800); opts.forEach((b, i) => b.classList.toggle('gd-sel', i === 2));
      for (let i = 0; i < 3; i++) { await s.move(a, { x: 440 }, 500); await s.move(a, { x: 120 }, 500); }
    } },
    { say: '輸入 Claude 金鑰並儲存之後，就可以直接用文字問軍師問題。', scene: async (s) => {
      bg(s); const pn = panel(s.root, 200, 50, 560, 440, '⚙ 設定'); s.pop(pn, 350);
      tx(pn, 40, 110, 'Claude 金鑰', 'gd-t', { 'text-anchor': 'start' });
      pn.append(S('rect', { x: 40, y: 130, width: 480, height: 48, rx: 10, class: 'gd-input' }));
      const t = tx(pn, 56, 162, '', 'gd-t gd-dark', { 'text-anchor': 'start' });
      const save = button(pn, 440, 230, 160, 48, '儲存', { primary: true });
      await s.wait(500);
      for (let i = 1; i <= 18; i++) { t.textContent = '•'.repeat(i); await s.wait(70); }
      const p = pointer(s); await clickAt(s, p, 640, 280, 700); press(s, save);
      const ok = tag(pn, 280, 320, '✔ 已儲存', '#2f6b3a', { fs: 18 }); s.pop(ok, 300);
      const chatIc = portrait(pn, 280, 390, 30, { src: advSrc(1), ch: '亮', color: '#2c3d2a' }); s.pop(chatIc, 300, 300);
    } },
    { say: '系統說明到這裡結束。有不懂的地方，隨時可以回來再看一次。祝主公早日一統天下！', scene: async (s) => {
      bg(s); const m = drawMap(s, { owners: owners(F194), names: false }); m.g.style.opacity = 0.25;
      for (const k of bfs('xiapi')) { await s.wait(60); m.castles[k].setColor(ME); }
      const t = tag(s.root, 480, 270, '🏆 祝主公早日一統天下！', '#7a1f16', { fs: 30 }); s.pop(t, 500);
    } },
  ] },
];

const BOOKS = {
  game: { name: '遊戲教學', icon: '📜', lessons: GAME_LESSONS },
  system: { name: '系統說明', icon: '⚙️', lessons: SYSTEM_LESSONS },
};

// ======================================================================
// 教學畫面
// ======================================================================
const PREF_KEY = 'xk-sanguo-guide';
function loadPref() { try { return JSON.parse(localStorage.getItem(PREF_KEY) || '{}') || {}; } catch { return {}; } }
function savePref(p) { try { localStorage.setItem(PREF_KEY, JSON.stringify({ ...loadPref(), ...p })); } catch { /* 無法儲存 */ } }

class Guide {
  constructor(book, onClose) {
    this.onClose = onClose;
    const pref = loadPref();
    this.voiceOn = pref.voice !== false;
    this.speed = [0.8, 1, 1.2].includes(pref.speed) ? pref.speed : 1;
    this.token = 0; this.talkId = 0; this.paused = false; this.closed = false; this.finished = false;
    this.done = new Set();
    probeImages();
    this.build();
    this.onKey = (e) => this.key(e);
    window.addEventListener('keydown', this.onKey, true);
    narrator.onReady(() => { if (!this.closed) this.renderVoice(); });
    this.setBook(book);
  }

  get lessons() { return BOOKS[this.book].lessons; }

  build() {
    const B = (cls, label, title, fn) => h('button', { class: 'gd-btn ' + cls, title, onclick: fn }, label);
    this.titleEl = h('h2', { class: 'gd-title' });
    this.tabs = Object.entries(BOOKS).map(([k, b]) => h('button', { class: 'gd-tab', 'data-book': k, onclick: () => this.setBook(k) }, `${b.icon} ${b.name}`));
    this.progTxt = h('span', { class: 'gd-prog-txt' });
    this.progBar = h('i');
    this.list = h('nav', { class: 'gd-list' });
    this.stageHost = h('div', { class: 'gd-stage' });
    this.stageTitle = h('div', { class: 'gd-stage-title' });
    this.pausedBadge = h('div', { class: 'gd-paused-badge' }, '⏸ 已暫停');
    this.avatar = h('div', { class: 'gd-avatar' },
      h('img', { src: asset('assets/portraits/adv01.svg'), alt: '諸葛亮', onerror: (e) => { e.target.remove(); this.avatar.classList.add('gd-noimg'); } }),
      h('span', { class: 'gd-avatar-fb' }, '亮'));
    this.capText = h('div', { class: 'gd-cap-text' });
    this.quizEl = h('div', { class: 'gd-quiz' });
    this.fbEl = h('div', { class: 'gd-feedback' });
    this.dots = h('div', { class: 'gd-dots' });
    this.btnPlay = B('gd-play', '⏸ 暫停', '暫停／繼續（空白鍵）', () => this.togglePause());
    this.btnVoice = B('gd-voice', '', '語音開關', () => this.toggleVoice());
    this.speedBtns = [0.8, 1, 1.2].map((v) => h('button', { class: 'gd-spd', onclick: () => this.setSpeed(v) }, `${v}×`));
    this.el = h('div', { class: 'gd-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': '遊戲教學' },
      h('header', { class: 'gd-head' },
        h('div', { class: 'gd-brand' }, h('span', { class: 'gd-logo' }, '諸'), this.titleEl),
        h('div', { class: 'gd-tabs' }, this.tabs),
        h('div', { class: 'gd-prog' }, this.progTxt, h('div', { class: 'gd-prog-bar' }, this.progBar)),
        h('button', { class: 'gd-btn gd-x', title: '關閉（Esc）', onclick: () => this.close() }, '✕ 關閉')),
      h('div', { class: 'gd-body' },
        this.list,
        h('main', { class: 'gd-main' },
          h('div', { class: 'gd-stage-wrap' }, this.stageHost, this.stageTitle, this.pausedBadge),
          h('div', { class: 'gd-cap' }, this.avatar,
            h('div', { class: 'gd-cap-body' }, h('div', { class: 'gd-cap-name' }, '軍師 諸葛亮'), this.capText, this.quizEl, this.fbEl)),
          h('div', { class: 'gd-ctrl' },
            this.dots,
            h('div', { class: 'gd-ctrl-btns' },
              B('', '⏮ 上一步', '上一步（←）', () => this.prev()),
              this.btnPlay,
              B('', '⏭ 下一步', '下一步（→）', () => this.next()),
              B('', '↺ 重播', '重播這一步', () => this.go(this.li, this.si)),
              h('span', { class: 'gd-sep' }),
              this.btnVoice,
              h('span', { class: 'gd-spdbox', title: '速度' }, h('span', { class: 'gd-spdlab' }, '速度'), this.speedBtns))))),
      h('footer', { class: 'gd-foot' },
        h('span', {}, '快速鍵：空白鍵 暫停／繼續・← → 上一步／下一步・Esc 關閉'),
        h('span', { class: 'gd-credit' }, '系統開發：吳玉柱 先生 與 Claude AI Opus 5.5')));
    document.body.append(this.el);
    this.stage = new Stage(this.stageHost);
    this.stage.speed = this.speed;
    this.renderVoice(); this.renderSpeed();
  }

  setBook(book) {
    this.book = BOOKS[book] ? book : 'game';
    const b = BOOKS[this.book];
    this.titleEl.textContent = b.name;
    this.el.setAttribute('aria-label', b.name);
    this.tabs.forEach((t) => t.classList.toggle('gd-on', t.dataset.book === this.book));
    this.done = new Set();
    this.renderList();
    this.go(0, 0);
  }

  renderList() {
    this.list.replaceChildren(h('div', { class: 'gd-list-hd' }, `課程（共 ${this.lessons.length} 課）`),
      ...this.lessons.map((l, i) => h('button', {
        class: 'gd-item' + (i === this.li ? ' gd-on' : '') + (this.done.has(i) ? ' gd-done' : ''), onclick: () => this.go(i, 0),
      }, h('span', { class: 'gd-num' }, this.done.has(i) && i !== this.li ? '✓' : String(i + 1)), h('span', { class: 'gd-item-t' }, l.title),
      h('span', { class: 'gd-item-n' }, `${l.steps.length} 步`))));
    const cur = this.list.querySelector('.gd-item.gd-on');
    if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest' });
  }

  renderVoice() {
    const ok = narrator.available;
    this.btnVoice.textContent = !ok ? '🔇 無語音' : this.voiceOn ? '🔊 語音：開' : '🔈 語音：關';
    this.btnVoice.classList.toggle('gd-off', !ok || !this.voiceOn);
    this.btnVoice.title = ok ? `語音：${narrator.voiceName || '系統語音'}` : '這台電腦沒有中文語音，解說會用文字顯示並自動前進';
  }

  renderSpeed() { this.speedBtns.forEach((b, i) => b.classList.toggle('gd-on', [0.8, 1, 1.2][i] === this.speed)); }

  renderProgress() {
    const ls = this.lessons, L = ls[this.li];
    const total = ls.reduce((a, l) => a + l.steps.length, 0);
    const before = ls.slice(0, this.li).reduce((a, l) => a + l.steps.length, 0) + this.si + 1;
    this.progTxt.textContent = `第 ${this.li + 1}／${ls.length} 課・第 ${this.si + 1}／${L.steps.length} 步`;
    this.progBar.style.width = (this.finished ? 100 : (before / total) * 100).toFixed(1) + '%';
    this.dots.replaceChildren(...L.steps.map((st, i) => h('button', {
      class: 'gd-dot' + (i < this.si ? ' gd-past' : '') + (i === this.si ? ' gd-on' : '') + (st.quiz ? ' gd-qdot' : ''),
      title: st.quiz ? `第 ${i + 1} 步（練習題）` : `第 ${i + 1} 步`, onclick: () => this.go(this.li, i),
    })));
  }

  get voiceActive() { return this.voiceOn && narrator.available; }

  setSpeaking(b) { this.avatar.classList.toggle('gd-speaking', b); }

  // ---------- 播放流程 ----------
  go(li, si = 0) {
    if (this.closed) return;
    if (li < 0 || li >= this.lessons.length) return;
    const L = this.lessons[li];
    si = Math.max(0, Math.min(L.steps.length - 1, si));
    const newLesson = li !== this.li || this.book !== this.shownBook;
    this.token++;
    narrator.stop();
    this.li = li; this.si = si;
    this.paused = false; this.finished = false;
    this.stage.setPaused(false);
    this.el.classList.remove('gd-is-paused');
    this.btnPlay.textContent = '⏸ 暫停';
    if (newLesson) { this.shownBook = this.book; this.renderList(); }
    this.play(this.token, newLesson);
  }
  prev() { if (this.si > 0) this.go(this.li, this.si - 1); else if (this.li > 0) this.go(this.li - 1, this.lessons[this.li - 1].steps.length - 1); }
  next() { const L = this.lessons[this.li]; if (this.si + 1 < L.steps.length) this.go(this.li, this.si + 1); else if (this.li + 1 < this.lessons.length) this.go(this.li + 1, 0); }

  showStep(newLesson) {
    const L = this.lessons[this.li], st = L.steps[this.si];
    this.renderProgress();
    this.capText.textContent = st.say;
    this.capText.classList.toggle('gd-is-quiz', !!st.quiz);
    this.quizEl.replaceChildren(); this.fbEl.textContent = ''; this.fbEl.className = 'gd-feedback';
    if (newLesson) {
      this.stageTitle.textContent = `第${cn(this.li + 1)}課・${L.title}`;
      this.stageTitle.classList.remove('gd-anim'); void this.stageTitle.offsetWidth; this.stageTitle.classList.add('gd-anim');
    }
    this.stage.reset();
    let p;
    try { p = Promise.resolve(st.scene ? st.scene(this.stage) : null); } catch (e) { console.error(e); p = Promise.resolve(); }
    return p.catch((e) => console.error(e));
  }

  async play(tok, newLesson) {
    while (tok === this.token && !this.closed) {
      const L = this.lessons[this.li], st = L.steps[this.si];
      const sceneP = this.showStep(newLesson);
      newLesson = false;
      const ok = st.quiz ? await this.runQuiz(tok, st) : await this.talk(tok, st.say);
      if (!ok || tok !== this.token) return;
      await Promise.race([sceneP, this.timed(tok, 15000)]);
      if (tok !== this.token) return;
      if (!(await this.timed(tok, 700 / this.speed))) return;
      if (this.si + 1 < L.steps.length) { this.si++; continue; }
      // 一課結束 → 自動進入下一課
      this.done.add(this.li);
      if (this.li + 1 >= this.lessons.length) { await this.finale(tok); return; }
      const nx = this.lessons[this.li + 1];
      this.renderList();
      this.capText.textContent = `✔ 第${cn(this.li + 1)}課「${L.title}」完成！接下來是第${cn(this.li + 2)}課「${nx.title}」。`;
      this.quizEl.replaceChildren(); this.fbEl.textContent = '';
      if (!(await this.talk(tok, `這一課結束了。接下來是第${cn(this.li + 2)}課，${nx.title}。`))) return;
      if (!(await this.timed(tok, 400))) return;
      this.li++; this.si = 0; newLesson = true;
      this.renderList();
    }
  }

  async finale(tok) {
    this.finished = true;
    this.renderList(); this.renderProgress();
    this.progTxt.textContent = '全部課程完成 🎉';
    const s = this.stage; s.reset();
    bg(s);
    for (let i = 0; i < 8; i++) s.after(i * 260, () => burst(s, s.root, 160 + (i * 97) % 640, 120 + (i * 61) % 260, 0.9, 'gd-spark'));
    const g = txg(s.root, 480, 260, '恭喜完成！', 'gd-t-title'); s.pop(g, 600);
    const t = tag(s.root, 480, 380, this.book === 'game' ? '祝主公早日一統天下' : '有問題隨時回來看', '#7a1f16', { fs: 26 }); s.pop(t, 500, 400);
    const msg = this.book === 'game' ? '遊戲教學全部結束了！祝主公運籌帷幄，早日一統天下！' : '系統說明全部結束了！有不清楚的地方，隨時可以回來再看。';
    this.capText.textContent = '🎉 ' + msg;
    this.quizEl.replaceChildren(
      h('button', { class: 'gd-opt', onclick: () => this.go(0, 0) }, '↺ 從頭再看一次'),
      h('button', { class: 'gd-opt', onclick: () => this.setBook(this.book === 'game' ? 'system' : 'game') }, this.book === 'game' ? '⚙️ 看系統說明' : '📜 看遊戲教學'),
      h('button', { class: 'gd-opt', onclick: () => this.close() }, '✕ 關閉教學'));
    this.btnPlay.textContent = '↺ 重新開始';
    await this.talk(tok, msg);
  }

  // 說一段話：語音說完才結束；沒有語音時依字數等待。暫停時中斷，繼續後從頭再說一次。
  async talk(tok, text) {
    const id = ++this.talkId;
    for (;;) {
      if (!(await this.gate(tok))) return false;
      if (id !== this.talkId) return tok === this.token;
      this.restart = false;
      this.setSpeaking(true);
      if (this.voiceActive) {
        const prev = narrator.on;
        let p;
        narrator.on = true;
        try { p = narrator.speak(text, { force: true, rate: this.speed }); } finally { narrator.on = prev; }
        await p;
      } else {
        await this.timed(tok, Math.min(12000, 1400 + [...text].length * 165) / this.speed, id);
      }
      if (id === this.talkId) this.setSpeaking(false);
      if (tok !== this.token || this.closed) return false;
      if (id !== this.talkId) return true;
      if (this.paused || this.restart) continue;
      return true;
    }
  }

  // 可暫停的等待（ms）；talk 的 id 改變或要求重來時提早結束
  async timed(tok, ms, id) {
    let t = 0;
    while (t < ms) {
      await sleep(100);
      if (tok !== this.token || this.closed) return false;
      if (id && (id !== this.talkId || this.restart)) return true;
      if (!this.paused) t += 100;
    }
    return true;
  }

  async gate(tok) {
    while (this.paused && tok === this.token && !this.closed) await new Promise((r) => { this._wake = r; setTimeout(r, 300); });
    return tok === this.token && !this.closed;
  }

  // ---------- 練習題 ----------
  runQuiz(tok, st) {
    const q = st.quiz, ans = [].concat(q.answer);
    const why = (i) => (q.why && q.why[i]) || '';
    const label = (i) => q.options[i];
    return new Promise((resolve) => {
      let finished = false;
      const fb = (txt, cls) => { this.fbEl.textContent = txt; this.fbEl.className = 'gd-feedback ' + cls; };
      const end = async (speech) => {
        finished = true;
        btns.forEach((b) => { b.disabled = true; }); skip.remove();
        ans.forEach((a) => btns[a].classList.add('gd-right'));
        const ok = await this.talk(tok, speech);
        resolve(ok && tok === this.token);
      };
      const pick = (i) => {
        if (finished || tok !== this.token) return;
        if (ans.includes(i)) {
          btns[i].classList.add('gd-right');
          fb(`✔ 答對了！${why(i)}`, 'gd-good');
          end(`答對了！${why(i)}`);
        } else {
          btns[i].classList.add('gd-wrong'); btns[i].disabled = true;
          fb(`✘ 不對喔。${why(i)} 再試一次！`, 'gd-bad');
          this.talk(tok, `不對喔。${why(i)} 再試一次。`);
        }
      };
      const btns = q.options.map((o, i) => h('button', { class: 'gd-opt', onclick: () => pick(i) }, h('b', {}, 'ABCD'[i]), ' ' + o));
      const skip = h('button', { class: 'gd-opt gd-opt-skip', onclick: () => {
        if (finished) return;
        const names = ans.map(label).join('或');
        fb(`💡 正確答案：${names}。${why(ans[0])}`, 'gd-hint');
        end(`正確答案是${names}。${why(ans[0])}`);
      } }, '💡 看答案');
      this.quizEl.replaceChildren(h('span', { class: 'gd-q-label' }, '📝 練習'), ...btns, skip);
      this.talk(tok, st.say + ' 請點選答案。');
    });
  }

  // ---------- 控制 ----------
  togglePause() {
    if (this.closed) return;
    if (this.finished) { this.go(0, 0); return; }
    this.paused = !this.paused;
    this.stage.setPaused(this.paused);
    this.el.classList.toggle('gd-is-paused', this.paused);
    this.btnPlay.textContent = this.paused ? '▶ 繼續' : '⏸ 暫停';
    if (this.paused) { narrator.stop(); this.setSpeaking(false); } else if (this._wake) this._wake();
  }
  toggleVoice() {
    if (!narrator.available) return;
    this.voiceOn = !this.voiceOn;
    savePref({ voice: this.voiceOn });
    this.renderVoice();
    this.restart = true;
    narrator.stop();
  }
  setSpeed(v) {
    this.speed = v; this.stage.speed = v;
    savePref({ speed: v });
    this.renderSpeed();
    if (this.voiceActive) { this.restart = true; narrator.stop(); }
  }
  key(e) {
    if (this.closed || e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    const k = e.key;
    if (k === 'Escape') this.close();
    else if (k === ' ' || k === 'Spacebar') this.togglePause();
    else if (k === 'ArrowRight') this.next();
    else if (k === 'ArrowLeft') this.prev();
    else return;
    e.preventDefault(); e.stopPropagation();
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.token++;
    narrator.stop();
    this.stage.destroy();
    window.removeEventListener('keydown', this.onKey, true);
    this.el.remove();
    if (current === this) current = null;
    try { if (this.onClose) this.onClose(); } catch (e) { console.error(e); }
  }
}

let current = null;

/** 打開教學：book = 'game'（遊戲教學）或 'system'（系統說明）。回傳 { close() }。 */
export function openGuide(book = 'game', { onClose } = {}) {
  if (current) current.close();
  current = new Guide(book, onClose);
  return current;
}
