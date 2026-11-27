// ===== Vân Đăng · Vẽ bàn cờ ô vuông =====
// Dựng bàn cờ 3D từ trạng thái map của Core, bằng Soup / vật liệu / ánh sáng của Cinderwatch.
// Chỉ đọc trạng thái, không sửa logic.
const BH = 18;               // nửa cạnh vùng chơi (Cinderwatch dùng cho camera và DOF)
const TS = 2;                // cạnh một ô, đơn vị thế giới
const HS = .7;               // chiều cao một bậc độ cao
const WATER_Y = -.14;        // mặt nước

function tileWorld(S, x, y) { return { x: (x - (S.w - 1) / 2) * TS, z: (y - (S.h - 1) / 2) * TS }; }
function worldTile(S, wx, wz) { return { x: Math.round(wx / TS + (S.w - 1) / 2), y: Math.round(wz / TS + (S.h - 1) / 2) }; }

// Cao độ mặt ô nơi quân đứng
function standY(S, x, y) {
  const t = Core.tile(S, x, y); if (!t) return 0;
  const g = t.h * HS;
  switch (t.c) {
    case '~': return -.3;
    case 'W': return WATER_Y;
    case 'S': return g - .12;
    case 'B': return .26;
    case 'T': return g + .3;
    case 'P': return g + .24;
    default: return g;
  }
}

function buildGridBoard(S, seed) {
  const bio = BIOMES.find(b => b.key === S.biome) || BIOMES[0]; applyBiomePalette(bio);
  soupRng = makeRng(seed * 131 + 5); const rng = makeRng(seed * 9176 + 11);
  const land = new Soup(), water = new Soup(), fires = [], env = [];
  let beacon = null;
  const waterV = (W, x, y, z, u, w) => W.v(x, y, z, 0, 1, 0, 1, 1, 1, u, w, 0, .16, 0, 0);
  const waterQuad = (cx, cz, half) => { const a = [cx - half, cz - half], b = [cx + half, cz - half], c = [cx + half, cz + half], d = [cx - half, cz + half]; for (const p of [a, d, c, a, c, b]) waterV(water, p[0], WATER_Y, p[1], p[0] * .8, p[1] * .8); };
  const jc = (c, k = .12) => mulC(c, 1 - k + 2 * k * rng());
  const block = (cx, cz, top, col, layer, half = TS / 2) => { const bot = -2.6, h = top - bot; land.box(half * 2, h, half * 2, cx, bot + h / 2, cz, col, { l: layer, jit: .015 }); };
  const tree = (x, y, z, s) => {
    land.cyl(.09 * s, .9 * s, x, y + .45 * s, z, COL.bark, { n: 5, l: L_WOOD });
    land.cone(.62 * s, 1.1 * s, x, y + 1.1 * s, z, jc(COL.leaf, .15), { n: 7, l: L_PLAIN, rough: .9 });
    land.cone(.45 * s, .85 * s, x, y + 1.6 * s, z, jc(COL.leafL, .15), { n: 7, l: L_PLAIN, rough: .9 });
  };
  const minNb = (x, y) => { let m = 9; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = Core.tile(S, x + dx, y + dy); if (n && n.h < m) m = n.h; } return m; };

  for (const t of S.tiles) {
    const { x: cx, z: cz } = tileWorld(S, t.x, t.y), g = t.h * HS;
    switch (t.c) {
      case '.': block(cx, cz, g, jc(mixC(COL.grass, COL.earth, .25 * rng())), L_DIRT);
        for (let k = 0; k < 3; k++) land.box(.06, .12, .06, cx + rr(-.8, .8), g + .06, cz + rr(-.8, .8), COL.tuftA, { l: L_PLAIN }); break;
      case '=': block(cx, cz, g - .04, jc(COL.road, .08), L_COBBLE); break;
      case 'F': block(cx, cz, g, jc(COL.grassD), L_DIRT);
        for (const [ox, oz] of [[-.45, -.4], [.5, -.15], [-.1, .5]]) tree(cx + ox + rr(-.12, .12), g, cz + oz + rr(-.12, .12), rr(.85, 1.1)); break;
      case 'M': block(cx, cz, g, jc(COL.stoneD), L_ROCK);
        land.rock(.75, cx - .2, g + .2, cz - .1, jc(COL.stone), { sq: .9 }); land.rock(.5, cx + .5, g + .1, cz + .45, jc(COL.stoneD), {}); land.rock(.35, cx - .55, g + .05, cz + .55, jc(COL.stone), {}); break;
      case '~': block(cx, cz, -.42, jc(COL.mud), L_DIRT); waterQuad(cx, cz, TS / 2); break;
      case 'W': block(cx, cz, -1.3, mulC(COL.mud, .6), L_DIRT); waterQuad(cx, cz, TS / 2); break;
      case 'B': block(cx, cz, -1.3, mulC(COL.mud, .6), L_DIRT); waterQuad(cx, cz, TS / 2);
        for (let k = 0; k < 6; k++) land.box(TS * .78, .08, .3, cx, .18, cz - .83 + k * .33, jc(COL.wood, .18), { l: L_WOOD });
        for (const sx of [-1, 1]) { land.box(.07, .07, TS, cx + sx * .8, .55, cz, COL.woodD, { l: L_WOOD }); for (const sz of [-.8, 0, .8]) land.box(.1, 1.6, .1, cx + sx * .8, -.25, cz + sz, COL.woodD, { l: L_WOOD }); } break;
      case 'S': block(cx, cz, g - .14, jc(mulC(COL.mud, .9)), L_DIRT);
        for (let k = 0; k < 5; k++) land.box(.04, rr(.3, .6), .04, cx + rr(-.85, .85), g, cz + rr(-.85, .85), COL.tuftB, { l: L_PLAIN, r: [rr(-.2, .2), 0, rr(-.2, .2)] }); break;
      case 'T': {
        block(cx, cz, g + .3, jc(COL.stoneD), L_MASON);
        const y0 = g + .3; land.cyl(.62, 1.4, cx, y0 + .7, cz, COL.stone, { n: 8, l: L_MASON, rt: .82 });
        land.cyl(.5, 1.2, cx, y0 + 2.0, cz, COL.stoneL, { n: 8, l: L_MASON, rt: .85 });
        for (let k = 0; k < 4; k++) { const a = k * HPI + PI / 4; land.box(.1, .55, .1, cx + Math.cos(a) * .42, y0 + 2.85, cz + Math.sin(a) * .42, COL.woodD, { l: L_WOOD }); }
        land.cone(.72, .6, cx, y0 + 3.4, cz, COL.slate, { n: 4, l: L_SLATE, r: [0, PI / 4, 0] });
        land.cyl(.28, .12, cx, y0 + 2.62, cz, COL.iron, { n: 8, l: L_METAL });
        const f = { x: cx, y: y0 + 2.78, z: cz, size: .55 }; fires.push(f); if (!beacon) beacon = { x: cx, y: y0 + 2.9, z: cz };
        break;
      }
      case 'P': {
        block(cx, cz, g + .24, jc(COL.stone), L_MASON); const y0 = g + .24;
        for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) land.box(.13, 1.1, .13, cx + sx * .55, y0 + .55, cz + sz * .55, COL.clothR, { l: L_WOOD });
        land.cone(1.05, .7, cx, y0 + 1.42, cz, COL.thatch, { n: 4, l: L_THATCH, r: [0, PI / 4, 0] });
        land.box(.5, .35, .3, cx, y0 + .17, cz - .3, COL.woodD, { l: L_WOOD });
        fires.push({ x: cx, y: y0 + .42, z: cz - .3, size: .14 });
        env.push({ x: cx, y: y0 + .8, z: cz - .2, c: 0xff8a3a, d: 6, I: 6, flick: true });
        break;
      }
      case '#': block(cx, cz, g + 1.5, jc(COL.stoneD, .08), L_MASON);
        for (const [sx, sz] of [[-1, -1], [1, 1]]) land.box(.6, .3, .6, cx + sx * .5, g + 1.65, cz + sz * .5, COL.stone, { l: L_MASON }); break;
      case '^': {
        const lo = Math.min(t.h, minNb(t.x, t.y)) * HS; block(cx, cz, lo, jc(COL.earth), L_DIRT);
        const n = 3; for (let k = 0; k < n; k++) { const top = lerp(lo, g, (k + 1) / n), d = TS * (n - k) / n; land.box(TS, top - lo + .01, d, cx, lo + (top - lo) / 2, cz + TS / 2 - d / 2, jc(COL.stoneD, .06), { l: L_MASON }); }
        break;
      }
      default: block(cx, cz, g, COL.earth, L_DIRT);
    }
  }
  for (const k of S.chests) {
    const { x, z } = tileWorld(S, k.x, k.y), y = standY(S, k.x, k.y);
    land.box(.7, .42, .48, x, y + .21, z, COL.wood, { l: L_WOOD }); land.box(.74, .08, .52, x, y + .4, z, COL.woodD, { l: L_WOOD });
    for (const sx of [-.22, .22]) land.box(.06, .46, .52, x + sx, y + .23, z, COL.brass, { l: L_METAL, emis: .02 });
  }
  // nền đá dưới bàn cờ
  land.box(S.w * TS + .4, 1.2, S.h * TS + .4, 0, -3.2, 0, mulC(COL.basalt, .8), { l: L_ROCK });

  const group = new THREE.Group();
  const mesh = new THREE.Mesh(land.build(), MAT.world); mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh);
  if (water.verts) { const wm = new THREE.Mesh(water.build(), MAT.water); wm.receiveShadow = true; group.add(wm); }
  group.add(buildGridLines(S));

  const B = {
    S, bio, group, fires, env, beacon: beacon || { x: 0, y: 6, z: 0 }, mirrored: false,
    heightAt(wx, wz) { const p = worldTile(S, wx, wz), t = Core.tile(S, p.x, p.y); if (!t) return -2.6; return '~WB'.includes(t.c) ? WATER_Y : standY(S, p.x, p.y); },
  };
  return B;
}

// Lưới ô mờ trên mặt đất: giúp đọc ô khi chơi chiến thuật
function buildGridLines(S) {
  const P = [], e = .02, half = TS / 2;
  for (const t of S.tiles) {
    if (t.c === '#') continue;
    const { x, z } = tileWorld(S, t.x, t.y), y = standY(S, t.x, t.y) + e;
    const a = [x - half, y, z - half], b = [x + half, y, z - half], c = [x + half, y, z + half], d = [x - half, y, z + half];
    P.push(...a, ...b, ...b, ...c, ...c, ...d, ...d, ...a);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  const m = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: .09, depthWrite: false }));
  m.renderOrder = 3; return m;
}

function activateGridBoard(B) {
  B.flames = [];
  for (const f of B.fires) B.flames.push(addFlame({ x: f.x, y: f.y, z: f.z, size: f.size, embers: .6, glow: .9, smoke: f.size > .3 ? 2 : 0, on: 1 }));
  LT.beaconPos = B.beacon; LT.beaconOn = 1; LT.beaconLevel = 1; LT.beaconMul = (B.bio.beacon || 1) * .08;
  LT.envSrc = B.env.slice(0, LT.env.length); LT.envK = 1;
  setBiomeLook(B, true);
  FX.groundAt = B.heightAt;
}

// Ô đánh dấu (con trỏ chọn ô)
function makeTileCursor() {
  const g = new THREE.RingGeometry(.72, .92, 4, 1, PI / 4); g.rotateX(-HPI);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xffc860, transparent: true, opacity: .85, depthWrite: false }));
  m.scale.setScalar(TS / 1.3); m.renderOrder = 4; m.visible = false; R.scene.add(m); return m;
}
