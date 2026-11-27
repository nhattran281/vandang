// Phần dùng chung tách từ Cinderwatch (MIT): vật liệu thế giới (từ 31-terrain.js), Soup.seg, clothPanel và PROP (từ 32-props.js).

const _segq = new THREE.Quaternion(), _segd = new THREE.Vector3(), _upv = new THREE.Vector3(0, 1, 0);
Soup.prototype.seg = function (a, b, r0, r1, c, o = {}) {
  _segd.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); const len = _segd.length(); if (len < 1e-5) return this; _segd.multiplyScalar(1 / len);
  _segq.setFromUnitVectors(_upv, _segd);
  o.q = _segq; o.s = [r0, len, r0]; o.p = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]; o.c = c;
  return this.add(gCyl(o.n || 6, Math.round(clamp(r1 / r0, 0, 2.5) * 10) / 10), o);
};
function clothPanel(S, o) {
  const nx = o.nx || 4, ny = o.ny || 6, rng = o.rng, sway = o.sway === undefined ? .8 : o.sway;
  const yAt = j => o.yTop - o.len * j / ny, sw = j => Math.pow(j / ny, 1.3) * sway;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (j >= ny - 2 && rng() < (o.rag === undefined ? .4 : o.rag)) continue;
    if (j === ny - 1 && (i & 1)) continue;
    const xa = lerp(o.x0, o.x1, i / nx), xb = lerp(o.x0, o.x1, (i + 1) / nx);
    const emblem = o.col2 && i >= 1 && i < nx - 1 && j >= 1 && j <= 2;
    const c = mulC(emblem ? o.col2 : o.col, .78 + .3 * rng());
    const q = [[xa, yAt(j), sw(j)], [xb, yAt(j), sw(j)], [xb, yAt(j + 1), sw(j + 1)], [xa, yAt(j + 1), sw(j + 1)]];
    for (const [order, nz] of [[[0, 3, 2, 0, 2, 1], 1], [[0, 1, 2, 0, 2, 3], -1]]) for (const k of order) S.v(q[k][0], q[k][1], o.z, 0, 0, nz, c[0], c[1], c[2], q[k][0] * .5, q[k][1] * .5, L_CLOTH, .95, q[k][2], 0);
  }
}

const MAT = {};
function initMaterials() {
  const tex = makeDetailTextures(); SH.uTexA.value = tex.albedo; SH.uTexH.value = tex.height;
  MAT.world = litMaterial('world');
  MAT.inst = litMaterial('inst');
  MAT.water = litMaterial('water', { color: new THREE.Color(0.012, 0.02, 0.03), roughness: 0.1 });
  MAT.dark = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false });
  MAT.caster = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false });
  MAT.fall = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uTime: SH.uTime, uFP: { value: new THREE.Vector4(0, 1, 1, 0) }, uFA: { value: new THREE.Vector3(.022, .034, .054) }, uFB: { value: new THREE.Vector3(.2, .27, .38) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `precision highp float; varying vec2 vUv; uniform float uTime; uniform vec4 uFP; uniform vec3 uFA; uniform vec3 uFB;
float h(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1.0, 0.0)), f.x), mix(h(i + vec2(0.0, 1.0)), h(i + vec2(1.0, 1.0)), f.x), f.y); }
void main(){
  float x = vUv.x, y = vUv.y, t = uTime * uFP.y;
  float edge = smoothstep(0.0, 0.14, x) * smoothstep(1.0, 0.86, x);
  if (uFP.x > 0.5 && uFP.x < 1.5) {
    float c1 = n(vec2(x * 7.0, 2.0)), c2 = n(vec2(x * 19.0 + 5.0, 7.0)), c3 = n(vec2(x * 4.0 + 1.0, y * 2.2));
    float len = 0.34 + 0.46 * c1 + 0.16 * c2, tip = smoothstep(len, len - 0.2, y);
    float rib = smoothstep(0.2, 0.8, c2 * 0.55 + n(vec2(x * 34.0, y * 1.3)) * 0.45);
    float ed = smoothstep(0.0, 0.07, x) * smoothstep(1.0, 0.93, x);
    gl_FragColor = vec4(mix(uFA, uFB, rib * (0.45 + 0.55 * c3)), ed * tip * uFP.z); return;
  }
  float s1 = n(vec2(x * 6.0, y * 5.0 - t * 2.4)), s2 = n(vec2(x * 13.0 + 3.1, y * 11.0 - t * 4.1)), s3 = n(vec2(x * 3.0 - 1.7, y * 2.2 - t * 1.3));
  float strand = smoothstep(0.34, 0.72, s1 * 0.6 + s2 * 0.4);
  float sheet = 1.0 - smoothstep(0.03, 0.3, y);
  float fade = 1.0 - smoothstep(0.4, 1.0, y);
  if (uFP.x > 1.5) {
    float body = mix(0.72 + 0.28 * s3, 1.0, sheet), crust = strand * smoothstep(0.05, 0.5, y);
    gl_FragColor = vec4(mix(uFA * (0.7 + 0.5 * s3), uFB, crust), clamp(edge * body * (1.0 - smoothstep(0.55, 1.0, y)) * uFP.z, 0.0, 1.0)); return;
  }
  float body = mix(strand * (0.55 + 0.45 * s3), 1.0, sheet);
  float foam = strand * smoothstep(0.02, 0.22, y);
  vec3 col = mix(uFA, uFB, foam * 0.85 + 0.06 * s3);
  gl_FragColor = vec4(col, clamp(edge * body * fade * (0.62 + 0.3 * foam) * uFP.z, 0.0, 1.0)); }`,
  });
}

// Thư viện đồ vật dựng bằng code (thùng, cây, hàng rào, giếng, tượng...), từ 32-props.js.
const PROP = {
  barrel(S, x, y, z, s = 1, rng) {
    const c = mulC(COL.wood, .8 + .3 * rng());
    S.cyl(.2 * s, .27 * s, x, y + .135 * s, z, c, { n: 8, l: L_WOOD, rt: 1.16 });
    S.cyl(.232 * s, .27 * s, x, y + .405 * s, z, c, { n: 8, l: L_WOOD, rt: .86 });
    for (const h of [.06, .27, .48]) S.cyl((h === .27 ? .242 : .215) * s, .035 * s, x, y + h * s, z, COL.iron, { n: 8, l: L_METAL, rough: .6 });
  },
  crate(S, x, y, z, s, rng, ry = 0) {
    const c = mulC(COL.woodL, .75 + .3 * rng()), o = () => ({ l: L_WOOD, r: [0, ry, 0] });
    S.box(s, s, s, x, y + s / 2, z, c, o());
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) S.box(s * .12, s * 1.04, s * .12, x + (dx * Math.cos(ry) + dz * Math.sin(ry)) * s * .47, y + s / 2, z + (-dx * Math.sin(ry) + dz * Math.cos(ry)) * s * .47, COL.woodD, o());
    S.box(s * 1.04, s * .1, s * 1.04, x, y + s * .97, z, COL.woodD, o());
  },
  tree(S, rng, h, o = {}) {
    const bark = o.bark || mulC(COL.bark, .8 + .4 * rng());
    const branch = (a, d, len, r, depth) => {
      const b = [a[0] + d[0] * len, a[1] + d[1] * len, a[2] + d[2] * len], hot = o.tipEmis && depth >= 3;
      S.seg(a, b, r, r * .64, hot ? o.tip : bark, { l: L_WOOD, n: depth > 1 ? 4 : 6, sway: depth >= 2 ? .35 + depth * .15 : 0, emis: hot ? o.tipEmis : 0 });
      if (depth >= 4 || len < .3) return;
      const kids = depth === 0 ? rng.int(2, 3) : rng.int(1, 2);
      for (let k = 0; k < kids; k++) {
        const nd = [d[0] + rng.range(-1, 1), d[1] * .5 + rng.range(.05, .7), d[2] + rng.range(-1, 1)], l = Math.hypot(nd[0], nd[1], nd[2]);
        branch(b, [nd[0] / l, nd[1] / l, nd[2] / l], len * rng.range(.55, .8), r * .58, depth + 1);
      }
      if (depth < 2) { const nd = [d[0] + rng.range(-.3, .3), 1, d[2] + rng.range(-.3, .3)], l = Math.hypot(nd[0], nd[1], nd[2]); branch(b, [nd[0] / l, nd[1] / l, nd[2] / l], len * .72, r * .64, depth + 1); }
    };
    S.cyl(h * .12, .3, 0, .1, 0, bark, { n: 6, l: L_WOOD, rt: .7 });
    branch([0, .05, 0], [rng.range(-.15, .15), 1, rng.range(-.15, .15)], h * .42, h * .075, 0);
  },
  stump(S, rng) {
    S.cyl(.3, .45, 0, .2, 0, COL.bark, { n: 7, l: L_WOOD, rt: .8 }); S.cyl(.235, .04, 0, .44, 0, COL.woodL, { n: 7, l: L_WOOD });
    for (let k = 0; k < 3; k++) { const a = rng() * TAU; S.seg([Math.cos(a) * .2, .12, Math.sin(a) * .2], [Math.cos(a) * .6, -.05, Math.sin(a) * .6], .09, .04, COL.bark, { l: L_WOOD, n: 5 }); }
  },
  grave(S, rng) {
    const T = new Soup(), w = rng.range(.44, .62), h = rng.range(.62, 1.0), c = mixC(COL.stoneD, COL.stoneL, rng()), kind = rng.int(0, 3);
    if (kind === 0) { T.box(w, h * .8, .15, 0, h * .4, 0, c, { l: L_ROCK }); T.cyl(w / 2, .15, 0, h * .8, 0, c, { n: 8, l: L_ROCK, r: [HPI, 0, 0] }); }
    else if (kind === 1) { T.box(.15, h * 1.15, .14, 0, h * .57, 0, c, { l: L_ROCK }); T.box(w * 1.1, .15, .14, 0, h * .8, 0, c, { l: L_ROCK }); }
    else if (kind === 2) { T.box(w, h * .9, .16, 0, h * .45, 0, c, { l: L_ROCK }); T.box(w * .7, .14, .16, 0, h * .95, 0, c, { l: L_ROCK }); T.box(w * 1.2, .12, .3, 0, .06, 0, mulC(c, .8), { l: L_ROCK }); }
    else { T.box(w * .9, h * .55, .15, 0, h * .27, 0, c, { l: L_ROCK }); T.box(w * .5, h * .2, .15, -w * .18, h * .62, 0, c, { l: L_ROCK, r: [0, 0, .3] }); }
    S.merge(T, { r: [rng.range(-.2, .2), rng.range(-.3, .3), rng.range(-.16, .16)], ao: [0, .4, .55] });
    S.ico(.5, 0, .0, .62, mulC(COL.earthD, 1.1), { sc: [.75, .22, 1.25], l: L_DIRT, d: 1 });
  },
  cart(S, rng, broken) {
    const w = COL.wood, wd = COL.woodD, o = () => ({ l: L_WOOD });
    S.box(1.6, .08, .9, 0, .56, 0, w, o());
    for (const zz of [-.45, .45]) { S.box(1.6, .28, .06, 0, .74, zz, w, o()); for (const xx of [-.7, 0, .7]) S.box(.07, .4, .08, xx, .74, zz * 1.04, wd, o()); }
    S.box(.06, .28, .9, -.8, .74, 0, w, o());
    const wheel = (x, z, lean) => {
      const T = new Soup();
      T.add(gTorus(10, .13, 4), { s: .4, c: wd, l: L_WOOD }); T.cyl(.07, .14, 0, 0, 0, COL.iron, { n: 6, l: L_METAL, r: [HPI, 0, 0] });
      for (let k = 0; k < 4; k++) T.box(.74, .05, .05, 0, 0, 0, w, { l: L_WOOD, r: [0, 0, k * PI / 4] });
      S.merge(T, { p: [x, lean ? .12 : .4, z], r: [lean ? 1.35 : 0, 0, lean ? .3 : 0] });
    };
    wheel(-.25, .56, false); if (!broken) wheel(-.25, -.56, false); else wheel(.5, -1.0, true);
    S.box(.08, .08, 1.2, -.25, .4, 0, wd, o());
    for (const zz of [-.3, .3]) S.seg([.8, .54, zz], [2.0, broken ? .1 : .34, zz * 1.1], .04, .035, wd, { l: L_WOOD });
    S.ico(.26, .35, .74, .1, COL.clothT, { sc: [1.2, .7, 1], l: L_CLOTH, d: 1 }); S.ico(.24, -.05, .72, -.18, mulC(COL.clothT, .8), { sc: [1, .7, 1.2], l: L_CLOTH, d: 1 });
    PROP.barrel(S, -.5, .6, .12, .8, rng);
  },
  bones(S, rng, n = 5) {
    for (let k = 0; k < n; k++) { const a = rng() * TAU, l = rng.range(.2, .45), x = rng.range(-.4, .4), z = rng.range(-.4, .4); S.seg([x, .04, z], [x + Math.cos(a) * l, .05 + rng() * .08, z + Math.sin(a) * l], .03, .03, mulC(COL.bone, .7 + .3 * rng()), { l: L_BONE, n: 5 }); }
    if (rng() < .7) PROP.skull(S, rng.range(-.2, .2), .13, rng.range(-.2, .2), .15, rng() * TAU);
  },
  skull(S, x, y, z, r, ry) {
    const T = new Soup();
    T.sph(r, 0, 0, 0, COL.bone, { sc: [1, .95, 1.1], l: L_BONE, w: 7, h: 5 }); T.box(r * 1.1, r * .55, r * .8, 0, -r * .65, r * .32, COL.boneD, { l: L_BONE });
    for (const s of [-1, 1]) T.box(r * .42, r * .38, r * .2, s * r * .42, -r * .05, r * 1.0, COL.black, { jit: 0 });
    S.merge(T, { p: [x, y, z], ry, ao: null });
  },
  ribcage(S, rng) {
    const b = COL.bone;
    S.seg([-1.6, .5, 0], [1.6, .7, 0], .1, .08, b, { l: L_BONE });
    for (let k = 0; k < 6; k++) {
      const x = -1.3 + k * .5, s = 1 - Math.abs(k - 2.5) * .12;
      for (const side of [-1, 1]) {
        if (rng() < .15) continue;
        let p = [x, .55, 0]; const pts = [[x, .95 * s, side * .55 * s], [x + .05, 1.25 * s, side * .95 * s], [x + .1, .85 * s, side * 1.15 * s], [x + .12, .1, side * 1.05 * s]];
        for (const q of pts) { S.seg(p, q, .06, .05, mulC(b, .8 + .2 * rng()), { l: L_BONE, n: 5 }); p = q; }
      }
    }
    S.ico(.5, 2.15, .55, 0, b, { sc: [1.35, .8, .85], l: L_BONE, d: 1 }); S.ico(.3, 2.85, .4, 0, COL.boneD, { sc: [1.3, .6, .7], l: L_BONE, d: 1 });
    for (const side of [-1, 1]) { S.seg([2.0, .8, side * .3], [1.7, 1.4, side * .75], .1, .02, b, { l: L_BONE, n: 5 }); S.box(.2, .16, .08, 2.3, .62, side * .4, COL.black, { jit: 0 }); }
  },
  web(S, a, b, c) {
    const col = mulC(COL.stoneL, 1.5), th = .011;
    const lerp3 = (p, q, t) => [lerp(p[0], q[0], t), lerp(p[1], q[1], t), lerp(p[2], q[2], t)];
    for (let k = 0; k <= 4; k++) S.seg(a, lerp3(b, c, k / 4), th, th, col, { n: 3, emis: .015, jit: 0, sway: .25 });
    for (let r = 1; r <= 3; r++) for (let k = 0; k < 4; k++) S.seg(lerp3(a, lerp3(b, c, k / 4), r / 3.3), lerp3(a, lerp3(b, c, (k + 1) / 4), r / 3.3 - .04), th, th, col, { n: 3, emis: .015, jit: 0, sway: .25 });
  },
  banner(S, rng, col, h = 2.8) {
    S.seg([0, 0, 0], [0, h, 0], .055, .04, COL.woodD, { l: L_WOOD }); S.seg([-.08, h - .2, 0], [.82, h - .2, 0], .03, .03, COL.woodD, { l: L_WOOD, n: 5 });
    S.cone(.07, .2, 0, h + .1, 0, COL.iron, { n: 4, l: L_METAL });
    clothPanel(S, { x0: .04, x1: .78, yTop: h - .23, len: 1.45, z: 0, col, col2: mulC(COL.gold, .6), rng });
  },
  fence(S, rng, len) {
    const nP = Math.max(2, Math.round(len) + 1);
    for (let k = 0; k < nP; k++) {
      const x = -len / 2 + k * len / (nP - 1), lean = rng.range(-.14, .14), hh = rng.range(.72, .95);
      S.box(.1, hh, .1, x, hh / 2, 0, mulC(COL.wood, .7 + .3 * rng()), { l: L_WOOD, r: [lean, 0, rng.range(-.12, .12)] });
      if (k < nP - 1) for (const y of [.36, .68]) { if (rng() < .22) continue; const drop = rng() < .15 ? -.3 : 0; S.seg([x, y, 0], [x + len / (nP - 1), y + drop + rng.range(-.04, .04), 0], .035, .035, mulC(COL.woodL, .7 + .3 * rng()), { l: L_WOOD, n: 4 }); }
    }
  },
  palisade(S, rng, len) {
    for (let x = -len / 2; x < len / 2; x += .27) {
      if (rng() < .1) continue;
      const hh = rng.range(1.25, 1.75), lean = [rng.range(-.1, .1), 0, rng.range(-.12, .12)], c = mulC(COL.wood, .65 + .35 * rng()), T = new Soup();
      T.cyl(.12, hh, 0, hh / 2, 0, c, { n: 6, l: L_WOOD }); T.cone(.12, .3, 0, hh + .15, 0, mulC(c, 1.15), { n: 6, l: L_WOOD });
      S.merge(T, { p: [x, -.1, rng.range(-.04, .04)], r: lean, ao: [0, .5, .6] });
    }
    S.box(len, .09, .07, 0, .95, .13, COL.woodD, { l: L_WOOD });
  },
  well(S, rng) {
    for (let k = 0; k < 10; k++) { const a = k / 10 * TAU; S.box(.44, .56, .26, Math.cos(a) * .68, .28, Math.sin(a) * .68, mixC(COL.stoneD, COL.stoneL, rng()), { l: L_MASON, r: [0, -a + HPI, 0] }); }
    S.cyl(.6, .06, 0, .3, 0, COL.black, { n: 10, jit: 0 });
    for (const s of [-1, 1]) S.box(.1, 1.7, .1, s * .72, .85, 0, COL.woodD, { l: L_WOOD });
    S.seg([-.8, 1.45, 0], [.8, 1.45, 0], .05, .05, COL.wood, { l: L_WOOD });
    for (const s of [-1, 1]) S.box(1.75, .05, .62, 0, 1.86, s * .26, COL.slate, { l: L_SLATE, r: [s * .62, 0, 0] });
    S.seg([.15, 1.45, 0], [.15, .75, 0], .012, .012, COL.rope, { n: 3 }); S.cyl(.12, .2, .15, .68, 0, COL.wood, { n: 7, l: L_WOOD, rt: 1.2 });
  },
  wallRun(S, rng, len, hMax) {
    let x = -len / 2, k = 0, h = hMax * rng.range(.5, 1);
    while (x < len / 2) {
      const w = rng.range(.9, 1.4); h = clamp(h + rng.range(-1.1, .7), .5, hMax);
      const edge = Math.min(1, (len / 2 - Math.abs(x + w / 2)) / 1.4 + .25), hh = h * edge, c = mixC(COL.stoneD, COL.stone, rng());
      S.box(w, hh, .62, x + w / 2, hh / 2, 0, c, { l: L_MASON });
      for (let j = 0; j < 3; j++) if (rng() < .6) S.box(w * rng.range(.25, .45), rng.range(.2, .5), .62, x + w * (.2 + j * .3), hh + .15, 0, mixC(COL.stoneD, COL.stoneL, rng()), { l: L_MASON });
      if (hh > 2.2 && rng() < .5) S.box(.3, .8, .7, x + w / 2, hh * .62, 0, COL.black, { jit: 0 });
      if (rng() < .5) S.rock(rng.range(.2, .4), x + rng.range(0, w), .1, rng.sign() * rng.range(.5, .9), mixC(COL.stoneD, COL.stone, rng()));
      x += w; k++;
    }
    S.box(len * .9, .22, .86, 0, .08, 0, COL.stoneD, { l: L_MASON });
  },
  towerRuin(S, rng) {
    const R = 1.35, n = 10, hs = [];
    for (let k = 0; k < n; k++) hs.push(clamp(4.4 - k * .42 + rng.range(-.4, .4), .7, 4.6));
    S.cyl(R + .35, .4, 0, .2, 0, COL.stoneD, { n: 10, l: L_MASON });
    for (let k = 0; k < n; k++) {
      if (k === n - 1) continue;
      const a = k / n * TAU, c = mixC(COL.stoneD, COL.stone, rng());
      S.box(.92, hs[k], .42, Math.cos(a) * R, hs[k] / 2 + .3, Math.sin(a) * R, c, { l: L_MASON, r: [0, -a + HPI, 0] });
      if (rng() < .7) S.box(.4, rng.range(.2, .5), .42, Math.cos(a + .1) * R, hs[k] + .5, Math.sin(a + .1) * R, mixC(COL.stoneD, COL.stoneL, rng()), { l: L_MASON, r: [0, -a + HPI, 0] });
      if (hs[k] > 2.6 && (k & 1)) S.box(.2, .6, .5, Math.cos(a) * R, hs[k] * .65, Math.sin(a) * R, COL.black, { jit: 0, r: [0, -a + HPI, 0] });
    }
    for (let k = 0; k < 3; k++) { const a = rng() * TAU; S.seg([Math.cos(a) * R, 2.1, Math.sin(a) * R], [Math.cos(a + 2.4) * R * .6, 2.0 - rng() * .8, Math.sin(a + 2.4) * R * .6], .07, .06, COL.woodD, { l: L_WOOD, n: 4 }); }
    for (let k = 0; k < 7; k++) { const a = rng() * TAU, d = rng.range(1.9, 3.0); S.box(rng.range(.3, .6), rng.range(.2, .4), rng.range(.3, .5), Math.cos(a) * d, .12, Math.sin(a) * d, mixC(COL.stoneD, COL.stone, rng()), { l: L_MASON, r: [rng() * .5, rng() * 3, rng() * .5] }); }
  },
  signpost(S, rng) {
    S.box(.1, 1.7, .1, 0, .85, 0, COL.woodD, { l: L_WOOD, r: [0, 0, .06] });
    S.box(.8, .2, .05, .28, 1.45, .06, COL.woodL, { l: L_WOOD, r: [0, .2, -.08] }); S.box(.7, .18, .05, -.22, 1.15, .06, COL.wood, { l: L_WOOD, r: [0, -.25, .1] });
  },
  gibbet(S, rng) {
    S.box(.16, 3.0, .16, 0, 1.5, 0, COL.woodD, { l: L_WOOD }); S.box(1.2, .13, .13, .5, 2.9, 0, COL.woodD, { l: L_WOOD }); S.seg([0, 2.2, 0], [.6, 2.85, 0], .05, .05, COL.wood, { l: L_WOOD, n: 4 });
    S.seg([.95, 2.85, 0], [.95, 2.3, 0], .015, .015, COL.iron, { n: 3 });
    for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; S.seg([.95 + Math.cos(a) * .2, 2.3, Math.sin(a) * .2], [.95 + Math.cos(a) * .2, 1.5, Math.sin(a) * .2], .014, .014, COL.iron, { n: 3, l: L_METAL, sway: .12 }); }
    for (const y of [2.3, 1.9, 1.5]) S.add(gTorus(8, .08, 3), { s: .2, p: [.95, y, 0], r: [HPI, 0, 0], c: COL.iron, l: L_METAL, sway: .12 });
    PROP.skull(S, .95, 1.72, 0, .11, 1);
  },
  cairn(S, rng) { let y = 0, r = rng.range(.3, .42); for (let k = 0; k < 4; k++) { S.rock(r, rng.range(-.05, .05), y + r * .45, rng.range(-.05, .05), mixC(COL.stoneD, COL.stoneL, rng()), { sq: .6 }); y += r * .72; r *= .74; } },
  statue(S, rng) {
    const c = COL.stone, m = () => ({ l: L_ROCK });
    S.box(1.1, .6, 1.1, 0, .3, 0, COL.stoneD, { l: L_MASON }); S.box(.9, .15, .9, 0, .67, 0, COL.stoneL, { l: L_MASON });
    for (const s of [-1, 1]) S.box(.2, .75, .22, s * .16, 1.1, 0, c, m());
    S.box(.62, .7, .34, 0, 1.8, 0, c, m()); S.box(.2, .7, .2, -.42, 1.75, .05, c, { l: L_ROCK, r: [.2, 0, .15] });
    S.box(.2, .35, .2, .42, 1.95, 0, c, m()); S.box(.1, 1.3, .08, -.5, 1.25, .2, COL.stoneL, m());
    S.rock(.2, .7, .1, .5, c); S.rock(.16, .5, .08, .75, c);
  },
  tuft(S, rng) {
    const c = mulC(mixC(COL.tuftA, COL.tuftB, rng() * .6), .8 + .5 * rng());
    for (let k = 0; k < rng.int(3, 5); k++) {
      const a = rng() * TAU, l = rng.range(.22, .42), bx = Math.cos(a) * .06, bz = Math.sin(a) * .06, tx = Math.cos(a) * l * .5, tz = Math.sin(a) * l * .5, w = .035;
      const A = [bx - Math.sin(a) * w, 0, bz + Math.cos(a) * w], Bp = [bx + Math.sin(a) * w, 0, bz - Math.cos(a) * w], T = [tx, l, tz];
      for (const [p, sw] of [[A, 0], [Bp, 0], [T, .7], [A, 0], [T, .7], [Bp, 0]]) S.v(p[0], p[1], p[2], 0, 1, 0, c[0], c[1], c[2], 0, 0, L_PLAIN, 1, sw, 0);
    }
  },
};
