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
        if (c !== 'C') for (const e of list) { const id = rosterTpl(e); if (!data.units.templates[id]) fail(errs, `roster.${c}: không có mẫu đơn vị '${id}'`); }
      }
    }
    if (m.exits !== undefined) {
      if (!Array.isArray(m.exits)) fail(errs, 'exits phải là mảng [[x,y],...]');
      else m.exits.forEach((e, i) => { if (!Array.isArray(e) || !(e[0] >= 0 && e[0] < w && e[1] >= 0 && e[1] < h)) fail(errs, `exits[${i}] nằm ngoài map`); });
    }
    // decor (chỉ cho phần vẽ): wall = cách vẽ ô vách '#' ('nha' = nhà tranh), boats = ô có thuyền neo.
    if (m.decor !== undefined) {
      const D = m.decor || {};
      if (D.wall !== undefined && !['nha'].includes(D.wall)) fail(errs, `decor.wall lạ '${D.wall}'`);
      (D.boats || []).forEach((e, i) => { if (!Array.isArray(e) || !(e[0] >= 0 && e[0] < w && e[1] >= 0 && e[1] < h)) fail(errs, `decor.boats[${i}] nằm ngoài map`); });
    }
    return errs;
  }
  // Mục roster: chuỗi id mẫu, hoặc { tpl, ai, lv } để gắn hành vi AI riêng (GDD 4; ghi đè ai của mẫu) / đổi cấp (địch tự sinh chỉ số theo cấp, GDD 5.2).
  const rosterTpl = e => typeof e === 'string' ? e : e && e.tpl;

  // ---------- Vũ khí (GDD 2.4, 2.5) ----------
  const RANKS = 'ECAS';                     // E → C → A → S
  const rankIdx = r => RANKS.indexOf(r || 'E');

  // Tạo một bản vũ khí từ data/weapons.json. Mỗi đơn vị giữ bản riêng (độ bền riêng).
  // Khắc chế của loại vũ khí được chép sẵn vào w.effective → Core.forecast không cần đọc DATA.
  function makeWeapon(id, data) {
    const W = data.weapons; if (!W) throw new Error('thiếu data/weapons.json');
    const it = W.items[id]; if (!it) throw new Error('không có vũ khí ' + id);
    const ty = W.types[it.type]; if (!ty) throw new Error(`vũ khí ${id}: loại lạ '${it.type}'`);
    const r = it.range || [1, 1];
    const w = { id, name: it.name, type: it.type, rank: it.rank || 'E', magic: !!ty.magic, mt: it.mt | 0, hit: it.hit | 0, crit: it.crit | 0, wt: it.wt | 0, minRange: r[0], maxRange: r[1] != null ? r[1] : r[0] };
    w.effective = (ty.effective || []).map(k => Object.assign({ id: k }, W.effectiveness[k]));
    if (ty.highGround) w.highGround = ty.highGround | 0;   // cung/nỏ: +tầm khi đứng cao hơn mục tiêu (GDD 3.2)
    if (ty.natural) w.natural = true;                       // vũ khí bẩm sinh của quái
    if (it.uses) { w.uses = it.uses; w.maxUses = it.uses; }   // chỉ vũ khí mạnh có độ bền
    return w;
  }
  // Hạng của đơn vị đủ cầm vũ khí chưa. Vũ khí hạng E ai cũng cầm được.
  const canWield = (u, w) => !!w && rankIdx(w.rank) <= ((u.ranks && u.ranks[w.type]) ? rankIdx(u.ranks[w.type]) : 0);
  const usable = (u, w) => canWield(u, w) && !(w.maxUses && w.uses <= 0);
  // Trang bị cái đầu tiên còn dùng được trong túi (kiểu FE).
  function equipFirst(u) { u.weapon = (u.inventory || []).find(w => usable(u, w)) || null; return u.weapon; }

  // Kiểm tra weapons.json + vũ khí của các mẫu đơn vị. Trả về mảng lỗi.
  function validateWeapons(data) {
    const errs = [], W = data.weapons;
    if (!W) return ['thiếu data/weapons.json'];
    for (const k in W.types) for (const e of W.types[k].effective || []) if (!W.effectiveness[e]) fail(errs, `loại ${k}: không có khắc chế '${e}'`);
    for (const id in W.items) {
      const it = W.items[id];
      if (!W.types[it.type]) fail(errs, `vũ khí ${id}: loại lạ '${it.type}'`);
      if (rankIdx(it.rank) < 0) fail(errs, `vũ khí ${id}: hạng lạ '${it.rank}'`);
      if (it.uses && rankIdx(it.rank) === 0) fail(errs, `vũ khí ${id}: hạng E là vũ khí thường, không có độ bền`);
      if (!Array.isArray(it.range) || it.range[0] < 1 || it.range[1] < it.range[0]) fail(errs, `vũ khí ${id}: range phải là [min, max] với 1 ≤ min ≤ max`);
    }
    for (const t in data.units.templates) {
      const tpl = data.units.templates[t];
      for (const r in tpl.ranks || {}) if (rankIdx(tpl.ranks[r]) < 0) fail(errs, `mẫu ${t}: hạng lạ '${tpl.ranks[r]}'`);
      for (const id of tpl.weapons || []) {
        const it = W.items[id];
        if (!it) { fail(errs, `mẫu ${t}: không có vũ khí '${id}'`); continue; }
        if (!canWield({ ranks: tpl.ranks }, { type: it.type, rank: it.rank })) fail(errs, `mẫu ${t}: hạng chưa đủ cầm '${id}' (cần ${it.rank})`);
      }
    }
    return errs;
  }

  // ---------- Class & chỉ số (GDD 5.2, chốt tuần 5) ----------
  // Nhân vật riêng (mẫu có unique: true — Đăng, Linh, Trấn, sau này boss có tên): base class + base cá nhân (đã tính sẵn cấp gia nhập).
  // Quân thường (địch, NPC, lính) tự sinh theo cấp: + floor((lv − 1) × growth class / 100). Không phụ thuộc phe.
  // Growth khi lên cấp = growth class + growth cá nhân, kẹp ≥ 0 (chỉ quân ta dùng, 39-level.js).
  function classOf(tpl, data) {
    const C = data.classes && data.classes.classes[tpl.class];
    if (!C) throw new Error(`mẫu ${tpl.name}: không có class '${tpl.class}' trong data/classes.json`);
    return C;
  }
  const maxLv = data => (data.classes && data.classes.maxLv) || 20;
  function statsOf(tpl, data, lv) {
    const C = classOf(tpl, data), b = tpl.base || {}, out = {}, auto = !tpl.unique;
    lv = lv || tpl.lv || 1;
    for (const k of STAT_KEYS) out[k] = ((C.base[k] | 0) + (b[k] | 0)) + (auto ? Math.floor((lv - 1) * (C.growth[k] | 0) / 100) : 0);
    return out;
  }
  function growthOf(tpl, data) {
    const C = classOf(tpl, data), g = tpl.growth || {}, out = {};
    for (const k of STAT_KEYS) out[k] = Math.max(0, (C.growth[k] | 0) + (g[k] | 0));
    return out;
  }
  // Điểm kinh nghiệm vũ khí cần cho từng hạng (weapons.json → weaponExp.rank).
  const RANK_EXP_DEF = { E: 0, C: 30, A: 80, S: 150 };
  const rankExp = data => Object.assign({}, RANK_EXP_DEF, ((data.weapons || {}).weaponExp || {}).rank);

  // Kiểm tra classes.json + class/base/growth/cấp của các mẫu đơn vị và lv trong roster các map. Trả về mảng lỗi.
  function validateClasses(data) {
    const errs = [], C = data.classes;
    if (!C) return ['thiếu data/classes.json'];
    const ML = maxLv(data);
    for (const id in C.classes) {
      const c = C.classes[id];
      for (const k of STAT_KEYS) {
        if (!Number.isInteger(c.base && c.base[k])) fail(errs, `class ${id}: thiếu base.${k}`);
        if (!(Number.isInteger(c.growth && c.growth[k]) && c.growth[k] >= 0)) fail(errs, `class ${id}: growth.${k} phải là số nguyên ≥ 0`);
      }
    }
    for (const t in data.units.templates) {
      const tpl = data.units.templates[t];
      if (tpl.stats) fail(errs, `mẫu ${t}: không ghi stats thẳng nữa, dùng class + base`);
      if (!C.classes[tpl.class]) { fail(errs, `mẫu ${t}: class lạ '${tpl.class}'`); continue; }
      for (const f of ['base', 'growth']) for (const k in tpl[f] || {}) if (!STAT_KEYS.includes(k) || !Number.isInteger(tpl[f][k])) fail(errs, `mẫu ${t}: ${f}.${k} lạ`);
      if (!(Number.isInteger(tpl.lv || 1) && (tpl.lv || 1) >= 1 && (tpl.lv || 1) <= ML)) fail(errs, `mẫu ${t}: lv phải là 1–${ML}`);
      const s = statsOf(tpl, data, 1);
      if (s.hp < 1 || STAT_KEYS.some(k => s[k] < 0)) fail(errs, `mẫu ${t}: chỉ số âm hoặc hp < 1`);
    }
    for (const id in data.maps || {}) for (const c in data.maps[id].roster || {}) data.maps[id].roster[c].forEach((e, i) => {
      if (e && typeof e === 'object' && e.lv !== undefined && !(Number.isInteger(e.lv) && e.lv >= 1 && e.lv <= ML)) fail(errs, `map ${id} roster.${c}[${i}]: lv phải là 1–${ML}`);
    });
    return errs;
  }

  // ---------- Mẫu đơn vị: nhãn, loại di chuyển, vũ khí theo class, cơ chế quái, look (chốt tuần 5) ----------
  const TAGS = ['Nguoi', 'Ma', 'Yeu', 'Bay', 'Thuy'];                    // GDD 2.4
  const STATUS_IDS = ['ngu', 'choang', 'me_hoac', 'bong', 'uot', 'troi'];  // GDD 2.7
  // Rig mà 55-units.js vẽ được (giữ khớp với RIGS ở 55-units.js).
  const LOOK_RIGS = ['foot', 'ogre', 'skel', 'golem', 'wraith', 'wolf', 'toad', 'wisp', 'spider', 'bat', 'rat', 'slime'];
  function validateUnits(data) {
    const errs = [], U = data.units, W = data.weapons || { items: {}, types: {} }, C = (data.classes || {}).classes || {};
    const moveTypes = (data.terrain && data.terrain.moveTypes) || [], TT = U.traitTypes || {};
    for (const t in U.templates) {
      const tpl = U.templates[t], p = `mẫu ${t}`, cls = C[tpl.class];
      for (const g of tpl.tags || []) if (!TAGS.includes(g)) fail(errs, `${p}: nhãn lạ '${g}' (${TAGS.join('/')})`);
      if (!(tpl.tags || []).length) fail(errs, `${p}: thiếu tags`);
      if (!moveTypes.includes(tpl.moveType || 'bo')) fail(errs, `${p}: moveType lạ '${tpl.moveType}'`);
      if (cls) {
        const ok = cls.weaponTypes || [];
        for (const id of tpl.weapons || []) { const it = W.items[id]; if (it && !ok.includes(it.type)) fail(errs, `${p}: class ${tpl.class} không cầm được ${it.type} (${id})`); }
        for (const r in tpl.ranks || {}) if (!ok.includes(r)) fail(errs, `${p}: hạng ${r} ngoài weaponTypes của class ${tpl.class}`);
      }
      for (const [i, tr] of (tpl.traits || []).entries()) {
        const q = `${p} traits[${i}]`;
        if (!TT[tr.type] || tr.type === '_doc') { fail(errs, `${q}: loại lạ '${tr.type}'`); continue; }
        if (tr.type === 'tiep_suc') {
          if (!U.templates[tr.to]) fail(errs, `${q}: to '${tr.to}' không phải mẫu đơn vị`);
          if (!tr.stats || !Object.keys(tr.stats).length || Object.entries(tr.stats).some(([k, v]) => !STAT_KEYS.includes(k) || !Number.isInteger(v))) fail(errs, `${q}: stats phải là { chỉ số: số nguyên }`);
        }
        if (tr.type === 'gay_trang_thai') {
          if (!STATUS_IDS.includes(tr.status)) fail(errs, `${q}: trạng thái lạ '${tr.status}'`);
          if (!(Number.isInteger(tr.turns) && tr.turns > 0)) fail(errs, `${q}: turns phải là số nguyên > 0`);
          if (tr.chance !== undefined && !(tr.chance >= 0 && tr.chance <= 100)) fail(errs, `${q}: chance phải là 0–100`);
        }
        if (tr.type === 'keo_nuoc' && tr.dist !== undefined && !(Number.isInteger(tr.dist) && tr.dist > 0)) fail(errs, `${q}: dist phải là số nguyên > 0`);
      }
      const look = tpl.look || {};
      if (!LOOK_RIGS.includes(look.rig || 'foot')) fail(errs, `${p}: look.rig lạ '${look.rig}'`);
      if (look.tint && !(Array.isArray(look.tint) && look.tint.length === 3 && look.tint.every(v => v >= 0 && v <= 2))) fail(errs, `${p}: look.tint phải là [r,g,b]`);
    }
    for (const k in TT) if (k !== '_doc' && TT[k].live !== false && TT[k].live !== true) fail(errs, `traitTypes.${k}: thiếu live`);
    return errs;
  }

  // Tạo một đơn vị từ mẫu. Chỉ số theo class (statsOf); hp hiện tại = hp tối đa. opts.lv ghi đè cấp (roster { tpl, lv }).
  function makeUnit(tplId, data, side, x, y, uid, opts) {
    const tpl = data.units.templates[tplId];
    if (!tpl) throw new Error('không có mẫu đơn vị ' + tplId);
    const lv = Math.min(maxLv(data), (opts && opts.lv) || tpl.lv || 1);
    const stats = statsOf(tpl, data, lv);
    const u = { uid, tpl: tplId, cls: tpl.class, name: tpl.name, title: tpl.title || '', side, x, y, lv, exp: 0, moveType: tpl.moveType || 'bo', tags: (tpl.tags || []).slice(), stats, hp: stats.hp, done: false };
    u.growth = growthOf(tpl, data);
    if (tpl.boss) u.boss = true;
    u.ranks = Object.assign({}, tpl.ranks);
    // Điểm kinh nghiệm vũ khí: bắt đầu bằng mức của hạng hiện có (GDD 2.5).
    const RE = rankExp(data); u.wexp = {}; for (const ty in u.ranks) u.wexp[ty] = RE[u.ranks[ty]] | 0;
    u.inventory = (tpl.weapons || []).map(id => makeWeapon(id, data));
    equipFirst(u);
    // Kỹ năng + tài nguyên mỗi trận (GDD 2.6): resMax lấy từ mẫu, res hồi đầy khi tạo đơn vị / đầu trận.
    u.skills = (tpl.skills || []).slice();
    u.resMax = Object.assign({}, tpl.resources); u.res = Object.assign({}, u.resMax);
    // AI (38-ai.js): hành vi gắn theo đơn vị; home = ô xuất phát (cho Giữ vị trí). moRuong: mở được rương (đạo tặc, Mèo).
    u.ai = Object.assign({}, tpl.ai); u.home = [x, y];
    if (tpl.moRuong) u.moRuong = true;
    if (tpl.traits) u.traits = tpl.traits.map(x => Object.assign({}, x));   // cơ chế riêng của quái (tuần 8)
    return u;
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
    if (m.exits) S.exits = m.exits.map(e => [e[0], e[1]]);
    if (m.decor) S.decor = JSON.parse(JSON.stringify(m.decor));
    if (m.units) {
      const next = { A: 0, E: 0, N: 0, C: 0 }; let uid = 1;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const c = m.units[y][x]; if (c === '.') continue;
        const e = m.roster[c][next[c]++], id = rosterTpl(e), lv = e && typeof e === 'object' ? e.lv : undefined;
        if (c === 'C') S.chests.push({ x, y, item: id, open: false });
        else { const u = makeUnit(id, data, SIDES[c], x, y, uid++, { lv }); if (e && e.ai) Object.assign(u.ai, e.ai); S.units.push(u); }
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

  // ----- Rương & ô thoát (bản tối thiểu, chốt tuần 4) -----
  // Mở rương: hành động thay Đánh, đứng ô kề (Manhattan 1), chỉ đơn vị có moRuong. Không chìa khóa.
  // Rương đã mở vẫn chặn đường. Món đồ chưa vào túi (tuần 5/8): ghi vào chest.takenBy và u.loot.
  function openChest(S, u, x, y) {
    const c = chestAt(S, x, y);
    if (!c) return { ok: false, error: `không có rương ở (${x},${y})` };
    if (c.open) return { ok: false, error: 'rương đã mở' };
    if (!u.moRuong) return { ok: false, error: `${u.name} không mở được rương` };
    if (u.hp <= 0 || Math.abs(u.x - x) + Math.abs(u.y - y) !== 1) return { ok: false, error: 'phải đứng kề rương' };
    c.open = true; c.takenBy = { uid: u.uid, side: u.side };
    (u.loot = u.loot || []).push(c.item);
    return { ok: true, item: c.item, chest: c };
  }
  // Ô thoát: map khai báo exits [[x,y],...]; không khai báo thì mọi ô mép map đều là ô thoát.
  const isExit = (S, x, y) => S.exits ? S.exits.some(e => e[0] === x && e[1] === y) : (inside(S, x, y) && (x === 0 || y === 0 || x === S.w - 1 || y === S.h - 1));
  // Rời map qua ô thoát (đạo tặc mang đồ chạy): u.escaped = true, hp = 0 để mọi chỗ coi như đã rời trận (không phải rút lui / chết).
  function escape(S, u) {
    if (u.hp <= 0 || !isExit(S, u.x, u.y)) return { ok: false, error: 'không đứng ở ô thoát' };
    u.escaped = true; u.hp = 0;
    return { ok: true, loot: (u.loot || []).slice() };
  }

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
  // - Vật trên mặt đất (rương): chặn quân đi đất/bơi; quân bay bay qua được nhưng không đậu xuống.
  //   Mở rương từ ô kề bên.
  // - Không được dừng trên ô có quân khác.
  // opts.mov ghi đè tầm di chuyển (Trói = 0, buff +1...); opts.climbCost ghi đè chi phí leo.
  // Trả về { w, start, cost: Map(idx→chi phí), prev: Map(idx→idx), stops: [idx...] }, idx = y*w+x.
  function reachable(S, u, data, opts) {
    opts = opts || {};
    const mov = opts.mov !== undefined ? opts.mov : u.stats.mov;
    const pass = opts.passSides || [u.side];
    const occ = new Map(), ground = new Set(), flying = u.moveType === 'bay';
    for (const o of S.units) if (o !== u && o.hp > 0) occ.set(o.y * S.w + o.x, o);
    for (const c of S.chests) ground.add(c.y * S.w + c.x);
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
        if (!inside(S, nx, ny) || (ground.has(ni) && !flying)) continue;
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
    const stops = [...cost.keys()].filter(i => i === start || (!occ.has(i) && !ground.has(i))).sort((a, b) => a - b);
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

  // GDD 3.2: cung/nỏ đứng cao hơn mục tiêu → +highGround tầm tối đa. Độ cao không vào công thức sát thương/trúng.
  // u.weapon là món đang tính; ah/bh = độ cao ô của bên đánh / bên bị đánh (thiếu thì không cộng).
  const rangeBonus = (u, ah, bh) => (u && u.weapon && u.weapon.highGround && ah != null && bh != null && ah > bh) ? u.weapon.highGround : 0;
  const heightAt = (S, x, y) => { const t = tile(S, x, y); return t ? t.h : 0; };

  // ---------- Điều kiện thắng / thua theo chương (tuần 5 mục 4) ----------
  // S.goal = { win: [điều kiện…], lose: [điều kiện…] } do Save.startChapter dựng từ data/chapters.json.
  // Thắng khi khớp BẤT KỲ điều kiện thắng nào. Thua: Đăng/Linh ngã (luôn có, GDD 2.9) hoặc khớp một điều kiện thua.
  // Xét thua trước thắng (hạ địch cuối mà Đăng ngã cùng lúc thì vẫn thua).
  //   rout                      hạ hết địch (đã ngã hoặc đã thoát)
  //   reach   { units, tiles? } mọi quân trong units (id mẫu, mặc định ['dang']) có mặt đều đứng trên ô đích. tiles mặc định = exits của map.
  //   boss    { tpl? }          hạ hết địch có boss: true (hoặc mẫu tpl)
  //   area    { rect | tiles }  mọi quân ta còn trên bàn cờ đều đứng trong vùng. rect = [x0,y0,x1,y1] (gồm cả hai mép)
  //   survive { turns }         giữ sống tới hết lượt turns (thắng khi sang lượt turns + 1)
  // Thua thêm: turns { turns } (quá lượt turns chưa thắng) · protect { tpl } (quân tpl ngã).
  // reach / area: lượt ta chỉ tính quân đã xong hành động (u.done) — đứng tạm ở menu, còn Hoàn tác được thì chưa tính.
  const WIN_TYPES = ['rout', 'reach', 'boss', 'area', 'survive'], LOSE_TYPES = ['lord', 'turns', 'protect'];
  const lordOf = u => u.side === 'ta' && !!(Core.isLord && Core.isLord(u));
  // Chuẩn hóa win/lose của chương: chuỗi 'rout' | { type } | mảng → { win: [...], lose: [...] }.
  function normalizeGoal(win, lose) {
    const list = v => (v == null ? [] : Array.isArray(v) ? v : [v]).map(c => typeof c === 'string' ? { type: c } : Object.assign({}, c));
    const w = list(win == null ? 'rout' : win);
    return { win: w, lose: list(lose).filter(c => c.type !== 'lord') };
  }
  const goalOf = S => S.goal || (S.win === 'rout' ? { win: [{ type: 'rout' }], lose: [] } : null);   // lưu tạm cũ chỉ có S.win
  const goalTiles = (S, c) => c.tiles || S.exits || [];
  const inZone = (S, c, x, y) => c.rect ? x >= c.rect[0] && y >= c.rect[1] && x <= c.rect[2] && y <= c.rect[3] : goalTiles(S, c).some(t => t[0] === x && t[1] === y);
  const settled = (S, u) => S.phase !== 'ta' || u.done;
  function goalMet(S, c) {
    const live = S.units.filter(u => u.hp > 0);
    switch (c.type) {
      case 'rout': return !live.some(u => u.side === 'dich');
      case 'reach': {
        const need = live.filter(u => u.side === 'ta' && (c.units || ['dang']).includes(u.tpl));
        return need.length > 0 && need.every(u => settled(S, u) && goalTiles(S, c).some(t => t[0] === u.x && t[1] === u.y));
      }
      case 'boss': {
        const bosses = S.units.filter(u => u.side === 'dich' && (c.tpl ? u.tpl === c.tpl : u.boss));
        return bosses.length > 0 && bosses.every(u => u.hp <= 0);
      }
      case 'area': { const ta = live.filter(u => u.side === 'ta'); return ta.length > 0 && ta.every(u => settled(S, u) && inZone(S, c, u.x, u.y)); }
      case 'survive': return S.turn > c.turns;
    }
    return false;
  }
  // null = trận chưa xong; { win, type, reason, uid? }
  function outcome(S) {
    const G = goalOf(S); if (!G) return null;
    const fell = S.units.find(u => u.hp <= 0 && !u.escaped && lordOf(u));
    if (fell) return { win: false, type: 'lord', uid: fell.uid, reason: fell.name + ' đã ngã' };
    for (const c of G.lose) {
      if (c.type === 'turns' && S.turn > c.turns) return { win: false, type: 'turns', reason: `Quá ${c.turns} lượt` };
      if (c.type === 'protect') { const u = S.units.find(o => o.tpl === c.tpl && o.hp <= 0 && !o.escaped); if (u) return { win: false, type: 'protect', uid: u.uid, reason: u.name + ' đã ngã' }; }
    }
    for (const c of G.win) if (goalMet(S, c)) return { win: true, type: c.type, reason: WIN_REASON[c.type] || 'Đạt mục tiêu' };
    return null;
  }
  const WIN_REASON = { rout: 'Đã hạ hết quân địch', reach: 'Đã tới nơi', boss: 'Đã hạ thủ lĩnh', area: 'Cả đội đã tới nơi', survive: 'Đã cầm cự đủ lượt' };
  // Câu mục tiêu cho người chơi (màn chương, băng chữ đầu trận). data dùng để lấy tên mẫu đơn vị.
  function goalText(goal, data) {
    const nm = id => (data.units.templates[id] || {}).name || id, names = l => l.map(nm).join(' và ');
    const W = { rout: () => 'hạ hết quân địch', reach: c => `đưa ${names(c.units || ['dang'])} tới ô đích`, boss: c => c.tpl ? `hạ ${nm(c.tpl)}` : 'hạ thủ lĩnh địch',
      area: () => 'đưa cả đội tới vùng đích', survive: c => `cầm cự ${c.turns} lượt` };
    const L = { turns: c => `quá ${c.turns} lượt`, protect: c => `${nm(c.tpl)} ngã` };
    const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
    return { win: cap(goal.win.map(c => (c.text || (W[c.type] ? W[c.type](c) : c.type))).join(' hoặc ')),
      lose: cap(['Đăng hoặc Linh ngã'].concat(goal.lose.map(c => c.text || (L[c.type] ? L[c.type](c) : c.type))).join(' · ')) };
  }
  // Kiểm tra điều kiện thắng/thua của một chương trên map m (đã gộp roster). Trả về mảng lỗi.
  function validateGoal(win, lose, m, data, where) {
    const errs = [], G = normalizeGoal(win, lose), h = m.terrain.length, w = m.terrain[0].length;
    const inMap = t => Array.isArray(t) && t[0] >= 0 && t[0] < w && t[1] >= 0 && t[1] < h;
    const rosterIds = c => (((m.roster || {})[c]) || []).map(rosterTpl);
    if (!G.win.length) fail(errs, `${where}: chưa có điều kiện thắng`);
    for (const c of G.win) {
      if (!WIN_TYPES.includes(c.type)) { fail(errs, `${where}: điều kiện thắng lạ '${c.type}' (${WIN_TYPES.join('/')})`); continue; }
      if (c.type === 'reach') {
        const tiles = c.tiles || m.exits;
        if (!Array.isArray(tiles) || !tiles.length) fail(errs, `${where}: reach cần tiles hoặc exits của map`);
        else tiles.forEach((t, i) => { if (!inMap(t)) fail(errs, `${where}: reach ô ${i} nằm ngoài map`); else if (data.terrain.tiles[m.terrain[t[1]][t[0]]].cost.bo === null) fail(errs, `${where}: reach ô (${t}) quân bộ không đứng được`); });
        for (const id of c.units || ['dang']) if (!rosterIds('A').includes(id)) fail(errs, `${where}: reach cần '${id}' nhưng roster A không có`);
      }
      if (c.type === 'boss') {
        const E = rosterIds('E'); if (!E.some(id => c.tpl ? id === c.tpl : (data.units.templates[id] || {}).boss)) fail(errs, `${where}: boss nhưng map không có địch ${c.tpl || 'boss'}`);
      }
      if (c.type === 'area') {
        if (c.rect) { if (!(Array.isArray(c.rect) && c.rect.length === 4 && inMap([c.rect[0], c.rect[1]]) && inMap([c.rect[2], c.rect[3]]) && c.rect[0] <= c.rect[2] && c.rect[1] <= c.rect[3])) fail(errs, `${where}: area.rect phải là [x0,y0,x1,y1] trong map`); }
        else if (!(c.tiles || m.exits || []).length) fail(errs, `${where}: area cần rect, tiles hoặc exits`);
      }
      if (c.type === 'survive' && !(Number.isInteger(c.turns) && c.turns > 0)) fail(errs, `${where}: survive.turns phải là số nguyên > 0`);
    }
    for (const c of G.lose) {
      if (!LOSE_TYPES.includes(c.type)) { fail(errs, `${where}: điều kiện thua lạ '${c.type}' (${LOSE_TYPES.join('/')})`); continue; }
      if (c.type === 'turns' && !(Number.isInteger(c.turns) && c.turns > 0)) fail(errs, `${where}: lose turns phải là số nguyên > 0`);
      if (c.type === 'protect' && !Object.keys(m.roster || {}).some(k => rosterIds(k).includes(c.tpl))) fail(errs, `${where}: protect '${c.tpl}' không có trên map`);
    }
    return errs;
  }

  return { WIN_TYPES, LOSE_TYPES, normalizeGoal, goalTiles, inZone, outcome, goalText, validateGoal, rosterTpl,
    rangeBonus, heightAt, validateUnits, TAGS, STATUS_IDS, LOOK_RIGS, rng, validateMap, loadMap, makeUnit, validateClasses, statsOf, growthOf, classOf, maxLv, rankExp, makeWeapon, canWield, usable, equipFirst, validateWeapons, RANKS, inside, tile, terrainOf, moveCost, unitAt, chestAt, openChest, isExit, escape, toAscii, STAT_KEYS, heightRule, canStep, stepCost, reachable, pathTo, canStopAt };
})();
