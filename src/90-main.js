// Camera: giữ nguyên từ Cinderwatch (MIT), chỉ thay updateCamera cho bàn cờ.
const CAM = { yaw: PI / 4, elev: 38 * PI / 180, dist: 90, x: 0, y: 0, z: 0, zoom: 1, fx: 0, fz: 0, sx: 0, sz: 0, man: false, mx: 0, mz: 0, mzoom: 1, base: 27, aspect: 1.6, za: null };
const _cr = new THREE.Vector3(), _cu = new THREE.Vector3(), _cd = new THREE.Vector3(), _ct = new THREE.Vector3();
function applyCamera() {
  const cam = R.cam, e = CAM.elev, sy = Math.sin(CAM.yaw), cy = Math.cos(CAM.yaw);
  _cd.set(Math.cos(e) * sy, Math.sin(e), Math.cos(e) * cy); _cr.set(cy, 0, -sy); _cu.set(-Math.sin(e) * sy, Math.cos(e), -Math.sin(e) * cy);
  const aspect = R.dw / R.dh, base = Math.max(R.viewH, lerp(R.fitTall, R.fitW, smooth(.62, 1.15, aspect)) / aspect), vh = base / CAM.zoom;
  CAM.base = base; CAM.aspect = aspect;
  R.px = vh / R.ih; R.viewW = vh * aspect; R.dofScale = base / R.viewH / CAM.zoom;
  _ct.set(CAM.x, CAM.y, CAM.z).addScaledVector(_cr, FX.shakeX).addScaledVector(_cu, FX.shakeY - R.shiftY + (R.hudTop || 0) / R.dh * vh * .5);
  const u = _ct.dot(_cr), v = _ct.dot(_cu), us = Math.round(u / R.px) * R.px, vs = Math.round(v / R.px) * R.px;
  R.sub.set((u - us) / R.px, (v - vs) / R.px);
  R.ditherOfs.set(((Math.round(us / R.px) % 8) + 8) % 8, ((Math.round(vs / R.px) % 8) + 8) % 8);
  _ct.addScaledVector(_cr, us - u).addScaledVector(_cu, vs - v);
  cam.left = -vh * aspect / 2; cam.right = vh * aspect / 2; cam.top = vh / 2; cam.bottom = -vh / 2; cam.near = 1; cam.far = 210;
  cam.position.copy(_ct).addScaledVector(_cd, CAM.dist); cam.up.set(0, 1, 0); cam.lookAt(_ct);
  cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
  R.focusZ = CAM.dist;
  R.dofD = (BH - _ct.x) * _cd.x - _ct.y * _cd.y + (BH - _ct.z) * _cd.z;
}
function updateCamera(dt) {
  // Camera tự nhìn vào giữa bàn cờ (hoặc ô đang chọn) cho tới khi người chơi kéo/thu phóng.
  const sel = G.sel, tw = sel ? tileWorld(G.map, sel.x, sel.y) : { x: 0, z: 0 }, k = sel ? .2 : 0;
  CAM.fx = damp(CAM.fx, tw.x * k, .9, dt); CAM.fz = damp(CAM.fz, tw.z * k, .9, dt);
  CAM.sx = damp(CAM.sx, CAM.fx, .8, dt); CAM.sz = damp(CAM.sz, CAM.fz, .8, dt);
  if (CAM.za) { const a = CAM.za, z0 = CAM.man ? CAM.mzoom : CAM.zoom, r = a.to / z0; camZoomAt(Math.pow(r, 1 - Math.exp(-dt * (a.rate || 9))), a.px, a.py); if (Math.abs(Math.log(a.to / CAM.mzoom)) < .012 || Math.abs(CAM.mzoom - z0) < 1e-5) CAM.za = null; }
  if (CAM.man) { CAM.x = CAM.sx = CAM.mx; CAM.z = CAM.sz = CAM.mz; CAM.zoom = CAM.mzoom; }
  else { CAM.x = CAM.sx; CAM.z = CAM.sz; CAM.zoom = damp(CAM.zoom, 1, .7, dt); }
  CAM.y = damp(CAM.y, .4, 1, dt);
  // Màn hình dọc: xoay gần thẳng để chiều dài map (16 ô) chạy theo chiều dọc; màn hình ngang: góc isometric 45° như Cinderwatch.
  const portrait = R.dw < R.dh; CAM.yaw = portrait ? .22 : PI / 4; CAM.elev = (portrait ? 50 : 38) * PI / 180;
  const lk = window.__vd && window.__vd.lock; if (lk) { CAM.x = lk[0]; CAM.z = lk[1]; CAM.zoom = lk[2] || 1; }
}

function camGrab() { if (!CAM.man) { CAM.man = true; CAM.mx = CAM.x; CAM.mz = CAM.z; CAM.mzoom = CAM.zoom; } }
function camZoomMin() { return Math.min(1, CAM.base * CAM.aspect / 56, CAM.base / 46); }
function camPan(dx, dy) {
  if (G.phase === 'crumble' || G.phase === 'rise' || G.phase === 'clear') return;
  camGrab(); const upp = CAM.base * CAM.aspect / CAM.mzoom / R.dw, se = Math.sin(CAM.elev), sy = Math.sin(CAM.yaw), cy = Math.cos(CAM.yaw), du = dx * upp, dv = -dy * upp;
  CAM.mx = clamp(CAM.mx - cy * du + sy * dv / se, -17, 17); CAM.mz = clamp(CAM.mz + sy * du + cy * dv / se, -17, 17);
}
function camZoomAt(f, px, py) {
  if (G.phase === 'crumble' || G.phase === 'rise' || G.phase === 'clear') return;
  camGrab(); const z0 = CAM.mzoom, z1 = clamp(z0 * f, camZoomMin(), 3), k = 1 - z0 / z1, upp = CAM.base * CAM.aspect / z0 / R.dw;
  const a = (px - R.dw / 2) * upp * k, b = -(py - R.dh / 2) * upp * k / Math.sin(CAM.elev), sy = Math.sin(CAM.yaw), cy = Math.cos(CAM.yaw);
  CAM.mx = clamp(CAM.mx + cy * a - sy * b, -17, 17); CAM.mz = clamp(CAM.mz - sy * a - cy * b, -17, 17); CAM.mzoom = z1;
}
function camReset() { CAM.man = false; CAM.za = null; }
function camZoomTo(z, px, py, rate) { CAM.za = { to: clamp(z, camZoomMin(), 3), px: px === undefined ? R.dw / 2 : px, py: py === undefined ? R.dh / 2 : py, rate }; }
function camZoomNow() { return CAM.za ? CAM.za.to : CAM.man ? CAM.mzoom : CAM.zoom; }
function camZoomBy(f) { camZoomTo(camZoomNow() * f); }


// ===== Vân Đăng · Vòng lặp chính =====
// Trạng thái chạy của ứng dụng (không phải logic trận). 20-post đọc G.phase.
const G = { t: 0, phase: 'play', paused: false, speed: 1, map: null, B: null, sel: null, cursor: null, play: null, last: '' };
// Lưu game (tuần 5, 39-save): G.store = nơi lưu; G.campaign = chiến dịch đang chơi (null khi chạy map thử #map=…).
// G.title = màn chính (Tiếp tục / Chơi mới) đang mở; G.ended = đã xử lý kết thúc trận; G.toast = thông báo ngắn.
Object.assign(G, { store: null, campaign: null, title: null, ended: false, toast: null });
// Chương (tuần 5 mục 4): G.chapter = chương đang chơi (data/chapters.json); G.intro = màn chương { ch, i } (i = câu hội thoại đang hiện);
// G.outro = hội thoại kết sau khi thắng { lines, i }. Luồng: màn chính → màn chương → trận → kết quả (+ hội thoại kết) → lưu → Chương sau.
Object.assign(G, { chapter: null, intro: null, outro: null });

// Tải lại trang để dựng bàn cờ của chương khác (đơn giản và chắc hơn gỡ/dựng lại cảnh three.js). go = vào thẳng trận, bỏ màn chính.
function relaunch(go) { try { location.hash = go ? 'go=1' : ''; location.reload(); } catch (e) {} }
function toast(text) { G.toast = { text, t: 0, dur: 1.8 }; }
// Chơi mới: chiến dịch mới ở chương 1, xoá lưu tạm, lưu ngay (để Tiếp tục được). Có bản lưu cũ thì phải chạm 2 lần.
function newGame(mode) {
  const T = G.title;
  if (T && T.hasSave && T.confirm !== mode) { T.confirm = mode; return true; }
  const C = Save.newCampaign(DATA, { mode, seed: (Date.now() ^ (Math.random() * 4294967296)) >>> 0 });
  G.store.clear('suspend'); const w = G.store.saveChapter(C);
  if (!w.ok) { if (T) T.errors = [w.error]; return false; }
  relaunch(true); return true;
}
// Kết thúc trận (gọi một lần): thắng → ghi chiến dịch sang chương sau + xoá lưu tạm.
function onBattleEnd(over) {
  if (!G.campaign || !over.win) return;
  const C = G.campaign = Save.finishChapter(G.campaign, G.map, DATA);
  G.store.clear('suspend'); const w = G.store.saveChapter(C), next = Save.chapterOf(C, DATA);
  over.saved = w.ok ? (C.done ? 'Đã lưu · Hết chiến dịch · Đèn lồng: ' + Save.lanterns(C) : 'Đã lưu · Tiếp: ' + (next.name || next.id)) : w.error;
  const lines = (G.chapter && G.chapter.outro) || [];
  if (lines.length) G.outro = { lines, i: 0 };
}
// Màn chương → vào trận: băng chữ đầu trận hiện tên chương + mục tiêu.
function startBattle() { G.intro = null; const b = G.play.banner; if (b) b.t = 0; }

// Từ toạ độ màn hình (CSS px) ra ô map: chiếu tia camera xuống mặt phẳng, tinh chỉnh theo độ cao ô.
const _ray = new THREE.Raycaster(), _ndc = new THREE.Vector2(), _pl = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), _hit = new THREE.Vector3();
function pickTile(cssX, cssY) {
  const S = G.map; _ndc.set(cssX / R.cssW * 2 - 1, -(cssY / R.cssH) * 2 + 1); _ray.setFromCamera(_ndc, R.cam);
  let y = 0, p = null;
  for (let i = 0; i < 4; i++) { _pl.constant = -y; if (!_ray.ray.intersectPlane(_pl, _hit)) return null; p = worldTile(S, _hit.x, _hit.z); if (!Core.inside(S, p.x, p.y)) return null; y = standY(S, p.x, p.y); }
  return p;
}
function screenOfTile(x, y) { const w = tileWorld(G.map, x, y), v = new THREE.Vector3(w.x, standY(G.map, x, y), w.z).project(R.cam); return [Math.round((v.x + 1) / 2 * R.cssW), Math.round((1 - v.y) / 2 * R.cssH)]; }
function selectTile(p) { G.sel = p && Core.inside(G.map, p.x, p.y) ? { x: p.x, y: p.y } : null; }
// Một lần chạm vào bàn cờ (p = null: chạm ra ngoài). Luật chọn/đi nằm trong Play (36-play); ở đây chỉ cập nhật con trỏ ô.
function tapTile(p) {
  const P = G.play, ev = G.last = Play.tap(P, p ? p.x : null, p ? p.y : null);
  if (ev === 'chon') selectTile({ x: P.unit.x, y: P.unit.y });
  else if (ev === 'dich' || ev === 'xem' || ev === 'quaduoc' || ev === 'di') selectTile(p);
  else if (ev === 'huy' || ev === 'danh') G.sel = null;
  else if (ev === 'dubao') selectTile(p);
  else if (ev === 'menu') selectTile({ x: P.unit.x, y: P.unit.y });
  return ev;
}
// Nút HUD: Chờ / Hoàn tác / Hết lượt
function hudAction(act) {
  const P = G.play; let ok = false;
  if (G.title) {   // màn chính: chỉ các nút của nó
    if (act === 'tieptuc' && G.title.hasSave) { G.title = null; if (!G.title_resumed && G.chapter) G.intro = { ch: G.chapter, i: 0 }; ok = true; }
    else if (act === 'moi_casual' || act === 'moi_classic') ok = newGame(act === 'moi_casual' ? 'casual' : 'classic');
    G.last = act; return ok;
  }
  if (G.intro) {   // màn chương: Tiếp (câu sau; hết câu thì vào trận) · Vào trận / Bỏ qua
    if (act === 'tiep') { if (++G.intro.i >= (G.intro.ch.intro || []).length) startBattle(); ok = true; }
    else if (act === 'vaotran') { startBattle(); ok = true; }
    G.last = act; return ok;
  }
  if (act === 'tiep_ket' && G.outro) { G.outro.i++; ok = true; }
  else if (act === 'boqua_ket' && G.outro) { G.outro.i = G.outro.lines.length; ok = true; }
  else if (act === 'luutam') { if (G.campaign && Play.canSuspend(P)) { const w = G.store.saveSuspend(G.campaign, P); toast(w.ok ? 'Đã lưu tạm' : w.error); ok = w.ok; } }
  else if (act === 'chuongsau' || act === 'choilai') { if (act === 'choilai') G.store.clear('suspend'); relaunch(true); ok = true; }
  else if (act === 'manchinh') { relaunch(false); ok = true; }
  else if (act === 'cho') { ok = Play.wait(P); if (ok) G.sel = null; }
  else if (act === 'hoantac') { ok = Play.undo(P); if (ok) selectTile({ x: P.unit.x, y: P.unit.y }); }
  else if (act === 'hetluot') { ok = Play.endTurn(P); if (ok) G.sel = null; }
  else if (act === 'danh') ok = Play.attack(P);
  else if (act === 'quaylai') { ok = Play.back(P); if (ok) selectTile({ x: P.unit.x, y: P.unit.y }); }
  else if (act === 'vukhitruoc' || act === 'vukhisau') ok = Play.cycleWeapon(P, act === 'vukhitruoc' ? -1 : 1);
  else if (act === 'xacnhan') { ok = Play.confirm(P); if (ok) G.sel = null; }
  else if (act === 'lencap') ok = Play.dismissLevel(P);
  else if (act === 'tua') { ok = Play.nextSpeed(P); if (ok) saveSpeed(P.ff); }
  G.last = act; return ok;
}

// Tốc độ tua lượt địch là thói quen của người chơi: nhớ qua các trận (localStorage). Công cụ chụp/quay (#manual) luôn bắt đầu x1.
const FF_KEY = 'vandang.ff';
function loadSpeed() { if (HASH.manual) return 1; try { const v = +localStorage.getItem(FF_KEY); return Play.SPEEDS.includes(v) && localStorage.getItem(FF_KEY) !== null ? v : 1; } catch (e) { return 1; } }
function saveSpeed(v) { if (HASH.manual) return; try { localStorage.setItem(FF_KEY, String(v)); } catch (e) {} }
const placeOf = (x, y) => { const w = tileWorld(G.map, x, y); return { x: w.x, y: standY(G.map, x, y), z: w.z }; };

function initInput() {
  const el = R.canvas, pts = new Map(); let drag = 0, pinch = 0;
  el.addEventListener('pointerdown', e => { el.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY }); drag = 0; if (pts.size === 2) pinch = 0; });
  el.addEventListener('pointermove', e => {
    const p = pts.get(e.pointerId); if (!p) return;
    if (pts.size === 1) { const dx = e.clientX - p.x, dy = e.clientY - p.y; if (drag || Math.hypot(e.clientX - p.x0, e.clientY - p.y0) > 8) { drag = 1; camPan(dx * R.dpr, dy * R.dpr); } }
    else if (pts.size === 2) {
      const [a, b] = [...pts.values()], d0 = Math.hypot(a.x - b.x, a.y - b.y); p.x = e.clientX; p.y = e.clientY;
      const d1 = Math.hypot(a.x - b.x, a.y - b.y); if (d0 > 0) camZoomAt(d1 / d0, (a.x + b.x) / 2 * R.dpr, (a.y + b.y) / 2 * R.dpr); pinch = drag = 1; return;
    }
    p.x = e.clientX; p.y = e.clientY;
  });
  const up = e => { const p = pts.get(e.pointerId); if (!p) return; pts.delete(e.pointerId); if (!drag && !pinch && pts.size === 0) { const act = HUD.hit(e.clientX, e.clientY); if (act) hudAction(act); else if (G.intro) hudAction('tiep'); else if (G.outro && G.play.over) hudAction('tiep_ket'); else if (!G.title) tapTile(pickTile(e.clientX, e.clientY)); } if (pts.size === 0) pinch = 0; };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', e => { pts.delete(e.pointerId); drag = 1; });
  el.addEventListener('wheel', e => { e.preventDefault(); camZoomAt(Math.exp(-e.deltaY * .0015), e.clientX * R.dpr, e.clientY * R.dpr); }, { passive: false });
  window.addEventListener('keydown', e => {
    const s = G.sel; let m = null;
    const P = G.play;
    if (G.title) return;
    if (G.intro) { if (e.key === 'Escape') hudAction('vaotran'); else if (e.key === 'Enter' || e.key === ' ') hudAction('tiep'); return; }
    if (P.over) { if (G.outro && (e.key === 'Enter' || e.key === ' ')) hudAction('tiep_ket'); else if (G.outro && e.key === 'Escape') hudAction('boqua_ket'); return; }
    if (P.levelUp) { hudAction('lencap'); return; }
    if (P.mode === 'menu') { if (e.key === 'Enter' || e.key === ' ') hudAction('cho'); else if (e.key === 'Escape' || e.key === 'Backspace') hudAction('hoantac'); else if (e.key === 'x' || e.key === 'X') hudAction('danh'); return; }
    if (P.mode === 'muctieu') { if (e.key === 'Escape' || e.key === 'Backspace') hudAction('quaylai'); else if (P.fc && (e.key === 'Enter' || e.key === ' ')) hudAction('xacnhan'); else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') hudAction(e.key === 'ArrowLeft' ? 'vukhitruoc' : 'vukhisau'); else if (e.key === 'Tab') { e.preventDefault(); const l = P.targets, i = (l.indexOf(P.foe) + 1) % l.length; Play.aim(P, l[i]); selectTile(l[i]); } return; }
    if (e.key === 'Escape') { Play.cancel(P); G.sel = null; }
    else if (e.key === 'e' || e.key === 'E') hudAction('hetluot');
    else if (e.key === 't' || e.key === 'T') hudAction('tua');
    else if (e.key === 'Enter' || e.key === ' ') tapTile(s);
    else if (e.key === 'f' || e.key === 'F' || e.key === '0') camReset();
    else if (e.key === 'ArrowUp' || e.key === 'w') m = [0, -1]; else if (e.key === 'ArrowDown' || e.key === 's') m = [0, 1];
    else if (e.key === 'ArrowLeft' || e.key === 'a') m = [-1, 0]; else if (e.key === 'ArrowRight' || e.key === 'd') m = [1, 0];
    if (m) selectTile(s ? { x: clamp(s.x + m[0], 0, G.map.w - 1), y: clamp(s.y + m[1], 0, G.map.h - 1) } : { x: 0, y: 0 });
  });
}

function step(dt) {
  G.t += dt; SH.uTime.value = G.t;
  beginParts();
  updateFX(dt, G.t);
  if (!G.title && !G.intro) Play.advance(G.play, dt);   // advance = update, trừ khi đang bỏ qua lượt địch
  Anim.sync(G.play, placeOf);   // tua Timeline GSAP tới đồng hồ của Play (54-anim)
  if (G.play.over && !G.ended) { G.ended = true; onBattleEnd(G.play.over); }
  if (G.toast && (G.toast.t += dt) >= G.toast.dur) G.toast = null;
  drawUnits(G.map, G.t, G.play);
  updateOverlay(G.play, G.t);
  const c = G.cursor; if (G.sel) { const w = tileWorld(G.map, G.sel.x, G.sel.y); c.visible = true; c.position.set(w.x, standY(G.map, G.sel.x, G.sel.y) + .04, w.z); c.material.opacity = .6 + .3 * Math.sin(G.t * 5); } else c.visible = false;
  updateBiomeLook(dt);
  updateCamera(dt);
  updateLights(dt, G.t, CAM.x, CAM.z);
  updateTorchLights(dt, UNITS.torch, CAM.x, CAM.z);
  collectMistLights();
  endParts(); endFX();
}

let _last = 0, _acc = 0, _frames = 0, _slow = 0, _fast = 0, _hold = 0, _back = 12;
function frame(now) {
  requestAnimationFrame(frame);
  if (now - _last < 10.5) return;
  const raw = (now - _last) / 1000, rdt = Math.min(.05, Math.max(.001, raw)); _last = now; R.frameDt = rdt;
  if (G.paused) updateCamera(rdt); else for (let i = 0; i < G.speed; i++) step(rdt);
  R.fade = Math.min(1, R.fade + rdt * 1.6);
  applyCamera(); renderFrame(); HUD.draw();
  if (document.hidden || raw > .25) { _acc = 0; _frames = 0; return; }
  _acc += raw; _frames++;
  if (_acc >= 2) { // tự hạ độ phân giải khi máy chậm (giữ từ Cinderwatch)
    const ms = _acc / _frames * 1000;
    R.fpsText = (1000 / ms).toFixed(0) + ' fps  ' + R.iw + 'x' + R.ih + '  calls ' + R.renderer.info.render.calls;
    if (ms > 22.5) { _slow++; _fast = 0; } else { _slow = 0; _fast = ms < 18.6 ? _fast + 1 : 0; }
    _hold -= _acc;
    if (!HASH.noscale) {
      if (_slow >= 2 && R.quality > .55) { R.quality = Math.max(.55, R.quality - .15); resizeRenderer(); _slow = 0; _hold = _back; _back = Math.min(480, _back * 2); }
      else if (_fast >= 3 && R.quality < 1 && _hold <= 0) { R.quality = Math.min(1, R.quality + .15); resizeRenderer(); _fast = 0; }
    }
    _acc = 0; _frames = 0;
  }
}

function boot() {
  if (window.matchMedia && matchMedia('(pointer: coarse)').matches && !HASH.noscale) R.quality = .85;
  R.viewH = 26; R.fitW = 44; R.fitTall = 29; // khung nhìn vừa bàn cờ 12x16
  initRenderer(); initMaterials(); resizeRenderer(); initLights(); initFX(); initWeather(); initKits(); HUD.init();
  // Trận: #map=… chạy map thử như trước (không lưu). Còn lại là chiến dịch: nạp bản lưu (lưu tạm > lưu chương) hoặc dựng chiến dịch mới làm nền màn chính.
  G.store = Save.store(null, DATA);
  let S, seed = +(HASH.seed || 1);
  if (HASH.map) {
    const raw = DATA.maps[HASH.map]; if (!raw) throw new Error('không có map ' + HASH.map);
    S = Core.loadMap(raw, DATA);
  } else if (HASH.ch) {
    // Chạy thẳng một chương (công cụ chụp/thử): chiến dịch mới trong bộ nhớ tạm, không đụng bản lưu thật.
    const i = Save.chapters(DATA).findIndex(c => c.id === HASH.ch); if (i < 0) throw new Error('không có chương ' + HASH.ch);
    G.store = Save.store(Save.memory(), DATA);
    const C = Object.assign(Save.newCampaign(DATA, { seed }), { chapter: i }), st = Save.begin(Save.envChapter(C), DATA);
    G.campaign = C; S = st.S; seed = st.rng; G.chapter = st.chapter;
    if (!HASH.skip) G.intro = { ch: G.chapter, i: 0 };
  } else {
    const r = G.store.resume(), usable = r.ok && !r.done;
    const C = usable ? r.C : Save.newCampaign(DATA), st = usable ? r : Save.begin(Save.envChapter(C), DATA);
    G.campaign = C; S = st.S; seed = st.rng; G.chapter = st.chapter || null; G.title_resumed = !!(usable && r.resumed);
    const errors = r.errors || [];
    G.title = HASH.go && usable ? null : { hasSave: usable, resumed: usable && r.resumed, done: !!(r.ok && r.done), lanterns: r.ok && r.done ? Save.lanterns(r.C) : 0, errors, confirm: null };
    if (!G.title && !G.title_resumed && G.chapter) G.intro = { ch: G.chapter, i: 0 };   // vào chương mới (Chơi mới / Chương sau): màn chương trước
    if (HASH.go) try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
  }
  G.map = S;
  if (HASH.biome) S.biome = HASH.biome;
  const B = G.B = buildGridBoard(S, +(HASH.seed || 1));
  R.scene.add(B.group); activateGridBoard(B);
  G.play = Play.create(S, DATA, seed); Play.setSpeed(G.play, loadSpeed());
  if (S.chapterName) G.play.banner.text = S.chapterName + ' · Lượt ' + S.turn;
  if (S.goal) { G.play.banner.sub = 'Mục tiêu: ' + Core.goalText(S.goal, DATA).win; G.play.banner.dur = 2.6; }
  if (S.mode === 'deadzone') { G.play.banner.sub = 'Vùng Chết · quân ngã sẽ chết vĩnh viễn'; G.play.banner.dur = 2.6; }
  if (G.title || G.intro) G.play.banner.t = 0;
  initUnitViews(S); initOverlay(); G.cursor = makeTileCursor(); initInput();
  window.addEventListener('resize', resizeRenderer);
  window.addEventListener('orientationchange', () => setTimeout(resizeRenderer, 120));
  if (window.visualViewport) window.visualViewport.addEventListener('resize', resizeRenderer);
  R.canvas.addEventListener('webglcontextlost', e => e.preventDefault());
  R.canvas.addEventListener('webglcontextrestored', () => location.reload());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) _last = performance.now(); });
  // Móc cho công cụ (tools/cdp.js, tools/record.js): __vd, giữ tên cũ __cw để công cụ Cinderwatch vẫn chạy.
  window.__vd = window.__cw = { G, R, CAM, LT, FX, Core, Play, Save, OVL, DATA, Anim, step, pickTile, screenOfTile, selectTile, tapTile, hudAction, HUD, tick(dt, render) { R.frameDt = dt; step(dt); R.fade = 1; applyCamera(); if (render) renderFrame(); HUD.draw(); } };
  if (HASH.sel) { const [x, y] = HASH.sel.split(',').map(Number); selectTile({ x, y }); }
  if (HASH.ff) { const n = Math.round(+HASH.ff * 30); for (let i = 0; i < n; i++) step(1 / 30); R.fade = 1; }
  if (HASH.cam) window.__vd.lock = HASH.cam.split(',').map(Number);
  const ld = document.getElementById('load'); if (ld) ld.remove();
  if (HASH.manual) return;
  _last = performance.now();
  requestAnimationFrame(frame);
}
function start() {
  try { boot(); }
  catch (e) { const ld = document.getElementById('load'); if (ld) ld.innerHTML = 'Vân Đăng không khởi động được.<br><small>' + String(e.message || e).replace(/</g, '&lt;') + '</small>'; throw e; }
}
if (HASH.manual || HASH.ff) start(); else requestAnimationFrame(() => setTimeout(start, 0));
