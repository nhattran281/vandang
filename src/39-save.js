// ===== Vân Đăng · Lưu game (GDD 5.4, 2.9, 9; chốt tuần 5) =====
// Logic thuần: không THREE, không DOM. Nơi lưu (localStorage) được truyền vào → test trong Node bằng bộ nhớ giả (Save.memory()).
//
// Trạng thái chiến dịch C (JSON, có số phiên bản):
//   { v, kind:'campaign', mode:'casual'|'classic', seed, chapter (chỉ số chương sắp chơi), done,
//     party: [{ tpl, lv, exp, stats, ranks, wexp, inventory:[{id, uses?}], slot, status:'ok'|'dead' }],
//     convoy: [id món đồ quân ta lấy từ rương], record: [{ chapter, turns, chests, kept, villages }] }
//   Số đèn lồng trận cuối = Save.lanterns(C) = tổng rương + làng giữ được qua các chương (GDD 9).
// Hai ô lưu:
//   'chapter' — lưu sau mỗi chương (và lúc Chơi mới): { v, kind:'chapter', at, campaign }
//   'suspend' — lưu tạm giữa trận, 1 ô: { v, kind:'suspend', at, campaign (lúc vào chương), battle (S đã đóng gói), rng (trạng thái RNG) }
//   Tiếp tục: ưu tiên 'suspend', không có thì 'chapter'. Xong chương hoặc Chơi mới thì xoá 'suspend'.
// Mọi lỗi đọc (thiếu, hỏng, khác phiên bản, dữ liệu lạ) trả { ok:false, code, error } — không ném lỗi ra ngoài.
const Save = (() => {
  const VERSION = 1;
  const KEYS = { chapter: 'vandang.chapter', suspend: 'vandang.suspend' };
  const MODES = ['casual', 'classic'];
  const clone = o => JSON.parse(JSON.stringify(o));
  const chapters = data => (data.campaign && data.campaign.chapters) || [];
  const chapterSeed = (C, i) => ((C.seed >>> 0) + Math.imul(i + 1, 0x9E3779B1)) >>> 0;   // mỗi chương một seed, tất định theo seed chiến dịch

  // Kiểm tra data/campaign.json. Trả về mảng lỗi.
  function validateCampaign(data) {
    const errs = [], L = chapters(data);
    if (!L.length) errs.push('campaign.json: chưa có chương nào');
    const ids = new Set();
    L.forEach((ch, i) => {
      if (!ch.id || ids.has(ch.id)) errs.push(`chương ${i}: thiếu id hoặc trùng id`); ids.add(ch.id);
      if (!data.maps[ch.map]) errs.push(`chương ${ch.id}: không có map '${ch.map}'`);
    });
    return errs;
  }

  // ----- Chiến dịch -----
  function newCampaign(data, opts) {
    opts = opts || {};
    const mode = MODES.includes(opts.mode) ? opts.mode : 'casual';
    return { v: VERSION, kind: 'campaign', mode, seed: (opts.seed != null ? opts.seed : 1) >>> 0, chapter: 0, done: false, party: [], convoy: [], record: [] };
  }
  const chapterOf = (C, data) => chapters(data)[C.chapter] || null;
  const lanterns = C => (C.record || []).reduce((a, r) => a + (r.kept | 0) + (r.villages | 0), 0);

  // Ghi một đơn vị phe ta thành bản ghi đội hình.
  function memberOf(u) {
    const inv = u.inventory || [];
    return { tpl: u.tpl, lv: u.lv, exp: u.exp | 0, stats: Object.assign({}, u.stats), ranks: Object.assign({}, u.ranks), wexp: Object.assign({}, u.wexp),
      inventory: inv.map(w => w.maxUses ? { id: w.id, uses: w.uses } : { id: w.id }), slot: Math.max(0, inv.indexOf(u.weapon)), status: u.dead ? 'dead' : 'ok' };
  }
  // Áp bản ghi đội hình lên đơn vị vừa dựng từ mẫu: cấp, EXP, chỉ số, hạng, túi đồ (độ bền giữ nguyên). HP đầy.
  function applyMember(u, m, data) {
    u.lv = m.lv; u.exp = m.exp | 0; u.stats = Object.assign({}, m.stats); u.hp = u.stats.hp;
    u.ranks = Object.assign({}, m.ranks); u.wexp = Object.assign({}, m.wexp);
    u.inventory = m.inventory.map(it => { const w = Core.makeWeapon(it.id, data); if (w.maxUses && it.uses != null) w.uses = it.uses; return w; });
    const w = u.inventory[m.slot];
    if (w && Core.usable(u, w)) { u.inventory.splice(m.slot, 1); u.inventory.unshift(w); }
    Core.equipFirst(u);
  }

  // Dựng trạng thái trận đầu chương từ chiến dịch. Trả về { S, seed, chapter }.
  // - Quân ta trong roster của map: đã có trong đội thì lấy bản ghi (chết rồi thì không ra trận); chưa có = gia nhập mới.
  // - Đầu chương: HP đầy, tài nguyên kỹ năng đầy, quân rút lui (Casual) quay lại.
  // - Chế độ tử vong của trận: chương Vùng Chết (deadzone: true) → 'deadzone'; còn lại theo chiến dịch.
  function startChapter(C, data) {
    const ch = chapterOf(C, data); if (!ch) throw new Error('chiến dịch đã hết chương');
    const S = Core.loadMap(data.maps[ch.map], data);
    S.mode = ch.deadzone ? 'deadzone' : C.mode; S.win = ch.win || 'rout'; S.chapter = ch.id; S.chapterName = ch.name || ch.id;
    S.units = S.units.filter(u => {
      if (u.side !== 'ta') return true;
      const m = C.party.find(p => p.tpl === u.tpl);
      if (m && m.status === 'dead') return false;
      if (m) applyMember(u, m, data);
      return true;
    });
    for (const u of S.units) { u.hp = u.stats.hp; u.res = Object.assign({}, u.resMax); u.done = false; }
    return { S, seed: chapterSeed(C, C.chapter), chapter: ch };
  }

  // Kết thúc chương (thắng): ghi đội hình, rương giữ được, đồ lấy được → chiến dịch mới (không sửa C).
  // Rương giữ được = rương không bị đạo tặc mang thoát khỏi map. Làng: chưa có cơ chế (tuần 8) → 0.
  function finishChapter(C, S, data) {
    const N = clone(C), ch = chapterOf(C, data);
    for (const u of S.units) {
      if (u.side !== 'ta') continue;
      const m = memberOf(u), i = N.party.findIndex(p => p.tpl === u.tpl);
      if (i >= 0) N.party[i] = m; else N.party.push(m);
      if (!u.dead) for (const it of u.loot || []) N.convoy.push(it);
    }
    const escaped = new Set(S.units.filter(u => u.escaped).map(u => u.uid));
    const stolen = S.chests.filter(c => c.takenBy && c.takenBy.side !== 'ta' && escaped.has(c.takenBy.uid)).length;
    N.record.push({ chapter: ch ? ch.id : S.chapter, turns: S.turn, chests: S.chests.length, kept: S.chests.length - stolen, villages: 0 });
    N.chapter = C.chapter + 1; N.done = N.chapter >= chapters(data).length;
    return N;
  }

  // ----- Đóng gói trạng thái trận -----
  // S gần như là dữ liệu thuần; chỉ u.weapon trỏ vào một món trong u.inventory → ghi thành chỉ số (wslot).
  function packBattle(S) {
    const o = clone(Object.assign({}, S, { units: [] }));
    o.units = S.units.map(u => {
      const inv = u.inventory || [], k = inv.indexOf(u.weapon), x = clone(Object.assign({}, u, { weapon: null }));
      x.wslot = k; if (k < 0 && u.weapon) x.weapon = clone(u.weapon);
      return x;
    });
    return o;
  }
  function unpackBattle(o) {
    const S = clone(o);
    if (!(S && Number.isInteger(S.w) && Number.isInteger(S.h) && Array.isArray(S.tiles) && S.tiles.length === S.w * S.h && Array.isArray(S.units) && Array.isArray(S.chests)))
      throw new Error('trạng thái trận không hợp lệ');
    for (const u of S.units) {
      if (!u || !u.stats || !Array.isArray(u.inventory)) throw new Error('đơn vị không hợp lệ');
      if (u.wslot >= 0) u.weapon = u.inventory[u.wslot] || null;
      delete u.wslot;
    }
    return S;
  }

  // ----- Phong bì + kiểm tra -----
  const envChapter = (C, at) => ({ v: VERSION, kind: 'chapter', at: at || 0, campaign: clone(C) });
  // P: trạng thái Play (36-play). Chỉ lưu tạm khi Play.canSuspend(P).
  const envSuspend = (C, P, at) => ({ v: VERSION, kind: 'suspend', at: at || 0, campaign: clone(C), battle: packBattle(P.S), rng: P.rng.state() });

  function checkCampaign(C, data) {
    if (!C || C.kind !== 'campaign' || !MODES.includes(C.mode) || !Number.isInteger(C.chapter) || C.chapter < 0 || !Array.isArray(C.party) || !Array.isArray(C.convoy) || !Array.isArray(C.record)) return 'trạng thái chiến dịch không hợp lệ';
    if (C.chapter > chapters(data).length) return 'chương không tồn tại';
    for (const m of C.party) {
      if (!m || !data.units.templates[m.tpl] || !m.stats || !Array.isArray(m.inventory)) return 'bản ghi đội hình không hợp lệ';
      for (const it of m.inventory) if (!it || !data.weapons.items[it.id]) return `vũ khí lạ '${it && it.id}'`;
    }
    return null;
  }
  // Chuỗi JSON → phong bì đã kiểm tra. { ok:true, data } | { ok:false, code:'none'|'corrupt'|'version', error }
  function parse(text, kind, data) {
    if (text == null || text === '') return { ok: false, code: 'none', error: 'chưa có bản lưu' };
    let e; try { e = JSON.parse(text); } catch (x) { return { ok: false, code: 'corrupt', error: 'bản lưu hỏng (không đọc được JSON)' }; }
    if (!e || typeof e !== 'object') return { ok: false, code: 'corrupt', error: 'bản lưu hỏng' };
    if (e.v !== VERSION) return { ok: false, code: 'version', error: `bản lưu phiên bản ${e.v}, game cần phiên bản ${VERSION}` };
    if (e.kind !== kind) return { ok: false, code: 'corrupt', error: `bản lưu sai loại (${e.kind})` };
    const bad = checkCampaign(e.campaign, data);
    if (bad) return { ok: false, code: 'corrupt', error: 'bản lưu hỏng: ' + bad };
    if (kind === 'suspend' && !(e.battle && Number.isInteger(e.rng))) return { ok: false, code: 'corrupt', error: 'bản lưu tạm thiếu trạng thái trận' };
    return { ok: true, data: e };
  }

  // Phong bì → trận sẵn sàng chơi: { ok, C, S, rng, chapter, resumed } | { ok:false, code, error }.
  // rng = seed cho Play.create: đầu chương là seed chương; lưu tạm là trạng thái RNG đã lưu (Core.rng(state) chạy tiếp đúng dãy cũ).
  function begin(env, data) {
    try {
      const C = clone(env.campaign);
      if (C.done) return { ok: true, C, done: true };
      if (env.kind === 'suspend') {
        const S = unpackBattle(env.battle);
        for (const u of S.units) if (!data.units.templates[u.tpl]) throw new Error(`mẫu đơn vị lạ '${u.tpl}'`);
        return { ok: true, C, S, rng: env.rng >>> 0, chapter: chapterOf(C, data), resumed: true };
      }
      const r = startChapter(C, data);
      return { ok: true, C, S: r.S, rng: r.seed, chapter: r.chapter, resumed: false };
    } catch (x) { return { ok: false, code: 'corrupt', error: 'bản lưu hỏng: ' + (x.message || x) }; }
  }

  // ----- Nơi lưu -----
  // backend: { getItem, setItem, removeItem } (giao diện localStorage). Lỗi của backend (đầy bộ nhớ, bị chặn) không ném ra ngoài.
  function memory() { const m = new Map(); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); }, _map: m }; }
  function local() {
    try { const ls = typeof localStorage !== 'undefined' ? localStorage : null; if (ls) { ls.setItem('vandang.test', '1'); ls.removeItem('vandang.test'); return ls; } } catch (x) {}
    return memory();   // trình duyệt chặn localStorage (chế độ riêng tư…): vẫn chơi được, chỉ không giữ qua lần tải lại
  }
  function store(backend, data, now) {
    const B = backend || local(), clock = now || (() => Date.now());
    const write = (kind, env) => { try { B.setItem(KEYS[kind], JSON.stringify(env)); return { ok: true }; } catch (x) { return { ok: false, error: 'không ghi được bản lưu: ' + (x.message || x) }; } };
    const read = kind => { let t; try { t = B.getItem(KEYS[kind]); } catch (x) { return { ok: false, code: 'corrupt', error: 'không đọc được bản lưu' }; } return parse(t, kind, data); };
    const clear = kind => { try { B.removeItem(KEYS[kind]); } catch (x) {} };
    return {
      backend: B,
      saveChapter: C => write('chapter', envChapter(C, clock())),
      saveSuspend: (C, P) => write('suspend', envSuspend(C, P, clock())),
      load: read, clear,
      // Bản để Tiếp tục: lưu tạm nếu có và dùng được, không thì lưu chương. errors: các bản lưu có nhưng không dùng được.
      resume() {
        const errors = [];
        for (const kind of ['suspend', 'chapter']) {
          const r = read(kind);
          if (!r.ok) { if (r.code !== 'none') errors.push(r.error); continue; }
          const b = begin(r.data, data);
          if (b.ok) return Object.assign(b, { kind, errors });
          errors.push(b.error);
        }
        return { ok: false, code: errors.length ? 'corrupt' : 'none', errors };
      },
    };
  }

  return { VERSION, KEYS, MODES, validateCampaign, newCampaign, chapterOf, chapterSeed, lanterns, memberOf, applyMember, startChapter, finishChapter, packBattle, unpackBattle, parse, begin, envChapter, envSuspend, memory, local, store };
})();
