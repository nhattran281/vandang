// ===== Vân Đăng · Hoạt ảnh hiển thị bằng GSAP Timeline (tuần 6) =====
// GDD mục 1: GSAP chỉ để PHÁT LẠI. Đường đi, kết quả từng đòn, HP, ai ngã… do logic (36-play, 36-combat) tính trước;
// file này dựng Timeline từ dữ liệu đó và không ghi gì ngược vào logic.
//
// Đồng hồ: mọi Timeline tạo ở trạng thái paused và KHÔNG chạy theo ticker/đồng hồ thật của GSAP. Mỗi bước của vòng lặp game,
// Anim.sync(P) tua Timeline tới đúng P.anim.t / P.battle.t (Play tăng hai giá trị này bằng dt của vòng lặp, kể cả khi tua x2/x4).
// → cùng seed + cùng chuỗi dt = cùng giá trị ở từng khung hình; tools/record.js (dt = 1/60) chụp ra đúng từng khung như nhau.
//
// Đi:   mỗi ô một đoạn STEP_TIME: x/z tuyến tính, y = nền (tuyến tính) + nảy (sine lên rồi xuống), quay mặt theo hướng bước.
// Trận: mỗi đòn một đoạn STRIKE_TIME: lao tới (lunge) + vung (atk) → ở IMPACT: trúng (giật lùi + chớp, HP tụt trong DRAIN)
//       hoặc trượt (né sang bên) → số sát thương / "Trượt" bay lên trong POPUP → lùi về. Phản đòn và đánh đôi là các đòn
//       tiếp theo trong nhật ký Core.fight. Hết đòn: bên ngã rút lui (chìm + mờ) trong KO_TIME, rồi +EXP tới hết trận.
// Chạy được trong Node (tools/test_anim.js): chỉ cần biến toàn cục gsap; vị trí ô do hàm place(x, y) → {x, y, z} truyền vào.
const Anim = (() => {
  const GS = typeof gsap !== 'undefined' ? gsap : null;
  if (GS) {
    GS.ticker.lagSmoothing(0);                       // không tự bù khung hình chậm (đồng hồ là của game)
    GS.defaults({ ease: 'none', overwrite: false, lazy: false });   // lazy: false → giá trị ghi ngay khi tua, không dồn sang tick sau
    GS.config({ nullTargetWarn: false, autoSleep: 60 });
  }
  const T = () => Play.TIMING;
  const NONE = { immediateRender: false };
  const on = v => Object.assign({}, NONE, v);

  // ----- Đi -----
  // path: [[x,y],…] (ô đầu = ô đứng); place(x, y) → toạ độ thế giới. Trả về { tl, o } với o = tư thế đang hiện.
  function buildWalk(path, place) {
    const ST = T().STEP_TIME, p0 = place(path[0][0], path[0][1]);
    const o = { x: p0.x, z: p0.z, base: p0.y, hop: 0, yaw: 0, k: 0 }, tl = GS.timeline({ paused: true });
    for (let i = 0; i + 1 < path.length; i++) {
      const [x0, y0] = path[i], [x1, y1] = path[i + 1], a = place(x0, y0), b = place(x1, y1), t0 = i * ST;
      const hop = .12 + Math.abs(b.y - a.y) * .6;
      tl.set(o, on({ yaw: Math.atan2(x1 - x0, y1 - y0) }), t0);
      tl.fromTo(o, { x: a.x, z: a.z, base: a.y, k: 0 }, on({ x: b.x, z: b.z, base: b.y, k: 1, duration: ST, ease: 'none' }), t0);
      tl.fromTo(o, { hop: 0 }, on({ hop, duration: ST / 2, ease: 'sine.out' }), t0);   // = hop·sin(k·π) như bản trước
      tl.fromTo(o, { hop }, on({ hop: 0, duration: ST / 2, ease: 'sine.in' }), t0 + ST / 2);
    }
    if (path.length > 1) tl.set(o, on({ k: 1 }), (path.length - 1) * ST);
    return { tl, o };
  }

  // ----- Trận -----
  // b = P.battle { a, d, res: Core.fight, hp0, growth, dur }. Trả về { tl, V }; V là trạng thái hiển thị mà Timeline ghi vào.
  function buildBattle(b) {
    const { STRIKE_TIME: ST, IMPACT, DRAIN, POPUP, KO_TIME } = T(), st = b.res.strikes, n = st.length, o = b.res.outcome;
    const pose = () => ({ atk: -1, lunge: 0, flinch: 0, flash: 0, dodge: 0 });
    const V = { cur: -1, imp: 0, ko: 0, koOn: 0, exp: 0, end: 0, hp: Object.assign({}, b.hp0), U: { [b.a.uid]: pose(), [b.d.uid]: pose() }, pops: [] };
    const tl = GS.timeline({ paused: true });
    st.forEach((s, j) => {
      const t0 = j * ST, F = V.U[s.from], D = V.U[s.to], ti = t0 + IMPACT;
      tl.set(V, on({ cur: j, imp: 0 }), t0);
      // Lao tới + vung (nhịp vung giữ như bản trước: atk 0 → 1 trong IMPACT/.45 giây), rồi lùi về chỗ.
      tl.fromTo(F, { atk: 0 }, on({ atk: 1, duration: IMPACT / .45, ease: 'none' }), t0);
      tl.fromTo(F, { lunge: 0 }, on({ lunge: 1, duration: IMPACT, ease: 'power2.in' }), t0);
      tl.to(F, on({ lunge: 0, duration: ST - IMPACT - .12, ease: 'power2.out' }), ti);
      tl.set(F, on({ atk: -1 }), t0 + ST - 1e-4);
      tl.set(V, on({ imp: 1 }), ti);
      if (s.hit) {
        const fl = s.crit ? 1 : .5;
        tl.fromTo(D, { flinch: 1, flash: fl }, on({ flinch: 0, flash: 0, duration: .3, ease: 'none' }), ti);
        tl.to(V.hp, on({ [s.to]: s.targetHp, duration: DRAIN, ease: 'power1.out' }), ti);
      } else {   // trượt: bên bị đánh né sang bên rồi về
        tl.fromTo(D, { dodge: 0 }, on({ dodge: 1, duration: .14, ease: 'power2.out' }), ti - .1);
        tl.to(D, on({ dodge: 0, duration: .3, ease: 'power1.inOut' }), ti + .12);
      }
      const p = { uid: s.to, hit: s.hit, crit: s.crit, damage: s.damage, broke: s.broke, from: s.from, age: 0, on: 0 };
      V.pops.push(p);
      tl.set(p, on({ on: 1 }), ti);
      tl.fromTo(p, { age: 0 }, on({ age: 1, duration: POPUP, ease: 'none' }), ti);
      tl.set(p, on({ on: 0 }), ti + POPUP);
    });
    const tKO = n * ST;
    tl.set(V, on({ cur: -1, imp: 0, exp: 1 }), tKO);
    if (o) { tl.set(V, on({ koOn: 1 }), tKO); tl.fromTo(V, { ko: 0 }, on({ ko: 1, duration: KO_TIME, ease: 'power1.in' }), tKO); }
    tl.set(V, on({ end: 1 }), b.dur);   // ghim độ dài Timeline = b.dur (Play kết thúc trận đúng lúc này)
    return { tl, V };
  }

  // ----- Đồng bộ với Play (gọi mỗi bước của vòng lặp game, sau Play.update) -----
  const cur = { walk: null, wk: null, battle: null, bk: null };
  const clampT = (t, d) => Math.max(0, Math.min(d, Number.isFinite(t) ? t : d));
  // Tua tới t. Lần đầu (Timeline vừa dựng) phải ép vẽ: Timeline mới ở giây 0 mà tua tới 0 thì GSAP coi như không đổi, không ghi giá trị đầu.
  function seek(tl, t) { if (tl.__fresh !== false) { tl.__fresh = false; tl.render(t, false, true); } else tl.totalTime(t); }
  function sync(P, place) {
    if (!GS) return;
    if (cur.wk !== P.anim) {
      if (cur.walk) cur.walk.tl.kill();
      cur.wk = P.anim; cur.walk = P.anim && P.anim.path.length > 1 ? buildWalk(P.anim.path, place) : null;
    }
    if (cur.walk) seek(cur.walk.tl, clampT(P.anim.t, P.anim.dur));
    if (cur.bk !== P.battle) {
      if (cur.battle) cur.battle.tl.kill();
      cur.bk = P.battle; cur.battle = P.battle ? buildBattle(P.battle) : null;
    }
    if (cur.battle) seek(cur.battle.tl, clampT(P.battle.t, P.battle.dur));
  }
  // Tư thế đang đi của u: { x, y, z, yaw, k } (toạ độ thế giới) hoặc null nếu u không đang đi.
  function walk(P, u) {
    const w = cur.walk; if (!w || !P.anim || cur.wk !== P.anim || P.anim.u !== u) return null;
    return { x: w.o.x, y: w.o.base + w.o.hop, z: w.o.z, yaw: w.o.yaw, k: w.o.k };   // chép số, không trả đối tượng GSAP đang giữ
  }
  // Ảnh chụp trận đang phát (cùng dạng với Play.battleView để HUD dùng chung) + U: tư thế từng bên (atk, lunge, flinch, flash, dodge).
  function battle(P) {
    const B = cur.battle, b = P.battle; if (!B || !b || cur.bk !== b) return null;
    // GSAP gắn thuộc tính _gsap vào đối tượng nó tween, nên chỉ chép đúng các trường cần (không chép nguyên đối tượng).
    const V = B.V, st = b.res.strikes, o = b.res.outcome, hp = {}, U = {};
    for (const u of [b.a, b.d]) {
      hp[u.uid] = Math.round(V.hp[u.uid]);
      const q = V.U[u.uid]; U[u.uid] = { atk: q.atk, lunge: q.lunge, flinch: q.flinch, flash: q.flash, dodge: q.dodge };
    }
    return {
      a: b.a, d: b.d, fc: b.res.forecast, hp, U, t: b.t, dur: b.dur,
      cur: V.cur >= 0 ? { i: V.cur, s: st[V.cur], impact: V.imp === 1 } : null,
      pops: V.pops.filter(p => p.on === 1).map(p => ({ uid: p.uid, hit: p.hit, crit: p.crit, damage: p.damage, broke: p.broke, from: p.from, age: p.age })),
      ko: o && V.koOn === 1 ? { uid: o.uid, result: o.result, k: V.ko } : null,
      exp: V.cur < 0 && V.exp === 1 && b.growth ? b.growth.exp : null,
    };
  }
  // Để test / soi: Timeline đang giữ.
  const timelines = () => ({ walk: cur.walk && cur.walk.tl, battle: cur.battle && cur.battle.tl });
  function reset() { if (cur.walk) cur.walk.tl.kill(); if (cur.battle) cur.battle.tl.kill(); cur.walk = cur.wk = cur.battle = cur.bk = null; }
  return { ok: !!GS, buildWalk, buildBattle, sync, walk, battle, timelines, reset };
})();
