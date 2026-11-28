// ===== Vân Đăng · Lên cấp, EXP, hạng vũ khí =====
// Logic thuần (GDD 5.1, 2.5; chốt tuần 5): không THREE, không DOM. Gắn thêm hàm vào Core (cần 34-core.js; dùng kết quả của 36-combat / 37-skills).
// Chỉ phe ta nhận EXP và điểm vũ khí; địch không lên cấp giữa trận. Đơn vị đã ngã (hp 0) không nhận gì.
// Mọi lần quay growth dùng RNG có seed của trận (ctx.rng) → phát lại được.
//
// Kết quả trao thưởng (growth log), phần vẽ đọc để hiện thanh EXP + bảng "Lên cấp":
//   { exp:    [{ uid, name, gained, from, exp, lv }],                       // EXP nhận được (from = EXP trước khi cộng)
//     levels: [{ uid, name, from, to, gains:{hp:1,...}, stats:{...} }],    // mỗi lần lên cấp; gains chỉ ghi chỉ số tăng
//     ranks:  [{ uid, name, type, from, to, wexp }] }                      // tăng hạng vũ khí
Object.assign(Core, (() => {
  const PER_LV = data => (data.classes && data.classes.expPerLevel) || 100;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const empty = () => ({ exp: [], levels: [], ranks: [] });
  const any = g => !!(g && (g.exp.length || g.levels.length || g.ranks.length));
  const learner = u => !!u && u.side === 'ta' && u.hp > 0;

  // ----- Công thức EXP (GDD 5.1) -----
  // Đánh trúng: max(1, (31 + cấp địch − cấp ta) / 3), chia làm tròn xuống.
  const hitExp = (u, foe) => Math.max(1, Math.floor((31 + foe.lv - u.lv) / 3));
  // Hạ gục: EXP đánh trúng + (cấp địch − cấp ta)×3 + 20 (+40 nếu boss), kẹp 1–100.
  const killExp = (u, foe) => clamp(hitExp(u, foe) + (foe.lv - u.lv) * 3 + 20 + (foe.boss ? 40 : 0), 1, 100);

  // Quay growth cho một lần lên cấp: mỗi chỉ số +floor(g/100) chắc chắn, phần dư quay 1 số 0–99 (chỉ quay khi phần dư > 0).
  function rollGains(u, rng) {
    const gains = {};
    for (const k of Core.STAT_KEYS) {
      const g = (u.growth && u.growth[k]) | 0; if (g <= 0) continue;
      const n = Math.floor(g / 100) + (g % 100 && Math.floor(rng() * 100) < g % 100 ? 1 : 0);
      if (n) gains[k] = n;
    }
    return gains;
  }

  // Cộng EXP cho u (phe ta, còn sống). 100 EXP = lên cấp; tới cấp tối đa thì EXP về 0 và không nhận thêm.
  function gainExp(u, amount, data, rng, out) {
    out = out || empty();
    const ML = Core.maxLv(data), per = PER_LV(data);
    if (!learner(u) || amount <= 0 || u.lv >= ML) return out;
    const from = u.exp | 0; u.exp = from + amount;
    out.exp.push({ uid: u.uid, name: u.name, gained: amount, from, exp: u.exp, lv: u.lv });
    while (u.exp >= per && u.lv < ML) {
      u.exp -= per; const gains = rollGains(u, rng), lv0 = u.lv; u.lv++;
      for (const k in gains) u.stats[k] += gains[k];
      if (gains.hp) u.hp += gains.hp;                    // HP hiện tại tăng theo HP tối đa
      out.levels.push({ uid: u.uid, name: u.name, from: lv0, to: u.lv, gains, stats: Object.assign({}, u.stats) });
    }
    if (u.lv >= ML) u.exp = 0;
    const last = out.exp[out.exp.length - 1]; last.exp = u.exp; last.lv = u.lv;
    return out;
  }

  // Cộng điểm kinh nghiệm vũ khí loại `type` (GDD 2.5). Vượt mốc → tăng hạng (u.ranks đổi → Core.canWield cầm được vũ khí xịn hơn).
  function gainWexp(u, type, amount, data, out) {
    out = out || empty();
    if (!learner(u) || !type || amount <= 0) return out;
    const RE = Core.rankExp(data), top = RE[Core.RANKS[Core.RANKS.length - 1]];
    u.wexp = u.wexp || {};
    const cur = u.ranks[type] || 'E', pts = Math.min(top, (u.wexp[type] | 0) + amount);
    u.wexp[type] = pts;
    let best = cur;
    for (const r of Core.RANKS) if (pts >= RE[r] && Core.RANKS.indexOf(r) > Core.RANKS.indexOf(best)) best = r;
    if (best !== cur) { u.ranks[type] = best; out.ranks.push({ uid: u.uid, name: u.name, type, from: cur, to: best, wexp: pts }); }
    return out;
  }
  // Điểm vũ khí một trận của món id (weapons.json → items[id].wexp, mặc định weaponExp.perBattle).
  function wexpOf(wid, data) {
    const W = data.weapons || {}, it = (W.items || {})[wid];
    return it && it.wexp != null ? it.wexp : ((W.weaponExp || {}).perBattle != null ? W.weaponExp.perBattle : 2);
  }

  // Trao thưởng sau một trận Core.fight giữa att và def (res = kết quả fight). Áp cho cả bên đánh lẫn bên phản đòn nếu là phe ta.
  // EXP: có ≥ 1 đòn trúng → EXP đánh trúng; hạ được đối thủ → EXP hạ gục. Không trúng đòn nào → 0.
  // Điểm vũ khí: một lần mỗi trận nếu có ≥ 1 đòn trúng bằng vũ khí thật (đòn kỹ năng wid = 'skill' không tính).
  function awardCombat(att, def, res, data, rng, out) {
    out = out || empty();
    if (!res || !res.strikes) return out;
    for (const [u, foe] of [[att, def], [def, att]]) {
      if (!learner(u)) continue;
      const hits = res.strikes.filter(s => s.from === u.uid && s.hit);
      if (!hits.length) continue;
      const killed = res.outcome && res.outcome.uid === foe.uid;
      // Điểm vũ khí trước EXP (thứ tự cố định; EXP mới quay RNG).
      const real = hits.find(s => s.wid && s.wid !== 'skill');
      if (real) gainWexp(u, real.wtype, wexpOf(real.wid, data), data, out);
      gainExp(u, killed ? killExp(u, foe) : hitExp(u, foe), data, rng, out);
    }
    return out;
  }

  // EXP kỹ năng không gây sát thương (hỗ trợ / chữa): skills.json → exp của kỹ năng, mặc định supportExp.heal / .other (GDD 5.1: 10–15).
  function supportExp(id, data) {
    const K = data.skills || {}, k = (K.skills || {})[id] || {}, d = Object.assign({ heal: 15, other: 10 }, K.supportExp);
    if (k.exp != null) return k.exp;
    return (k.effects || []).some(e => e.type === 'heal') ? d.heal : d.other;
  }

  // Trao thưởng sau Core.useSkill (r = kết quả useSkill, ok). Kỹ năng sát thương → như trận đánh; còn lại → EXP hỗ trợ.
  function awardSkill(S, u, r, data, rng, out) {
    out = out || empty();
    if (!r || !r.ok) return out;
    if (r.combat) { const tg = S.units.find(o => o.uid === r.target); return tg ? awardCombat(u, tg, r.combat, data, rng, out) : out; }
    return gainExp(u, supportExp(r.skill, data), data, rng, out);
  }

  const rngOf = ctx => (ctx && ctx.rng) || Core.rng(((ctx && ctx.seed != null ? ctx.seed : 1) ^ 0x5bd1e995) >>> 0);

  return { hitExp, killExp, rollGains, gainExp, gainWexp, awardCombat, awardSkill, supportExp, growthAny: any, growthRng: rngOf, emptyGrowth: empty };
})());
