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
  if (act === 'cho') { ok = Play.wait(P); if (ok) G.sel = null; }
  else if (act === 'hoantac') { ok = Play.undo(P); if (ok) selectTile({ x: P.unit.x, y: P.unit.y }); }
  else if (act === 'hetluot') { ok = Play.endTurn(P); if (ok) G.sel = null; }
  else if (act === 'danh') ok = Play.attack(P);
  else if (act === 'quaylai') { ok = Play.back(P); if (ok) selectTile({ x: P.unit.x, y: P.unit.y }); }
  else if (act === 'vukhitruoc' || act === 'vukhisau') ok = Play.cycleWeapon(P, act === 'vukhitruoc' ? -1 : 1);
  else if (act === 'xacnhan') { ok = Play.confirm(P); if (ok) G.sel = null; }
  else if (act === 'lencap') ok = Play.dismissLevel(P);
  G.last = act; return ok;
}

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
  const up = e => { const p = pts.get(e.pointerId); if (!p) return; pts.delete(e.pointerId); if (!drag && !pinch && pts.size === 0) { const act = HUD.hit(e.clientX, e.clientY); if (act) hudAction(act); else tapTile(pickTile(e.clientX, e.clientY)); } if (pts.size === 0) pinch = 0; };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', e => { pts.delete(e.pointerId); drag = 1; });
  el.addEventListener('wheel', e => { e.preventDefault(); camZoomAt(Math.exp(-e.deltaY * .0015), e.clientX * R.dpr, e.clientY * R.dpr); }, { passive: false });
  window.addEventListener('keydown', e => {
    const s = G.sel; let m = null;
    const P = G.play;
    if (P.levelUp) { hudAction('lencap'); return; }
    if (P.mode === 'menu') { if (e.key === 'Enter' || e.key === ' ') hudAction('cho'); else if (e.key === 'Escape' || e.key === 'Backspace') hudAction('hoantac'); else if (e.key === 'x' || e.key === 'X') hudAction('danh'); return; }
    if (P.mode === 'muctieu') { if (e.key === 'Escape' || e.key === 'Backspace') hudAction('quaylai'); else if (P.fc && (e.key === 'Enter' || e.key === ' ')) hudAction('xacnhan'); else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') hudAction(e.key === 'ArrowLeft' ? 'vukhitruoc' : 'vukhisau'); else if (e.key === 'Tab') { e.preventDefault(); const l = P.targets, i = (l.indexOf(P.foe) + 1) % l.length; Play.aim(P, l[i]); selectTile(l[i]); } return; }
    if (e.key === 'Escape') { Play.cancel(P); G.sel = null; }
    else if (e.key === 'e' || e.key === 'E') hudAction('hetluot');
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
  Play.update(G.play, dt);
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
  const id = HASH.map || 'thu', raw = DATA.maps[id];
  if (!raw) throw new Error('không có map ' + id);
  const S = G.map = Core.loadMap(raw, DATA);
  if (HASH.biome) S.biome = HASH.biome;
  const B = G.B = buildGridBoard(S, +(HASH.seed || 1));
  R.scene.add(B.group); activateGridBoard(B);
  G.play = Play.create(S, DATA, +(HASH.seed || 1));
  initUnitViews(S); initOverlay(); G.cursor = makeTileCursor(); initInput();
  window.addEventListener('resize', resizeRenderer);
  window.addEventListener('orientationchange', () => setTimeout(resizeRenderer, 120));
  if (window.visualViewport) window.visualViewport.addEventListener('resize', resizeRenderer);
  R.canvas.addEventListener('webglcontextlost', e => e.preventDefault());
  R.canvas.addEventListener('webglcontextrestored', () => location.reload());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) _last = performance.now(); });
  // Móc cho công cụ (tools/cdp.js, tools/record.js): __vd, giữ tên cũ __cw để công cụ Cinderwatch vẫn chạy.
  window.__vd = window.__cw = { G, R, CAM, LT, FX, Core, Play, OVL, DATA, step, pickTile, screenOfTile, selectTile, tapTile, hudAction, HUD, tick(dt, render) { R.frameDt = dt; step(dt); R.fade = 1; applyCamera(); if (render) renderFrame(); HUD.draw(); } };
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
