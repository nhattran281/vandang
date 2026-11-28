// Kiểm thử khung chương + Ch.1 (tuần 5 mục 4) không cần trình duyệt: node tools/test_chapter.js
// Dữ liệu chương (data/chapters.json), điều kiện thắng/thua (Core.outcome), luật chương, luồng chương → lưu → chương sau,
// và AI vs AI 100 trận trên Ch.1 (in tỷ lệ thắng, số lượt trung bình, ai hay ngã).
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const ROOT = path.dirname(__dirname);
const src = f => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');
const { Core, Play, Save } = vm.runInNewContext(['34-core.js', '36-combat.js', '36-play.js', '37-skills.js', '38-ai.js', '39-level.js', '39-save.js'].map(src).join('\n') + '\n({ Core, Play, Save })', {});
const eq = (a, b, m) => assert.strictEqual(JSON.stringify(a), JSON.stringify(b), m);
const rd = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const DATA = { terrain: rd('data/terrain.json'), units: rd('data/units.json'), classes: rd('data/classes.json'), weapons: rd('data/weapons.json'), skills: rd('data/skills.json'), ai: rd('data/ai.json'), chapters: rd('data/chapters.json'), maps: {} };
for (const f of fs.readdirSync(path.join(ROOT, 'data/maps'))) if (f.endsWith('.json')) { const m = rd('data/maps/' + f); DATA.maps[m.id] = m; }
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok', name); };
const clone = o => JSON.parse(JSON.stringify(o));
const byTpl = (S, id) => S.units.find(u => u.tpl === id);
const ch1 = (mode, seed) => { const C = Save.newCampaign(DATA, { mode: mode || 'casual', seed: seed || 5 }); const r = Save.startChapter(C, DATA); return { C, S: r.S, seed: r.seed }; };
const foes = S => S.units.filter(u => u.side === 'dich');

// ---------- Dữ liệu chương ----------
t('chapters.json hợp lệ; Ch.1 là chương đầu, map A làng chài', () => {
  eq(Save.validateCampaign(DATA), []);
  const c = Save.chapters(DATA)[0];
  eq([c.id, c.map, c.join], ['ch1', 'lang_chai', ['dang', 'linh', 'tran']]);
  eq(Core.validateMap(DATA.maps.lang_chai, DATA), []);
});
t('kiểm tra chương bắt lỗi: điều kiện lạ, reach thiếu quân, luật lạ, join lạ, hội thoại dài, gợi ý lạ, deadzone kiểu cũ', () => {
  const bad = [
    c => { c.win = 'thang_ngay'; }, c => { c.win = { type: 'reach', units: ['cuoi'] }; }, c => { c.win = { type: 'reach', tiles: [[0, 0]] }; },
    c => { c.win = { type: 'survive', turns: 0 }; }, c => { c.win = { type: 'boss' }; }, c => { c.win = { type: 'area', rect: [3, 3, 99, 4] }; },
    c => { c.lose = { type: 'turns' }; }, c => { c.lose = { type: 'protect', tpl: 'cuoi' }; }, c => { c.rules = { sương: true }; }, c => { c.rules = { fog: 1 }; },
    c => { c.join = ['hung_no']; }, c => { c.intro = [{ who: 'dang', text: 'x'.repeat(141) }]; }, c => { c.outro = [{ who: 'khong_co', text: 'a' }]; },
    c => { c.tutorial = { turns: 2, hints: { lung_tung: 'a' } }; }, c => { c.deadzone = true; }, c => { c.map = 'khong_co'; },
    c => { c.roster = { A: ['dang'], E: [] }; },   // ghi đè roster lệch số ký hiệu trên lớp quân
  ];
  for (const f of bad) { const D = clone(DATA); f(D.chapters.chapters[0]); assert.ok(Save.validateCampaign(D).length >= 1, f.toString()); }
});
t('Ch.1: 3 quân ta, 5–6 lính Viện kiếm/giáo, không kỹ năng, không trạng thái, không sương; thắng = hạ hết hoặc Đăng + Linh lên thuyền', () => {
  const { S } = ch1();
  eq(S.units.filter(u => u.side === 'ta').map(u => u.tpl).sort(), ['dang', 'linh', 'tran']);
  const E = foes(S); assert.ok(E.length >= 5 && E.length <= 6);
  for (const u of E) assert.ok(['vien_kiem', 'vien_giao'].includes(u.tpl), u.tpl);
  eq(S.rules, { noSkills: true, noStatus: true, fog: false, deadZone: false });
  eq(S.goal.win.map(c => c.type), ['rout', 'reach']); eq(S.goal.win[1].units, ['dang', 'linh']);
  eq(Core.goalTiles(S, S.goal.win[1]), [[5, 1], [6, 1]]);
  assert.strictEqual(S.biome, 'dunes'); assert.ok(!S.tiles.some(t => t.h > 1), 'gần như phẳng');
  const txt = Core.goalText(S.goal, DATA); eq(txt, { win: 'Hạ hết quân địch hoặc đưa Đăng và Linh lên thuyền', lose: 'Đăng hoặc Linh ngã' });
});
t('Ch.1: thuyền tới được bằng đường bộ; quân ta ở mép Nam, địch giữ bến', () => {
  const { S } = ch1(); const d = byTpl(S, 'dang');
  for (const [x, y] of S.exits) assert.ok(Core.reachable(S, d, DATA, { mov: 99, passSides: ['ta', 'dich'] }).cost.has(y * S.w + x), `thuyền (${x},${y})`);
  assert.ok(S.units.filter(u => u.side === 'ta').every(u => u.y >= 13));
  assert.ok(foes(S).some(u => u.ai.type === 'giu_vi_tri' && u.y <= 3));
});

// ---------- Điều kiện thắng / thua ----------
const mini = (goal, layout) => {
  const units = layout || ['A....E', '.A....', '......'], nE = units.join('').split('E').length - 1;
  const S = Core.loadMap({ id: 'mini', terrain: ['......', '......', '......'], height: ['000000', '000000', '000000'], exits: [[5, 0]],
    units, roster: { A: ['dang', 'linh'], E: Array(nE).fill('vien_kiem') } }, DATA);
  S.goal = Core.normalizeGoal(goal.win, goal.lose); return S;
};
t('rout: hạ hết địch mới thắng; địch thoát khỏi map cũng tính là hết', () => {
  const S = mini({ win: 'rout' }); assert.strictEqual(Core.outcome(S), null);
  foes(S)[0].hp = 0; eq(Core.outcome(S).win, true);
  const T = mini({ win: 'rout' }); Object.assign(foes(T)[0], { hp: 0, escaped: true }); eq(Core.outcome(T).type, 'rout');
});
t('reach: mọi quân cần đều đứng ô đích và đã xong hành động (lượt ta); lượt địch thì tính luôn', () => {
  const S = mini({ win: { type: 'reach', units: ['dang', 'linh'], tiles: [[3, 2], [4, 2]] } }), d = byTpl(S, 'dang'), l = byTpl(S, 'linh');
  Object.assign(d, { x: 3, y: 2 }); assert.strictEqual(Core.outcome(S), null);
  Object.assign(l, { x: 4, y: 2 }); assert.strictEqual(Core.outcome(S), null, 'chưa xong hành động');
  d.done = true; assert.strictEqual(Core.outcome(S), null); l.done = true; eq(Core.outcome(S).type, 'reach');
  d.done = l.done = false; S.phase = 'dich'; eq(Core.outcome(S).win, true);
  const T = mini({ win: { type: 'reach' } }); Object.assign(byTpl(T, 'dang'), { x: 5, y: 1, done: true }); assert.strictEqual(Core.outcome(T), null);
  Object.assign(byTpl(T, 'dang'), { x: 5, y: 0 }); assert.ok(Core.outcome(T).win, 'mặc định: Đăng tới exits');
});
t('boss: hạ hết địch có boss (hoặc mẫu tpl), lính thường còn sống không sao', () => {
  const S = mini({ win: { type: 'boss' } }, ['A....E', '.A...E', '......']);
  const [e1, e2] = foes(S); e2.boss = true; assert.strictEqual(Core.outcome(S), null);
  e2.hp = 0; eq(Core.outcome(S).type, 'boss'); assert.ok(e1.hp > 0);
  const T = mini({ win: { type: 'boss', tpl: 'vien_giao' } }); assert.strictEqual(Core.outcome(T), null, 'không có mẫu đó thì không bao giờ thắng');
});
t('area: cả đội (quân còn trên bàn cờ) trong vùng; quân rút lui không cần', () => {
  const S = mini({ win: { type: 'area', rect: [3, 0, 5, 2] } }), d = byTpl(S, 'dang'), l = byTpl(S, 'linh');
  Object.assign(d, { x: 3, y: 1, done: true }); assert.strictEqual(Core.outcome(S), null);
  Object.assign(l, { x: 4, y: 2, done: true }); eq(Core.outcome(S).type, 'area');
  // không ghi rect/tiles → vùng = exits của map; quân rút lui (không phải Đăng/Linh) không cần tới
  const U = Core.loadMap({ id: 'm2', terrain: ['......'], height: ['000000'], exits: [[5, 0]], units: ['A.A..E'], roster: { A: ['dang', 'tran'], E: ['vien_kiem'] } }, DATA);
  U.goal = Core.normalizeGoal({ type: 'area' }); Object.assign(byTpl(U, 'dang'), { x: 5, done: true }); byTpl(U, 'tran').hp = 0; byTpl(U, 'tran').retreated = true;
  foes(U)[0].x = 3; eq(Core.outcome(U).type, 'area');
});
t('survive N lượt: thắng khi sang lượt N+1; lose turns: quá N lượt chưa thắng thì thua', () => {
  const S = mini({ win: { type: 'survive', turns: 3 } }); S.turn = 3; assert.strictEqual(Core.outcome(S), null); S.turn = 4; eq(Core.outcome(S).type, 'survive');
  const T = mini({ win: 'rout', lose: { type: 'turns', turns: 5 } }); T.turn = 6; eq([Core.outcome(T).win, Core.outcome(T).type], [false, 'turns']);
});
t('thua: Đăng/Linh ngã luôn thua (xét trước thắng); protect: quân được bảo vệ ngã', () => {
  const S = mini({ win: 'rout' }); foes(S)[0].hp = 0; byTpl(S, 'linh').hp = 0;
  eq([Core.outcome(S).win, Core.outcome(S).type, Core.outcome(S).reason], [false, 'lord', 'Linh đã ngã']);
  const T = Core.loadMap({ id: 'm3', terrain: ['......'], height: ['000000'], units: ['A.N..E'], roster: { A: ['dang'], N: ['dan_lang'], E: ['vien_kiem'] } }, DATA);
  T.goal = Core.normalizeGoal('rout', { type: 'protect', tpl: 'dan_lang' }); byTpl(T, 'dan_lang').hp = 0; eq(Core.outcome(T).type, 'protect');
});
t('map thử (không S.goal) không bao giờ kết thúc qua outcome; bản lưu tạm cũ chỉ có S.win = rout vẫn chạy', () => {
  const S = Core.loadMap(DATA.maps.thu, DATA); for (const u of foes(S)) u.hp = 0; assert.strictEqual(Core.outcome(S), null);
  S.win = 'rout'; eq(Core.outcome(S).type, 'rout');
});

// ---------- Luật chương ----------
t('noSkills: AI không dùng kỹ năng, useSkill bị chặn; chương khác vẫn dùng được', () => {
  // như test_ai: Đăng (dựng làm địch, không vũ khí) chỉ còn kỹ năng Hỏa để đánh lính ở cách 4 ô
  const S = Core.loadMap({ id: 'k', terrain: ['.......'], height: ['0000000'], units: ['..A...E'], roster: { A: ['vien_kiem'], E: ['dang'] } }, DATA);
  const d = byTpl(S, 'dang'), e = byTpl(S, 'vien_kiem'); d.inventory = []; d.weapon = null;
  assert.strictEqual(Core.planTurn(S, d, DATA).action.type, 'skill', 'không có luật thì dùng kỹ năng');
  S.rules = { noSkills: true }; const p = Core.planTurn(S, d, DATA); assert.ok(!p.action || p.action.type !== 'skill');
  Object.assign(d, { x: e.x + 2 }); assert.ok(/không dùng kỹ năng/.test(Core.useSkill(S, d, 'hoa', e.x, e.y, DATA, { seed: 1 }).error));
  assert.strictEqual(d.res.dau_den === undefined ? d.res[Object.keys(d.res)[0]] : d.res.dau_den, d.resMax[Object.keys(d.resMax)[0]], 'không trừ tài nguyên');
});
t('Vùng Chết (rules.deadZone) bật chết vĩnh viễn ở Casual', () => {
  const D = clone(DATA); D.chapters.chapters[0].rules.deadZone = true;
  assert.strictEqual(Save.startChapter(Save.newCampaign(D, { mode: 'casual' }), D).S.mode, 'deadzone');
});
t('chương ghi đè lớp quân + roster của map (dùng lại map A cho chương khác)', () => {
  const D = clone(DATA), c = D.chapters.chapters[0];
  c.units = DATA.maps.lang_chai.units.map(r => r.replace(/E/g, '.')); c.units[8] = '.E..........'; c.roster = { A: ['dang', 'tran', 'linh'], E: ['vien_giao'] };
  eq(Save.validateCampaign(D), []);
  const S = Save.startChapter(Save.newCampaign(D), D).S; eq(foes(S).map(u => [u.tpl, u.x, u.y]), [['vien_giao', 1, 8]]);
  assert.strictEqual(DATA.maps.lang_chai.units[8], '............', 'không sửa map gốc');
});

// ---------- Luồng: Play → kết quả → lưu → chương sau ----------
t('Play: Đăng + Linh lên thuyền → chọn Chờ → Thắng (tới nơi); còn ở menu (Hoàn tác được) thì chưa thắng', () => {
  const { S, seed } = ch1(); const P = Play.create(S, DATA, seed); Play.update(P, 5);
  const d = byTpl(S, 'dang'), l = byTpl(S, 'linh'); Object.assign(l, { x: 6, y: 1, done: true }); Object.assign(d, { x: 5, y: 2 });
  for (const u of foes(S)) Object.assign(u, { x: u.x, y: Math.max(u.y, 6) });   // dọn bến cho test
  Play.select(P, d); P.target = { x: 5, y: 1 }; P.path = Core.pathTo(P.R, 5, 1); assert.ok(P.path, 'đi được lên thuyền');
  Play.tap(P, 5, 1); Play.update(P, 1); assert.strictEqual(P.mode, 'menu'); Play.update(P, .1); assert.ok(!P.over, 'chưa Chờ thì chưa thắng');
  Play.wait(P); Play.update(P, .1); eq([P.over.win, P.over.type, P.over.reason], [true, 'reach', 'Đã tới nơi']); assert.ok(P.over.turns >= 1);
});
t('Play: Đăng ngã → Thua (type lord, có số lượt)', () => {
  const { S, seed } = ch1(); const P = Play.create(S, DATA, seed); Play.update(P, 5);
  byTpl(S, 'dang').hp = 0; byTpl(S, 'dang').retreated = true; Play.update(P, .1);
  eq([P.over.win, P.over.type], [false, 'lord']);
});
t('thắng Ch.1 → lưu chương → chiến dịch hết chương (done) và Tiếp tục ra màn hết chiến dịch', () => {
  const { C, S } = ch1(); for (const u of foes(S)) u.hp = 0;
  const C2 = Save.finishChapter(C, S, DATA); eq([C2.chapter, C2.done, C2.party.map(p => p.tpl).sort()], [1, true, ['dang', 'linh', 'tran']]);
  eq(C2.record[0].chapter, 'ch1');
  const st = Save.store(Save.memory(), DATA); st.saveChapter(C2); const r = st.resume(); assert.ok(r.ok && r.done);
});
t('chương sau dùng trạng thái chiến dịch: quân gia nhập giữ cấp/EXP từ chương trước', () => {
  const D = clone(DATA); D.chapters.chapters.push({ id: 'ch1b', name: 'Thử', map: 'lang_chai', join: [], win: 'rout' });
  const C = Save.newCampaign(D, { seed: 2 }), S = Save.startChapter(C, D).S; byTpl(S, 'tran').lv = 9; byTpl(S, 'tran').exp = 42;
  const C2 = Save.finishChapter(C, S, D), S2 = Save.startChapter(C2, D).S; eq([byTpl(S2, 'tran').lv, byTpl(S2, 'tran').exp], [9, 42]);
  assert.strictEqual(S2.chapter, 'ch1b');
});
t('lưu tạm giữa Ch.1 giữ S.goal + S.rules; nạp lại vẫn thắng/thua đúng', () => {
  const { C, S, seed } = ch1(); const P = Play.create(S, DATA, seed); Play.update(P, 5);
  const st = Save.store(Save.memory(), DATA); eq(st.saveSuspend(C, P), { ok: true });
  const r = st.resume(); assert.ok(r.ok && r.resumed); eq(r.S.goal, S.goal); eq(r.S.rules, S.rules);
  for (const u of foes(r.S)) u.hp = 0; eq(Core.outcome(r.S).type, 'rout');
});

// ---------- AI vs AI trên Ch.1 ----------
// Mọi quân (cả quân ta) dùng planTurn + aiAct; thứ tự Ta → Địch → NPC; S.phase / S.turn / u.done chạy như Play.
// Dừng khi Core.outcome có kết quả hoặc quá 30 lượt (hòa). Trả về kết quả + nhật ký + ai đã ngã.
function sim(seed, mode) {
  const C = Save.newCampaign(DATA, { mode: mode || 'casual', seed }), r = Save.startChapter(C, DATA), S = r.S, rng = Core.rng(r.seed), log = [], kills = {}, hits = {};
  let out = null;
  const fallen = () => S.units.filter(u => u.hp <= 0 && !u.escaped).map(u => u.tpl + ':' + u.side);
  loop: for (S.turn = 1; S.turn <= 30; S.turn++) for (const side of ['ta', 'dich', 'npc']) {
    S.phase = side; for (const u of S.units) if (u.side === side) u.done = false;
    if ((out = Core.outcome(S))) break loop;
    for (const u of S.units.filter(o => o.side === side)) {
      if (u.hp <= 0) continue;
      const p = Core.planTurn(S, u, DATA);
      assert.ok(Core.canStopAt(Core.reachable(S, u, DATA), p.x, p.y), `seed ${seed}: ô đứng lỗi`);
      assert.ok(!p.action || p.action.type !== 'skill', `seed ${seed}: dùng kỹ năng ở chương noSkills`);
      if (p.wake) u.awake = true;
      u.x = p.x; u.y = p.y; u.done = true;
      const a = p.action, res = a ? Core.aiAct(S, u, a, DATA, { rng, mode: S.mode }) : null;
      if (a) assert.ok(res.ok, `seed ${seed}: ${a.type} lỗi ${res.error}`);
      const o = res && res.combat && res.combat.outcome;
      if (o) { const k = (o.uid === u.uid ? S.units.find(x => x.uid === a.target) : u).tpl; kills[k] = (kills[k] || 0) + 1; }
      if (res && res.combat) for (const st of res.combat.strikes) if (st.hit && st.damage > 0) { const f = S.units.find(x => x.uid === st.from); hits[f.side] = (hits[f.side] || 0) + st.damage; }
      log.push([S.turn, u.uid, p.x, p.y, a ? a.type : '-', res && res.combat ? res.combat.strikes.map(s => s.damage) : []]);
      const pos = S.units.filter(o => o.hp > 0).map(o => o.x + ',' + o.y); assert.strictEqual(new Set(pos).size, pos.length, `seed ${seed}: chồng ô`);
      if ((out = Core.outcome(S))) break loop;
    }
  }
  return { result: out ? (out.win ? 'ta' : 'dich') : 'hoa', type: out && out.type, turns: Math.min(S.turn, 30), fallen: fallen(), log, kills, hits };
}
t('AI vs AI 100 trận trên Ch.1: không lỗi, không kỹ năng, tất định theo seed; in tỷ lệ thắng, số lượt, ai hay ngã', () => {
  const tally = { ta: 0, dich: 0, hoa: 0 }, types = {}, fall = {}, turns = [], kills = {}, dmg = {};
  for (let s = 1; s <= 100; s++) {
    const r = sim(s); tally[r.result]++; types[r.type] = (types[r.type] || 0) + 1; turns.push(r.turns);
    for (const f of r.fallen) fall[f] = (fall[f] || 0) + 1;
    for (const k in r.kills) kills[k] = (kills[k] || 0) + r.kills[k]; for (const k in r.hits) dmg[k] = (dmg[k] || 0) + r.hits[k];
  }
  const avg = turns.reduce((a, b) => a + b, 0) / turns.length;
  const taFall = Object.fromEntries(Object.entries(fall).filter(([k]) => k.endsWith(':ta')).map(([k, v]) => [k.split(':')[0], v]));
  console.log('   Ch.1 · 100 trận:', JSON.stringify(tally), '· kiểu kết thúc:', JSON.stringify(types));
  console.log('   số lượt trung bình:', avg.toFixed(2), '· ít nhất', Math.min(...turns), '· nhiều nhất', Math.max(...turns));
  console.log('   quân ta ngã (số trận):', JSON.stringify(taFall), '· lính Viện ngã:', Object.entries(fall).filter(([k]) => k.endsWith(':dich')).reduce((a, [, v]) => a + v, 0));
  console.log('   hạ gục theo quân:', JSON.stringify(kills), '· tổng sát thương gây ra:', JSON.stringify(dmg));
  assert.ok(tally.ta >= 85, 'chương hướng dẫn: phe ta phải thắng ≥ 85/100');
  assert.strictEqual(tally.hoa, 0, 'không có trận kéo quá 30 lượt');
  eq(sim(9).log, sim(9).log);
  assert.ok([1, 2, 3, 4].some(s => JSON.stringify(sim(s).log) !== JSON.stringify(sim(9).log)));
});

console.log(n + ' bài kiểm thử đạt');
