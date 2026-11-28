// Kiểm thử lưu game (GDD 5.4, 2.9, 9) không cần trình duyệt: node tools/test_save.js
// Nơi lưu là bộ nhớ giả (Save.memory()), cùng giao diện với localStorage.
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const ROOT = path.dirname(__dirname);
const src = f => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');
const { Core, Play, Save } = vm.runInNewContext(['34-core.js', '36-combat.js', '36-play.js', '37-skills.js', '38-ai.js', '39-level.js', '39-save.js'].map(src).join('\n') + '\n({ Core, Play, Save })', {});
const eq = (a, b, m) => assert.strictEqual(JSON.stringify(a), JSON.stringify(b), m);
const rd = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const DATA = { terrain: rd('data/terrain.json'), units: rd('data/units.json'), classes: rd('data/classes.json'), weapons: rd('data/weapons.json'), skills: rd('data/skills.json'), ai: rd('data/ai.json'), campaign: rd('data/campaign.json'), maps: {} };
for (const f of fs.readdirSync(path.join(ROOT, 'data/maps'))) if (f.endsWith('.json')) { const m = rd('data/maps/' + f); DATA.maps[m.id] = m; }
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok', name); };
const clone = o => JSON.parse(JSON.stringify(o));
const ta = S => S.units.filter(u => u.side === 'ta');
const byTpl = (S, id) => S.units.find(u => u.tpl === id);

// ---------- Chạy trận không đồ họa ----------
// Quân ta do AI chơi (Core.planTurn + Core.aiAct, dùng P.rng như Play); địch/NPC chạy qua chính Play.update.
// Nhật ký: mọi trận đánh (đòn, kết quả), growth, vị trí/HP cuối mỗi lượt.
function pump(P, log) {
  let last = null, g = 0;
  while ((Play.busy(P) && !P.over) && g++ < 1e5) {
    if (P.levelUp) Play.dismissLevel(P);
    Play.update(P, .05);
    if (P.battle && P.battle !== last) { last = P.battle; log.push(['tran', P.battle.a.uid, P.battle.d.uid, P.battle.res.strikes, P.battle.res.outcome, P.battle.growth]); }
    if (P.S.phase === 'ta' && P.mode === 'cho' && !P.banner && !P.battle && !P.levelUp && !P.anim) break;
  }
}
function playerTurn(P, log) {
  const S = P.S;
  for (const u of ta(S)) {
    if (u.hp <= 0 || u.done || P.over) continue;
    const plan = Core.planTurn(S, u, DATA), [x, y] = plan.path[plan.path.length - 1];
    u.x = x; u.y = y; u.done = true;
    if (plan.action) { const r = Core.aiAct(S, u, plan.action, DATA, { rng: P.rng, mode: S.mode }); log.push(['ta', u.uid, x, y, r.ok, r.combat && r.combat.strikes, r.combat && r.combat.outcome, r.growth]); }
    else log.push(['ta', u.uid, x, y]);
    if (S.units.some(o => o.hp <= 0 && Core.isLord(o) && o.side === 'ta')) { P.over = { win: false }; return; }
  }
  if (!Play.checkWin(P)) Play.endTurn(P);
}
function runTurns(P, k) {
  const log = [];
  pump(P, log);
  for (let i = 0; i < k && !P.over; i++) {
    playerTurn(P, log); pump(P, log);
    log.push(['luot', P.S.turn, P.S.units.map(u => [u.uid, u.x, u.y, u.hp, u.lv, u.exp])]);
  }
  return log;
}
const fresh = (mode, seed) => { const C = Save.newCampaign(DATA, { mode: mode || 'casual', seed: seed || 7 }); const r = Save.startChapter(C, DATA); return { C, S: r.S, P: Play.create(r.S, DATA, r.seed) }; };

// ---------- Dữ liệu chương ----------
t('campaign.json hợp lệ; chương lỗi bị bắt', () => {
  eq(Save.validateCampaign(DATA), []);
  const D = clone(DATA); D.campaign.chapters.push({ id: 'thu', map: 'khong_co' });
  assert.strictEqual(Save.validateCampaign(D).length, 2);
});

// ---------- Trạng thái chiến dịch ----------
t('Chơi mới: JSON có phiên bản, chế độ tử vong, chương 0; đầu chương HP/tài nguyên đầy', () => {
  const C = Save.newCampaign(DATA, { mode: 'classic', seed: 3 });
  eq([C.v, C.kind, C.mode, C.chapter, C.party.length], [Save.VERSION, 'campaign', 'classic', 0, 0]);
  assert.strictEqual(Save.newCampaign(DATA, { mode: 'linh tinh' }).mode, 'casual');
  const { S, seed } = Save.startChapter(C, DATA);
  eq([S.mode, S.win, S.chapter], ['classic', 'rout', 'thu']);
  assert.strictEqual(seed, Save.chapterSeed(C, 0)); assert.notStrictEqual(seed, Save.chapterSeed(C, 1));
  for (const u of S.units) { assert.strictEqual(u.hp, u.stats.hp); eq(u.res, u.resMax); }
});
t('chương Vùng Chết bật chết vĩnh viễn ở cả Casual', () => {
  const D = clone(DATA); D.campaign.chapters[0].deadzone = true;
  assert.strictEqual(Save.startChapter(Save.newCampaign(D, { mode: 'casual' }), D).S.mode, 'deadzone');
});

// ---------- Hết chương → chương sau ----------
t('qua chương giữ cấp, EXP, chỉ số, hạng, điểm vũ khí, túi (độ bền); chương sau HP + tài nguyên đầy; Casual: rút lui quay lại', () => {
  const { C, S } = fresh('casual');
  const d = byTpl(S, 'dang'), tr = byTpl(S, 'tran'), li = byTpl(S, 'linh');
  d.lv = 4; d.exp = 37; d.stats.str += 3; d.hp = 2; d.ranks.kiem = 'A'; d.wexp.kiem = 85; d.res = {};
  const w = Core.makeWeapon(Object.keys(DATA.weapons.items).find(id => DATA.weapons.items[id].uses), DATA); w.uses = 3; d.inventory.push(w);
  tr.hp = 0; tr.retreated = true;   // Casual: rút lui
  li.loot = ['thuoc_nho'];
  const C2 = Save.finishChapter(C, S, DATA);
  assert.strictEqual(C.chapter, 0, 'không sửa C cũ'); eq([C2.chapter, C2.done, C2.party.length], [1, false, 3]);
  eq(C2.convoy, ['thuoc_nho']);
  const { S: S2 } = Save.startChapter(C2, DATA), d2 = byTpl(S2, 'dang');
  eq([d2.lv, d2.exp, d2.stats, d2.ranks.kiem, d2.wexp.kiem], [4, 37, d.stats, 'A', 85]);
  assert.strictEqual(d2.hp, d2.stats.hp); eq(d2.res, d2.resMax);
  const w2 = d2.inventory.find(x => x.id === w.id); eq([w2.uses, w2.maxUses], [3, w.maxUses]);
  assert.ok(d2.weapon === d2.inventory[0] && Core.usable(d2, d2.weapon));
  const tr2 = byTpl(S2, 'tran'); assert.ok(tr2 && tr2.hp === tr2.stats.hp && !tr2.retreated);
});
t('Classic: quân chết không ra trận chương sau, vẫn ghi trong đội (status dead)', () => {
  const { C, S } = fresh('classic'); const tr = byTpl(S, 'tran'); tr.hp = 0; tr.dead = true;
  const C2 = Save.finishChapter(C, S, DATA);
  assert.strictEqual(C2.party.find(p => p.tpl === 'tran').status, 'dead');
  assert.ok(!byTpl(Save.startChapter(C2, DATA).S, 'tran'));
});
t('rương giữ được = không bị đạo tặc mang thoát; số đèn lồng = tổng qua các chương; hết chương cuối thì done', () => {
  let { C, S } = fresh('casual');
  C = Save.finishChapter(C, S, DATA);                                   // map thu: 1 rương, còn nguyên → giữ 1
  eq(C.record[0], { chapter: 'thu', turns: 1, chests: 1, kept: 1, villages: 0 });
  S = Save.startChapter(C, DATA).S;                                     // map hanhvi: 2 rương, đạo tặc lấy 1 và thoát
  const th = byTpl(S, 'vien_tac'); S.chests[0].open = true; S.chests[0].takenBy = { uid: th.uid, side: 'dich' }; th.escaped = true; th.hp = 0;
  C = Save.finishChapter(C, S, DATA);
  eq([C.record[1].kept, Save.lanterns(C), C.done], [1, 2, true]);
  const b = Save.begin(Save.envChapter(C), DATA); assert.ok(b.ok && b.done);
});

// ---------- Đóng gói trận ----------
t('đóng gói → JSON → mở lại: giống hệt, u.weapon vẫn trỏ vào món trong túi', () => {
  const { S } = fresh(); const d = byTpl(S, 'dang');
  d.inventory.push(Core.makeWeapon(d.inventory[0].id, DATA)); d.weapon = d.inventory[1];
  const S2 = Save.unpackBattle(JSON.parse(JSON.stringify(Save.packBattle(S))));
  eq(Save.packBattle(S2), Save.packBattle(S));
  for (const u of S2.units) assert.ok(u.weapon === null || u.inventory.includes(u.weapon), u.name);
  assert.strictEqual(byTpl(S2, 'dang').weapon, byTpl(S2, 'dang').inventory[1]);
});

// ---------- Lưu tạm giữa trận: chạy tiếp cùng seed ra cùng nhật ký ----------
t('lưu tạm → nạp → chơi tiếp: cùng nhật ký trận, cùng trạng thái cuối, cùng RNG', () => {
  const { C, P } = fresh('casual', 11), st = Save.store(Save.memory(), DATA);
  runTurns(P, 2);                                                       // đánh vài lượt cho RNG chạy
  assert.ok(!P.over && Play.canSuspend(P));
  eq(st.saveSuspend(C, P), { ok: true });
  const live = runTurns(P, 4);                                          // nhánh A: chơi tiếp không tắt
  const r = st.resume(); assert.ok(r.ok && r.kind === 'suspend' && r.resumed, JSON.stringify(r.errors));
  const Q = Play.create(r.S, DATA, r.rng), again = runTurns(Q, 4);       // nhánh B: nạp bản lưu tạm rồi chơi tiếp
  assert.ok(live.filter(e => e[0] === 'tran' || (e[0] === 'ta' && e[5])).length >= 2, 'nhật ký phải có trận đánh');
  eq(again, live); eq(Save.packBattle(Q.S), Save.packBattle(P.S)); assert.strictEqual(Q.rng.state(), P.rng.state());
  // Đối chứng: lệch trạng thái RNG thì nhật ký khác (test thật sự phụ thuộc RNG)
  const r2 = st.resume(), X = Play.create(r2.S, DATA, (r2.rng + 1) >>> 0);
  assert.notStrictEqual(JSON.stringify(runTurns(X, 4)), JSON.stringify(live));
});
t('chỉ lưu tạm khi rảnh ở lượt ta (không giữa nước đi, không lượt địch)', () => {
  const { P } = fresh(); assert.ok(!Play.canSuspend(P));                 // đang băng chữ
  Play.update(P, 5); assert.ok(Play.canSuspend(P));
  const d = byTpl(P.S, 'dang'); Play.tap(P, d.x, d.y); assert.ok(Play.canSuspend(P));
  Play.tap(P, d.x, d.y); Play.tap(P, d.x, d.y); Play.update(P, 1); assert.strictEqual(P.mode, 'menu'); assert.ok(!Play.canSuspend(P));
});
t('thắng chương (hạ hết địch) → P.over.win; map thử không có S.win thì không thắng', () => {
  const { P, S } = fresh(); Play.update(P, 5);
  for (const u of S.units) if (u.side === 'dich') u.hp = 0;
  Play.update(P, .1); assert.ok(P.over && P.over.win);
  const M = Core.loadMap(DATA.maps.thu, DATA), Q = Play.create(M, DATA, 1); Play.update(Q, 5);
  for (const u of M.units) if (u.side === 'dich') u.hp = 0;
  Play.update(Q, .1); assert.ok(!Q.over);
});
t('Tiếp tục: ưu tiên lưu tạm, không có thì lưu chương; Chơi mới xoá lưu tạm', () => {
  const st = Save.store(Save.memory(), DATA); eq([st.resume().ok, st.resume().code], [false, 'none']);
  const { C, P } = fresh(); st.saveChapter(C); assert.strictEqual(st.resume().kind, 'chapter');
  Play.update(P, 5); st.saveSuspend(C, P); assert.strictEqual(st.resume().kind, 'suspend');
  st.clear('suspend'); assert.strictEqual(st.resume().kind, 'chapter');
});

// ---------- Bản lưu hỏng / khác phiên bản: báo lỗi, không vỡ ----------
t('bản lưu hỏng hoặc khác phiên bản: trả lỗi, không ném; còn bản kia dùng được thì vẫn Tiếp tục', () => {
  const mem = Save.memory(), st = Save.store(mem, DATA), { C, P } = fresh(); Play.update(P, 5);
  const set = (k, v) => mem.setItem(Save.KEYS[k], typeof v === 'string' ? v : JSON.stringify(v));
  set('chapter', '{"v":1,"kind":"chap'); eq([st.load('chapter').ok, st.load('chapter').code], [false, 'corrupt']);
  set('chapter', Object.assign(Save.envChapter(C), { v: 99 })); const r = st.load('chapter');
  eq([r.ok, r.code], [false, 'version']); assert.ok(/99/.test(r.error));
  set('chapter', 'null'); assert.strictEqual(st.load('chapter').code, 'corrupt');
  set('chapter', Save.envSuspend(C, P)); assert.strictEqual(st.load('chapter').code, 'corrupt');   // sai loại
  const bad = [c => { c.party = 'x'; }, c => { c.mode = 'hardcore'; }, c => { c.chapter = 99; }, c => { c.party = [{ tpl: 'khong_co', stats: {}, inventory: [] }]; }, c => { c.party = [{ tpl: 'dang', stats: {}, inventory: [{ id: 'khong_co' }] }]; }];
  for (const f of bad) { const e = Save.envChapter(C); f(e.campaign); set('chapter', e); assert.strictEqual(st.load('chapter').code, 'corrupt', JSON.stringify(e.campaign).slice(0, 80)); }
  // Lưu tạm hỏng phần trận (qua được kiểm tra phong bì, vỡ khi dựng lại) → resume bỏ qua, dùng lưu chương
  const e = Save.envSuspend(C, P); e.battle.tiles = []; set('suspend', e); set('chapter', Save.envChapter(C));
  const q = st.resume(); assert.ok(q.ok && q.kind === 'chapter' && q.errors.length === 1, JSON.stringify(q));
  const e2 = Save.envSuspend(C, P); e2.battle.units[0].tpl = 'khong_co'; set('suspend', e2); assert.strictEqual(st.resume().kind, 'chapter');
  set('suspend', '}{'); mem.removeItem(Save.KEYS.chapter); const z = st.resume(); eq([z.ok, z.code, z.errors.length], [false, 'corrupt', 1]);
});
t('nơi lưu lỗi (đầy bộ nhớ, bị chặn) không làm vỡ game; không có localStorage thì dùng bộ nhớ tạm', () => {
  const boom = { getItem() { throw new Error('chặn'); }, setItem() { throw new Error('QuotaExceededError'); }, removeItem() { throw new Error('chặn'); } };
  const st = Save.store(boom, DATA), { C } = fresh();
  const w = st.saveChapter(C); assert.ok(!w.ok && /Quota/.test(w.error));
  assert.strictEqual(st.load('chapter').ok, false); st.clear('suspend'); assert.strictEqual(st.resume().ok, false);
  const L = Save.local(); L.setItem('a', 1); assert.strictEqual(L.getItem('a'), '1');   // Node: không có localStorage → bộ nhớ tạm
});

console.log(`\n${n} test qua`);
