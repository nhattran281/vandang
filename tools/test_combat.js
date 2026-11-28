// Kiểm thử công thức chiến đấu không cần trình duyệt: node tools/test_combat.js
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const ROOT = path.dirname(__dirname);
const src = f => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');
const Core = vm.runInNewContext(src('34-core.js') + '\n' + src('36-combat.js') + '\nCore', {});
const eq = (a, b) => assert.strictEqual(JSON.stringify(a), JSON.stringify(b)); // mảng từ vm khác realm nên so qua JSON
const rd = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const DATA = { terrain: rd('data/terrain.json'), units: rd('data/units.json'), classes: rd('data/classes.json'), weapons: rd('data/weapons.json') };
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok', name); };

// Vũ khí viết tay cho các bài kiểm công thức 2.3 (không khắc chế, không hạng) — tách khỏi số liệu JSON đang chỉnh
const sword = { name: 'Kiếm sắt', mt: 5, hit: 90, crit: 0, wt: 5, minRange: 1, maxRange: 1 };
const bow = { name: 'Cung', mt: 6, hit: 85, crit: 0, wt: 5, minRange: 2, maxRange: 2 };
const dao = { name: 'Đao sát', mt: 9, hit: 75, crit: 30, wt: 7, minRange: 1, maxRange: 1 };
const fire = { name: 'Lửa đèn', mt: 5, hit: 90, crit: 0, wt: 4, minRange: 1, maxRange: 2, magic: true };

let uid = 1;
function unit(stats, extra) {
  const s = Object.assign({ hp: 20, str: 5, mag: 0, skl: 5, spd: 5, lck: 5, def: 3, res: 1, con: 5, mov: 5 }, stats);
  return Object.assign({ uid: uid++, tpl: 'thu', side: 'ta', stats: s, hp: s.hp, weapon: sword }, extra);
}
const forest = { avo: 20, def: 1 };

// ---------- True Hit 2RN ----------
t('2RN: tỷ lệ thực đếm đủ (80→92.2, 30→18.3)', () => {
  assert.strictEqual(Core.trueHit(80), 92.2);
  assert.strictEqual(Core.trueHit(30), 18.3);
  assert.strictEqual(Core.trueHit(50), 50.5);
  assert.strictEqual(Core.trueHit(0), 0);
  assert.strictEqual(Core.trueHit(100), 100);
});
t('2RN: quay 200.000 lần theo seed khớp tỷ lệ thực', () => {
  for (const [shown, real] of [[80, 92.2], [30, 18.3], [95, 99.5]]) {
    const rng = Core.rng(12345); let hits = 0; const N = 200000;
    for (let i = 0; i < N; i++) if (Core.roll2RN(rng, shown).hit) hits++;
    const pct = hits / N * 100;
    assert.ok(Math.abs(pct - real) < 0.4, `hiển thị ${shown}%: thực ${pct.toFixed(2)}%, mong ${real}%`);
  }
});

// ---------- Dự báo ----------
t('forecast: Công, ST, AS, Trúng/Né, Chí mạng theo bảng 2.3', () => {
  const A = unit({ str: 8, skl: 7, spd: 9, lck: 6, con: 4 }, { weapon: dao });
  const D = unit({ def: 4, spd: 4, lck: 3 }, { side: 'dich' });
  const f = Core.forecast(A, D, { distance: 1, defTerrain: forest }).attacker;
  assert.strictEqual(f.atk, 17);      // 8 + 9
  assert.strictEqual(f.dmg, 12);      // 17 − (4 + 1 rừng)
  assert.strictEqual(f.as, 6);        // 9 − max(0, 7 − 4)
  assert.strictEqual(f.hitStat, 92);  // 75 + 7×2 + 6/2
  assert.strictEqual(f.hit, 61);      // 92 − (4×2 + 3 + 20 rừng)
  assert.strictEqual(f.crit, 30);     // 30 + 7/2 − 3
  assert.strictEqual(f.doubles, false);
});
t('forecast: phép dùng Phép và Kháng', () => {
  eq(Core.forecast(unit({ mag: 7 }, { weapon: fire }), unit({ def: 10, res: 2 })).attacker.dmg, 10);
});
t('forecast: ST không âm, Trúng kẹp 0–100', () => {
  const f = Core.forecast(unit({ str: 1, skl: 20, lck: 20 }), unit({ def: 30, spd: 0, lck: 0 })).attacker;
  assert.strictEqual(f.dmg, 0); assert.strictEqual(f.hit, 100);
  assert.strictEqual(Core.forecast(unit({}), unit({ spd: 50, lck: 30 })).attacker.hit, 0);
});
t('forecast: đánh đôi khi chênh AS ≥ 4; Nặng làm chậm', () => {
  const D = unit({ spd: 5 });
  assert.strictEqual(Core.forecast(unit({ spd: 9 }), D).attacker.doubles, true);
  assert.strictEqual(Core.forecast(unit({ spd: 8 }), D).attacker.doubles, false);
  assert.strictEqual(Core.forecast(unit({ spd: 9, con: 4 }, { weapon: dao }), D).attacker.doubles, false);
});
t('forecast: ngoài tầm thì không phản đòn', () => {
  const f = Core.forecast(unit({}, { weapon: bow }), unit({}), { distance: 2 });
  assert.strictEqual(f.attacker.canAttack, true); assert.strictEqual(f.defender.canCounter, false); assert.strictEqual(f.defender.strikes, 0);
});
t('forecast: không đổi trạng thái đơn vị', () => {
  const A = unit({}), D = unit({}); const before = JSON.stringify([A, D]);
  Core.forecast(A, D); assert.strictEqual(JSON.stringify([A, D]), before);
});

// ---------- Trận đấu ----------
t('fight: thứ tự A → D → A(đôi); cùng seed cùng kết quả', () => {
  const mk = () => [unit({ spd: 10, hp: 40 }), unit({ hp: 40 })];
  const [a1, d1] = mk(), [a2, d2] = mk();
  const r1 = Core.fight(a1, d1, { seed: 99 }), r2 = Core.fight(a2, d2, { seed: 99 });
  eq(r1.strikes.map(s => s.who), ['A', 'D', 'A']);
  eq(r1.strikes.map(s => [s.hit, s.crit, s.damage, s.rolls]), r2.strikes.map(s => [s.hit, s.crit, s.damage, s.rolls]));
  assert.strictEqual(a1.hp, a2.hp); assert.strictEqual(d1.hp, d2.hp);
});
t('fight: về 0 HP thì dừng và rút lui (Casual)', () => {
  const D = unit({ hp: 5, spd: 0, lck: 0 });
  const r = Core.fight(unit({ str: 30, skl: 30, spd: 20 }), D, { seed: 1 });
  assert.strictEqual(r.strikes.length, 1); assert.strictEqual(D.hp, 0);
  assert.strictEqual(D.retreated, true); assert.strictEqual(D.dead, undefined);
  assert.strictEqual(r.outcome.result, 'retreated'); assert.strictEqual(r.outcome.gameOver, false);
});
t('fight: Classic → chết; Đăng ngã → thua trận', () => {
  const D = unit({ hp: 1, spd: 0, lck: 0 }, { tpl: 'dang' });
  const r = Core.fight(unit({ str: 30, skl: 30 }), D, { seed: 1, mode: 'classic' });
  assert.strictEqual(D.dead, true); assert.strictEqual(r.outcome.gameOver, true);
});
t('fight: phản đòn hạ người đánh thì dừng luôn', () => {
  const A = unit({ hp: 1, skl: 0, lck: 0, spd: 0 });
  const r = Core.fight(A, unit({ str: 30, skl: 30, spd: 0, lck: 30 }), { seed: 3 });
  assert.strictEqual(r.strikes[r.strikes.length - 1].who, 'D'); assert.strictEqual(A.retreated, true);
});
t('fight: chí mạng ×3, tần suất khớp tỷ lệ', () => {
  const rng = Core.rng(2026); let crits = 0, hits = 0;
  const w = Object.assign({}, dao, { crit: 25 });
  for (let i = 0; i < 20000; i++) {
    const r = Core.fight(unit({ str: 8, skl: 30, lck: 0 }, { weapon: w }), unit({ hp: 999, def: 5, spd: 0, lck: 0 }, { weapon: null }), { rng });
    for (const s of r.strikes) if (s.hit) { hits++; if (s.crit) { crits++; assert.strictEqual(s.damage, 36); } else assert.strictEqual(s.damage, 12); }
  }
  assert.ok(Math.abs(crits / hits * 100 - 40) < 1.5, 'chí mạng ' + (crits / hits * 100).toFixed(2) + '%'); // 25 + 30/2 − 0
});
t('fight: không vũ khí → không đánh, không phản đòn', () => {
  assert.strictEqual(Core.fight(unit({}, { weapon: null }), unit({}), { seed: 1 }).strikes.length, 0);
  assert.ok(Core.fight(unit({}), unit({ hp: 99 }, { weapon: null }), { seed: 1 }).strikes.every(s => s.who === 'A'));
});

// ---------- Dữ liệu vũ khí (GDD 2.5) ----------
const W = id => Core.makeWeapon(id, DATA);
t('weapons.json + vũ khí của các mẫu đơn vị hợp lệ', () => eq(Core.validateWeapons(DATA), []));
t('validateWeapons bắt lỗi: hạng E có độ bền, mẫu chưa đủ hạng, loại lạ', () => {
  const bad = JSON.parse(JSON.stringify(DATA));
  bad.weapons.items.kiem_sat.uses = 30;
  bad.weapons.items.thu = { name: 'x', type: 'roi', rank: 'E', mt: 1, hit: 1, wt: 1, range: [1, 1] };
  bad.units.templates.vien_kiem.weapons = ['kiem_bac'];
  const errs = Core.validateWeapons(bad).join('\n');
  assert.ok(/kiem_sat.*không có độ bền/.test(errs), errs);
  assert.ok(/loại lạ 'roi'/.test(errs), errs);
  assert.ok(/vien_kiem.*kiem_bac.*cần A/.test(errs), errs);
});
t('makeWeapon: chỉ vũ khí mạnh có độ bền; mỗi bản riêng', () => {
  const thuong = W('kiem_sat'), bac = W('kiem_bac');
  assert.strictEqual(thuong.uses, undefined); assert.strictEqual(bac.uses, 20); assert.strictEqual(bac.maxUses, 20);
  for (const id in DATA.weapons.items) { const it = DATA.weapons.items[id]; assert.ok(!it.uses || it.rank !== 'E', id); }
  const b2 = W('kiem_bac'); b2.uses = 3; assert.strictEqual(bac.uses, 20);
  eq(W('lua_den').effective.map(r => r.id), ['tru_ma']); assert.strictEqual(W('lua_den').magic, true);
  eq(W('giao_sat').effective, []);
});
t('makeUnit: gắn túi vũ khí, trang bị cái đầu tiên', () => {
  const u = Core.makeUnit('dang', DATA, 'ta', 0, 0, 1);
  eq(u.inventory.map(w => w.id), ['kiem_sat', 'lua_den']); assert.strictEqual(u.weapon.id, 'kiem_sat');
  assert.strictEqual(Core.makeUnit('dan_lang', DATA, 'npc', 0, 0, 2).weapon, null);
});
t('hạng chưa đủ → không đánh, không phản đòn', () => {
  const A = unit({}, { weapon: W('kiem_bac'), ranks: { kiem: 'C' } });
  assert.strictEqual(Core.canWield(A, A.weapon), false);
  assert.strictEqual(Core.forecast(A, unit({})).attacker.canAttack, false);
  assert.strictEqual(Core.forecast(unit({}), A).defender.canCounter, false);
  assert.strictEqual(Core.canWield(unit({}, { ranks: { kiem: 'A' } }), W('kiem_bac')), true);
});

// ---------- Khắc chế Người – Ma – Yêu – Bay – Thủy (GDD 2.4) ----------
const tough = (tags, extra) => unit({ def: 4, res: 2, spd: 10, lck: 10 }, Object.assign({ side: 'dich', tags, weapon: null }, extra)); // Né 30
t('Thiết khí (kiếm, đao) vs Yêu: ST ×1.5 làm tròn xuống, +15 trúng', () => {
  const A = unit({ str: 8, skl: 7, lck: 6 }, { weapon: W('kiem_sat') });   // Công 13, Trúng 90+14+3 = 107
  const yeu = Core.forecast(A, tough(['Yeu'])).attacker, nguoi = Core.forecast(A, tough(['Nguoi'])).attacker;
  assert.strictEqual(nguoi.dmg, 9); assert.strictEqual(nguoi.hit, 77); eq(nguoi.effective, []);
  assert.strictEqual(yeu.dmg, 13);  assert.strictEqual(yeu.hit, 92); eq(yeu.effective, ['thiet_khi']);  // floor(9×1.5)
  eq(Core.forecast(unit({ str: 8 }, { weapon: W('dao_sat') }), tough(['Yeu'])).attacker.effective, ['thiet_khi']);
  eq(Core.forecast(unit({ str: 8 }, { weapon: W('giao_sat') }), tough(['Yeu'])).attacker.effective, []);   // giáo không khắc
});
t('Lửa đèn, phép trừ tà vs Ma: dùng Kháng, ST ×1.5, +15 trúng', () => {
  const A = unit({ mag: 7 }, { weapon: W('lua_den') });                    // Công 12 − Kháng 2 = 10
  const f = Core.forecast(A, tough(['Ma'])).attacker;
  assert.strictEqual(f.dmg, 15); assert.strictEqual(f.effHit, 15);
  assert.strictEqual(Core.forecast(A, tough(['Yeu'])).attacker.dmg, 10);
  assert.strictEqual(Core.forecast(unit({ mag: 7 }, { weapon: W('kinh_tru_ta') }), tough(['Ma'])).attacker.dmg, 13); // floor((11−2)×1.5)
});
t('Cung, nỏ vs Bay: Uy lực ×2, không cộng trúng; Đầu bay (Ma, Bay) chỉ ăn luật Bay', () => {
  const A = unit({ str: 5 }, { weapon: W('cung_go') });                    // Mt 6
  const bay = Core.forecast(A, tough(['Bay']), { distance: 2 }).attacker;
  assert.strictEqual(bay.atk, 17); assert.strictEqual(bay.dmg, 13); assert.strictEqual(bay.effHit, 0);
  assert.strictEqual(Core.forecast(A, tough(['Nguoi']), { distance: 2 }).attacker.dmg, 7);
  eq(Core.forecast(A, tough(['Ma', 'Bay']), { distance: 2 }).attacker.effective, ['ha_bay']);
  assert.strictEqual(Core.forecast(unit({ str: 5 }, { weapon: W('no_tay') }), tough(['Bay']), { distance: 2 }).attacker.atk, 21);
});
t('Sấm sét vs Thủy hoặc mục tiêu Ướt: ST ×1.5', () => {
  const set = Object.assign(W('lua_den'), { type: 'set', effective: [Object.assign({ id: 'set_nuoc' }, DATA.weapons.effectiveness.set_nuoc)] });
  const A = unit({ mag: 7 }, { weapon: set });                             // ST gốc 10
  assert.strictEqual(Core.forecast(A, tough(['Yeu', 'Thuy'])).attacker.dmg, 15);
  assert.strictEqual(Core.forecast(A, tough(['Nguoi'], { statuses: ['uot'] })).attacker.dmg, 15);
  assert.strictEqual(Core.forecast(A, tough(['Nguoi'], { statuses: [{ id: 'uot', turns: 2 }] })).attacker.dmg, 15);
  assert.strictEqual(Core.forecast(A, tough(['Nguoi'], { statuses: ['bong'] })).attacker.dmg, 10);
});
t('khắc chế áp cả khi phản đòn; trúng vẫn kẹp ≤ 100', () => {
  const ma = unit({ mag: 9, skl: 20, lck: 20 }, { weapon: W('lua_den') });
  const f = Core.forecast(unit({ spd: 0, lck: 0 }, { tags: ['Ma'] }), ma);
  eq(f.defender.effective, ['tru_ma']); assert.strictEqual(f.defender.hit, 100);
});

// ---------- Độ bền (GDD 2.5) ----------
t('độ bền: trừ 1 mỗi đòn trúng; gãy giữa trận thì dừng và đổi vũ khí kế', () => {
  const bac = W('kiem_bac'); bac.uses = 1;
  const A = unit({ str: 10, skl: 30, spd: 20 }, { ranks: { kiem: 'A' }, inventory: [bac, W('kiem_sat')] }); A.weapon = bac;
  const r = Core.fight(A, unit({ hp: 999, spd: 0, lck: 0 }, { weapon: null }), { seed: 5 });
  assert.strictEqual(r.forecast.attacker.strikes, 2);        // dự báo đánh đôi…
  assert.strictEqual(r.strikes.length, 1);                  // …nhưng gãy sau đòn đầu
  assert.strictEqual(r.strikes[0].broke, true); assert.strictEqual(bac.uses, 0);
  assert.strictEqual(A.weapon.id, 'kiem_sat');
});
t('độ bền: trượt không trừ; vũ khí thường không có độ bền', () => {
  const bac = W('kiem_bac');
  const A = unit({ skl: 0, lck: 0 }, { ranks: { kiem: 'A' }, weapon: bac });
  Core.fight(A, unit({ hp: 999, spd: 30, lck: 30 }, { weapon: null }), { seed: 5 });   // trúng 0%
  assert.strictEqual(bac.uses, 20);
  const s = W('kiem_sat'); Core.fight(unit({ skl: 30 }, { weapon: s }), unit({ hp: 999 }, { weapon: null }), { seed: 5 });
  assert.strictEqual(s.uses, undefined);
});
console.log(n + ' bài kiểm thử đạt');
