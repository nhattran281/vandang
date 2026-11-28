// Kiểm thử hoạt ảnh GSAP + tua lượt địch (tuần 6) không cần trình duyệt: node tools/test_anim.js
// - GSAP lõi nạp được, Timeline luôn paused (chạy theo đồng hồ của Play, không theo ticker/đồng hồ thật).
// - Timeline đi / trận dài đúng bằng P.anim.dur / P.battle.dur; tư thế đi khớp nội suy cũ; HP, đòn đang chạy, số bay lên, rút lui khớp nhật ký.
// - Tất định: cùng chuỗi dt → cùng giá trị từng khung; tua một lần hay nhiều bước nhỏ ra cùng kết quả.
// - Tua lượt địch x1 / x2 / x4 / bỏ qua: cùng seed → cùng nhật ký trận, cùng vị trí/HP/EXP, cùng trạng thái RNG.
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const ROOT = path.dirname(__dirname);
const src = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const rd = p => JSON.parse(src(p));
const DATA = { terrain: rd('data/terrain.json'), units: rd('data/units.json'), classes: rd('data/classes.json'), weapons: rd('data/weapons.json'), skills: rd('data/skills.json'), ai: rd('data/ai.json'), chapters: rd('data/chapters.json'), maps: {} };
for (const f of fs.readdirSync(path.join(ROOT, 'data/maps'))) if (f.endsWith('.json')) { const m = rd('data/maps/' + f); DATA.maps[m.id] = m; }

// Ngữ cảnh giống trình duyệt tối thiểu: window = chính nó; requestAnimationFrame không làm gì → ticker GSAP không bao giờ tự chạy.
const ctx = { requestAnimationFrame: () => 0, cancelAnimationFrame: () => {}, setTimeout: () => 0, clearTimeout: () => {}, console, performance: { now: () => 0 }, Date };
ctx.window = ctx; ctx.self = ctx; vm.createContext(ctx);
vm.runInContext(src('vendor/gsap.min.js'), ctx);
const game = ['34-core.js', '36-combat.js', '36-play.js', '37-skills.js', '38-ai.js', '39-level.js', '39-save.js', '54-anim.js'].map(f => src('src/' + f)).join('\n');
const { Core, Play, Save, Anim, gsap } = vm.runInContext(game + '\n({ Core, Play, Save, Anim, gsap })', ctx);

const eq = (a, b, m) => assert.strictEqual(JSON.stringify(a), JSON.stringify(b), m);
const near = (a, b, e = 1e-9, m) => assert.ok(Math.abs(a - b) <= e, (m || '') + ` ${a} ≠ ${b}`);
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok', name); };
const place = (x, y) => ({ x: x * 2, y: (x + y) % 3 * .5, z: y * 2 });   // ô giả: độ cao đổi theo ô để có nảy khi đổi bậc
const chapter = (id, seed) => { const C = Object.assign(Save.newCampaign(DATA, { seed: seed || 5 }), { chapter: Save.chapters(DATA).findIndex(c => c.id === id) }); const r = Save.startChapter(C, DATA); return { S: r.S, seed: r.seed }; };

// ---------- GSAP ----------
t('GSAP 3.15.1 lõi nạp được; file vendor giữ dòng bản quyền', () => {
  assert.ok(Anim.ok); assert.strictEqual(gsap.version, '3.15.1');
  const head = src('vendor/gsap.min.js').slice(0, 300); assert.ok(head.startsWith('/*!') && /GreenSock/.test(head) && /standard-license/.test(head));
  assert.ok(fs.existsSync(path.join(ROOT, 'vendor/LICENSE-gsap.txt')));
});
t('logic không dùng GSAP: 34-core, 36-combat, 36-play, 37-skills, 38-ai, 39-level, 39-save không nhắc tới gsap', () => {
  for (const f of ['34-core.js', '36-combat.js', '36-play.js', '37-skills.js', '38-ai.js', '39-level.js', '39-save.js'])
    assert.ok(!/gsap\s*\.|\bgsap\(/i.test(src('src/' + f).replace(/\/\/.*$/gm, '')), f);
});

// ---------- Đi ----------
// Nội suy của bản trước (55-units + Play.animPos) để so tư thế.
function oldPose(P, u) {
  const a = Play.animPos(P, u); if (!a) return null;
  const p0 = place(a.from[0], a.from[1]), p1 = place(a.to[0], a.to[1]);
  return { x: p0.x + (p1.x - p0.x) * a.k, z: p0.z + (p1.z - p0.z) * a.k, y: p0.y + (p1.y - p0.y) * a.k + Math.sin(a.k * Math.PI) * (.12 + Math.abs(p1.y - p0.y) * .6), yaw: Math.atan2(a.dx, a.dy) };
}
function walkingP() {
  const { S, seed } = chapter('ch1'); const P = Play.create(S, DATA, seed); Play.update(P, 5);
  const u = S.units.find(o => o.tpl === 'tran'), R = Core.reachable(S, u, DATA);
  let best = null; for (const k of R.cost.keys()) { const x = k % R.w, y = (k / R.w) | 0; if (Core.canStopAt(R, x, y)) { const p = Core.pathTo(R, x, y); if (!best || p.length > best.length) best = p; } }
  Play.tap(P, u.x, u.y); const [x, y] = best[best.length - 1]; Play.tap(P, x, y); Play.tap(P, x, y);
  return { P, u, path: best };
}
t('Timeline đi: paused, dài đúng P.anim.dur; tư thế khớp nội suy cũ ở mọi khung (sai số ≤ 1e-5: GSAP làm tròn ~6 số lẻ)', () => {
  Anim.reset(); const { P, u, path } = walkingP(); assert.ok(path.length >= 4, 'đường đủ dài');
  Anim.sync(P, place); const tl = Anim.timelines().walk;
  assert.ok(tl.paused()); near(tl.duration(), P.anim.dur, 1e-9, 'độ dài');
  let frames = 0;
  while (P.anim) {
    const o = oldPose(P, u), w = Anim.walk(P, u);
    if (o) { near(w.x, o.x, 1e-5, 'x'); near(w.z, o.z, 1e-5, 'z'); near(w.y, o.y, 1e-5, 'y'); if (Play.animPos(P, u).k > 1e-6) near(w.yaw, o.yaw, 1e-6, 'yaw'); }
    Play.update(P, 1 / 60); Anim.sync(P, place); frames++;
  }
  assert.ok(frames > 20); assert.strictEqual(Anim.walk(P, u), null); assert.strictEqual(P.mode, 'menu');
});

// ---------- Trận ----------
// Dựng một trận: Trấn đứng kề lính Viện đầu tiên rồi đánh (giống công cụ chụp màn hình).
function fightP(seed, tpl = 'tran', mapCh = 'ch1') {
  const { S } = chapter(mapCh); const P = Play.create(S, DATA, seed); Play.update(P, 5);
  const u = S.units.find(o => o.tpl === tpl && o.hp > 0), f = S.units.filter(o => o.side === 'dich' && o.hp > 0)[0];
  const spot = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([a, b]) => [f.x + a, f.y + b]).find(([x, y]) => Core.inside(S, x, y) && !Core.unitAt(S, x, y) && Core.moveCost(S, x, y, u.moveType, DATA) != null);
  u.x = spot[0]; u.y = spot[1]; P.unit = u; P.mode = 'menu';
  assert.ok(Play.attack(P)); Play.aim(P, f); assert.ok(Play.confirm(P));
  return P;
}
// Từ nhật ký: HP hiển thị đã tụt xong của mỗi bên tại thời điểm t (chỉ so ở các mốc đã tụt xong / chưa tụt).
const { STRIKE_TIME: ST, IMPACT, DRAIN, POPUP } = Play.TIMING;
t('Timeline trận: paused, dài đúng P.battle.dur; đòn đang chạy, HP, số bay lên, rút lui, EXP khớp nhật ký Core.fight (nhiều seed)', () => {
  let seen = { miss: 0, hit: 0, double: 0, counter: 0, ko: 0 };
  for (let seed = 1; seed <= 40; seed++) {
    Anim.reset(); const P = fightP(seed), b = P.battle, st = b.res.strikes;
    Anim.sync(P, place); const tl = Anim.timelines().battle;
    assert.ok(tl.paused()); near(tl.duration(), b.dur, 1e-9, 'độ dài trận');
    st.forEach(s => { seen[s.hit ? 'hit' : 'miss']++; if (s.who === 'D') seen.counter++; }); if (st.length >= 3) seen.double++; if (b.res.outcome) seen.ko++;
    const dt = 1 / 60; let tt = 0;
    // Mốc chuyển (đầu đòn, lúc trúng, hết số bay, rút lui): sát mốc ±1e-6 thì bỏ qua vì GSAP làm tròn thời gian.
    const marks = []; st.forEach((s, j) => marks.push(j * ST, j * ST + IMPACT, j * ST + IMPACT + POPUP)); marks.push(st.length * ST);
    while (P.battle) {
      tt = P.battle.t; if (marks.some(m => Math.abs(m - tt) < 1e-6)) { Play.update(P, dt); Anim.sync(P, place); continue; }
      const v = Anim.battle(P), o = Play.battleView(P);
      assert.strictEqual(v.cur ? v.cur.i : -1, o.cur ? o.cur.i : -1, 'đòn đang chạy @' + tt.toFixed(3));
      if (o.cur) assert.strictEqual(v.cur.impact, o.cur.impact, 'mốc trúng');
      eq(v.pops.map(p => [p.uid, p.hit, p.damage]), o.pops.map(p => [p.uid, p.hit, p.damage]), 'số bay lên @' + tt.toFixed(3));
      v.pops.forEach((p, i) => near(p.age, o.pops[i].age, 1e-6, 'tuổi số bay'));
      assert.strictEqual(!!v.ko, !!o.ko, 'rút lui'); assert.strictEqual(!!v.exp, !!o.exp, 'EXP');
      const j = Math.floor(tt / ST), k = tt - j * ST;   // HP chỉ so lúc chưa tụt hoặc đã tụt xong (giữa chừng ease khác tuyến tính)
      if (j >= st.length || k < IMPACT - 1e-6 || k > IMPACT + DRAIN + 1e-6) eq(v.hp, o.hp, 'HP @' + tt.toFixed(3));
      Play.update(P, dt); Anim.sync(P, place);
    }
    assert.strictEqual(Anim.battle(P), null);
  }
  for (const k in seen) assert.ok(seen[k] > 0, 'có trường hợp ' + k + ' trong 40 seed: ' + JSON.stringify(seen));
});
t('trận: lao tới rồi lùi về; trúng thì giật lùi + chớp, trượt thì né; chí mạng chớp mạnh hơn', () => {
  let miss = false, hit = false;
  for (let seed = 1; seed <= 40 && !(miss && hit); seed++) {
    Anim.reset(); const P = fightP(seed), s0 = P.battle.res.strikes[0], A = s0.from, D = s0.to;
    const at = x => { P.battle.t = x; Anim.sync(P, place); return Anim.battle(P).U; };
    assert.strictEqual(at(0)[A].lunge, 0); assert.ok(at(IMPACT - .005)[A].lunge > .85); assert.ok(at(ST - .1)[A].lunge < .02, 'lùi về trước đòn sau');
    assert.ok(at(IMPACT * .5)[A].atk > 0 && at(IMPACT * .5)[D].atk === -1);
    const U = at(IMPACT + .05);
    if (s0.hit) { hit = true; assert.ok(U[D].flinch > .7 && U[D].flash > 0 && U[D].dodge === 0); if (s0.crit) assert.ok(U[D].flash > .7); }
    else { miss = true; assert.ok(U[D].dodge > .5 && U[D].flinch === 0); }
  }
  assert.ok(miss && hit);
});
t('tất định: cùng chuỗi dt → cùng ảnh chụp từng khung; tua một lần = tua nhiều bước nhỏ', () => {
  const run = dts => { Anim.reset(); const P = fightP(9), out = []; let i = 0; while (P.battle) { Play.update(P, dts[i++ % dts.length]); Anim.sync(P, place); const v = Anim.battle(P); if (v) out.push(JSON.stringify([v.cur && v.cur.i, v.hp, v.U, v.pops, v.ko])); } return out; };
  eq(run([1 / 60]), run([1 / 60])); eq(run([1 / 30, 1 / 60, 1 / 45]), run([1 / 30, 1 / 60, 1 / 45]));
  // Nhảy thẳng tới t so với đi từng bước 1/240 giây tới t: cùng giá trị.
  for (const T of [.1, .3, .55, 1.2, 2.05]) {
    Anim.reset(); const P1 = fightP(9); P1.battle.t = T; Anim.sync(P1, place); const a = JSON.stringify(Anim.battle(P1).U) + JSON.stringify(Anim.battle(P1).hp);
    Anim.reset(); const P2 = fightP(9); for (let x = 0; x < T - 1e-9; x += 1 / 240) { P2.battle.t = Math.min(T, x); Anim.sync(P2, place); } P2.battle.t = T; Anim.sync(P2, place);
    assert.strictEqual(JSON.stringify(Anim.battle(P2).U) + JSON.stringify(Anim.battle(P2).hp), a, 't=' + T);
  }
});
t('Timeline không chạy theo đồng hồ thật: ticker GSAP tick thêm cũng không đổi giá trị', () => {
  Anim.reset(); const P = fightP(3); P.battle.t = .4; Anim.sync(P, place); const a = JSON.stringify(Anim.battle(P));
  for (let i = 0; i < 30; i++) gsap.ticker.tick(); assert.strictEqual(JSON.stringify(Anim.battle(P)), a);
});

// ---------- Tua lượt địch ----------
// Quân ta do AI chơi (như test_save), địch/NPC qua Play.advance với tốc độ ff; dt cố định 1/60. Ghi nhật ký mọi trận + cuối mỗi lượt.
function sim(chId, seed, ff, turns) {
  const { S } = chapter(chId, seed), P = Play.create(S, DATA, seed); Play.setSpeed(P, ff); Anim.reset();
  // Ghi mọi hành động của quân máy ngay tại Core.aiAct (khi bỏ qua, một trận có thể bắt đầu và xong trong cùng một khung).
  const log = [], aiAct = Core.aiAct; let frames = 0, enemyFrames = 0;
  Core.aiAct = function (S2, u, a, d, o) { const r = aiAct.apply(this, arguments); if (S2.phase !== 'ta') log.push(['may', u.uid, u.x, u.y, a.type, r.ok, r.combat && r.combat.strikes, r.combat && r.combat.outcome]); return r; };
  const pump = () => { for (let g = 0; g < 2e5 && Play.busy(P) && !P.over; g++) {
    if (P.levelUp) Play.dismissLevel(P);
    if (P.S.phase !== 'ta') enemyFrames++;
    Play.advance(P, 1 / 60); Anim.sync(P, place); frames++;
    if (P.S.phase === 'ta' && P.mode === 'cho' && !P.banner && !P.battle && !P.levelUp && !P.anim) break; } };
  try {
  pump();
  for (let i = 0; i < turns && !P.over; i++) {
    for (const u of S.units.filter(o => o.side === 'ta')) {
      if (u.hp <= 0 || u.done || P.over) continue;
      const plan = Core.planTurn(S, u, DATA), [x, y] = plan.path[plan.path.length - 1]; u.x = x; u.y = y; u.done = true;
      if (plan.action) { const r = Core.aiAct(S, u, plan.action, DATA, { rng: P.rng, mode: S.mode }); log.push(['ta', u.uid, x, y, r.ok, r.combat && r.combat.strikes]); }
    }
    if (!Play.checkWin(P)) Play.endTurn(P);
    pump(); log.push(['luot', S.turn, S.units.map(u => [u.uid, u.x, u.y, u.hp, u.lv, u.exp, u.done])]);
  }
  } finally { Core.aiAct = aiAct; }
  return { log, rng: P.rng(), over: P.over && [P.over.win, P.over.type], frames, enemyFrames };
}
t('tua x1 / x2 / x4 / bỏ qua: cùng seed → cùng nhật ký trận, vị trí, HP, EXP, kết quả và trạng thái RNG (Ch.1–3)', () => {
  let fights = 0;   // Ch.1: địch AI rất thận trọng (GDD 12), thường không đánh → vẫn kiểm đi/băng chữ; Ch.2–3 có trận của quân máy
  for (const [ch, seed] of [['ch1', 3], ['ch2', 11], ['ch3', 7], ['ch3', 2]]) {
    const r1 = sim(ch, seed, 1, 8), r2 = sim(ch, seed, 2, 8), r4 = sim(ch, seed, 4, 8), r0 = sim(ch, seed, 0, 8);
    fights += r1.log.filter(e => e[0] === 'may' && e[6]).length;
    for (const r of [r2, r4, r0]) { eq(r.log, r1.log, ch); assert.strictEqual(r.rng, r1.rng, ch + ' RNG'); eq(r.over, r1.over); }
    assert.ok(r2.enemyFrames < r1.enemyFrames * .62 && r4.enemyFrames < r2.enemyFrames * .62, ch + ` x2/x4 nhanh hơn: ${r1.enemyFrames} ${r2.enemyFrames} ${r4.enemyFrames}`);
    assert.ok(r0.enemyFrames < r4.enemyFrames * .25, ch + ` bỏ qua gần như tức thì: ${r0.enemyFrames} khung`);
  }
  assert.ok(fights >= 3, 'có trận của quân máy: ' + fights);
});
t('tua chỉ áp cho lượt Địch/NPC: trận của quân ta vẫn x1; nút xoay vòng x1 → x2 → x4 → bỏ qua → x1', () => {
  const P = fightP(4); Play.setSpeed(P, 4); const d = P.battle.dur; let f = 0;
  while (P.battle) { Play.advance(P, 1 / 60); f++; } assert.ok(Math.abs(f - d * 60) <= 2, `${f} khung ~ ${d * 60}`);
  const Q = Play.create(chapter('ch1').S, DATA, 1), seq = [];
  for (let i = 0; i < 5; i++) { seq.push(Q.ff); Play.nextSpeed(Q); } eq(seq, [1, 2, 4, 0, 1]);
  const before = Q.ff; assert.ok(!Play.setSpeed(Q, 3)); assert.strictEqual(Q.ff, before, 'tốc độ lạ bị từ chối');
});
t('bỏ qua: bảng Lên cấp giữa lượt địch vẫn hiện và vẫn tự đóng theo giờ thật', () => {
  const P = fightP(4); P.levelUp = { list: [{ kind: 'rank', name: 'x' }], t: 0, dur: 1 }; P.battle = null; P.S.phase = 'dich'; P.mode = 'may'; Play.setSpeed(P, 0);
  Play.advance(P, .5); assert.ok(P.levelUp, 'chưa đóng sau .5s'); Play.advance(P, .6); assert.ok(!P.levelUp, 'đóng sau 1s');
});

console.log(n + ' test qua');
