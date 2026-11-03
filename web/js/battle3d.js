// 3D 戰場：兩軍方陣、城牆、突擊／齊射／固守／計策／單挑動畫、傷亡倒地
import * as THREE from 'three';

const GROUND = { plain: '#7d8a4a', hill: '#8a7d4f', mount: '#7a6c58', water: '#6f8a5a' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Army {
  constructor(scene, color, count, front, dir) {
    this.dir = dir;           // 面向：+1 往 -z 前進（攻方），-1 往 +z（守方）
    this.count = count;
    this.alive = count;
    const bodyGeo = new THREE.BoxGeometry(0.5, 0.85, 0.36);
    bodyGeo.translate(0, 0.42, 0);
    const headGeo = new THREE.SphereGeometry(0.17, 7, 6);
    headGeo.translate(0, 1.0, 0);
    const spearGeo = new THREE.CylinderGeometry(0.025, 0.025, 1.9, 4);
    spearGeo.translate(0.3, 0.95, 0);
    const shieldGeo = new THREE.BoxGeometry(0.5, 0.6, 0.06);
    shieldGeo.translate(0, 0.5, -0.24 * dir);
    this.body = new THREE.InstancedMesh(bodyGeo, new THREE.MeshStandardMaterial({ color, roughness: 0.7 }), count);
    this.head = new THREE.InstancedMesh(headGeo, new THREE.MeshStandardMaterial({ color: '#e5c39a', roughness: 0.8 }), count);
    this.spear = new THREE.InstancedMesh(spearGeo, new THREE.MeshStandardMaterial({ color: '#c8c2b0', metalness: 0.5, roughness: 0.4 }), count);
    this.shield = new THREE.InstancedMesh(shieldGeo, new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.6), roughness: 0.6 }), count);
    this.shield.visible = false;
    for (const m of [this.body, this.head, this.spear, this.shield]) { m.castShadow = true; scene.add(m); }
    this.base = [];
    this.off = [];
    this.fall = new Float32Array(count);
    this.dead = new Uint8Array(count);
    const cols = Math.ceil(Math.sqrt(count * 3.2));
    for (let i = 0; i < count; i++) {
      const r = Math.floor(i / cols), c = i % cols;
      const x = (c - (cols - 1) / 2) * 0.95 + (Math.random() - 0.5) * 0.2;
      const z = front + r * 1.05 * dir + (Math.random() - 0.5) * 0.2;
      this.base.push(new THREE.Vector3(x, 0, z));
      this.off.push(new THREE.Vector3());
    }
    this.width = cols * 0.95;
    this.compress = 0;
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.e = new THREE.Euler();
  }
  frontZ() { return this.base[0] ? this.base[0].z : 0; }
  kill(n) {
    const alive = [];
    for (let i = 0; i < this.count; i++) if (!this.dead[i]) alive.push(i);
    // 前排先倒
    alive.sort((a, b) => (this.base[a].z - this.base[b].z) * this.dir);
    let k = Math.min(n, alive.length);
    while (k-- > 0 && alive.length) {
      const j = Math.floor(Math.pow(Math.random(), 1.8) * Math.min(alive.length, Math.max(1, alive.length * 0.6)));
      const i = alive.splice(j, 1)[0];
      this.dead[i] = 1;
      this.alive--;
    }
  }
  update(t) {
    const s = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < this.count; i++) {
      if (this.dead[i] && this.fall[i] < 1) this.fall[i] = Math.min(1, this.fall[i] + 0.035);
      const f = this.fall[i];
      const b = this.base[i], o = this.off[i];
      const x = b.x * (1 - this.compress * 0.25) + o.x;
      const z = b.z + o.z - this.compress * (b.z - this.base[0].z) * 0.25;
      const bob = this.dead[i] ? 0 : Math.abs(Math.sin(t * 6 + i)) * 0.03;
      this.e.set(f * 1.45 * this.dir, 0, (i % 2 ? 1 : -1) * f * 0.3);
      this.q.setFromEuler(this.e);
      const sc = f >= 1 ? Math.max(0.001, 1 - (this.fadeT || 0)) : 1;
      s.set(sc, sc, sc);
      this.m.compose(new THREE.Vector3(x, o.y + bob - f * 0.25, z), this.q, s);
      this.body.setMatrixAt(i, this.m);
      this.head.setMatrixAt(i, this.m);
      this.spear.setMatrixAt(i, this.m);
      this.shield.setMatrixAt(i, this.m);
    }
    for (const m of [this.body, this.head, this.spear, this.shield]) m.instanceMatrix.needsUpdate = true;
  }
  dispose(scene) { for (const m of [this.body, this.head, this.spear, this.shield]) { scene.remove(m); m.geometry.dispose(); m.material.dispose(); } }
}

function general(color) {
  const g = new THREE.Group();
  const horse = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.8, 1.9), new THREE.MeshStandardMaterial({ color: '#5a3a24' }));
  horse.position.y = 1.0;
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.9, 0.4), horse.material);
  neck.position.set(0, 1.55, -0.9);
  neck.rotation.x = 0.4;
  const legs = [];
  for (const [x, z] of [[-0.25, -0.7], [0.25, -0.7], [-0.25, 0.7], [0.25, 0.7]]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.7, 0.16), horse.material);
    l.position.set(x, 0.35, z);
    legs.push(l);
  }
  const rider = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.95, 0.45), new THREE.MeshStandardMaterial({ color, metalness: 0.3, roughness: 0.5 }));
  rider.position.y = 1.85;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshStandardMaterial({ color: '#e5c39a' }));
  head.position.y = 2.55;
  const helm = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.4, 8), new THREE.MeshStandardMaterial({ color: '#c9a227', metalness: 0.7, roughness: 0.3 }));
  helm.position.y = 2.8;
  const weapon = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 3.2, 5), new THREE.MeshStandardMaterial({ color: '#ddd', metalness: 0.7, roughness: 0.3 }));
  weapon.position.set(0.45, 2.1, -0.3);
  weapon.rotation.x = -0.6;
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.6, 0.22), new THREE.MeshStandardMaterial({ color: '#f0f0f0', metalness: 0.9, roughness: 0.2 }));
  blade.position.set(0.45, 3.35, -1.2);
  blade.rotation.x = -0.6;
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.1), new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide }));
  banner.position.set(-0.4, 3.2, 0.3);
  g.add(horse, neck, ...legs, rider, head, helm, weapon, blade, banner);
  g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  g.userData.weapon = weapon;
  g.userData.blade = blade;
  return g;
}

export class BattleView {
  constructor(container) {
    this.el = container;
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true }));
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.shadowMap.enabled = true;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.domElement.className = 'battle-canvas';
    container.append(r.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.5, 400);
    this.fx = [];
    this.tweens = [];
    this.loop = this.loop.bind(this);
    this._ro = new ResizeObserver(() => this.resize());
    this._ro.observe(container);
  }

  setup({ attColor, defColor, attSoldiers, defSoldiers, wall = 0, cityDef = true, terrain = 'plain' }) {
    const sc = this.scene;
    sc.clear();
    sc.background = new THREE.Color('#2a2f36');
    sc.fog = new THREE.Fog('#2a2f36', 60, 140);
    sc.add(new THREE.HemisphereLight('#f4e6c8', '#3a2c1c', 1.1));
    const sun = new THREE.DirectionalLight('#ffe0b0', 2.4);
    sun.position.set(-25, 40, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40 });
    sc.add(sun);
    const gg = new THREE.PlaneGeometry(160, 120, 80, 60);
    gg.rotateX(-Math.PI / 2);
    const p = gg.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const edge = Math.max(0, Math.abs(x) - 30) * 0.18 + Math.max(0, -z - 26) * 0.25;
      p.setY(i, Math.sin(x * 0.2) * Math.cos(z * 0.17) * 0.35 + edge * (terrain === 'mount' ? 1.6 : terrain === 'hill' ? 1.0 : 0.5));
    }
    gg.computeVertexNormals();
    const ground = new THREE.Mesh(gg, new THREE.MeshStandardMaterial({ color: GROUND[terrain] || GROUND.plain, roughness: 0.95 }));
    ground.receiveShadow = true;
    sc.add(ground);
    // 城牆
    this.wallGroup = null;
    if (cityDef) {
      const wg = new THREE.Group();
      const wm = new THREE.MeshStandardMaterial({ color: '#9c8d74', roughness: 0.9 });
      for (const x of [-22, -12, 12, 22]) {
        const seg = new THREE.Mesh(new THREE.BoxGeometry(10.4, 3.6, 1.6), wm);
        seg.position.set(x, 1.8, -17);
        seg.castShadow = true; seg.receiveShadow = true;
        wg.add(seg);
      }
      for (const x of [-27, -7, 7, 27]) {
        const tw = new THREE.Mesh(new THREE.BoxGeometry(2.4, 5, 2.4), wm);
        tw.position.set(x, 2.5, -17);
        tw.castShadow = true;
        wg.add(tw);
        const rf = new THREE.Mesh(new THREE.ConeGeometry(2.0, 1.4, 4), new THREE.MeshStandardMaterial({ color: '#5a2a22' }));
        rf.position.set(x, 5.7, -17);
        rf.rotation.y = Math.PI / 4;
        wg.add(rf);
      }
      const gate = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 1.8), new THREE.MeshStandardMaterial({ color: '#4a2e1c' }));
      gate.position.set(0, 1.5, -17);
      wg.add(gate);
      const gtop = new THREE.Mesh(new THREE.BoxGeometry(6, 1.6, 2.4), wm);
      gtop.position.set(0, 4.0, -17);
      wg.add(gtop);
      const groof = new THREE.Mesh(new THREE.ConeGeometry(4.2, 1.6, 4), new THREE.MeshStandardMaterial({ color: '#5a2a22' }));
      groof.position.set(0, 5.6, -17);
      groof.rotation.y = Math.PI / 4;
      wg.add(groof);
      sc.add(wg);
      this.wallGroup = wg;
      this.wallMat = wm;
    }
    this.maxStart = Math.max(attSoldiers, defSoldiers, 1);
    this.per = Math.max(10, this.maxStart / 220);
    const na = Math.max(8, Math.round(attSoldiers / this.per)), nd = Math.max(defSoldiers > 0 ? 6 : 0, Math.round(defSoldiers / this.per));
    this.att = new Army(sc, attColor, na, 9, 1);
    this.def = new Army(sc, defColor, nd, cityDef ? -11 : -9, -1);
    this.attGen = general(attColor);
    this.attGen.position.set(0, 0, this.att.frontZ() - 2.5);
    this.attGen.rotation.y = 0;
    this.defGen = general(defColor);
    this.defGen.position.set(0, 0, this.def.frontZ() + 2.5);
    this.defGen.rotation.y = Math.PI;
    sc.add(this.attGen, this.defGen);
    this.camera.position.set(0, 26, 40);
    this.camTarget = new THREE.Vector3(0, 0, -3);
    this.camera.lookAt(this.camTarget);
    this.resize();
    if (!this.raf) this.raf = requestAnimationFrame(this.loop);
  }

  resize() {
    const w = this.el.clientWidth || 800, h = this.el.clientHeight || 500;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  tween(ms, fn) {
    return new Promise((resolve) => {
      // 視窗縮小或被遮住時畫面不更新：用計時器保證動畫一定會結束，遊戲不會卡住
      const tw = { t0: performance.now(), ms, fn, resolve };
      tw.timer = setTimeout(() => { if (!tw.done) { tw.done = true; try { fn(1); } catch {} this.tweens = this.tweens.filter((x) => x !== tw); resolve(); } }, ms + 250);
      this.tweens.push(tw);
    });
  }

  army(side) { return side === 'att' ? this.att : this.def; }
  other(side) { return side === 'att' ? this.def : this.att; }

  // ---------------- 戰術動畫 ----------------
  charge(side, scale = 1) {
    const a = this.army(side), o = this.other(side);
    const gap = Math.abs(a.frontZ() - o.frontZ()) * 0.62 * scale;
    this.dust(side);
    return this.tween(1500, (t) => {
      const k = t < 0.55 ? Math.sin((t / 0.55) * Math.PI / 2) : Math.cos(((t - 0.55) / 0.45) * Math.PI / 2);
      for (const off of a.off) off.z = -a.dir * gap * k;
    });
  }

  volley(side, hit = true) {
    const a = this.army(side), o = this.other(side);
    const n = 70;
    const geo = new THREE.CylinderGeometry(0.03, 0.03, 0.9, 4);
    geo.rotateX(Math.PI / 2);
    const arrows = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: '#3a2a1a' }), n);
    this.scene.add(arrows);
    const starts = [], ends = [];
    for (let i = 0; i < n; i++) {
      const sx = (Math.random() - 0.5) * a.width, sz = a.frontZ() + a.dir * Math.random() * 3;
      const ex = (Math.random() - 0.5) * o.width * (hit ? 1 : 1.4), ez = o.frontZ() - o.dir * 0 + o.dir * Math.random() * 4 + (hit ? 0 : -o.dir * 3);
      starts.push(new THREE.Vector3(sx, 1.4, sz)); ends.push(new THREE.Vector3(ex, 0.3, ez));
    }
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 0, 1);
    return this.tween(1300, (t) => {
      for (let i = 0; i < n; i++) {
        const lt = Math.min(1, Math.max(0, t * 1.4 - (i % 10) * 0.04));
        const p = starts[i].clone().lerp(ends[i], lt);
        p.y += Math.sin(lt * Math.PI) * 9;
        const nt = Math.min(1, lt + 0.02);
        const p2 = starts[i].clone().lerp(ends[i], nt);
        p2.y += Math.sin(nt * Math.PI) * 9;
        q.setFromUnitVectors(up, p2.sub(p).normalize());
        m.compose(p, q, new THREE.Vector3(1, 1, 1));
        arrows.setMatrixAt(i, m);
      }
      arrows.instanceMatrix.needsUpdate = true;
    }).then(() => { this.scene.remove(arrows); geo.dispose(); });
  }

  defend(side) {
    const a = this.army(side);
    a.shield.visible = true;
    const ring = new THREE.Mesh(new THREE.RingGeometry(1, 1.4, 48), new THREE.MeshBasicMaterial({ color: '#7ab8ff', transparent: true, opacity: 0.0, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(0, 0.15, a.frontZ() + a.dir * 4);
    ring.scale.set(a.width / 2 + 2, 6, 1);
    this.scene.add(ring);
    return this.tween(1500, (t) => {
      a.compress = Math.sin(Math.min(1, t * 2) * Math.PI / 2);
      ring.material.opacity = Math.sin(t * Math.PI) * 0.45;
    }).then(() => { this.scene.remove(ring); setTimeout(() => { a.shield.visible = false; a.compress = 0; }, 400); });
  }

  scheme(side, ok) {
    const o = this.other(side);
    const n = ok ? 140 : 40;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3), seed = [];
    for (let i = 0; i < n; i++) {
      seed.push([(Math.random() - 0.5) * (o.width + 4), o.frontZ() + o.dir * Math.random() * 6, Math.random()]);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: ok ? '#ff7a1a' : '#8a8a8a', size: ok ? 1.3 : 1.6, transparent: true, opacity: 0.9, blending: ok ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: false }));
    this.scene.add(pts);
    const light = new THREE.PointLight('#ff6a1a', 0, 40);
    light.position.set(0, 4, o.frontZ());
    this.scene.add(light);
    return this.tween(1700, (t) => {
      for (let i = 0; i < n; i++) {
        const [x, z, r] = seed[i];
        const lt = (t * 1.6 + r) % 1;
        pos[i * 3] = x + Math.sin(lt * 9 + r * 20) * 0.4;
        pos[i * 3 + 1] = lt * (ok ? 5 : 3);
        pos[i * 3 + 2] = z;
      }
      geo.attributes.position.needsUpdate = true;
      pts.material.opacity = Math.sin(t * Math.PI) * 0.95;
      light.intensity = ok ? Math.sin(t * Math.PI) * 60 : 0;
    }).then(() => { this.scene.remove(pts, light); geo.dispose(); });
  }

  dust(side) {
    const a = this.army(side);
    const n = 60;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#c8b48a', size: 1.6, transparent: true, opacity: 0.6, depthWrite: false }));
    this.scene.add(pts);
    const seed = Array.from({ length: n }, () => [(Math.random() - 0.5) * a.width, Math.random()]);
    this.tween(1500, (t) => {
      for (let i = 0; i < n; i++) {
        const [x, r] = seed[i];
        pos[i * 3] = x;
        pos[i * 3 + 1] = 0.3 + r * 1.2 * t;
        pos[i * 3 + 2] = a.frontZ() + a.off[0].z + a.dir * (1 + r * 3);
      }
      geo.attributes.position.needsUpdate = true;
      pts.material.opacity = 0.6 * (1 - t);
    }).then(() => { this.scene.remove(pts); geo.dispose(); });
  }

  wallHit(n) {
    if (!this.wallGroup || !n) return Promise.resolve();
    const g = this.wallGroup;
    return this.tween(500, (t) => { g.position.x = Math.sin(t * 40) * 0.25 * (1 - t); });
  }

  setWall(ratio) {
    if (this.wallMat) this.wallMat.color.set('#9c8d74').lerp(new THREE.Color('#4a3f34'), 1 - Math.max(0, Math.min(1, ratio)));
  }

  tacticAnim(side, tactic, ok) {
    if (tactic === '突擊') return this.charge(side);
    if (tactic === '齊射') return this.volley(side);
    if (tactic === '固守') return this.defend(side);
    if (tactic === '計策') return this.scheme(side, ok !== false);
    if (tactic === '單挑') return this.tween(900, () => {});
    return Promise.resolve();
  }

  // 一回合：雙方戰術同時演出，然後依損失倒下士兵
  async play(ev) {
    if (ev.att_tactic === '撤退') return this.retreat('att');
    await Promise.all([
      this.tacticAnim('att', ev.att_tactic === '單挑' && ev.refused ? '固守' : ev.att_tactic, ev.att_scheme),
      sleep(150).then(() => this.tacticAnim('def', ev.def_tactic === '單挑' && ev.refused ? '固守' : ev.def_tactic, ev.def_scheme)),
      ev.wall_hit ? sleep(700).then(() => this.wallHit(ev.wall_hit)) : null,
    ]);
    this.att.kill(Math.round((ev.att_loss || 0) / this.per));
    this.def.kill(Math.round((ev.def_loss || 0) / this.per));
    await sleep(700);
  }

  // 單挑：兩位主將出陣到中央交手；onBout(第幾招, 招式資料) 讓畫面更新血條
  async duel(ev, onBout) {
    const aSide = ev.a_side;
    const A = aSide === 'att' ? this.attGen : this.defGen;
    const B = aSide === 'att' ? this.defGen : this.attGen;
    const a0 = A.position.clone(), b0 = B.position.clone();
    const mid = (this.att.frontZ() + this.def.frontZ()) / 2;
    const camFrom = this.camera.position.clone(), tgtFrom = this.camTarget.clone();
    await this.tween(1100, (t) => {
      const e = 1 - Math.pow(1 - t, 3);
      A.position.z = a0.z + (mid + (aSide === 'att' ? 2.2 : -2.2) - a0.z) * e;
      B.position.z = b0.z + (mid + (aSide === 'att' ? -2.2 : 2.2) - b0.z) * e;
      this.camera.position.lerpVectors(camFrom, new THREE.Vector3(9, 6, mid + 9), e);
      this.camTarget.lerpVectors(tgtFrom, new THREE.Vector3(0, 2, mid), e);
    });
    const spark = new THREE.PointLight('#fff2c0', 0, 20);
    spark.position.set(0, 2.6, mid);
    this.scene.add(spark);
    for (let i = 0; i < ev.bouts.length; i++) {
      const bt = ev.bouts[i];
      const hitterIsA = bt.hitter === ev.a;
      const H = hitterIsA ? A : B, V = hitterIsA ? B : A;
      const hz = H.position.z, vz = V.position.z;
      await this.tween(520, (t) => {
        const k = Math.sin(t * Math.PI);
        H.position.z = hz + (vz - hz) * 0.35 * k;
        H.userData.weapon.rotation.x = -0.6 - k * 1.2;
        H.userData.blade.rotation.x = -0.6 - k * 1.2;
        spark.intensity = t > 0.4 && t < 0.7 ? 80 : 0;
        if (t > 0.5) V.position.z = vz + (vz - hz) * 0.08 * Math.sin((t - 0.5) * 2 * Math.PI);
      });
      if (onBout) onBout(i, bt);
      await sleep(260);
    }
    this.scene.remove(spark);
    // 敗者倒地或退回
    const loserGen = ev.winner ? (ev.winner === ev.a ? B : A) : null;
    if (loserGen && ev.fate && ev.fate !== 'wounded') {
      await this.tween(700, (t) => { loserGen.rotation.z = t * 1.3; loserGen.position.y = -t * 0.6; });
      await sleep(500);
      loserGen.visible = false;
      loserGen.rotation.z = 0; loserGen.position.y = 0;
    } else await sleep(500);
    await this.tween(900, (t) => {
      A.position.lerp(a0, t); B.position.lerp(b0, t);
      this.camera.position.lerpVectors(new THREE.Vector3(9, 6, mid + 9), new THREE.Vector3(0, 26, 40), t);
      this.camTarget.lerpVectors(new THREE.Vector3(0, 2, mid), new THREE.Vector3(0, 0, -3), t);
    });
    if (loserGen) setTimeout(() => { loserGen.visible = true; }, 300);
  }

  retreat(side) {
    const a = this.army(side);
    return this.tween(1400, (t) => { for (const off of a.off) off.z = a.dir * t * 14; a.fadeT = t; });
  }

  async finish(result) {
    const win = result === 'att_win' ? 'att' : 'def';
    const lose = win === 'att' ? 'def' : 'att';
    const W = this.army(win), L = this.army(lose);
    await this.tween(1600, (t) => {
      W.off.forEach((o, i) => { o.y = Math.max(0, Math.sin(t * 18 + i)) * 0.4; });
      if (result !== 'retreat' && result !== 'timeout' || lose === 'att') L.off.forEach((o) => { o.z = L.dir * t * 10; });
      L.fadeT = t;
    });
  }

  loop() {
    this.raf = requestAnimationFrame(this.loop);
    if (document.hidden || !this.att) return;
    const now = performance.now(), time = now / 1000;
    this.tweens = this.tweens.filter((tw) => {
      const t = Math.min(1, (now - tw.t0) / tw.ms);
      if (tw.done) return false;
      tw.fn(t);
      if (t >= 1) { tw.done = true; clearTimeout(tw.timer); tw.resolve(); return false; }
      return true;
    });
    this.att.update(time);
    this.def.update(time);
    this.camera.lookAt(this.camTarget);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.raf = null;
    this._ro.disconnect();
    this.renderer.dispose();
    this.el.innerHTML = '';
  }
}
