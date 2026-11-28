// ===== Vân Đăng · Vẽ đơn vị =====
// Dựng nhân vật bằng bộ phận có sẵn của Cinderwatch (50-rig người, 51-bestiary quái). Rig, màu, vũ khí, phụ kiện
// đọc từ "look" trong data/units.json (xem units.json → _look). Hình dáng hiện là tạm; dựng nhân vật riêng ở tuần 7.
const UNITS = { views: [], torch: [] };
// look.rig → hàm vẽ. Rig người dùng chung rigHuman với bộ phận theo kiểu (giữ khớp với Core.LOOK_RIGS ở 34-core.js).
const HUMAN_RIGS = ['foot', 'ogre', 'skel', 'golem'];
const BEAST_RIGS = { wraith: e => rigWraith(e), wolf: e => rigWolf(e), toad: e => rigToad(e), wisp: e => rigWisp(e), spider: e => rigSpider(e), bat: e => rigBat(e), rat: e => rigRat(e), slime: e => rigSlime(e) };
// Cờ bộ phận/dáng của rig người lấy thẳng từ look.
const LOOK_FLAGS = ['helm', 'plate', 'robe', 'hood', 'bow', 'drum', 'wraps', 'crown', 'keg', 'standard', 'shamble', 'claw', 'heavy'];

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
  const I = KIT.item, bv = Anim.battle(P);   // I: vũ khí / khiên theo tên trong look; bv: trận đang phát (GSAP Timeline, 54-anim)
  for (const v of UNITS.views) {
    const u = v.u, look = v.look;
    // Trong lúc phát lại trận, quân đã về 0 HP vẫn đứng cho tới khi tới đoạn rút lui.
    const inFight = bv && (bv.a === u || bv.d === u), ko = inFight && bv.ko && bv.ko.uid === u.uid ? bv.ko.k : 0;
    if ((u.hp <= 0 && !inFight) || ko >= 1) { if (v.flame) v.flame.on = 0; if (v.light) v.light.alive = false; continue; }
    // Đang đi: tư thế do Timeline đi (54-anim) tính — giữa hai ô, nảy nhẹ khi đổi bậc, quay mặt theo hướng bước.
    const a = Anim.walk(P, u), picked = !a && P.mode === 'chon' && P.unit === u;
    if (a) { v.x = a.x; v.z = a.z; v.y = a.y; v.yaw = a.yaw; }
    else { const p = tileWorld(S, u.x, u.y); v.x = p.x; v.z = p.z; v.y = standY(S, u.x, u.y) + (picked ? .12 + .08 * Math.sin(t * 6) : 0); }
    // Đánh (Timeline trận, 54-anim): quay mặt vào đối thủ, lao tới + vung vũ khí (rig.atk) rồi lùi về; bên bị trúng giật lùi + chớp,
    // trượt thì né sang bên; rút lui = chìm xuống và mờ dần. Đánh gần lao ~1/3 ô, đánh xa chỉ nhích ~1/8 ô.
    let atk = -1, flinch = 0, flash = 0;
    if (inFight) {
      const o = bv.a === u ? bv.d : bv.a, q = bv.U[u.uid]; v.yaw = Math.atan2(o.x - u.x, o.y - u.y);
      const po = tileWorld(S, o.x, o.y), dx = po.x - v.x, dz = po.z - v.z, len = Math.hypot(dx, dz) || 1, n = Math.abs(o.x - u.x) + Math.abs(o.y - u.y);
      const reach = q.lunge * (n <= 1 ? .34 : .12) * len / Math.max(1, n), side = q.dodge * .22 * len / Math.max(1, n);
      v.x += dx / len * (reach - side * .4) + dz / len * side; v.z += dz / len * (reach - side * .4) - dx / len * side;
      atk = q.atk; flinch = q.flinch; flash = q.flash;
      v.y -= ko * 1.6;
    }
    // Đã đi: tối và lạnh màu đi (kiểu FE: quân xám = hết lượt).
    let tint = look.tint || null;
    if (u.done && !a && !inFight) tint = tint ? [tint[0] * .45, tint[1] * .45, tint[2] * .5] : [.45, .45, .5];
    if (ko) { const f = 1 - ko * .8; tint = tint ? tint.map(c => c * f) : [f, f, f]; }
    const breath = Math.sin(t * 1.8 + v.seed) * .04;
    const e = {
      x: v.x, y: v.y, z: v.z, yaw: v.yaw + Math.sin(t * .4 + v.seed) * .08, mv: a ? 1 : picked ? .25 : 0, ph: t * (a ? 9 : 4) + v.seed, atk, flinch, flash,
      scale: (look.scale || 1) * 1.8, tint, lseed: v.seed,
      weapon: look.weapon ? I[look.weapon] : null, wScale: look.weapon === 'greatsword' ? .8 : 1,
      shield: look.shield ? I[look.shield] : null,
      torch: !!(look.torch || look.lantern), stoop: breath,
    };
    for (const f of LOOK_FLAGS) e[f] = !!look[f];
    if (look.staff) e.staff = true;
    const rig = look.rig || 'foot';
    if (BEAST_RIGS[rig]) { if (atk >= 0) e.flinch = -Math.sin(atk * PI) * .6; BEAST_RIGS[rig](e); }   // quái không có dáng vung: chồm tới thay cho đòn
    else { const k = HUMAN_RIGS.includes(rig) ? rig : 'foot'; rigHuman(KIT[k], SPEC[k], e); }
    if (v.flame && !BEAST_RIGS[rig]) {
      const q = RIGOUT.torch; v.flame.x = q.x; v.flame.y = q.y; v.flame.z = q.z; v.flame.on = 1;
      v.light.lx = q.x; v.light.ly = q.y + .3; v.light.lz = q.z; v.light.alive = true; UNITS.torch.push(v.light);
    }
  }
}
