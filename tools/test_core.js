// Kiểm thử logic lõi không cần trình duyệt: node tools/test_core.js
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const ROOT = path.dirname(__dirname);
const rd = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const DATA = { terrain: rd('data/terrain.json'), units: rd('data/units.json'), weapons: rd('data/weapons.json'), maps: {} };
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
console.log(n + ' bài kiểm thử đạt');
