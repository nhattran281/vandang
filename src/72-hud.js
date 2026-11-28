// ===== Vân Đăng · HUD tạm =====
// Chữ vẽ lên canvas #hud bằng font hệ thống (font pixel 70-pixelfont chưa có dấu tiếng Việt).
// Tên map, gợi ý, thông tin ô, nút Hết lượt / menu hành động (tuần 2).
// Tuần 3: nút Đánh, bảng dự báo dọc 2 cột (đọc P.fc = Core.forecast), bảng phát lại trận + số sát thương bay lên (đọc Play.battleView).
// Số sát thương dùng font pixel 70-pixelfont (chỉ chữ số); chữ có dấu dùng font hệ thống.
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
    // Gợi ý không được đè nút Hết lượt (góc trên phải, rộng 104): ép chữ vào bề rộng còn lại.
    c.fillText(this.hint(), sl + pad, st + pad + fs * 1.5, W - sl - sr - pad * 3 - 104 * d);
    if (HASH.fps && R.fpsText) c.fillText(R.fpsText, sl + pad, st + pad + fs * 2.7);
    const P = G.play;
    // Nút Hết lượt (góc trên phải): khi đang lượt ta và không ở giữa một nước đi
    if (S.phase === 'ta' && !Play.busy(P) && (P.mode === 'cho' || P.mode === 'chon')) this.button(c, 'Hết lượt', 'hetluot', W - sr - pad - 104 * d, st + pad, 104 * d, 44 * d, false);
    let top = H - sb - pad; // mép trên của khối dưới cùng
    const sel = G.sel, bv = Play.battleView(P);
    if (sel && (P.mode === 'cho' || P.mode === 'chon' || P.mode === 'menu' || P.mode === 'may')) {
      const lines = this.describe(S, sel.x, sel.y);
      const lh = fs * 1.35, bw = Math.min(W - sl - sr - pad * 2, 420 * d), bh = lines.length * lh + pad * 1.2, bx = sl + pad, by = H - sb - pad - bh;
      this.panel(c, bx, by, bw, bh); top = by;
      lines.forEach((l, i) => { c.font = `${i === 0 ? 600 : 400} ${fs}px system-ui, sans-serif`; c.fillStyle = i === 0 ? '#ffd27a' : '#e6dccb'; c.fillText(l, bx + pad * .8, by + pad * .6 + i * lh); });
    }
    // Menu hành động sau khi đi: Đánh (khi có địch trong tầm) / Chờ / Hoàn tác. Kỹ năng, Vật phẩm, Mở rương thêm sau.
    if (P.mode === 'menu' && !P.anim) {
      const acts = [['Hoàn tác', 'hoantac'], ['Chờ', 'cho']];
      if (Play.targets(P).length) acts.push(['Đánh', 'danh']);
      this.row(c, acts, top, sl, sr, W, pad, d);
    }
    // Chọn mục tiêu: bảng dự báo (nếu đã chạm một địch) + Quay lại / Đánh
    if (P.mode === 'muctieu') {
      let y = H - sb - pad;
      const pw = Math.min(W - sl - sr - pad * 2, 400 * d);
      if (P.fc) { const fh = this.forecast(c, P.unit, P.foe, P.fc, sl + pad, y, pw, d, false, P.wpn); y -= fh; }
      if (P.fc && P.wpns.length > 1) y = this.weaponBar(c, P, sl + pad, y, pw, d);
      this.row(c, P.fc ? [['Quay lại', 'quaylai'], ['Đánh', 'xacnhan']] : [['Quay lại', 'quaylai']], y, sl, sr, W, pad, d);
    }
    // Phát lại trận
    if (bv) {
      this.forecast(c, bv.a, bv.d, bv.fc, sl + pad, H - sb - pad, Math.min(W - sl - sr - pad * 2, 400 * d), d, bv);
      this.popups(c, bv, d);
    }
    if (P.banner) this.banner(c, P.banner, W, H, d);
    if (P.over) this.banner(c, { text: P.over.text, sub: P.over.reason, side: P.over.side, t: 1, dur: 2 }, W, H, d);
  },
  // Một hàng nút canh phải, nằm trên mép `bottom`. Nút cuối là nút chính.
  row(c, acts, bottom, sl, sr, W, pad, d) {
    const n = acts.length, bh = 50 * d, bw = Math.min(118 * d, (W - sl - sr - pad * (n + 1)) / n), y = bottom - pad - bh;
    acts.forEach(([label, act], i) => this.button(c, label, act, W - sr - pad - (n - i) * bw - (n - 1 - i) * pad, y, bw, bh, i === n - 1));
  },
  // Thanh đổi vũ khí trên bảng dự báo: [◀]  Lửa đèn · 1/2  [▶]. Trả về mép trên mới.
  weaponBar(c, P, x, bottom, w, d) {
    const h = 46 * d, y = bottom - h - 6 * d, bw = 56 * d, i = P.wpns.indexOf(P.wpn) + 1;
    this.panel(c, x, y, w, h);
    this.button(c, '◀', 'vukhitruoc', x, y, bw, h, false); this.button(c, '▶', 'vukhisau', x + w - bw, y, bw, h, false);
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#f2e6cc'; c.font = `600 ${15 * d}px system-ui, sans-serif`;
    c.fillText(`${P.wpn.name} · ${i}/${P.wpns.length}`, x + w / 2, y + h / 2 + d, w - bw * 2 - 12 * d);
    c.textAlign = 'left'; c.textBaseline = 'top';
    return y;
  },
  // Bảng dự báo dọc kiểu FE: cột trái = bên đánh (ta), giữa = tên dòng, cột phải = bên bị đánh. Canh đáy tại `bottom`; trả về chiều cao.
  // bv (khi phát lại): HP lấy theo HP đang hiện, có thanh máu tụt dần. wa: vũ khí bên đánh đang xem (mặc định món đang cầm).
  forecast(c, a, b, fc, x, bottom, w, d, bv, wa) {
    const wA = wa || a.weapon, wB = b.weapon;
    const A = fc.attacker, D = fc.defender, fs = 15 * d, lh = fs * 1.55, pad = 10 * d;
    const COL = { ta: '#8fc4ff', dich: '#ff8f74', npc: '#9fd98a' }, EFF = '#ffb347', DIM = 'rgba(200,190,170,.75)';
    const dash = '–', can = [A.canAttack, D.canCounter];
    const hasUses = A.uses !== null || D.uses !== null;
    const effLine = (s, u) => s.effective.map(id => { const r = DATA.weapons.effectiveness[id] || {}, p = [];
      if (r.hit) p.push('+' + r.hit + ' trúng'); if (r.mtMult) p.push('Uy lực ×' + r.mtMult); if (r.dmgMult) p.push('ST ×' + r.dmgMult);
      return '▲ ' + (r.name || id) + ' ' + p.join(' '); }).join(' · ');
    const effs = [effLine(A), effLine(D)];
    const rows = [
      ['HP', null],
      ['ST', s => s.dmg + ((s === A ? A.strikes : D.strikes) > 1 ? ' ×2' : ''), true],
      ['Trúng', s => s.hit, true],
      ['Chí mạng', s => s.crit],
    ];
    if (hasUses) rows.push(['Độ bền', s => s.uses === null ? dash : s.uses + '/' + (s === A ? wA : wB).maxUses]);
    const effH = effs.some(e => e) ? fs * 1.25 : 0;
    const h = pad * 2 + fs * 1.3 + fs * 1.15 + effH + rows.length * lh + (bv ? fs * .9 : 0), y = bottom - h;
    this.panel(c, x, y, w, h);
    const cl = x + w * .2, cm = x + w * .5, cr = x + w * .8, sideOf = u => COL[u.side] || '#fff';
    // Tên + vũ khí
    c.textBaseline = 'top';
    let yy = y + pad;
    c.font = `700 ${fs * 1.05}px system-ui, sans-serif`;
    c.fillStyle = sideOf(a); c.textAlign = 'left'; c.fillText(a.name, x + pad, yy);
    c.fillStyle = sideOf(b); c.textAlign = 'right'; c.fillText(b.name, x + w - pad, yy);
    yy += fs * 1.3; c.font = `400 ${fs * .85}px system-ui, sans-serif`; c.fillStyle = DIM;
    c.textAlign = 'left'; c.fillText(wA ? wA.name : dash, x + pad, yy);
    c.textAlign = 'right'; c.fillText(wB ? wB.name : dash, x + w - pad, yy);
    yy += fs * 1.15;
    if (effH) {
      c.font = `600 ${fs * .78}px system-ui, sans-serif`; c.fillStyle = EFF;
      c.textAlign = 'left'; c.fillText(effs[0], x + pad, yy); c.textAlign = 'right'; c.fillText(effs[1], x + w - pad, yy); yy += effH;
    }
    // Vạch ngăn
    c.fillStyle = 'rgba(232,176,74,.3)'; c.fillRect(x + pad, yy - fs * .15, w - pad * 2, Math.max(1, d));
    c.textAlign = 'center';
    for (const [label, val, effCol] of rows) {
      const ty = yy + (lh - fs * 1.1) / 2;
      c.font = `400 ${fs * .85}px system-ui, sans-serif`; c.fillStyle = DIM; c.fillText(label, cm, ty + fs * .12);
      [[A, a, cl, 0], [D, b, cr, 1]].forEach(([sd, u, cx, i]) => {
        let txt;
        if (!val) { const hp = bv ? bv.hp[u.uid] : u.hp; txt = hp + '/' + u.stats.hp; if (bv) this.hpBar(c, cx - w * .14, ty + fs * 1.18, w * .28, 4 * d, hp / u.stats.hp, sideOf(u)); }
        else txt = can[i] ? String(val(sd)) : dash;
        c.font = `700 ${fs * 1.1}px system-ui, sans-serif`;
        c.fillStyle = effCol && can[i] && sd.effective.length ? EFF : '#f2e6cc';
        c.fillText(txt, cx, ty);
      });
      yy += lh;
    }
    if (bv) {   // trạng thái đòn đang phát
      const cur = bv.cur, ko = bv.ko; let msg = '';
      if (ko) { const u = ko.uid === a.uid ? a : b; msg = u.name + (ko.result === 'dead' ? ' đã chết' : ' rút lui'); }
      else if (cur) { const u = cur.s.from === a.uid ? a : b; msg = u.name + (cur.s.who === 'D' ? ' phản đòn' : ' tấn công') + (cur.i >= 2 ? ' (đánh đôi)' : ''); }
      c.font = `400 ${fs * .8}px system-ui, sans-serif`; c.fillStyle = DIM; c.fillText(msg, cm, yy);
    }
    c.textAlign = 'left';
    return h;
  },
  hpBar(c, x, y, w, h, k, col) {
    c.fillStyle = 'rgba(0,0,0,.6)'; c.fillRect(x, y, w, h);
    c.fillStyle = col; c.fillRect(x, y, w * Math.max(0, Math.min(1, k)), h);
  },
  // Số sát thương / "Trượt" / "Chí mạng!" bay lên trên đầu quân bị đánh.
  popups(c, bv, d) {
    for (const p of bv.pops) {
      const u = p.uid === bv.a.uid ? bv.a : bv.d, [sx, sy] = this.headOf(u), a = 1 - p.age * p.age, rise = p.age * 34 * d;
      if (!p.hit) {
        c.globalAlpha = a; c.font = `700 ${18 * d}px system-ui, sans-serif`; c.textAlign = 'center'; c.lineWidth = 4 * d; c.strokeStyle = 'rgba(0,0,0,.85)';
        c.strokeText('Trượt', sx, sy - rise); c.fillStyle = '#cfd6e6'; c.fillText('Trượt', sx, sy - rise); c.globalAlpha = 1; c.textAlign = 'left'; continue;
      }
      const sc = Math.round((p.crit ? 4 : 3) * d * (1 + .35 * Math.max(0, 1 - p.age * 5)));
      PX.text(c, String(p.damage), sx, sy - rise, sc, p.crit ? '#ffd04a' : '#fff4e0', { align: 'c', outline: '#1a0a06', shadow: 'rgba(0,0,0,.6)', alpha: a });
      const extra = p.crit ? 'Chí mạng!' : p.broke ? 'Vũ khí gãy!' : '';
      if (extra) {
        c.globalAlpha = a; c.font = `800 ${15 * d}px system-ui, sans-serif`; c.textAlign = 'center'; c.lineWidth = 4 * d; c.strokeStyle = 'rgba(0,0,0,.85)';
        c.strokeText(extra, sx, sy - rise - 14 * d); c.fillStyle = p.crit ? '#ff7a3a' : '#e0e0e0'; c.fillText(extra, sx, sy - rise - 14 * d); c.globalAlpha = 1; c.textAlign = 'left';
      }
    }
  },
  _v: null,
  // Toạ độ màn hình (px thiết bị) trên đầu quân u.
  headOf(u) {
    const v = this._v || (this._v = new THREE.Vector3()), w = tileWorld(G.map, u.x, u.y);
    v.set(w.x, standY(G.map, u.x, u.y) + 3.4, w.z).project(R.cam);
    return [(v.x + 1) / 2 * R.dw, (1 - v.y) / 2 * R.dh];
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
    const col = { ta: '90,150,255', dich: '220,80,60', npc: '120,190,110' }[b.side], h = (b.sub ? 84 : 64) * d, y = H * .38;
    c.globalAlpha = a;
    c.fillStyle = 'rgba(8,10,16,.78)'; c.fillRect(0, y, W, h);
    c.fillStyle = `rgba(${col},.9)`; c.fillRect(0, y, W, 2 * d); c.fillRect(0, y + h - 2 * d, W, 2 * d);
    c.font = `700 ${24 * d}px system-ui, sans-serif`; c.fillStyle = '#f2e6cc'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(b.text, W / 2, y + h / 2 - (b.sub ? 9 * d : 0));
    if (b.sub) { c.font = `400 ${15 * d}px system-ui, sans-serif`; c.fillStyle = 'rgba(230,220,200,.85)'; c.fillText(b.sub, W / 2, y + h / 2 + 16 * d); }
    c.textAlign = 'left'; c.textBaseline = 'top'; c.globalAlpha = 1;
  },
  // Chạm vào nút nào (toạ độ CSS px) → tên hành động hoặc null
  hit(cssX, cssY) {
    const k = R.dw / R.cssW, x = cssX * k, y = cssY * k;
    const b = this.btns.find(b => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h); return b ? b.act : null;
  },
  // Dòng gợi ý theo trạng thái chọn/đi (Play)
  hint() {
    const P = G.play, n = Play.left(P);
    if (P.over) return 'Trận đã kết thúc · tải lại trang để chơi lại';
    if (P.banner) return '';
    if (P.battle) return 'Đang giao chiến…';
    if (P.mode === 'muctieu') return P.fc ? (P.wpns.length > 1 ? '◀ ▶ đổi vũ khí · chạm lại mục tiêu hoặc Đánh để xác nhận' : 'Chạm lại mục tiêu hoặc nút Đánh để xác nhận') : 'Chạm quân địch trong ô đỏ để xem dự báo';
    if (P.mode === 'may') return (P.S.phase === 'npc' ? 'NPC' : 'Phe địch') + ' đang đi…';
    if (P.mode === 'di') return 'Đang đi…';
    if (P.mode === 'menu') return Play.targets(P).length ? 'Chọn: Đánh · Chờ · Hoàn tác' : 'Chọn: Chờ (kết thúc) hoặc Hoàn tác (về ô cũ)';
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
