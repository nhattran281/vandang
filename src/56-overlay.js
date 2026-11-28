// ===== Vân Đăng · Lớp tô ô: vùng đi được + đường đi =====
// Chỉ đọc trạng thái Play (36-play); dựng lại hình khi P.ver đổi.
// Màu:  ô dừng được = xanh lam đèn · ô chỉ đi qua (có quân ta / có rương khi quân bay) = tím nhạt
//       đường đi = vàng đèn lồng, ô đích sáng hơn.
//       chọn mục tiêu: tầm đánh = đỏ nhạt · địch trong tầm = đỏ · mục tiêu đang xem dự báo = đỏ sáng
//       ô đích của chương (reach / area, tuần 5 mục 4) = vàng nhạt, luôn hiện
const OVL = {
  COL: { stop: [.24, .55, 1, .42], pass: [.66, .5, .9, .34], dest: [.45, .75, 1, .62], path: [1, .82, .45, .95],
    reach: [1, .3, .2, .2], foe: [1, .28, .18, .55], aim: [1, .45, .3, .85], goal: [1, .78, .3, .38] },
  mesh: null, ver: -1,
};

function initOverlay() {
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  OVL.mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat); OVL.mesh.renderOrder = 3; OVL.mesh.frustumCulled = false; OVL.mesh.visible = false;
  R.scene.add(OVL.mesh);
}

// Cao độ đặt lớp tô: trên mặt ô, nhưng không chìm dưới mặt nước.
function ovlY(S, x, y) { const t = Core.tile(S, x, y); return (t && '~WB'.includes(t.c) ? Math.max(standY(S, x, y), WATER_Y) : standY(S, x, y)) + .06; }

function buildOverlay(P) {
  const S = P.S, pos = [], col = [];
  const quad = (a, b, c, d, rgba) => { for (const p of [a, b, c, a, c, d]) { pos.push(p[0], p[1], p[2]); col.push(rgba[0], rgba[1], rgba[2], rgba[3]); } };
  const sq = (x, y, c, k) => { const w = tileWorld(S, x, y), yy = ovlY(S, x, y), h = TS / 2 * (k || .9); quad([w.x - h, yy, w.z - h], [w.x - h, yy, w.z + h], [w.x + h, yy, w.z + h], [w.x + h, yy, w.z - h], c); };
  if (P.mode === 'muctieu' && P.unit) {
    // Tầm đánh: của món đang xem khi đã chọn mục tiêu; chưa chọn thì gộp tầm mọi vũ khí dùng được trong túi.
    const u = P.unit, ws = P.foe && P.wpn ? [P.wpn] : Play.usableWeapons(u);
    const lo = Math.min(...ws.map(w => w.minRange)), hi = Math.max(...ws.map(w => w.maxRange));
    for (let y = 0; y < S.h; y++) for (let x = 0; x < S.w; x++) {
      const d = Math.abs(x - u.x) + Math.abs(y - u.y); if (d < lo || d > hi || !ws.some(w => d >= w.minRange && d <= w.maxRange)) continue;
      const o = Core.unitAt(S, x, y), foe = o && P.targets.includes(o);
      sq(x, y, foe ? (o === P.foe ? OVL.COL.aim : OVL.COL.foe) : OVL.COL.reach);
    }
  }
  // Ô đích của chương: reach (tiles hoặc exits) / area (rect hoặc tiles). Vẽ nhỏ hơn để vùng đi được vẫn đọc rõ khi chồng lên.
  if (S.goal && !P.over) for (const c of S.goal.win) {
    if (c.type === 'reach' || (c.type === 'area' && !c.rect)) for (const [x, y] of Core.goalTiles(S, c)) sq(x, y, OVL.COL.goal, .62);
    if (c.type === 'area' && c.rect) for (let y = c.rect[1]; y <= c.rect[3]; y++) for (let x = c.rect[0]; x <= c.rect[2]; x++) sq(x, y, OVL.COL.goal, .62);
  }
  const R0 = P.mode === 'chon' ? P.R : null;
  if (R0) {
    const stops = new Set(R0.stops), h = TS / 2 * .9;
    for (const i of R0.cost.keys()) {
      const x = i % S.w, y = (i / S.w) | 0, w = tileWorld(S, x, y), yy = ovlY(S, x, y);
      const dest = P.target && P.target.x === x && P.target.y === y;
      const c = dest ? OVL.COL.dest : stops.has(i) ? OVL.COL.stop : OVL.COL.pass;
      quad([w.x - h, yy, w.z - h], [w.x - h, yy, w.z + h], [w.x + h, yy, w.z + h], [w.x + h, yy, w.z - h], c);
    }
  }
  if (R0 && P.path && P.path.length > 1) {
    const c = OVL.COL.path, r = .2, pts = P.path.map(([x, y]) => { const w = tileWorld(S, x, y); return [w.x, ovlY(S, x, y) + .02, w.z]; });
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], dx = b[0] - a[0], dz = b[2] - a[2], L = Math.hypot(dx, dz), nx = -dz / L * r, nz = dx / L * r;
      // đoạn đường: dải phẳng; đi lên/xuống bậc thì nối theo hai cao độ
      quad([a[0] + nx, a[1], a[2] + nz], [b[0] + nx, b[1], b[2] + nz], [b[0] - nx, b[1], b[2] - nz], [a[0] - nx, a[1], a[2] - nz], c);
      quad([a[0] - r, a[1], a[2] - r], [a[0] - r, a[1], a[2] + r], [a[0] + r, a[1], a[2] + r], [a[0] + r, a[1], a[2] - r], c); // khớp nối
    }
    // mũi tên ở ô đích
    const e = pts[pts.length - 1], p = pts[pts.length - 2], dx = e[0] - p[0], dz = e[2] - p[2], L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L, s = .55;
    const tip = [e[0] + ux * s, e[1], e[2] + uz * s], l = [e[0] - ux * s * .3 - uz * s, e[1], e[2] - uz * s * .3 + ux * s], rr = [e[0] - ux * s * .3 + uz * s, e[1], e[2] - uz * s * .3 - ux * s];
    for (const q of [tip, l, rr]) { pos.push(q[0], q[1], q[2]); col.push(c[0], c[1], c[2], c[3]); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  OVL.mesh.geometry.dispose(); OVL.mesh.geometry = g; OVL.mesh.visible = pos.length > 0;
}

function updateOverlay(P, t) {
  if (!OVL.mesh) return;
  if (P.ver !== OVL.ver) { OVL.ver = P.ver; buildOverlay(P); }
  OVL.mesh.material.opacity = .85 + .15 * Math.sin(t * 3);
}
