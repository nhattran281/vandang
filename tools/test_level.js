// Kiểm thử lên cấp, EXP, hạng vũ khí, bảng class (GDD 5.1, 5.2, 2.5) không cần trình duyệt: node tools/test_level.js
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const ROOT = path.dirname(__dirname);
const src = f => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');
const { Core, Play } = vm.runInNewContext(['34-core.js', '36-combat.js', '36-play.js', '37-skills.js', '38-ai.js', '39-level.js'].map(src).join('\n') + '\n({ Core, Play })', {});
const eq = (a, b) => assert.strictEqual(JSON.stringify(a), JSON.stringify(b)); // đối tượng từ vm khác realm nên so qua JSON
const rd = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const DATA = { terrain: rd('data/terrain.json'), units: rd('data/units.json'), classes: rd('data/classes.json'), weapons: rd('data/weapons.json'), skills: rd('data/skills.json'), ai: rd('data/ai.json'), maps: {} };
for (const f of fs.readdirSync(path.join(ROOT, 'data/maps'))) if (f.endsWith('.json')) { const m = rd('data/maps/' + f); DATA.maps[m.id] = m; }
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok', name); };
const clone = o => JSON.parse(JSON.stringify(o));

const mk = terrain => Core.loadMap({ id: 'lv', terrain, height: terrain.map(r => '0'.repeat(r.length)) }, DATA);
const put = (S, tpl, side, x, y, o = {}) => {
  const u = Core.makeUnit(tpl, DATA, side, x, y, S.units.length + 1, o.lv ? { lv: o.lv } : undefined);
  if (o.hp !== undefined) u.hp = o.hp; Object.assign(u.stats, o.stats || {});
  S.units.push(u); return u;
};
const sure = u => { u.stats.skl = 60; u.stats.lck = 30; return u; };   // trúng 100, không bị chí mạng (dễ đoán kết quả)
const fightOf = (S, a, d, seed = 1) => Core.fight(a, d, { distance: Math.abs(a.x - d.x) + Math.abs(a.y - d.y), seed });

// ---------- Bảng class ----------
t('classes.json + units.json hợp lệ (class, base, growth, lv, roster lv)', () => eq(Core.validateClasses(DATA), []));
t('chuyển sang bảng class: chỉ số mọi mẫu giữ nguyên như tuần 4', () => {
  const OLD = {   // units.json tuần 4 (commit d04ccc3), cấp ghi trong mẫu
    dang: [20, 6, 3, 7, 8, 5, 5, 3, 8, 5], linh: [14, 1, 4, 3, 6, 7, 2, 5, 4, 5], tran: [28, 10, 0, 9, 7, 4, 11, 4, 12, 4],
    vien_kiem: [17, 5, 0, 4, 5, 1, 4, 0, 7, 5], vien_giao: [19, 6, 0, 3, 3, 1, 6, 0, 9, 4], vien_tac: [15, 3, 0, 6, 9, 4, 2, 0, 5, 6],
    vien_y: [14, 0, 4, 3, 4, 3, 1, 5, 5, 5], dan_lang: [12, 1, 0, 1, 3, 3, 1, 0, 5, 4],
  };
  for (const id in OLD) eq(Core.STAT_KEYS.map(k => Core.makeUnit(id, DATA, 'dich', 0, 0, 1).stats[k]), OLD[id]);
});
t('lỗi dữ liệu class bị bắt: class lạ, ghi stats thẳng, growth âm ở class, lv quá 20', () => {
  const D = clone(DATA);
  D.units.templates.vien_kiem.class = 'khong_co'; D.units.templates.linh.stats = {}; D.classes.classes.y_su.growth.hp = -5;
  D.maps.thu.roster.E[0] = { tpl: 'vien_giao', lv: 25 };
  const e = Core.validateClasses(D); assert.strictEqual(e.length, 4, e.join('\n'));
});
t('quân thường tự sinh theo cấp: gốc class + gốc cá nhân + floor((cấp − 1) × growth class / 100)', () => {
  const C = DATA.classes.classes.linh_kiem, u = Core.makeUnit('vien_kiem', DATA, 'dich', 0, 0, 1, { lv: 9 });
  assert.strictEqual(u.lv, 9);
  for (const k of Core.STAT_KEYS) assert.strictEqual(u.stats[k], C.base[k] + Math.floor(8 * C.growth[k] / 100), k);
  assert.strictEqual(u.hp, u.stats.hp);
  eq(Core.makeUnit('vien_kiem', DATA, 'ta', 0, 0, 1, { lv: 9 }).stats, u.stats);   // không phụ thuộc phe
});
t('nhân vật có tên (unique) không tự sinh: Trấn cấp 8 giữ đúng gốc; roster { tpl, lv } đổi cấp quân thường', () => {
  const tr = Core.makeUnit('tran', DATA, 'dich', 0, 0, 1), C = DATA.classes.classes.cam_ve, B = DATA.units.templates.tran.base;
  assert.strictEqual(tr.lv, 8); assert.strictEqual(tr.stats.hp, C.base.hp + B.hp);
  const m = clone(DATA.maps.thu); m.roster.E = [{ tpl: 'vien_giao', lv: 6 }, 'vien_kiem', { tpl: 'vien_kiem', lv: 4, ai: { type: 'cho_tam' } }];
  const S = Core.loadMap(m, DATA), E = S.units.filter(u => u.side === 'dich');
  eq(E.map(u => u.lv), [6, 1, 4]); assert.strictEqual(E[2].ai.type, 'cho_tam');
  assert.ok(E[0].stats.hp > Core.makeUnit('vien_giao', DATA, 'dich', 0, 0, 1).stats.hp);
});
t('growth khi lên cấp = growth class + growth cá nhân, kẹp ≥ 0 (Trấn gần như không tăng; Linh tăng mạnh)', () => {
  const tr = Core.makeUnit('tran', DATA, 'ta', 0, 0, 1), li = Core.makeUnit('linh', DATA, 'ta', 0, 0, 2);
  assert.strictEqual(tr.growth.hp, 20); assert.strictEqual(tr.growth.mag, 0);
  assert.ok(Core.STAT_KEYS.every(k => tr.growth[k] >= 0));
  const sum = u => Core.STAT_KEYS.reduce((a, k) => a + u.growth[k], 0);
  assert.ok(sum(li) > sum(Core.makeUnit('dang', DATA, 'ta', 0, 0, 3)) && sum(tr) < 100);
});

// ---------- Công thức EXP ----------
t('EXP đánh trúng / hạ gục đúng GDD 5.1 (kẹp 1–100, boss +40)', () => {
  const U = (lv, o = {}) => Object.assign({ lv }, o);
  assert.strictEqual(Core.hitExp(U(1), U(1)), 10); assert.strictEqual(Core.killExp(U(1), U(1)), 30);
  assert.strictEqual(Core.hitExp(U(1), U(5)), 11); assert.strictEqual(Core.killExp(U(1), U(5)), 43);
  assert.strictEqual(Core.killExp(U(1), U(5, { boss: true })), 83);
  assert.strictEqual(Core.killExp(U(1), U(20, { boss: true })), 100);           // kẹp trên
  assert.strictEqual(Core.hitExp(U(20), U(1)), 4); assert.strictEqual(Core.killExp(U(20), U(1)), 1);   // kẹp dưới
  assert.strictEqual(Core.hitExp(U(1), U(1)) >= 1, true);
});

// ---------- Lên cấp ----------
t('100 EXP lên cấp, dư mang sang; HP hiện tại tăng theo; nhật ký có gains + chỉ số mới', () => {
  const u = Core.makeUnit('dang', DATA, 'ta', 0, 0, 1); u.exp = 90; u.hp = 10;
  const g = Core.gainExp(u, 30, DATA, Core.rng(3));
  assert.strictEqual(u.lv, 2); assert.strictEqual(u.exp, 20);
  assert.strictEqual(g.levels.length, 1); eq(g.exp[0], { uid: 1, name: 'Đăng', gained: 30, from: 90, exp: 20, lv: 2 });
  const L = g.levels[0]; assert.strictEqual(L.from, 1); assert.strictEqual(L.to, 2);
  for (const k in L.gains) assert.strictEqual(L.stats[k], Core.makeUnit('dang', DATA, 'ta', 0, 0, 1).stats[k] + L.gains[k]);
  assert.strictEqual(u.hp, 10 + (L.gains.hp || 0));
});
t('quay growth theo RNG có seed: cùng seed cùng kết quả; growth 0 không bao giờ tăng, 100 luôn +1, 250 là +2/+3', () => {
  const u = { lv: 1, exp: 0, side: 'ta', hp: 1, uid: 1, name: 'x', stats: {}, growth: { hp: 100, str: 0, mag: 250, skl: 50 } };
  for (const k of Core.STAT_KEYS) u.stats[k] = 5;
  eq(Core.rollGains(u, Core.rng(9)), Core.rollGains(u, Core.rng(9)));
  let skl = 0;
  for (let s = 1; s <= 2000; s++) {
    const g = Core.rollGains(u, Core.rng(s));
    assert.strictEqual(g.hp, 1); assert.ok(!g.str && !g.def); assert.ok(g.mag === 2 || g.mag === 3); skl += g.skl || 0;
  }
  assert.ok(Math.abs(skl / 2000 - .5) < .05, 'growth 50% ra ~50%: ' + skl / 2000);
});
t('cấp tối đa 20: EXP về 0, không nhận thêm', () => {
  const u = Core.makeUnit('dang', DATA, 'ta', 0, 0, 1); u.lv = 19; u.exp = 95;
  const g = Core.gainExp(u, 30, DATA, Core.rng(1));
  assert.strictEqual(u.lv, 20); assert.strictEqual(u.exp, 0); assert.strictEqual(g.levels.length, 1);
  const g2 = Core.gainExp(u, 50, DATA, Core.rng(1)); assert.strictEqual(u.exp, 0); assert.strictEqual(g2.exp.length, 0);
});

// ---------- Sau trận ----------
t('quân ta đánh trúng: EXP đánh trúng + điểm vũ khí; hạ gục: EXP hạ gục', () => {
  const S = mk(['...']), a = sure(put(S, 'dang', 'ta', 0, 0)), d = put(S, 'vien_giao', 'dich', 1, 0, { lv: 3 });
  d.stats.hp = d.hp = 99; a.stats.spd = 0;                                // không chết, không đánh đôi
  const g = Core.awardCombat(a, d, fightOf(S, a, d), DATA, Core.rng(1));
  assert.strictEqual(a.exp, Core.hitExp(a, d)); assert.strictEqual(a.exp, 11);
  assert.strictEqual(a.wexp.kiem, 30 + 2); eq(g.ranks, []);
  const S2 = mk(['...']), a2 = sure(put(S2, 'dang', 'ta', 0, 0)), d2 = put(S2, 'vien_kiem', 'dich', 1, 0, { hp: 1 });
  Core.awardCombat(a2, d2, fightOf(S2, a2, d2), DATA, Core.rng(1));
  assert.strictEqual(a2.exp, 30);
});
t('địch không nhận EXP; quân ta phản đòn trúng thì nhận; quân ta ngã thì không nhận gì', () => {
  const S = mk(['...']), e = sure(put(S, 'vien_kiem', 'dich', 0, 0)), a = sure(put(S, 'tran', 'ta', 1, 0));
  a.stats.spd = e.stats.spd = 5; e.stats.hp = e.hp = 99;
  const res = fightOf(S, e, a), g = Core.awardCombat(e, a, res, DATA, Core.rng(1));
  assert.strictEqual(e.exp, 0); assert.strictEqual(e.lv, 1); assert.ok(!e.wexp.kiem || e.wexp.kiem === 0);
  assert.ok(res.strikes.some(s => s.who === 'D' && s.hit));
  assert.strictEqual(a.exp, Core.hitExp(a, e)); eq(g.exp.map(x => x.uid), [a.uid]);
  const S2 = mk(['...']), e2 = sure(put(S2, 'tran', 'dich', 0, 0)), l = put(S2, 'linh', 'ta', 1, 0, { hp: 1 });
  Core.awardCombat(e2, l, fightOf(S2, e2, l), DATA, Core.rng(1));
  assert.strictEqual(l.hp, 0); assert.strictEqual(l.exp, 0);
});
t('trượt hết → 0 EXP, không điểm vũ khí', () => {
  const S = mk(['...']), a = put(S, 'linh', 'ta', 0, 0), d = put(S, 'vien_tac', 'dich', 2, 0);
  a.stats.skl = 0; a.stats.lck = 0; d.stats.spd = 60;                     // trúng 0
  const res = fightOf(S, a, d); assert.ok(res.strikes.length && res.strikes.every(s => !s.hit));
  const g = Core.awardCombat(a, d, res, DATA, Core.rng(1));
  assert.strictEqual(a.exp, 0); assert.strictEqual(a.wexp.lua_den, 0); eq(g.exp, []);
});
t('điểm vũ khí một lần mỗi trận dù đánh đôi; đủ mốc thì tăng hạng E→C và cầm được vũ khí hạng C', () => {
  const S = mk(['...']), a = sure(put(S, 'linh', 'ta', 0, 0)), d = put(S, 'vien_kiem', 'dich', 1, 0);
  a.stats.spd = 30; d.stats.hp = d.hp = 99; a.wexp.lua_den = 28;
  const res = fightOf(S, a, d); assert.strictEqual(res.strikes.filter(s => s.from === a.uid && s.hit).length, 2);
  const W = Core.makeWeapon('an_tru_ta', DATA); a.ranks.tru_ta = 'E'; a.wexp.tru_ta = 0;
  const g = Core.awardCombat(a, d, res, DATA, Core.rng(1));
  assert.strictEqual(a.wexp.lua_den, 30); assert.strictEqual(a.ranks.lua_den, 'C');
  eq(g.ranks, [{ uid: a.uid, name: 'Linh', type: 'lua_den', from: 'E', to: 'C', wexp: 30 }]);
  assert.ok(Core.canWield(a, Object.assign({}, W, { type: 'lua_den' })));
  assert.ok(!Core.canWield(a, W));                                         // loại khác vẫn hạng E
});
t('hạng S là trần: điểm không vượt mốc S; mốc hạng đọc từ weapons.json', () => {
  const u = Core.makeUnit('tran', DATA, 'ta', 0, 0, 1), RE = DATA.weapons.weaponExp.rank;
  assert.strictEqual(u.wexp.kiem, RE.A);
  const g = Core.gainWexp(u, 'kiem', 500, DATA); assert.strictEqual(u.ranks.kiem, 'S'); assert.strictEqual(u.wexp.kiem, RE.S);
  eq(g.ranks.map(r => r.from + r.to), ['AS']);
});
t('kỹ năng sát thương (Hỏa): EXP như đánh trúng, KHÔNG có điểm vũ khí; kỹ năng hỗ trợ (Hộ): 10 EXP; chữa: 15', () => {
  const S = mk(['....']), a = sure(put(S, 'dang', 'ta', 0, 0)), d = put(S, 'vien_kiem', 'dich', 2, 0);
  d.stats.hp = d.hp = 99;
  const r = Core.useSkill(S, a, 'hoa', 2, 0, DATA, { seed: 1 }); assert.ok(r.ok && r.combat.strikes[0].hit);
  Core.awardSkill(S, a, r, DATA, Core.rng(1));
  assert.strictEqual(a.exp, Core.hitExp(a, d)); eq(a.wexp, { kiem: 30, lua_den: 0 });
  const r2 = Core.useSkill(S, a, 'ho', 0, 0, DATA, { seed: 1 }); Core.awardSkill(S, a, r2, DATA, Core.rng(1));
  assert.strictEqual(a.exp, Core.hitExp(a, d) + 10);
  assert.strictEqual(Core.supportExp('chua', DATA), 15); assert.strictEqual(Core.supportExp('soi', DATA), 10);
});
t('aiAct trả growth: quân ta do AI đánh nhận EXP; Y sư địch hồi máu không nhận EXP', () => {
  const S = mk(['....']), a = sure(put(S, 'dang', 'ta', 0, 0)), d = put(S, 'vien_kiem', 'dich', 1, 0);
  d.stats.hp = d.hp = 99;
  const r = Core.aiAct(S, a, { type: 'attack', target: d.uid, slot: 0 }, DATA, { rng: Core.rng(2) });
  assert.ok(r.ok && r.growth.exp.length === 1); assert.strictEqual(a.exp, r.growth.exp[0].exp);
  const S2 = mk(['....']), y = put(S2, 'vien_y', 'dich', 0, 0), k = put(S2, 'vien_kiem', 'dich', 1, 0, { hp: 3 });
  const r2 = Core.aiAct(S2, y, { type: 'skill', skill: 'chua', target: k.uid, tx: 1, ty: 0 }, DATA, { rng: Core.rng(2) });
  assert.ok(r2.ok); eq(r2.growth.exp, []); assert.strictEqual(y.exp, 0);
});
t('lên cấp giữa trận dùng RNG của trận: cùng seed → cùng chỉ số tăng', () => {
  const run = seed => {
    const S = mk(['...']), a = sure(put(S, 'dang', 'ta', 0, 0)), d = put(S, 'vien_kiem', 'dich', 1, 0, { hp: 1 }); a.exp = 95;
    const rng = Core.rng(seed), res = Core.fight(a, d, { distance: 1, rng });
    return Core.awardCombat(a, d, res, DATA, rng).levels[0].gains;
  };
  eq(run(5), run(5));
  assert.ok([1, 2, 3, 4, 6, 7, 8].some(s => JSON.stringify(run(s)) !== JSON.stringify(run(5))));
});

// ---------- Play: bảng Lên cấp ----------
t('Play: đánh xong hiện bảng Lên cấp (bận, chặn thao tác), chạm để đóng rồi chơi tiếp; tự đóng sau LEVEL_TIME', () => {
  const setup = () => {
    const S = mk(['....']), a = sure(put(S, 'dang', 'ta', 0, 0)), d = put(S, 'vien_kiem', 'dich', 1, 0, { hp: 1 }); a.exp = 95; a.stats.mov = 0;
    put(S, 'linh', 'ta', 3, 0);                                             // còn một quân ta chưa đi → không tự hết lượt
    const P = Play.create(S, DATA, 4); Play.update(P, 5);
    Play.tap(P, 0, 0); Play.tap(P, 0, 0); Play.tap(P, 0, 0); Play.update(P, 1);   // chọn → ô đích (đứng yên) → đi → menu
    assert.strictEqual(P.mode, 'menu'); Play.attack(P); Play.tap(P, 1, 0); Play.tap(P, 1, 0);
    assert.strictEqual(P.mode, 'danh'); while (P.battle) Play.update(P, .1);
    return { P, a };
  };
  const { P, a } = setup();
  assert.ok(P.levelUp && P.levelUp.list[0].kind === 'lv'); assert.strictEqual(a.lv, 2);
  assert.ok(Play.busy(P)); assert.strictEqual(P.lastGrowth.exp[0].uid, a.uid);
  assert.strictEqual(Play.tap(P, 3, 0), 'lencap'); assert.ok(!P.levelUp);
  assert.strictEqual(Play.tap(P, 3, 0), 'chon');                          // chơi tiếp bình thường
  const Q = setup().P; Play.update(Q, Play.LEVEL_TIME + .1); assert.ok(!Q.levelUp);
});
t('Play: trận không lên cấp thì không mở bảng; battleView báo +EXP ở cuối phát lại', () => {
  const S = mk(['....']), a = sure(put(S, 'dang', 'ta', 0, 0)), d = put(S, 'vien_kiem', 'dich', 1, 0); d.stats.hp = d.hp = 99; a.stats.mov = 0;
  const P = Play.create(S, DATA, 4); Play.update(P, 5);
  Play.tap(P, 0, 0); Play.tap(P, 0, 0); Play.tap(P, 0, 0); Play.update(P, 1); Play.attack(P); Play.tap(P, 1, 0); Play.tap(P, 1, 0);
  let seen = null; while (P.battle) { const bv = Play.battleView(P); if (bv.exp) seen = bv.exp; Play.update(P, .1); }
  assert.ok(seen && seen[0].gained > 0); assert.ok(!P.levelUp);
});
console.log(n + ' bài kiểm thử đạt');
