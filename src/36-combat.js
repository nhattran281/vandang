// ===== Vân Đăng · Công thức chiến đấu =====
// Logic thuần (GDD 2.1, 2.3, 2.9): không THREE, không DOM. Gắn thêm hàm vào Core của 34-core.js.
// Đơn vị theo makeUnit: { uid, tpl, side, hp, stats:{hp,str,mag,skl,spd,lck,def,res,con}, weapon? }
// weapon: tạo bằng Core.makeWeapon từ data/weapons.json:
//   { id, name, type, rank, magic, mt, hit, crit, wt, minRange, maxRange, effective:[luật khắc chế], uses?, maxUses? }
// Khắc chế (GDD 2.4) so w.effective với tags của mục tiêu (Nguoi/Ma/Yeu/Bay/Thuy) và statuses (vd 'uot').
// ctx: { distance, atkTerrain, defTerrain, rng | seed, mode:'casual'|'classic'|'deadzone', noCounter, noDouble }
//   noDouble: bên đánh chỉ ra 1 đòn (kỹ năng sát thương, 37-skills.js).
//   atkTerrain/defTerrain: ô địa hình của terrain.json (dùng khóa avo, def) — lấy bằng Core.terrainOf.
Object.assign(Core, (() => {
  const DOUBLE_AS = 4;            // AS chênh ≥ 4 → đánh đôi
  const CRIT_MULT = 3;            // chí mạng ×3
  const LORDS = ['dang', 'linh']; // ngã → thua trận (GDD 2.9)

  const isLord = u => !!u.lord || LORDS.includes(u.tpl);   // Đăng/Linh: ngã là thua, AI phe ta phải che chắn
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const half = v => Math.floor(v / 2);           // chia đôi làm tròn xuống
  const rn = rng => Math.floor(rng() * 100);      // một số 0–99

  // True Hit 2RN: quay 2 số 0–99, lấy trung bình; nhỏ hơn tỷ lệ hiển thị thì trúng.
  function roll2RN(rng, shown) { const a = rn(rng), b = rn(rng); return { hit: (a + b) / 2 < shown, rolls: [a, b] }; }

  // Tỷ lệ thực (%) của tỷ lệ hiển thị, đếm đủ 10.000 cặp. Dùng cho UI/AI.
  function trueHit(shown) {
    if (shown <= 0) return 0; if (shown >= 100) return 100;
    let n = 0; for (let a = 0; a < 100; a++) n += clamp(2 * shown - a, 0, 100);
    return n / 100;
  }

  const attackSpeed = u => { const w = u.weapon; return u.stats.spd - Math.max(0, (w ? w.wt || 0 : 0) - u.stats.con); };
  function inRange(u, d) {
    const w = u.weapon; if (!w || !Core.usable(u, w)) return false;   // chưa đủ hạng / đã gãy thì không đánh
    const lo = w.minRange != null ? w.minRange : 1, hi = w.maxRange != null ? w.maxRange : lo;
    return d >= lo && d <= hi;
  }

  // Luật khắc chế của vũ khí w áp lên mục tiêu tg (khớp một nhãn hoặc một trạng thái là đủ).
  const statusIds = tg => (tg.statuses || []).map(x => typeof x === 'string' ? x : x.id);
  function effectiveOn(w, tg) {
    if (!w || !w.effective) return [];
    const tags = tg.tags || [], st = statusIds(tg);
    return w.effective.filter(r => (r.vs || []).some(t => tags.includes(t)) || (r.vsStatus || []).some(x => st.includes(x)));
  }

  // Số liệu một phía: u đánh tg. uT/tT = ô địa hình đang đứng.
  // Khắc chế: mtMult nhân Uy lực; dmgMult nhân sát thương sau Thủ (làm tròn xuống); hit cộng vào tỷ lệ trúng trận.
  // Nhiều luật cùng khớp thì nhân/cộng dồn (dữ liệu hiện tại chưa có vũ khí nào khớp 2 luật cùng lúc).
  function side(u, tg, uT, tT) {
    const w = u.weapon, s = u.stats, ts = tg.stats, magic = !!(w && w.magic);
    const as = attackSpeed(u), tAs = attackSpeed(tg);
    const eff = effectiveOn(w, tg);
    let mtMult = 1, dmgMult = 1, effHit = 0;
    for (const r of eff) { mtMult *= r.mtMult || 1; dmgMult *= r.dmgMult || 1; effHit += r.hit || 0; }
    const atk = w ? (magic ? s.mag : s.str) + Math.floor((w.mt || 0) * mtMult) : 0;
    const dmg = Math.floor(Math.max(0, atk - ((magic ? ts.res : ts.def) + ((tT && tT.def) || 0))) * dmgMult);
    const hitStat = w ? (w.hit || 0) + s.skl * 2 + half(s.lck) : 0;
    const hit = clamp(hitStat + effHit - (tAs * 2 + ts.lck + ((tT && tT.avo) || 0)), 0, 100);
    const critStat = w ? (w.crit || 0) + half(s.skl) : 0;
    return {
      atk, dmg, as, hitStat, hit, trueHit: trueHit(hit),
      avoid: as * 2 + s.lck + ((uT && uT.avo) || 0),
      critStat, crit: clamp(critStat - ts.lck, 0, 100),
      doubles: as - tAs >= DOUBLE_AS,
      effective: eff.map(r => r.id), effHit,
      uses: w && w.maxUses ? w.uses : null,      // null = vũ khí thường, không độ bền
    };
  }

  // Bảng dự báo cho cả hai phía. Không đổi trạng thái → AI gọi thoải mái.
  function forecast(att, def, ctx) {
    ctx = ctx || {};
    const distance = ctx.distance != null ? ctx.distance : 1;
    const a = side(att, def, ctx.atkTerrain, ctx.defTerrain), d = side(def, att, ctx.defTerrain, ctx.atkTerrain);
    a.canAttack = inRange(att, distance);
    d.canCounter = a.canAttack && !ctx.noCounter && def.hp > 0 && inRange(def, distance);
    if (ctx.noDouble) a.doubles = false;
    a.strikes = a.canAttack ? (a.doubles ? 2 : 1) : 0;
    d.strikes = d.canCounter ? (d.doubles ? 2 : 1) : 0;
    return { distance, attacker: a, defender: d };
  }

  // §2.9: Casual → rút lui; Classic / Vùng Chết → chết vĩnh viễn. Đăng/Linh ngã → thua trận.
  function knockOut(u, mode) {
    const perma = mode === 'classic' || mode === 'deadzone';
    u.hp = 0; if (perma) u.dead = true; else u.retreated = true;
    return { uid: u.uid, result: perma ? 'dead' : 'retreated', gameOver: isLord(u) };
  }

  // Chạy một trận: A → D phản → A (đánh đôi) → D (đánh đôi); dừng khi có bên về 0 HP.
  // Ghi HP mới vào đơn vị; trả về nhật ký từng đòn để phần vẽ phát lại.
  function fight(att, def, ctx) {
    ctx = ctx || {};
    const rng = ctx.rng || Core.rng(ctx.seed != null ? ctx.seed : 1);
    const fc = forecast(att, def, ctx), log = [];
    if (!fc.attacker.canAttack) return { forecast: fc, strikes: log, outcome: null };
    const order = [['A', att, def, fc.attacker]];
    if (fc.defender.canCounter) order.push(['D', def, att, fc.defender]);
    if (fc.attacker.doubles) order.push(['A', att, def, fc.attacker]);
    if (fc.defender.canCounter && fc.defender.doubles) order.push(['D', def, att, fc.defender]);
    let fallen = null;
    for (const [who, src, tg, s] of order) {
      const w = src.weapon;
      if (w && w.maxUses && w.uses <= 0) continue;   // vũ khí gãy giữa trận → bỏ các đòn còn lại
      const h = roll2RN(rng, s.hit); let crit = false, damage = 0, broke = false;
      if (h.hit) {
        crit = s.crit > 0 && rn(rng) < s.crit;   // chí mạng: 1RN, chỉ quay khi trúng
        damage = s.dmg * (crit ? CRIT_MULT : 1);
        tg.hp = Math.max(0, tg.hp - damage);
        if (w && w.maxUses) { w.uses--; broke = w.uses <= 0; }   // độ bền: trừ khi trúng
      }
      log.push({ who, from: src.uid, to: tg.uid, hit: h.hit, crit, damage, rolls: h.rolls, targetHp: tg.hp, broke, wid: w ? w.id : null, wtype: w ? w.type : null });   // wid/wtype: cho EXP vũ khí (39-level)
      if (tg.hp <= 0) { fallen = tg; break; }
    }
    // Vũ khí gãy → tự đổi sang cái tiếp theo trong túi (nếu có) cho lượt sau.
    for (const u of [att, def]) if (u.weapon && u.weapon.maxUses && u.weapon.uses <= 0 && u.inventory) Core.equipFirst(u);
    return { forecast: fc, strikes: log, outcome: fallen ? knockOut(fallen, ctx.mode || 'casual') : null };
  }

  return { isLord, effectiveOn, roll2RN, trueHit, attackSpeed, inRange, forecast, fight, knockOut };
})());
