// ===== Vân Đăng · HUD tạm =====
// Chữ vẽ lên canvas #hud bằng font hệ thống (font pixel 70-pixelfont chưa có dấu tiếng Việt).
// Bản tuần 1: tên map, thông tin ô đang chọn. UI chiến thuật thật làm từ tuần 2–3.
const HUD = {
  ctx: null, btns: [],
  init() { this.ctx = document.getElementById('hud').getContext('2d'); },
  panel(c, x, y, w, h) { c.fillStyle = 'rgba(8,10,16,.72)'; c.fillRect(x, y, w, h); c.strokeStyle = 'rgba(232,176,74,.55)'; c.lineWidth = Math.max(1, R.dpr); c.strokeRect(x + .5, y + .5, w - 1, h - 1); },
  draw() {
    const c = this.ctx; if (!c) return;
    const d = R.dpr, W = R.dw, H = R.dh, [sl, st, sr, sb] = R.safe || [0, 0, 0, 0], pad = 12 * d, fs = 15 * d;
    c.clearRect(0, 0, W, H);
    c.textBaseline = 'top';
    const S = G.map; if (!S) return;
    this.btns = [];
    c.font = `600 ${fs * 1.15}px system-ui, sans-serif`; c.fillStyle = '#e8b04a';
    c.fillText('Vân Đăng · ' + S.name, sl + pad, st + pad);
    c.font = `400 ${fs * .8}px system-ui, sans-serif`; c.fillStyle = 'rgba(200,190,170,.8)';
    c.fillText(this.hint(), sl + pad, st + pad + fs * 1.5);
    if (HASH.fps && R.fpsText) c.fillText(R.fpsText, sl + pad, st + pad + fs * 2.7);
    const P = G.play;
    // Nút Hết lượt (góc trên phải): khi đang lượt ta và không ở giữa một nước đi
    if (S.phase === 'ta' && !Play.busy(P) && P.mode !== 'menu') this.button(c, 'Hết lượt', 'hetluot', W - sr - pad - 104 * d, st + pad, 104 * d, 44 * d, false);
    let top = H - sb - pad; // mép trên của khối dưới cùng
    const sel = G.sel;
    if (sel) {
      const lines = this.describe(S, sel.x, sel.y);
      const lh = fs * 1.35, bw = Math.min(W - sl - sr - pad * 2, 420 * d), bh = lines.length * lh + pad * 1.2, bx = sl + pad, by = H - sb - pad - bh;
      this.panel(c, bx, by, bw, bh); top = by;
      lines.forEach((l, i) => { c.font = `${i === 0 ? 600 : 400} ${fs}px system-ui, sans-serif`; c.fillStyle = i === 0 ? '#ffd27a' : '#e6dccb'; c.fillText(l, bx + pad * .8, by + pad * .6 + i * lh); });
    }
    // Menu hành động sau khi đi (tuần 3 thêm Đánh / Kỹ năng / Vật phẩm / Mở rương...)
    if (P.mode === 'menu' && !P.anim) {
      const bw = 118 * d, bh = 50 * d, y = top - pad - bh, x2 = W - sr - pad - bw, x1 = x2 - pad - bw;
      this.button(c, 'Hoàn tác', 'hoantac', x1, y, bw, bh, false);
      this.button(c, 'Chờ', 'cho', x2, y, bw, bh, true);
    }
    if (P.banner) this.banner(c, P.banner, W, H, d);
  },
  button(c, label, act, x, y, w, h, main) {
    const d = R.dpr;
    c.fillStyle = main ? 'rgba(232,176,74,.92)' : 'rgba(8,10,16,.8)'; c.fillRect(x, y, w, h);
    c.strokeStyle = 'rgba(232,176,74,.85)'; c.lineWidth = Math.max(1, d * 1.2); c.strokeRect(x + .5, y + .5, w - 1, h - 1);
    c.font = `600 ${16 * d}px system-ui, sans-serif`; c.fillStyle = main ? '#1a1208' : '#ffd27a'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(label, x + w / 2, y + h / 2 + d); c.textAlign = 'left'; c.textBaseline = 'top';
    this.btns.push({ x, y, w, h, act });
  },
  // Băng chữ đầu mỗi phe: hiện dần, đứng, tắt dần
  banner(c, b, W, H, d) {
    const k = b.t / b.dur, a = Math.min(1, k * 6, (1 - k) * 5); if (a <= 0) return;
    const col = { ta: '90,150,255', dich: '220,80,60', npc: '120,190,110' }[b.side], h = 64 * d, y = H * .38;
    c.globalAlpha = a;
    c.fillStyle = 'rgba(8,10,16,.78)'; c.fillRect(0, y, W, h);
    c.fillStyle = `rgba(${col},.9)`; c.fillRect(0, y, W, 2 * d); c.fillRect(0, y + h - 2 * d, W, 2 * d);
    c.font = `700 ${24 * d}px system-ui, sans-serif`; c.fillStyle = '#f2e6cc'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(b.text, W / 2, y + h / 2); c.textAlign = 'left'; c.textBaseline = 'top'; c.globalAlpha = 1;
  },
  // Chạm vào nút nào (toạ độ CSS px) → tên hành động hoặc null
  hit(cssX, cssY) {
    const k = R.dw / R.cssW, x = cssX * k, y = cssY * k;
    const b = this.btns.find(b => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h); return b ? b.act : null;
  },
  // Dòng gợi ý theo trạng thái chọn/đi (Play)
  hint() {
    const P = G.play, n = Play.left(P);
    if (P.banner) return '';
    if (P.mode === 'may') return (P.S.phase === 'npc' ? 'NPC' : 'Phe địch') + ' đang đi…';
    if (P.mode === 'di') return 'Đang đi…';
    if (P.mode === 'menu') return 'Chọn: Chờ (kết thúc) hoặc Hoàn tác (về ô cũ)';
    if (P.mode === 'chon') return P.target ? 'Chạm lần nữa để đi · chạm ngoài vùng để hủy' : G.last === 'quaduoc' ? 'Ô tím: chỉ đi qua, không dừng được' : 'Chạm ô xanh để xem đường · ngoài vùng để hủy';
    return n ? `Lượt ${P.S.turn} · còn ${n} quân chưa đi · chạm quân ta để chọn` : `Lượt ${P.S.turn} · quân ta đã đi hết`;
  },
  describe(S, x, y) {
    const T = Core.terrainOf(S, x, y, DATA), t = Core.tile(S, x, y), out = [];
    const cost = k => T.cost[k] === null ? '✗' : T.cost[k];
    const sg = v => (v > 0 ? '+' : '') + v;
    out.push(`${T.name}  (${x},${y})  · cao ${t.h}`);
    out.push(`Đi: Bộ ${cost('bo')} · Nhẹ ${cost('nhe')} · Bay ${cost('bay')} · Thủy ${cost('thuy')}`);
    out.push(`Né ${sg(T.avo)} · Thủ ${sg(T.def)}` + (T.heal ? ` · hồi ${T.heal}% HP` : ''));
    const u = Core.unitAt(S, x, y);
    if (u) { const s = u.stats, side = { ta: 'Ta', dich: 'Địch', npc: 'NPC' }[u.side]; out.push(`${u.name}${u.title ? ' · ' + u.title : ''} [${side}] Lv${u.lv}  HP ${u.hp}/${s.hp}` + (u.done ? ' · đã đi' : '')); out.push(`Sức ${s.str} Phép ${s.mag} Kỹ ${s.skl} Tốc ${s.spd} May ${s.lck} Thủ ${s.def} Kháng ${s.res} Di ${s.mov}`); }
    const k = Core.chestAt(S, x, y); if (k) out.push('Rương: ' + k.item);
    return out;
  },
};
