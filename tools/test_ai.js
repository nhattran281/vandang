// Kiểm thử AI chấm điểm (GDD 4) không cần trình duyệt: node tools/test_ai.js
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const ROOT = path.dirname(__dirname);
const src = f => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');
const Core = vm.runInNewContext(['34-core.js', '36-combat.js', '37-skills.js', '38-ai.js'].map(src).join('\n') + '\nCore', {});
const eq = (a, b) => assert.strictEqual(JSON.stringify(a), JSON.stringify(b)); // mảng từ vm khác realm nên so qua JSON
const rd = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const DATA = { terrain: rd('data/terrain.json'), units: rd('data/units.json'), weapons: rd('data/weapons.json'), skills: rd('data/skills.json'), ai: rd('data/ai.json'), maps: {} };
for (const f of fs.readdirSync(path.join(ROOT, 'data/maps'))) if (f.endsWith('.json')) { const m = rd('data/maps/' + f); DATA.maps[m.id] = m; }
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok', name); };

const mk = terrain => Core.loadMap({ id: 'ai', terrain, height: terrain.map(r => '0'.repeat(r.length)) }, DATA);
const put = (S, tpl, side, x, y, o = {}) => {
  const u = Core.makeUnit(tpl, DATA, side, x, y, S.units.length + 1);
  if (o.mov !== undefined) u.stats.mov = o.mov; if (o.hp !== undefined) u.hp = o.hp;
  S.units.push(u); return u;
};
const snap = S => JSON.stringify(S);

// ---------- Kỳ vọng trận ----------
t('aiExpect khớp Core.fight thật (trung bình 4000 seed, sai số < 2%)', () => {
  const S = mk(['F...']);
  const a = put(S, 'vien_kiem', 'dich', 1, 0), d = put(S, 'dang', 'ta', 0, 0);   // Đăng đứng rừng: né cao, có phản đòn
  const ctx = { distance: 1, atkTerrain: Core.terrainOf(S, 1, 0, DATA), defTerrain: Core.terrainOf(S, 0, 0, DATA) };
  const e = Core.aiExpect(Core.forecast(a, d, ctx), a.hp, d.hp);
  const N = 4000, sum = { dealt: 0, taken: 0, kill: 0, die: 0 };
  for (let s = 1; s <= N; s++) {
    a.hp = a.stats.hp; d.hp = d.stats.hp; d.retreated = a.retreated = false;
    const r = Core.fight(a, d, Object.assign({ seed: s }, ctx));
    sum.dealt += d.stats.hp - d.hp; sum.taken += a.stats.hp - a.hp; sum.kill += d.hp === 0; sum.die += a.hp === 0;
  }
  for (const k in sum) assert.ok(Math.abs(sum[k] / N - e[k]) < .02 * Math.max(1, e[k]), `${k}: thực ${sum[k] / N} / kỳ vọng ${e[k]}`);
  assert.ok(e.taken > 0);                                                       // có phản đòn
});
t('aiExpect: chắc chắn hạ thì kill = 1, không phản đòn', () => {
  const S = mk(['...']); const a = put(S, 'tran', 'dich', 0, 0), d = put(S, 'linh', 'ta', 1, 0, { hp: 1 });
  a.stats.skl = 60;                                                             // trúng 100
  const e = Core.aiExpect(Core.forecast(a, d, { distance: 1 }), a.hp, d.hp);
  assert.strictEqual(e.kill, 1); assert.strictEqual(e.taken, 0); assert.strictEqual(e.dealt, 1);
});

// ---------- planTurn: không đổi trạng thái, tất định ----------
t('planTurn không đổi trạng thái (vị trí, HP, vũ khí, túi, tài nguyên) và tất định', () => {
  const S = Core.loadMap(DATA.maps.thu, DATA);
  const before = snap(S), plans = S.units.map(u => Core.planTurn(S, u, DATA));
  assert.strictEqual(snap(S), before);
  eq(S.units.map(u => Core.planTurn(S, u, DATA)), plans);
  for (const p of plans) {                                                      // ô đứng hợp lệ
    const u = S.units.find(o => o.uid === p.uid);
    assert.ok(Core.canStopAt(Core.reachable(S, u, DATA), p.x, p.y), u.name);
  }
});
t('planTurn với kỹ năng (đặt tạm vị trí) cũng không đổi trạng thái', () => {
  const S = mk(['.......']); const u = put(S, 'dang', 'dich', 6, 0); put(S, 'vien_kiem', 'ta', 2, 0);
  u.inventory = []; u.weapon = null;
  const before = snap(S), p = Core.planTurn(S, u, DATA);
  assert.strictEqual(snap(S), before); assert.strictEqual(p.action.type, 'skill');
});

// ---------- Chấm điểm ----------
t('ưu tiên hạ gục: chọn mục tiêu yếu máu dù sát thương danh nghĩa thấp hơn', () => {
  const S = mk(['.....', '.....', '.....']);
  const u = put(S, 'tran', 'dich', 2, 1, { mov: 0 });
  put(S, 'vien_kiem', 'ta', 1, 1); const weak = put(S, 'tran', 'ta', 3, 1, { hp: 2 });   // Trấn Thủ cao nhưng còn 2 HP
  const p = Core.planTurn(S, u, DATA);
  assert.strictEqual(p.action.target, weak.uid); assert.ok(p.action.parts.kill > .5);
  assert.ok(p.action.parts.dealt <= 2);
});
t('tránh phản đòn: đứng cách 2 đánh lửa đèn khi đối phương cầm kiếm tầm 1', () => {
  const S = mk(['.....']); put(S, 'dang', 'ta', 0, 0); const foe = put(S, 'dang', 'dich', 4, 0, { mov: 9 });
  const p = Core.planTurn(S, foe, DATA);
  eq([p.x, p.y], [2, 0]); assert.strictEqual(p.action.weapon, 'lua_den'); assert.strictEqual(p.action.parts.taken, 0);
  eq(p.path, [[4, 0], [3, 0], [2, 0]]);
});
t('rủi ro ô đứng: ô rừng tốt nhất nhưng nằm trong tầm quân địch thứ hai thì bỏ', () => {
  //  .......
  //  ...TFX.   T = mục tiêu (3,1), F = rừng (4,1), X = Trấn đứng yên (5,1) chỉ đe dọa các ô kề nó
  const build = withTran => {
    const S = mk(['.......', '....F..', '.......', '.......']);
    const u = put(S, 'vien_kiem', 'dich', 4, 3);                                // lính ở (4,3), Mov 5
    const tg = put(S, 'linh', 'ta', 3, 1);
    tg.inventory = [Core.makeWeapon('kiem_sat', DATA)]; Core.equipFirst(tg);    // cho Linh phản đòn tầm 1
    if (withTran) put(S, 'tran', 'ta', 5, 1, { mov: 0 });
    return { S, u, tg };
  };
  let { S, u, tg } = build(false), p = Core.planTurn(S, u, DATA);
  assert.strictEqual(p.action.target, tg.uid); eq([p.x, p.y], [4, 1]);         // không ai đe dọa: chọn rừng (né cao)
  ({ S, u, tg } = build(true)); p = Core.planTurn(S, u, DATA);
  assert.strictEqual(p.action.target, tg.uid); assert.notDeepStrictEqual([p.x, p.y], [4, 1]);
  assert.ok(Core.canStopAt(Core.reachable(S, u, DATA), 4, 1));                  // rừng vẫn đi tới được, chỉ bị bỏ vì rủi ro
  assert.ok(Math.abs(p.x - 5) + Math.abs(p.y - 1) > 1);                        // ô chọn ngoài tầm Trấn
});
t('kỹ năng sát thương: chấm như đánh (không phản đòn), trừ điểm theo tài nguyên; hết tài nguyên thì không dùng', () => {
  const S = mk(['.......']); const u = put(S, 'dang', 'dich', 6, 0); const tg = put(S, 'vien_kiem', 'ta', 2, 0);
  u.inventory = []; u.weapon = null;
  let p = Core.planTurn(S, u, DATA);
  assert.strictEqual(p.action.skill, 'hoa'); eq([p.action.tx, p.action.ty], [tg.x, tg.y]);
  assert.strictEqual(p.action.parts.taken, 0);
  const d = Math.abs(p.x - tg.x) + Math.abs(p.y - tg.y); assert.ok(d >= 1 && d <= 2);
  const r = Core.useSkill(S, Object.assign(u, { x: p.x, y: p.y }), 'hoa', p.action.tx, p.action.ty, DATA, { seed: 1 });
  assert.ok(r.ok);
  u.x = 6; u.res.dau_den = 1; p = Core.planTurn(S, u, DATA);
  assert.strictEqual(p.action, null);                                           // không vũ khí, không đủ Dầu → đứng yên
  eq(p.path, [[6, 0]]);
});
t('không có nước đánh: tiến về ô gần nhất đánh được, đi xa nhất trong tầm; dân làng (không vũ khí) đứng yên', () => {
  const S = mk(['............']); put(S, 'dang', 'ta', 0, 0);
  const u = put(S, 'vien_kiem', 'dich', 11, 0, { mov: 3 }), villager = put(S, 'dan_lang', 'npc', 6, 0);
  let p = Core.planTurn(S, u, DATA);
  assert.strictEqual(p.action, null); eq([p.x, p.y], [8, 0]);
  villager.side = 'ta';                                                         // kể cả khi là phe ta
  p = Core.planTurn(S, Core.unitAt(S, 6, 0), DATA); assert.strictEqual(p.action, null); eq(p.path, [[6, 0]]);
});
t('bị vây (ô nào cũng rủi ro): vẫn đánh vì đứng yên cũng chịu rủi ro đó', () => {
  //  Lính đứng giữa Đăng, Linh, Trấn — đúng cảnh địch kẹt cạnh đội ta trên map thử.
  const S = mk(['.....', '.....', '.....']);
  const u = put(S, 'vien_kiem', 'dich', 2, 1, { mov: 0 });
  put(S, 'dang', 'ta', 1, 1); put(S, 'linh', 'ta', 2, 2); put(S, 'tran', 'ta', 3, 1);
  const p = Core.planTurn(S, u, DATA);
  assert.ok(p.action, 'phải đánh'); assert.ok(p.action.parts.risk > 0);
  assert.ok(p.score < 0);                                                       // điểm tuyệt đối âm nhưng vẫn hơn đứng yên
});
t('nước đánh điểm ≤ minScore (0 sát thương, ăn phản đòn) thì không đánh', () => {
  const S = mk(['...']); const u = put(S, 'dan_lang', 'dich', 0, 0); put(S, 'tran', 'ta', 1, 0);
  u.inventory = [Core.makeWeapon('kiem_sat', DATA)]; Core.equipFirst(u); u.stats.mov = 0;   // 1+5 Công vs Thủ 11 → 0 sát thương
  const p = Core.planTurn(S, u, DATA);
  assert.strictEqual(p.action, null);
});
t('trọng số đọc từ data.ai; thiếu thì dùng mặc định', () => {
  const S = mk(['.....']); put(S, 'dang', 'ta', 0, 0); const foe = put(S, 'dang', 'dich', 4, 0, { mov: 9 });
  const D = Object.assign({}, DATA); delete D.ai;
  eq(Core.planTurn(S, foe, D), Core.planTurn(S, foe, DATA));                     // data/ai.json = giá trị mặc định
  D.ai = { weights: { damage: 0, kill: 0 }, minScore: 0 };                       // không thưởng gì → không đánh
  assert.strictEqual(Core.planTurn(S, foe, D).action, null);
});

// ---------- AI vs AI (map thử, theo seed) ----------
// Mỗi phe đi lần lượt theo thứ tự S.units; mọi quân dùng planTurn. Dừng khi Đăng/Linh ngã, hết địch, hoặc quá 40 lượt.
function aiVsAi(seed) {
  const S = Core.loadMap(DATA.maps.thu, DATA), rng = Core.rng(seed), log = [];
  let result = 'hoa';
  outer: for (let turn = 1; turn <= 40; turn++) for (const side of ['ta', 'dich', 'npc']) {
    for (const u of S.units.filter(o => o.side === side)) {
      if (u.hp <= 0) continue;
      const p = Core.planTurn(S, u, DATA);
      assert.ok(Core.canStopAt(Core.reachable(S, u, DATA), p.x, p.y), `seed ${seed}: ô đứng lỗi`);
      u.x = p.x; u.y = p.y;
      let res = null; const a = p.action;
      if (a && a.type === 'attack') {
        const tg = S.units.find(o => o.uid === a.target), w = u.inventory[a.slot];
        u.weapon = w; u.inventory.splice(a.slot, 1); u.inventory.unshift(w);
        res = Core.fight(u, tg, { rng, distance: Math.abs(u.x - tg.x) + Math.abs(u.y - tg.y), atkTerrain: Core.terrainOf(S, u.x, u.y, DATA), defTerrain: Core.terrainOf(S, tg.x, tg.y, DATA) });
        assert.ok(res.strikes.length, `seed ${seed}: đánh không ra đòn`);
      } else if (a && a.type === 'skill') {
        const r = Core.useSkill(S, u, a.skill, a.tx, a.ty, DATA, { rng });
        assert.ok(r.ok, `seed ${seed}: ${r.error}`); res = r.combat;
      }
      log.push([turn, u.uid, p.x, p.y, a ? a.type : '-', res ? res.strikes.map(s => s.damage) : []]);
      const pos = S.units.filter(o => o.hp > 0).map(o => o.x + ',' + o.y);
      assert.strictEqual(new Set(pos).size, pos.length, `seed ${seed}: hai quân chồng ô`);
      if (res && res.outcome && res.outcome.gameOver) { result = 'dich'; break outer; }
      if (!S.units.some(o => o.side === 'dich' && o.hp > 0)) { result = 'ta'; break outer; }
    }
  }
  return { result, log };
}
t('AI vs AI 100 trận trên map thử: không lỗi, không chồng ô, trận nào cũng có đánh nhau', () => {
  const tally = { ta: 0, dich: 0, hoa: 0 };
  for (let s = 1; s <= 100; s++) {
    const r = aiVsAi(s); tally[r.result]++;
    assert.ok(r.log.some(l => l[4] !== '-'), `seed ${s}: không ai đánh`);
  }
  console.log('   kết quả 100 trận:', JSON.stringify(tally));
});
t('AI vs AI: cùng seed → cùng nhật ký; khác seed → có thể khác', () => {
  eq(aiVsAi(7), aiVsAi(7));
  assert.ok([1, 2, 3, 4, 5].some(s => JSON.stringify(aiVsAi(s).log) !== JSON.stringify(aiVsAi(7).log)));
});
console.log(n + ' bài kiểm thử đạt');
