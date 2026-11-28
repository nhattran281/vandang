// ===== Vân Đăng · Khung kỹ năng =====
// Logic thuần (GDD 2.6): không THREE, không DOM. Gắn thêm hàm vào Core (cần 34-core.js + 36-combat.js).
// Dữ liệu: data/skills.json. Đơn vị (makeUnit) có u.skills [id], u.res {tàiNguyên: còn}, u.resMax {tàiNguyên: tối đa}.
// Kỹ năng thay cho hành động Đánh: phần chơi gọi Core.useSkill rồi đặt u.done = true như khi đánh.
// Hiệu ứng: 'damage' và 'heal' (tuần 4) chạy thật (dùng Core.fight: công thức + khắc chế 36-combat, 1 đòn, không phản đòn).
// Các loại còn lại (status, push, light, ignite, shield, refresh, buff, debuff) chỉ ghi nhận vào kết quả (applied: false) — làm thật ở tuần 8.
Object.assign(Core, (() => {
  const FOES = { ta: ['dich'], dich: ['ta', 'npc'], npc: ['dich'] };   // giống 36-play.js
  const TARGETS = ['enemy', 'ally', 'tile'];
  const hostile = (a, b) => (FOES[a.side] || []).includes(b.side);
  const dist = (ax, ay, bx, by) => Math.abs(ax - bx) + Math.abs(ay - by);
  const getSkill = (id, data) => { const k = data.skills && data.skills.skills[id]; if (!k) throw new Error('không có kỹ năng ' + id); return k; };

  // Hồi đầy tài nguyên cho mọi đơn vị (đầu trận; loadMap đã tạo đơn vị đầy sẵn, gọi lại khi mang đội sang trận mới).
  function refillResources(S) { for (const u of S.units) u.res = Object.assign({}, u.resMax); }

  // Đủ tài nguyên dùng kỹ năng chưa (không xét mục tiêu).
  function canAfford(u, id, data) {
    const k = getSkill(id, data);
    return (u.skills || []).includes(id) && u.hp > 0 && ((u.res && u.res[k.resource]) | 0) >= k.cost;
  }

  // Ô/đơn vị hợp lệ cho kỹ năng id khi u đứng ở opts.from = [x,y] (mặc định ô hiện tại — AI thử ô khác được).
  // Trả về [{ x, y, unit? }], sắp theo thứ tự đọc (trên→dưới, trái→phải) để tất định.
  // Không xét tài nguyên (menu vẫn liệt kê kỹ năng xám); dùng canAfford để biết có bấm được không.
  function skillTargets(S, u, id, data, opts) {
    const k = getSkill(id, data), [fx, fy] = (opts && opts.from) || [u.x, u.y];
    const [lo, hi] = k.range, out = [];
    for (let y = Math.max(0, fy - hi); y <= Math.min(S.h - 1, fy + hi); y++)
      for (let x = Math.max(0, fx - hi); x <= Math.min(S.w - 1, fx + hi); x++) {
        const d = dist(fx, fy, x, y); if (d < lo || d > hi) continue;
        if (k.target === 'tile') { out.push({ x, y }); continue; }
        // Đơn vị chính mình được tính ở ô xuất phát (trường hợp AI thử ô khác).
        const o = (x === fx && y === fy) ? u : Core.unitAt(S, x, y);
        if (!o || o.hp <= 0 || (o === u && (x !== fx || y !== fy))) continue;
        if (k.target === 'enemy' ? hostile(u, o) : (o === u || !hostile(u, o))) out.push({ x, y, unit: o });
      }
    return out;
  }

  // Điều kiện của một hiệu ứng (khóa "if" trong skills.json).
  function passes(cond, tg, tileT, hit) {
    if (!cond) return true;
    if (cond.onHit && !hit) return false;
    if (cond.vs || cond.vsStatus) {
      if (!tg) return false;
      const tags = tg.tags || [], st = (tg.statuses || []).map(s => typeof s === 'string' ? s : s.id);
      if (!(cond.vs || []).some(t => tags.includes(t)) && !(cond.vsStatus || []).some(s => st.includes(s))) return false;
    }
    if (cond.tileFlag && !(tileT && (tileT.flags || []).includes(cond.tileFlag))) return false;
    return true;
  }

  // Vũ khí tạm dựng từ hiệu ứng damage: loại = dmgType trong weapons.json (lấy magic + khắc chế), tầm = tầm kỹ năng.
  function skillWeapon(k, e, data) {
    const W = data.weapons, ty = W.types[e.dmgType];
    if (!ty) throw new Error(`kỹ năng ${k.name}: dmgType lạ '${e.dmgType}'`);
    return { id: 'skill', name: k.name, type: e.dmgType, rank: 'E', magic: !!ty.magic, mt: e.mt | 0, hit: e.hit | 0, crit: e.crit | 0, wt: 0,
      minRange: k.range[0], maxRange: k.range[1], effective: (ty.effective || []).map(x => Object.assign({ id: x }, W.effectiveness[x])) };
  }
  function withWeapon(u, w, fn) { const o = u.weapon; u.weapon = w; try { return fn(); } finally { u.weapon = o; } }
  // Ngữ cảnh trận cho đòn kỹ năng: 1 đòn, không phản đòn.
  function ctxOf(S, u, tg, data, ctx) {
    return Object.assign({ mode: S.mode || 'casual' }, ctx, { distance: dist(u.x, u.y, tg.x, tg.y), atkTerrain: Core.terrainOf(S, u.x, u.y, data), defTerrain: Core.terrainOf(S, tg.x, tg.y, data), noCounter: true, noDouble: true });
  }

  // Hồi máu (chốt tuần 4, bản tối thiểu): lượng hồi = Phép + mt, không trượt, kẹp HP tối đa. Trả về số HP hồi thực.
  function healAmount(u, id, tg, data) {
    const e = getSkill(id, data).effects.find(f => f.type === 'heal');
    return e && tg && tg.hp > 0 ? Math.max(0, Math.min(tg.stats.hp - tg.hp, ((u.stats.mag | 0) + (e.mt | 0)))) : 0;
  }

  // Dự báo kỹ năng (không đổi trạng thái, cho bảng dự báo/AI). damage: forecast của 36-combat; null nếu kỹ năng không gây sát thương.
  // heal: số HP hồi thực nếu kỹ năng có hồi máu, ngược lại null.
  function skillForecast(S, u, id, x, y, data, ctx) {
    const k = getSkill(id, data), e = k.effects.find(f => f.type === 'damage'), tg = Core.unitAt(S, x, y);
    return { skill: id, cost: k.cost, resource: k.resource, damage: e && tg ? withWeapon(u, skillWeapon(k, e, data), () => Core.forecast(u, tg, ctxOf(S, u, tg, data, ctx))) : null,
      heal: k.effects.some(f => f.type === 'heal') ? healAmount(u, id, tg, data) : null };
  }

  // Dùng kỹ năng id của u lên ô (x,y). ctx: { rng | seed, mode } như Core.fight.
  // Trả về { ok:false, error } nếu không hợp lệ (không trừ tài nguyên),
  // hoặc { ok:true, skill, cost, resource, left, x, y, target, combat, effects:[...] }.
  //   combat: kết quả Core.fight (nhật ký đòn, outcome) nếu có sát thương.
  //   effects: mỗi hiệu ứng { type, ...tham số, target uid, x, y, applied, skipped? } — skipped = điều kiện không khớp.
  function useSkill(S, u, id, x, y, data, ctx) {
    const k = getSkill(id, data);
    if (!(u.skills || []).includes(id)) return { ok: false, error: `${u.name} không có kỹ năng ${k.name}` };
    if (!canAfford(u, id, data)) return { ok: false, error: `không đủ ${data.skills.resources[k.resource].name}` };
    if (!skillTargets(S, u, id, data).some(t => t.x === x && t.y === y)) return { ok: false, error: `ô (${x},${y}) không phải mục tiêu hợp lệ của ${k.name}` };
    u.res[k.resource] -= k.cost;
    const tg = Core.unitAt(S, x, y), tileT = Core.terrainOf(S, x, y, data);
    let combat = null, hit = true;
    const effects = [];
    for (const e of k.effects) {
      const live = !!(data.skills.effects[e.type] || {}).live;
      if (e.type === 'damage') {
        if (!tg) continue;
        combat = withWeapon(u, skillWeapon(k, e, data), () => Core.fight(u, tg, ctxOf(S, u, tg, data, ctx)));
        hit = combat.strikes.some(s => s.hit);
        effects.push({ type: 'damage', target: tg.uid, x, y, applied: true, hit, damage: combat.strikes.reduce((a, s) => a + s.damage, 0) });
        continue;
      }
      if (e.type === 'heal') {
        if (!tg || !passes(e.if, tg, tileT, hit)) continue;
        const amount = healAmount(u, id, tg, data); tg.hp += amount;
        effects.push({ type: 'heal', target: tg.uid, x, y, applied: true, amount, hp: tg.hp });
        continue;
      }
      const rec = Object.assign({}, e, { target: tg ? tg.uid : null, x, y, applied: live }); delete rec.if;
      if (!passes(e.if, tg, tileT, hit) || (tg && tg.hp <= 0 && e.type !== 'ignite' && e.type !== 'light')) { rec.skipped = true; rec.applied = false; }
      effects.push(rec);
    }
    return { ok: true, skill: id, cost: k.cost, resource: k.resource, left: u.res[k.resource], x, y, target: tg ? tg.uid : null, combat, effects };
  }

  // Kiểm tra skills.json + kỹ năng/tài nguyên của các mẫu đơn vị. Trả về mảng lỗi.
  function validateSkills(data) {
    const errs = [], K = data.skills;
    if (!K) return ['thiếu data/skills.json'];
    const cap = K.rangeCap || 4;
    for (const id in K.skills) {
      const k = K.skills[id], p = `kỹ năng ${id}`;
      if (!K.resources[k.resource]) errs.push(`${p}: tài nguyên lạ '${k.resource}'`);
      if (!(Number.isInteger(k.cost) && k.cost > 0)) errs.push(`${p}: cost phải là số nguyên > 0`);
      if (!TARGETS.includes(k.target)) errs.push(`${p}: target phải là ${TARGETS.join('/')}`);
      if (!Array.isArray(k.range) || k.range[0] < 0 || k.range[1] < k.range[0]) errs.push(`${p}: range phải là [min, max] với 0 ≤ min ≤ max`);
      else if (k.range[1] > cap) errs.push(`${p}: tầm ${k.range[1]} vượt giới hạn ${cap} (≈ 1/3 cạnh map)`);
      if (k.target === 'enemy' && k.range && k.range[0] < 1) errs.push(`${p}: kỹ năng nhắm địch cần range min ≥ 1`);
      if (!Array.isArray(k.effects) || !k.effects.length) errs.push(`${p}: thiếu effects`);
      for (const e of k.effects || []) {
        if (!K.effects[e.type]) errs.push(`${p}: loại hiệu ứng lạ '${e.type}'`);
        if (e.type === 'heal' && k.target !== 'ally') errs.push(`${p}: heal cần target ally`);
        if (e.type === 'damage' && (k.target !== 'enemy' || !data.weapons || !data.weapons.types[e.dmgType])) errs.push(`${p}: damage cần target enemy và dmgType là loại vũ khí`);
        if (e.type === 'status' && !Core.STATUS_IDS.includes(e.id)) errs.push(`${p}: trạng thái lạ '${e.id}'`);
        if (e.chance !== undefined && !(e.chance >= 0 && e.chance <= 100)) errs.push(`${p}: chance phải là 0–100`);
        if ((e.type === 'buff' || e.type === 'debuff') && !(['hit', 'avo', 'crit'].includes(e.stat) || Core.STAT_KEYS.includes(e.stat))) errs.push(`${p}: ${e.type} cần stat là chỉ số hoặc hit/avo/crit`);
      }
    }
    for (const t in data.units.templates) {
      const tpl = data.units.templates[t];
      for (const r in tpl.resources || {}) if (!K.resources[r]) errs.push(`mẫu ${t}: tài nguyên lạ '${r}'`);
      for (const id of tpl.skills || []) {
        const k = K.skills[id];
        if (!k) { errs.push(`mẫu ${t}: không có kỹ năng '${id}'`); continue; }
        if (!((tpl.resources || {})[k.resource] >= k.cost)) errs.push(`mẫu ${t}: thiếu tài nguyên '${k.resource}' đủ dùng ${id}`);
      }
    }
    return errs;
  }

  return { refillResources, canAfford, skillTargets, healAmount, skillForecast, useSkill, validateSkills };
})());
