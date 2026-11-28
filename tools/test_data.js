// Kiểm thử dữ liệu class / nhân vật / quái Ch.1–3 và luật cung/nỏ đứng cao +1 tầm (GDD 2.4–2.6, 3.2, 4, 7, 8): node tools/test_data.js
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const ROOT = path.dirname(__dirname);
const src = f => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');
const { Core, Play } = vm.runInNewContext(['34-core.js', '36-combat.js', '36-play.js', '37-skills.js', '38-ai.js', '39-level.js'].map(src).join('\n') + '\n({ Core, Play })', {});
const eq = (a, b) => assert.strictEqual(JSON.stringify(a), JSON.stringify(b)); // đối tượng từ vm khác realm nên so qua JSON
const rd = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const DATA = { terrain: rd('data/terrain.json'), units: rd('data/units.json'), classes: rd('data/classes.json'), weapons: rd('data/weapons.json'), skills: rd('data/skills.json'), ai: rd('data/ai.json'), maps: {} };
for (const f of fs.readdirSync(path.join(ROOT, 'data/maps'))) if (f.endsWith('.json')) { const m = rd('data/maps/' + f); DATA.maps[m.id] = m; }
const clone = o => JSON.parse(JSON.stringify(o));
const T = DATA.units.templates;
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok', name); };

// Map nhỏ có độ cao: hàng height viết như map thật.
const mk = (terrain, height) => Core.loadMap({ id: 'dl', terrain, height: height || terrain.map(r => '0'.repeat(r.length)) }, DATA);
const put = (S, tpl, side, x, y) => { const u = Core.makeUnit(tpl, DATA, side, x, y, S.units.length + 1); S.units.push(u); return u; };

// ---------- Mọi bộ kiểm tra dữ liệu đều sạch ----------
t('dữ liệu hợp lệ: weapons, classes, units, skills, ai, maps', () => {
  eq(Core.validateWeapons(DATA), []); eq(Core.validateClasses(DATA), []); eq(Core.validateUnits(DATA), []);
  eq(Core.validateSkills(DATA), []); eq(Core.validateAi(DATA), []);
  for (const id in DATA.maps) eq(Core.validateMap(DATA.maps[id], DATA), []);
});
t('mọi mẫu dựng được: chỉ số ≥ 0, cầm được món đầu túi (nếu có), túi thuộc weaponTypes của class', () => {
  for (const id in T) {
    const u = Core.makeUnit(id, DATA, 'dich', 0, 0, 1), C = DATA.classes.classes[T[id].class];
    assert.ok(Core.STAT_KEYS.every(k => u.stats[k] >= 0) && u.hp >= 1, id);
    if ((T[id].weapons || []).length) assert.ok(u.weapon && u.weapon.id === T[id].weapons[0], id + ' chưa cầm vũ khí');
    for (const w of u.inventory) assert.ok(C.weaponTypes.includes(w.type), id + ' ' + w.id);
  }
});

// ---------- Ch.1–3 đủ quân (GDD 7, 8, 9.2) ----------
t('phe ta Ch.1–3: Đăng, Linh, Trấn, Cuội (Ch.2), Hùng Nỏ (Ch.3) là nhân vật riêng', () => {
  for (const id of ['dang', 'linh', 'tran', 'cuoi', 'hung_no']) assert.ok(T[id] && T[id].unique, id);
  eq(T.cuoi.skills, ['hat_xam', 'noi_phet', 've_khich']); assert.ok(T.cuoi.resources.nhip_dan >= 2);
  for (const k of T.cuoi.skills) assert.strictEqual(DATA.skills.skills[k].resource, 'nhip_dan');
  const h = Core.makeUnit('hung_no', DATA, 'ta', 0, 0, 1);
  assert.strictEqual(h.weapon.type, 'no'); eq(h.weapon.effective.map(r => r.id), ['ha_bay']); assert.strictEqual(h.weapon.highGround, 1);
  const wt = id => DATA.classes.classes[T[id].class].weaponTypes;
  eq([wt('dang'), wt('linh'), wt('tran'), wt('cuoi'), wt('hung_no')], [['kiem', 'dao', 'lua_den'], ['lua_den'], ['kiem', 'giao'], [], ['cung', 'no']]);
});
t('Hùng Nỏ khắc Bay: Uy lực ×2 (8 → 16)', () => {
  const S = mk(['....']), h = put(S, 'hung_no', 'ta', 0, 0), f = put(S, 'ma_da', 'dich', 2, 0);
  f.tags = ['Ma', 'Bay'];
  const a = Core.forecast(h, f, { distance: 2 }).attacker;
  assert.strictEqual(a.atk, h.stats.str + 16); eq(a.effective, ['ha_bay']);
});
t('địch Ch.1–3: lính Viện (kiếm, giáo, cung), Ma da, Ma trành, Hùm tinh, Ma đè — nhãn và loại di chuyển đúng GDD 8', () => {
  const want = {
    vien_kiem: [['Nguoi'], 'bo', 'kiem'], vien_giao: [['Nguoi'], 'bo', 'giao'], vien_cung: [['Nguoi'], 'bo', 'cung'],
    ma_da: [['Ma', 'Thuy'], 'thuy', 'vuot'], ma_tranh: [['Ma'], 'bo', 'vuot'], hum_tinh: [['Yeu'], 'bo', 'vuot'], ma_de: [['Ma'], 'bo', 'am_khi'],
  };
  for (const id in want) {
    const u = Core.makeUnit(id, DATA, 'dich', 0, 0, 1);
    eq([u.tags, u.moveType, u.weapon.type], want[id]);
  }
  assert.ok(T.hum_tinh.boss && Core.makeUnit('hum_tinh', DATA, 'dich', 0, 0, 1).boss);
});
t('khắc chế lên quái mới: thiết khí vs Hùm tinh (Yêu), lửa đèn vs Ma da/trành/Ma đè (Ma)', () => {
  const S = mk(['.....']), d = put(S, 'dang', 'ta', 0, 0);
  for (const [id, w, rule] of [['hum_tinh', 'kiem_sat', 'thiet_khi'], ['ma_da', 'lua_den', 'tru_ma'], ['ma_tranh', 'lua_den', 'tru_ma'], ['ma_de', 'lua_den', 'tru_ma']]) {
    const o = put(S, id, 'dich', 1, 0); d.weapon = d.inventory.find(x => x.id === w);
    eq(Core.forecast(d, o).attacker.effective, [rule]); S.units.pop();
  }
});
t('vũ khí bẩm sinh: Âm khí là phép (đánh vào Kháng), Nanh vuốt là vật lý; không rơi (natural)', () => {
  const de = Core.makeUnit('ma_de', DATA, 'dich', 0, 0, 1), hum = Core.makeUnit('hum_tinh', DATA, 'dich', 0, 0, 1);
  assert.ok(de.weapon.magic && de.weapon.natural); assert.ok(!hum.weapon.magic && hum.weapon.natural);
  const tr = Core.makeUnit('tran', DATA, 'ta', 1, 0, 2);
  assert.strictEqual(Core.forecast(de, tr).attacker.dmg, Math.max(0, de.stats.mag + de.weapon.mt - tr.stats.res));
});
t('Ma da chỉ đi trong nước (đi nước), lính đi bộ lội được nước nông', () => {
  const S = mk(['..~~WW..']), m = put(S, 'ma_da', 'dich', 4, 0);
  const R = Core.reachable(S, m, DATA), xs = R.stops.map(i => i % S.w).sort();
  eq(xs, [2, 3, 4, 5]);
});

// ---------- Hành vi AI mặc định (GDD 4) ----------
t('hành vi mặc định hợp vai: cung giữ vị trí, Ma da/Ma đè chờ tầm, trành chặn đường, Hùm tinh giữ hang', () => {
  const type = id => (T[id].ai || {}).type || 'lao_vao';
  eq(['vien_kiem', 'vien_giao', 'vien_cung', 'ma_da', 'ma_tranh', 'hum_tinh', 'ma_de'].map(type),
    ['lao_vao', 'lao_vao', 'giu_vi_tri', 'cho_tam', 'giu_vi_tri', 'giu_vi_tri', 'cho_tam']);
});
t('Ma da chờ tầm: người còn xa thì đứng yên; tới mép nước thì đánh', () => {
  const S = mk(['.....~W']), m = put(S, 'ma_da', 'dich', 6, 0), d = put(S, 'dan_lang', 'npc', 0, 0);
  let p = Core.planTurn(S, m, DATA); eq([p.x, p.y, p.action], [6, 0, null]);
  d.x = 4; p = Core.planTurn(S, m, DATA);
  assert.strictEqual(p.action && p.action.type, 'attack'); assert.ok(p.wake);
});

// ---------- Cơ chế riêng của quái: chỉ dữ liệu, tuần 8 ----------
t('cơ chế quái ghi trong dữ liệu, chưa chạy (live: false, tuần 8): Ma da kéo + ẩn nước, trành tiếp sức Hùm tinh, Ma đè gây Ngủ', () => {
  const TT = DATA.units.traitTypes, types = id => (T[id].traits || []).map(x => x.type);
  for (const k in TT) if (k !== '_doc') { assert.strictEqual(TT[k].live, false, k); assert.strictEqual(TT[k].tuan, 8, k); }
  eq(types('ma_da'), ['keo_nuoc', 'an_nuoc']); eq(types('ma_tranh'), ['tiep_suc']); eq(types('ma_de'), ['gay_trang_thai']);
  const tr = T.ma_tranh.traits[0], de = T.ma_de.traits[0];
  eq([tr.to, tr.stats], ['hum_tinh', { str: 2, spd: 2 }]); eq([de.status, de.turns], ['ngu', 2]);
  // Chưa chạy: đơn vị mang traits nhưng chỉ số Hùm tinh không đổi khi có trành.
  const S = mk(['....']), h = put(S, 'hum_tinh', 'dich', 0, 0), str0 = h.stats.str;
  put(S, 'ma_tranh', 'dich', 1, 0); put(S, 'ma_tranh', 'dich', 2, 0);
  assert.strictEqual(h.stats.str, str0); eq(S.units[1].traits, T.ma_tranh.traits);
});
t('kỹ năng Cuội: dữ liệu đủ, hiệu ứng ghi nhận (applied: false) chờ tuần 8', () => {
  for (const ty of ['refresh', 'buff', 'debuff', 'status']) assert.strictEqual(DATA.skills.effects[ty].live, false);
  const S = mk(['.....']), c = put(S, 'cuoi', 'ta', 1, 0), d = put(S, 'dang', 'ta', 2, 0), e = put(S, 'vien_kiem', 'dich', 4, 0);
  d.done = true;
  const r1 = Core.useSkill(S, c, 'hat_xam', 2, 0, DATA, { seed: 1 }); assert.ok(r1.ok); eq(r1.effects.map(x => [x.type, x.applied]), [['refresh', false]]);
  assert.ok(d.done);                                                  // chưa làm thật
  const r2 = Core.useSkill(S, c, 'noi_phet', 4, 0, DATA, { seed: 1 }); assert.ok(r2.ok); eq(r2.effects.map(x => x.type), ['debuff', 'status']);
  assert.strictEqual(r2.effects[1].chance, 25);
  const r3 = Core.useSkill(S, c, 've_khich', 1, 0, DATA, { seed: 1 }); assert.ok(r3.ok); eq([r3.effects[0].radius, r3.effects[0].stat], [2, 'str']);
  assert.strictEqual(c.res.nhip_dan, 0);                              // 2 + 1 + 1 = 4
  assert.ok(!Core.useSkill(S, c, 've_khich', 1, 0, DATA).ok);
});

// ---------- look cho phần vẽ ----------
t('look: rig nằm trong danh sách 55-units vẽ được; quái dùng bộ phận có sẵn', () => {
  const code = src('55-units.js');
  const human = JSON.parse(code.match(/HUMAN_RIGS = (\[[^\]]*\])/)[1].replace(/'/g, '"'));
  const beast = [...code.match(/BEAST_RIGS = \{([^}]*)\}/)[1].matchAll(/(\w+): e =>/g)].map(m => m[1]);
  eq([...human, ...beast].sort(), Core.LOOK_RIGS.slice().sort());
  for (const id of ['ma_da', 'hum_tinh', 'ma_de', 'ma_tranh', 'cuoi', 'hung_no', 'vien_cung']) assert.ok(T[id].look && T[id].look.rig, id);
  eq(['ma_da', 'hum_tinh', 'ma_de'].map(id => T[id].look.rig), ['wraith', 'wolf', 'ogre']);
});

// ---------- validateUnits bắt lỗi ----------
t('validateUnits bắt lỗi: nhãn lạ, moveType lạ, vũ khí/hạng ngoài class, trait lạ/thiếu tham số, rig lạ', () => {
  const D = clone(DATA), U = D.units.templates;
  U.vien_kiem.tags = ['Rong'];                                // 1 nhãn lạ
  U.vien_giao.moveType = 'bo_bien';                           // 2
  U.linh.weapons = ['kiem_sat'];                              // 3 hon_lua không cầm kiếm
  U.tran.ranks.cung = 'E';                                    // 4 hạng ngoài class
  U.ma_da.traits.push({ type: 'bay_luon' });                  // 5
  U.ma_tranh.traits[0].to = 'khong_co';                       // 6
  U.ma_de.traits[0].status = 'say';                           // 7
  U.hum_tinh.look.rig = 'rong';                               // 8
  const e = Core.validateUnits(D); assert.strictEqual(e.length, 8, e.join('\n'));
});
t('validateSkills bắt lỗi trạng thái lạ, chance ngoài 0–100, buff thiếu stat', () => {
  const D = clone(DATA), K = D.skills.skills;
  K.noi_phet.effects[1].id = 'say'; K.noi_phet.effects[1].chance = 120; K.ve_khich.effects[0].stat = 'suc';
  const e = Core.validateSkills(D).join('\n'); assert.ok(/trạng thái lạ/.test(e) && /chance/.test(e) && /buff cần stat/.test(e), e);
});

// ---------- GDD 3.2: cung/nỏ đứng cao hơn mục tiêu +1 tầm ----------
// Hàng 0: cung thủ ở (0,0); mục tiêu ở (3,0) cách 3. Độ cao đổi theo từng bài.
const hill = h => mk(['....'], [h]);
t('forecast: cung đứng cao +1 tầm; ngang hoặc thấp hơn thì không; tầm tối thiểu giữ nguyên', () => {
  const S = mk(['....']), a = put(S, 'vien_cung', 'dich', 0, 0), d = put(S, 'dang', 'ta', 3, 0);
  assert.ok(Core.forecast(a, d, { distance: 3, atkH: 1, defH: 0 }).attacker.canAttack);
  assert.ok(Core.forecast(a, d, { distance: 3, atkH: 3, defH: 1 }).attacker.canAttack);
  assert.ok(!Core.forecast(a, d, { distance: 3, atkH: 1, defH: 1 }).attacker.canAttack);
  assert.ok(!Core.forecast(a, d, { distance: 3, atkH: 0, defH: 1 }).attacker.canAttack);
  assert.ok(!Core.forecast(a, d, { distance: 3 }).attacker.canAttack);              // thiếu độ cao = không cộng
  assert.ok(!Core.forecast(a, d, { distance: 1, atkH: 1, defH: 0 }).attacker.canAttack);
  assert.ok(!Core.forecast(a, d, { distance: 4, atkH: 3, defH: 0 }).attacker.canAttack);   // chỉ +1, không theo số bậc
});
t('forecast: chỉ cung/nỏ được cộng (lửa đèn thì không); phản đòn cũng tính độ cao', () => {
  const S = mk(['....']), lin = put(S, 'linh', 'ta', 0, 0), b = put(S, 'vien_cung', 'dich', 3, 0);
  assert.ok(!Core.forecast(lin, b, { distance: 3, atkH: 2, defH: 0 }).attacker.canAttack);    // lửa đèn 1–2
  // Hùng cầm Nỏ thần (2–3) đứng thấp bắn cung thủ cách 3 trên cao → cung thủ phản đòn được (2 + 1).
  const h = put(S, 'hung_no', 'ta', 0, 0); h.ranks.no = 'S'; h.weapon = Core.makeWeapon('no_than', DATA);
  const f = Core.forecast(h, b, { distance: 3, atkH: 0, defH: 1 });
  assert.ok(f.attacker.canAttack && f.defender.canCounter);
  assert.ok(!Core.forecast(h, b, { distance: 3, atkH: 1, defH: 1 }).defender.canCounter);
});
t('Play: Đánh hiện mục tiêu cách 3 khi Hùng Nỏ đứng cao; đứng ngang thì không', () => {
  for (const [h, want] of [['1000', 1], ['0000', 0]]) {
    const S = hill(h), u = put(S, 'hung_no', 'ta', 0, 0); put(S, 'vien_kiem', 'dich', 3, 0);
    assert.strictEqual(Play.targetsOf(S, u).length, want, h);
  }
});
t('AI: cung thủ trên cao bắn mục tiêu cách 3 (planTurn + aiAct), tính cả rủi ro ô đứng', () => {
  const S = hill('1000'), a = put(S, 'vien_cung', 'dich', 0, 0); put(S, 'dang', 'ta', 3, 0);
  const p = Core.planTurn(S, a, DATA, { mov: 0 });
  assert.strictEqual(p.action && p.action.type, 'attack'); eq([p.x, p.y], [0, 0]);
  const r = Core.aiAct(S, a, p.action, DATA, { seed: 3 }); assert.ok(r.ok, r.error); assert.strictEqual(r.combat.forecast.distance, 3);
  const flat = hill('0000'), a2 = put(flat, 'vien_cung', 'dich', 0, 0); put(flat, 'dang', 'ta', 3, 0);
  assert.strictEqual(Core.planTurn(flat, a2, DATA, { mov: 0 }).action, null);
  // Đăng đứng cách 3 dưới chân dốc bị tính rủi ro từ cung thủ trên cao (vùng đe dọa có +1 tầm).
  const S3 = hill('1000'), b3 = put(S3, 'vien_cung', 'dich', 0, 0), d3 = put(S3, 'dang', 'ta', 3, 0);
  b3.stats.mov = 0; d3.stats.mov = 0;
  const S4 = hill('0000'), b4 = put(S4, 'vien_cung', 'dich', 0, 0), d4 = put(S4, 'dang', 'ta', 3, 0); b4.stats.mov = 0; d4.stats.mov = 0;
  assert.ok(Core.planTurn(S3, d3, DATA).score < Core.planTurn(S4, d4, DATA).score);
});

console.log(n + ' bài kiểm thử đạt');
