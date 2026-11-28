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

// ---------- Hành vi gắn theo đơn vị (tuần 4 mục 2) ----------
const beh = (u, ai) => { u.ai = Object.assign({}, ai); return u; };
t('hành vi: mặc định lao_vao; mẫu khai báo ai; roster {tpl, ai} ghi đè; validateAi bắt hành vi lạ', () => {
  eq(Core.validateAi(DATA), []); eq(Core.validateMap(DATA.maps.hanhvi, DATA), []);
  const S = Core.loadMap(DATA.maps.hanhvi, DATA), by = n => S.units.filter(u => u.tpl === n);
  assert.strictEqual(Core.planTurn(S, by('dang')[0], DATA).behavior, 'lao_vao');
  assert.strictEqual(by('vien_tac')[0].ai.type, 'dao_tac'); assert.ok(by('vien_tac')[0].moRuong);
  eq(by('vien_kiem').map(u => u.ai.type), ['ho_ve', 'cho_tam']); eq(by('vien_kiem')[0].home, [6, 2]);
  const D = JSON.parse(JSON.stringify(DATA));
  D.units.templates.vien_kiem.ai = { type: 'ngu' }; D.maps.hanhvi.roster.E[1] = { tpl: 'vien_tac', ai: { type: 'dao_tac', then: 'dao_tac' } };
  const e = Core.validateAi(D).join('\n'); assert.ok(/ngu/.test(e) && /then/.test(e), e);
  const u = Core.loadMap(D.maps.thu, D).units.find(o => o.tpl === 'vien_kiem');
  assert.throws(() => Core.planTurn(Core.loadMap(D.maps.thu, D), u, D), /hành vi AI lạ/);
});
t('Giữ vị trí: không rời bán kính quanh ô xuất phát; địch xa thì đứng, địch tới gần thì đánh; bị đẩy ra thì quay về', () => {
  const S = mk(['............']); const u = beh(put(S, 'vien_kiem', 'dich', 8, 0), { type: 'giu_vi_tri', radius: 1 }); const f = put(S, 'linh', 'ta', 2, 0, { hp: 3 });
  let p = Core.planTurn(S, u, DATA); assert.strictEqual(p.action, null); eq(p.path, [[8, 0]]);
  f.x = 6; p = Core.planTurn(S, u, DATA);                                       // đứng (7,0) — trong bán kính 1 — đánh được
  assert.strictEqual(p.action.type, 'attack'); eq([p.x, p.y], [7, 0]);
  f.x = 0; u.x = 4; p = Core.planTurn(S, u, DATA);                              // bị kéo ra xa: quay về trong bán kính
  assert.strictEqual(p.action, null); assert.ok(Math.abs(p.x - 8) <= 1);
});
t('Chỉ phản ứng khi vào tầm: ngủ thì đứng yên; đánh được thì đánh (wake); đã thức hoặc bị thương thì như Lao vào', () => {
  const S = mk(['............']); const u = beh(put(S, 'vien_kiem', 'dich', 11, 0, { mov: 3 }), { type: 'cho_tam' }); const f = put(S, 'linh', 'ta', 0, 0, { hp: 3 });
  let p = Core.planTurn(S, u, DATA); assert.strictEqual(p.action, null); eq(p.path, [[11, 0]]); assert.ok(!p.wake);
  u.awake = true; p = Core.planTurn(S, u, DATA); eq([p.x, p.y], [8, 0]);        // thức: tiến như lao_vao
  u.awake = false; u.hp--; p = Core.planTurn(S, u, DATA); eq([p.x, p.y], [8, 0]); u.hp++;
  f.x = 7; p = Core.planTurn(S, u, DATA); assert.strictEqual(p.action.type, 'attack'); assert.strictEqual(p.wake, true);
});
t('Đứng yên (boss): không bao giờ rời ô; chỉ đánh ai đứng trong tầm vũ khí', () => {
  const S = mk(['.......']); const u = beh(put(S, 'vien_kiem', 'dich', 6, 0), { type: 'dung_yen' }); const f = put(S, 'linh', 'ta', 3, 0, { hp: 3 });
  let p = Core.planTurn(S, u, DATA); assert.strictEqual(p.action, null); eq(p.path, [[6, 0]]);
  f.x = 5; p = Core.planTurn(S, u, DATA); assert.strictEqual(p.action.type, 'attack'); eq(p.path, [[6, 0]]);
});
t('Hộ vệ: chỉ đánh trong bán kính quanh người được hộ vệ, ưu tiên địch đe dọa người đó; không đánh thì đứng cạnh, ô an toàn', () => {
  //  W = Y sư (0,1). Linh (5,0) đe dọa nó? không — Linh ở xa. Đăng (1,2) kề Y sư.
  const S = mk(['.......', '.......', '.......']);
  const ward = put(S, 'vien_y', 'dich', 0, 1), u = beh(put(S, 'vien_kiem', 'dich', 3, 1), { type: 'ho_ve', follow: 'vien_y', radius: 2 });
  const far = put(S, 'linh', 'ta', 6, 1, { hp: 3 });
  let p = Core.planTurn(S, u, DATA);                                            // Linh 3 HP dễ hạ nhưng ở ngoài bán kính → không đi
  assert.strictEqual(p.action, null); assert.ok(Math.abs(p.x - ward.x) + Math.abs(p.y - ward.y) <= 2);
  const lao = Core.planTurn(S, beh(u, { type: 'lao_vao' }), DATA); assert.strictEqual(lao.action.target, far.uid);   // so sánh: lao_vao thì đi hạ
  const near = put(S, 'vien_kiem', 'ta', 1, 2);                                 // địch kề Y sư
  p = Core.planTurn(S, beh(u, { type: 'ho_ve', follow: 'vien_y' }), DATA);
  assert.strictEqual(p.action.target, near.uid); assert.ok(p.action.parts.guard > 0);
  ward.hp = 0; assert.strictEqual(Core.planTurn(S, u, DATA).behavior, 'lao_vao');   // người được hộ vệ đã ngã → Lao vào
});
t('Đạo tặc: tới ô kề rương → mở (Core.openChest) → chạy tới ô thoát → rời trận; hết rương thì Lao vào', () => {
  const S = mk(['..........', '..........']); S.exits = [[1, 1]];
  const u = put(S, 'vien_tac', 'dich', 9, 0); S.chests.push({ x: 5, y: 0, item: 'thuoc_nho', open: false });
  const f = put(S, 'linh', 'ta', 9, 1);                                         // có mục tiêu ngay cạnh nhưng không đánh
  let p = Core.planTurn(S, u, DATA);
  eq(p.action, { type: 'open', x: 5, y: 0 }); assert.strictEqual(Math.abs(p.x - 5) + Math.abs(p.y), 1);
  u.x = p.x; u.y = p.y; const r = Core.aiAct(S, u, p.action, DATA, { seed: 1 });
  assert.ok(r.ok); assert.ok(S.chests[0].open); eq(S.chests[0].takenBy, { uid: u.uid, side: 'dich' }); eq(u.loot, ['thuoc_nho']);
  assert.ok(!Core.openChest(S, u, 5, 0).ok);                                    // mở lại → lỗi
  p = Core.planTurn(S, u, DATA); assert.strictEqual(p.action && p.action.type, 'escape'); eq([p.x, p.y], [1, 1]);
  S.exits = [[0, 0]]; assert.strictEqual(Core.planTurn(S, u, DATA).action, null);   // ô thoát ngoài tầm: chỉ chạy về phía đó
  S.exits = [[1, 1]]; u.x = 1; u.y = 1; assert.ok(Core.aiAct(S, u, p.action, DATA, {}).ok); assert.ok(u.escaped); assert.strictEqual(u.hp, 0);
  assert.strictEqual(Core.unitAt(S, 1, 1), null);
  // Hết rương, không mang đồ → then (lao_vao): đánh Linh. Quân không có moRuong không mở được.
  const v = put(S, 'vien_tac', 'dich', 8, 1); f.hp = 3; assert.strictEqual(Core.planTurn(S, v, DATA).action.target, f.uid);
  S.chests.push({ x: 2, y: 0, item: 'x', open: false }); const k = put(S, 'vien_kiem', 'dich', 2, 1);
  assert.ok(/không mở được/.test(Core.openChest(S, k, 2, 0).error));
});
t('Đạo tặc ở xa: tiến về rương; không có exits thì mép map là ô thoát', () => {
  const S = mk(['............', '............', '............']); const u = put(S, 'vien_tac', 'dich', 11, 1, { mov: 3 });
  S.chests.push({ x: 0, y: 1, item: 'x', open: false });
  const p = Core.planTurn(S, u, DATA); assert.strictEqual(p.action, null); eq([p.x, p.y], [8, 1]);
  assert.ok(Core.isExit(S, 0, 2) && Core.isExit(S, 11, 0) && !Core.isExit(S, 5, 1));
});
t('Hồi máu: kỹ năng heal = Phép + mt, kẹp HP tối đa, trừ tài nguyên; heal phải nhắm đồng minh', () => {
  const S = mk(['....']); const h = put(S, 'vien_y', 'dich', 0, 0), a = put(S, 'vien_kiem', 'dich', 1, 0, { hp: 3 });
  assert.strictEqual(Core.skillForecast(S, h, 'chua', 1, 0, DATA).heal, 9);     // Phép 4 + 5
  const r = Core.useSkill(S, h, 'chua', 1, 0, DATA, { seed: 1 });
  assert.ok(r.ok); assert.strictEqual(a.hp, 12); assert.strictEqual(r.effects[0].amount, 9); assert.strictEqual(h.res.linh_luc, 3);
  Core.useSkill(S, h, 'chua', 1, 0, DATA, {}); assert.strictEqual(a.hp, a.stats.hp);   // kẹp HP tối đa
  const D = JSON.parse(JSON.stringify(DATA)); D.skills.skills.chua.target = 'enemy'; D.skills.skills.chua.range = [1, 1];
  assert.ok(/heal cần target ally/.test(Core.validateSkills(D).join()));
});
t('Chữa trị: hồi đồng minh máu thấp nhất (theo tỷ lệ); không ai bị thương thì theo đồng minh gần nhất, không hành động', () => {
  const S = mk(['.......', '.......']);
  const h = put(S, 'vien_y', 'dich', 3, 1), a = put(S, 'vien_kiem', 'dich', 1, 0, { hp: 12 }), b = put(S, 'vien_giao', 'dich', 5, 0, { hp: 6 });
  let p = Core.planTurn(S, h, DATA);
  assert.strictEqual(p.action.skill, 'chua'); assert.strictEqual(p.action.target, b.uid); assert.strictEqual(p.action.parts.heal, 9);
  a.hp = a.stats.hp; b.hp = b.stats.hp; h.x = 6; h.y = 1; a.x = 0; b.x = 1;
  p = Core.planTurn(S, h, DATA); assert.strictEqual(p.action, null);
  assert.ok(Math.abs(p.x - b.x) + Math.abs(p.y - b.y) <= 2, 'đi theo đồng minh gần nhất');
  h.res.linh_luc = 0; a.hp = 1; assert.strictEqual(Core.planTurn(S, h, DATA).action, null);   // hết Linh lực
});
t('Bảo vệ Đăng/Linh: Linh không có nước đánh thì không tiến vào ô bị đe dọa; đồng đội ưu tiên hạ địch đe dọa Linh', () => {
  //  Linh (0,0) Mov 5, lính (9,0) Mov 5 đe dọa các ô từ x ≥ 3. Quân thường thì tiến tới; Linh thì đứng ngoài tầm.
  const S = mk(['..........', '..........']); const L = put(S, 'linh', 'ta', 0, 0); put(S, 'vien_kiem', 'dich', 9, 0);
  let p = Core.planTurn(S, L, DATA); assert.strictEqual(p.action, null); assert.strictEqual(p.parts, undefined);
  assert.ok(p.score === 0, 'Linh đứng ô không bị đe dọa');
  L.tpl = 'vien_kiem'; const q = Core.planTurn(S, L, DATA); L.tpl = 'linh';
  assert.ok(q.score < 0 && q.x > p.x, 'cùng chỉ số nhưng không phải Linh thì tiến vào vùng bị đe dọa');
  const D = JSON.parse(JSON.stringify(DATA));
  //  Trấn đứng giữa 2 lính giống hệt nhau: hạ con đang kề Linh.
  const T = mk(['.....', '.....', '.....']); const tran = put(T, 'tran', 'ta', 2, 1, { mov: 0 });
  put(T, 'linh', 'ta', 4, 1); const e1 = put(T, 'vien_kiem', 'dich', 1, 1, { hp: 3, mov: 0 }), e2 = put(T, 'vien_kiem', 'dich', 3, 1, { hp: 3, mov: 0 });   // chỉ e2 với tới Linh
  p = Core.planTurn(T, tran, DATA); assert.strictEqual(p.action.target, e2.uid); assert.ok(p.action.parts.guard > 0);
  D.ai.weights.lordTile = 3; D.ai.weights.guard = 0; assert.strictEqual(Core.planTurn(T, tran, D).action.target, e1.uid);   // không thưởng → gặp trước
});

// ---------- AI vs AI (theo seed) ----------
// Mỗi phe đi lần lượt theo thứ tự S.units; mọi quân dùng planTurn + aiAct. Dừng khi Đăng/Linh ngã, hết địch, hoặc quá 40 lượt.
function aiVsAi(seed, mapId = 'thu') {
  const S = Core.loadMap(DATA.maps[mapId], DATA), rng = Core.rng(seed), log = [], seen = {};
  let result = 'hoa';
  outer: for (let turn = 1; turn <= 40; turn++) for (const side of ['ta', 'dich', 'npc']) {
    for (const u of S.units.filter(o => o.side === side)) {
      if (u.hp <= 0) continue;
      const p = Core.planTurn(S, u, DATA);
      assert.ok(Core.canStopAt(Core.reachable(S, u, DATA), p.x, p.y), `seed ${seed}: ô đứng lỗi`);
      if (p.wake) { u.awake = true; seen.wake = (seen.wake || 0) + 1; }
      if (u.ai.type === 'dung_yen') assert.ok(p.x === u.home[0] && p.y === u.home[1], `seed ${seed}: boss rời ô`);
      if (u.ai.type === 'giu_vi_tri') assert.ok(Math.abs(p.x - u.home[0]) + Math.abs(p.y - u.home[1]) <= 2, `seed ${seed}: giữ vị trí rời bán kính`);
      u.x = p.x; u.y = p.y;
      const a = p.action, r = a ? Core.aiAct(S, u, a, DATA, { rng }) : null;
      if (a) { assert.ok(r.ok, `seed ${seed}: ${a.type} lỗi: ${r.error}`); const k = a.type === 'skill' && r.effects.some(e => e.type === 'heal') ? 'heal' : a.type; seen[k] = (seen[k] || 0) + 1; }
      const res = r && r.combat;
      if (a && a.type === 'attack') assert.ok(res.strikes.length, `seed ${seed}: đánh không ra đòn`);
      log.push([turn, u.uid, p.x, p.y, a ? a.type : '-', res ? res.strikes.map(s => s.damage) : []]);
      const pos = S.units.filter(o => o.hp > 0).map(o => o.x + ',' + o.y);
      assert.strictEqual(new Set(pos).size, pos.length, `seed ${seed}: hai quân chồng ô`);
      assert.ok(!S.units.some(o => o.hp > 0 && Core.chestAt(S, o.x, o.y)), `seed ${seed}: quân đứng lên rương`);
      if (res && res.outcome && res.outcome.gameOver) { result = 'dich'; break outer; }
      if (!S.units.some(o => o.side === 'dich' && o.hp > 0)) { result = 'ta'; break outer; }
    }
  }
  return { result, log, seen, S };
}
t('AI vs AI 100 trận trên map thử: không lỗi, không chồng ô, trận nào cũng có đánh nhau; phe ta biết che Đăng/Linh', () => {
  const tally = { ta: 0, dich: 0, hoa: 0 };
  for (let s = 1; s <= 100; s++) {
    const r = aiVsAi(s); tally[r.result]++;
    assert.ok(r.log.some(l => l[4] !== '-'), `seed ${s}: không ai đánh`);
  }
  console.log('   kết quả 100 trận (map thử):', JSON.stringify(tally));
  assert.ok(tally.dich <= 20, 'trước tuần 4 mục 2: địch thắng 78/100');
});
t('AI vs AI 100 trận trên map hành vi: đủ 7 hành vi chạy không lỗi; có mở rương, hồi máu, đánh thức, thoát', () => {
  const tally = { ta: 0, dich: 0, hoa: 0 }, seen = {}; let opened = 0, escaped = 0;
  for (let s = 1; s <= 100; s++) {
    const r = aiVsAi(s, 'hanhvi'); tally[r.result]++;
    for (const k in r.seen) seen[k] = (seen[k] || 0) + r.seen[k];
    opened += r.S.chests.filter(c => c.open).length; escaped += r.S.units.filter(u => u.escaped).length;
  }
  console.log('   kết quả 100 trận (map hành vi):', JSON.stringify(tally), 'hành động:', JSON.stringify(seen), 'rương mở:', opened, 'đạo tặc thoát:', escaped);
  for (const k of ['attack', 'open', 'heal', 'wake']) assert.ok(seen[k] > 0, 'chưa thấy ' + k);
});
t('AI vs AI: cùng seed → cùng nhật ký; khác seed → có thể khác', () => {
  eq(aiVsAi(7).log, aiVsAi(7).log); eq(aiVsAi(7, 'hanhvi').log, aiVsAi(7, 'hanhvi').log);
  assert.ok([1, 2, 3, 4, 5].some(s => JSON.stringify(aiVsAi(s).log) !== JSON.stringify(aiVsAi(7).log)));
});
console.log(n + ' bài kiểm thử đạt');
