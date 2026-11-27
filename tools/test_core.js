// Kiểm thử logic lõi không cần trình duyệt: node tools/test_core.js
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const ROOT = path.dirname(__dirname);
const rd = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const DATA = { terrain: rd('data/terrain.json'), units: rd('data/units.json'), maps: {} };
for (const f of fs.readdirSync(path.join(ROOT, 'data/maps'))) if (f.endsWith('.json')) { const m = rd('data/maps/' + f); DATA.maps[m.id] = m; }
const Core = vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'src/34-core.js'), 'utf8') + '\nCore', {});
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
console.log(n + ' bài kiểm thử đạt');
