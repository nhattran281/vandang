// ===== Vân Đăng · Điều khiển lượt (chọn quân → ô đích → đi → Chờ/Hoàn tác; vòng lượt Ta → Địch → NPC) =====
// Thuần dữ liệu như 34-core: không dùng THREE/DOM, chạy được trong Node (tools/test_core.js).
// Phần vẽ chỉ đọc P (mode, unit, R, target, path, anim, banner) và P.ver để biết khi nào cần dựng lại lớp tô ô.
//
// P.mode (lượt ta):
//   'cho'   chưa chọn quân nào
//   'chon'  đã chọn quân ta, đang hiện vùng đi được (có thể kèm ô đích + đường đi)
//   'di'    quân đang đi theo đường (bỏ qua chạm)
//   'menu'  đã tới ô đích, chờ chọn hành động: Đánh (nếu có địch trong tầm) / Chờ / Hoàn tác
//   'muctieu' đang chọn mục tiêu; P.targets = địch trong tầm của ít nhất một vũ khí dùng được trong túi,
//            P.foe + P.fc = mục tiêu đang xem và bảng dự báo (Core.forecast); P.wpns = vũ khí với tới P.foe, P.wpn = món đang xem
//            Đổi vũ khí tự do (GDD 2.5): xác nhận đánh thì món đã chọn thành món đang cầm (lên đầu túi) và quyết định phản đòn lượt địch.
//   'danh'  đang phát lại trận (P.battle: nhật ký Core.fight + đồng hồ phát lại; phần vẽ đọc qua battleView)
// P.mode = 'may': lượt Địch / NPC đang tự chạy (Core.planTurn, 38-ai.js). Trận của quân máy phát lại qua P.battle như quân ta;
//   P.act = hành động chờ chạy sau khi đi xong; P.lastPlan = kế hoạch gần nhất, P.lastAct = kết quả Core.aiAct gần nhất (để soi).
//   Hành vi (38-ai.js): quân 'cho_tam' được đánh thức thì đặt u.awake; đạo tặc thoát thì u.escaped (hp = 0, biến khỏi bàn cờ).
// P.over: trận đã kết thúc — mọi thao tác bị khóa. { win:false } Đăng/Linh ngã → thua; { win:true } hạ hết địch → thắng (tuần 5, tạm; điều kiện thắng theo chương thêm sau).
// P.levelUp (tuần 5): { list: growth.levels + growth.ranks, t } — bảng "Lên cấp" sau trận; chạm (Play.tap / dismissLevel) hoặc hết LEVEL_TIME thì đóng.
//   Trong lúc hiện bảng, mọi thứ khác tạm dừng (busy). P.lastGrowth = growth log gần nhất (39-level).
// S.phase: 'ta' | 'dich' | 'npc'. Hết lượt NPC thì sang lượt ta mới (S.turn + 1).
const Play = (() => {
  const STEP_TIME = .16;   // giây mỗi ô khi đi (nhịp hiển thị; logic chốt ngay khi ra lệnh)
  const BANNER_TIME = 1.1; // băng chữ đầu mỗi phe
  const GAP_TIME = .18;    // nghỉ giữa hai quân máy
  const LEVEL_TIME = 6;    // bảng Lên cấp tự đóng sau (giây)
  const ORDER = ['ta', 'dich', 'npc'], NAME = { ta: 'Phe ta', dich: 'Phe địch', npc: 'NPC' };
  // Nhịp phát lại trận (giây). Mỗi đòn: vung → trúng ở IMPACT → HP tụt trong DRAIN → nghỉ tới hết STRIKE.
  const STRIKE_TIME = .9, IMPACT = .28, DRAIN = .35, POPUP = .85, KO_TIME = .8, END_TIME = .45;
  const FOES = { ta: ['dich'], dich: ['ta', 'npc'], npc: ['dich'] };   // ai đánh được ai

  function create(S, data, seed) {
    const P = { S, data, mode: 'cho', unit: null, R: null, target: null, path: null, anim: null, undo: null, banner: null, queue: [], gap: 0, ver: 0,
      rng: Core.rng(seed != null ? seed : 1), targets: [], foe: null, fc: null, wpns: [], wpn: null, battle: null, lastFight: null, over: null, act: null, lastPlan: null, lastAct: null, levelUp: null, lastGrowth: null };
    P.banner = { text: `Lượt ${S.turn} · ${NAME.ta}`, side: 'ta', t: 0, dur: BANNER_TIME };
    return P;
  }

  // Quân có nhận lệnh được không: quân ta, còn sống, chưa đi, đang lượt ta.
  const ready = (P, u) => !!(u && u.side === 'ta' && u.hp > 0 && !u.done && P.S.phase === 'ta');
  const busy = P => !!(P.over || P.levelUp || P.banner || P.anim || P.battle || P.mode === 'may');

  function clearSel(P) { P.mode = 'cho'; P.unit = null; P.R = null; P.target = null; P.path = null; P.undo = null; P.targets = []; P.foe = null; P.fc = null; P.wpns = []; P.wpn = null; P.ver++; }
  function select(P, u) { P.mode = 'chon'; P.unit = u; P.R = Core.reachable(P.S, u, P.data); P.target = null; P.path = null; P.ver++; }
  function cancel(P) { if (P.mode === 'chon') clearSel(P); }

  // Bắt đầu hoạt cảnh đi; vị trí trong logic chốt ngay.
  function walk(P, u, path) {
    const [x, y] = path[path.length - 1]; u.x = x; u.y = y;
    P.anim = { u, path, t: 0, dur: Math.max(0, path.length - 1) * STEP_TIME };
  }

  // Ra lệnh đi tới ô đích; nhớ ô cũ để Hoàn tác. Đi xong sang 'menu'.
  function commit(P) {
    const u = P.unit; P.undo = { u, x: u.x, y: u.y };
    walk(P, u, P.path); P.mode = 'di'; P.R = null; P.target = null; P.path = null; P.ver++;
  }

  // Xử lý một lần chạm vào ô (x,y); (x,y) = null nghĩa là chạm ra ngoài bàn cờ.
  // Trả về: 'chon' · 'dich' (đặt ô đích) · 'di' (ra lệnh đi) · 'quaduoc' (ô chỉ đi qua) · 'huy' · 'xem' · 'ban' (đang bận / đang ở menu)
  //   Khi chọn mục tiêu: 'dubao' (hiện bảng dự báo) · 'danh' (chạm lại mục tiêu đang xem = xác nhận) · 'bodubao' · 'menu' (quay lại menu)
  function tap(P, x, y) {
    if (P.levelUp) { dismissLevel(P); return 'lencap'; }
    if (busy(P) || P.mode === 'menu' || P.S.phase !== 'ta') return 'ban';
    const S = P.S, onMap = x !== null && x !== undefined && Core.inside(S, x, y), u = onMap ? Core.unitAt(S, x, y) : null;
    if (P.mode === 'muctieu') {
      if (u && P.targets.includes(u)) {
        if (P.foe === u) { confirm(P); return 'danh'; }
        aim(P, u); return 'dubao';
      }
      if (P.foe) { P.foe = null; P.fc = null; P.ver++; return 'bodubao'; }
      back(P); return 'menu';
    }
    if (P.mode === 'chon') {
      if (!onMap) { cancel(P); return 'huy'; }
      if (u && u !== P.unit && ready(P, u)) { select(P, u); return 'chon'; }
      if (Core.canStopAt(P.R, x, y)) {
        if (P.target && P.target.x === x && P.target.y === y) { commit(P); return 'di'; }
        P.target = { x, y }; P.path = Core.pathTo(P.R, x, y); P.ver++; return 'dich';
      }
      if (P.R.cost.has(y * P.R.w + x)) { P.target = null; P.path = null; P.ver++; return 'quaduoc'; }
      cancel(P); return 'huy';
    }
    if (ready(P, u)) { select(P, u); return 'chon'; }
    return 'xem';
  }

  // ----- Menu sau khi đi -----
  // Chờ: kết thúc hành động của quân này. Hết quân ta chưa đi thì tự kết thúc lượt.
  function wait(P) {
    if (P.mode !== 'menu') return false;
    P.unit.done = true; clearSel(P);
    if (!left(P)) endTurn(P);
    return true;
  }
  // Hoàn tác: về ô cũ, chọn lại quân đó (như lúc vừa chạm vào nó).
  function undo(P) {
    if (P.mode !== 'menu' || !P.undo) return false;
    const { u, x, y } = P.undo; u.x = x; u.y = y; P.undo = null; select(P, u);
    return true;
  }

  // ----- Đánh (tuần 3) -----
  const dist = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  const hostile = (a, b) => (FOES[a.side] || []).includes(b.side);
  // Vũ khí dùng được trong túi (đủ hạng, chưa gãy). Đơn vị không có túi thì chỉ có món đang cầm.
  const usableWeapons = u => (u.inventory && u.inventory.length ? u.inventory : u.weapon ? [u.weapon] : []).filter(w => Core.usable(u, w));
  // Tạm cầm w để gọi hàm của Core (Core đọc u.weapon), rồi trả lại món cũ.
  function withWeapon(u, w, fn) { const o = u.weapon; u.weapon = w; try { return fn(); } finally { u.weapon = o; } }
  // Các vũ khí của u với tới o từ ô đang đứng (Core.inRange đã loại vũ khí chưa đủ hạng / đã gãy).
  // Cung/nỏ đứng cao hơn mục tiêu +1 tầm (GDD 3.2, Core.rangeBonus).
  const reachOf = (S, u, o) => usableWeapons(u).filter(w => withWeapon(u, w, () => Core.inRange(u, dist(u, o), Core.rangeBonus(u, Core.heightAt(S, u.x, u.y), Core.heightAt(S, o.x, o.y)))));
  // Địch còn sống mà ít nhất một vũ khí trong túi của u với tới.
  function targetsOf(S, u) { return S.units.filter(o => o.hp > 0 && hostile(u, o) && reachOf(S, u, o).length); }
  const targets = P => P.unit ? targetsOf(P.S, P.unit) : [];
  // Ngữ cảnh cho Core.forecast / Core.fight: khoảng cách, ô địa hình hai bên, RNG có seed của trận, chế độ tử vong.
  function ctxOf(P, a, d) {
    const S = P.S, data = P.data;
    return { distance: dist(a, d), atkTerrain: Core.terrainOf(S, a.x, a.y, data), defTerrain: Core.terrainOf(S, d.x, d.y, data), atkH: Core.heightAt(S, a.x, a.y), defH: Core.heightAt(S, d.x, d.y), rng: P.rng, mode: S.mode || 'casual' };
  }
  // Menu → Đánh: sang chọn mục tiêu (nếu có ai trong tầm).
  function attack(P) {
    if (P.mode !== 'menu') return false;
    const list = targets(P); if (!list.length) return false;
    P.mode = 'muctieu'; P.targets = list; P.foe = null; P.fc = null; P.ver++;
    return true;
  }
  // Xem dự báo với mục tiêu d. Giữ món đang xem nếu còn với tới; không thì món đang cầm; không thì món đầu tiên với tới.
  // forecast không đổi trạng thái (vũ khí chỉ cầm tạm trong lúc tính).
  function aim(P, d) {
    const u = P.unit, list = reachOf(P.S, u, d);
    P.foe = d; P.wpns = list;
    P.wpn = list.includes(P.wpn) ? P.wpn : list.includes(u.weapon) ? u.weapon : list[0];
    refresh(P);
  }
  function refresh(P) { const u = P.unit, d = P.foe; P.fc = withWeapon(u, P.wpn, () => Core.forecast(u, d, ctxOf(P, u, d))); P.ver++; }
  // ◀ ▶ đổi vũ khí trong bảng dự báo (dir = -1 / +1). Chỉ đổi giữa các món với tới mục tiêu.
  function cycleWeapon(P, dir) {
    if (P.mode !== 'muctieu' || !P.foe || P.wpns.length < 2) return false;
    const n = P.wpns.length; P.wpn = P.wpns[(P.wpns.indexOf(P.wpn) + (dir < 0 ? -1 : 1) + n) % n]; refresh(P);
    return true;
  }
  // Trang bị w: thành món đang cầm và lên đầu túi (để equipFirst sau này vẫn ra đúng món).
  function equip(u, w) { u.weapon = w; if (u.inventory) { const i = u.inventory.indexOf(w); if (i > 0) { u.inventory.splice(i, 1); u.inventory.unshift(w); } } }
  // Quay lại menu hành động (vẫn ở ô vừa đi tới, vẫn Hoàn tác được).
  function back(P) {
    if (P.mode !== 'muctieu') return false;
    P.mode = 'menu'; P.targets = []; P.foe = null; P.fc = null; P.wpns = []; P.wpn = null; P.ver++;
    return true;
  }
  // Xác nhận: chạy Core.fight (ghi HP ngay), rồi phát lại nhật ký. Sau khi đánh thì không Hoàn tác được nữa.
  function confirm(P) {
    if (P.mode !== 'muctieu' || !P.foe) return false;
    const a = P.unit, d = P.foe, hp0 = { [a.uid]: a.hp, [d.uid]: d.hp };
    if (P.wpn) equip(a, P.wpn);
    const res = Core.fight(a, d, ctxOf(P, a, d));
    const growth = Core.awardCombat(a, d, res, P.data, P.rng);   // EXP / lên cấp / hạng vũ khí (39-level), hiện sau khi phát lại
    a.done = true; P.undo = null;
    P.battle = { a, d, res, hp0, growth, t: 0, dur: res.strikes.length * STRIKE_TIME + (res.outcome ? KO_TIME : 0) + END_TIME };
    P.mode = 'danh'; P.targets = []; P.ver++;
    return true;
  }
  function endBattle(P) {
    const b = P.battle; P.battle = null; P.lastFight = b.res; clearSel(P);
    showGrowth(P, b.growth);
    const o = b.res.outcome;
    if (o && o.gameOver) { P.over = { win: false, text: 'Thua trận', side: 'dich', reason: (o.uid === b.a.uid ? b.a : b.d).name + ' đã ngã' }; P.ver++; return; }
    if (checkWin(P)) return;
    if (P.S.phase !== 'ta') { P.mode = 'may'; P.gap = GAP_TIME; return; }   // trận của quân máy: đi tiếp quân sau
    if (!left(P)) endTurn(P);
  }
  // Ảnh chụp phát lại tại thời điểm hiện tại, cho phần vẽ: HP đang hiện, đòn đang chạy, số bay lên, quân đang rút lui.
  function battleView(P) {
    const b = P.battle; if (!b) return null;
    const hp = Object.assign({}, b.hp0), pops = [], st = b.res.strikes;
    let cur = null;
    st.forEach((s, j) => {
      const t0 = j * STRIKE_TIME, k = b.t - t0;
      if (k >= 0 && k < STRIKE_TIME) cur = { i: j, s, k, atk: Math.min(1, k / (IMPACT / .45)), impact: k >= IMPACT };
      if (k >= IMPACT) {
        const prev = j ? hpAfter(st, j - 1, s.to, b.hp0) : b.hp0[s.to];
        hp[s.to] = Math.round(prev + (s.targetHp - prev) * Math.min(1, (k - IMPACT) / DRAIN));
        if (k < IMPACT + POPUP) pops.push({ uid: s.to, hit: s.hit, crit: s.crit, damage: s.damage, broke: s.broke, from: s.from, age: (k - IMPACT) / POPUP });
      }
    });
    const tKO = st.length * STRIKE_TIME, o = b.res.outcome;
    const ko = o && b.t >= tKO ? { uid: o.uid, result: o.result, k: Math.min(1, (b.t - tKO) / KO_TIME) } : null;
    return { a: b.a, d: b.d, fc: b.res.forecast, hp, cur, pops, ko, t: b.t, dur: b.dur, exp: !cur && b.t >= tKO && b.growth ? b.growth.exp : null };
  }
  // HP của uid sau đòn thứ j (đọc ngược nhật ký).
  function hpAfter(st, j, uid, hp0) { for (let i = j; i >= 0; i--) if (st[i].to === uid) return st[i].targetHp; return hp0[uid]; }

  // ----- Vòng lượt -----
  function endTurn(P) {
    if (P.S.phase !== 'ta' || busy(P) || P.mode === 'menu') return false;
    clearSel(P); startPhase(P, 'dich'); return true;
  }
  function startPhase(P, side) {
    const S = P.S;
    if (side === 'ta') { S.turn++; for (const u of S.units) u.done = false; }
    else for (const u of S.units) if (u.side === side) u.done = false;
    S.phase = side; P.ver++;
    const units = S.units.filter(u => u.side === side && u.hp > 0);
    if (side !== 'ta' && !units.length) return startPhase(P, ORDER[(ORDER.indexOf(side) + 1) % 3]); // phe trống: bỏ qua
    P.banner = { text: side === 'ta' ? `Lượt ${S.turn} · ${NAME.ta}` : NAME[side], side, t: 0, dur: BANNER_TIME };
    P.mode = side === 'ta' ? 'cho' : 'may'; P.queue = side === 'ta' ? [] : units.map(u => u.uid); P.gap = 0;
  }

  // ----- Quân máy (tuần 4): Core.planTurn (38-ai.js) chọn ô đứng + hành động; đi xong mới đánh. -----
  // Thực hiện hành động đã lên kế hoạch cho quân máy u (Core.aiAct: đánh / kỹ năng / mở rương / thoát).
  // Trả về true nếu có trận để phát lại; hành động không có trận (hồi máu, mở rương, thoát) chạy xong ngay.
  function act(P, u, a) {
    const S = P.S, tg = a.target != null ? S.units.find(o => o.uid === a.target) : null;
    const hp0 = tg ? { [u.uid]: u.hp, [tg.uid]: tg.hp } : null;
    const r = Core.aiAct(S, u, a, P.data, { rng: P.rng, mode: S.mode || 'casual' });
    P.lastAct = r; P.ver++;
    if (!r.ok || !r.combat || !r.combat.strikes.length) { if (r.ok) showGrowth(P, r.growth); return false; }
    const res = r.combat;
    P.battle = { a: u, d: tg, res, hp0, growth: r.growth, t: 0, dur: res.strikes.length * STRIKE_TIME + (res.outcome ? KO_TIME : 0) + END_TIME };
    return true;
  }

  // ----- Lên cấp (tuần 5) -----
  // Ghi growth log gần nhất; có lên cấp / tăng hạng vũ khí thì mở bảng Lên cấp.
  function showGrowth(P, g) {
    if (!g) return; P.lastGrowth = g;
    const list = g.levels.map(l => Object.assign({ kind: 'lv' }, l)).concat(g.ranks.map(r => Object.assign({ kind: 'rank' }, r)));
    if (list.length) { P.levelUp = { list, t: 0, dur: LEVEL_TIME }; P.ver++; }
  }
  function dismissLevel(P) { if (!P.levelUp) return false; P.levelUp = null; P.ver++; return true; }

  // ----- Thắng trận (tuần 5, tạm) -----
  // Điều kiện thắng do chương bật qua S.win (Save.startChapter); map thử không có S.win thì không bao giờ thắng (như trước).
  // 'rout' = không còn địch trên bàn cờ (đã ngã hoặc đã thoát). Các điều kiện khác (chạy tới ô, hạ boss, thắp tháp) thêm sau.
  const won = S => S.win === 'rout' && !S.units.some(u => u.side === 'dich' && u.hp > 0);
  function checkWin(P) {
    if (P.over || !won(P.S)) return false;
    clearSel(P); P.mode = 'cho'; P.queue = []; P.act = null; P.banner = null;
    P.over = { win: true, text: 'Thắng trận', side: 'ta', reason: 'Đã hạ hết quân địch' }; P.ver++;
    return true;
  }
  // Lưu tạm được không (GDD 5.4): lượt ta, không có gì đang chạy, chưa chọn quân hoặc mới chọn (chưa đi).
  const canSuspend = P => !P.over && P.S.phase === 'ta' && !busy(P) && (P.mode === 'cho' || P.mode === 'chon');

  function update(P, dt) {
    if (P.over) return;
    if (P.levelUp) { P.levelUp.t += dt; if (P.levelUp.t >= P.levelUp.dur) dismissLevel(P); return; }
    if (P.battle) { P.battle.t += dt; if (P.battle.t >= P.battle.dur) endBattle(P); return; }
    if (!P.anim && checkWin(P)) return;
    if (P.banner) { P.banner.t += dt; if (P.banner.t >= P.banner.dur) { P.banner = null; P.ver++; } return; }
    const a = P.anim;
    if (a) {
      a.t += dt; if (a.t < a.dur) return;
      P.anim = null; P.ver++;
      if (P.S.phase === 'ta') P.mode = 'menu'; else P.gap = GAP_TIME;
      return;
    }
    if (P.mode !== 'may') return;
    if (P.gap > 0) { P.gap -= dt; return; }
    const S = P.S;
    if (P.act) { const { u, a } = P.act; P.act = null; if (act(P, u, a)) return; }   // đi xong → đánh
    while (P.queue.length) {
      const id = P.queue.shift(), u = S.units.find(o => o.uid === id); if (!u || u.hp <= 0) continue;
      u.done = true; const plan = Core.planTurn(S, u, P.data); P.lastPlan = plan; if (plan.wake) u.awake = true;
      if (plan.path.length > 1) { P.act = plan.action ? { u, a: plan.action } : null; walk(P, u, plan.path); P.ver++; return; }
      if (plan.action && act(P, u, plan.action)) return;
    }
    startPhase(P, ORDER[(ORDER.indexOf(S.phase) + 1) % 3]);
  }

  // Vị trí đang hiển thị của quân u khi đi: nội suy giữa hai ô. null nếu quân không đang đi.
  function animPos(P, u) {
    const a = P.anim; if (!a || a.u !== u || a.path.length < 2) return null;
    const f = Math.min(a.t / STEP_TIME, a.path.length - 1 - 1e-6), i = Math.floor(f), k = f - i;
    const [x0, y0] = a.path[i], [x1, y1] = a.path[i + 1];
    return { x: x0 + (x1 - x0) * k, y: y0 + (y1 - y0) * k, dx: x1 - x0, dy: y1 - y0, k, from: [x0, y0], to: [x1, y1] };
  }

  const left = P => P.S.units.filter(u => ready(P, u)).length;

  return { create, ready, busy, canSuspend, won, checkWin, dismissLevel, LEVEL_TIME, select, cancel, tap, wait, undo, endTurn, update, animPos, left, targets, targetsOf, usableWeapons, attack, aim, cycleWeapon, back, confirm, battleView, STEP_TIME, STRIKE_TIME, IMPACT };
})();
