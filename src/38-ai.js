// ===== Vân Đăng · AI chấm điểm =====
// Logic thuần (GDD 4): không THREE, không DOM. Gắn thêm Core.planTurn (cần 34-core + 36-combat + 37-skills).
// Với mỗi cặp (ô đứng, mục tiêu, hành động) — hành động = đánh bằng từng vũ khí dùng được hoặc kỹ năng sát thương —
//   điểm = sát thương kỳ vọng gây ra + thưởng hạ gục − rủi ro bị phản đòn − rủi ro ô đứng.
// Trọng số ở data/ai.json (thiếu thì dùng DEF). Phương án không đánh (tiến về ô gần nhất đánh được / đứng yên) cũng bị trừ
// rủi ro ô đứng; nước đánh tốt nhất phải hơn nó quá minScore thì mới đánh.
// Không đổi trạng thái: vũ khí / vị trí chỉ đặt tạm trong lúc tính rồi trả lại (try/finally).
// Tất định: không dùng RNG; duyệt ô theo chỉ số tăng dần, quân theo thứ tự S.units, vũ khí theo thứ tự túi; hòa điểm giữ nước gặp trước.
Object.assign(Core, (() => {
  const DEF = { weights: { damage: 1, kill: 15, counter: 1, death: 25, tile: .5, skillCost: 2, heal: 1, low: 2, guard: 1, lordTile: 3, lordDeath: 4 }, minScore: 0 };
  // Hành vi gắn theo đơn vị (GDD 4) và tham số mặc định; data/ai.json → behaviors ghi đè, u.ai (mẫu / roster) ghi đè tiếp.
  const BEHAVIORS = {
    lao_vao: {},                         // Lao vào: chấm điểm đầy đủ, không có nước đánh thì tiến về địch
    giu_vi_tri: { radius: 2 },           // Giữ vị trí: chỉ đứng trong bán kính quanh ô xuất phát (u.home), ra ngoài thì quay về
    cho_tam: {},                         // Chỉ phản ứng khi vào tầm: đứng yên tới khi có địch đánh được lượt này hoặc bị thương
    dung_yen: {},                        // Đứng yên (boss): không bao giờ rời ô, đánh ai vào tầm
    ho_ve: { follow: null, radius: 2, protect: 2 },   // Hộ vệ: chỉ đứng trong bán kính quanh đơn vị follow (id mẫu hoặc uid)
    dao_tac: { then: 'lao_vao' },        // Đạo tặc: tới rương chưa mở → mở → chạy tới ô thoát; hết rương thì dùng hành vi 'then'
    chua_tri: { radius: 2 }              // Chữa trị: hồi đồng minh máu thấp; không ai bị thương thì đi theo đội, chọn ô an toàn
  };
  const FOES = { ta: ['dich'], dich: ['ta', 'npc'], npc: ['dich'] };   // giống 36-play.js / 37-skills.js
  const hostile = (a, b) => (FOES[a.side] || []).includes(b.side);
  const dist = (ax, ay, bx, by) => Math.abs(ax - bx) + Math.abs(ay - by);
  const usableWeapons = u => (u.inventory && u.inventory.length ? u.inventory : u.weapon ? [u.weapon] : []).filter(w => Core.usable(u, w));
  function withWeapon(u, w, fn) { const o = u.weapon; u.weapon = w; try { return fn(); } finally { u.weapon = o; } }
  function withPos(u, x, y, fn) { const ox = u.x, oy = u.y; u.x = x; u.y = y; try { return fn(); } finally { u.x = ox; u.y = oy; } }
  const config = data => {
    const A = data.ai || {}, beh = {};
    for (const k in BEHAVIORS) beh[k] = Object.assign({}, BEHAVIORS[k], (A.behaviors || {})[k]);
    return { W: Object.assign({}, DEF.weights, A.weights), minScore: A.minScore != null ? A.minScore : DEF.minScore, beh };
  };
  function behaviorOf(u, C) {
    const type = (u.ai && u.ai.type) || 'lao_vao';
    if (!C.beh[type]) throw new Error(`${u.name}: hành vi AI lạ '${type}'`);
    return Object.assign({}, C.beh[type], u.ai, { type });
  }

  // Kỳ vọng của một trận theo forecast: duyệt đủ nhánh trượt / trúng / chí mạng của từng đòn theo thứ tự A → D → A → D,
  // dừng khi có bên về 0 HP (giống Core.fight). Tỷ lệ trúng dùng True Hit 2RN; chí mạng 1RN chỉ khi trúng.
  // Trả về { dealt, taken, kill, die }: HP kỳ vọng mất của bên bị đánh / bên đánh, xác suất hạ gục / bị hạ.
  function expect(fc, aHp, dHp) {
    const a = fc.attacker, d = fc.defender, r = { dealt: 0, taken: 0, kill: 0, die: 0 };
    if (!a.canAttack) return r;
    const order = [a];
    if (d.canCounter) order.push(d);
    if (a.doubles) order.push(a);
    if (d.canCounter && d.doubles) order.push(d);
    (function go(i, ah, dh, pr) {
      if (pr <= 0) return;
      if (i === order.length || ah <= 0 || dh <= 0) {
        r.dealt += pr * (dHp - dh); r.taken += pr * (aHp - ah);
        if (dh <= 0) r.kill += pr; if (ah <= 0) r.die += pr;
        return;
      }
      const s = order[i], p = s.trueHit / 100, c = s.crit / 100;
      const hit = dmg => s === a ? [ah, Math.max(0, dh - dmg)] : [Math.max(0, ah - dmg), dh];
      go(i + 1, ah, dh, pr * (1 - p));
      go(i + 1, ...hit(s.dmg), pr * p * (1 - c));
      go(i + 1, ...hit(s.dmg * 3), pr * p * c);
    })(0, aHp, dHp, 1);
    return r;
  }

  // Vùng đe dọa của o trong lượt sau: ô idx → [vũ khí, khoảng cách] đầu tiên tìm được (o đi tới một ô dừng rồi đánh).
  function threatOf(S, o, data) {
    const R = Core.reachable(S, o, data), cover = new Map(), ws = usableWeapons(o);
    for (const i of R.stops) {
      const sx = i % S.w, sy = (i / S.w) | 0;
      for (const w of ws) {
        const hi = w.maxRange != null ? w.maxRange : w.minRange;
        for (let y = Math.max(0, sy - hi); y <= Math.min(S.h - 1, sy + hi); y++)
          for (let x = Math.max(0, sx - hi); x <= Math.min(S.w - 1, sx + hi); x++) {
            const d = dist(sx, sy, x, y), k = y * S.w + x;
            if (d >= w.minRange && d <= hi && !cover.has(k)) cover.set(k, [w, d]);
          }
      }
    }
    return { o, cover };
  }

  // Lên kế hoạch cho một quân: trả về { uid, path, x, y, action, score, behavior, wake? }.
  //   path: [[x,y],...] từ ô hiện tại tới ô đứng (dài 1 = đứng yên).
  //   score: điểm nước đã chọn (không đánh = −tile × rủi ro ô đứng).
  //   action: null (chỉ đi / chờ) hoặc
  //     { type:'attack', target, x, y, weapon (id), slot (chỉ số trong túi), score, parts }
  //     { type:'skill',  target, x, y, skill, tx, ty, score, parts }    (tx,ty = ô mục tiêu kỹ năng; gồm cả kỹ năng hồi máu)
  //     { type:'open', x, y }  (mở rương ở ô x,y — Core.openChest)   { type:'escape' }  (rời map ở ô thoát — Core.escape)
  //   parts: { dealt, kill, taken, die, risk, guard?, heal? } để soi / chỉnh trọng số.
  //   wake: true khi quân 'cho_tam' bị đánh thức lượt này — bên chạy kế hoạch đặt u.awake = true (từ đó như Lao vào).
  // Hành vi chỉ lọc ô đứng / thêm điểm / đổi phương án không đánh; lõi chấm điểm dùng chung.
  // Đăng/Linh (Core.isLord, phe ta): rủi ro ô đứng ×lordTile, chết khi phản đòn ×lordDeath, không có nước đánh thì lùi về ô an toàn nhất.
  // Đồng đội được thưởng guard × xác suất hạ × sát thương kỳ vọng mà mục tiêu đó sẽ gây cho Đăng/Linh (hoặc người được Hộ vệ, ×protect).
  // opts.mov ghi đè tầm di chuyển như Core.reachable.
  function planTurn(S, u, data, opts) {
    opts = opts || {};
    const C = config(data), { W, minScore } = C;
    let B = behaviorOf(u, C);
    const isLord = o => o.side === 'ta' && Core.isLord(o);   // Đăng/Linh chỉ ở phe ta (mẫu 'dang' dựng làm địch trong test thì không tính)
    const lord = isLord(u), wTile = W.tile * (lord ? W.lordTile : 1), wDeath = W.death * (lord ? W.lordDeath : 1);
    const mov = B.type === 'dung_yen' ? 0 : opts.mov;
    const R = Core.reachable(S, u, data, mov !== undefined ? { mov } : undefined);
    const plan = (x, y, action, extra) => Object.assign({ uid: u.uid, path: x === u.x && y === u.y ? [[u.x, u.y]] : Core.pathTo(R, x, y), x, y, action: action || null, behavior: B.type }, extra);
    const stops = R.stops.map(i => [i % S.w, (i / S.w) | 0]);

    if (B.type === 'dao_tac') {
      const p = thief(S, u, data, R, stops, plan);
      if (p) return p;
      B = behaviorOf({ name: u.name, ai: { type: B.then || 'lao_vao' } }, C);
      if (B.type === 'dao_tac') B = behaviorOf({ ai: {} }, C);
    }

    const foes = S.units.filter(o => o.hp > 0 && o !== u && hostile(u, o));
    const threats = S.units.filter(o => o.hp > 0 && o !== u && hostile(o, u) && usableWeapons(o).length).map(o => threatOf(S, o, data));
    const wpns = usableWeapons(u);
    const skills = (u.skills || []).filter(id => Core.canAfford(u, id, data));
    const dmgSkills = skills.filter(id => data.skills.skills[id].effects.some(e => e.type === 'damage'));
    const healSkills = skills.filter(id => data.skills.skills[id].effects.some(e => e.type === 'heal'));
    const allies = S.units.filter(o => o.hp > 0 && o !== u && o.side === u.side);

    // Người được Hộ vệ: follow = uid (số) hoặc id mẫu; lấy quân cùng phe còn sống gặp trước. Không có thì như Lao vào.
    let ward = null;
    if (B.type === 'ho_ve') {
      ward = allies.find(o => typeof B.follow === 'number' ? o.uid === B.follow : o.tpl === B.follow) || null;
      if (!ward) B = behaviorOf({ ai: {} }, C);
    }
    const near = (o, r) => ([x, y]) => dist(x, y, o.x, o.y) <= r;
    const allowed = B.type === 'giu_vi_tri' ? ([x, y]) => dist(x, y, u.home[0], u.home[1]) <= B.radius
      : ward ? near(ward, B.radius) : () => true;

    // Rủi ro ô đứng (x,y): tổng sát thương kỳ vọng các địch đe dọa gây ra (không tính phản đòn của u),
    // tối đa = HP còn lại sau trận (cap) — không mất quá số HP đang có. Mục tiêu tg nhân thêm (1 − xác suất bị hạ).
    const riskCache = new Map();
    function hurt(t, v, x, y) {   // sát thương kỳ vọng t.o gây cho v nếu v đứng ở (x,y) lượt sau (0 nếu ngoài tầm)
      const k = t.o.uid + ':' + v.uid + ':' + (y * S.w + x);
      if (riskCache.has(k)) return riskCache.get(k);
      const c = t.cover.get(y * S.w + x); let r = 0;
      if (c) {
        const fc = withWeapon(t.o, c[0], () => Core.forecast(t.o, v, { distance: c[1], defTerrain: Core.terrainOf(S, x, y, data), noCounter: true }));
        r = expect(fc, t.o.hp, v.hp).dealt;
      }
      riskCache.set(k, r); return r;
    }
    const tileRisk = (x, y, tg, pKill, cap) => Math.min(cap != null ? cap : u.hp, threats.reduce((s, t) => s + hurt(t, u, x, y) * (t.o === tg ? 1 - pKill : 1), 0));
    // Đồng đội cần che: Đăng/Linh (×lordTile) và người được Hộ vệ (×protect). guardOf(tg) = sát thương kỳ vọng tg sẽ gây cho họ.
    const wards = allies.filter(o => isLord(o) || o === ward).map(o => [o, (isLord(o) ? W.lordTile : 1) * (o === ward ? B.protect : 1)]);
    const guardOf = tg => { const t = threats.find(q => q.o === tg); return t ? wards.reduce((s, [o, m]) => s + m * Math.min(o.hp, hurt(t, o, o.x, o.y)), 0) : 0; };

    function score(fc, tg, x, y, extra) {
      const e = expect(fc, u.hp, tg.hp), risk = tileRisk(x, y, tg, e.kill, Math.max(0, u.hp - e.taken)) * (1 - e.die);
      const guard = wards.length ? guardOf(tg) * e.kill : 0;
      const parts = { dealt: e.dealt, kill: e.kill, taken: e.taken, die: e.die, risk, guard };
      return { score: W.damage * e.dealt + W.kill * e.kill - W.counter * e.taken - wDeath * e.die - wTile * risk + W.guard * guard - (extra || 0), parts };
    }

    let best = null, canHit = false;
    const consider = o => { if (o.type !== 'skill' || o.parts.heal == null) canHit = true; if (!best || o.score > best.score) best = o; };
    for (const [x, y] of stops) {
      if (!allowed([x, y])) continue;
      const tT = Core.terrainOf(S, x, y, data);
      for (const tg of foes) {
        const d = dist(x, y, tg.x, tg.y), gT = Core.terrainOf(S, tg.x, tg.y, data);
        wpns.forEach(w => {
          const fc = withWeapon(u, w, () => Core.forecast(u, tg, { distance: d, atkTerrain: tT, defTerrain: gT }));
          if (!fc.attacker.canAttack) return;
          const s = score(fc, tg, x, y);
          consider({ type: 'attack', target: tg.uid, x, y, weapon: w.id, slot: u.inventory ? u.inventory.indexOf(w) : -1, score: s.score, parts: s.parts });
        });
      }
      // Kỹ năng: đặt tạm u ở (x,y) để skillTargets / skillForecast tính từ ô đó. Hiệu ứng khác làm thật ở tuần 8.
      for (const id of dmgSkills) withPos(u, x, y, () => {
        const cost = data.skills.skills[id].cost;
        for (const t of Core.skillTargets(S, u, id, data)) {
          const fc = Core.skillForecast(S, u, id, t.x, t.y, data).damage;
          if (!fc || !fc.attacker.canAttack) continue;
          const s = score(fc, t.unit, x, y, W.skillCost * cost);
          consider({ type: 'skill', target: t.unit.uid, x, y, skill: id, tx: t.x, ty: t.y, score: s.score, parts: s.parts });
        }
      });
      // Hồi máu: heal × HP hồi thực × (1 + low × tỷ lệ máu đã mất) − rủi ro ô đứng − chi phí. Đăng/Linh ×lordTile.
      for (const id of healSkills) withPos(u, x, y, () => {
        const cost = data.skills.skills[id].cost;
        for (const t of Core.skillTargets(S, u, id, data)) {
          const amt = Core.healAmount(u, id, t.unit, data); if (amt <= 0) continue;
          const o = t.unit, risk = tileRisk(x, y, null, 0);
          const val = W.heal * amt * (1 + W.low * (1 - o.hp / o.stats.hp)) * (isLord(o) ? W.lordTile : 1);
          consider({ type: 'skill', target: o.uid, x, y, skill: id, tx: t.x, ty: t.y, score: val - wTile * risk - W.skillCost * cost,
            parts: { heal: amt, risk, dealt: 0, kill: 0, taken: 0, die: 0 } });
        }
      });
    }

    // Chỉ phản ứng khi vào tầm: còn ngủ (chưa awake, chưa bị thương) và chưa đánh được ai lượt này thì đứng yên.
    let wake = false;
    if (B.type === 'cho_tam' && !u.awake && u.hp >= u.stats.hp) {
      if (!canHit) return plan(u.x, u.y, null, { score: -wTile * tileRisk(u.x, u.y, null, 0) });
      wake = true;
    }

    // Phương án không đánh theo hành vi; cũng chịu rủi ro ô đứng → nước đánh được chọn khi hơn nó quá minScore.
    const risk0 = ([x, y]) => tileRisk(x, y, null, 0);
    const safest = list => list.reduce((b, p) => risk0(p) < risk0(b) ? p : b);           // hòa: giữ ô gặp trước
    const here = [u.x, u.y], withHere = list => [here, ...list.filter(p => p[0] !== u.x || p[1] !== u.y)];
    // Tới được ngay ô thỏa goal thì đứng ô an toàn nhất trong số đó (ưu tiên ô hiện tại khi hòa), không thì tiến dần về ô gần nhất.
    function settle(goal) {
      const ok = withHere(stops).filter(p => R.stops.includes(p[1] * S.w + p[0]) && goal(p));
      if (ok.length) return safest(ok);
      return approach(S, u, data, mov !== undefined ? mov : u.stats.mov, goal) || here;
    }
    let fb = here;
    if (B.type === 'dung_yen') fb = here;
    else if (B.type === 'giu_vi_tri') fb = allowed(here) ? here : settle(allowed);
    else if (ward) fb = settle(near(ward, B.radius));
    else if (B.type === 'chua_tri') {
      const hi = Math.max(0, ...healSkills.map(id => data.skills.skills[id].range[1]));
      const hurtA = allies.filter(o => o.hp < o.stats.hp).sort((a, b) => a.hp / a.stats.hp - b.hp / b.stats.hp)[0];
      const goalA = hurtA && hi ? hurtA : allies.slice().sort((a, b) => dist(u.x, u.y, a.x, a.y) - dist(u.x, u.y, b.x, b.y))[0];
      if (goalA) fb = settle(near(goalA, hurtA && hi ? hi : B.radius));
      else if (wpns.length) fb = lunge(S, u, data, wpns, foes, mov) || here;
    } else {
      fb = lunge(S, u, data, wpns, foes, mov) || here;
      // Đăng/Linh: ô tiến tới có rủi ro thì lùi về ô an toàn nhất (hòa thì ô tiến tới, rồi ô hiện tại).
      if (lord && risk0(fb) > 0) fb = safest([fb, ...withHere(stops)]);
    }
    const fbScore = -wTile * risk0(fb), w8 = wake ? { wake: true } : {};
    if (best && best.score - fbScore > minScore) return plan(best.x, best.y, best, Object.assign({ score: best.score }, w8));
    return plan(fb[0], fb[1], null, Object.assign({ score: fbScore }, w8));
  }

  // Đạo tặc: mang đồ thì chạy tới ô thoát (tới được thì thoát luôn); còn rương chưa mở thì tới ô kề rương và mở
  // (ưu tiên rương gặp trước trong S.chests, rồi ô tốn ít bước nhất); không thì tiến về rương gần nhất. Hết việc → null.
  function thief(S, u, data, R, stops, plan) {
    const byCost = list => list.reduce((b, p) => R.cost.get(p[1] * S.w + p[0]) < R.cost.get(b[1] * S.w + b[0]) ? p : b);
    const step = goal => { const a = approach(S, u, data, u.stats.mov, goal); return a ? plan(a[0], a[1]) : plan(u.x, u.y); };
    if (u.loot && u.loot.length) {
      const ex = stops.filter(([x, y]) => Core.isExit(S, x, y));
      if (ex.length) { const [x, y] = byCost(ex); return plan(x, y, { type: 'escape', x, y }); }
      return step(([x, y]) => Core.isExit(S, x, y));
    }
    const shut = S.chests.filter(c => !c.open);
    if (!shut.length) return null;
    for (const c of shut) {
      const adj = stops.filter(([x, y]) => dist(x, y, c.x, c.y) === 1);
      if (adj.length) { const [x, y] = byCost(adj); return plan(x, y, { type: 'open', x: c.x, y: c.y }); }
    }
    const goal = ([x, y]) => shut.some(c => dist(x, y, c.x, c.y) === 1);
    return approach(S, u, data, u.stats.mov, goal) ? step(goal) : null;
  }

  // Tiến về ô gần nhất (theo chi phí đi thật, bỏ qua giới hạn Di chuyển) thỏa goal([x,y]), đi xa nhất có thể dọc đường đó
  // trong tầm mov. Trả về ô [x, y] hoặc null (không tới được / đã ở đó / không nhích được ô nào).
  function approach(S, u, data, mov, goal) {
    const far = Core.reachable(S, u, data, { mov: 999 });
    let g = -1, bestCost = Infinity;
    for (const i of far.stops) {
      const c = far.cost.get(i);
      if (c < bestCost && goal([i % S.w, (i / S.w) | 0])) { bestCost = c; g = i; }
    }
    if (g < 0 || g === far.start) return null;
    const path = Core.pathTo(far, g % S.w, (g / S.w) | 0);
    let end = 0;
    for (let k = 0; k < path.length; k++) { const [x, y] = path[k]; if (far.cost.get(y * S.w + x) > mov) break; if (Core.canStopAt(far, x, y)) end = k; }
    if (!end) return null;
    return [path[end][0], path[end][1]];
  }
  // Lao vào khi chưa đánh được: tiến về ô gần nhất mà từ đó có vũ khí với tới một địch. Không vũ khí (dân làng) → null.
  function lunge(S, u, data, wpns, foes, mov) {
    if (!wpns.length || !foes.length) return null;
    return approach(S, u, data, mov !== undefined ? mov : u.stats.mov,
      ([x, y]) => foes.some(f => { const d = dist(x, y, f.x, f.y); return wpns.some(w => d >= w.minRange && d <= w.maxRange); }));
  }

  // Chạy hành động của một kế hoạch (sau khi đã đặt u vào ô đứng). Dùng chung cho 36-play.js và tools/test_ai.js.
  // ctx: { rng | seed, mode }. Trả về { ok, combat?, effects?, growth?, item?, loot?, error? } — combat là kết quả Core.fight để phát lại; growth: EXP/lên cấp/hạng vũ khí (39-level).
  function aiAct(S, u, a, data, ctx) {
    if (!a || u.hp <= 0) return { ok: false, error: 'không có hành động' };
    if (a.type === 'open') return Core.openChest(S, u, a.x, a.y);
    if (a.type === 'escape') return Core.escape(S, u);
    const tg = S.units.find(o => o.uid === a.target);
    if (!tg || tg.hp <= 0) return { ok: false, error: 'mục tiêu không còn' };
    if (a.type === 'attack') {
      const w = a.slot >= 0 && u.inventory ? u.inventory[a.slot] : u.weapon, d = dist(u.x, u.y, tg.x, tg.y);
      if (!w || !withWeapon(u, w, () => Core.inRange(u, d))) return { ok: false, error: 'ngoài tầm' };
      u.weapon = w; if (u.inventory) { const i = u.inventory.indexOf(w); if (i > 0) { u.inventory.splice(i, 1); u.inventory.unshift(w); } }
      const combat = Core.fight(u, tg, Object.assign({}, ctx, { distance: d, atkTerrain: Core.terrainOf(S, u.x, u.y, data), defTerrain: Core.terrainOf(S, tg.x, tg.y, data) }));
      // EXP / lên cấp / hạng vũ khí (39-level): chỉ phe ta nhận (quân ta do AI điều khiển, hoặc quân ta phản đòn khi bị địch đánh).
      return { ok: true, combat, growth: Core.awardCombat(u, tg, combat, data, Core.growthRng(ctx)) };
    }
    if (a.type === 'skill') { const r = Core.useSkill(S, u, a.skill, a.tx, a.ty, data, ctx); return r.ok ? { ok: true, combat: r.combat, effects: r.effects, growth: Core.awardSkill(S, u, r, data, Core.growthRng(ctx)) } : r; }
    return { ok: false, error: 'hành động lạ ' + a.type };
  }

  // Kiểm tra hành vi khai báo ở mẫu đơn vị và roster các map (data.maps). Trả về mảng lỗi.
  function validateAi(data) {
    const errs = [], C = config(data);
    const check = (ai, where) => {
      if (!ai || ai.type === undefined) return;
      if (!C.beh[ai.type]) return errs.push(`${where}: hành vi AI lạ '${ai.type}'`);
      if (ai.type === 'dao_tac' && ai.then && (!C.beh[ai.then] || ai.then === 'dao_tac')) errs.push(`${where}: then phải là hành vi khác dao_tac`);
      if (ai.type === 'ho_ve' && ai.follow == null && C.beh.ho_ve.follow == null) errs.push(`${where}: ho_ve cần follow`);
    };
    for (const t in data.units.templates) check(data.units.templates[t].ai, `mẫu ${t}`);
    for (const id in data.maps || {}) for (const c in data.maps[id].roster || {}) data.maps[id].roster[c].forEach((e, i) => { if (e && typeof e === 'object') check(e.ai, `map ${id} roster.${c}[${i}]`); });
    return errs;
  }

  return { planTurn, aiAct, validateAi, aiExpect: expect, AI_BEHAVIORS: Object.keys(BEHAVIORS) };
})());
