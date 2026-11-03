// 3D 沙盤地圖：地形（山脈、黃河、長江、海岸）、城池模型、道路、行軍與攻城特效
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const S = 1.4;                       // 地圖座標（0～100）換算成 3D 單位
const W = 100 * S;
export const wx = (x) => (x - 50) * S;
export const wz = (y) => (y - 50) * S;

// ---------------- 地形 ----------------
const COAST = [[0, 97], [8, 91], [14, 90], [22, 90], [28, 93], [34, 95], [42, 94], [50, 93], [58, 94], [66, 95], [74, 97], [84, 96], [100, 94]];
const YELLOW = [[12, 28], [20, 33], [28, 31], [34, 22], [40, 12], [46, 13], [49, 24], [52, 35], [60, 37], [67, 32], [77, 29], [86, 27], [93, 26]];
const YANGTZE = [[18, 88], [24, 84], [31, 80], [40, 75.5], [46, 72], [52, 71], [58, 72.5], [64, 74.5], [70, 70.5], [76, 68.5], [82, 64.5], [88, 60], [97, 58]];
const HAN = [[38, 55.5], [46, 58], [51, 61], [55, 63.5], [59, 68], [64, 74.5]];
const RIDGES = [  // [x1,y1,x2,y2,高度,寬度]
  [24, 47, 54, 48, 4.2, 3.2], [57, 6, 61, 33, 3.4, 2.4], [16, 58, 22, 92, 5.5, 4], [20, 60, 42, 58, 3.6, 2.6],
  [42, 60, 47, 82, 3.2, 2.6], [30, 92, 74, 98, 2.6, 3], [77, 76, 84, 96, 2.4, 3], [44, 30, 48, 44, 2.2, 2.2],
  [62, 60, 70, 64, 1.6, 2.2], [8, 10, 30, 14, 3.4, 4],
];

function hash(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function noise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < 4; i++) { s += a * noise(x * f, y * f); f *= 2; a *= 0.5; }
  return s;
}
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}
function polyDist(px, py, pts) {
  let m = 1e9;
  for (let i = 0; i < pts.length - 1; i++) m = Math.min(m, segDist(px, py, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]));
  return m;
}
function coastX(y) {
  for (let i = 0; i < COAST.length - 1; i++) {
    const [y0, x0] = COAST[i], [y1, x1] = COAST[i + 1];
    if (y >= y0 && y <= y1) return x0 + (x1 - x0) * (y - y0) / (y1 - y0);
  }
  return 95;
}

export class Terrain {
  constructor(cities) { this.cities = Object.values(cities); }
  // 回傳 [高度, 種類] 種類：0 海 1 河 2 平原 3 丘陵 4 山
  sample(x, y) {
    let h = 0.9 + fbm(x * 0.09, y * 0.09) * 1.1;
    // 西高東低
    if (x < 26) h += (26 - x) * 0.16;
    for (const [x1, y1, x2, y2, hh, w] of RIDGES) {
      const d = segDist(x, y, x1, y1, x2, y2);
      if (d < w * 2.5) h += hh * Math.exp(-(d * d) / (w * w)) * (0.7 + 0.6 * fbm(x * 0.3, y * 0.3));
    }
    // 四川盆地
    const db = Math.hypot(x - 29, y - 73);
    if (db < 11) h -= (11 - db) * 0.18;
    // 海
    const cx = coastX(y);
    const bohai = Math.hypot((x - 91) / 7, (y - 17) / 6.5);
    let sea = Math.min(cx - x, (bohai - 1) * 6);
    if (sea < 0) h = Math.min(h, -1.2 + sea * 0.05);
    else if (sea < 2.5) h = Math.min(h, 0.15 + sea * 0.35);
    // 河流
    let river = 9;
    for (const [pts, w] of [[YELLOW, 1.05], [YANGTZE, 1.25], [HAN, 0.7]]) {
      const d = polyDist(x, y, pts) / w;
      river = Math.min(river, d);
    }
    if (river < 1.6) h = h * (river / 1.6) * 0.8 + (river < 0.75 ? -0.6 : 0.1) * (1 - river / 1.6);
    // 城池平台
    for (const c of this.cities) {
      const d = Math.hypot(x - c.x, y - c.y);
      if (d < 3.2) {
        const t = Math.min(1, Math.max(0, (d - 1.8) / 1.4));
        h = h * t + 0.7 * (1 - t);
      }
    }
    let kind = 2;
    if (sea < 0) kind = 0;
    else if (river < 0.75) kind = 1;
    else if (h > 3.6) kind = 4;
    else if (h > 2.1) kind = 3;
    return [h, kind];
  }
  height(x, y) { return Math.max(0.02, this.sample(x, y)[0]); }
}

function colorFor(h, kind, x, y) {
  const c = new THREE.Color();
  if (kind === 0) return c.set('#2d5d74').lerp(new THREE.Color('#183848'), Math.min(1, -h / 2));
  if (kind === 1) return c.set('#3f7891');
  const n = fbm(x * 0.4, y * 0.4);
  if (h < 0.35) return c.set('#c9b98a');
  if (h > 5.2) return c.set('#e8e4d8');
  if (h > 3.6) return c.set('#7d6d5a').lerp(new THREE.Color('#9a8c78'), n);
  if (h > 2.1) return c.set('#7f8a4a').lerp(new THREE.Color('#8d7a4c'), n);
  // 平原：北方黃土、南方翠綠
  const north = Math.max(0, Math.min(1, (48 - y) / 30));
  c.set('#5f8a3e').lerp(new THREE.Color('#a4964f'), north * 0.75);
  return c.lerp(new THREE.Color('#4d7a35'), n * 0.35);
}

// ---------------- 城池模型 ----------------
const MAT = {};
function mat(color, rough = 0.85) {
  const k = color + rough;
  if (!MAT[k]) MAT[k] = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.05 });
  return MAT[k];
}

function buildCity(c, capital) {
  const g = new THREE.Group();
  const big = c.max_def >= 1100 ? 1.18 : c.max_def >= 900 ? 1.0 : 0.88;
  const s = 2.1 * big;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.95, s * 1.05, 0.35, 8), mat('#8a7a62'));
  base.position.y = 0.17;
  base.receiveShadow = true;
  g.add(base);
  const wallM = mat('#9c8d74');
  const t = 0.22, wh = 0.55, half = s * 0.62;
  for (const [x, z, w, d] of [[0, -half, half * 2, t], [0, half, half * 2, t], [-half, 0, t, half * 2], [half, 0, t, half * 2]]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, wh, d), wallM);
    m.position.set(x, 0.35 + wh / 2, z);
    m.castShadow = true; m.receiveShadow = true;
    g.add(m);
  }
  for (const [x, z] of [[-half, -half], [half, -half], [-half, half], [half, half]]) {
    const tw = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.95, 0.42), mat('#8e7f66'));
    tw.position.set(x, 0.35 + 0.47, z);
    tw.castShadow = true;
    g.add(tw);
    const rf = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.32, 4), mat('#3b2a20'));
    rf.position.set(x, 1.45, z);
    rf.rotation.y = Math.PI / 4;
    g.add(rf);
  }
  // 中央樓閣
  const tiers = capital ? 3 : 2;
  let y = 0.35;
  for (let i = 0; i < tiers; i++) {
    const w = (0.95 - i * 0.22) * big;
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, 0.42, w), mat(i === 0 ? '#b8a27a' : '#c9b48a'));
    body.position.y = y + 0.21;
    body.castShadow = true;
    g.add(body);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(w * 0.95, 0.34, 4), mat('#5a2a22'));
    roof.position.y = y + 0.42 + 0.15;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    g.add(roof);
    y += 0.55;
  }
  // 旗子
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.1, 6), mat('#3b2a20'));
  pole.position.set(half - 0.05, 0.35 + 1.05, -half + 0.05);
  g.add(pole);
  const flagGeo = new THREE.PlaneGeometry(0.95, 0.58, 8, 1);
  flagGeo.translate(0.475, 0, 0);
  const flagMat = new THREE.MeshStandardMaterial({ color: '#888', side: THREE.DoubleSide, roughness: 0.7 });
  const flag = new THREE.Mesh(flagGeo, flagMat);
  flag.position.set(half - 0.05, 0.35 + 1.82, -half + 0.05);
  flag.castShadow = true;
  g.add(flag);
  // 選取光圈
  const ring = new THREE.Mesh(new THREE.RingGeometry(s * 1.1, s * 1.32, 40), new THREE.MeshBasicMaterial({ color: '#ffd76a', transparent: true, opacity: 0.0, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.4;
  g.add(ring);
  // 可選目標光圈
  const tgt = new THREE.Mesh(new THREE.RingGeometry(s * 1.0, s * 1.12, 40), new THREE.MeshBasicMaterial({ color: '#ff5a4a', transparent: true, opacity: 0.0, side: THREE.DoubleSide, depthWrite: false }));
  tgt.rotation.x = -Math.PI / 2;
  tgt.position.y = 0.42;
  g.add(tgt);
  // 點選用的隱形圓柱
  const pick = new THREE.Mesh(new THREE.CylinderGeometry(s * 1.15, s * 1.15, 3.5, 10), new THREE.MeshBasicMaterial({ visible: false }));
  pick.position.y = 1.4;
  pick.userData.city = c.id;
  g.add(pick);
  return { group: g, flag, flagGeo, ring, tgt, pick, size: s };
}

// ---------------- 地圖 ----------------
export class MapView {
  constructor(container, stat, { onPick, onHover } = {}) {
    this.el = container;
    this.stat = stat;
    this.onPick = onPick;
    this.onHover = onHover;
    this.terrain = new Terrain(stat.cities);
    this.cities = {};
    this.tweens = [];
    this.clock = new THREE.Clock();
    this.selected = null;

    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }));
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.outputColorSpace = THREE.SRGBColorSpace;
    container.append(r.domElement);
    r.domElement.className = 'map-canvas';

    this.labels = document.createElement('div');
    this.labels.className = 'map-labels';
    container.append(this.labels);

    const scene = (this.scene = new THREE.Scene());
    scene.background = new THREE.Color('#15110c');
    scene.fog = new THREE.Fog('#15110c', 210, 380);
    this.camera = new THREE.PerspectiveCamera(42, 1, 1, 800);
    this.camera.position.set(0, 112, 98);
    const ctl = (this.controls = new OrbitControls(this.camera, r.domElement));
    ctl.target.set(0, 0, 6);
    ctl.enableDamping = true;
    ctl.dampingFactor = 0.08;
    ctl.minDistance = 28;
    ctl.maxDistance = 210;
    ctl.maxPolarAngle = 1.22;
    ctl.screenSpacePanning = false;
    ctl.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };

    scene.add(new THREE.HemisphereLight('#f4e6c8', '#3a2c1c', 1.0));
    const sun = (this.sun = new THREE.DirectionalLight('#ffe2b0', 2.3));
    sun.position.set(-70, 120, 50);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -85, right: 85, top: 85, bottom: -85, near: 10, far: 320 });
    sun.shadow.bias = -0.0008;
    scene.add(sun);

    this.buildTable();
    this.buildTerrain();
    this.buildRoads();
    this.buildCities();
    this.bindEvents();
    this.resize();
    this._ro = new ResizeObserver(() => this.resize());
    this._ro.observe(container);
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  pos(cid, lift = 0) {
    const c = this.stat.cities[cid];
    return new THREE.Vector3(wx(c.x), this.terrain.height(c.x, c.y) + lift, wz(c.y));
  }

  buildTable() {
    // 木頭桌面與沙盤外框
    const table = new THREE.Mesh(new THREE.BoxGeometry(W + 60, 3, W + 50), new THREE.MeshStandardMaterial({ color: '#3a2618', roughness: 0.75 }));
    table.position.y = -6.5;
    table.receiveShadow = true;
    this.scene.add(table);
    const frameM = new THREE.MeshStandardMaterial({ color: '#5b3a22', roughness: 0.6 });
    const t = 2.2;
    for (const [x, z, w, d] of [[0, -W / 2 - t / 2, W + t * 2, t], [0, W / 2 + t / 2, W + t * 2, t], [-W / 2 - t / 2, 0, t, W], [W / 2 + t / 2, 0, t, W]]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 7, d), frameM);
      m.position.set(x, -1.6, z);
      m.castShadow = true; m.receiveShadow = true;
      this.scene.add(m);
    }
    const under = new THREE.Mesh(new THREE.BoxGeometry(W, 4, W), new THREE.MeshStandardMaterial({ color: '#2a2016' }));
    under.position.y = -3.2;
    this.scene.add(under);
  }

  buildTerrain() {
    const N = 220;
    const geo = new THREE.PlaneGeometry(W, W, N, N);
    geo.rotateX(-Math.PI / 2);
    const p = geo.attributes.position;
    const col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) / S + 50, y = p.getZ(i) / S + 50;
      const [h, kind] = this.terrain.sample(x, y);
      p.setY(i, h);
      const c = colorFor(h, kind, x, y);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 }));
    m.receiveShadow = true;
    this.scene.add(m);
    this.ground = m;
    const water = new THREE.Mesh(new THREE.PlaneGeometry(W, W), new THREE.MeshStandardMaterial({ color: '#3a7a98', transparent: true, opacity: 0.72, roughness: 0.25, metalness: 0.2 }));
    water.rotation.x = -Math.PI / 2;
    water.position.y = -0.05;
    this.scene.add(water);
    this.water = water;
    // 樹林：平原與丘陵上散布的小樹
    const tree = new THREE.ConeGeometry(0.32, 0.9, 5);
    const trees = new THREE.InstancedMesh(tree, new THREE.MeshStandardMaterial({ color: '#2f5a2a', roughness: 0.9 }), 900);
    const m4 = new THREE.Matrix4();
    let n = 0;
    for (let i = 0; i < 6000 && n < 900; i++) {
      const x = hash(i, 7) * 100, y = hash(i, 13) * 100;
      const [h, kind] = this.terrain.sample(x, y);
      if (kind < 2 || kind === 4 || h < 0.6) continue;
      if (fbm(x * 0.15 + 9, y * 0.15) < 0.52) continue;
      if (Object.values(this.stat.cities).some((c) => Math.hypot(c.x - x, c.y - y) < 3.6)) continue;
      const sc = 0.7 + hash(i, 3) * 0.7;
      m4.makeScale(sc, sc, sc).setPosition(wx(x), h + 0.4 * sc, wz(y));
      trees.setMatrixAt(n++, m4);
    }
    trees.count = n;
    trees.castShadow = true;
    this.scene.add(trees);
  }

  buildRoads() {
    const colors = { land: '#d8c690', river: '#8fd0ff', pass: '#c98c58', mount: '#b08a6a' };
    this.roadMeshes = {};
    for (const [a, b, kind] of this.stat.roads) {
      const ca = this.stat.cities[a], cb = this.stat.cities[b];
      const pts = [];
      const n = Math.max(8, Math.round(Math.hypot(ca.x - cb.x, ca.y - cb.y) * 1.2));
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const x = ca.x + (cb.x - ca.x) * t, y = ca.y + (cb.y - ca.y) * t;
        pts.push(new THREE.Vector3(wx(x), Math.max(0.05, this.terrain.height(x, y)) + 0.12, wz(y)));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const geo = new THREE.TubeGeometry(curve, n * 2, kind === 'river' ? 0.11 : 0.13, 5, false);
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: colors[kind] || '#d8c690', roughness: 0.8, emissive: kind === 'river' ? '#1a3a50' : '#000', transparent: true, opacity: kind === 'river' ? 0.85 : 0.95 }));
      this.scene.add(m);
      this.roadMeshes[a + '|' + b] = this.roadMeshes[b + '|' + a] = { mesh: m, curve, from: a };
    }
  }

  buildCities() {
    this.pickables = [];
    for (const c of Object.values(this.stat.cities)) {
      const obj = buildCity(c, false);
      obj.group.position.copy(this.pos(c.id));
      this.scene.add(obj.group);
      const label = document.createElement('div');
      label.className = 'city-label';
      label.innerHTML = `<b>${c.name}</b><span class="cl-sol"></span>`;
      label.addEventListener('click', () => this.onPick && this.onPick(c.id));
      this.labels.append(label);
      obj.label = label;
      obj.phase = Math.random() * 6;
      this.cities[c.id] = obj;
      this.pickables.push(obj.pick);
    }
  }

  // 依遊戲狀態更新旗色與標籤
  setState(state, viewer) {
    this.state = state;
    for (const [cid, obj] of Object.entries(this.cities)) {
      const c = state.cities[cid];
      const f = c.owner ? state.factions[c.owner] : null;
      obj.flag.material.color.set(f ? f.color : '#9a9488');
      obj.label.style.setProperty('--fc', f ? f.color : '#8a8478');
      obj.label.classList.toggle('mine', !!viewer && c.owner === viewer);
      obj.label.classList.toggle('neutral', !f);
      obj.label.querySelector('.cl-sol').textContent = (c.soldiers / 1000).toFixed(1) + '千';
      const isCap = f && f.capital === cid;
      obj.label.classList.toggle('capital', !!isCap);
      obj.label.title = `${this.stat.cities[cid].name}（${f ? f.name : '無主'}）`;
    }
  }

  select(cid) {
    this.selected = cid;
    for (const [id, o] of Object.entries(this.cities)) {
      o.ring.material.opacity = id === cid ? 0.85 : 0;
      o.label.classList.toggle('sel', id === cid);
    }
  }

  // 標示可選擇的目標城（出征紅色、移動／運輸綠色）
  highlightTargets(cids, kind = 'attack') {
    for (const [id, o] of Object.entries(this.cities)) {
      const on = cids && cids.includes(id);
      o.tgt.material.color.set(kind === 'attack' ? '#ff5a4a' : '#6ee08a');
      o.tgt.material.opacity = on ? 0.9 : 0;
      o.label.classList.toggle('target', !!on);
    }
  }

  focus(cid, dist = 70, ms = 700) {
    const to = this.pos(cid);
    const from = this.controls.target.clone();
    const camOff = this.camera.position.clone().sub(this.controls.target);
    const len = camOff.length();
    const goal = camOff.clone().setLength(Math.min(len, dist));
    return this.tween(ms, (t) => {
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      this.controls.target.lerpVectors(from, to, e);
      const off = camOff.clone().lerp(goal, e);
      this.camera.position.copy(this.controls.target).add(off);
    });
  }

  resetView() {
    const from = this.controls.target.clone(), fc = this.camera.position.clone();
    const tt = new THREE.Vector3(0, 0, 6), tc = new THREE.Vector3(0, 112, 98);
    return this.tween(700, (t) => {
      this.controls.target.lerpVectors(from, tt, t);
      this.camera.position.lerpVectors(fc, tc, t);
    });
  }

  tween(ms, fn) {
    return new Promise((resolve) => {
      // 視窗縮小或被遮住時畫面不更新：用計時器保證動畫一定會結束，遊戲不會卡住
      const tw = { t0: performance.now(), ms, fn, resolve };
      tw.timer = setTimeout(() => { if (!tw.done) { tw.done = true; try { fn(1); } catch {} this.tweens = this.tweens.filter((x) => x !== tw); resolve(); } }, ms + 250);
      this.tweens.push(tw);
    });
  }

  // 行軍：一隊小兵扛著旗子沿道路前進
  march(from, to, color, { ms = 1400, back = false } = {}) {
    const road = this.roadMeshes[from + '|' + to];
    const g = new THREE.Group();
    const body = mat(color, 0.6);
    for (let i = 0; i < 7; i++) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.55, 0.32), body);
      s.position.set((i % 3 - 1) * 0.45, 0.3, Math.floor(i / 3) * 0.5 - 0.5);
      s.castShadow = true;
      g.add(s);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 6, 5), mat('#e8c9a0'));
      head.position.set(s.position.x, 0.68, s.position.z);
      g.add(head);
    }
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.8, 5), mat('#3b2a20'));
    pole.position.set(0, 0.9, 0.4);
    g.add(pole);
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.5), new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide }));
    fl.position.set(0.4, 1.55, 0.4);
    g.add(fl);
    g.scale.setScalar(1.15);
    this.scene.add(g);
    const curve = road ? road.curve : new THREE.LineCurve3(this.pos(from, 0.3), this.pos(to, 0.3));
    const reversed = road && road.from !== from;
    return this.tween(ms, (t) => {
      let u = reversed ? 1 - t : t;
      if (back) u = reversed ? t : 1 - t;
      const p = curve.getPointAt(Math.min(1, Math.max(0, u)));
      const q = curve.getPointAt(Math.min(1, Math.max(0, u + (reversed !== back ? -0.01 : 0.01))));
      g.position.copy(p);
      g.lookAt(q.x, p.y, q.z);
      g.children.forEach((m, i) => { if (i < 14 && i % 2 === 0) m.position.y = 0.3 + Math.abs(Math.sin(t * 40 + i)) * 0.12; });
    }).then(() => this.scene.remove(g));
  }

  // 城池上方飄出文字（+12 開墾、徵兵 2000…）
  pop(cid, text, kind = '') {
    const o = this.cities[cid];
    if (!o) return;
    const el = document.createElement('div');
    el.className = 'map-pop ' + kind;
    const span = document.createElement('span');
    span.textContent = text;
    el.append(span);
    el._cid = cid;
    this.labels.append(el);
    setTimeout(() => el.remove(), 2200);
  }

  // 攻下城池：光環擴散＋旗子換色
  capture(cid, color) {
    const o = this.cities[cid];
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.9, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(this.pos(cid, 0.6));
    this.scene.add(ring);
    o.flag.material.color.set(color);
    return this.tween(1100, (t) => {
      ring.scale.setScalar(1 + t * 9);
      ring.material.opacity = 0.9 * (1 - t);
      o.flag.scale.setScalar(1 + Math.sin(t * Math.PI) * 0.8);
    }).then(() => { this.scene.remove(ring); o.flag.scale.setScalar(1); });
  }

  // 戰鬥中的城池：上方出現閃爍的交叉雙劍
  battleMark(cid, on) {
    if (this._battle) { this.scene.remove(this._battle); this._battle = null; }
    if (!on) return;
    const g = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color: '#e8e0d0', emissive: '#ff4a2a', emissiveIntensity: 0.6, metalness: 0.6, roughness: 0.3 });
    for (const s of [-1, 1]) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.6, 0.06), m);
      blade.rotation.z = s * 0.7;
      g.add(blade);
    }
    g.position.copy(this.pos(cid, 4.2));
    this.scene.add(g);
    this._battle = g;
  }

  bindEvents() {
    const dom = this.renderer.domElement;
    const ray = new THREE.Raycaster();
    const v = new THREE.Vector2();
    let down = null;
    const hit = (e) => {
      const r = dom.getBoundingClientRect();
      v.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(v, this.camera);
      const h = ray.intersectObjects(this.pickables, false)[0];
      return h ? h.object.userData.city : null;
    };
    dom.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
    dom.addEventListener('pointerup', (e) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
      down = null;
      const cid = hit(e);
      if (this.onPick) this.onPick(cid);
    });
    dom.addEventListener('pointermove', (e) => {
      if (e.buttons) return;
      const cid = hit(e);
      if (cid !== this._hover) {
        this._hover = cid;
        dom.style.cursor = cid ? 'pointer' : '';
        for (const [id, o] of Object.entries(this.cities)) o.label.classList.toggle('hover', id === cid);
        if (this.onHover) this.onHover(cid);
      }
    });
  }

  resize() {
    const w = this.el.clientWidth || 800, h = this.el.clientHeight || 600;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  loop() {
    this.raf = requestAnimationFrame(this.loop);
    if (document.hidden) return;
    const now = performance.now();
    const time = this.clock.getElapsedTime();
    this.tweens = this.tweens.filter((tw) => {
      const t = Math.min(1, (now - tw.t0) / tw.ms);
      if (tw.done) return false;
      tw.fn(t);
      if (t >= 1) { tw.done = true; clearTimeout(tw.timer); tw.resolve(); return false; }
      return true;
    });
    this.controls.update();
    // 旗子飄動
    for (const o of Object.values(this.cities)) {
      const p = o.flagGeo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i);
        p.setZ(i, Math.sin(time * 4 + o.phase + x * 5) * 0.09 * x);
      }
      p.needsUpdate = true;
      o.ring.rotation.z = time * 0.6;
    }
    if (this._battle) this._battle.rotation.y = time * 2;
    this.water.material.opacity = 0.68 + Math.sin(time * 0.8) * 0.04;
    this.renderer.render(this.scene, this.camera);
    this.placeLabels();
  }

  placeLabels() {
    const w = this.el.clientWidth, h = this.el.clientHeight;
    const v = new THREE.Vector3();
    const camDist = this.camera.position.distanceTo(this.controls.target);
    const scale = Math.max(0.7, Math.min(1.25, 95 / camDist));
    for (const [cid, o] of Object.entries(this.cities)) {
      v.copy(o.group.position); v.y += 3.0;
      v.project(this.camera);
      const vis = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
      o.label.style.display = vis ? '' : 'none';
      if (vis) o.label.style.transform = `translate(${(v.x * 0.5 + 0.5) * w}px, ${(-v.y * 0.5 + 0.5) * h}px) translate(-50%, -100%) scale(${scale})`;
      o._sx = (v.x * 0.5 + 0.5) * w; o._sy = (-v.y * 0.5 + 0.5) * h;
    }
    for (const el of this.labels.querySelectorAll('.map-pop')) {
      const o = this.cities[el._cid];
      if (o) el.style.transform = `translate(${o._sx}px, ${o._sy - 30}px) translate(-50%, -100%)`;
    }
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this._ro.disconnect();
    this.renderer.dispose();
    this.el.innerHTML = '';
  }
}
