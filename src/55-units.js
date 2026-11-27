// ===== Vân Đăng · Vẽ đơn vị =====
// Dựng nhân vật bằng rig người của Cinderwatch (50-rig). Màu, vũ khí, phụ kiện đọc từ "look" trong data/units.json.
// Hình dáng hiện là tạm (người lính chung); dựng nhân vật riêng ở tuần 7.
const UNITS = { views: [], torch: [] };

function initUnitViews(S) {
  UNITS.views.length = 0;
  for (const u of S.units) {
    const look = (DATA.units.templates[u.tpl] || {}).look || {};
    const v = { u, look, seed: u.uid * 1.7, yaw: u.side === 'dich' ? 0 : PI, x: 0, y: 0, z: 0, flame: null, light: null };
    if (look.lantern) {
      v.flame = addFlame({ x: 0, y: 0, z: 0, size: .16, r: .35, g: .75, b: 1.8, embers: .4, glow: .7 });
      v.light = { lI: 9, lx: 0, ly: 0, lz: 0, lCol: 0x5aa8ff, lseed: u.uid, alive: true };
    } else if (look.torch) {
      v.flame = addFlame({ x: 0, y: 0, z: 0, size: .14, embers: .5, glow: .6 });
      v.light = { lI: 6, lx: 0, ly: 0, lz: 0, lCol: 0xff9a50, lseed: u.uid, alive: true };
    }
    UNITS.views.push(v);
  }
}

function drawUnits(S, t, sel) {
  UNITS.torch.length = 0;
  const I = KIT.item;
  for (const v of UNITS.views) {
    const u = v.u, look = v.look;
    if (u.hp <= 0) { if (v.flame) v.flame.on = 0; if (v.light) v.light.alive = false; continue; }
    const p = tileWorld(S, u.x, u.y), picked = sel && sel.x === u.x && sel.y === u.y;
    v.x = p.x; v.z = p.z; v.y = standY(S, u.x, u.y) + (picked ? .12 + .08 * Math.sin(t * 6) : 0);
    const breath = Math.sin(t * 1.8 + v.seed) * .04;
    const e = {
      x: v.x, y: v.y, z: v.z, yaw: v.yaw + Math.sin(t * .4 + v.seed) * .08, mv: picked ? .25 : 0, ph: t * 4 + v.seed, atk: -1, flinch: 0,
      scale: (look.scale || 1) * 1.8, tint: look.tint || null,
      weapon: look.weapon ? I[look.weapon] : null, wScale: look.weapon === 'greatsword' ? .8 : 1,
      shield: look.shield ? I[look.shield] : null, helm: !!look.helm, plate: !!look.plate, robe: !!look.robe, hood: !!look.hood,
      torch: !!(look.torch || look.lantern), stoop: breath,
    };
    rigHuman(KIT.foot, SPEC.foot, e);
    if (v.flame) {
      const q = RIGOUT.torch; v.flame.x = q.x; v.flame.y = q.y; v.flame.z = q.z; v.flame.on = 1;
      v.light.lx = q.x; v.light.ly = q.y + .3; v.light.lz = q.z; v.light.alive = true; UNITS.torch.push(v.light);
    }
  }
}
