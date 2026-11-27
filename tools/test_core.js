// Kiểm thử logic lõi không cần trình duyệt: node tools/test_core.js
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const ROOT = path.dirname(__dirname);
const rd = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const DATA = { terrain: rd('data/terrain.json'), units: rd('data/units.json'), maps: {} };
for (const f of fs.readdirSync(path.join(ROOT, 'data/maps'))) if (f.endsWith('.json')) { const m = rd('data/maps/' + f); DATA.maps[m.id] = m; }
const src = f => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');
const { Core, Play } = vm.runInNewContext(src('34-core.js') + '\n' + src('36-play.js') + '\n({ Core, Play })', {});
const eq = (a, b) => assert.strictEqual(JSON.stringify(a), JSON.stringify(b)); // mảng từ vm khác realm nên so qua JSON
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok', name); };

for (const id in DATA.maps) t('map ' + id + ' hợp lệ', () => eq(Core.validateMap(DATA.maps[id], DATA), []));
const S = Core.loadMap(DATA.maps.thu, DATA);
t('kích thước 12x16', () => { assert.strictEqual(S.w, 12); assert.strictEqual(S.h, 16); assert.strictEqual(S.tiles.length, 192); });
t('roster gán đúng thứ tự đọc', () => {
  const u = Core.unitAt(S, 1, 13); assert.strictEqual(u.tpl, 'dang'); assert.strictEqual(u.side, 'ta');
  assert.strictEqual(Core.unitAt(S, 2, 14).tpl, 'linh'); assert.strictEqual(Core.unitAt(S, 7, 1).tpl, 'vien_giao');
  assert.strictEqual(S.units.length, 7); assert.strictEqual(S.chests.length, 1);
});
t('chi phí di chuyển theo loại quân', () => {
  assert.strictEqual(Core.moveCost(S, 4, 0, 'bo', DATA), 2);      // rừng
  assert.strictEqual(Core.moveCost(S, 4, 0, 'nhe', DATA), 1);
  assert.strictEqual(Core.moveCost(S, 0, 6, 'bo', DATA), null);   // nước sâu
  assert.strictEqual(Core.moveCost(S, 0, 6, 'bay', DATA), 1);
  assert.strictEqual(Core.moveCost(S, 10, 1, 'bay', DATA), null); // vách
  assert.strictEqual(Core.moveCost(S, -1, 0, 'bo', DATA), null);  // ngoài map
});
t('độ cao đọc từ lớp thứ hai', () => { assert.strictEqual(Core.tile(S, 0, 0).h, 2); assert.strictEqual(Core.tile(S, 1, 1).h, 1); });
t('đọc→ghi ASCII giữ nguyên', () => { const a = Core.toAscii(S), m = DATA.maps.thu; eq(a.terrain, m.terrain); eq(a.height, m.height); eq(a.units, m.units); });
t('bắt lỗi map sai', () => {
  const bad = JSON.parse(JSON.stringify(DATA.maps.thu)); bad.terrain[0] = 'MM..FF....M'; bad.units[2] = '.....E.....X'; bad.roster.E.pop();
  const e = Core.validateMap(bad, DATA); assert.ok(e.length >= 3, e.join('\n'));
});
t('RNG có seed phát lại được', () => { const a = Core.rng(42), b = Core.rng(42); const xs = [a(), a(), a()]; eq(xs, [b(), b(), b()]); assert.ok(xs.every(v => v >= 0 && v < 1)); });
// ----- Tìm đường & vùng đi được (tuần 2) -----
// Map nhỏ dựng tại chỗ; quân tạo từ mẫu 'dang' rồi ghi đè loại quân / Mov / phe.
const mk = (terrain, height) => Core.loadMap({ id: 'tmp', terrain, height: height || terrain.map(r => '0'.repeat(r.length)) }, DATA);
const put = (S, x, y, o = {}) => { const u = Core.makeUnit('dang', DATA, o.side || 'ta', x, y, S.units.length + 1); if (o.mt) u.moveType = o.mt; if (o.mov !== undefined) u.stats.mov = o.mov; S.units.push(u); return u; };
const has = (R, x, y) => R.cost.has(y * R.w + x), costAt = (R, x, y) => R.cost.get(y * R.w + x);

t('đồng phẳng: Mov 2 ra hình thoi 13 ô', () => { const M = mk(['.....', '.....', '.....', '.....', '.....']); const R = Core.reachable(M, put(M, 2, 2, { mov: 2 }), DATA); assert.strictEqual(R.stops.length, 13); assert.ok(!has(R, 0, 0)); });
t('chi phí theo loại quân: rừng, núi', () => {
  const M = mk(['.FFF.', '.MMM.']);
  let R = Core.reachable(M, put(M, 0, 0, { mov: 4 }), DATA); assert.strictEqual(costAt(R, 2, 0), 4); assert.ok(!has(R, 3, 0));
  M.units.length = 0; R = Core.reachable(M, put(M, 0, 0, { mov: 4, mt: 'nhe' }), DATA); assert.strictEqual(costAt(R, 4, 0), 4);
  M.units.length = 0; R = Core.reachable(M, put(M, 0, 1, { mov: 3 }), DATA); assert.strictEqual(costAt(R, 1, 1), 3);
  M.units.length = 0; R = Core.reachable(M, put(M, 0, 1, { mov: 3, mt: 'nhe' }), DATA); assert.strictEqual(costAt(R, 1, 1), 2);
});
t('nước: Bộ không vào nước sâu, Thủy chỉ ở nước/đầm, Bay qua mọi ô trừ vách', () => {
  const M = mk(['.~WS.#.']);
  let R = Core.reachable(M, put(M, 0, 0, { mov: 9 }), DATA); assert.ok(has(R, 1, 0) && !has(R, 2, 0));
  M.units.length = 0; R = Core.reachable(M, put(M, 1, 0, { mov: 9, mt: 'thuy' }), DATA); eq(R.stops, [1, 2, 3]);
  M.units.length = 0; R = Core.reachable(M, put(M, 0, 0, { mov: 9, mt: 'bay' }), DATA); assert.ok(has(R, 4, 0) && !has(R, 5, 0) && !has(R, 6, 0));
});
t('độ cao: chênh 1 leo được, chênh 2 bị chặn cả lên lẫn xuống', () => {
  let M = mk(['...'], ['012']); assert.ok(has(Core.reachable(M, put(M, 0, 0, { mov: 5 }), DATA), 2, 0));
  M = mk(['..'], ['02']); assert.ok(!has(Core.reachable(M, put(M, 0, 0, { mov: 5 }), DATA), 1, 0));
  M.units.length = 0; assert.ok(!has(Core.reachable(M, put(M, 1, 0, { mov: 5 }), DATA), 0, 0));
});
t('độ cao: dốc ^ cho vượt chênh ≥ 2', () => {
  const M = mk(['..', '^.'], ['03', '03']);
  const R = Core.reachable(M, put(M, 0, 0, { mov: 6 }), DATA);
  eq(Core.pathTo(R, 1, 0), [[0, 0], [0, 1], [1, 1], [1, 0]]);
  assert.strictEqual(costAt(R, 1, 1), 5); // 1 (dốc) + 1 (đồng) + 3 bậc leo
});
t('chi phí leo: mỗi bậc lên +1, xuống không tốn, ghi đè được theo độ khó', () => {
  const M = mk(['....'], ['0121']);
  let R = Core.reachable(M, put(M, 0, 0, { mov: 9 }), DATA);
  assert.strictEqual(costAt(R, 1, 0), 2); assert.strictEqual(costAt(R, 2, 0), 4); assert.strictEqual(costAt(R, 3, 0), 5);
  R = Core.reachable(M, M.units[0], DATA, { climbCost: 0 }); assert.strictEqual(costAt(R, 2, 0), 2);
  R = Core.reachable(M, M.units[0], DATA, { climbCost: 2 }); assert.strictEqual(costAt(R, 2, 0), 6);
  M.units.length = 0; R = Core.reachable(M, put(M, 3, 0, { mov: 9 }), DATA); assert.strictEqual(costAt(R, 0, 0), 4); // 3→2 leo 1 bậc
  M.units.length = 0; R = Core.reachable(M, put(M, 0, 0, { mov: 9, mt: 'bay' }), DATA); assert.strictEqual(costAt(R, 2, 0), 2);
});
t('NPC chặn cả ta lẫn địch; rương chặn quân đi đất, quân bay bay qua nhưng không đậu', () => {
  const M = mk(['.....']); const me = put(M, 0, 0, { mov: 4 }); put(M, 2, 0, { side: 'npc' });
  assert.ok(!has(Core.reachable(M, me, DATA), 3, 0));
  M.units[0].side = 'dich'; assert.ok(!has(Core.reachable(M, me, DATA), 3, 0));
  M.units.length = 0; M.chests.push({ x: 2, y: 0, item: 'thuoc_nho', open: false });
  assert.ok(!has(Core.reachable(M, put(M, 0, 0, { mov: 4 }), DATA), 2, 0));
  M.units.length = 0; const R = Core.reachable(M, put(M, 0, 0, { mov: 4, mt: 'bay' }), DATA);
  assert.ok(has(R, 3, 0) && has(R, 2, 0)); assert.ok(!Core.canStopAt(R, 2, 0));
});
t('độ cao: quân bay bỏ qua', () => { const M = mk(['..'], ['03']); assert.ok(has(Core.reachable(M, put(M, 0, 0, { mov: 1, mt: 'bay' }), DATA), 1, 0)); });
t('xuyên quân ta nhưng không dừng chồng; không xuyên địch', () => {
  const M = mk(['.....']); const me = put(M, 0, 0, { mov: 4 }); put(M, 1, 0);
  let R = Core.reachable(M, me, DATA);
  assert.ok(has(R, 4, 0)); assert.ok(!Core.canStopAt(R, 1, 0)); assert.ok(Core.canStopAt(R, 0, 0));
  put(M, 2, 0, { side: 'dich' }); R = Core.reachable(M, me, DATA); assert.ok(!has(R, 2, 0) && !has(R, 3, 0));
});
t('đi vòng quanh địch; quân đã ngã không chặn', () => {
  const M = mk(['...', '...']); const me = put(M, 0, 0, { mov: 4 }); const foe = put(M, 1, 0, { side: 'dich' });
  assert.strictEqual(costAt(Core.reachable(M, me, DATA), 2, 0), 4);
  foe.hp = 0; assert.strictEqual(costAt(Core.reachable(M, me, DATA), 2, 0), 2);
});
t('opts.mov ghi đè (Trói = 0)', () => { const M = mk(['...']); eq(Core.reachable(M, put(M, 1, 0), DATA, { mov: 0 }).stops, [1]); });
t('map thử: vách núi góc Đông Nam chỉ lên được qua dốc', () => {
  assert.ok(!Core.canStep(S, 8, 15, 9, 15, 'bo', DATA));     // đồng h0 → núi h2
  assert.ok(Core.canStep(S, 9, 14, 10, 14, 'bo', DATA));     // dốc h1 → núi h2
  assert.ok(Core.canStep(S, 8, 15, 9, 15, 'bay', DATA));
  const R = Core.reachable(S, Core.unitAt(S, 1, 13), DATA);  // Đăng, Mov 5
  assert.ok(R.stops.length > 10 && Core.pathTo(R, 1, 13).length === 1);
});
// ----- Chọn quân → ô đích → đi → Chờ/Hoàn tác; vòng lượt (tuần 2, buổi 2–3) -----
const mkP = M => { const P = Play.create(M, DATA); Play.update(P, 5); return P; };   // bỏ qua băng chữ đầu lượt
const run = (P, sec) => { for (let k = 0; k < sec * 30; k++) Play.update(P, 1 / 30); };
t('chạm quân ta: chọn và có vùng đi; chạm địch chỉ xem; đang băng chữ thì bận', () => {
  const M = mk(['.....', '.....']); const me = put(M, 0, 0, { mov: 3 }); put(M, 4, 1, { side: 'dich' });
  assert.strictEqual(Play.tap(Play.create(M, DATA), 0, 0), 'ban');
  const P = mkP(M);
  assert.strictEqual(Play.tap(P, 4, 1), 'xem'); assert.strictEqual(P.mode, 'cho');
  assert.strictEqual(Play.tap(P, 0, 0), 'chon'); assert.strictEqual(P.unit, me); assert.ok(P.R.stops.length > 1);
});
t('chạm ô đích hiện đường, chạm lần nữa thì đi → menu; Chờ thì done', () => {
  const M = mk(['.....']); const me = put(M, 0, 0, { mov: 3 }); const b = put(M, 4, 0); const P = mkP(M);
  Play.tap(P, 0, 0); assert.strictEqual(Play.tap(P, 3, 0), 'dich'); eq(P.path, [[0, 0], [1, 0], [2, 0], [3, 0]]);
  assert.strictEqual(me.x, 0);
  assert.strictEqual(Play.tap(P, 3, 0), 'di'); assert.strictEqual(me.x, 3); assert.strictEqual(Play.tap(P, 1, 0), 'ban');
  Play.update(P, Play.STEP_TIME * 1.5); const a = Play.animPos(P, me); eq(a.from, [1, 0]); eq(a.to, [2, 0]);
  Play.update(P, 1); assert.strictEqual(P.mode, 'menu'); assert.ok(!me.done); assert.strictEqual(Play.tap(P, 1, 0), 'ban');
  assert.ok(Play.wait(P)); assert.ok(me.done); assert.strictEqual(P.mode, 'cho'); assert.strictEqual(Play.left(P), 1);
  assert.strictEqual(Play.tap(P, 3, 0), 'xem');               // đã đi thì không chọn lại được
});
t('Hoàn tác: về ô cũ, chọn lại quân đó', () => {
  const M = mk(['.....']); const me = put(M, 0, 0, { mov: 3 }); const P = mkP(M);
  Play.tap(P, 0, 0); Play.tap(P, 2, 0); Play.tap(P, 2, 0); Play.update(P, 1);
  assert.ok(Play.undo(P)); assert.strictEqual(me.x, 0); assert.strictEqual(P.mode, 'chon'); assert.strictEqual(P.unit, me); assert.ok(!me.done);
  assert.ok(!Play.undo(P));                                   // chỉ hoàn tác được ở menu
});
t('đổi ô đích; chạm ngoài vùng / ngoài bàn cờ thì hủy', () => {
  const M = mk(['......']); put(M, 0, 0, { mov: 2 }); const P = mkP(M);
  Play.tap(P, 0, 0); Play.tap(P, 1, 0); assert.strictEqual(Play.tap(P, 2, 0), 'dich'); eq(P.target, { x: 2, y: 0 });
  assert.strictEqual(Play.tap(P, 5, 0), 'huy'); assert.strictEqual(P.mode, 'cho');
  Play.tap(P, 0, 0); assert.strictEqual(Play.tap(P, null, null), 'huy');
});
t('ô có quân ta / rương (quân bay): đi qua được, không dừng; chạm quân ta khác thì đổi chọn', () => {
  const M = mk(['.....']); put(M, 0, 0, { mov: 4, mt: 'bay' }); const fr = put(M, 1, 0); M.chests.push({ x: 2, y: 0, item: 'x', open: false });
  const P = mkP(M); Play.tap(P, 0, 0);
  assert.strictEqual(Play.tap(P, 2, 0), 'quaduoc'); assert.strictEqual(P.target, null);
  assert.strictEqual(Play.tap(P, 3, 0), 'dich'); eq(P.path, [[0, 0], [1, 0], [2, 0], [3, 0]]);
  assert.strictEqual(Play.tap(P, 1, 0), 'chon'); assert.strictEqual(P.unit, fr);
});
t('quân ta đi hết thì tự sang lượt địch; địch tiến về quân ta; hết vòng sang lượt 2', () => {
  const M = mk(['..........']); const me = put(M, 0, 0); const foe = put(M, 9, 0, { side: 'dich', mov: 3 }); const P = mkP(M);
  Play.tap(P, 0, 0); Play.tap(P, 0, 0); Play.tap(P, 0, 0); Play.update(P, 0); Play.wait(P);   // đứng yên + Chờ
  assert.strictEqual(M.phase, 'dich'); assert.strictEqual(P.mode, 'may'); assert.strictEqual(Play.tap(P, 0, 0), 'ban');
  run(P, 6); assert.strictEqual(foe.x, 6); assert.strictEqual(M.phase, 'ta'); assert.strictEqual(M.turn, 2);
  assert.ok(!me.done && !foe.done); assert.strictEqual(Play.left(P), 1);
});
t('Hết lượt sớm; địch dừng kề quân ta, không đè lên', () => {
  const M = mk(['.....']); put(M, 0, 0); const foe = put(M, 4, 0, { side: 'dich', mov: 9 }); const P = mkP(M);
  assert.ok(Play.endTurn(P)); run(P, 6); assert.strictEqual(foe.x, 1); assert.strictEqual(M.turn, 2);
});
t('map thử: một vòng lượt chạy hết, địch không đứng chồng', () => {
  const M = Core.loadMap(DATA.maps.thu, DATA), P = mkP(M); Play.endTurn(P); run(P, 30);
  assert.strictEqual(M.phase, 'ta'); assert.strictEqual(M.turn, 2);
  const pos = M.units.map(u => u.x + ',' + u.y); assert.strictEqual(new Set(pos).size, pos.length);
  assert.ok(M.units.filter(u => u.side === 'dich').some(u => u.y > 3));        // có địch đã tiến xuống
});
console.log(n + ' bài kiểm thử đạt');
