// ===== Vân Đăng · AI chấm điểm =====
// Logic thuần (GDD 4): không THREE, không DOM. Gắn thêm Core.planTurn (cần 34-core + 36-combat + 37-skills).
// Với mỗi cặp (ô đứng, mục tiêu, hành động) — hành động = đánh bằng từng vũ khí dùng được hoặc kỹ năng sát thương —
//   điểm = sát thương kỳ vọng gây ra + thưởng hạ gục − rủi ro bị phản đòn − rủi ro ô đứng.
// Trọng số ở data/ai.json (thiếu thì dùng DEF). Phương án không đánh (tiến về ô gần nhất đánh được / đứng yên) cũng bị trừ
// rủi ro ô đứng; nước đánh tốt nhất phải hơn nó quá minScore thì mới đánh.
// Không đổi trạng thái: vũ khí / vị trí chỉ đặt tạm trong lúc tính rồi trả lại (try/finally).
// Tất định: không dùng RNG; duyệt ô theo chỉ số tăng dần, quân theo thứ tự S.units, vũ khí theo thứ tự túi; hòa điểm giữ nước gặp trước.
Object.assign(Core, (() => {
  const DEF = { weights: { damage: 1, kill: 15, counter: 1, death: 25, tile: .5, skillCost: 2 }, minScore: 0 };
  const FOES = { ta: ['dich'], dich: ['ta', 'npc'], npc: ['dich'] };   // giống 36-play.js / 37-skills.js
  const hostile = (a, b) => (FOES[a.side] || []).includes(b.side);
  const dist = (ax, ay, bx, by) => Math.abs(ax - bx) + Math.abs(ay - by);
  const usableWeapons = u => (u.inventory && u.inventory.length ? u.inventory : u.weapon ? [u.weapon] : []).filter(w => Core.usable(u, w));
  function withWeapon(u, w, fn) { const o = u.weapon; u.weapon = w; try { return fn(); } finally { u.weapon = o; } }
  function withPos(u, x, y, fn) { const ox = u.x, oy = u.y; u.x = x; u.y = y; try { return fn(); } finally { u.x = ox; u.y = oy; } }
  const config = data => { const A = data.ai || {}; return { W: Object.assign({}, DEF.weights, A.weights), minScore: A.minScore != null ? A.minScore : DEF.minScore }; };

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

  // Lên kế hoạch cho một quân: trả về { uid, path, x, y, action, score }.
  //   path: [[x,y],...] từ ô hiện tại tới ô đứng (dài 1 = đứng yên).
  //   score: điểm nước đã chọn (không đánh = −tile × rủi ro ô đứng).
//   action: null (chỉ đi / chờ) hoặc
  //     { type:'attack', target, x, y, weapon (id), slot (chỉ số trong túi), score, parts }
  //     { type:'skill',  target, x, y, skill, tx, ty, score, parts }    (tx,ty = ô mục tiêu kỹ năng)
  //   parts: { dealt, kill, taken, die, risk } để soi / chỉnh trọng số.
  // opts.mov ghi đè tầm di chuyển như Core.reachable.
  function planTurn(S, u, data, opts) {
    opts = opts || {};
    const { W, minScore } = config(data);
    const R = Core.reachable(S, u, data, opts.mov !== undefined ? { mov: opts.mov } : undefined);
    const foes = S.units.filter(o => o.hp > 0 && o !== u && hostile(u, o));
    const threats = S.units.filter(o => o.hp > 0 && o !== u && hostile(o, u) && usableWeapons(o).length).map(o => threatOf(S, o, data));
    const wpns = usableWeapons(u);
    const dmgSkills = (u.skills || []).filter(id => Core.canAfford(u, id, data) && data.skills.skills[id].effects.some(e => e.type === 'damage'));

    // Rủi ro ô đứng (x,y): tổng sát thương kỳ vọng các địch đe dọa gây ra (không tính phản đòn của u),
    // tối đa = HP còn lại sau trận (cap) — không mất quá số HP đang có. Mục tiêu tg nhân thêm (1 − xác suất bị hạ).
    const riskCache = new Map();
    function baseRisk(t, x, y) {
      const k = t.o.uid + ':' + (y * S.w + x);
      if (riskCache.has(k)) return riskCache.get(k);
      const c = t.cover.get(y * S.w + x); let v = 0;
      if (c) {
        const fc = withWeapon(t.o, c[0], () => Core.forecast(t.o, u, { distance: c[1], defTerrain: Core.terrainOf(S, x, y, data), noCounter: true }));
        v = expect(fc, t.o.hp, u.hp).dealt;
      }
      riskCache.set(k, v); return v;
    }
    const tileRisk = (x, y, tg, pKill, cap) => Math.min(cap != null ? cap : u.hp, threats.reduce((s, t) => s + baseRisk(t, x, y) * (t.o === tg ? 1 - pKill : 1), 0));

    function score(fc, tg, x, y, extra) {
      const e = expect(fc, u.hp, tg.hp), risk = tileRisk(x, y, tg, e.kill, Math.max(0, u.hp - e.taken)) * (1 - e.die);
      const parts = { dealt: e.dealt, kill: e.kill, taken: e.taken, die: e.die, risk };
      return { score: W.damage * e.dealt + W.kill * e.kill - W.counter * e.taken - W.death * e.die - W.tile * risk - (extra || 0), parts };
    }

    let best = null;
    const consider = o => { if (!best || o.score > best.score) best = o; };
    for (const i of R.stops) {
      const x = i % S.w, y = (i / S.w) | 0, tT = Core.terrainOf(S, x, y, data);
      for (const tg of foes) {
        const d = dist(x, y, tg.x, tg.y), gT = Core.terrainOf(S, tg.x, tg.y, data);
        wpns.forEach(w => {
          const fc = withWeapon(u, w, () => Core.forecast(u, tg, { distance: d, atkTerrain: tT, defTerrain: gT }));
          if (!fc.attacker.canAttack) return;
          const s = score(fc, tg, x, y);
          consider({ type: 'attack', target: tg.uid, x, y, weapon: w.id, slot: u.inventory ? u.inventory.indexOf(w) : -1, score: s.score, parts: s.parts });
        });
      }
      // Kỹ năng sát thương: đặt tạm u ở (x,y) để skillTargets / skillForecast tính từ ô đó. Hiệu ứng khác làm thật ở tuần 8.
      for (const id of dmgSkills) withPos(u, x, y, () => {
        const cost = data.skills.skills[id].cost;
        for (const t of Core.skillTargets(S, u, id, data)) {
          const fc = Core.skillForecast(S, u, id, t.x, t.y, data).damage;
          if (!fc || !fc.attacker.canAttack) continue;
          const s = score(fc, t.unit, x, y, W.skillCost * cost);
          consider({ type: 'skill', target: t.unit.uid, x, y, skill: id, tx: t.x, ty: t.y, score: s.score, parts: s.parts });
        }
      });
    }
    // Phương án không đánh cũng phải chịu rủi ro ô đứng → nước đánh được chọn khi hơn nó quá minScore.
    const fb = fallback(S, u, data, wpns, foes, opts);
    fb.score = -W.tile * tileRisk(fb.x, fb.y, null, 0);
    if (best && best.score - fb.score > minScore) return { uid: u.uid, path: Core.pathTo(R, best.x, best.y), x: best.x, y: best.y, action: best, score: best.score };
    return fb;
  }

  // Không đánh: tiến về ô gần nhất (theo chi phí đi thật) mà từ đó có vũ khí với tới một địch,
  // đi xa nhất có thể dọc đường đó trong tầm Di chuyển. Không có vũ khí (dân làng) hoặc đã ở đó thì đứng yên.
  function fallback(S, u, data, wpns, foes, opts) {
    const stay = { uid: u.uid, path: [[u.x, u.y]], x: u.x, y: u.y, action: null };
    if (!wpns.length || !foes.length) return stay;
    const far = Core.reachable(S, u, data, { mov: 999 }), mov = opts.mov !== undefined ? opts.mov : u.stats.mov;
    let goal = -1, bestCost = Infinity;
    for (const i of far.stops) {
      const x = i % S.w, y = (i / S.w) | 0, c = far.cost.get(i);
      if (c >= bestCost) continue;
      if (foes.some(f => { const d = dist(x, y, f.x, f.y); return wpns.some(w => d >= w.minRange && d <= w.maxRange); })) { bestCost = c; goal = i; }
    }
    if (goal < 0 || goal === far.start) return stay;
    const path = Core.pathTo(far, goal % S.w, (goal / S.w) | 0);
    let end = 0;
    for (let k = 0; k < path.length; k++) { const [x, y] = path[k]; if (far.cost.get(y * S.w + x) > mov) break; if (Core.canStopAt(far, x, y)) end = k; }
    if (!end) return stay;
    const [ex, ey] = path[end];
    return { uid: u.uid, path: path.slice(0, end + 1), x: ex, y: ey, action: null };
  }

  return { planTurn, aiExpect: expect };
})());
