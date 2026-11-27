// ===== Vân Đăng · Điều khiển lượt (chọn quân → ô đích → đi → Chờ/Hoàn tác; vòng lượt Ta → Địch → NPC) =====
// Thuần dữ liệu như 34-core: không dùng THREE/DOM, chạy được trong Node (tools/test_core.js).
// Phần vẽ chỉ đọc P (mode, unit, R, target, path, anim, banner) và P.ver để biết khi nào cần dựng lại lớp tô ô.
//
// P.mode (lượt ta):
//   'cho'   chưa chọn quân nào
//   'chon'  đã chọn quân ta, đang hiện vùng đi được (có thể kèm ô đích + đường đi)
//   'di'    quân đang đi theo đường (bỏ qua chạm)
//   'menu'  đã tới ô đích, chờ chọn hành động: Chờ / Hoàn tác (Đánh, Kỹ năng... thêm ở tuần 3)
// P.mode = 'may': lượt Địch / NPC đang tự chạy.
// S.phase: 'ta' | 'dich' | 'npc'. Hết lượt NPC thì sang lượt ta mới (S.turn + 1).
const Play = (() => {
  const STEP_TIME = .16;   // giây mỗi ô khi đi (nhịp hiển thị; logic chốt ngay khi ra lệnh)
  const BANNER_TIME = 1.1; // băng chữ đầu mỗi phe
  const GAP_TIME = .18;    // nghỉ giữa hai quân máy
  const ORDER = ['ta', 'dich', 'npc'], NAME = { ta: 'Phe ta', dich: 'Phe địch', npc: 'NPC' };

  function create(S, data) {
    const P = { S, data, mode: 'cho', unit: null, R: null, target: null, path: null, anim: null, undo: null, banner: null, queue: [], gap: 0, ver: 0 };
    P.banner = { text: `Lượt ${S.turn} · ${NAME.ta}`, side: 'ta', t: 0, dur: BANNER_TIME };
    return P;
  }

  // Quân có nhận lệnh được không: quân ta, còn sống, chưa đi, đang lượt ta.
  const ready = (P, u) => !!(u && u.side === 'ta' && u.hp > 0 && !u.done && P.S.phase === 'ta');
  const busy = P => !!(P.banner || P.anim || P.mode === 'may');

  function clearSel(P) { P.mode = 'cho'; P.unit = null; P.R = null; P.target = null; P.path = null; P.undo = null; P.ver++; }
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
  function tap(P, x, y) {
    if (busy(P) || P.mode === 'menu' || P.S.phase !== 'ta') return 'ban';
    const S = P.S, onMap = x !== null && x !== undefined && Core.inside(S, x, y), u = onMap ? Core.unitAt(S, x, y) : null;
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

  // Nước đi tạm cho quân máy (tới tuần 4 thay bằng AI chấm điểm):
  // tìm ô kề quân ta gần nhất theo chi phí đi thật, rồi đi xa nhất có thể dọc đường đó trong tầm Di chuyển.
  // Tất định: hòa thì lấy ô có chỉ số nhỏ hơn.
  function planMove(S, u, data) {
    const far = Core.reachable(S, u, data, { mov: 999 }), mov = u.stats.mov, foes = S.units.filter(o => o.side === 'ta' && o.hp > 0);
    let goal = -1, best = Infinity;
    for (const i of far.stops) {
      const x = i % S.w, y = (i / S.w) | 0;
      if (!foes.some(f => Math.abs(f.x - x) + Math.abs(f.y - y) === 1)) continue;
      const c = far.cost.get(i); if (c < best) { best = c; goal = i; }
    }
    if (goal < 0) return null;
    const path = Core.pathTo(far, goal % S.w, (goal / S.w) | 0);
    let end = 0; // ô xa nhất trong tầm mà dừng được
    for (let k = 0; k < path.length; k++) { const [x, y] = path[k]; if (far.cost.get(y * S.w + x) > mov) break; if (Core.canStopAt(far, x, y)) end = k; }
    return end > 0 ? path.slice(0, end + 1) : null;
  }

  function update(P, dt) {
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
    while (P.queue.length) {
      const id = P.queue.shift(), u = S.units.find(o => o.uid === id); if (!u || u.hp <= 0) continue;
      u.done = true; const path = planMove(S, u, P.data);
      if (path) { walk(P, u, path); P.ver++; return; }
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

  return { create, ready, busy, select, cancel, tap, wait, undo, endTurn, update, animPos, left, planMove, STEP_TIME };
})();
