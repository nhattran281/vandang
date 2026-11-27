// ===== Vân Đăng · HUD tạm =====
// Chữ vẽ lên canvas #hud bằng font hệ thống (font pixel 70-pixelfont chưa có dấu tiếng Việt).
// Bản tuần 1: tên map, thông tin ô đang chọn. UI chiến thuật thật làm từ tuần 2–3.
const HUD = {
  ctx: null,
  init() { this.ctx = document.getElementById('hud').getContext('2d'); },
  panel(c, x, y, w, h) { c.fillStyle = 'rgba(8,10,16,.72)'; c.fillRect(x, y, w, h); c.strokeStyle = 'rgba(232,176,74,.55)'; c.lineWidth = Math.max(1, R.dpr); c.strokeRect(x + .5, y + .5, w - 1, h - 1); },
  draw() {
    const c = this.ctx; if (!c) return;
    const d = R.dpr, W = R.dw, H = R.dh, [sl, st, sr, sb] = R.safe || [0, 0, 0, 0], pad = 12 * d, fs = 15 * d;
    c.clearRect(0, 0, W, H);
    c.textBaseline = 'top';
    const S = G.map; if (!S) return;
    c.font = `600 ${fs * 1.15}px system-ui, sans-serif`; c.fillStyle = '#e8b04a';
    c.fillText('Vân Đăng · ' + S.name, sl + pad, st + pad);
    c.font = `400 ${fs * .8}px system-ui, sans-serif`; c.fillStyle = 'rgba(200,190,170,.8)';
    c.fillText(this.hint(), sl + pad, st + pad + fs * 1.5);
    if (HASH.fps && R.fpsText) c.fillText(R.fpsText, sl + pad, st + pad + fs * 2.7);
    const sel = G.sel; if (!sel) return;
    const lines = this.describe(S, sel.x, sel.y);
    const lh = fs * 1.35, bw = Math.min(W - sl - sr - pad * 2, 420 * d), bh = lines.length * lh + pad * 1.2, bx = sl + pad, by = H - sb - pad - bh;
    this.panel(c, bx, by, bw, bh);
    lines.forEach((l, i) => { c.font = `${i === 0 ? 600 : 400} ${fs}px system-ui, sans-serif`; c.fillStyle = i === 0 ? '#ffd27a' : '#e6dccb'; c.fillText(l, bx + pad * .8, by + pad * .6 + i * lh); });
  },
  // Dòng gợi ý theo trạng thái chọn/đi (Play)
  hint() {
    const P = G.play, n = Play.left(P);
    if (P.mode === 'di') return 'Đang đi…';
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
