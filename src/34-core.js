// ===== Vân Đăng · Logic lõi =====
// Thuần dữ liệu: không dùng THREE, DOM hay biến của phần vẽ, để chạy được trong Node (tools/test_core.js).
// Mọi thứ nằm trong một đối tượng Core để không đụng tên với các module khác khi build nối file.
const Core = (() => {
  const SIDES = { A: 'ta', E: 'dich', N: 'npc' };
  const STAT_KEYS = ['hp', 'str', 'mag', 'skl', 'spd', 'lck', 'def', 'res', 'con', 'mov'];

  // RNG có seed (mulberry32). Trả về hàm () => số trong [0,1); kèm .int(a,b) và .state() để lưu/phát lại.
  function rng(seed) {
    let s = seed >>> 0;
    const f = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    f.int = (a, b) => a + Math.floor(f() * (b - a + 1));
    f.state = () => s;
    return f;
  }

  function fail(errs, msg) { errs.push(msg); }

  // Kiểm tra một map JSON thô. Trả về mảng lỗi (rỗng = hợp lệ).
  function validateMap(m, data) {
    const errs = [], T = data.terrain.tiles;
    if (!Array.isArray(m.terrain) || !m.terrain.length) { fail(errs, 'thiếu lớp terrain'); return errs; }
    const h = m.terrain.length, w = m.terrain[0].length;
    if (w > 16 || h > 20) fail(errs, `map ${w}x${h} vượt tối đa 16x20`);
    const layers = { terrain: m.terrain, height: m.height, units: m.units };
    for (const k in layers) {
      const L = layers[k];
      if (L === undefined && k !== 'terrain') continue;
      if (!Array.isArray(L) || L.length !== h) { fail(errs, `lớp ${k} phải có ${h} dòng`); continue; }
      L.forEach((row, y) => { if (typeof row !== 'string' || row.length !== w) fail(errs, `lớp ${k} dòng ${y} phải dài ${w} ký tự`); });
    }
    m.terrain.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (!T[row[x]]) fail(errs, `ký hiệu địa hình lạ '${row[x]}' tại (${x},${y})`); });
    if (Array.isArray(m.height)) m.height.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (!/[0-3]/.test(row[x])) fail(errs, `độ cao '${row[x]}' tại (${x},${y}) phải là 0–3`); });
    if (Array.isArray(m.units)) {
      const count = {};
      m.units.forEach((row, y) => {
        for (let x = 0; x < row.length; x++) {
          const c = row[x]; if (c === '.') continue;
          if (!'AENC'.includes(c)) { fail(errs, `ký hiệu quân lạ '${c}' tại (${x},${y})`); continue; }
          count[c] = (count[c] || 0) + 1;
          const t = m.terrain[y] && T[m.terrain[y][x]];
          if (t && c !== 'C' && t.cost.bo === null && t.cost.bay === null) fail(errs, `quân '${c}' đứng trên ô không đi được tại (${x},${y})`);
        }
      });
      const R = m.roster || {};
      for (const c of 'AENC') {
        const n = count[c] || 0, list = R[c] || [];
        if (list.length !== n) fail(errs, `roster.${c} có ${list.length} mục nhưng map có ${n} ký hiệu '${c}'`);
        if (c !== 'C') for (const id of list) if (!data.units.templates[id]) fail(errs, `roster.${c}: không có mẫu đơn vị '${id}'`);
      }
    }
    return errs;
  }

  // Tạo một đơn vị từ mẫu. Chỉ số = bản sao stats của mẫu; hp hiện tại = hp tối đa.
  function makeUnit(tplId, data, side, x, y, uid) {
    const tpl = data.units.templates[tplId];
    if (!tpl) throw new Error('không có mẫu đơn vị ' + tplId);
    const stats = {}; for (const k of STAT_KEYS) stats[k] = tpl.stats[k] | 0;
    return { uid, tpl: tplId, name: tpl.name, title: tpl.title || '', side, x, y, lv: tpl.lv || 1, exp: 0, moveType: tpl.moveType || 'bo', tags: (tpl.tags || []).slice(), stats, hp: stats.hp, done: false };
  }

  // Đọc map JSON thành trạng thái trận: lưới ô + danh sách quân + rương.
  function loadMap(m, data) {
    const errs = validateMap(m, data);
    if (errs.length) throw new Error('Map "' + (m.id || '?') + '" lỗi:\n- ' + errs.join('\n- '));
    const T = data.terrain.tiles, h = m.terrain.length, w = m.terrain[0].length;
    const tiles = new Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const c = m.terrain[y][x];
      tiles[y * w + x] = { x, y, c, id: T[c].id, h: m.height ? +m.height[y][x] : 0 };
    }
    const S = { id: m.id, name: m.name || m.id, biome: m.biome || 'ashen', w, h, tiles, units: [], chests: [], turn: 1, phase: 'ta' };
    if (m.units) {
      const next = { A: 0, E: 0, N: 0, C: 0 }; let uid = 1;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const c = m.units[y][x]; if (c === '.') continue;
        const id = m.roster[c][next[c]++];
        if (c === 'C') S.chests.push({ x, y, item: id, open: false });
        else S.units.push(makeUnit(id, data, SIDES[c], x, y, uid++));
      }
    }
    return S;
  }

  const inside = (S, x, y) => x >= 0 && y >= 0 && x < S.w && y < S.h;
  const tile = (S, x, y) => inside(S, x, y) ? S.tiles[y * S.w + x] : null;
  const terrainOf = (S, x, y, data) => { const t = tile(S, x, y); return t ? data.terrain.tiles[t.c] : null; };
  // Chi phí bước vào ô (x,y) với loại quân; null = không vào được.
  function moveCost(S, x, y, moveType, data) { const t = terrainOf(S, x, y, data); if (!t) return null; const c = t.cost[moveType]; return c === undefined ? null : c; }
  const unitAt = (S, x, y) => S.units.find(u => u.x === x && u.y === y && u.hp > 0) || null;
  const chestAt = (S, x, y) => S.chests.find(c => c.x === x && c.y === y) || null;

  // ----- Tìm đường & vùng đi được (GDD 3.1–3.2) -----
  // Luật độ cao lấy từ data.terrain.height; thiếu thì dùng mặc định.
  const HEIGHT_DEF = { cliff: 2, climbCost: 1 };
  const heightRule = data => Object.assign({}, HEIGHT_DEF, data.terrain.height || {});
  const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // thứ tự cố định → kết quả tất định
  const isSlope = (S, x, y, data) => { const t = terrainOf(S, x, y, data); return !!(t && t.flags && t.flags.includes('doc')); };

  // Bước từ ô a sang ô kề b có qua được luật độ cao không. Quân bay bỏ qua.
  // Chênh ≥ cliff (lên lẫn xuống) bị chặn, trừ khi ô đi hoặc ô đến là dốc.
  function canStep(S, ax, ay, bx, by, moveType, data) {
    if (moveType === 'bay') return true;
    const a = tile(S, ax, ay), b = tile(S, bx, by);
    if (!a || !b) return false;
    return Math.abs(b.h - a.h) < heightRule(data).cliff || isSlope(S, ax, ay, data) || isSlope(S, bx, by, data);
  }

  // Chi phí một bước a→b: chi phí địa hình ô b + climbCost × số bậc đi lên. null = không đi được.
  // opts.climbCost ghi đè (để chỉnh theo độ khó).
  function stepCost(S, ax, ay, bx, by, moveType, data, opts) {
    const c = moveCost(S, bx, by, moveType, data);
    if (c === null || !canStep(S, ax, ay, bx, by, moveType, data)) return null;
    if (moveType === 'bay') return c;
    const k = opts && opts.climbCost !== undefined ? opts.climbCost : heightRule(data).climbCost;
    return c + k * Math.max(0, tile(S, bx, by).h - tile(S, ax, ay).h);
  }

  // Vùng đi được của đơn vị u trong tầm Di chuyển (Dijkstra).
  // - Đi xuyên quân cùng phe (opts.passSides, mặc định [u.side]); không xuyên phe khác.
  //   NPC là một phe riêng: ta và địch đều không xuyên qua NPC.
  // - Rương chặn đường với mọi loại quân (mở rương từ ô kề bên).
  // - Không được dừng trên ô có quân khác.
  // opts.mov ghi đè tầm di chuyển (Trói = 0, buff +1...); opts.climbCost ghi đè chi phí leo.
  // Trả về { w, start, cost: Map(idx→chi phí), prev: Map(idx→idx), stops: [idx...] }, idx = y*w+x.
  function reachable(S, u, data, opts) {
    opts = opts || {};
    const mov = opts.mov !== undefined ? opts.mov : u.stats.mov;
    const pass = opts.passSides || [u.side];
    const occ = new Map(), blocked = new Set();
    for (const o of S.units) if (o !== u && o.hp > 0) occ.set(o.y * S.w + o.x, o);
    for (const c of S.chests) blocked.add(c.y * S.w + c.x);
    const start = u.y * S.w + u.x;
    const cost = new Map([[start, 0]]), prev = new Map(), open = [start];
    while (open.length) {
      let bi = 0; // map ≤ 16×20 nên quét mảng là đủ nhanh, không cần heap
      for (let i = 1; i < open.length; i++) {
        const ci = cost.get(open[i]), cb = cost.get(open[bi]);
        if (ci < cb || (ci === cb && open[i] < open[bi])) bi = i;
      }
      const cur = open.splice(bi, 1)[0], cx = cur % S.w, cy = (cur / S.w) | 0, cc = cost.get(cur);
      for (const [dx, dy] of DIRS) {
        const nx = cx + dx, ny = cy + dy, ni = ny * S.w + nx;
        if (!inside(S, nx, ny) || blocked.has(ni)) continue;
        const step = stepCost(S, cx, cy, nx, ny, u.moveType, data, opts);
        if (step === null || cc + step > mov) continue;
        const o = occ.get(ni);
        if (o && !pass.includes(o.side)) continue;
        if (!cost.has(ni) || cc + step < cost.get(ni)) {
          if (!cost.has(ni)) open.push(ni);
          cost.set(ni, cc + step); prev.set(ni, cur);
        }
      }
    }
    const stops = [...cost.keys()].filter(i => i === start || !occ.has(i)).sort((a, b) => a - b);
    return { w: S.w, start, cost, prev, stops };
  }

  // Đường đi [[x,y],...] từ ô xuất phát tới (x,y) theo kết quả reachable; null nếu không tới được.
  function pathTo(R, x, y) {
    let i = y * R.w + x; if (!R.cost.has(i)) return null;
    const out = [[x, y]];
    while (i !== R.start) { i = R.prev.get(i); out.push([i % R.w, (i / R.w) | 0]); }
    return out.reverse();
  }
  const canStopAt = (R, x, y) => R.stops.includes(y * R.w + x);

  // Xuất lại 3 lớp ASCII (để kiểm tra vòng đọc→ghi và để lưu map đã sửa).
  function toAscii(S) {
    const terrain = [], height = [], units = [];
    for (let y = 0; y < S.h; y++) {
      let a = '', b = '', c = '';
      for (let x = 0; x < S.w; x++) {
        const t = tile(S, x, y); a += t.c; b += t.h;
        const u = unitAt(S, x, y), k = chestAt(S, x, y);
        c += u ? ({ ta: 'A', dich: 'E', npc: 'N' })[u.side] : k ? 'C' : '.';
      }
      terrain.push(a); height.push(b); units.push(c);
    }
    return { terrain, height, units };
  }

  return { rng, validateMap, loadMap, makeUnit, inside, tile, terrainOf, moveCost, unitAt, chestAt, toAscii, STAT_KEYS, heightRule, canStep, stepCost, reachable, pathTo, canStopAt };
})();
