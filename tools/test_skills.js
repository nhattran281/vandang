// Kiểm thử khung kỹ năng không cần trình duyệt: node tools/test_skills.js
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const ROOT = path.dirname(__dirname);
const src = f => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');
const Core = vm.runInNewContext(src('34-core.js') + '\n' + src('36-combat.js') + '\n' + src('37-skills.js') + '\nCore', {});
const eq = (a, b) => assert.strictEqual(JSON.stringify(a), JSON.stringify(b)); // mảng từ vm khác realm nên so qua JSON
const rd = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const DATA = { terrain: rd('data/terrain.json'), units: rd('data/units.json'), weapons: rd('data/weapons.json'), skills: rd('data/skills.json') };
const clone = o => JSON.parse(JSON.stringify(o));
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok', name); };

// Map nhỏ 7×7: Đăng ở (3,3), Trấn bên trái (2,3); địch cách 1 (đứng trên rừng (3,2)), cách 2 (3,1), cách 3 (6,3).
//  .......
//  ...E...   E(3,1) cách 2
//  ...E...   E(3,2) trên ô rừng, cách 1
//  ..TD..E   Trấn (2,3), Đăng (3,3), E(6,3) cách 3
//  .......
const MAP = {
  id: 'kn', terrain: ['.......', '.......', '...F...', '.......', '.......', '.......', '.......'],
  height: ['0000000', '0000000', '0000000', '0000000', '0000000', '0000000', '0000000'],
  units:  ['.......', '...E...', '...E...', '..AA..E', '.......', '.......', '.......'],
  roster: { A: ['tran', 'dang'], E: ['vien_kiem', 'vien_giao', 'vien_kiem'] },
};
function battle() {
  const S = Core.loadMap(MAP, DATA);
  return { S, dang: Core.unitAt(S, 3, 3), tran: Core.unitAt(S, 2, 3), near: Core.unitAt(S, 3, 2), mid: Core.unitAt(S, 3, 1), far: Core.unitAt(S, 6, 3) };
}
const at = list => list.map(o => o.x + ',' + o.y);

// ---------- Dữ liệu ----------
t('skills.json + units.json hợp lệ', () => eq(Core.validateSkills(DATA), []));
t('validate bắt lỗi: tầm vượt 1/3 map, tài nguyên lạ, mẫu thiếu tài nguyên', () => {
  const D = clone(DATA);
  D.skills.skills.soi.range = [0, 6];
  D.skills.skills.ho.resource = 'xang';
  D.skills.skills.tran.effects.push({ type: 'bay_len' });
  D.units.templates.dang.resources = { dau_den: 1 };
  const e = Core.validateSkills(D).join('\n');
  assert.match(e, /soi: tầm 6 vượt giới hạn 4/);
  assert.match(e, /ho: tài nguyên lạ 'xang'/);
  assert.match(e, /tran: loại hiệu ứng lạ 'bay_len'/);
  assert.match(e, /mẫu dang: thiếu tài nguyên 'dau_den' đủ dùng tran/);
});
t('tầm mọi kỹ năng ≤ rangeCap (≈ 1/3 cạnh ngắn map 12×16)', () => {
  assert.strictEqual(DATA.skills.rangeCap, Math.floor(12 / 3));
  for (const id in DATA.skills.skills) assert.ok(DATA.skills.skills[id].range[1] <= DATA.skills.rangeCap, id);
});

// ---------- Đơn vị & tài nguyên ----------
t('Đăng có 4 kỹ năng + 6 Dầu đèn, quân khác không có', () => {
  const { dang, tran } = battle();
  eq(dang.skills, ['soi', 'tran', 'hoa', 'ho']); eq(dang.res, { dau_den: 6 }); eq(dang.resMax, { dau_den: 6 });
  eq(tran.skills, []); eq(tran.res, {});
});
t('tài nguyên hồi đầy đầu trận (refillResources), resMax không bị đụng', () => {
  const { S, dang } = battle();
  dang.res.dau_den = 1; Core.refillResources(S);
  eq(dang.res, { dau_den: 6 }); dang.res.dau_den = 0; eq(dang.resMax, { dau_den: 6 });
});
t('canAfford: đủ / thiếu / không có kỹ năng', () => {
  const { dang, tran } = battle();
  assert.ok(Core.canAfford(dang, 'hoa', DATA));
  dang.res.dau_den = 1; assert.ok(!Core.canAfford(dang, 'hoa', DATA)); assert.ok(Core.canAfford(dang, 'soi', DATA));
  assert.ok(!Core.canAfford(tran, 'soi', DATA));
});

// ---------- Mục tiêu ----------
t('Hỏa (địch, tầm 1–2): chỉ địch cách 1–2', () => { const { S, dang } = battle(); eq(at(Core.skillTargets(S, dang, 'hoa', DATA)), ['3,1', '3,2']); });
t('Trấn (địch, tầm 1): chỉ địch kề bên', () => { const { S, dang } = battle(); eq(at(Core.skillTargets(S, dang, 'tran', DATA)), ['3,2']); });
t('Hộ (đồng minh, tầm 0–1): chính mình + đồng đội kề, không có địch', () => { const { S, dang } = battle(); eq(at(Core.skillTargets(S, dang, 'ho', DATA)), ['2,3', '3,3']); });
t('Soi (ô, tầm 0–3): mọi ô trong hình thoi bán kính 3, cắt theo mép map', () => {
  const { S, dang } = battle(), L = Core.skillTargets(S, dang, 'soi', DATA);
  assert.strictEqual(L.length, 25);   // 2·3·4 + 1 = 25, map 7×7 với tâm (3,3) vừa khít
  assert.ok(L.every(o => Math.abs(o.x - 3) + Math.abs(o.y - 3) <= 3));
});
t('opts.from: thử từ ô khác (cho AI) mà không dời quân', () => {
  const { S, dang } = battle();
  eq(at(Core.skillTargets(S, dang, 'hoa', DATA, { from: [5, 2] })), ['3,2', '6,3']);
  eq(at(Core.skillTargets(S, dang, 'ho', DATA, { from: [1, 3] })), ['1,3', '2,3']);   // chính mình tính ở ô thử
  eq([dang.x, dang.y], [3, 3]);
});

// ---------- Dùng kỹ năng ----------
t('Hỏa: 1 đòn phép theo công thức 36-combat, trừ 2 Dầu, không phản đòn/đánh đôi', () => {
  const { S, dang, mid } = battle();
  dang.stats.spd = 30;                                // đủ đánh đôi nếu là đòn thường
  const fc = Core.skillForecast(S, dang, 'hoa', 3, 1, DATA).damage;
  assert.strictEqual(fc.attacker.dmg, dang.stats.mag + 6 - mid.stats.res);
  assert.strictEqual(fc.attacker.strikes, 1); assert.strictEqual(fc.defender.strikes, 0);
  const hp = mid.hp, r = Core.useSkill(S, dang, 'hoa', 3, 1, DATA, { seed: 3 });
  assert.ok(r.ok); assert.strictEqual(r.left, 4); assert.strictEqual(dang.res.dau_den, 4);
  assert.strictEqual(r.combat.strikes.length, 1); assert.strictEqual(r.combat.strikes[0].who, 'A');
  assert.strictEqual(mid.hp, hp - r.combat.strikes[0].damage);
  assert.strictEqual(dang.weapon.id, 'kiem_sat');      // vũ khí đang cầm không đổi
});
t('Hỏa khắc Ma: ×1.5 sát thương sau Kháng, +15 trúng (luật tru_ma)', () => {
  const { S, dang, mid } = battle();
  const base = Core.skillForecast(S, dang, 'hoa', 3, 1, DATA).damage.attacker;
  mid.tags = ['Ma'];
  const ma = Core.skillForecast(S, dang, 'hoa', 3, 1, DATA).damage.attacker;
  eq(ma.effective, ['tru_ma']);
  assert.strictEqual(ma.dmg, Math.floor(base.dmg * 1.5));
  assert.strictEqual(ma.hit, Math.min(100, base.hit + 15));
});
t('Hỏa: trúng thì ghi Bỏng; trượt thì bỏ qua; ô rừng thì ghi đốt rừng', () => {
  let { S, dang, near } = battle();
  near.stats.spd = 0; near.stats.lck = 0; near.hp = 999; dang.stats.skl = 30;   // chắc trúng
  let r = Core.useSkill(S, dang, 'hoa', 3, 2, DATA, { seed: 1 });
  const by = (r, ty) => r.effects.find(e => e.type === ty);
  assert.ok(by(r, 'damage').hit); assert.ok(!by(r, 'status').skipped); assert.strictEqual(by(r, 'status').id, 'bong');
  assert.strictEqual(by(r, 'status').applied, false);                  // chỉ ghi nhận, tuần 8 làm thật
  assert.ok(!by(r, 'ignite').skipped);                                 // (3,2) là rừng
  eq(near.statuses, undefined);                                        // chưa gắn trạng thái lên đơn vị
  ({ S, dang, near } = battle());
  near.stats.spd = 40; near.stats.lck = 40; dang.stats.skl = 0; dang.stats.lck = 0;  // chắc trượt
  r = Core.useSkill(S, dang, 'hoa', 3, 2, DATA, { seed: 1 });
  assert.ok(!by(r, 'damage').hit); assert.ok(by(r, 'status').skipped);
  ({ S, dang } = battle());
  r = Core.useSkill(S, dang, 'hoa', 3, 1, DATA, { seed: 1 });          // (3,1) là đồng → không đốt
  assert.ok(by(r, 'ignite').skipped);
});
t('Trấn: ghi đẩy lùi; choáng chỉ khi mục tiêu là Ma; không đổi HP', () => {
  let { S, dang, near } = battle();
  let r = Core.useSkill(S, dang, 'tran', 3, 2, DATA);
  assert.ok(r.ok); assert.strictEqual(r.combat, null); assert.strictEqual(near.hp, near.stats.hp); assert.strictEqual(dang.res.dau_den, 4);
  eq(r.effects.map(e => [e.type, !!e.skipped]), [['push', false], ['status', true]]);
  eq([near.x, near.y], [3, 2]);                                        // đẩy chưa làm thật
  ({ S, dang, near } = battle()); near.tags = ['Ma'];
  r = Core.useSkill(S, dang, 'tran', 3, 2, DATA);
  eq(r.effects.map(e => [e.type, !!e.skipped]), [['push', false], ['status', false]]);
  assert.strictEqual(r.effects[1].id, 'choang');
});
t('Soi lên ô trống, Hộ lên đồng đội: ghi nhận, trừ 1 Dầu', () => {
  const { S, dang, tran } = battle();
  let r = Core.useSkill(S, dang, 'soi', 4, 4, DATA);
  assert.ok(r.ok); assert.strictEqual(r.target, null); eq([r.effects[0].type, r.effects[0].radius], ['light', 2]);
  r = Core.useSkill(S, dang, 'ho', 2, 3, DATA);
  assert.ok(r.ok); assert.strictEqual(r.target, tran.uid); assert.strictEqual(r.effects[0].amount, 5);
  assert.strictEqual(dang.res.dau_den, 4);
});
t('từ chối: thiếu tài nguyên / ô ngoài tầm / sai loại mục tiêu / không có kỹ năng — không trừ Dầu', () => {
  const { S, dang, tran } = battle();
  dang.res.dau_den = 1;
  assert.match(Core.useSkill(S, dang, 'hoa', 3, 1, DATA).error, /không đủ Dầu đèn/);
  dang.res.dau_den = 6;
  assert.match(Core.useSkill(S, dang, 'hoa', 6, 3, DATA).error, /không phải mục tiêu/);   // cách 3
  assert.match(Core.useSkill(S, dang, 'hoa', 2, 3, DATA).error, /không phải mục tiêu/);   // đồng đội
  assert.match(Core.useSkill(S, dang, 'ho', 3, 2, DATA).error, /không phải mục tiêu/);    // địch
  assert.match(Core.useSkill(S, tran, 'soi', 2, 3, DATA).error, /không có kỹ năng/);
  assert.strictEqual(dang.res.dau_den, 6);
});
t('hết Dầu thì không dùng được nữa (6 Dầu = 3 lần Hỏa)', () => {
  const { S, dang, mid } = battle(); mid.hp = 999; mid.stats.hp = 999;
  for (let i = 0; i < 3; i++) assert.ok(Core.useSkill(S, dang, 'hoa', 3, 1, DATA, { seed: i }).ok);
  assert.strictEqual(Core.useSkill(S, dang, 'hoa', 3, 1, DATA).ok, false);
  assert.ok(!Core.canAfford(dang, 'soi', DATA));
});
t('Hỏa hạ gục: rút lui (Casual), hiệu ứng theo sau bị bỏ qua', () => {
  const { S, dang, mid } = battle(); mid.hp = 1; mid.stats.spd = 0; mid.stats.lck = 0; dang.stats.skl = 30;
  const r = Core.useSkill(S, dang, 'hoa', 3, 1, DATA, { seed: 2 });
  assert.strictEqual(r.combat.outcome.result, 'retreated'); assert.ok(mid.retreated);
  assert.ok(r.effects.find(e => e.type === 'status').skipped);
});
t('cùng seed → cùng kết quả', () => {
  const a = battle(), b = battle();
  eq(Core.useSkill(a.S, a.dang, 'hoa', 3, 1, DATA, { seed: 42 }), Core.useSkill(b.S, b.dang, 'hoa', 3, 1, DATA, { seed: 42 }));
});
console.log(n + ' bài kiểm thử đạt');
