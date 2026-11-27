// ===== Vân Đăng · Điều khiển lượt người chơi (chọn quân → chọn ô đích → đi) =====
// Thuần dữ liệu như 34-core: không dùng THREE/DOM, chạy được trong Node (tools/test_core.js).
// Phần vẽ chỉ đọc P (mode, unit, R, target, path, anim) và P.ver để biết khi nào cần dựng lại lớp tô ô.
//
// Trạng thái P.mode:
//   'cho'   chưa chọn quân nào
//   'chon'  đã chọn quân ta, đang hiện vùng đi được (có thể kèm ô đích + đường đi)
//   'di'    quân đang đi theo đường (bỏ qua mọi chạm cho tới khi xong)
const Play = (() => {
  const STEP_TIME = .16; // giây cho mỗi ô khi đi (chỉ là nhịp hiển thị; logic đã chốt ngay khi ra lệnh)

  function create(S, data) { return { S, data, mode: 'cho', unit: null, R: null, target: null, path: null, anim: null, ver: 0 }; }

  // Quân có nhận lệnh được không: quân ta, còn sống, chưa đi, đang lượt ta.
  const ready = (P, u) => !!(u && u.side === 'ta' && u.hp > 0 && !u.done && P.S.phase === 'ta');

  function select(P, u) { P.mode = 'chon'; P.unit = u; P.R = Core.reachable(P.S, u, P.data); P.target = null; P.path = null; P.ver++; }
  function cancel(P) { if (P.mode === 'di') return; P.mode = 'cho'; P.unit = null; P.R = null; P.target = null; P.path = null; P.ver++; }

  // Ra lệnh đi tới ô đích: chốt vị trí trong logic ngay, đánh dấu done, rồi chạy hoạt cảnh theo đường.
  function commit(P) {
    const u = P.unit, path = P.path, [x, y] = path[path.length - 1];
    u.x = x; u.y = y; u.done = true;
    P.mode = 'di'; P.anim = { u, path, t: 0, dur: Math.max(0, path.length - 1) * STEP_TIME };
    P.R = null; P.target = null; P.path = null; P.ver++;
  }

  // Xử lý một lần chạm vào ô (x,y); (x,y) = null nghĩa là chạm ra ngoài bàn cờ.
  // Trả về tên sự kiện để phần giao diện phản hồi:
  //   'chon' chọn quân · 'dich' đặt ô đích, hiện đường · 'di' ra lệnh đi
  //   'quaduoc' ô chỉ đi qua được, không dừng được · 'huy' hủy chọn · 'xem' chỉ xem ô · 'ban' đang bận (quân đang đi)
  function tap(P, x, y) {
    if (P.mode === 'di') return 'ban';
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

  // Chạy hoạt cảnh đi. Hết đường thì về trạng thái chờ.
  function update(P, dt) {
    const a = P.anim; if (!a) return;
    a.t += dt;
    if (a.t >= a.dur) { P.anim = null; P.mode = 'cho'; P.unit = null; P.ver++; }
  }

  // Vị trí đang hiển thị của quân u: {x, y} theo ô (số thực) + hướng bước (dx, dy) + k (0..1 trong ô hiện tại).
  // Trả về null nếu quân không đang đi.
  function animPos(P, u) {
    const a = P.anim; if (!a || a.u !== u || a.path.length < 2) return null;
    const f = Math.min(a.t / STEP_TIME, a.path.length - 1 - 1e-6), i = Math.floor(f), k = f - i;
    const [x0, y0] = a.path[i], [x1, y1] = a.path[i + 1];
    return { x: x0 + (x1 - x0) * k, y: y0 + (y1 - y0) * k, dx: x1 - x0, dy: y1 - y0, k, from: [x0, y0], to: [x1, y1] };
  }

  const left = P => P.S.units.filter(u => ready(P, u)).length;

  return { create, ready, select, cancel, tap, update, animPos, left, STEP_TIME };
})();
