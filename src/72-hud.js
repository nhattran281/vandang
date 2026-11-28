// ===== Vân Đăng · HUD tạm =====
// Chữ vẽ lên canvas #hud bằng font hệ thống (font pixel 70-pixelfont chưa có dấu tiếng Việt).
// Tên map, gợi ý, thông tin ô, nút Hết lượt / menu hành động (tuần 2).
// Tuần 3: nút Đánh, bảng dự báo dọc 2 cột (đọc P.fc = Core.forecast), bảng phát lại trận + số sát thương bay lên (tuần 6: đọc Anim.battle).
// Tuần 6: nút tua lượt địch (x1 · x2 · x4 · Bỏ qua) ở góc trên phải, dưới Hết lượt / Lưu tạm.
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
    const hw = W - sl - sr - pad * 3 - 104 * d, tut = !G.title && !G.intro && this.tutorial();
    let hy = st + pad + fs * 1.5;
    if (tut) {   // chương hướng dẫn (tuần 5 mục 4): gợi ý đi → đánh → chờ trong ô nổi bật, xuống dòng nếu dài
      c.font = `600 ${fs * .85}px system-ui, sans-serif`; const L = this.wrap(c, tut, hw - pad), lh = fs * 1.15;
      c.fillStyle = 'rgba(60,40,8,.78)'; c.fillRect(sl + pad * .5, hy - 4 * d, hw + pad * .5, L.length * lh + 8 * d);
      c.fillStyle = '#ffd27a'; c.fillRect(sl + pad * .5, hy - 4 * d, 3 * d, L.length * lh + 8 * d);
      L.forEach((l, i) => c.fillText(l, sl + pad, hy + i * lh)); hy += L.length * lh + 8 * d;
    } else { c.fillText(this.hint(), sl + pad, hy, hw); hy += fs * 1.2; }
    const S0 = G.map;
    if (S0.goal && !G.title && !G.intro) {   // mục tiêu chương, luôn hiện dưới gợi ý
      c.font = `400 ${fs * .78}px system-ui, sans-serif`; c.fillStyle = 'rgba(255,210,122,.85)';
      c.fillText('Mục tiêu: ' + Core.goalText(S0.goal, DATA).win, sl + pad, hy, hw); hy += fs * 1.2;
    }
    if (HASH.fps && R.fpsText) { c.fillStyle = 'rgba(200,190,170,.8)'; c.fillText(R.fpsText, sl + pad, hy); }
    const P = G.play;
    if (G.title) { this.title(c, G.title, W, H, d); return; }
    if (G.intro) { this.intro(c, G.intro, W, H, d, sl, sr, sb, pad); return; }
    // Nút Hết lượt (góc trên phải): khi đang lượt ta và không ở giữa một nước đi. Lưu tạm (chiến dịch) nằm ngay dưới.
    if (S.phase === 'ta' && !Play.busy(P) && (P.mode === 'cho' || P.mode === 'chon')) {
      this.button(c, 'Hết lượt', 'hetluot', W - sr - pad - 104 * d, st + pad, 104 * d, 44 * d, false);
      if (G.campaign && Play.canSuspend(P)) this.button(c, 'Lưu tạm', 'luutam', W - sr - pad - 104 * d, st + pad + 52 * d, 104 * d, 40 * d, false);
    }
    // Nút tua lượt địch (tuần 6): luôn ở cùng chỗ khi đang trong trận, chỉnh trước được từ lượt ta.
    if (!P.over) this.button(c, this.speedLabel(P), 'tua', W - sr - pad - 104 * d, st + pad + 100 * d, 104 * d, 40 * d, Play.ffActive(P));
    let top = H - sb - pad; // mép trên của khối dưới cùng
    const sel = G.sel, bv = Anim.battle(P);   // trận đang phát: giá trị do GSAP Timeline ghi (54-anim)
    if (sel && (P.mode === 'cho' || P.mode === 'chon' || P.mode === 'menu' || P.mode === 'may')) {
      const lines = this.describe(S, sel.x, sel.y);
      const lh = fs * 1.35, bw = Math.min(W - sl - sr - pad * 2, 420 * d), bh = lines.length * lh + pad * 1.2, bx = sl + pad, by = H - sb - pad - bh;
      this.panel(c, bx, by, bw, bh); top = by;
      lines.forEach((l, i) => {
        const txt = typeof l === 'string' ? l : l.t, tx = bx + pad * .8, ty = by + pad * .6 + i * lh;
        c.font = `${i === 0 ? 600 : 400} ${fs}px system-ui, sans-serif`; c.fillStyle = i === 0 ? '#ffd27a' : '#e6dccb'; c.fillText(txt, tx, ty);
        if (l.bar != null) { const x0 = tx + c.measureText(txt).width + pad * .6; const ww = Math.max(0, bx + bw - pad * .8 - x0); c.fillStyle = 'rgba(255,255,255,.14)'; c.fillRect(x0, ty + fs * .3, ww, 7 * d); c.fillStyle = '#8fc4ff'; c.fillRect(x0, ty + fs * .3, ww * Math.min(1, l.bar), 7 * d); }   // thanh EXP
      });
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
    if (P.levelUp) this.levelUp(c, P.levelUp, W, H, d);
    else if (P.banner) this.banner(c, P.banner, W, H, d);
    if (P.over) this.result(c, P.over, W, H, d, sl, sr, sb, pad);
    if (G.toast) this.banner(c, { text: G.toast.text, side: 'ta', t: G.toast.t, dur: G.toast.dur }, W, H, d);
  },
  // ----- Chương (tuần 5 mục 4) -----
  // Cắt chữ thành dòng vừa bề rộng maxW (theo font đang đặt).
  wrap(c, text, maxW) {
    const out = []; let line = '';
    for (const w of String(text).split(' ')) { const t = line ? line + ' ' + w : w; if (line && c.measureText(t).width > maxW) { out.push(line); line = w; } else line = t; }
    if (line) out.push(line); return out;
  },
  RULE_TEXT: { noSkills: [true, 'Không kỹ năng'], noStatus: [true, 'Không trạng thái'], fog: [null, 'Có sương mù', 'Không sương'], deadZone: [true, 'Vùng Chết: quân ngã chết vĩnh viễn'] },
  rulesText(rules) {
    const out = [];
    for (const k in this.RULE_TEXT) { const r = this.RULE_TEXT[k], v = (rules || {})[k]; if (v === true) out.push(r[1]); else if (v === false && r[2]) out.push(r[2]); }
    return out.join(' · ');
  },
  speaker(who) { return who ? ((DATA.units.templates[who] || {}).name || who) : null; },
  // Hộp hội thoại ở đáy: tên người nói (hoặc lời kể in nghiêng) + câu. Trả về mép trên.
  talk(c, line, bottom, W, d, sl, sr, pad) {
    const fs = 16 * d, w = Math.min(W - sl - sr - pad * 2, 460 * d), x = (W - w) / 2, who = this.speaker(line.who);
    c.font = `${who ? 400 : 'italic 400'} ${fs}px system-ui, sans-serif`;
    const L = this.wrap(c, line.text, w - pad * 2), lh = fs * 1.4, h = pad * 2 + (who ? fs * 1.5 : 0) + L.length * lh, y = bottom - h;
    this.panel(c, x, y, w, h);
    let yy = y + pad;
    if (who) { c.font = `700 ${fs}px system-ui, sans-serif`; c.fillStyle = '#8fc4ff'; c.fillText(who, x + pad, yy); yy += fs * 1.5; }
    c.font = `${who ? 400 : 'italic 400'} ${fs}px system-ui, sans-serif`; c.fillStyle = who ? '#f2e6cc' : 'rgba(230,220,200,.85)';
    L.forEach((l, i) => c.fillText(l, x + pad, yy + i * lh));
    return y;
  },
  // Màn chương: tên chương, mục tiêu, thua khi, luật, gia nhập; rồi hội thoại mở đầu từng câu (chạm để sang câu sau).
  intro(c, I, W, H, d, sl, sr, sb, pad) {
    const ch = I.ch, S = G.map, g = Core.goalText(S.goal, DATA), fs = 15 * d;
    c.fillStyle = 'rgba(2,3,8,.62)'; c.fillRect(0, 0, W, H);
    const w = Math.min(W - sl - sr - pad * 2, 460 * d), x = (W - w) / 2;
    const rows = [['Mục tiêu', g.win], ['Thua khi', g.lose]], rt = this.rulesText(S.rules);
    if (rt) rows.push(['Luật', rt]);
    if ((ch.join || []).length) rows.push(['Gia nhập', ch.join.map(id => this.speaker(id)).join(', ')]);
    c.font = `400 ${fs}px system-ui, sans-serif`;
    const wrapped = rows.map(([k, v]) => [k, this.wrap(c, v, w - pad * 2 - 84 * d)]), lh = fs * 1.4;
    const h = pad * 2 + 34 * d + wrapped.reduce((a, [, L]) => a + L.length * lh + 4 * d, 0);
    const y = Math.max((R.safe ? R.safe[1] : 0) + 92 * d, H * .14);
    this.panel(c, x, y, w, h);
    c.font = `700 ${22 * d}px system-ui, sans-serif`; c.fillStyle = '#e8b04a'; c.fillText(ch.name || ch.id, x + pad, y + pad, w - pad * 2);
    let yy = y + pad + 34 * d;
    for (const [k, L] of wrapped) {
      c.font = `600 ${fs * .85}px system-ui, sans-serif`; c.fillStyle = 'rgba(200,190,170,.8)'; c.fillText(k, x + pad, yy + 1 * d);
      c.font = `400 ${fs}px system-ui, sans-serif`; c.fillStyle = k === 'Luật' && S.rules.deadZone ? '#ff8f74' : '#f2e6cc';
      L.forEach((l, i) => c.fillText(l, x + pad + 84 * d, yy + i * lh)); yy += L.length * lh + 4 * d;
    }
    const lines = ch.intro || [], last = I.i >= lines.length - 1, bottom = H - sb - pad;
    const acts = last ? [['Vào trận', 'vaotran']] : [['Bỏ qua', 'vaotran'], ['Tiếp ▶', 'tiep']];
    this.row(c, acts, bottom, sl, sr, W, pad, d);
    if (lines.length) {
      const ty = this.talk(c, lines[Math.min(I.i, lines.length - 1)], bottom - 50 * d - pad * 2, W, d, sl, sr, pad);
      c.font = `400 ${12 * d}px system-ui, sans-serif`; c.fillStyle = 'rgba(200,190,170,.6)'; c.textAlign = 'center';
      c.fillText(`${Math.min(I.i, lines.length - 1) + 1}/${lines.length} · chạm để đọc tiếp`, W / 2, ty - 18 * d); c.textAlign = 'left';
    }
  },
  // Kết quả trận: Thắng/Thua, lý do, số lượt, quân ta đã ngã, đã lưu; thắng thì hội thoại kết; rồi nút.
  result(c, O, W, H, d, sl, sr, sb, pad) {
    c.fillStyle = 'rgba(2,3,8,.5)'; c.fillRect(0, 0, W, H);
    const S = G.map, fs = 15 * d, w = Math.min(W - sl - sr - pad * 2, 460 * d), x = (W - w) / 2;
    const fell = S.units.filter(u => u.side === 'ta' && u.hp <= 0 && !u.escaped);
    const info = [O.reason, (S.chapterName ? S.chapterName + ' · ' : '') + (O.turns || S.turn) + ' lượt',
      fell.length ? (fell.some(u => u.dead) ? 'Đã ngã: ' : 'Rút lui: ') + fell.map(u => u.name + (u.dead ? ' (chết)' : '')).join(', ') : 'Không quân ta nào ngã'];
    if (O.saved) info.push(O.saved);
    const h = pad * 2 + 40 * d + info.length * fs * 1.45, y = Math.max((R.safe ? R.safe[1] : 0) + 92 * d, H * .16);
    this.panel(c, x, y, w, h);
    c.font = `800 ${28 * d}px system-ui, sans-serif`; c.fillStyle = O.win ? '#8fc4ff' : '#ff8f74'; c.textAlign = 'center';
    c.fillText(O.text, W / 2, y + pad);
    c.font = `400 ${fs}px system-ui, sans-serif`; c.fillStyle = '#f2e6cc';
    info.forEach((l, i) => c.fillText(l, W / 2, y + pad + 40 * d + i * fs * 1.45, w - pad * 2)); c.textAlign = 'left';
    const bottom = H - sb - pad, Q = G.outro;
    if (Q && Q.i < Q.lines.length) {
      this.row(c, [['Bỏ qua', 'boqua_ket'], ['Tiếp ▶', 'tiep_ket']], bottom, sl, sr, W, pad, d);
      this.talk(c, Q.lines[Q.i], bottom - 50 * d - pad * 2, W, d, sl, sr, pad);
      return;
    }
    if (G.campaign) this.row(c, O.win ? (G.campaign.done ? [['Màn chính', 'manchinh']] : [['Màn chính', 'manchinh'], ['Chương sau', 'chuongsau']]) : [['Màn chính', 'manchinh'], ['Chơi lại chương', 'choilai']], bottom, sl, sr, W, pad, d);
  },
  // Gợi ý hướng dẫn của chương (tutorial.hints) theo trạng thái Play, chỉ trong tutorial.turns lượt đầu và khi đang tới lượt ta.
  tutorial() {
    const T = G.chapter && G.chapter.tutorial, P = G.play; if (!T || !P || P.over || P.levelUp || P.banner || P.battle || P.anim) return null;
    if (P.S.phase !== 'ta' || P.S.turn > T.turns) return null;
    const k = P.mode === 'cho' ? 'cho' : P.mode === 'chon' ? (P.target ? 'dich' : 'chon') : P.mode === 'menu' ? (Play.targets(P).length ? 'menuDanh' : 'menu') : P.mode === 'muctieu' ? (P.fc ? 'dubao' : 'muctieu') : null;
    return (k && T.hints && T.hints[k]) || null;
  },
  // Màn chính (tuần 5): Tiếp tục (nếu có bản lưu) · Chơi mới Casual / Classic. Bản lưu hỏng/khác phiên bản thì báo, không vỡ.
  title(c, T, W, H, d) {
    c.fillStyle = 'rgba(2,3,8,.55)'; c.fillRect(0, 0, W, H);
    const bw = Math.min(W - 48 * d, 320 * d), bx = (W - bw) / 2, bh = 52 * d, gap = 12 * d;
    let y = H * .2;
    c.textAlign = 'center'; c.textBaseline = 'top';
    c.font = `700 ${40 * d}px system-ui, sans-serif`; c.fillStyle = '#e8b04a'; c.fillText('Vân Đăng', W / 2, y); y += 56 * d;
    const C = G.campaign, ch = C && Save.chapterOf(C, DATA), info = [];
    if (T.hasSave && ch) info.push(`${ch.name} · ${C.mode === 'classic' ? 'Classic' : 'Casual'}` + (T.resumed ? ` · lưu tạm lượt ${G.map.turn}` : ''));
    if (T.done) info.push('Đã hoàn thành chiến dịch · Đèn lồng: ' + T.lanterns);
    for (const e of T.errors) info.push('⚠ Không nạp được: ' + e);
    c.font = `400 ${14 * d}px system-ui, sans-serif`;
    for (const l of info) { c.fillStyle = l[0] === '⚠' ? '#ff8f74' : 'rgba(230,220,200,.9)'; c.fillText(l, W / 2, y, W - 24 * d); y += 22 * d; }
    c.textAlign = 'left'; y += 16 * d;
    const btns = [];
    if (T.hasSave) btns.push(['Tiếp tục', 'tieptuc', true]);
    for (const [m, label] of [['casual', 'Chơi mới · Casual'], ['classic', 'Chơi mới · Classic']]) btns.push([T.confirm === m ? 'Chạm lại để xoá bản lưu cũ' : label, 'moi_' + m, !T.hasSave && m === 'casual']);
    for (const [label, act, main] of btns) { this.button(c, label, act, bx, y, bw, bh, main); y += bh + gap; }
    c.font = `400 ${12 * d}px system-ui, sans-serif`; c.fillStyle = 'rgba(200,190,170,.7)'; c.textAlign = 'center';
    c.fillText('Casual: quân ngã rút lui, chương sau quay lại · Classic: chết vĩnh viễn', W / 2, y + 4 * d, W - 24 * d); c.textAlign = 'left';
  },
  // Một hàng nút canh phải, nằm trên mép `bottom`. Nút cuối là nút chính.
  row(c, acts, bottom, sl, sr, W, pad, d) {
    const n = acts.length, bh = 50 * d, bw = Math.min(140 * d, (W - sl - sr - pad * (n + 1)) / n), y = bottom - pad - bh;
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
      if (!cur && bv.exp && bv.exp.length) msg = (msg ? msg + ' · ' : '') + bv.exp.map(e => `${e.name} +${e.gained} EXP`).join(' · ');
      c.font = `400 ${fs * .8}px system-ui, sans-serif`; c.fillStyle = DIM; c.fillText(msg, cm, yy);
    }
    c.textAlign = 'left';
    return h;
  },
  // Bảng "Lên cấp" (tuần 5): mỗi đơn vị một khối — Lv cũ → mới, lưới chỉ số với +1 tô vàng; tăng hạng vũ khí một dòng. Chạm để đóng.
  levelUp(c, L, W, H, d) {
    const fs = 15 * d, pad = 12 * d, lh = fs * 1.45, NAME = { hp: 'HP', str: 'Sức', mag: 'Phép', skl: 'Kỹ', spd: 'Tốc', lck: 'May', def: 'Thủ', res: 'Kháng', con: 'Thể', mov: 'Di' };
    const keys = Core.STAT_KEYS, rows = Math.ceil(keys.length / 2);
    let h = pad * 2 + fs * .9;
    for (const it of L.list) h += it.kind === 'lv' ? fs * 1.6 + rows * lh + pad * .4 : lh;
    const w = Math.min(W - 24 * d, 360 * d), x = (W - w) / 2, y = Math.max(12 * d, (H - h) / 2);
    this.btns.push({ x: 0, y: 0, w: W, h: H, act: 'lencap' });   // chạm bất kỳ đâu để đóng
    c.fillStyle = 'rgba(4,5,9,.55)'; c.fillRect(0, 0, W, H);   // làm tối nền cho dễ đọc
    this.panel(c, x, y, w, h); c.fillStyle = 'rgba(8,10,16,.6)'; c.fillRect(x, y, w, h);
    c.textBaseline = 'top'; let yy = y + pad;
    for (const it of L.list) {
      if (it.kind === 'rank') {
        const ty = (DATA.weapons.types[it.type] || {}).name || it.type;
        c.font = `600 ${fs}px system-ui, sans-serif`; c.fillStyle = '#ffd27a'; c.textAlign = 'left';
        c.fillText(`${it.name} · Hạng ${ty}: ${it.from} → ${it.to}`, x + pad, yy); yy += lh; continue;
      }
      c.font = `700 ${fs * 1.15}px system-ui, sans-serif`; c.fillStyle = '#8fc4ff'; c.textAlign = 'left'; c.fillText(it.name, x + pad, yy);
      c.fillStyle = '#ffd27a'; c.textAlign = 'right'; c.fillText(`Lên cấp!  Lv ${it.from} → ${it.to}`, x + w - pad, yy);
      yy += fs * 1.6;
      keys.forEach((k, i) => {
        const col = i < rows ? 0 : 1, row = i % rows, cx = x + pad + col * (w - pad * 2) / 2, cw = (w - pad * 2) / 2 - pad, ty = yy + row * lh, g = it.gains[k] || 0;
        c.font = `400 ${fs}px system-ui, sans-serif`; c.fillStyle = 'rgba(200,190,170,.85)'; c.textAlign = 'left'; c.fillText(NAME[k], cx, ty);
        c.font = `700 ${fs}px system-ui, sans-serif`; c.fillStyle = g ? '#ffd04a' : '#f2e6cc'; c.textAlign = 'right';
        c.fillText(String(it.stats[k]) + (g ? `  +${g}` : '     '), cx + cw, ty);
      });
      yy += rows * lh + pad * .4;
    }
    c.font = `400 ${fs * .8}px system-ui, sans-serif`; c.fillStyle = 'rgba(200,190,170,.7)'; c.textAlign = 'center';
    c.fillText('Chạm để tiếp tục', x + w / 2, yy); c.textAlign = 'left';
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
  speedLabel(P) { return P.ff === 0 ? 'Địch: Bỏ qua' : 'Địch: x' + P.ff; },
  // Chạm vào nút nào (toạ độ CSS px) → tên hành động hoặc null
  hit(cssX, cssY) {
    const k = R.dw / R.cssW, x = cssX * k, y = cssY * k;
    const b = this.btns.find(b => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h); return b ? b.act : null;
  },
  // Dòng gợi ý theo trạng thái chọn/đi (Play)
  hint() {
    const P = G.play, n = Play.left(P);
    if (P.over) return G.campaign ? 'Trận đã kết thúc' : 'Trận đã kết thúc · tải lại trang để chơi lại';
    if (P.levelUp) return 'Chạm để tiếp tục';
    if (P.banner) return '';
    if (P.battle) return 'Đang giao chiến…';
    if (P.mode === 'muctieu') return P.fc ? (P.wpns.length > 1 ? '◀ ▶ đổi vũ khí · chạm lại mục tiêu hoặc Đánh để xác nhận' : 'Chạm lại mục tiêu hoặc nút Đánh để xác nhận') : 'Chạm quân địch trong ô đỏ để xem dự báo';
    if (P.mode === 'may') return (P.S.phase === 'npc' ? 'NPC' : 'Phe địch') + ' đang đi…' + (P.ff !== 1 ? ' (' + (P.ff ? 'x' + P.ff : 'bỏ qua') + ')' : '');
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
    if (u) { const s = u.stats, side = { ta: 'Ta', dich: 'Địch', npc: 'NPC' }[u.side]; out.push(`${u.name}${u.title ? ' · ' + u.title : ''} [${side}] Lv${u.lv}  HP ${u.hp}/${s.hp}` + (u.done ? ' · đã đi' : '')); out.push(`Sức ${s.str} Phép ${s.mag} Kỹ ${s.skl} Tốc ${s.spd} May ${s.lck} Thủ ${s.def} Kháng ${s.res} Di ${s.mov}`);
      if (u.side === 'ta') {   // tuần 5: thanh EXP + hạng vũ khí (điểm tới hạng kế)
        const per = DATA.classes.expPerLevel || 100, max = u.lv >= Core.maxLv(DATA), RE = Core.rankExp(DATA);
        const rk = Object.keys(u.ranks || {}).map(ty => { const r = u.ranks[ty], nx = Core.RANKS[Core.RANKS.indexOf(r) + 1];
          return `${(DATA.weapons.types[ty] || {}).name || ty} ${r}` + (nx ? ` ${(u.wexp && u.wexp[ty]) | 0}/${RE[nx]}` : ''); }).join(' · ');
        out.push({ t: max ? 'EXP --' : `EXP ${u.exp}/${per}`, bar: max ? 1 : u.exp / per });
        if (rk) out.push('Hạng: ' + rk);
      } }
    const k = Core.chestAt(S, x, y); if (k) out.push('Rương: ' + k.item);
    return out;
  },
};
