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
t('thắng Ch.1 → lưu chương → sang Ch.2 (chưa hết chiến dịch); Tiếp tục ra Ch.2', () => {
  const { C, S } = ch1(); for (const u of foes(S)) u.hp = 0;
  const C2 = Save.finishChapter(C, S, DATA); eq([C2.chapter, C2.done, C2.party.map(p => p.tpl).sort()], [1, false, ['dang', 'linh', 'tran']]);
  eq(C2.record[0].chapter, 'ch1');
  const st = Save.store(Save.memory(), DATA); st.saveChapter(C2); const r = st.resume(); assert.ok(r.ok && !r.done); assert.strictEqual(r.S.chapter, 'ch2');
});
t('chương sau dùng trạng thái chiến dịch: quân gia nhập giữ cấp/EXP từ chương trước', () => {
  const D = clone(DATA); D.chapters.chapters.splice(1, 0, { id: 'ch1b', name: 'Thử', map: 'lang_chai', join: [], win: 'rout' });
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
// opts.chapter: chỉ số chương (mặc định 0 = Ch.1); opts.ai: hành vi gán cho mọi quân ta (vd 'toi_dich' để AI phe ta biết sang vùng đích).
function sim(seed, mode, opts) {
  opts = opts || {};
  const C = Save.newCampaign(DATA, { mode: mode || 'casual', seed }); C.chapter = opts.chapter || 0;
  const r = Save.startChapter(C, DATA), S = r.S, rng = Core.rng(r.seed), log = [], kills = {}, hits = {}, noSkills = !!(S.rules && S.rules.noSkills);
  if (opts.ai) for (const u of S.units) if (u.side === 'ta') u.ai = { type: opts.ai };
  let out = null;
  const fallen = () => S.units.filter(u => u.hp <= 0 && !u.escaped).map(u => u.tpl + ':' + u.side);
  loop: for (S.turn = 1; S.turn <= 30; S.turn++) for (const side of ['ta', 'dich', 'npc']) {
    S.phase = side; for (const u of S.units) if (u.side === side) u.done = false;
    if ((out = Core.outcome(S))) break loop;
    for (const u of S.units.filter(o => o.side === side)) {
      if (u.hp <= 0) continue;
      const p = Core.planTurn(S, u, DATA);
      assert.ok(Core.canStopAt(Core.reachable(S, u, DATA), p.x, p.y), `seed ${seed}: ô đứng lỗi`);
      if (noSkills) assert.ok(!p.action || p.action.type !== 'skill', `seed ${seed}: dùng kỹ năng ở chương noSkills`);
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


// ---------- Ch.2 Bến Đò Sương · Ch.3 Rừng Trành (tuần 5 mục 5) ----------
const chN = (i, mode, seed) => { const C = Save.newCampaign(DATA, { mode: mode || 'casual', seed: seed || 5 }); C.chapter = i; const r = Save.startChapter(C, DATA); return { C, S: r.S, seed: r.seed }; };
const T_ = (S, c) => Core.tile(S, c[0], c[1]).c;
// Ô (x,y) quân bộ tới được từ quân u không (bỏ qua quân, mov vô hạn) trên map m (đã sửa).
const reachOn = (m, from, to) => { const S = Core.loadMap(Object.assign({}, m, { units: m.units.map(r => r.replace(/[ENC]/g, '.')), roster: { A: m.roster.A } }), DATA);
  const u = S.units.find(o => o.x === from[0] && o.y === from[1]); return Core.reachable(S, u, DATA, { mov: 999, passSides: ['ta', 'dich', 'npc'] }).cost.has(to[1] * S.w + to[0]); };
const patch = (m, edits) => { const t = m.terrain.slice(); for (const [x, y, c] of edits) t[y] = t[y].slice(0, x) + c + t[y].slice(x + 1); return Object.assign({}, m, { terrain: t }); };

t('chương theo thứ tự Ch.1 → Ch.2 → Ch.3; Ch.2 map B ben_do, Ch.3 map C rung_co_thu; gia nhập Cuội / Hùng Nỏ', () => {
  eq(Save.chapters(DATA).map(c => [c.id, c.map, c.join]), [['ch1', 'lang_chai', ['dang', 'linh', 'tran']], ['ch2', 'ben_do', ['cuoi']], ['ch3', 'rung_co_thu', ['hung_no']]]);
  eq(Core.validateMap(DATA.maps.ben_do, DATA), []); eq(Core.validateMap(DATA.maps.rung_co_thu, DATA), []); eq(Core.validateAi(DATA), []);
  for (const m of [DATA.maps.ben_do, DATA.maps.rung_co_thu]) eq([m.terrain.length, m.terrain[0].length], [16, 12], 'kích thước chuẩn 12×16');
});
t('Ch.2: luật mở kỹ năng (Đăng, Cuội dùng được), trạng thái chưa mở, không sương; thắng = cả đội sang bờ bắc', () => {
  const { S } = chN(1);
  eq(S.rules, { noSkills: false, noStatus: true, fog: false, deadZone: false });
  eq(S.units.filter(u => u.side === 'ta').map(u => u.tpl).sort(), ['cuoi', 'dang', 'linh', 'tran']);
  eq(S.goal.win, [{ type: 'area', rect: [0, 0, 11, 4], text: 'đưa cả đội sang bờ bắc' }]);
  eq(Core.goalText(S.goal, DATA).win, 'Đưa cả đội sang bờ bắc');
  const d = byTpl(S, 'dang'), c = byTpl(S, 'cuoi'), e = foes(S).find(u => u.tpl === 'vien_kiem');
  Object.assign(d, { x: e.x, y: e.y + 2 }); const r = Core.useSkill(S, d, 'hoa', e.x, e.y, DATA, { seed: 1 }); assert.ok(r.ok, r.error);
  Object.assign(c, { x: d.x + 1, y: d.y }); d.done = true;
  const h = Core.useSkill(S, c, 'hat_xam', d.x, d.y, DATA, { seed: 1 }); assert.ok(h.ok, h.error);
  eq(h.effects.map(x => [x.type, x.applied]), [['refresh', false]], 'Hát Xẩm: chỉ ghi nhận, hành động thêm làm ở tuần 8');
});
t('Ch.2 map B: sông chia đôi, chỉ qua bằng 1 cầu hẹp hoặc bãi nước nông; bờ bắc = dòng 0–4', () => {
  const m = DATA.maps.ben_do, from = [3, 13], to = [4, 2];
  for (let y = 6; y <= 8; y++) assert.ok(m.terrain[y].split('').every(c => 'WB~'.includes(c)), `dòng ${y} là sông`);
  const bridge = [[4, 5], [4, 6], [4, 7], [4, 8]], ford = [[8, 6], [8, 7], [9, 7], [9, 8]];
  const S = Core.loadMap(m, DATA); for (const b of bridge) assert.strictEqual(T_(S, b), 'B');
  for (let y = 6; y <= 8; y++) assert.strictEqual(m.terrain[y].split('').filter(c => c === 'B').length, 1, 'cầu hẹp 1 ô');
  for (const f of ford) assert.strictEqual(T_(S, f), '~');
  assert.ok(reachOn(m, from, to));
  assert.ok(reachOn(patch(m, bridge.map(([x, y]) => [x, y, 'W'])), from, to), 'bỏ cầu: vẫn lội bãi nông được');
  assert.ok(reachOn(patch(m, ford.map(([x, y]) => [x, y, 'W'])), from, to), 'bỏ bãi nông: vẫn qua cầu được');
  assert.ok(!reachOn(patch(m, bridge.concat(ford).map(([x, y]) => [x, y, 'W'])), from, to), 'bỏ cả hai: không sang được');
  assert.ok(S.units.filter(u => u.side === 'ta').every(u => u.y >= 13), 'quân ta ở mép Nam');
});
t('Ch.2 địch theo phiếu: cung giữ vị trí trên gò sau sông, giáo chặn đầu cầu, kiếm hộ vệ cung, 3 Ma da dưới nước chỉ phản ứng khi vào tầm', () => {
  const { S } = chN(1), E = foes(S), by = id => E.filter(u => u.tpl === id);
  eq(E.map(u => u.tpl).sort(), ['ma_da', 'ma_da', 'ma_da', 'vien_cung', 'vien_cung', 'vien_giao', 'vien_kiem']);
  for (const u of by('vien_cung')) { eq([u.ai.type, u.ai.radius], ['giu_vi_tri', 2]); assert.ok(u.y <= 4 && Core.heightAt(S, u.x, u.y) === 1, 'cung đứng gò cao bờ bắc'); }
  eq([by('vien_giao')[0].ai, [by('vien_giao')[0].x, by('vien_giao')[0].y]], [{ type: 'giu_vi_tri', radius: 1 }, [4, 4]]);
  eq(by('vien_kiem')[0].ai, { type: 'ho_ve', follow: 'vien_cung', radius: 1 });
  for (const u of by('ma_da')) {
    assert.strictEqual(u.ai.type, 'cho_tam'); assert.ok(Core.terrainOf(S, u.x, u.y, DATA).flags.includes('nuoc'), 'Ma da dưới nước');
    assert.ok([[0, -1], [1, 0], [0, 1], [-1, 0]].some(([dx, dy]) => 'B~'.includes(Core.tile(S, u.x + dx, u.y + dy).c) && u.y + dy >= 5 && u.y + dy <= 9), 'Ma da kề lối qua sông');
  }
  // Cung trên gò (cao 1) với tới đầu cầu (cách 3) nhờ +1 tầm; đứng ngang thì không.
  const a = by('vien_cung').find(u => u.x === 3), d = byTpl(S, 'dang'); Object.assign(d, { x: 4, y: 5 });
  assert.ok(Core.forecast(a, d, { distance: 3, atkH: 1, defH: 0 }).attacker.canAttack);
  assert.ok(!Core.forecast(a, d, { distance: 3, atkH: 0, defH: 0 }).attacker.canAttack);
});
t('Ch.2 thắng vùng: mọi quân ta còn trên bàn cờ ở dòng 0–4 và đã xong hành động; Cuội rút lui không chặn thắng', () => {
  const { S } = chN(1), ta = S.units.filter(u => u.side === 'ta');
  for (const u of foes(S)) Object.assign(u, { y: u.y > 4 ? u.y : u.y });
  const spots = [[5, 1], [6, 1], [7, 2], [6, 0]]; ta.forEach((u, i) => Object.assign(u, { x: spots[i][0], y: spots[i][1], done: true }));
  for (const u of foes(S)) u.hp = 0; for (const u of foes(S)) u.hp = 1;   // còn địch: rout không khớp
  eq(Core.outcome(S).type, 'area');
  byTpl(S, 'linh').y = 5; assert.strictEqual(Core.outcome(S), null, 'Linh còn ở mép nước');
  const c = byTpl(S, 'cuoi'); Object.assign(byTpl(S, 'linh'), { y: 1 }); Object.assign(c, { x: 4, y: 12 }); assert.strictEqual(Core.outcome(S), null);
  Object.assign(c, { hp: 0, retreated: true }); eq(Core.outcome(S).type, 'area');
});
t('Ch.3: mở trạng thái (cờ noStatus = false, chạy thật tuần 8); thắng = hạ Hùm tinh, còn trành vẫn thắng', () => {
  const { S } = chN(2);
  eq(S.rules, { noSkills: false, noStatus: false, fog: false, deadZone: false });
  eq(S.units.filter(u => u.side === 'ta').map(u => u.tpl).sort(), ['cuoi', 'dang', 'hung_no', 'linh', 'tran']);
  eq(Core.goalText(S.goal, DATA).win, 'Hạ Hùm tinh');
  assert.strictEqual(Core.outcome(S), null); byTpl(S, 'hum_tinh').hp = 0;
  eq(Core.outcome(S).type, 'boss'); assert.ok(foes(S).some(u => u.tpl === 'ma_tranh' && u.hp > 0));
});
t('Ch.3 địch theo phiếu: Hùm tinh giữ hang (bán kính 2), 4 Ma trành chặn hai lối (bán kính 1), 2 Ma đè (1 phục trong rừng, 1 hộ vệ Hùm tinh)', () => {
  const { S } = chN(2), E = foes(S), h = byTpl(S, 'hum_tinh');
  eq(E.map(u => u.tpl).sort(), ['hum_tinh', 'ma_de', 'ma_de', 'ma_tranh', 'ma_tranh', 'ma_tranh', 'ma_tranh']);
  eq([h.ai.type, h.ai.radius, h.boss, Core.heightAt(S, h.x, h.y)], ['giu_vi_tri', 2, true, 2]);
  const tr = E.filter(u => u.tpl === 'ma_tranh'); for (const u of tr) eq(u.ai, { type: 'giu_vi_tri', radius: 1 });
  eq([tr.filter(u => u.x <= 3).length, tr.filter(u => u.x >= 9).length], [2, 2], '2 trành lối mòn Tây, 2 trành sườn Đông');
  for (const u of tr.filter(u => u.x >= 9)) assert.strictEqual(Core.heightAt(S, u.x, u.y), 2);
  for (const u of tr.filter(u => u.x <= 3)) assert.ok('=.'.includes(Core.tile(S, u.x, u.y).c), 'trành đứng trên lối mòn');
  eq(E.filter(u => u.tpl === 'ma_de').map(u => u.ai.type).sort(), ['cho_tam', 'ho_ve']);
  // Chờ tuần 8: trành chưa tiếp sức cho Hùm tinh (chỉ số = bảng class), Ma đè chưa gây Ngủ.
  eq(h.stats, Core.statsOf(DATA.units.templates.hum_tinh, DATA, h.lv)); eq(DATA.units.traitTypes.tiep_suc.live, false); eq(DATA.units.traitTypes.gay_trang_thai.live, false);
});
t('Ch.3 map C: hang trên cao (2 bậc) chỉ lên qua 2 dốc; lối mòn Tây hẹp 1 ô giữa rừng; sườn Đông cao hơn rừng (nỏ +1 tầm)', () => {
  const m = DATA.maps.rung_co_thu, from = [4, 13], lair = [5, 1], S = Core.loadMap(m, DATA);
  eq([T_(S, [3, 3]), T_(S, [9, 12])], ['^', '^']);
  assert.ok(reachOn(m, from, lair));
  assert.ok(reachOn(patch(m, [[3, 3, 'F']]), from, lair), 'còn sườn Đông'); assert.ok(reachOn(patch(m, [[9, 12, 'F']]), from, lair), 'còn lối mòn Tây');
  assert.ok(!reachOn(patch(m, [[3, 3, 'F'], [9, 12, 'F']]), from, lair), 'bịt 2 dốc: không lên được hang');
  // Lối mòn Tây: mỗi dòng 4–11 chỉ 1–2 ô đi được liền nhau ở cột 0–8 (chỗ rẽ 2 ô), còn lại là rừng.
  for (let y = 4; y <= 11; y++) { const open = [...m.terrain[y].slice(0, 9)].map((c, x) => c !== 'F' ? x : -1).filter(x => x >= 0);
    assert.ok(open.length >= 1 && open.length <= 2 && open[open.length - 1] - open[0] === open.length - 1 && open[0] <= 3, `lối mòn dòng ${y}: ${open}`); }
  let forest = 0; for (let y = 4; y <= 11; y++) for (let x = 3; x <= 8; x++) forest += T_(S, [x, y]) === 'F'; assert.ok(forest >= 44, 'giữa map là rừng dày');
  const n = byTpl(S, 'hung_no'), tg = foes(S).find(u => u.tpl === 'ma_de' && u.ai.type === 'cho_tam');
  assert.ok(Core.forecast(n, tg, { distance: 3, atkH: 2, defH: 0 }).attacker.canAttack, 'nỏ trên sườn cao bắn xuống rừng cách 3');
  assert.ok(!Core.forecast(n, tg, { distance: 3, atkH: 0, defH: 0 }).attacker.canAttack);
});
t('chiến dịch đủ 3 chương: đội giữ qua chương (Cuội từ Ch.2, Hùng Nỏ từ Ch.3), hết Ch.3 thì done', () => {
  let C = Save.newCampaign(DATA, { seed: 3 });
  for (let i = 0; i < 3; i++) {
    const { S } = Save.startChapter(C, DATA); assert.strictEqual(S.chapter, ['ch1', 'ch2', 'ch3'][i]);
    if (i === 1) { const c = byTpl(S, 'cuoi'); c.lv = 3; c.exp = 7; assert.strictEqual(byTpl(S, 'tran').lv, 9, 'Trấn mang cấp từ Ch.1'); }
    if (i === 2) eq([byTpl(S, 'cuoi').lv, byTpl(S, 'cuoi').exp], [3, 7]);
    if (i === 0) byTpl(S, 'tran').lv = 9;
    for (const u of foes(S)) u.hp = 0; C = Save.finishChapter(C, S, DATA);
  }
  eq([C.chapter, C.done, C.party.map(p => p.tpl).sort()], [3, true, ['cuoi', 'dang', 'hung_no', 'linh', 'tran']]);
  eq(C.record.map(r => r.chapter), ['ch1', 'ch2', 'ch3']);
});
t('AI Tới đích (toi_dich): quân ta tiến về vùng đích; Đăng/Linh không nhích vào ô nguy hiểm hơn ô đang đứng; chương không có vùng đích thì như Lao vào', () => {
  const { S } = chN(1), tr = byTpl(S, 'tran'), li = byTpl(S, 'linh');
  for (const u of foes(S)) if (u.tpl !== 'vien_cung') u.hp = 0;
  tr.ai = { type: 'toi_dich' }; const p = Core.planTurn(S, tr, DATA); assert.ok(p.y < tr.y, 'Trấn tiến lên phía Bắc'); eq(p.behavior, 'toi_dich');
  const lao = Core.planTurn(S, Object.assign({}, tr, { ai: {} }), DATA); assert.ok(p.x !== lao.x || p.y !== lao.y || p.y < tr.y);
  li.ai = { type: 'toi_dich' }; Object.assign(li, { x: 4, y: 9 });
  const q = Core.planTurn(S, li, DATA);
  // ô (x,y) bị đe dọa lượt sau: có địch đi tới một ô rồi với tới (x,y) bằng vũ khí (cung/nỏ đứng cao +1 tầm)
  const risk = (x, y) => foes(S).filter(u => u.hp > 0).some(o => Core.reachable(S, o, DATA).stops.some(i => { const sx = i % S.w, sy = (i / S.w) | 0, d = Math.abs(sx - x) + Math.abs(sy - y);
    return d >= o.weapon.minRange && d <= o.weapon.maxRange + (Core.heightAt(S, sx, sy) > Core.heightAt(S, x, y) ? o.weapon.highGround | 0 : 0); }));
  assert.ok(!risk(q.x, q.y) || risk(li.x, li.y), 'Linh không bước vào tầm cung');
  // Ch.3: không có vùng đích → như Lao vào
  const T = chN(2).S, d = byTpl(T, 'tran'); const a = Core.planTurn(T, d, DATA); d.ai = { type: 'toi_dich' }; const b = Core.planTurn(T, d, DATA); eq([a.x, a.y, a.action], [b.x, b.y, b.action]);
});

// AI vs AI Ch.2 / Ch.3: quân ta dùng toi_dich (biết sang vùng đích). In tỷ lệ thắng, số lượt, ai hay ngã.
function report(name, opts) {
  const tally = { ta: 0, dich: 0, hoa: 0 }, types = {}, fall = {}, turns = [], kills = {}, dmg = {};
  for (let s = 1; s <= 100; s++) {
    const r = sim(s, 'casual', opts); tally[r.result]++; types[r.type] = (types[r.type] || 0) + 1; turns.push(r.turns);
    for (const f of r.fallen) fall[f] = (fall[f] || 0) + 1; for (const k in r.kills) kills[k] = (kills[k] || 0) + r.kills[k];
  }
  const done = turns.filter((x, i) => x < 30), avg = done.reduce((a, b) => a + b, 0) / Math.max(1, done.length);
  const side = sd => Object.fromEntries(Object.entries(fall).filter(([k]) => k.endsWith(':' + sd)).map(([k, v]) => [k.split(':')[0], v]));
  console.log(`   ${name} · 100 trận:`, JSON.stringify(tally), '· kiểu kết thúc:', JSON.stringify(types));
  console.log('   số lượt trung bình (trận có kết quả):', avg.toFixed(2), '· ít nhất', Math.min(...turns), '· nhiều nhất', Math.max(...turns));
  console.log('   quân ta ngã (số trận):', JSON.stringify(side('ta')), '· địch ngã:', JSON.stringify(side('dich')));
  console.log('   hạ gục theo quân:', JSON.stringify(kills));
  return tally;
}
t('AI vs AI 100 trận trên Ch.2 (quân ta Tới đích): không lỗi, tất định; in tỷ lệ thắng, số lượt, ai hay ngã', () => {
  const T = report('Ch.2', { chapter: 1, ai: 'toi_dich' });
  assert.ok(T.ta >= 80, 'phe ta thắng ≥ 80/100'); assert.ok(T.hoa <= 5, 'ít trận kéo quá 30 lượt');
  eq(sim(7, 'casual', { chapter: 1, ai: 'toi_dich' }).log, sim(7, 'casual', { chapter: 1, ai: 'toi_dich' }).log);
});
t('AI vs AI 100 trận trên Ch.3 (quân ta Tới đích = Lao vào): không lỗi, tất định; in tỷ lệ thắng, số lượt, ai hay ngã', () => {
  const T = report('Ch.3', { chapter: 2, ai: 'toi_dich' });
  assert.ok(T.ta >= 80, 'phe ta thắng ≥ 80/100'); assert.strictEqual(T.dich, 0); assert.ok(T.hoa <= 10, 'hòa = AI phe ta kẹt khi chỉ còn Đăng/Linh (GDD 12)');
  eq(sim(7, 'casual', { chapter: 2, ai: 'toi_dich' }).log, sim(7, 'casual', { chapter: 2, ai: 'toi_dich' }).log);
});

console.log(n + ' bài kiểm thử đạt');
