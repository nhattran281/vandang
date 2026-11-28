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

function drawUnits(S, t, P) {
  UNITS.torch.length = 0;
  const I = KIT.item, bv = Play.battleView(P);
  for (const v of UNITS.views) {
    const u = v.u, look = v.look;
    // Trong lúc phát lại trận, quân đã về 0 HP vẫn đứng cho tới khi tới đoạn rút lui.
    const inFight = bv && (bv.a === u || bv.d === u), ko = inFight && bv.ko && bv.ko.uid === u.uid ? bv.ko.k : 0;
    if ((u.hp <= 0 && !inFight) || ko >= 1) { if (v.flame) v.flame.on = 0; if (v.light) v.light.alive = false; continue; }
    // Đang đi: nội suy giữa hai ô, nảy nhẹ khi đổi bậc; quay mặt theo hướng bước.
    const a = Play.animPos(P, u), picked = !a && P.mode === 'chon' && P.unit === u;
    if (a) {
      const p0 = tileWorld(S, a.from[0], a.from[1]), p1 = tileWorld(S, a.to[0], a.to[1]);
      const y0 = standY(S, a.from[0], a.from[1]), y1 = standY(S, a.to[0], a.to[1]);
      v.x = lerp(p0.x, p1.x, a.k); v.z = lerp(p0.z, p1.z, a.k);
      v.y = lerp(y0, y1, a.k) + Math.sin(a.k * PI) * (.12 + Math.abs(y1 - y0) * .6);
      v.yaw = Math.atan2(a.dx, a.dy);
    } else { const p = tileWorld(S, u.x, u.y); v.x = p.x; v.z = p.z; v.y = standY(S, u.x, u.y) + (picked ? .12 + .08 * Math.sin(t * 6) : 0); }
    // Đánh: quay mặt vào đối thủ, vung vũ khí (rig.atk), bên bị trúng giật lùi + chớp; rút lui = chìm xuống và mờ dần.
    let atk = -1, flinch = 0, flash = 0;
    if (inFight) {
      const o = bv.a === u ? bv.d : bv.a; v.yaw = Math.atan2(o.x - u.x, o.y - u.y);
      const c = bv.cur;
      if (c && c.s.from === u.uid) atk = c.atk;
      if (c && c.s.to === u.uid && c.impact && c.s.hit) { const q = Math.max(0, 1 - (c.k - Play.IMPACT) / .3); flinch = q; flash = c.s.crit ? q : q * .5; }
      v.y -= ko * 1.6;
    }
    // Đã đi: tối và lạnh màu đi (kiểu FE: quân xám = hết lượt).
    let tint = look.tint || null;
    if (u.done && !a && !inFight) tint = tint ? [tint[0] * .45, tint[1] * .45, tint[2] * .5] : [.45, .45, .5];
    if (ko) { const f = 1 - ko * .8; tint = tint ? tint.map(c => c * f) : [f, f, f]; }
    const breath = Math.sin(t * 1.8 + v.seed) * .04;
    const e = {
      x: v.x, y: v.y, z: v.z, yaw: v.yaw + Math.sin(t * .4 + v.seed) * .08, mv: a ? 1 : picked ? .25 : 0, ph: t * (a ? 9 : 4) + v.seed, atk, flinch, flash,
      scale: (look.scale || 1) * 1.8, tint,
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
