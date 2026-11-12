// ==UserScript==
// @name         Pixiv 标签热门排序（桌面+手机）
// @namespace    https://github.com/galen-wang/pixiv-tag-sort
// @version      1.12.0
// @description  在 Pixiv 标签页批量读取作品收藏数并按热度排序，边扫描边显示。支持桌面与手机（Tampermonkey / iOS Userscripts）。
// @match        https://www.pixiv.net/tags/*
// @match        https://www.pixiv.net/*/tags/*
// @match        https://www.pixiv.net/search.php*
// @match        https://www.pixiv.net/*/search.php*
// @match        https://www.pixiv.net/search*
// @match        https://www.pixiv.net/*/search*
// @match        https://touch.pixiv.net/*
// @match        https://m.pixiv.net/*
// @run-at       document-idle
// @updateURL   https://raw.githubusercontent.com/qq749937207-ux/pixiv-tag-sort/main/pixiv-tag-sort.user.js
// @downloadURL https://raw.githubusercontent.com/qq749937207-ux/pixiv-tag-sort/main/pixiv-tag-sort.user.js
// @grant        GM_xmlhttpRequest
// @grant        GM.xmlHttpRequest
// @connect      i.pximg.net
// @connect      pximg.net
// @noframes
// ==/UserScript==
(function () {
  'use strict';
  if (window.__pxSortLoaded1120) return; window.__pxSortLoaded1120 = true;
  function whenBody(fn) {
    if (document.body) return fn();
    var t = setInterval(function () { if (document.body) { clearInterval(t); fn(); } }, 50);
  }
  whenBody(function () {
    try { main(); }
    catch (err) {
      console.error('[pxsort] init failed', err);
      var b = document.getElementById('pxs-btn') || document.createElement('button');
      b.id = 'pxs-btn'; b.textContent = '★!';
      b.setAttribute('style', 'position:fixed;right:12px;bottom:72px;z-index:2147483647;width:50px;height:50px;border-radius:50%;border:0;background:#c00;color:#fff;font-size:18px');
      b.onclick = function () { alert('Pixiv 热门排序 初始化失败：' + (err && err.message)); };
      document.body.appendChild(b);
    }
  });
  function main() {
  var API = location.hostname === 'www.pixiv.net' ? '' : 'https://www.pixiv.net';
  var LS = 'pxsort_cfg', LSC = 'pxsort_cache_v1';
  var TTL = 7 * 24 * 3600e3, CACHE_MAX = 30000, PER_PAGE = 60;
  var MAX_SERVER_EXCL = 10, MAX_WORD_LEN = 200, BLK = 'pxsort_block', PRE = 'pxsort_presets';
  // 屏蔽预设：只用 pixiv 上实际使用的标签写法（日文/英文），2026-10 用 pixiv 标签接口与 pixiv百科 核对过。默认全部关闭，可在面板中编辑。
  // 搜索预选：中文仅作按钮文案，加入搜索框的是 pixiv 站内量大的日文/英文写法（2026-11 对照年榜与精确标签计数）。
  var QUICK_TAGS = [
    ['百合', '百合'],
    ['巨乳', '巨乳'],
    ['贫乳', '貧乳'],
    ['黑裤袜', '黒タイツ'],
    ['拘束', '拘束'],
    ['大腿', '魅惑のふともも'],
    ['穿袜足底', 'ソックス足裏'],
    ['SM', 'SM']
  ];
  var BLOCK_GROUPS = [
    ['futa', '扶他', ['ふたなり', 'フタナリ', 'futanari', 'futa', 'ふたなり化']],
    ['bl', '男同 / BL', ['BL', '腐向け', '創作BL', 'ボーイズラブ', 'ホモ', 'ゲイ', 'yaoi', 'gay', 'bara']],
    ['yuri', '百合', ['百合', 'GL', 'レズ', 'ガールズラブ', 'yuri', 'lesbian']],
    ['guro', '猎奇 / 重口', ['リョナ', 'ryona', 'グロ', 'guro', 'gore', 'R-18G', '猟奇', '異種姦', '触手', '脳姦', '欠損', '四肢切断', '丸呑み', 'カニバリズム']],
    ['scat', '排泄', ['スカトロ', 'scat', '放尿', '脱糞', '食糞', 'おもらし']],
    ['body', '肥满 / 人体改造', ['肥満化', '膨体', '人体改造']],
    ['ntr', 'NTR', ['NTR', '寝取られ', '寝取り', '寝取らせ', 'netorare']],
    ['ai', 'AI 生成', ['AI生成', 'AI-generated', 'AIgenerated', 'AIイラスト', 'AIart', 'NovelAI', 'StableDiffusion']]
  ];
  var BL = Object.assign({ tags: [], users: [], hideAI: false, partial: false, must: [], groups: {} }, safeJ(BLK, {}));
  if (!BL.groups || typeof BL.groups !== 'object') BL.groups = {};
  function grpTags(id) { var g = BL.groups[id], d = BLOCK_GROUPS.filter(function (x) { return x[0] === id; })[0]; return g && Array.isArray(g.tags) ? g.tags : d ? d[2] : []; }
  function grpOn(id) { return !!(BL.groups[id] && BL.groups[id].on); }
  function effTags() { var t = BL.tags.slice(); BLOCK_GROUPS.forEach(function (g) { if (grpOn(g[0])) t = t.concat(grpTags(g[0])); }); return t; }
  var BURST_COUNT = 100;             // 爆发档：前 BURST_COUNT 个请求约 200次/分，之后 60
  var SPIKE_SIZE = 10, SPIKE_WINDOW_MS = 900;   // 瞬时爆发（测试）：开始查收藏数时 ≤1 秒内并发 SPIKE_SIZE 个，之后 60次/分
  var PAGE_SIZE = 60;                // 桌面版每页 60；手机 UA 下 Pixiv 每页只给约 36，会自动多翻页补足
  var UG_NAMES = { webm: 'WebM', gif: 'GIF，较慢、文件大', zip: '原始帧 ZIP' };
  var cfg = Object.assign({ pages: 5, minBm: 100, mode: 'page', strategy: 'premium', yearPages: 2, rpm: 60, testMode: false, protect: true, sort: 'bm', hideR18: false, maxBm: 0, fMin: 0, fMax: 0 }, safeParse(localStorage.getItem(LS)));
  if (!cfg.v140) { cfg.v140 = 1; cfg.strategy = 'premium'; cfg.rpm = 40; try { localStorage.setItem(LS, JSON.stringify(cfg)); } catch (e) { } }
  if (!cfg.v150 && (cfg.v140 || cfg.v141 || cfg.v142)) {
    // 1.5.0: official presets 40/60/80/快速启动; everything else (and the old default 40) -> 60
    var fast = cfg.burst === 'n' && cfg.bRate === 200 && cfg.bN === 50 && cfg.rpm === 60;
    if (!fast && (cfg.burst || cfg.rand || +cfg.rpm !== 80)) { cfg.burst = false; cfg.rand = false; cfg.rpm = 60; }
    cfg.testMode = false;
  }
  if (!cfg.v160) { if (cfg.v150 && +cfg.rpm === 40 && !cfg.burst && !cfg.rand) cfg.rpm = 60; cfg.v160 = 1; if (cfg.protect == null) cfg.protect = true; try { localStorage.setItem(LS, JSON.stringify(cfg)); } catch (e) { } }
  if (!cfg.v191) { if (cfg.burst === 'n' && cfg.bRate === 200 && cfg.bN === 50 && +cfg.rpm === 60) cfg.bN = BURST_COUNT; cfg.v191 = 1; try { localStorage.setItem(LS, JSON.stringify(cfg)); } catch (e) { } }
  if (!cfg.v1120) {
    cfg.v1120 = 1; cfg.testMode = false;
    var official = (!cfg.burst && !cfg.rand && (+cfg.rpm === 60 || +cfg.rpm === 80)) || (cfg.burst === 'n' && cfg.bRate === 200 && cfg.bN === BURST_COUNT && +cfg.rpm === 60);
    if (!official) { cfg.burst = false; cfg.rand = false; cfg.rpm = 60; }
    try { localStorage.setItem(LS, JSON.stringify(cfg)); } catch (e) { }
  }
  if (!cfg.v150) { cfg.v150 = cfg.v142 = cfg.v141 = cfg.v140 = 1; try { localStorage.setItem(LS, JSON.stringify(cfg)); } catch (e) { } }
  if (!cfg.v142) { cfg.v142 = 1; cfg.rpm = +cfg.rpm >= 120 ? 120 : (+cfg.rpm <= 40 || !cfg.rpm) ? 40 : [40, 60, 80, 100].reduce(function (a, b) { return Math.abs(b - cfg.rpm) < Math.abs(a - cfg.rpm) ? b : a; }); cfg.v141 = 1; try { localStorage.setItem(LS, JSON.stringify(cfg)); } catch (e) { } }
  if (!cfg.v141) { cfg.v141 = 1; if (!cfg.rpm || cfg.rpm <= 20) cfg.rpm = 40; try { localStorage.setItem(LS, JSON.stringify(cfg)); } catch (e) { } }
  function safeParse(t) { try { var o = JSON.parse(t || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } }
  var running = false, stop = false;
  var state = { tag: '', items: [], scanned: 0, total: 0, page: 1 };

  /* ---------- cache (IndexedDB; never in localStorage) ---------- */
  try { Object.keys(localStorage).forEach(function (k) { if (/^pxsort_cache/.test(k)) localStorage.removeItem(k); }); } catch (e) { }
  var cache = {}, dirty = {}, cacheN = 0, db = null, dbp = null, busy = false, gen = 0, dropped = [], ready = false;
  function idb() {
    if (db) return Promise.resolve(db);
    if (dbp) return dbp;
    var p = new Promise(function (res, rej) {
      var rq;
      try { rq = indexedDB.open('pxsort', 1); }
      catch (e) { rej(e); return; }
      rq.onupgradeneeded = function () { rq.result.createObjectStore('bm'); };
      rq.onsuccess = function () { db = rq.result; res(db); };
      rq.onerror = function () { rej(rq.error || new Error('idb')); };
    });
    dbp = p;
    p.then(function () { if (dbp === p) dbp = null; }, function () { if (dbp === p) dbp = null; });
    return p;
  }
  idb().then(function (d) {
    try {
      var now = Date.now(), os = d.transaction('bm', 'readwrite').objectStore('bm'), cur = os.openCursor();
      cur.onsuccess = function () {
        var c = cur.result;
        if (!c) { ready = true; cacheSave(); return; }
        if (now - c.value.t > TTL) c.delete(); else if (!cache[c.key]) { cache[c.key] = c.value; cacheN++; }
        c.continue();
      };
      cur.onerror = function () { ready = true; };
    } catch (e) { ready = true; }
  }, function () { ready = true; });
  function cacheGet(id) { var c = cache[id]; return c && Date.now() - c.t < TTL ? c : null; }
  function cachePut(id, v) { v.t = Date.now(); if (!cache[id]) cacheN++; cache[id] = v; dirty[id] = v; }
  // Once past CACHE_MAX, drop expired then oldest down to CACHE_MAX-1000 so a full sort is not repeated on every save.
  function evictKeys() {
    if (cacheN <= CACHE_MAX) return [];
    var now = Date.now(), drop = [], fresh = [], keep = CACHE_MAX - 1000;
    Object.keys(cache).forEach(function (k) {
      var c = cache[k];
      if (!c || now - c.t > TTL) drop.push(k); else fresh.push(k);
    });
    if (fresh.length > CACHE_MAX) {
      fresh.sort(function (a, b) { return cache[a].t - cache[b].t; });
      drop = drop.concat(fresh.splice(0, fresh.length - keep));
    }
    drop.forEach(function (k) { delete cache[k]; delete dirty[k]; });
    cacheN = fresh.length;
    return drop;
  }
  function cacheSave() {
    if (busy) return;
    busy = true;
    var drop = ready ? evictKeys() : [], ks, batch = {}, del, snap;
    if (drop.length) dropped = dropped.concat(drop);
    dropped = dropped.filter(function (k) { return !cache[k]; });
    ks = Object.keys(dirty);
    ks.forEach(function (k) { batch[k] = dirty[k]; });
    if (!ks.length && !dropped.length) { busy = false; return; }
    del = dropped.slice(); snap = gen;
    idb().then(function (d) {
      if (snap !== gen) return false;
      return new Promise(function (res, rej) {
        var tx, done = false;
        try { tx = d.transaction('bm', 'readwrite'); }
        catch (e) { rej(e); return; }
        try {
          var os = tx.objectStore('bm');
          ks.forEach(function (k) { if (dirty[k] === batch[k]) os.put(batch[k], k); });
          del.forEach(function (k) { if (!cache[k]) os.delete(k); });
        } catch (e) { if (!done) { done = true; try { tx.abort(); } catch (e2) {} rej(e); } return; }
        tx.oncomplete = function () { if (!done) { done = true; res(true); } };
        tx.onabort = function () { if (!done) { done = true; rej(tx.error || new Error('idb')); } };
      });
    }).then(function (ok) {
      if (ok && snap === gen) {
        ks.forEach(function (k) { if (dirty[k] === batch[k]) delete dirty[k]; });
        var gone = {};
        del.forEach(function (k) { if (!cache[k]) gone[k] = 1; });
        dropped = dropped.filter(function (k) { return !gone[k]; });
      }
      busy = false;
      if (ok && snap === gen && (Object.keys(dirty).length || dropped.length || (ready && cacheN > CACHE_MAX))) cacheSave();
    }, function () { busy = false; });
  }
  function cacheClear() {
    cache = {}; dirty = {}; cacheN = 0; dropped = []; gen++;
    var snap = gen;
    idb().then(function (d) {
      if (snap !== gen) return;
      try { d.transaction('bm', 'readwrite').objectStore('bm').clear(); } catch (e) {}
    }, function () {});
  }
  setInterval(cacheSave, 3000);

  function getTag() {
    var u = new URL(location.href), m = u.pathname.match(/\/tags\/([^/]+)/);
    if (m) return decodeURIComponent(m[1]);
    if (/\/search(\.php)?(\/|$)/.test(u.pathname)) return u.searchParams.get('q') || u.searchParams.get('word') || u.searchParams.get('s_tag') || '';
    return '';
  }

  /* ---------- styles ---------- */
  var X_SVG = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M6 6L18 18M18 6L6 18" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/></svg>';
  var HEART = '<svg viewBox="0 0 24 24" width="13" height="13"><path fill="#ff4060" d="M12 21s-7.5-4.6-9.5-9.2C1 8.3 3.3 5 6.6 5c2 0 3.4 1.1 4.2 2.3h2.4C14 6.1 15.4 5 17.4 5 20.7 5 23 8.3 21.5 11.8 19.5 16.4 12 21 12 21z"/></svg>';
  var LIKE = '<svg viewBox="0 0 24 24" width="13" height="13"><path fill="#4cb7ff" d="M2 10h4v11H2zM8 21h9.5a2 2 0 0 0 2-1.6l1.4-7A2 2 0 0 0 19 10h-5l.8-4.2A2 2 0 0 0 12.9 3L8 9z"/></svg>';
  var PAGES = '<svg viewBox="0 0 24 24" width="12" height="12"><path fill="#fff" d="M8 3h12v14H8zM4 7h2v12h12v2H4z"/></svg>';
  var css = '\
#pxs-btn{position:fixed;right:12px;bottom:72px;z-index:2147483646;width:50px;height:50px;border-radius:50%;border:0;background:#0096fa;color:#fff;font-size:22px;box-shadow:0 2px 10px rgba(0,0,0,.4);touch-action:manipulation;display:flex;align-items:center;justify-content:center}\
#pxs-btn .dot{position:absolute;top:2px;right:2px;width:12px;height:12px;border-radius:50%;background:#ff4060;display:none}#pxs-btn.busy .dot{display:block}\
#pxs-panel{position:fixed;right:12px;right:max(12px,env(safe-area-inset-right));bottom:132px;z-index:2147483647;background:#1f1f1f;color:#eee;border-radius:14px;padding:0;width:min(320px,calc(100vw - 24px));box-shadow:0 6px 24px rgba(0,0,0,.5);font:14px/1.4 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif;display:none;flex-direction:column;box-sizing:border-box;overflow:hidden;max-height:calc(100vh - 148px);max-height:calc(100dvh - 140px - env(safe-area-inset-top))}\
@media (max-height:640px){#pxs-panel{bottom:8px;bottom:max(8px,env(safe-area-inset-bottom));max-height:calc(100vh - 16px);max-height:calc(100dvh - 16px - env(safe-area-inset-top) - env(safe-area-inset-bottom))}}\
#pxs-panel.pxs-hide{visibility:hidden}\
#pxs-ph{display:flex;align-items:center;justify-content:space-between;padding:10px 10px 8px 14px;border-bottom:1px solid #333;flex:0 0 auto;background:#1f1f1f}\
#pxs-ph h3{margin:0!important}#pxs-pclose{width:36px;height:36px;border:0;border-radius:50%;background:#333;color:#fff;display:flex;align-items:center;justify-content:center;padding:0}#pxs-pclose svg{width:18px;height:18px}\
#pxs-pb{flex:1 1 auto;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;padding:4px 14px 8px;min-height:60px}\
#pxs-pf{flex:0 0 auto;padding:4px 14px 12px;border-top:1px solid #333;background:#1f1f1f}#pxs-pf .pxs-row{margin-top:6px}#pxs-pf #pxs-status{margin-top:6px;max-height:4.2em;overflow-y:auto}\
.pxs-sec{border-bottom:1px solid #2c2c2c;padding:2px 0}.pxs-sec>summary{cursor:pointer;padding:10px 0;font-weight:600;color:#ddd;list-style-position:inside}\
.pxs-sub{margin:0 0 8px;border:1px solid #333;border-radius:10px;background:#181818;padding:0 10px;overflow:hidden}\
.pxs-sub>summary{cursor:pointer;padding:8px 0;font-weight:600;font-size:13px;color:#bbb;list-style-position:inside}\
.pxs-qchips{display:flex;flex-wrap:wrap;gap:6px;padding:0 0 10px}\
.pxs-qchip{border:0;background:#2a2a2a;color:#ddd;border-radius:16px;padding:5px 10px;font-size:12px;min-height:30px;cursor:pointer;line-height:1.15;font-family:inherit}\
.pxs-qchip.on{background:#0096fa;color:#fff}.pxs-qchip:active{transform:scale(.97)}\
.pxs-grp{display:flex;align-items:center;gap:6px;margin:4px 0}.pxs-grp label{flex:1;margin:0!important;justify-content:flex-start!important;gap:6px;font-size:13px}.pxs-grp input{width:auto!important}\
.pxs-gx{font-size:12px;color:#aaa;margin:0 0 8px 24px}.pxs-gx textarea{width:100%;height:84px;box-sizing:border-box;background:#111;color:#ddd;border:1px solid #444;border-radius:8px;font:12px monospace}\
.pxs-sheet{position:fixed;top:0;left:0;right:0;bottom:0;z-index:2147483647;background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center;padding:12px;padding:max(12px,env(safe-area-inset-top)) 12px max(12px,env(safe-area-inset-bottom))}\
.pxs-sheet>div{background:#1f1f1f;color:#eee;border-radius:12px;padding:12px;width:min(640px,100%);max-height:100%;overflow-y:auto;-webkit-overflow-scrolling:touch;box-sizing:border-box;font:13px sans-serif}\
#pxs-panel.open{display:flex}#pxs-panel h3{margin:0 0 8px;font-size:16px}\
#pxs-panel label{display:flex;justify-content:space-between;align-items:center;margin:8px 0;gap:8px}\
#pxs-panel input,#pxs-panel select{font-size:16px;padding:6px 8px;width:120px;box-sizing:border-box;background:#2c2c2c;color:#eee;border:1px solid #444;border-radius:8px}\
.pxs-row{display:flex;gap:8px;margin-top:10px}.pxs-row button{flex:1;font-size:15px;min-height:44px;border:0;border-radius:10px;background:#0096fa;color:#fff}\
.pxs-row button.sec{background:#3a3a3a}\
#pxs-status{font-size:12px;color:#aaa;margin-top:8px;word-break:break-all}\
#pxs-ov{position:fixed;top:0;right:0;bottom:0;left:0;z-index:2147483647;background:#121212;color:#eee;overflow-y:auto;-webkit-overflow-scrolling:touch;display:none;font:14px/1.4 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif;overscroll-behavior:contain}\
#pxs-ov.open{display:block}\
#pxs-head{position:sticky;top:0;z-index:50;background:rgba(24,24,24,.97);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border-bottom:1px solid #2a2a2a;padding:10px 12px 0}\
.pxs-hrow{display:flex;align-items:center;gap:10px}\
#pxs-htag{font-size:17px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0}\
#pxs-hsub{font-size:12px;color:#999;margin-top:2px}\
#pxs-close{flex:none;width:40px;height:40px;border-radius:50%;border:0;background:#333;display:flex;align-items:center;justify-content:center;padding:0;cursor:pointer}\
#pxs-close:active{background:#555}\
#pxs-bar{height:3px;background:#2a2a2a;margin:8px -12px 0;overflow:hidden}#pxs-bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,#0096fa,#4cb7ff);transition:width .3s}\
#pxs-tools{display:flex;flex-wrap:wrap;gap:6px;padding:8px 0;align-items:center}\
.pxs-seg{display:flex;background:#262626;border-radius:9px;padding:2px}\
.pxs-seg button,.pxs-chip,.pxs-tog{border:0;background:transparent;color:#bbb;font-size:13px;padding:6px 10px;border-radius:7px;min-height:32px;cursor:pointer}\
.pxs-seg button.on{background:#0096fa;color:#fff}\
.pxs-num{width:68px;height:32px;box-sizing:border-box;background:#262626;color:#eee;border:1px solid #3a3a3a;border-radius:8px;padding:0 6px;font-size:14px}\
.pxs-chip{background:#262626;border-radius:16px}.pxs-chip.on{background:#fff;color:#111}\
.pxs-tog{background:#262626;border-radius:16px}.pxs-tog.on{background:#ff4060;color:#fff}\
.pxs-sep{width:1px;height:20px;background:#333;margin:0 2px}\
#pxs-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:12px;padding:12px}\
@media (max-width:760px){#pxs-grid{grid-template-columns:repeat(3,1fr);gap:8px;padding:8px}}\
@media (max-width:520px){#pxs-grid{grid-template-columns:repeat(2,1fr)}}\
.pxs-card{position:relative;isolation:isolate;z-index:0;background:#1e1e1e;border-radius:12px;overflow:hidden;color:#eee;text-decoration:none;display:block;transition:transform .15s;-webkit-tap-highlight-color:transparent}\
.pxs-card:active{transform:scale(.97)}\
.pxs-tags{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;max-height:44px;overflow:hidden}\
.pxs-tag{font-size:11px;background:#2c2c2c;color:#9ad;border-radius:6px;padding:2px 6px;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer}\
.pxs-more{float:right;border:0;background:#333;color:#ddd;border-radius:6px;min-width:30px;height:24px;font-size:14px;line-height:1;cursor:pointer}\
#pxs-menu{position:fixed;z-index:2147483647;background:#262626;color:#eee;border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.6);padding:4px;min-width:180px;max-width:calc(100vw - 16px);max-height:60vh;overflow:auto;font:14px sans-serif}\
#pxs-menu button{display:block;width:100%;text-align:left;border:0;background:none;color:#eee;padding:10px 12px;border-radius:8px;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\
#pxs-menu button:active,#pxs-menu button:hover{background:#3a3a3a}\
.pxs-mini{flex:1;min-height:34px;border:0;border-radius:8px;background:#2c2c2c;color:#ccc;font-size:13px}\
.pxs-chk{justify-content:flex-start!important;gap:6px;font-size:12px;color:#aaa}\
.pxs-chk input{width:auto!important}\
.pxs-th{position:relative;padding-top:100%;height:0;background:linear-gradient(110deg,#262626 30%,#323232 50%,#262626 70%);background-size:200% 100%;animation:pxsh 1.4s linear infinite}\
@keyframes pxsh{to{background-position:-200% 0}}\
.pxs-th img{position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;display:block;opacity:0;transition:opacity .3s}.pxs-th img.ld{opacity:1}\
.pxs-rk{position:absolute;top:6px;left:6px;min-width:26px;height:22px;padding:0 6px;border-radius:11px;background:rgba(0,0,0,.65);color:#fff;font:700 12px/22px sans-serif;text-align:center;box-sizing:border-box}\
.pxs-rk.g{background:#e8b600;color:#222}.pxs-rk.s{background:#b8c2cc;color:#222}.pxs-rk.b{background:#c87533}\
.pxs-tr{position:absolute;top:6px;right:6px;display:flex;gap:4px}\
.pxs-ck{display:none;position:absolute;top:6px;left:6px;width:26px;height:26px;border-radius:50%;border:2px solid #fff;background:rgba(0,0,0,.45);box-sizing:border-box;z-index:1;pointer-events:none}\
.pxs-selmode .pxs-ck{display:block}.pxs-selmode.sel .pxs-ck{background:#0096fa;border-color:#0096fa}.pxs-selmode.sel .pxs-ck:after{content:"";position:absolute;left:7px;top:3px;width:6px;height:11px;border:solid #fff;border-width:0 2px 2px 0;transform:rotate(45deg)}\
.pxs-selmode.sel{outline:3px solid #0096fa;outline-offset:-3px}.pxs-selmode .pxs-rk{left:38px}\
#pxs-batbar{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:6px 12px;background:#161616;border-bottom:1px solid #2a2a2a;font-size:13px;color:#ccc}\
#pxs-batbar .pxs-bfirst{display:flex;align-items:center;gap:4px}#pxs-batbar .pxs-bfirst input{width:auto}#pxs-bprog{flex-basis:100%;font-size:12px;color:#9ad}#pxs-batbar .pxs-bgo{background:#0096fa;color:#fff}\
.pxs-dlb{position:absolute;bottom:6px;right:6px;width:32px;height:32px;border:0;border-radius:50%;background:rgba(0,0,0,.6);color:#fff;font-size:16px;line-height:32px;padding:0;cursor:pointer}\
.pxs-dlp{position:absolute;left:6px;bottom:6px;right:44px;background:rgba(0,0,0,.7);color:#fff;font-size:11px;border-radius:6px;padding:3px 6px;display:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\
.pxs-bd{height:20px;padding:0 6px;border-radius:10px;font:700 11px/20px sans-serif;color:#fff;background:rgba(0,0,0,.65);display:flex;align-items:center;gap:3px}.pxs-bd.r{background:#ff4060}\
.pxs-meta{padding:8px 9px 9px}.pxs-t{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:13px;font-weight:600}\
.pxs-au{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:12px;color:#999;margin-top:2px}\
.pxs-st{display:flex;gap:10px;font-size:12px;margin-top:5px;color:#ccc;align-items:center}.pxs-st span{display:flex;align-items:center;gap:3px}\
.pxs-st .bm{color:#ff6b85;font-weight:700}\
#pxs-pg{display:flex;flex-wrap:wrap;justify-content:center;gap:6px;padding:8px 12px 28px}\
#pxs-pg button{min-width:40px;height:40px;border:0;border-radius:10px;background:#262626;color:#ddd;font-size:14px;cursor:pointer}#pxs-pg button.on{background:#0096fa;color:#fff}#pxs-pg button:disabled{opacity:.35}\
#pxs-empty{text-align:center;color:#777;padding:60px 12px}\
#pxs-prev[hidden]{display:none!important}\
#pxs-prev{position:fixed;z-index:2147483647;color:#eee;font:13px/1.35 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif}\
#pxs-prev.pxs-prev-full{inset:0;background:rgba(0,0,0,.86);display:flex;align-items:center;justify-content:center;padding:12px;padding:max(12px,env(safe-area-inset-top)) 12px max(12px,env(safe-area-inset-bottom))}\
#pxs-prev.pxs-prev-full .pxs-prev-inner{position:relative;max-width:100%;max-height:100%;display:flex;flex-direction:column;align-items:center}\
#pxs-prev.pxs-prev-full img{max-width:100%;max-height:calc(100dvh - 88px);max-height:calc(100vh - 88px);object-fit:contain;display:block;background:#111;border-radius:8px}\
#pxs-prev.pxs-prev-float{background:#141414;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.55);overflow:hidden;pointer-events:auto}\
#pxs-prev.pxs-prev-float img{display:block;max-width:100%;max-height:calc(82vh - 44px);object-fit:contain;background:#111;vertical-align:middle}\
#pxs-prev .pxs-prev-ui{display:flex;align-items:center;gap:8px;padding:8px 10px;max-width:100%;box-sizing:border-box}\
#pxs-prev.pxs-prev-full .pxs-prev-ui{width:min(720px,100%)}\
#pxs-prev-meta{flex:1;min-width:0;color:#ddd;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\
#pxs-prev-nav{display:flex;gap:6px;flex:none}\
#pxs-prev-nav button,#pxs-prev-x{border:0;background:#2c2c2c;color:#fff;border-radius:8px;min-width:40px;height:36px;font-size:18px;cursor:pointer}\
#pxs-prev-x{background:#333}\
#pxs-prev-nav button:active,#pxs-prev-x:active{background:#0096fa}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  /* ---------- DOM ---------- */
  var btn = el('button', { id: 'pxs-btn', title: '热门排序', 'aria-label': '热门排序' });
  btn.innerHTML = '★<span class="dot"></span>';
  var panel = el('div', { id: 'pxs-panel' });
  panel.innerHTML = '<div id="pxs-ph"><h3>热门排序</h3><button id="pxs-pclose" aria-label="收起">' + X_SVG + '</button></div><div id="pxs-pb">' +
    '<details class="pxs-sec" id="pxs-s-search" open><summary>搜索</summary>' +
    '<label style="display:block">多标签搜索<div style="display:flex;gap:4px;margin-top:4px"><input id="pxs-q" type="text" style="flex:1;min-width:0;width:auto" placeholder="A B（同时）  A OR B  -C  &quot;带 空格&quot;"><button id="pxs-qreset" class="pxs-mini" style="flex:0 0 auto;padding:0 8px" title="重置为当前页标签">↺</button></div></label>' +
    '<div style="display:flex;gap:4px;margin-bottom:8px"><select id="pxs-pre" style="flex:1;min-width:0"><option value="">搜索方案…</option></select><button id="pxs-presave" class="pxs-mini" style="flex:0 0 auto;padding:0 8px">保存</button><button id="pxs-preload" class="pxs-mini" style="flex:0 0 auto;padding:0 8px">载入</button><button id="pxs-predel" class="pxs-mini" style="flex:0 0 auto;padding:0 8px">删除</button></div>' +
    '<details class="pxs-sub" id="pxs-quick"><summary>常用标签</summary><div class="pxs-qchips" id="pxs-qchips"></div></details>' +
    '</details>' +
    '<details class="pxs-sec" id="pxs-blk"><summary id="pxs-blksum">屏蔽与过滤</summary>' +
    '<label>必须包含<input id="pxs-must" type="text" placeholder="本地过滤，空格分隔"></label>' +
    '<label class="pxs-chk"><input id="pxs-noai" type="checkbox"> 隐藏 AI 作品</label>' +
    '<label class="pxs-chk"><input id="pxs-partial" type="checkbox"> 标签部分匹配（默认完全匹配，不区分大小写）</label>' +
    '<div id="pxs-groups"></div>' +
    '<div style="display:flex;gap:6px"><button id="pxs-blkmgr" class="pxs-mini">屏蔽管理</button></div>' +
    '</details>' +
    '<details class="pxs-sec" id="pxs-s-scan"><summary id="pxs-scansum">扫描设置</summary>' +
    '<label>扫描方式<select id="pxs-strat"><option value="premium">会员热门排序</option><option value="new">最新 N 页</option><option value="users">users入り 快速</option><option value="years">按年份抽样</option></select></label>' +
    '<label>扫描页数（60/页）<input id="pxs-pages" type="number" min="1" max="1000" inputmode="numeric"></label>' +
    '<label>请求速度<select id="pxs-rpm"><option value="60">标准 60次/分（大量扫描）</option><option value="80">快速 80次/分</option><option value="b200_100_60">爆发（前100次≈200 → 60）</option></select></label>' +
    '<label style="justify-content:flex-end;gap:6px;font-size:12px;color:#aaa"><input id="pxs-prot" type="checkbox" style="width:auto"> 自动保护（60 档每 400 次停 45 秒，80 档每 200 次停 60 秒）</label>' +
    '<div id="pxs-rpmwarn" style="display:none;color:#ff4d4f;font-size:12px;margin:-4px 0 6px;text-align:right">⚠ 爆发档更容易触发限流</div>' +
    '<label id="pxs-ypl">每年页数<input id="pxs-ypages" type="number" min="1" max="50" inputmode="numeric"></label>' +
    '<label>最低收藏数<input id="pxs-min" type="number" min="0" inputmode="numeric"></label>' +
    '<label>最高收藏数<input id="pxs-max" type="number" min="0" inputmode="numeric" placeholder="不限"></label>' +
    '<label>范围<select id="pxs-mode"><option value="page">跟随页面</option><option value="all">全部</option><option value="safe">全年龄</option><option value="r18">R-18</option></select></label>' +
    '<button id="pxs-clear" style="width:100%;margin-top:8px;min-height:36px;border:0;border-radius:10px;background:#2c2c2c;color:#bbb;font-size:13px">清除缓存</button>' +
    '</details>' +
    '<details id="pxs-logbox" class="pxs-sec"><summary>记录</summary><div style="font-size:12px;color:#aaa"><div id="pxs-log"></div>' +
    '<div style="display:flex;gap:6px;margin-top:6px"><button id="pxs-logall" style="flex:1;min-height:34px;border:0;border-radius:8px;background:#2c2c2c;color:#ccc">展开全部</button><button id="pxs-export" style="flex:1;min-height:34px;border:0;border-radius:8px;background:#2c2c2c;color:#ccc">导出记录</button></div></div></details>' +
    '<details class="pxs-sec"><summary>说明</summary><div style="font-size:12px;color:#aaa">' +
    '<p><b>多标签搜索</b>：空格 = 同时包含，<code>OR</code> 或 <code>|</code> = 任一，<code>-标签</code> = 排除，括号可分组（如 <code>A (B OR C) -D</code>），引号包住带空格的词。语法交给 Pixiv 服务器执行（与 Pixiv 搜索框相同），可减少要查的作品；排除词超过 ' + MAX_SERVER_EXCL + ' 个或搜索词过长时，多出的排除词自动改为本地过滤。带空格的引号词服务器只能按单词搜索，再在本地精确匹配标签。</p>' +
    '<p><b>结果页预览</b>：电脑把鼠标放在缩略图上稍停即可放大查看；手机长按缩略图打开预览（点 ⋯ 或长按标题区仍是菜单）。多图可用左右按钮、滚轮或左右滑动切换。按 Esc 可先关闭预览，再按一次退出结果页。预览用的是较大预览图，不是原图，不会额外请求作品详情；动图目前只显示封面。</p>' +
    '<p><b>常用标签</b>：在「搜索」里展开次级卡片，点一下把对应日文标签加入搜索框，再点一次取消。</p>' +
    '<p><b>屏蔽与过滤</b>：屏蔽标签 / 画师 / AI 作品 / 必须包含 在<b>查收藏数之前</b>就用搜索结果自带的标签、画师、AI 标记过滤掉，不再发详情请求；结果页也会隐藏。点卡片上的标签或 ⋯ 可快速屏蔽或加入搜索。<b>搜索方案</b>可保存搜索词、屏蔽列表、收藏范围和速度档位。</p>' +
    '<p><b>会员热门排序</b>（默认）：用 Pixiv 会员的「按热门度排序」(order=popular_d) 取前 N 页，并把收藏数范围交给 Pixiv 服务器过滤 (blt/bgt)。默认最低收藏数为 100（在「扫描设置」里，不是「屏蔽与过滤」）。若热门排序没按这个范围过滤（大量低于最低或超过最高），脚本会抽查后改在该范围内搜索（按时间 + users入り），再按收藏数排序。状态里的「低于最低收藏 / 超过最高收藏」指的就是这项，不是屏蔽。非会员时 Pixiv 会悄悄返回按时间排序的结果，脚本检测到后自动改用 users入り 方式并提示。</p>' +
    '<p><b>最新 N 页</b>：按投稿时间从新到旧扫描，最完整但大标签里多是刚投稿、收藏少的作品。</p>' +
    '<p><b>users入り 快速</b>：额外搜索「标签 + 1000users入り」等社区收藏标签（只取 ≥ 最低收藏数的档位），几页就能拿到高收藏作品；但依赖用户手动加的标签，会漏掉没加该标签的热门作品，数字也可能过时。</p>' +
    '<p><b>按年份抽样</b>：从 2008 年起每年取最新若干页，覆盖老作品；仍是抽样，不保证完整。</p>' +
    '<p><b>请求速度</b>：所有请求共用一个限速器。档位只有三个：标准 60（默认，适合大量扫描）/ 快速 80 / 爆发（前 100 次约 200次/分、5 并发，之后立即降到 60次/分、2 并发）。请求间隔带随机抖动（基准间隔的 0.5–1.5 倍，约 5% 概率额外停 2–5 秒），平均速度仍等于档位。同时请求数：60→2、80→3。每件未缓存的作品需要 1 次请求。<b>自动保护</b>（默认开）：60 档每 400 次暂停约 45 秒、80 档每 200 次暂停约 60 秒（均 ±20%）；爆发档不暂停，只在 429 时立即停止；若 30 分钟内曾在开启保护时被限流，下次暂停间隔减半。收藏数缓存 7 天，重复扫描几乎不发请求。</p><p>一旦遇到 429/403 限流会<b>立即停止、不自动重试</b>，并显示建议冷却倒计时（期间打开作品可能显示“尚无此页”）。</p><p>未登录时 Pixiv 每次搜索最多 10 页；页数越多越慢（每件作品 1 次请求）。搜索方式/类型/范围默认跟随当前页面网址。</p></div></details>' +
    '</div><div id="pxs-pf">' +
    '<div class="pxs-row"><button id="pxs-go">开始</button><button id="pxs-view" class="sec">查看结果</button></div>' +
    '<button id="pxs-restore" style="display:none;width:100%;margin-top:6px;min-height:38px;border:0;border-radius:10px;background:#2b4a63;color:#fff;font-size:14px">恢复上次结果</button>' +
    '<div id="pxs-status"></div><button id="pxs-retry" class="sec" style="display:none;width:100%;margin-top:8px;min-height:40px;border:0;border-radius:10px;background:#3a3a3a;color:#fff;font-size:14px">重试失败项</button>' +
    '</div>';
  var ov = el('div', { id: 'pxs-ov' });
  var PRESETS = [[0, 0, '不限'], [100, 500, '100–500'], [500, 1000, '500–1k'], [1000, 5000, '1k–5k'], [5000, 0, '5k+']];
  ov.innerHTML = '<div id="pxs-head"><div class="pxs-hrow"><div style="flex:1;min-width:0"><div id="pxs-htag"></div><div id="pxs-hsub"></div></div>' +
    '<button id="pxs-close" aria-label="关闭">' + X_SVG + '</button></div>' +
    '<div id="pxs-tools"><div class="pxs-seg" id="pxs-sort">' +
    '<button data-s="bm">收藏数</button><button data-s="like">点赞数</button><button data-s="rate">收藏率</button><button data-s="new">最新</button></div>' +
    '<span class="pxs-sep"></span>' + '<input id="pxs-fmin" class="pxs-num" type="number" min="0" inputmode="numeric" placeholder="最低"><span style="color:#777">–</span><input id="pxs-fmax" class="pxs-num" type="number" min="0" inputmode="numeric" placeholder="最高">' +
    PRESETS.map(function (c) { return '<button class="pxs-chip" data-r="' + c[0] + '-' + c[1] + '">' + c[2] + '</button>'; }).join('') +
    '<span class="pxs-sep"></span><button class="pxs-tog" id="pxs-r18">隐藏 R-18</button><button class="pxs-tog" id="pxs-bat">批量下载</button></div>' +
    '<div id="pxs-batbar" style="display:none"><span id="pxs-bsel">已选 0</span><button class="pxs-tog" id="pxs-ball">全选本页</button><button class="pxs-tog" id="pxs-bnone">取消</button>' +
    '<label class="pxs-bfirst"><input type="checkbox" id="pxs-bfirst"> 仅首张</label><label class="pxs-bfirst"><input type="checkbox" id="pxs-bzip"> 打包为 ZIP</label><label class="pxs-bfirst">动图格式<select id="pxs-bug" style="width:auto;font-size:13px;padding:2px 4px;background:#2c2c2c;color:#eee;border:1px solid #444;border-radius:6px"></select></label><button class="pxs-tog pxs-bgo" id="pxs-bgo">下载所选</button><span id="pxs-bprog"></span></div>' +
    '<div id="pxs-bar"><i></i></div></div><div id="pxs-grid"></div><div id="pxs-pg"></div>';
  var prev = el('div', { id: 'pxs-prev', hidden: 'hidden', 'aria-modal': 'true', role: 'dialog', 'aria-label': '作品预览' });
  prev.innerHTML = '<div class="pxs-prev-inner"><img id="pxs-prev-img" alt="预览" referrerpolicy="origin"><div class="pxs-prev-ui"><div id="pxs-prev-meta"></div><div id="pxs-prev-nav"><button type="button" data-ps="-1" aria-label="上一张">‹</button><button type="button" data-ps="1" aria-label="下一张">›</button></div><button type="button" id="pxs-prev-x" aria-label="关闭预览">×</button></div></div>';
  document.body.append(btn, panel, ov, prev);
  var $ = function (id) { return document.getElementById(id); };
  $('pxs-pages').value = cfg.pages; $('pxs-min').value = cfg.minBm; $('pxs-max').value = cfg.maxBm || ''; $('pxs-mode').value = cfg.mode; $('pxs-strat').value = cfg.strategy; $('pxs-ypages').value = cfg.yearPages;
  ['pxs-pages','pxs-min','pxs-max','pxs-strat'].forEach(function (id) { var n = $(id); if (n) n.addEventListener('input', scanSum), n.addEventListener('change', scanSum); }); $('pxs-rpm').value = cfg.rand ? 'rand200' : cfg.burst ? (cfg.burst === 'n' ? 'b' + cfg.bRate + '_' + cfg.bN + '_' + cfg.rpm : cfg.burst === 'spike' ? 'spike' : 'burst') : String(cfg.rpm);
  function syncRpm() {
    var off = ['60', '80', 'b200_100_60'];
    if (off.indexOf($('pxs-rpm').value) < 0) $('pxs-rpm').value = '60';
    $('pxs-rpmwarn').style.display = $('pxs-rpm').value === 'b200_100_60' ? '' : 'none';
  }
  function saveCfgSafe() { try { localStorage.setItem(LS, JSON.stringify(cfg)); } catch (e) { } }
  syncRpm();
  $('pxs-rpm').addEventListener('change', syncRpm);
  $('pxs-prot').checked = cfg.protect !== false;
  $('pxs-prot').addEventListener('change', function () { cfg.protect = $('pxs-prot').checked; saveCfgSafe(); });
  var logAll = false;
  $('pxs-logall').addEventListener('click', function () { logAll = !logAll; drawLog(); });
  $('pxs-export').addEventListener('click', exportLog);
  function syncStrat() { $('pxs-ypl').style.display = $('pxs-strat').value === 'years' ? '' : 'none'; } syncStrat();
  $('pxs-strat').addEventListener('change', syncStrat);
  $('pxs-retry').addEventListener('click', function () { if (!running) run(true); });
  setTimeout(drawLog, 0);
  var qTouched = false;
  $('pxs-q').value = getTag();
  $('pxs-q').addEventListener('input', function () { qTouched = true; syncQuickChips(); });
  $('pxs-qreset').addEventListener('click', function () { $('pxs-q').value = getTag(); qTouched = false; syncQuickChips(); });
  drawQuickChips();
  $('pxs-must').addEventListener('change', function () { BL.must = $('pxs-must').value.split(/[\s,，]+/).filter(Boolean); saveBL(); render(true); });
  $('pxs-noai').addEventListener('change', function () { BL.hideAI = $('pxs-noai').checked; saveBL(); render(true); });
  $('pxs-partial').addEventListener('change', function () { BL.partial = $('pxs-partial').checked; saveBL(); render(true); });
  $('pxs-blkmgr').addEventListener('click', blkManager);
  $('pxs-presave').addEventListener('click', function () { var n = prompt('方案名称：', $('pxs-pre').value || ''); if (n && savePreset(n.trim())) status('已保存方案「' + n.trim() + '」'); });
  $('pxs-preload').addEventListener('click', function () { var n = $('pxs-pre').value; if (n && loadPreset(n)) status('已载入方案「' + n + '」'); });
  $('pxs-predel').addEventListener('click', function () { var n = $('pxs-pre').value; if (n && confirm('删除方案「' + n + '」？') && delPreset(n)) status('已删除方案「' + n + '」'); });
  drawPresets(''); syncBlkUI(); drawGroups();
  ov.addEventListener('scroll', function () { clearTimeout(viewTimer); viewTimer = setTimeout(saveView, 400); }, { passive: true });
  setTimeout(initRestore, 0);
  $('pxs-groups').addEventListener('click', onGroupsClick); $('pxs-groups').addEventListener('change', onGroupsChange);
  $('pxs-pclose').addEventListener('click', function () { panel.classList.remove('open'); });
  // 卡片：点标签 / ⋯ 打开菜单；长按缩略图打开预览，长按标题区也可打开菜单
  function cardOf(t) { while (t && t !== document && !(t.classList && t.classList.contains('pxs-card'))) t = t.parentNode; return t && t.__it ? t : null; }
  $('pxs-grid').addEventListener('click', function (e) {
    var t = e.target, card = cardOf(t); if (!card) return;
    if (Date.now() - lastDraw < 350 && (t.classList.contains('pxs-more') || t.classList.contains('pxs-tag') || t.classList.contains('pxs-dlb'))) { e.preventDefault(); e.stopPropagation(); return; }   // 刚重绘完的幽灵点击
    if (batch && !t.classList.contains('pxs-more')) { e.preventDefault(); e.stopPropagation(); toggleSel(card); return; }
    if (t.classList.contains('pxs-tag')) { e.preventDefault(); e.stopPropagation(); showMenu(e.clientX || 20, e.clientY || 20, tagMenuItems(t.getAttribute('data-tag'))); }
    else if (t.classList.contains('pxs-dlb')) { e.preventDefault(); e.stopPropagation(); var di = card.__it; if (di.pages > 1) showMenu(e.clientX || 20, e.clientY || 20, dlMenuItems(di)); else enqueueDl(di, false); }
    else if (t.classList.contains('pxs-more')) { e.preventDefault(); e.stopPropagation(); cardMenu(card.__it, e.clientX || 20, e.clientY || 20); }
    else if (card.__lp) { e.preventDefault(); card.__lp = false; }
  });
  var lpTimer = 0;
  $('pxs-grid').addEventListener('touchstart', function (e) {
    var card = cardOf(e.target); if (!card) return; var p = e.touches[0], tg = e.target;
    clearTimeout(lpTimer); if (e.touches.length > 1) return;
    lpTimer = setTimeout(function () {
      lpTimer = 0; if (!card.isConnected || !ov.classList.contains('open') || Date.now() - lastDraw < 700) return;
      card.__lp = true;
      if (tg.classList && tg.classList.contains('pxs-tag')) showMenu(p.clientX, p.clientY, tagMenuItems(tg.getAttribute('data-tag')));
      else if (isPreviewTarget(tg)) openPreview(card.__it, 0, 'full', card);
      else cardMenu(card.__it, p.clientX, p.clientY);
    }, 550);
  }, { passive: true });
  // 监听挂在 document 上：扫描中网格重绘会把卡片换掉，旧卡片上的 touchend 冒不到网格，长按计时器就会误触发弹出菜单
  ['touchend', 'touchmove', 'touchcancel', 'scroll'].forEach(function (ev) { document.addEventListener(ev, function () { clearTimeout(lpTimer); lpTimer = 0; }, { passive: true, capture: true }); });
  $('pxs-grid').addEventListener('contextmenu', function (e) { var card = cardOf(e.target); if (card && card.__lp) e.preventDefault(); });

  function saveCfg() { localStorage.setItem(LS, JSON.stringify(cfg)); }
  btn.addEventListener('click', function () { panel.classList.toggle('open'); });
  $('pxs-close').addEventListener('click', closeOv);
  $('pxs-view').addEventListener('click', function () { if (!state.tag) { status('还没有结果，请先点“开始”'); return; } openOv(); });
  $('pxs-go').addEventListener('click', function () {
    if (running) { doStop('已停止'); return; }
    cfg.pages = Math.max(1, Math.min(1000, +$('pxs-pages').value || 5)); cfg.strategy = $('pxs-strat').value; var rv = $('pxs-rpm').value;
    cfg.rand = rv === 'rand200';
    if (cfg.rand) { cfg.burst = false; cfg.rpm = 110; } else if (rv === 'burst') { cfg.burst = 'time'; cfg.rpm = 60; } else if (rv === 'spike') { cfg.burst = 'spike'; cfg.rpm = 60; } else if (/^b\d+_\d+_\d+$/.test(rv)) { var bp = rv.slice(1).split('_'); cfg.burst = 'n'; cfg.bRate = +bp[0]; cfg.bN = +bp[1]; cfg.rpm = +bp[2]; } else { cfg.burst = false; cfg.rpm = +$('pxs-rpm').value || 60; } cfg.yearPages = Math.max(1, Math.min(50, +$('pxs-ypages').value || 2));
    cfg.minBm = Math.max(0, +$('pxs-min').value || 0); cfg.maxBm = Math.max(0, +$('pxs-max').value || 0); cfg.mode = $('pxs-mode').value;
    saveCfg(); run(false);
  });
  $('pxs-sort').addEventListener('click', function (e) { var s = e.target.getAttribute('data-s'); if (s) { cfg.sort = s; saveCfg(); state.page = 1; render(true); } });
  $('pxs-tools').addEventListener('click', function (e) { var r = e.target.getAttribute('data-r'); if (r) { r = r.split('-'); cfg.fMin = +r[0]; cfg.fMax = +r[1]; $('pxs-fmin').value = cfg.fMin || ''; $('pxs-fmax').value = cfg.fMax || ''; saveCfg(); state.page = 1; render(true); } });
  function onRange() { cfg.fMin = Math.max(0, +$('pxs-fmin').value || 0); cfg.fMax = Math.max(0, +$('pxs-fmax').value || 0); saveCfg(); state.page = 1; render(true); }
  $('pxs-fmin').addEventListener('change', onRange); $('pxs-fmax').addEventListener('change', onRange);
  $('pxs-fmin').value = cfg.fMin || ''; $('pxs-fmax').value = cfg.fMax || '';
  $('pxs-clear').addEventListener('click', function () { cacheClear(); status('缓存已清除'); });
  $('pxs-r18').addEventListener('click', function () { cfg.hideR18 = !cfg.hideR18; saveCfg(); state.page = 1; render(true); });
  $('pxs-bat').addEventListener('click', function () { batch = !batch; drawBat(); render(true); });
  $('pxs-ball').addEventListener('click', function () { Array.prototype.forEach.call(document.querySelectorAll('#pxs-grid .pxs-card'), function (c) { if (c.__it) { sel[c.__it.id] = c.__it; c.classList.add('sel'); } }); drawBat(); });
  $('pxs-bnone').addEventListener('click', function () { sel = {}; Array.prototype.forEach.call(document.querySelectorAll('#pxs-grid .pxs-card.sel'), function (c) { c.classList.remove('sel'); }); drawBat(); });
  $('pxs-bgo').addEventListener('click', batchGo);
  (function () { var sb = $('pxs-bug'); ['webm', 'gif', 'zip'].forEach(function (f) { if (f === 'webm' && !canWebm()) return; var o = document.createElement('option'); o.value = f; o.textContent = UG_NAMES[f]; sb.appendChild(o); }); sb.value = ugFmt(); sb.addEventListener('change', function () { cfg.ugFmt = sb.value; saveCfgSafe(); }); })();
  $('pxs-bzip').addEventListener('change', function () { zipTouched = true; });
  $('pxs-bfirst').addEventListener('change', syncZipDefault);
  $('pxs-pg').addEventListener('click', function (e) { var p = e.target.getAttribute('data-p'); if (p) { state.page = +p; render(true); ov.scrollTop = 0; saveView(); } });

  function openOv() { ov.classList.add('open'); document.documentElement.style.overflow = 'hidden'; panel.classList.remove('open'); render(true); saveView(); }
  function closeOv() { closePreview(); ov.classList.remove('open'); document.documentElement.style.overflow = ''; saveView(); }
  function el(t, a) { var e = document.createElement(t); for (var k in a) e.setAttribute(k, a[k]); return e; }
  function status(s) { $('pxs-status').textContent = s; }
  function sleep(ms) {
    return new Promise(function (r) {
      var t = setTimeout(done, ms), iv = setInterval(function () { if (stop) done(); }, 200);
      function done() { clearTimeout(t); clearInterval(iv); r(); }
    });
  }
  function fmt(n) { return n >= 10000 ? (n / 10000).toFixed(1).replace(/\.0$/, '') + '万' : String(n); }

  /* ---------- adaptive fetch ---------- */
  var conc = 1, ctrl = null, limited = false, hits429 = 0;
  var stats = { times: [], start: 0, sent: 0, refusedAt: 0, refusedIdx: 0, last: 0, gaps: 0, gsum: 0, gmin: 0, gmax: 0 };
  var LOGK = 'pxsort_ratelog';
  function liveRpm() { var min = (Date.now() - stats.start - pausedSoFar()) / 60000; return min > 0.05 ? Math.round(stats.sent / min) : 0; }
  // 最近 30 秒的实际速度（爆发切换后能立刻看出降速；整体平均会被爆发段拉高）
  function recentRpm() { var now = Date.now(), T = stats.times || [], n = 0; for (var i = T.length - 1; i >= 0 && now - T[i] <= 30000; i--) n++; var span = Math.min(30000, now - stats.start); return span > 3000 ? Math.round(n * 60000 / span) : liveRpm(); }
  function concFor(r) { return r >= 120 ? 4 : r >= 80 ? 3 : 2; }
  function logRun(result) {
    if (!stats.start || !stats.sent) return;
    if (stats.dbg) try { localStorage.setItem('pxsort_debug', JSON.stringify({ t: Date.now(), result: result, preset: $('pxs-rpm').value, req: stats.dbg.req.slice(-1500), pages: stats.dbg.pages.slice(-300) })); } catch (e) { }
    var el = Math.max(0, Date.now() - stats.start - pausedSoFar()) / 1000;
    var rec = { t: Date.now(), preset: cfg.rand ? '完全随机≤200' : (cfg.burst === 'n' && cfg.bRate === 200 && cfg.bN === BURST_COUNT && cfg.rpm === 60) ? '爆发' : cfg.burst === 'spike' ? '瞬时爆发×' + SPIKE_SIZE : cfg.burst === 'n' ? '爆发' + cfg.bRate + '×' + cfg.bN + '→' + cfg.rpm : cfg.burst ? '爆发测试' : cfg.rpm,
      burst: cfg.burst ? { ms: stats.burstMs, sent: stats.burstSent, phase: stats.refusedPhase || '' } : null, sent: stats.sent, sec: Math.round(el), rpm: Math.round(stats.sent / Math.max(el, 1) * 60), result: result,
      idx: stats.refusedIdx || 0, jit: 1, iavg: stats.gaps ? +(stats.gsum / stats.gaps / 1000).toFixed(2) : 0, imin: +(stats.gmin / 1000).toFixed(2), imax: +(stats.gmax / 1000).toFixed(2), at: stats.refusedAt ? Math.round((stats.refusedAt - stats.start) / 1000) : 0, win: winStats(stats.refusedAt || Date.now()),
      prot: stats.protEvery ? { every: stats.protEvery, n: stats.pauses, sec: Math.round(pausedSoFar() / 1000), halved: stats.halved } : null };
    var L = safeArr(localStorage.getItem(LOGK)); L.unshift(rec); L = L.slice(0, 30);
    try { localStorage.setItem(LOGK, JSON.stringify(L)); } catch (e) { }
    drawLog();
  }
  // sliding-window counts: requests in the last 10/30/60/120/300 s before ref time, and peak 10s/60s windows over the run
  function winStats(ref) {
    var T = stats.times || [], w = {};
    [10, 30, 60, 120, 300].forEach(function (s) { var c = 0; for (var i = T.length - 1; i >= 0 && T[i] > ref - s * 1000; i--) if (T[i] <= ref) c++; w['l' + s] = c; });
    [10, 60].forEach(function (s) { var best = 0, j = 0; for (var i = 0; i < T.length; i++) { while (T[i] - T[j] >= s * 1000) j++; best = Math.max(best, i - j + 1); } w['p' + s] = best; });
    return w;
  }
  function safeArr(t) { try { var a = JSON.parse(t || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function fmtTs(t) { var d = new Date(t), z = function (n) { return ('0' + n).slice(-2); }; return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()) + ' ' + z(d.getHours()) + ':' + z(d.getMinutes()); }
  function resText(r) { return r.result === 'ok' ? '未限流' : r.result === 'stop' ? '手动停止' : r.result + ' 第' + r.idx + '个/' + r.at + 's'; }
  // one compact plain-text line per run
  function logLine(r) {
    var w = r.win || {};
    return fmtTs(r.t) + ' | ' + r.preset + ' | ' + resText(r) + ' | ' + r.sent + '次 ' + r.sec + 's 均' + r.rpm + '/分' +
      (r.burst ? ' | 爆发 ' + r.burst.sent + '次 ' + (r.burst.ms / 1000).toFixed(1) + 's' + (r.burst.phase ? ' 429在' + r.burst.phase : '') : '') +
      (r.win ? ' | 窗口 10s:' + w.l10 + ' 30s:' + w.l30 + ' 60s:' + w.l60 + ' 120s:' + w.l120 + ' 300s:' + w.l300 + ' 峰10s:' + w.p10 + ' 峰60s:' + w.p60 : '') +
      (r.prot ? ' | 保护 每' + r.prot.every + '次 暂停' + r.prot.n + '次 共' + r.prot.sec + 's' + (r.prot.halved ? '（30分钟内曾被限流，间隔减半）' : '') : '') +
      (r.jit ? ' | 间隔 均' + r.iavg + ' 短' + r.imin + ' 长' + r.imax + 's' : '');
  }
  function drawLog() {
    var L = safeArr(localStorage.getItem(LOGK)), box = $('pxs-log'); if (!box) return;
    var btnAll = $('pxs-logall');
    if (btnAll) { btnAll.style.display = L.length > 3 ? '' : 'none'; btnAll.textContent = logAll ? '只看最近 3 条' : '展开全部（' + L.length + '）'; }
    if (!L.length) { box.textContent = '暂无记录'; return; }
    box.innerHTML = '';
    (logAll ? L : L.slice(0, 3)).forEach(function (r) {
      var d = document.createElement('div');
      d.style.cssText = 'padding:4px 0;border-top:1px solid #333;word-break:break-all;color:' + (r.result === 'ok' ? '#9ad' : r.result === 'stop' ? '#aaa' : '#ff7875');
      d.textContent = logLine(r); box.appendChild(d);
    });
  }
  function exportLog() {
    var L = safeArr(localStorage.getItem(LOGK));
    var text = 'Pixiv 热门排序 限速记录（' + L.length + ' 条，新→旧）\n' + L.map(logLine).join('\n');
    var D = safeObj(localStorage.getItem('pxsort_debug'));
    if (cfg.testMode && D.req) {
      text += '\n\n# 调试（最近一次扫描，' + fmtTs(D.t) + '，' + D.preset + '，' + D.result + '）\n# 每页件数：组 页 返回 有效\n' + D.pages.map(function (x) { return x.join(' '); }).join('\n') +
        '\n# 每个请求：毫秒 类型(S搜索/D详情) 阶段(B=爆发) 目标\n' + D.req.map(function (x, i) { return x[0] + ' ' + x[1] + (x[2] ? ' ' + x[2] : '') + ' ' + x[3] + (i ? ' +' + (x[0] - D.req[i - 1][0]) : ''); }).join('\n');
    }
    function modal() {
      var m = document.createElement('div');
      m.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:2147483647;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;padding:12px';
      m.innerHTML = '<div>' +
        '<div style="margin-bottom:6px">长按/全选后复制：</div><textarea readonly style="width:100%;height:50vh;box-sizing:border-box;background:#111;color:#ddd;border:1px solid #444;border-radius:8px;font:12px monospace"></textarea>' +
        '<div style="display:flex;gap:8px;margin-top:8px"><button data-a="dl" style="flex:1;min-height:40px;border:0;border-radius:8px;background:#0096fa;color:#fff">下载 txt</button><button data-a="x" style="flex:1;min-height:40px;border:0;border-radius:8px;background:#3a3a3a;color:#fff">关闭</button></div></div>';
      var ta = m.querySelector('textarea'); ta.value = text;
      m.addEventListener('click', function (e) {
        var a = e.target.getAttribute('data-a');
        if (a === 'x' || e.target === m) closeSheet(m);
        if (a === 'dl') {
          var url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
          var link = document.createElement('a'); link.href = url; link.download = 'pxsort-ratelog-' + fmtTs(Date.now()).replace(/[ :]/g, '-') + '.txt';
          document.body.appendChild(link); link.click(); link.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
        }
      });
      openSheet(m); ta.focus(); ta.select();
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { status('已复制 ' + L.length + ' 条记录到剪贴板'); modal(); }, modal);
    } else modal();
  }
  var COOL_KEY = 'pxsort_cool_until', COOL_MS = 10 * 60e3;
  function Aborted() { var e = new Error('已停止'); e.aborted = true; return e; }
  function doStop(msg) { stop = true; if (ctrl) try { ctrl.abort(); } catch (e) { } status(msg || '已停止'); }
  // global scheduler shared by every request: jittered spacing, average = 60/rpm s
  var nextAt = 0;
  function bRate() { return cfg.burst === 'n' ? (cfg.bRate || 160) : 160; }
  function bConc() { return cfg.burst === 'spike' ? SPIKE_SIZE : bRate() >= 200 ? 5 : 4; }
  function normalGap() {
    var base = 60000 / (cfg.rpm || 40), k = Math.max(0.3, 1 - 175 / base);
    var g = base * k * (0.5 + Math.random());
    if (Math.random() < 0.05) g += 2000 + Math.random() * 3000;
    return g;
  }
  // is the slot being reserved still part of the burst?
  function burstSlot(slot) {
    if (!cfg.burst || stats.burstOver) return false;
    if (cfg.burst === 'n') return stats.burstRes < (cfg.bN || 50);
    if (cfg.burst === 'spike') {   // 瞬时爆发：在开始查收藏数（并发请求）时触发，窗口 SPIKE_WINDOW_MS、最多 SPIKE_SIZE 个
      if (!lookupActive && !stats.spikeStart) return false;
      if (!stats.spikeStart) stats.spikeStart = Date.now();
      return stats.burstRes < SPIKE_SIZE && Date.now() < stats.spikeStart + SPIKE_WINDOW_MS;
    }
    return slot < stats.burstEnd;
  }
  function inBurst() { return !!cfg.burst && !stats.burstOver; }
  // 自动保护：每 every 次请求暂停 pause 毫秒（±20%）。可在此修改。
  var PROTECT = { 60: { every: 400, pause: 45000 }, 80: { every: 200, pause: 60000 } };
  var PROTECT_JITTER = 0.2, PROTECT_RECENT_429_MS = 30 * 60e3, LAST429 = 'pxsort_last429';
  function protRule() { return cfg.protect !== false && !cfg.burst && !cfg.rand ? PROTECT[cfg.rpm] || null : null; }
  var pauseTicker = 0;
  function startPauseTicker() {
    clearInterval(pauseTicker);
    pauseTicker = setInterval(function () {
      var left = stats.pauseUntil - Date.now();
      if (stop || left <= 0) { clearInterval(pauseTicker); return; }
      status('自动保护中，剩余 ' + Math.ceil(left / 1000) + 's（已发出 ' + stats.sent + ' 次，第 ' + stats.pauses + ' 次暂停）');
    }, 500);
  }
  function pausedSoFar() { return Math.max(0, stats.pauseMs - Math.max(0, (stats.pauseUntil || 0) - Date.now())); }
  async function acquire() {
    if (stop) throw Aborted();
    var now = Date.now(), slot = Math.max(now, nextAt), isB = false;
    if (burstSlot(slot)) {
      stats.burstRes++; isB = true;
      if (cfg.burst === 'spike') { slot = Math.max(now, stats.spikeStart + Math.random() * SPIKE_WINDOW_MS * 0.8); }   // 并发、各带随机小偏移，不推进 nextAt
      else nextAt = slot + (60000 / bRate()) * (0.5 + Math.random());
      stats.lastBurstSlot = Math.max(stats.lastBurstSlot || 0, slot);
    } else {
      if (cfg.burst && !stats.burstOver && (cfg.burst !== 'spike' || stats.spikeStart)) {
        // burst finished: drop everything queued at burst spacing and restart from the last real request
        stats.burstOver = true;
        conc = concFor(cfg.rpm);
        // 切换：从“现在/最后一个爆发请求”起按新档位间隔排下一个时间点，不补发积压；并发立刻降到新档位（查收藏数的 pump 只在 active < conc 时发新请求）
        slot = Math.max(now, (stats.lastBurstSlot || stats.last || now) + normalGap());
        stats.switchAt = slot;
      }
      if (stats.protEvery && stats.protCnt >= stats.protEvery) {
        var pr = protRule(), dur = Math.round(pr.pause * (1 - PROTECT_JITTER + 2 * PROTECT_JITTER * Math.random()));
        var p0 = Math.max(slot, stats.last || now);
        slot = p0 + dur; stats.pauseUntil = slot; stats.pauseEnds.push(slot); stats.pauses++; stats.pauseMs += dur; stats.protCnt = 0;
        startPauseTicker();
      }
      stats.protCnt++;
      nextAt = slot + (cfg.rand ? 60000 / (20 + Math.random() * 180) : normalGap());   // rand: rate uniform 20–200/min => gap 0.3–3 s
    }
    if (slot > now) await sleep(slot - now);
    if (stop) throw Aborted();
    var t = Date.now();
    if (stats.last && !stats.pauseEnds.some(function (e) { return e - 1000 <= t && e > stats.last - 1000 && stats.last <= e; })) { var d = t - stats.last; stats.gaps++; stats.gsum += d; stats.gmin = stats.gaps === 1 ? d : Math.min(stats.gmin, d); stats.gmax = Math.max(stats.gmax, d); }
    stats.last = t;
    stats.times.push(t); if (stats.times.length > 3000) stats.times.shift();
    if (isB) { stats.burstSent++; stats.burstMs = t - (cfg.burst === 'spike' ? stats.spikeStart : stats.start); }
    else if (cfg.burst) { stats.postTimes.push(t); if (stats.postTimes.length > 200) stats.postTimes.shift(); }
  }
  if (window.__PXSORT_TEST) window.__pxsortTest = { unzip: unzip, gifEncoder: gifEncoder, ugFmt: ugFmt, makeZip: makeZip, crc32: crc32, bst: function () { return bst; }, sel: function () { return sel; }, enqueueDl: enqueueDl, fileName: fileName, saveResults: saveResults, dlBusy: function () { return dlBusy; }, BLOCK_GROUPS: BLOCK_GROUPS, QUICK_TAGS: QUICK_TAGS, effTags: effTags, buildQuery: buildQuery, queryHasTag: queryHasTag, toggleQuickTag: toggleQuickTag, syncQuickChips: syncQuickChips, previewUrl: previewUrl, openPreview: openPreview, closePreview: closePreview, previewStep: previewStep, previewState: function () { return prevState; }, openOv: openOv, closeOv: closeOv, blockReason: blockReason, BL: function () { return BL; }, savePreset: savePreset, loadPreset: loadPreset, delPreset: delPreset, presets: presets, blImport: blImport, blText: blText, state: function () { return state; }, acquire: acquire, PROTECT: PROTECT, logRun: function (r) { logRun(r); }, stopNow: function () { stop = true; }, stats: function () { return stats; }, cfg: cfg, setRun: function () { stop = false; stats = newStats(); nextAt = 0; if (cfg.burst) conc = bConc(); } };
  function safeObj(t) { try { var o = JSON.parse(t || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } }
  function newStats() {
    var st = { start: Date.now(), sent: 0, refusedAt: 0, refusedIdx: 0, last: 0, gaps: 0, gsum: 0, gmin: 0, gmax: 0, burstMs: 0, burstEnd: 0, burstSent: 0, burstRes: 0, burstOver: false, postTimes: [], times: [], dbg: cfg.testMode ? { req: [], pages: [] } : null, spikeStart: 0, protCnt: 0, protEvery: 0, pauses: 0, pauseMs: 0, pauseUntil: 0, pauseEnds: [], halved: false };
    var pr = protRule();
    if (pr) {
      st.protEvery = pr.every;
      var l4 = safeObj(localStorage.getItem(LAST429));
      if (l4.t && Date.now() - l4.t < PROTECT_RECENT_429_MS && l4.protect) { st.protEvery = Math.max(1, Math.floor(pr.every / 2)); st.halved = true; }
    }
    if (cfg.burst === 'time') { st.burstEnd = st.start + Math.round(2000 + Math.random() * 1000); }
    return st;
  }
  var coolTimer = 0;
  function showCooldown() {
    clearInterval(coolTimer);
    function tick() {
      var left = (+localStorage.getItem(COOL_KEY) || 0) - Date.now();
      if (left <= 0 || running) { clearInterval(coolTimer); if (left <= 0 && !running) status('冷却结束，可以继续扫描。'); return; }
      var m = Math.floor(left / 60000), sec = Math.floor(left / 1000) % 60;
      status('Pixiv 返回 ' + (limited || '429') + ' 限流，已立即停止（不自动重试）。建议冷却 ' + m + ':' + (sec < 10 ? '0' : '') + sec + ' 后再继续；期间打开作品可能显示“尚无此页”。');
    }
    tick(); coolTimer = setInterval(tick, 1000);
  }
  async function getJSON(url) {
    for (var i = 0; i < 2; i++) {
      await acquire();
      var r;
      stats.sent++;
      if (stats.dbg) { stats.dbg.req.push([Date.now() - stats.start, /\/ajax\/search\//.test(url) ? 'S' : 'D', inBurst() ? 'B' : '', url.replace(/^\/ajax\/(search\/\w+\/[^?]*\?).*?([?&]p=\d+).*/, '$1$2').replace(/^\/ajax\/illust\//, '') ]); if (stats.dbg.req.length > 3000) stats.dbg.req.shift(); }
      try { r = await fetch(API + url, { credentials: 'include', headers: { Accept: 'application/json' }, signal: ctrl ? ctrl.signal : undefined }); }
      catch (e) { if (stop) throw Aborted(); await sleep(2000); continue; }
      if (r.status === 429 || r.status === 403) {
        hits429++; limited = r.status; stats.refusedAt = Date.now(); stats.refusedIdx = stats.sent; try { localStorage.setItem(LAST429, JSON.stringify({ t: Date.now(), protect: cfg.protect !== false })); } catch (e) { } stats.refusedPhase = cfg.burst ? (stats.sent <= stats.burstSent ? '爆发期' : '爆发后') : '';
        logRun('HTTP ' + r.status);
        try { localStorage.setItem(COOL_KEY, String(Date.now() + COOL_MS)); } catch (e) { }
        doStop(''); showCooldown(); throw Aborted();
      }
      if (r.status >= 500) { await sleep(3000); continue; }
      if (r.status < 200 || r.status >= 300) throw new Error('HTTP ' + r.status);
      var j; try { j = await r.json(); } catch (e) { await sleep(2000); continue; }
      if (j.error) throw new Error(j.message || '接口错误');
      return j.body;
    }
    throw new Error('请求失败');
  }

  function fromSearch(d) {
    return { id: String(d.id), title: d.title, user: d.userName, uid: d.userId, url: d.url, pages: d.pageCount || 1, type: d.illustType | 0, r18: (d.xRestrict || 0) > 0, date: d.createDate || d.updateDate || '', tags: Array.isArray(d.tags) ? d.tags.slice(0, 40) : [], ai: d.aiType === 2 };
  }

  /* ---------- 原图下载 ----------
   * 原图地址来自 /ajax/illust/{id}/pages 的 body[].urls.original（i.pximg.net/img-original/...），不用 regular/master1200。
   * i.pximg.net 没有 Access-Control-Allow-Origin，页面里的 fetch 读不到图片数据（CORS），且没有 Referer: https://www.pixiv.net/ 会 403。
   * 所以：有 GM_xmlhttpRequest / GM.xmlHttpRequest（Tampermonkey、iOS Userscripts）时用它带 Referer 取 Blob 再保存；
   * 都没有或失败时，弹出原图链接列表（从 pixiv 页面点开会带上 Referer，可长按保存）。 */
  var dlQueue = [], dlBusy = false, dlLast = 0, dlProg = {}, dlStopFlag = false;
  var batch = false, sel = {}, bst = { total: 0 };
  function gmXhr() {
    try { if (typeof GM_xmlhttpRequest === 'function') return function (o) { GM_xmlhttpRequest(o); }; } catch (e) { }
    try { if (typeof GM !== 'undefined' && GM && typeof GM.xmlHttpRequest === 'function') return function (o) { var r = GM.xmlHttpRequest(o); if (r && r.then) r.then(function (x) { }, function (er) { o.onerror && o.onerror(er); }); }; } catch (e) { }
    return null;
  }
  function gmGetBlob(url, onprog) {
    var x = gmXhr(); if (!x) return Promise.reject(new Error('noGM'));
    return new Promise(function (res, rej) {
      var done = false;
      x({ method: 'GET', url: url, responseType: 'blob', headers: { Referer: 'https://www.pixiv.net/' }, timeout: 120000,
        onprogress: function (e) { if (onprog && e && e.total) onprog(e.loaded / e.total); },
        onload: function (r) { if (done) return; done = true; if (r.status === 200 && r.response) res(r.response instanceof Blob ? r.response : new Blob([r.response])); else { var er = new Error('HTTP ' + r.status); er.status = r.status; rej(er); } },
        onerror: function () { if (!done) { done = true; rej(new Error('网络错误')); } }, ontimeout: function () { if (!done) { done = true; rej(new Error('超时')); } } });
    });
  }
  function plainSleep(ms) { return new Promise(function (r) { setTimeout(r, Math.max(0, ms)); }); }
  function coolLeft() { return (+localStorage.getItem(COOL_KEY) || 0) - Date.now(); }
  // 下载也走限速：与扫描共用档位速度，扫描进行中时让扫描优先（多等一个间隔并顺延扫描的下一个时间点）
  async function dlSlot() {
    if (coolLeft() > 0) throw new Error('限流冷却中，还剩 ' + Math.ceil(coolLeft() / 60000) + ' 分钟');
    var gap = 60000 / (cfg.rpm || 60), now = Date.now(), t = Math.max(now, dlLast + gap * (0.5 + Math.random()));
    if (running) { t = Math.max(t, nextAt + gap); nextAt = t + gap; stats.sent++; }
    dlLast = t; await plainSleep(t - now);
  }
  function hit429(code) {
    try { localStorage.setItem(COOL_KEY, String(Date.now() + COOL_MS)); } catch (e) { }
    dlQueue.forEach(function (j) { showProg(j.it.id, '已取消（限流）'); }); dlQueue.length = 0;
    if (running) doStop(''); showCooldown();
    var er = new Error('HTTP ' + code + ' 限流，已停止下载'); er.rate = true; return er;
  }
  function safeName(s) { return String(s || '无题').replace(/[\\/:*?"<>|\u0000-\u001f\u007f]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 60) || '无题'; }
  function fileName(it, n, url) { var ext = (/\.(\w+)(?:\?|$)/.exec(url) || [0, 'jpg'])[1]; return safeName(it.title) + '_' + it.id + '_p' + n + '.' + ext; }
  function saveBlob(blob, name) {
    var u = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = u; a.download = name; a.rel = 'noopener'; a.style.display = 'none';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(u); }, 60000);
  }
  function showProg(id, txt) {
    dlProg[id] = txt;
    var c = document.querySelector('.pxs-card[data-id="' + id + '"] .pxs-dlp'); if (!c) return;
    c.style.display = txt ? 'block' : 'none'; c.textContent = txt || '';
  }
  function linkSheet(it, urls, why) {
    var m = document.createElement('div');
    m.innerHTML = '<div><div style="font-weight:600;margin-bottom:6px">原图链接</div><div style="color:#aaa;margin-bottom:8px"></div><div class="pxs-ls" style="display:flex;flex-direction:column;gap:6px"></div>' +
      '<button data-a="x" class="pxs-mini" style="width:100%;margin-top:10px;background:#444;color:#fff">关闭</button></div>';
    m.querySelector('div > div:nth-child(2)').textContent = (why ? why + '。' : '') + '点开后长按图片保存（从 pixiv 页面打开会带上 Referer，可以正常显示）。';
    var box = m.querySelector('.pxs-ls');
    urls.forEach(function (u, i) { var a = document.createElement('a'); a.href = u; a.target = '_blank'; a.rel = 'noopener'; a.textContent = fileName(it, i, u); a.style.cssText = 'color:#6cf;word-break:break-all;padding:6px 0'; box.appendChild(a); });
    m.addEventListener('click', function (e) { if (e.target.getAttribute('data-a') === 'x' || e.target === m) closeSheet(m); });
    openSheet(m);
  }
  function dlMenuItems(it) {
    if (it.type === 2) {
      var def = ugFmt(), order = [def].concat(['webm', 'gif', 'zip'].filter(function (f) { return f !== def; }));
      return order.filter(function (f) { return f !== 'webm' || canWebm(); }).map(function (f) { return { t: '下载动图（' + UG_NAMES[f] + '）' + (f === def ? ' ✓' : ''), f: function () { enqueueDl(it, false, f); } }; });
    }
    var r = [{ t: it.pages > 1 ? '下载原图（第 1 张）' : '下载原图', f: function () { enqueueDl(it, false); } }];
    if (it.pages > 1) r.unshift({ t: '下载全部 ' + it.pages + ' 张', f: function () { enqueueDl(it, true); } });
    return r;
  }
  /* 极简 ZIP 写入器：只存储不压缩（图片本身已压缩），文件名 UTF-8（通用标志位 bit 11） */
  var CRC_T = null;
  function crc32(u8) {
    if (!CRC_T) { CRC_T = new Uint32Array(256); for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC_T[n] = c >>> 0; } }
    var crc = 0xFFFFFFFF; for (var i = 0; i < u8.length; i++) crc = CRC_T[(crc ^ u8[i]) & 255] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  function utf8(str) {
    if (typeof TextEncoder === 'function') return new TextEncoder().encode(str);
    var b = unescape(encodeURIComponent(str)), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u;
  }
  function makeZip(files) {   // files: [{name, data: Uint8Array}]
    var parts = [], central = [], off = 0, d = new Date(), used = {};
    var dt = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF, dd = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF;
    files.forEach(function (f) {
      var nm = f.name, k = 1; while (used[nm]) nm = f.name.replace(/(\.\w+)?$/, '(' + (k++) + ')$1'); used[nm] = 1;
      var name = utf8(nm), crc = crc32(f.data), sz = f.data.length;
      var h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint16(10, dt, true); h.setUint16(12, dd, true); h.setUint32(14, crc, true); h.setUint32(18, sz, true); h.setUint32(22, sz, true);
      h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
      parts.push(h.buffer, name, f.data);
      var c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
      c.setUint16(12, dt, true); c.setUint16(14, dd, true); c.setUint32(16, crc, true); c.setUint32(20, sz, true); c.setUint32(24, sz, true);
      c.setUint16(28, name.length, true); c.setUint32(42, off, true);
      central.push(c.buffer, name);
      off += 30 + name.length + sz;
    });
    var csize = central.reduce(function (a, b) { return a + (b.byteLength || b.length); }, 0);
    var e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, csize, true); e.setUint32(16, off, true);
    return new Blob(parts.concat(central, [e.buffer]), { type: 'application/zip' });
  }
  function readBlob(b) { return b.arrayBuffer ? b.arrayBuffer() : new Promise(function (r, j) { var fr = new FileReader(); fr.onload = function () { r(fr.result); }; fr.onerror = j; fr.readAsArrayBuffer(b); }); }
  var zipTouched = false;
  function estImages() { var all = !$('pxs-bfirst').checked; return Object.keys(sel).reduce(function (n, k) { var it = sel[k]; return n + (it.type === 2 ? 1 : all ? (it.pages || 1) : 1); }, 0); }
  function syncZipDefault() { if (!zipTouched && $('pxs-bzip')) $('pxs-bzip').checked = estImages() > 3; }
  /* ---------- 动图（ugoira） ----------
   * /ajax/illust/{id}/ugoira_meta：body.originalSrc（原尺寸帧 ZIP，i.pximg.net/img-zip-ugoira/…）、body.frames[{file, delay(ms)}]、body.mime_type。
   * 2026-10 实测：帧 ZIP 为仅存储（method 0）；也兼容 deflate（用 DecompressionStream('deflate-raw')）。 */
  function webmMime() {
    try { if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return ''; } catch (e) { return ''; }
    var c = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
    for (var i = 0; i < c.length; i++) try { if (MediaRecorder.isTypeSupported(c[i])) return c[i]; } catch (e) { }
    return '';
  }
  function canWebm() { return !!webmMime() && typeof HTMLCanvasElement !== 'undefined' && !!HTMLCanvasElement.prototype.captureStream; }
  function ugFmt() { var f = cfg.ugFmt; if (f === 'webm' && !canWebm()) f = ''; return f || (canWebm() ? 'webm' : 'zip'); }
  async function inflateRaw(u8) {
    if (typeof DecompressionStream !== 'function') throw new Error('浏览器不支持解压（DecompressionStream）');
    var ds = new DecompressionStream('deflate-raw'), w = ds.writable.getWriter(), rd = ds.readable.getReader(), out = [], n = 0;
    w.write(u8); w.close();
    for (;;) { var r = await rd.read(); if (r.done) break; out.push(r.value); n += r.value.length; }
    var res = new Uint8Array(n), o = 0; out.forEach(function (c) { res.set(c, o); o += c.length; }); return res;
  }
  async function unzip(u8) {
    var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), e = -1;
    for (var i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
    if (e < 0) throw new Error('不是有效的 ZIP');
    var n = dv.getUint16(e + 10, true), p = dv.getUint32(e + 16, true), files = {}, dec = typeof TextDecoder === 'function' ? new TextDecoder() : null;
    for (var k = 0; k < n; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('ZIP 目录损坏');
      var method = dv.getUint16(p + 10, true), csz = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
      var nb = u8.subarray(p + 46, p + 46 + nl), name = dec ? dec.decode(nb) : String.fromCharCode.apply(null, nb);
      var ds0 = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true), raw = u8.subarray(ds0, ds0 + csz);
      files[name] = method === 0 ? raw : method === 8 ? await inflateRaw(raw) : null;
      if (!files[name]) throw new Error('不支持的压缩方式 ' + method);
      p += 46 + nl + xl + cl;
    }
    return files;
  }
  function frameImage(blob) {
    if (typeof createImageBitmap === 'function') return createImageBitmap(blob);
    return new Promise(function (res, rej) { var u = URL.createObjectURL(blob), im = new Image(); im.onload = function () { res(im); setTimeout(function () { URL.revokeObjectURL(u); }, 1000); }; im.onerror = function () { rej(new Error('帧解码失败')); }; im.src = u; });
  }
  async function toWebm(frames, files, mime, onp) {
    var first = await frameImage(new Blob([files[frames[0].file]], { type: mime })), W = first.width, H = first.height;
    var cv = document.createElement('canvas'); cv.width = W; cv.height = H; var cx = cv.getContext('2d');
    var stream = cv.captureStream(0), track = stream.getVideoTracks()[0], vm = webmMime(), chunks = [];
    var rec = new MediaRecorder(stream, { mimeType: vm, videoBitsPerSecond: Math.min(12e6, W * H * 6) });
    rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
    var done = new Promise(function (r) { rec.onstop = r; });
    var total = frames.reduce(function (a, f) { return a + (f.delay || 100); }, 0), el = 0;
    rec.start();
    for (var i = 0; i < frames.length; i++) {
      if (dlStopFlag) break;
      var img = i === 0 ? first : await frameImage(new Blob([files[frames[i].file]], { type: mime }));
      cx.drawImage(img, 0, 0, W, H); if (img.close) img.close();
      if (track && track.requestFrame) track.requestFrame();
      await plainSleep(frames[i].delay || 100);   // 实时录制：每帧停留的时间就是它的 delay，时间轴准确
      el += frames[i].delay || 100; onp(el / total);
    }
    rec.stop(); await done; try { track.stop(); } catch (e) { }
    return new Blob(chunks, { type: 'video/webm' });
  }
  // ---- 纯 JS GIF 编码：固定 6×7×6 调色板（252 色）+ 有序抖动，LZW 压缩，无限循环 ----
  function gifPalette() { var p = []; for (var r = 0; r < 6; r++) for (var g = 0; g < 7; g++) for (var b = 0; b < 6; b++) p.push([Math.round(r * 51), Math.round(g * 42.5), Math.round(b * 51)]); while (p.length < 256) p.push([0, 0, 0]); return p; }
  var BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  function quantize(rgba, W, H) {
    var idx = new Uint8Array(W * H);
    for (var y = 0, o = 0; y < H; y++) for (var x = 0; x < W; x++, o++) {
      var d = (BAYER[(y & 3) * 4 + (x & 3)] / 16 - 0.5), q = o * 4;
      var r = Math.min(5, Math.max(0, Math.round(rgba[q] / 51 + d))), g = Math.min(6, Math.max(0, Math.round(rgba[q + 1] / 42.5 + d))), b = Math.min(5, Math.max(0, Math.round(rgba[q + 2] / 51 + d)));
      idx[o] = r * 42 + g * 6 + b;
    }
    return idx;
  }
  function lzw(idx, minCode, out) {
    var clear = 1 << minCode, eoi = clear + 1, size = minCode + 1, next = eoi + 1, dict = new Map(), cur = 0, bits = 0, buf = [], prefix = -1;
    function emit(c) { cur |= c << bits; bits += size; while (bits >= 8) { buf.push(cur & 255); cur >>>= 8; bits -= 8; } }
    emit(clear);
    for (var i = 0; i < idx.length; i++) {
      var k = idx[i];
      if (prefix < 0) { prefix = k; continue; }
      var key = prefix * 256 + k, v = dict.get(key);
      if (v !== undefined) { prefix = v; continue; }
      emit(prefix);
      if (next < 4096) { dict.set(key, next++); if (next > (1 << size) && size < 12) size++; }
      else { emit(clear); dict.clear(); size = minCode + 1; next = eoi + 1; }
      prefix = k;
    }
    if (prefix >= 0) emit(prefix);
    emit(eoi); if (bits > 0) buf.push(cur & 255);
    out.push(minCode);
    for (var j = 0; j < buf.length; j += 255) { var n = Math.min(255, buf.length - j); out.push(n); for (var t = 0; t < n; t++) out.push(buf[j + t]); }
    out.push(0);
  }
  function gifEncoder(W, H) {
    var out = [], pal = gifPalette();
    function w16(v) { out.push(v & 255, (v >> 8) & 255); }
    'GIF89a'.split('').forEach(function (c) { out.push(c.charCodeAt(0)); });
    w16(W); w16(H); out.push(0xF7, 0, 0);
    pal.forEach(function (c) { out.push(c[0], c[1], c[2]); });
    out.push(0x21, 0xFF, 11); 'NETSCAPE2.0'.split('').forEach(function (c) { out.push(c.charCodeAt(0)); }); out.push(3, 1, 0, 0, 0);
    var parts = [];
    return {
      add: function (rgba, delayMs) {
        out.push(0x21, 0xF9, 4, 0, 0, 0, 0, 0); var cs = Math.max(2, Math.round(delayMs / 10)); out[out.length - 4] = cs & 255; out[out.length - 3] = cs >> 8;
        out.push(0x2C); w16(0); w16(0); w16(W); w16(H); out.push(0);
        lzw(quantize(rgba, W, H), 8, out);
        parts.push(new Uint8Array(out)); out = [];
      },
      finish: function () { parts.push(new Uint8Array(out.concat([0x3B]))); return new Blob(parts, { type: 'image/gif' }); }
    };
  }
  async function toGif(frames, files, mime, onp) {
    var first = await frameImage(new Blob([files[frames[0].file]], { type: mime }));
    var W = first.width, H = first.height, sc = Math.min(1, 800 / Math.max(W, H)); W = Math.max(1, Math.round(W * sc)); H = Math.max(1, Math.round(H * sc));   // GIF 最长边限制 800px，避免过慢过大
    var cv = document.createElement('canvas'); cv.width = W; cv.height = H; var cx = cv.getContext('2d'), enc = gifEncoder(W, H);
    for (var i = 0; i < frames.length; i++) {
      if (dlStopFlag) break;
      var img = i === 0 ? first : await frameImage(new Blob([files[frames[i].file]], { type: mime }));
      cx.drawImage(img, 0, 0, W, H); if (img.close) img.close();
      enc.add(cx.getImageData(0, 0, W, H).data, frames[i].delay || 100);
      onp((i + 1) / frames.length); await plainSleep(0);
    }
    return enc.finish();
  }
  async function dlUgoira(it, fmt, sink) {
    if (fmt === 'webm' && !canWebm()) fmt = 'zip';
    showProg(it.id, '读取动图信息…');
    await dlSlot();
    var r = await fetch(API + '/ajax/illust/' + it.id + '/ugoira_meta', { credentials: 'include', headers: { Accept: 'application/json' } });
    if (r.status === 429 || r.status === 403) throw hit429(r.status);
    var jb = await r.json(); if (jb.error || !jb.body) throw new Error(jb.message || '读取失败');
    var meta = jb.body, src = meta.originalSrc || meta.src, frames = meta.frames || [];
    if (!src || !frames.length) throw new Error('没有动图数据');
    if (!gmXhr()) { showProg(it.id, ''); linkSheet(it, [src], '当前脚本管理器没有提供 GM_xmlhttpRequest，只能打开帧 ZIP'); return false; }
    showProg(it.id, '下载动图 0%');
    await dlSlot();
    var zb;
    try { zb = await gmGetBlob(src, function (f) { showProg(it.id, '下载动图 ' + Math.round(f * 100) + '%'); }); }
    catch (e) { if (e.status === 429) throw hit429(429); throw e; }
    if (dlStopFlag) { showProg(it.id, '已停止'); return 0; }
    var base = safeName(it.title) + '_' + it.id, out, name;
    var u8 = new Uint8Array(await readBlob(zb)), files = await unzip(u8), mime = meta.mime_type || 'image/jpeg';
    frames = frames.filter(function (f) { return files[f.file]; });
    if (!frames.length) throw new Error('帧 ZIP 内容与 frames 不一致');
    if (fmt === 'zip') {
      var list = Object.keys(files).map(function (k) { return { name: k, data: files[k] }; });
      list.push({ name: 'animation.json', data: utf8(JSON.stringify({ id: it.id, title: it.title, mime_type: mime, originalSrc: src, frames: frames }, null, 1)) });
      out = makeZip(list); name = base + '_ugoira.zip';
    } else {
      var onp = function (f) { showProg(it.id, '合成中 ' + Math.round(f * 100) + '%'); };
      onp(0);
      out = fmt === 'gif' ? await toGif(frames, files, mime, onp) : await toWebm(frames, files, mime, onp);
      if (dlStopFlag) { showProg(it.id, '已停止'); return 0; }
      name = base + (fmt === 'gif' ? '.gif' : '.webm');
    }
    if (sink) sink.push({ name: name, blob: out }); else saveBlob(out, name);
    showProg(it.id, '✓ ' + (sink ? '已生成（待打包）' : '已保存') + ' ' + UG_NAMES[fmt].split('，')[0]);
    return 1;
  }
  function toggleSel(card) { var it = card.__it; if (sel[it.id]) delete sel[it.id]; else sel[it.id] = it; card.classList.toggle('sel', !!sel[it.id]); drawBat(); }
  function drawBat() {
    var bar = $('pxs-batbar'); if (!bar) return;
    bar.style.display = batch ? '' : 'none'; $('pxs-bat').classList.toggle('on', batch);
    var n = Object.keys(sel).length; $('pxs-bsel').textContent = '已选 ' + n; if (!bst.running) syncZipDefault();
    $('pxs-bgo').textContent = bst.running ? '停止' : '下载所选';
    var t = '';
    if (bst.total) t = (bst.running ? '批量下载中 ' : bst.limited ? '已因限流停止 ' : bst.stopped ? '已停止 ' : '批量下载完成 ') + (bst.done + bst.fail + bst.skip) + '/' + bst.total + ' 件 · 已保存 ' + bst.files + ' 张' + (bst.fail ? ' · 失败 ' + bst.fail : '') + (bst.skip ? ' · 跳过动图 ' + bst.skip : '') + (bst.zipMsg ? ' · ' + bst.zipMsg : '');
    $('pxs-bprog').textContent = t;
  }
  function batchGo() {
    if (bst.running) { dlStopFlag = true; dlQueue.forEach(function (j) { showProg(j.it.id, '已取消'); }); dlQueue.length = 0; bst.stopped = true; drawBat(); return; }
    var list = Object.keys(sel).map(function (k) { return sel[k]; });
    if (!list.length) { $('pxs-bprog').textContent = '请先点选作品'; return; }
    if (coolLeft() > 0) { $('pxs-bprog').textContent = '限流冷却中，还剩 ' + Math.ceil(coolLeft() / 60000) + ' 分钟'; return; }
    var all = !$('pxs-bfirst').checked;
    bst = { total: list.length, done: 0, fail: 0, skip: 0, files: 0, running: true, limited: false, stopped: false, desel: false, zip: $('pxs-bzip').checked ? [] : null, zipMsg: '' };
    list.forEach(function (it) {
      if (!dlQueue.some(function (j) { return j.it.id === it.id; })) { dlQueue.push({ it: it, all: all, batch: true, fmt: $('pxs-bug').value }); showProg(it.id, '排队中'); }
    });
    drawBat(); if (!dlBusy) dlWorker(); else if (!dlQueue.length) { bst.running = false; drawBat(); }
  }
  function enqueueDl(it, all, fmt) {
    if (dlQueue.some(function (j) { return j.it.id === it.id; })) return;
    dlQueue.push({ it: it, all: !!all, fmt: fmt }); showProg(it.id, '排队中（' + dlQueue.length + '）');
    if (!dlBusy) dlWorker();
  }
  async function dlWorker() {
    dlBusy = true;
    while (dlQueue.length) {
      var j = dlQueue.shift(), it = j.it;
      var ok = false;
      try { ok = it.type === 2 ? await dlUgoira(it, j.fmt || ugFmt(), j.batch && bst.zip ? bst.zip : null) : await dlOne(it, j.all, j.batch && bst.zip ? bst.zip : null); }
      catch (e) { showProg(it.id, '失败：' + e.message); status('下载失败（' + it.id + '）：' + e.message); if (j.batch) bst.fail++; if (e.rate) { bst.limited = true; drawBat(); break; } drawBat(); continue; }
      if (j.batch) { if (ok === 'skip') bst.skip++; else if (ok) { bst.done++; bst.files += ok; if (bst.desel) { delete sel[it.id]; } } else if (!dlStopFlag) bst.fail++; drawBat(); }
    }
    if (bst.zip && bst.zip.length && !bst.zipped) {
      bst.zipped = true; bst.zipMsg = '打包中…'; drawBat();
      try {
        var files = [];
        for (var zi = 0; zi < bst.zip.length; zi++) files.push({ name: bst.zip[zi].name, data: new Uint8Array(await readBlob(bst.zip[zi].blob)) });
        var zb = makeZip(files), nm = 'pixiv_' + safeName(state.tag || 'pixiv').slice(0, 30) + '_' + files.length + '张.zip';
        saveBlob(zb, nm); bst.zipMsg = '已打包 ' + nm + '（' + (zb.size / 1048576).toFixed(1) + ' MB）';
      } catch (e) { bst.zipMsg = '打包失败：' + e.message; }
      bst.zip = [];
    }
    dlBusy = false; dlStopFlag = false; if (bst.total) { bst.running = false; drawBat(); }
  }
  async function dlOne(it, all, sink) {
    showProg(it.id, '读取原图地址…');
    await dlSlot();
    var r = await fetch(API + '/ajax/illust/' + it.id + '/pages', { credentials: 'include', headers: { Accept: 'application/json' } });
    if (r.status === 429 || r.status === 403) throw hit429(r.status);
    var jb = await r.json(); if (jb.error || !Array.isArray(jb.body)) throw new Error(jb.message || '读取失败');
    var urls = jb.body.map(function (p) { return p && p.urls && p.urls.original; }).filter(Boolean);
    if (!urls.length) throw new Error('没有原图地址');
    if (/ugoira/.test(urls[0])) { showProg(it.id, '动图已跳过'); return 'skip'; }
    if (!all) urls = urls.slice(0, 1);
    if (!gmXhr()) { showProg(it.id, ''); dlQueue.length = 0; linkSheet(it, urls, '当前脚本管理器没有提供 GM_xmlhttpRequest，无法直接保存'); return false; }
    for (var i = 0; i < urls.length; i++) {
      if (dlStopFlag) { showProg(it.id, '已停止（已存 ' + i + ' 张）'); return i; }
      var base = (urls.length > 1 ? (i + 1) + '/' + urls.length + ' ' : '');
      showProg(it.id, '下载 ' + base + '0%');
      await dlSlot();
      var blob;
      try { blob = await gmGetBlob(urls[i], function (f) { showProg(it.id, '下载 ' + base + Math.round(f * 100) + '%'); }); }
      catch (e) {
        if (e.status === 429) throw hit429(429);
        showProg(it.id, ''); if (!dlQueue.some(function (q) { return q.batch; })) linkSheet(it, urls.slice(i), '直接下载失败（' + e.message + '）'); else showProg(it.id, '失败：' + e.message); return i;
      }
      if (sink) sink.push({ name: fileName(it, i, urls[i]), blob: blob }); else saveBlob(blob, fileName(it, i, urls[i]));
    }
    showProg(it.id, sink ? '✓ 已下载 ' + urls.length + ' 张（待打包）' : '✓ 已保存 ' + urls.length + ' 张');
    return urls.length;
  }

  /* ---------- 结果持久化：按搜索词存 IndexedDB，返回时可恢复（含页码和滚动位置） ---------- */
  var RES_MAX = 10, VIEWK = 'pxsort_view', resDB = null;
  function resOpen() {
    if (resDB) return resDB;
    resDB = new Promise(function (res) {
      try {
        var rq = indexedDB.open('pxsort_res', 1);
        rq.onupgradeneeded = function () { rq.result.createObjectStore('r', { keyPath: 'q' }); };
        rq.onsuccess = function () { res(rq.result); }; rq.onerror = function () { res(null); };
      } catch (e) { res(null); }
    });
    return resDB;
  }
  function packItem(i) { return [i.id, i.title, i.user, i.uid, i.url, i.pages, i.r18 ? 1 : 0, i.date, (i.tags || []).slice(0, 8), i.ai ? 1 : 0, i.bm, i.like, i.view, i.type | 0]; }
  function unpackItem(a) { return { id: a[0], title: a[1], user: a[2], uid: a[3], url: a[4], pages: a[5], r18: !!a[6], date: a[7], tags: a[8] || [], ai: !!a[9], bm: a[10], like: a[11], view: a[12], rate: a[12] ? a[10] / a[12] : 0, type: a[13] | 0 }; }
  async function saveResults() {
    var db = await resOpen(); if (!db || !state.tag) return;
    var rec = { q: state.tag, word: state.word, t: Date.now(), total: state.total, scanned: state.scanned, pixivTotal: state.pixivTotal, items: state.items.slice(0, 5000).map(packItem) };
    try {
      var tx = db.transaction('r', 'readwrite'), st = tx.objectStore('r'); st.put(rec);
      var all = st.getAll(); all.onsuccess = function () { all.result.sort(function (a, b) { return b.t - a.t; }).slice(RES_MAX).forEach(function (o) { st.delete(o.q); }); };
    } catch (e) { }
  }
  async function loadResults(q) {
    var db = await resOpen(); if (!db) return null;
    return new Promise(function (res) { try { var g = db.transaction('r').objectStore('r').get(q); g.onsuccess = function () { res(g.result || null); }; g.onerror = function () { res(null); }; } catch (e) { res(null); } });
  }
  var viewTimer = 0;
  function saveView() { try { sessionStorage.setItem(VIEWK, JSON.stringify({ q: state.tag, page: state.page, scroll: ov.scrollTop | 0, open: ov.classList.contains('open') })); } catch (e) { } }
  function restoreFrom(rec, view) {
    state = { tag: rec.q, word: rec.word, Q: buildQuery(rec.q), items: rec.items.map(unpackItem), scanned: rec.scanned, total: rec.total, page: (view && view.page) || 1, pixivTotal: rec.pixivTotal, failed: [], pagesOk: 0, pagesFail: 0, ads: 0, blocked: 0, saved: 0, restored: rec.t };
    $('pxs-q').value = rec.q; qTouched = rec.q !== getTag();
    openOv();
    var sc = view && view.scroll; if (sc) setTimeout(function () { ov.scrollTop = sc; }, 60);
    status('已恢复上次结果（' + state.items.length + ' 件，' + fmtTs(rec.t) + '）');
  }
  async function initRestore() {
    var view = null; try { view = JSON.parse(sessionStorage.getItem(VIEWK) || 'null'); } catch (e) { }
    var q = (view && view.q) || getTag(); if (!q) return;
    var rec = await loadResults(q); if (!rec || !rec.items || !rec.items.length || running || state.tag) return;
    var b = $('pxs-restore'); b.style.display = ''; b.textContent = '恢复上次结果（' + rec.items.length + ' 件）';
    b.onclick = function () { restoreFrom(rec, view); b.style.display = 'none'; };
    if (view && view.open) { restoreFrom(rec, view); b.style.display = 'none'; }
  }

  /* ---------- multi-tag query / blocklist / presets ---------- */
  // Pixiv 搜索语法（pixiv 帮助中心与 pixiv 百科「pixiv検索」）：空格 = AND，OR = 或，半角 - = 排除，半角括号包住 OR 部分；
  // 关键词内的半角括号会干扰分组，pixiv 半角/全角括号等价，所以改成全角。
  function normT(t) { t = String(t || '').trim(); try { t = t.normalize('NFKC'); } catch (e) { } return t.toLowerCase(); }
  function srvTerm(t) { return t.replace(/\(/g, '（').replace(/\)/g, '）'); }
  function parseQuery(str) {
    var toks = [], re = /(-?)"([^"]*)"|[^\s"]+/g, m;
    str = String(str || '').replace(/｜/g, '|');
    while ((m = re.exec(str))) {
      if (m[2] !== undefined) { if (m[2].trim()) toks.push({ t: m[2].trim().replace(/\s+/g, ' '), neg: !!m[1], q: true }); continue; }
      // 分组括号只认词首的 "(" 和多余的词尾 ")"；"甘雨(原神)" 这类标签里的括号保留
      var w = m[0].replace(/^\(+/, ''), o = (w.match(/\(/g) || []).length;
      while (w.slice(-1) === ')' && (w.match(/\)/g) || []).length > o) w = w.slice(0, -1);
      if (!w) continue;
      w.split(/(\|)/).forEach(function (x) { if (x) toks.push(x === '|' ? { or: true } : x === 'OR' ? { or: true } : x[0] === '-' && x.length > 1 ? { t: x.slice(1), neg: true } : { t: x }); });
    }
    var groups = [], excl = [], joinNext = false;
    toks.forEach(function (k) {
      if (k.or) { joinNext = groups.length > 0; return; }
      if (k.neg) { excl.push(k.t); joinNext = false; return; }
      if (joinNext) groups[groups.length - 1].push(k.t); else groups.push([k.t]);
      joinNext = false;
    });
    return { groups: groups, excl: excl };
  }
  function buildQuery(str) {
    var pq = parseQuery(str), parts = [], localGroups = [];
    pq.groups.forEach(function (g) {
      var multi = g.some(function (t) { return /\s/.test(t); });
      if (multi) localGroups.push(g);
      var alts = g.map(function (t) { return srvTerm(/\s/.test(t) && g.length > 1 ? t.split(' ')[0] : t); });
      var dedup = alts.filter(function (x, i) { return alts.indexOf(x) === i; });
      parts.push(dedup.length > 1 ? '(' + dedup.join(' OR ') + ')' : dedup[0]);
    });
    var word = parts.join(' '), serverExcl = [], localExcl = [];
    pq.excl.forEach(function (t) {
      var w = '-' + srvTerm(t);
      if (!/\s/.test(t) && serverExcl.length < MAX_SERVER_EXCL && (word + ' ' + w).length <= MAX_WORD_LEN && word) { word += ' ' + w; serverExcl.push(t); }
      else localExcl.push(t);
    });
    return { word: word, groups: pq.groups, localGroups: localGroups, serverExcl: serverExcl, localExcl: localExcl };
  }
  function safeJ(k, d) { try { var v = JSON.parse(localStorage.getItem(k) || 'null'); return v && typeof v === 'object' ? v : d; } catch (e) { return d; } }
  function saveBL() { try { localStorage.setItem(BLK, JSON.stringify(BL)); } catch (e) { } syncBlkUI(); }
  function tagHit(tags, term, partial) {
    var t = normT(term); if (!t) return false;
    for (var i = 0; i < tags.length; i++) { var x = normT(tags[i]); if (x === t || (partial && x.indexOf(t) >= 0)) return true; }
    return false;
  }
  // 返回屏蔽原因（空串 = 保留）。Q 为本次搜索的本地部分（溢出的排除词、带空格的引号词）
  function blockReason(it, Q) {
    var tags = it.tags || [], pt = BL.partial;
    if ((BL.hideAI || grpOn('ai')) && it.ai) return 'AI';
    var bt = effTags();
    if (it.uid && BL.users.some(function (u) { return String(u.id) === String(it.uid); })) return '画师';
    for (var i = 0; i < bt.length; i++) if (tagHit(tags, bt[i], pt)) return '标签';
    for (i = 0; i < BL.must.length; i++) if (!tagHit(tags, BL.must[i], pt)) return '必须包含';
    if (Q) {
      for (i = 0; i < Q.localExcl.length; i++) if (tagHit(tags, Q.localExcl[i], pt)) return '排除';
      for (i = 0; i < Q.localGroups.length; i++) if (!Q.localGroups[i].some(function (t) { return tagHit(tags, t, pt); })) return '搜索条件';
    }
    return '';
  }
  function blockTag(t) { t = String(t).trim(); if (t && !BL.tags.some(function (x) { return normT(x) === normT(t); })) { BL.tags.push(t); saveBL(); } }
  function blockUser(id, name) { if (id && !BL.users.some(function (u) { return String(u.id) === String(id); })) { BL.users.push({ id: String(id), name: name || '' }); saveBL(); } }
  function quoteT(t) { return /[\s()|"]/.test(t) || t === 'OR' ? '"' + t.replace(/"/g, '') + '"' : t; }
  function addToQuery(t, neg) { var q = $('pxs-q'); q.value = (q.value.trim() + ' ' + (neg ? '-' : '') + quoteT(t)).trim(); syncQuickChips(); }
  function queryHasTag(q, t) {
    var n = normT(t), pq = parseQuery(q || '');
    return pq.groups.some(function (g) { return g.some(function (x) { return normT(x) === n; }); });
  }
  function removeFromQuery(t) {
    var qel = $('pxs-q'), esc = String(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    qel.value = qel.value.replace(new RegExp('(?:^|\\s)"?' + esc + '"?(?=\\s|$)', 'g'), ' ').replace(/\s+/g, ' ').trim();
  }
  function toggleQuickTag(t) {
    var qel = $('pxs-q');
    if (queryHasTag(qel.value, t)) removeFromQuery(t);
    else addToQuery(t, false);
    qTouched = true;
    syncQuickChips();
    status((queryHasTag(qel.value, t) ? '已加入搜索：' : '已从搜索去掉：') + t + '（点“开始”重新扫描）');
  }
  function drawQuickChips() {
    var box = $('pxs-qchips'); if (!box) return;
    box.innerHTML = QUICK_TAGS.map(function (x) {
      return '<button type="button" class="pxs-qchip" data-t="' + x[1].replace(/"/g, '') + '" title="加入 #' + x[1].replace(/"/g, '') + '">' + x[0] + '</button>';
    }).join('');
    box.onclick = function (e) {
      var b = e.target.closest ? e.target.closest('.pxs-qchip') : e.target;
      if (!b || !b.getAttribute || !b.getAttribute('data-t')) return;
      toggleQuickTag(b.getAttribute('data-t'));
    };
    syncQuickChips();
  }
  function syncQuickChips() {
    var qel = $('pxs-q'); if (!qel) return;
    var q = qel.value;
    Array.prototype.forEach.call(document.querySelectorAll('.pxs-qchip'), function (b) {
      b.classList.toggle('on', queryHasTag(q, b.getAttribute('data-t')));
    });
  }
  function blText() {
    return '# 屏蔽标签（每行一个）\n' + BL.tags.join('\n') + '\n# 屏蔽画师（user:ID 名字）\n' + BL.users.map(function (u) { return 'user:' + u.id + (u.name ? ' ' + u.name : ''); }).join('\n') + '\n';
  }
  function blImport(text, replace) {
    var tags = replace ? [] : BL.tags.slice(), users = replace ? [] : BL.users.slice();
    String(text || '').split(/\r?\n/).forEach(function (l) {
      l = l.trim(); if (!l || l[0] === '#') return;
      var m = /^user:\s*(\d+)\s*(.*)$/i.exec(l);
      if (m) { if (!users.some(function (u) { return u.id === m[1]; })) users.push({ id: m[1], name: m[2] || '' }); }
      else if (!tags.some(function (x) { return normT(x) === normT(l); })) tags.push(l);
    });
    BL.tags = tags; BL.users = users; saveBL();
  }
  function presets() { return safeJ(PRE, {}); }
  function savePreset(name) {
    if (!name) return false;
    var all = presets();
    all[name] = { q: $('pxs-q').value.trim(), tags: BL.tags.slice(), users: BL.users.slice(), hideAI: BL.hideAI, partial: BL.partial, must: BL.must.slice(), groups: JSON.parse(JSON.stringify(BL.groups || {})),
      minBm: Math.max(0, +$('pxs-min').value || 0), maxBm: Math.max(0, +$('pxs-max').value || 0), rpm: $('pxs-rpm').value, strategy: $('pxs-strat').value, pages: +$('pxs-pages').value || cfg.pages };
    try { localStorage.setItem(PRE, JSON.stringify(all)); } catch (e) { return false; }
    drawPresets(name); return true;
  }
  function loadPreset(name) {
    var p = presets()[name]; if (!p) return false;
    $('pxs-q').value = p.q || ''; qTouched = true;
    BL.tags = (p.tags || []).slice(); BL.users = (p.users || []).slice(); BL.hideAI = !!p.hideAI; BL.partial = !!p.partial; BL.must = (p.must || []).slice(); BL.groups = p.groups ? JSON.parse(JSON.stringify(p.groups)) : {}; saveBL(); drawGroups();
    $('pxs-min').value = p.minBm || 0; $('pxs-max').value = p.maxBm || '';
    if (p.strategy) $('pxs-strat').value = p.strategy;
    if (p.pages) $('pxs-pages').value = p.pages;
    if (p.rpm) { var o = $('pxs-rpm').querySelector('option[value="' + p.rpm + '"]'); $('pxs-rpm').value = o ? p.rpm : '60'; syncRpm(); }
    syncStrat(); state.page = 1; render(true); syncQuickChips(); return true;
  }
  function delPreset(name) { var all = presets(); if (!all[name]) return false; delete all[name]; try { localStorage.setItem(PRE, JSON.stringify(all)); } catch (e) { } drawPresets(''); return true; }
  function drawPresets(sel) {
    var s = $('pxs-pre'); if (!s) return;
    s.innerHTML = '<option value="">搜索方案…</option>';
    Object.keys(presets()).forEach(function (n) { var o = document.createElement('option'); o.value = n; o.textContent = n; s.appendChild(o); });
    s.value = sel || '';
  }
  function syncBlkUI() {
    if (!$('pxs-must')) return;
    $('pxs-must').value = BL.must.join(' '); $('pxs-noai').checked = BL.hideAI; $('pxs-partial').checked = BL.partial;
    var ng = BLOCK_GROUPS.filter(function (g) { return grpOn(g[0]); }).length;
    $('pxs-blksum').textContent = '屏蔽与过滤（' + (ng ? '预设 ' + ng + ' · ' : '') + '标签 ' + BL.tags.length + ' · 画师 ' + BL.users.length + (BL.hideAI ? ' · 隐藏AI' : '') + (BL.must.length ? ' · 必含 ' + BL.must.length : '') + '）';
    scanSum();
  }
  function scanSum() {
    var el = $('pxs-scansum'); if (!el) return;
    var names = { premium: '会员热门', users: 'users入り', new: '最新页', years: '按年份' };
    var strat = ($('pxs-strat') && $('pxs-strat').value) || cfg.strategy;
    var min = $('pxs-min') ? Math.max(0, +$('pxs-min').value || 0) : (cfg.minBm || 0);
    var max = $('pxs-max') ? Math.max(0, +$('pxs-max').value || 0) : (cfg.maxBm || 0);
    var pages = $('pxs-pages') ? Math.max(1, +$('pxs-pages').value || 1) : (cfg.pages || 1);
    el.textContent = '扫描设置（' + (names[strat] || strat) + ' · 收藏 ' + min + '–' + (max || '不限') + ' · ' + pages + ' 页）';
  }
  function drawGroups() {
    var box = $('pxs-groups'); if (!box) return;
    box.innerHTML = '<div style="font-size:12px;color:#aaa;margin:6px 0 2px">屏蔽预设（只是标签过滤列表，默认全关）</div>';
    BLOCK_GROUPS.forEach(function (g) {
      var id = g[0], tags = grpTags(id), row = document.createElement('div'); row.className = 'pxs-grp';
      row.innerHTML = '<label><input type="checkbox" data-g="' + id + '"><span></span></label><button class="pxs-mini" data-ge="' + id + '" style="flex:0 0 auto;padding:0 8px;min-height:30px">标签 ▾</button>';
      row.querySelector('span').textContent = g[1] + '（' + tags.length + '）';
      row.querySelector('input').checked = grpOn(id);
      var ex = document.createElement('div'); ex.className = 'pxs-gx'; ex.style.display = 'none';
      ex.innerHTML = '<div class="pxs-gl"></div><textarea data-gt="' + id + '"></textarea><div style="display:flex;gap:6px;margin-top:4px"><button class="pxs-mini" data-gs="' + id + '">保存修改</button><button class="pxs-mini" data-gr="' + id + '">恢复默认</button></div>';
      ex.querySelector('.pxs-gl').textContent = tags.join('、');
      ex.querySelector('textarea').value = tags.join('\n');
      box.appendChild(row); box.appendChild(ex);
    });
  }
  function grpSet(id, patch) { BL.groups[id] = Object.assign({ on: grpOn(id) }, BL.groups[id] || {}, patch); saveBL(); }
  function onGroupsClick(e) {
    var t = e.target, a;
    if ((a = t.getAttribute('data-ge'))) { var ex = t.parentNode.nextSibling; ex.style.display = ex.style.display === 'none' ? '' : 'none'; t.textContent = ex.style.display ? '标签 ▾' : '标签 ▴'; }
    else if ((a = t.getAttribute('data-gs'))) { var v = t.parentNode.parentNode.querySelector('textarea').value.split(/\r?\n|[,，、]/).map(function (x) { return x.trim(); }).filter(Boolean); grpSet(a, { tags: v }); drawGroups(); render(true); status('已更新预设标签（' + v.length + ' 个）'); }
    else if ((a = t.getAttribute('data-gr'))) { var g = BL.groups[a] || {}; delete g.tags; BL.groups[a] = g; saveBL(); drawGroups(); render(true); }
  }
  function onGroupsChange(e) { var a = e.target.getAttribute('data-g'); if (a) { grpSet(a, { on: e.target.checked }); drawGroups(); render(true); } }
  // 弹层：全屏居中，自带滚动；打开时隐藏面板，关闭后恢复
  function openSheet(m) { m.className = 'pxs-sheet'; m.style.cssText = ''; var was = panel.classList.contains('open'); panel.classList.add('pxs-hide'); document.body.appendChild(m); m.__was = was; }
  function closeSheet(m) { m.remove(); panel.classList.remove('pxs-hide'); }
  var menuOff = null;
  function closeMenu() { var m = $('pxs-menu'); if (m) m.remove(); if (menuOff) { menuOff(); menuOff = null; } if (pendingDraw) { pendingDraw = false; render(true); } }
  function showMenu(x, y, items) {
    closeMenu(); clearTimeout(lpTimer); lpTimer = 0;
    var m = el('div', { id: 'pxs-menu' });
    items = items.concat([{ t: '✕ 关闭', f: function () { } }]);
    items.forEach(function (o) { var b = document.createElement('button'); b.textContent = o.t; b.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); closeMenu(); o.f(); }); m.appendChild(b); });
    document.body.appendChild(m);
    var w = m.offsetWidth || 200, h = m.offsetHeight || 200;
    m.style.left = Math.max(8, Math.min(x, window.innerWidth - w - 8)) + 'px';
    m.style.top = Math.max(8, Math.min(y, window.innerHeight - h - 8)) + 'px';
    var opened = Date.now();
    var onDown = function (e) { if (!m.contains(e.target) && Date.now() - opened > 250) { e.preventDefault && e.cancelable && e.type === 'click' && e.preventDefault(); closeMenu(); } };
    var onScroll = function (e) { if (!m.contains(e.target) && Date.now() - opened > 250) closeMenu(); };
    var onKey = function (e) { if (e.key === 'Escape') { closeMenu(); e.preventDefault(); e.stopPropagation(); } };
    var onPop = function () { closeMenu(); };
    document.addEventListener('pointerdown', onDown, true); document.addEventListener('click', onDown, true);
    document.addEventListener('scroll', onScroll, true); document.addEventListener('keydown', onKey, true); window.addEventListener('popstate', onPop);
    menuOff = function () { document.removeEventListener('pointerdown', onDown, true); document.removeEventListener('click', onDown, true); document.removeEventListener('scroll', onScroll, true); document.removeEventListener('keydown', onKey, true); window.removeEventListener('popstate', onPop); };
  }
  function tagMenuItems(t) {
    return [{ t: '屏蔽此标签 #' + t, f: function () { blockTag(t); status('已屏蔽标签 #' + t); render(true); } },
      { t: '加入搜索 #' + t, f: function () { addToQuery(t, false); qTouched = true; status('已加入搜索：' + t + '（点“开始”重新扫描）'); } },
      { t: '从搜索中排除 -' + t, f: function () { addToQuery(t, true); qTouched = true; status('已加入排除：-' + t + '（点“开始”重新扫描）'); } }];
  }
  function cardMenu(it, x, y) {
    var items = dlMenuItems(it).concat([{ t: '屏蔽此画师 @' + (it.user || it.uid), f: function () { blockUser(it.uid, it.user); status('已屏蔽画师 @' + (it.user || it.uid)); render(true); } }]);
    (it.tags || []).slice(0, 8).forEach(function (t) { items.push({ t: '屏蔽此标签 #' + t, f: function () { blockTag(t); status('已屏蔽标签 #' + t); render(true); } }); });
    (it.tags || []).slice(0, 4).forEach(function (t) { items.push({ t: '加入搜索 #' + t, f: function () { addToQuery(t, false); qTouched = true; status('已加入搜索：' + t + '（点“开始”重新扫描）'); } }); });
    showMenu(x, y, items);
  }
  function blkManager() {
    var m = document.createElement('div');
    m.id = 'pxs-blkm';
    m.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:2147483647;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;padding:12px';
    m.innerHTML = '<div>' +
      '<div style="font-weight:600;margin-bottom:6px">屏蔽管理</div><div id="pxs-blist" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px"></div>' +
      '<div style="color:#aaa;margin-bottom:4px">导入 / 导出（每行一个标签；画师写 user:ID 名字）：</div>' +
      '<textarea id="pxs-bta" style="width:100%;height:30vh;box-sizing:border-box;background:#111;color:#ddd;border:1px solid #444;border-radius:8px;font:12px monospace"></textarea>' +
      '<div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap"><button data-a="rep" class="pxs-mini">用文本替换</button><button data-a="add" class="pxs-mini">合并导入</button><button data-a="copy" class="pxs-mini">复制</button><button data-a="x" class="pxs-mini" style="background:#444;color:#fff">关闭</button></div></div>';
    function draw() {
      var l = m.querySelector('#pxs-blist'); l.textContent = '';
      BL.tags.forEach(function (t, i) { l.appendChild(chip('#' + t, function () { BL.tags.splice(i, 1); saveBL(); draw(); })); });
      BL.users.forEach(function (u, i) { l.appendChild(chip('@' + (u.name || u.id) + ' (' + u.id + ')', function () { BL.users.splice(i, 1); saveBL(); draw(); })); });
      if (!BL.tags.length && !BL.users.length) l.innerHTML = '<span style="color:#888">暂无屏蔽项</span>';
      m.querySelector('#pxs-bta').value = blText();
    }
    function chip(txt, rm) {
      var c = document.createElement('span'); c.style.cssText = 'background:#2c2c2c;border-radius:8px;padding:4px 4px 4px 8px;display:inline-flex;align-items:center;gap:4px;max-width:100%';
      var s = document.createElement('span'); s.textContent = txt; s.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
      var b = document.createElement('button'); b.textContent = '✕'; b.setAttribute('aria-label', '移除'); b.style.cssText = 'border:0;background:#444;color:#fff;border-radius:6px;width:26px;height:26px';
      b.addEventListener('click', rm); c.appendChild(s); c.appendChild(b); return c;
    }
    m.addEventListener('click', function (e) {
      var a = e.target.getAttribute && e.target.getAttribute('data-a'), ta = m.querySelector('#pxs-bta');
      if (a === 'x' || e.target === m) { closeSheet(m); render(true); }
      if (a === 'rep' || a === 'add') { blImport(ta.value, a === 'rep'); draw(); }
      if (a === 'copy') { ta.select(); if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(ta.value).catch(function () { }); else try { document.execCommand('copy'); } catch (er) { } }
    });
    openSheet(m); draw();
  }

  /* ---------- main ---------- */
  var PASS = ['scd', 'ecd', 'wlt', 'wgt', 'hlt', 'hgt', 'ratio', 'tool', 'blt', 'bgt', 'ai_type', 'csw', 'order'];
  function pageParams() {
    var u = new URL(location.href), sp = u.searchParams;
    var tab = (u.pathname.match(/\/(?:tags\/[^/]+|search)\/(artworks|illustrations|illusts|manga)/) || [])[1] || sp.get('tab') || '';
    if (tab === 'illusts') tab = 'illustrations';
    var type = sp.get('type') || '';
    var ep = 'artworks', key = 'illustManga', apiType = 'all';
    if (tab === 'illustrations' || /^(illust|ugoira|illust_and_ugoira)$/.test(type)) { ep = 'illustrations'; key = 'illust'; apiType = type && type !== 'all' ? type : 'illust_and_ugoira'; }
    else if (tab === 'manga' || type === 'manga') { ep = 'manga'; key = 'manga'; apiType = 'manga'; }
    var mode = cfg.mode === 'page' ? (sp.get('mode') || 'all') : cfg.mode;
    var extra = {}; PASS.forEach(function (k) { if (sp.get(k)) extra[k] = sp.get(k); });
    return { ep: ep, key: key, type: apiType, mode: mode, s_mode: sp.get('s_mode') || 's_tag', extra: extra };
  }
  function searchURL(word, pg, P, over) {
    var q = { word: word, order: 'date_d', mode: P.mode, p: pg, s_mode: P.s_mode, type: P.type, lang: 'zh' };
    Object.assign(q, P.extra, over || {});
    return '/ajax/search/' + P.ep + '/' + encodeURIComponent(word) + '?' + Object.keys(q).map(function (k) { return k + '=' + encodeURIComponent(q[k]); }).join('&');
  }
  var USERS = [100, 500, 1000, 5000, 10000, 30000, 50000, 100000];
  var lastQueue = [], lastSeen = {};

  async function run(retryOnly) {
    var pageTag = getTag(); if (!pageTag) { status('当前不是标签页'); return; }
    var qstr = ($('pxs-q').value || '').trim() || pageTag, Q = buildQuery(qstr), tag = Q.word;
    if (!tag) { status('搜索词为空（至少需要一个非排除的标签）'); return; }
    var coolLeft = (+localStorage.getItem(COOL_KEY) || 0) - Date.now();
    if (coolLeft > 0 && !confirm('距离上次被限流的建议冷却还剩 ' + Math.ceil(coolLeft / 60000) + ' 分钟，仍要现在开始吗？')) { showCooldown(); return; }
    running = true; stop = false; limited = false; hits429 = 0; conc = cfg.rand ? 4 : concFor(cfg.rpm); stats = newStats(); if (cfg.burst) conc = bConc();
 nextAt = 0; ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    $('pxs-go').textContent = '停止'; btn.classList.add('busy'); $('pxs-retry').style.display = 'none';
    var queue, seen;
    if (retryOnly && state.tag === qstr && state.failed && state.failed.length) {
      queue = state.failed; state.failed = []; seen = lastSeen;
    } else {
      state = { tag: qstr, word: tag, Q: Q, items: [], scanned: 0, total: 0, page: 1, pixivTotal: 0, failed: [], pagesOk: 0, pagesFail: 0, ads: 0, blocked: 0, saved: 0, outRange: 0, belowMin: 0, aboveMax: 0 };
      queue = []; seen = {};
    }
    var keepTarget = Math.min(MAX_RESULTS, Math.max(1, cfg.pages || 1) * PAGE_SIZE);
    var P = pageParams();
    function prog() {
      if (limited) return;
      status('目标 ' + keepTarget + ' 件' + (state.capped ? '（已达目标，停止翻页）' : '') + ' · 扫描到 ' + state.total + ' 个 / 共 ' + (state.pixivTotal || '?') + ' 个（Pixiv 总数）· 已查 ' + state.scanned +
        '（保留 ' + state.items.length + (state.belowMin ? '，低于最低收藏 ' + state.belowMin : '') + (state.aboveMax ? '，超过最高收藏 ' + state.aboveMax : '') + (!state.belowMin && !state.aboveMax && state.outRange ? '，范围外 ' + state.outRange : '') + ((cfg.minBm || cfg.maxBm) ? '，范围 ' + (cfg.minBm || 0) + '–' + (cfg.maxBm || '不限') : '') + '）' + (state.notice ? ' · ' + state.notice : '') + (state.blocked ? ' · 已屏蔽 ' + state.blocked + ' 个（节省 ' + state.saved + ' 次请求）' : '') + (Q.localExcl.length || Q.localGroups.length ? ' · 本地过滤 ' + (Q.localExcl.length + Q.localGroups.length) + ' 项' : '') + (state.failed.length ? ' · 失败 ' + state.failed.length + ' 个' : '') +
        (state.pagesFail ? ' · 搜索页失败 ' + state.pagesFail : '') + ' · 近30秒 ' + recentRpm() + ' 次/分 · 平均 ' + liveRpm() + '（档位 ' + (cfg.burst ? (inBurst() ? (cfg.burst === 'spike' ? '瞬时爆发' : '爆发 ' + bRate()) : '爆发后 ' + cfg.rpm) : cfg.rpm) + '）');
    }
    try {
      if (!retryOnly) {
        // build search jobs
        var jobs = [];
        var G = {};   // 每组：目标件数 = 页数×60，已拿到件数、Pixiv 总数、已排到第几页
        var grpInit = function (grp, n) { G[grp] = { target: n * PAGE_SIZE, got: 0, total: 0, maxP: n, extra: 0 }; };
        var addPages = function (word, n, over, isMain) { var grp = word + JSON.stringify(over || {}); grpInit(grp, n); for (var p = 1; p <= n; p++) jobs.push({ word: word, p: p, over: over, main: isMain, grp: grp }); };
        var strat = cfg.strategy, b1 = null;
        var pop = { order: 'popular_d' };
        if (cfg.minBm) pop.blt = cfg.minBm;
        if (cfg.maxBm) pop.bgt = cfg.maxBm;
        var dateRange = { order: 'date_d' };
        if (cfg.minBm) dateRange.blt = cfg.minBm;
        if (cfg.maxBm) dateRange.bgt = cfg.maxBm;
        if (strat === 'premium') {
          status('会员热门排序：读取第 1 页…');
          try { b1 = await getJSON(searchURL(tag, 1, P, pop)); } catch (e) { if (e.aborted) throw e; }
          var d1 = b1 ? ((b1[P.key] || b1.illustManga || b1.illust || b1.manga || {}).data || []).filter(function (d) { return d && d.id && !d.isAdContainer; }) : [];
          var desc = 0; for (var k = 1; k < d1.length; k++) if (+d1[k].id < +d1[k - 1].id) desc++;
          if (!b1 || (d1.length >= 10 && desc / (d1.length - 1) > 0.9)) {
            strat = 'users'; b1 = null;
            state.notice = '未检测到 Pixiv 会员热门排序（结果仍按时间排列或请求失败），已自动改用「users入り 快速」。';
            status(state.notice); await sleep(1500);
          }
        }
        if (strat === 'premium') {
          grpInit('pop', cfg.pages);
          if (cfg.maxBm || cfg.minBm) state.rangeProbing = true;
          // 设了收藏范围时，先只消化第 1 页并抽查范围是否生效，再决定要不要继续翻热门页
          if (!cfg.maxBm && !cfg.minBm) {
            for (var pp = 2; pp <= cfg.pages; pp++) jobs.push({ word: tag, p: pp, over: pop, main: true, grp: 'pop' });
          }
        } else if (strat === 'users') {
          var lo = USERS.filter(function (u) { return u <= Math.max(100, cfg.minBm); }).pop() || USERS[0];
          var tiers = USERS.filter(function (u) { return u >= lo && (!cfg.maxBm || u <= cfg.maxBm); });
          if (!tiers.length) tiers = [USERS[USERS.length - 1]];
          tiers.forEach(function (u) { addPages(tag + ' ' + u + 'users入り', cfg.pages, { s_mode: 's_tag' }, false); });
          addPages(tag, 1, null, true);
        } else if (cfg.strategy === 'years') {
          var y1 = new Date().getFullYear();
          for (var y = y1; y >= 2008; y--) addPages(tag, cfg.yearPages, { scd: y + '-01-01', ecd: y + '-12-31' }, false);
          addPages(tag, 1, null, true);
        } else addPages(tag, cfg.pages, null, true);
        var lastPageOf = {}, grpJob = {}, ji = 0;
        var take = function (b, j) {
            var sec = b[P.key] || b.illustManga || b.illust || b.manga || {};
            var data = sec.data || [];
            if (sec.lastPage) lastPageOf[j.grp] = sec.lastPage;
            if (j.main && sec.total) state.pixivTotal = sec.total;
            state.pagesOk++;
            grpJob[j.grp] = { word: j.word || tag, over: j.over || (j.grp === 'pop' ? pop : null), main: j.main, grp: j.grp };
            var real = data.filter(function (d) { return d && d.id && !d.isAdContainer; }).length, g = G[j.grp];
            if (stats.dbg) stats.dbg.pages.push([j.grp === 'pop' ? 'pop' : j.grp.slice(0, 30), j.p || 1, data.length, real]);
            if (g) {
              g.got += real; if (sec.total) g.total = sec.total;
              // 抽查收藏范围是否生效时不要自动补热门后续页，否则会在回退前把大量范围外作品都查一遍
              // 手机版 Pixiv 每页只返回约 36 件（与 UA 有关，页与页之间连续不丢），按“页数×60 件”的目标自动多翻页；拿满 Pixiv 总数或到最后一页就停
              if (!state.rangeProbing && (j.p || 1) === g.maxP && real > 0 && g.got < g.target && (!g.total || g.got < g.total) && (!sec.lastPage || g.maxP < sec.lastPage) && g.extra < g.maxP * 2 + 5) {
                g.maxP++; g.extra++; jobs.push({ word: j.word || tag, p: g.maxP, over: j.over || (j.grp === 'pop' ? pop : null), main: j.main, grp: j.grp });
              }
            }
            data.forEach(function (d) {
              if (!d || d.isAdContainer || !d.id) { state.ads++; return; }
              var id = String(d.id); if (seen[id]) return; seen[id] = 1;
              var it = fromSearch(d), c = cacheGet(id);
              state.total++;
              if (typeof d.bookmarkCount === 'number') { c = { bm: d.bookmarkCount, like: d.likeCount | 0, view: d.viewCount | 0 }; cachePut(id, c); }
              if (blockReason(it, Q)) { state.blocked++; if (!c) state.saved++; return; }   // 本地预过滤：不发详情请求
              if (state.items.length >= keepTarget) { state.capped = true; return; }
              if (queue.length >= MAX_RESULTS) return;
              if (c) { addResult(it, c); state.scanned++; } else queue.push(it);
            });
            prog(); scheduleRender();
        };
        if (b1) take(b1, { grp: 'pop', main: true, p: 1, word: tag, over: pop });
        var pageWorker = async function () {
          while (ji < jobs.length && !stop && !state.capped) {
            var j = jobs[ji++];
            if (lastPageOf[j.grp] && j.p > lastPageOf[j.grp]) continue;
            if (G[j.grp] && G[j.grp].total && G[j.grp].got >= G[j.grp].total) continue;   // 已拿满 Pixiv 总数
            var b = null;
            try { b = await getJSON(searchURL(j.word, j.p, P, j.over)); } catch (e) { if (e.aborted) return; }
            if (!b) { state.pagesFail++; prog(); continue; }
            take(b, j);
          }
        };
        var runJobs = async function () {
          var pw = []; for (var q = 0; q < conc; q++) pw.push(pageWorker()); await Promise.all(pw);
        };
        await runJobs();
        if (strat === 'premium' && (cfg.maxBm || cfg.minBm) && !stop && !limited) {
          var addRangeJobs = function () {
            var lo2 = USERS.filter(function (u) { return u <= Math.max(100, cfg.minBm); }).pop() || USERS[0];
            var tiers2 = USERS.filter(function (u) { return u >= lo2 && (!cfg.maxBm || u <= cfg.maxBm); });
            if (!tiers2.length) tiers2 = [lo2];
            tiers2.forEach(function (u) { addPages(tag + ' ' + u + 'users入り', cfg.pages, Object.assign({ s_mode: 's_tag' }, dateRange), false); });
            addPages(tag, cfg.pages, dateRange, true);
          };
          var rangeBroken = function () {
            var jn = state.items.length + (state.outRange || 0);
            if (jn < 8) return '';
            if (cfg.maxBm && (state.aboveMax || 0) / jn >= 0.5) return 'max';
            if (cfg.minBm && (state.belowMin || 0) / jn >= 0.5) return 'min';
            return '';
          };
          var startFallback = async function (why) {
            state.bgtIgnored = true;
            state.rangeProbing = false;
            state.rangeWhy = why;
            var hi = cfg.maxBm || '不限';
            state.notice = why === 'min'
              ? ('Pixiv 热门排序未筛掉低于最低收藏的作品，已改在 ' + cfg.minBm + '–' + hi + ' 范围内继续搜索。')
              : ('Pixiv 热门排序未应用最高收藏上限，已改在 ' + cfg.minBm + '–' + hi + ' 范围内继续搜索。');
            status(state.notice);
            state.capped = false;
            // 热门第 1 页里还没判定的作品可能已在范围内，丢掉它们会让正常结果消失；先查完这一页再改走范围搜索，但不继续翻热门后续页
            if (queue.length && !stop && !limited) {
              var rest = await lookup(queue.splice(0, queue.length), prog);
              if (rest.length) state.failed = (state.failed || []).concat(rest);
            } else queue.length = 0;
            addRangeJobs();
            await runJobs();
          };
          var probeRange = async function () {
            var judged = state.items.length + (state.outRange || 0);
            if (judged < 10 && queue.length) {
              var leftover = await lookup(queue.splice(0, Math.min(10 - judged, queue.length)), prog);
              if (leftover.length) state.failed = (state.failed || []).concat(leftover);
            }
            return rangeBroken();
          };
          var why = await probeRange();
          if (why) await startFallback(why);
          else {
            state.rangeProbing = false;
            for (var pp2 = 2; pp2 <= cfg.pages; pp2++) jobs.push({ word: tag, p: pp2, over: pop, main: true, grp: 'pop' });
            await runJobs();
            if (!state.bgtIgnored && (why = await probeRange())) await startFallback(why);
          }
        }
        if (P.mode === 'r18' || P.mode === 'all') { /* server applies the account's own R-18/AI display settings */ }
      }
      // bookmark counts with retries
      if (queue.length && !stop) queue = await lookup(queue, prog);
      state.failed = queue;
      lastSeen = seen;
      if (!limited) { prog(); status((stop ? '已停止。' : '完成。') + (state.notice ? state.notice + ' ' : '') + $('pxs-status').textContent); }
      if (state.failed.length) $('pxs-retry').style.display = '';
      if (!limited) logRun(stop ? 'stop' : 'ok');
    } catch (e) { if (!e.aborted) status('出错：' + e.message + '（是否已登录？）'); }
    ctrl = null; cacheSave(); running = false; $('pxs-go').textContent = '开始'; btn.classList.remove('busy'); render(true);
    if (state.items.length) saveResults();
    if (!ov.classList.contains('open') && state.items.length) openOv();
  }

  var progT = 0;
  function progSoon(fn) { if (!progT) progT = setTimeout(function () { progT = 0; fn(); }, 250); }   // 每完成一个就刷新（节流 250ms），不再每 5 个刷新一次
  var lookupActive = false;
  function lookup(list, prog) {
    lookupActive = true;
    var qi = 0, active = 0, failed = [];
    return new Promise(function (resolve) {
      function pump() {
        if ((qi >= list.length || stop) && active === 0) { lookupActive = false; if (stop) failed = failed.concat(list.slice(qi)); return resolve(failed); }
        while (active < conc && qi < list.length && !stop) {
          var it = list[qi++]; active++;
          getJSON('/ajax/illust/' + it.id).then(function (it, info) {
            if (!info || typeof info.bookmarkCount !== 'number') throw new Error('bad');
            var v = { bm: info.bookmarkCount | 0, like: info.likeCount | 0, view: info.viewCount | 0 };
            cachePut(it.id, v); addResult(it, v); state.scanned++;
          }.bind(null, it)).catch(function (it) { failed.push(it); }.bind(null, it)).then(function () {
            active--;
            state.failed = failed;
            progSoon(prog);
            scheduleRender();
            pump();
          });
        }
      }
      pump();
    });
  }

  function addResult(it, v) {
    if (v.bm < cfg.minBm) { state.belowMin = (state.belowMin || 0) + 1; state.outRange = (state.outRange || 0) + 1; return; }
    if (cfg.maxBm && v.bm > cfg.maxBm) { state.aboveMax = (state.aboveMax || 0) + 1; state.outRange = (state.outRange || 0) + 1; return; }
    it.bm = v.bm; it.like = v.like; it.view = v.view;
    it.rate = v.view ? v.bm / v.view : 0;
    state.items.push(it);
  }

  var MAX_RESULTS = 150;   // 每次扫描最多保留/查询 150 件，减轻 Pixiv 限流
  /* ---------- render ---------- */
  var renderTimer = 0, pendingDraw = false, lastDraw = 0;
  function scheduleRender() { if (!renderTimer && ov.classList.contains('open')) renderTimer = setTimeout(function () { renderTimer = 0; render(false); }, 400); }
  var SORTS = {
    bm: function (a, b) { return b.bm - a.bm; }, like: function (a, b) { return b.like - a.like; },
    rate: function (a, b) { return b.rate - a.rate; }, new: function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id; }
  };
  var lastSig = '';
  function render(force) {
    $('pxs-htag').textContent = (state.tag && /\s/.test(state.tag) ? '' : '#') + (state.tag || getTag());
    var list = state.items.filter(function (it) { return it.bm >= (cfg.fMin || 0) && (!cfg.fMax || it.bm <= cfg.fMax) && !(cfg.hideR18 && it.r18) && !blockReason(it, null); }).sort(SORTS[cfg.sort]);
    var pct = state.total ? Math.round(state.scanned / state.total * 100) : 0;
    $('pxs-hsub').textContent = '显示 ' + list.length + ' 件 · 已查 ' + state.scanned + '/' + state.total + (state.pixivTotal ? '（Pixiv 共 ' + state.pixivTotal + '）' : '') + (state.failed && state.failed.length ? ' · 失败 ' + state.failed.length : '') + (running ? ' · 扫描中 ' + pct + '%' : ' · 已完成');
    $('pxs-bar').firstChild.style.width = (running ? pct : (state.total ? 100 : 0)) + '%';
    Array.prototype.forEach.call($('pxs-sort').children, function (b) { b.classList.toggle('on', b.getAttribute('data-s') === cfg.sort); });
    Array.prototype.forEach.call(document.querySelectorAll('.pxs-chip'), function (b) { b.classList.toggle('on', b.getAttribute('data-r') === (cfg.fMin || 0) + '-' + (cfg.fMax || 0)); });
    $('pxs-r18').classList.toggle('on', cfg.hideR18);

    var pageCount = Math.max(1, Math.ceil(list.length / PER_PAGE));
    if (state.page > pageCount) state.page = pageCount;
    var start = (state.page - 1) * PER_PAGE, slice = list.slice(start, start + PER_PAGE);
    var sig = slice.map(function (i) { return i.id; }).join(',') + '|' + cfg.sort + '|' + batch + '|' + effTags().length + '|' + BL.users.length;
    if (force || sig !== lastSig) {
      if ($('pxs-menu') && running && !force) pendingDraw = true;   // 菜单打开时不重绘网格，关闭后再补
      else { pendingDraw = false; if ($('pxs-menu')) closeMenu(); lastSig = sig; drawGrid(slice, start); }
    }
    drawPager(pageCount);
  }
  /* ---------- 结果页预览（自写：较大预览图，不用原图、不请求作品详情） ---------- */
  var prevState = { it: null, page: 0, mode: '', anchor: null, closeT: 0, hoverT: 0, sx: 0, sy: 0 };
  function canHover() {
    try { return !!(window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches); } catch (e) { return false; }
  }
  function closestCls(t, cls) {
    while (t && t !== document) { if (t.classList && t.classList.contains(cls)) return t; t = t.parentNode; }
    return null;
  }
  function isPreviewTarget(t) {
    if (closestCls(t, 'pxs-dlb') || closestCls(t, 'pxs-more') || closestCls(t, 'pxs-tag') || closestCls(t, 'pxs-meta')) return false;
    return !!closestCls(t, 'pxs-th');
  }
  function previewUrl(thumb, page) {
    var u = String(thumb || '');
    if (!u) return '';
    page = Math.max(0, page | 0);
    u = u.replace(/\/c\/[^/]+\//, '/');
    u = u.replace('/custom-thumb/', '/img-master/');
    u = u.replace(/_(?:square|custom|master)1200(?=\.(?:jpg|jpeg|png|webp)(?:\?|$))/i, '_master1200');
    if (/_p\d+_/i.test(u)) u = u.replace(/_p\d+_/, '_p' + page + '_');
    return u;
  }
  function placePreview() {
    var box = $('pxs-prev'); if (!box || box.hidden) return;
    if (prevState.mode !== 'float' || !prevState.anchor || !prevState.anchor.isConnected) {
      box.style.left = box.style.top = box.style.maxWidth = box.style.maxHeight = '';
      return;
    }
    var a = prevState.anchor.getBoundingClientRect(), vw = window.innerWidth, vh = window.innerHeight;
    var maxW = Math.min(560, vw - 16), maxH = Math.min(vh - 16, Math.floor(vh * 0.82));
    var left = a.right + 10;
    if (left + Math.min(maxW, 320) > vw - 8) left = a.left - 10 - Math.min(maxW, 400);
    if (left < 8) left = 8;
    if (left + 160 > vw) left = Math.max(8, vw - Math.min(maxW, vw - 16) - 8);
    var top = Math.max(8, Math.min(a.top, vh - 200));
    box.style.left = left + 'px';
    box.style.top = top + 'px';
    box.style.maxWidth = maxW + 'px';
    box.style.maxHeight = maxH + 'px';
  }
  function closePreview() {
    clearTimeout(prevState.closeT); clearTimeout(prevState.hoverT);
    prevState.it = null; prevState.anchor = null; prevState.mode = ''; prevState.page = 0;
    var box = $('pxs-prev'); if (!box) return;
    box.hidden = true; box.className = '';
    box.style.left = box.style.top = box.style.maxWidth = box.style.maxHeight = '';
    var img = $('pxs-prev-img'); if (img) { img.removeAttribute('src'); img.classList.remove('ld'); }
  }
  function openPreview(it, page, mode, anchor) {
    if (!it) return;
    var n = Math.max(1, it.pages || 1);
    page = Math.max(0, Math.min(n - 1, page | 0));
    prevState.it = it; prevState.page = page; prevState.mode = mode || 'full';
    if (anchor) prevState.anchor = anchor;
    var box = $('pxs-prev'); if (!box) return;
    box.hidden = false;
    box.className = 'pxs-prev-' + prevState.mode;
    var img = $('pxs-prev-img'), src = previewUrl(it.url, page) || it.url || '';
    img.onload = function () { img.classList.add('ld'); };
    img.onerror = function () { if (it.url && img.getAttribute('src') !== it.url) { img.onerror = null; img.src = it.url; } };
    img.classList.remove('ld');
    if (img.getAttribute('src') !== src) img.src = src; else img.classList.add('ld');
    var bits = [it.title || '(无题)'];
    if (n > 1) bits.push((page + 1) + '/' + n);
    if (it.type === 2) bits.push('动图（封面）');
    $('pxs-prev-meta').textContent = bits.join('  ·  ');
    $('pxs-prev-nav').style.display = n > 1 ? '' : 'none';
    placePreview();
  }
  function previewStep(d) {
    if (!prevState.it) return;
    var n = Math.max(1, prevState.it.pages || 1);
    if (n < 2) return;
    openPreview(prevState.it, (prevState.page + d + n) % n, prevState.mode, prevState.anchor);
  }
  function bindPreview() {
    var box = $('pxs-prev'); if (!box || box.__bound) return; box.__bound = true;
    box.addEventListener('click', function (e) {
      var t = e.target, ps = t.getAttribute && t.getAttribute('data-ps');
      if (t.id === 'pxs-prev-x') { closePreview(); return; }
      if (ps) { previewStep(+ps); return; }
      if (t === box && prevState.mode === 'full') { closePreview(); return; }
      if (t.id === 'pxs-prev-img' && prevState.it && (prevState.it.pages || 1) > 1 && prevState.mode === 'full') previewStep(1);
    });
    box.addEventListener('wheel', function (e) {
      if (!prevState.it || (prevState.it.pages || 1) < 2) return;
      e.preventDefault();
      previewStep(e.deltaY > 0 ? 1 : -1);
    }, { passive: false });
    box.addEventListener('mouseenter', function () { clearTimeout(prevState.closeT); });
    box.addEventListener('mouseleave', function () {
      if (prevState.mode === 'float') prevState.closeT = setTimeout(function () { if (prevState.mode === 'float') closePreview(); }, 220);
    });
    box.addEventListener('touchstart', function (e) {
      if (!e.touches || !e.touches[0]) return;
      prevState.sx = e.touches[0].clientX; prevState.sy = e.touches[0].clientY;
    }, { passive: true });
    box.addEventListener('touchend', function (e) {
      if (!e.changedTouches || !e.changedTouches[0] || !prevState.it || (prevState.it.pages || 1) < 2) return;
      var dx = e.changedTouches[0].clientX - prevState.sx, dy = e.changedTouches[0].clientY - prevState.sy;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) previewStep(dx < 0 ? 1 : -1);
    }, { passive: true });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        if (!box || box.hidden) return;
        previewStep(e.key === 'ArrowRight' ? 1 : -1);
        e.preventDefault();
        return;
      }
      if (e.key !== 'Escape') return;
      if ($('pxs-menu')) { closeMenu(); e.preventDefault(); e.stopPropagation(); return; }
      var sheet = document.querySelector('.pxs-sheet');
      if (sheet) { closeSheet(sheet); e.preventDefault(); return; }
      if (box && !box.hidden) { closePreview(); e.preventDefault(); return; }
      if (ov.classList.contains('open')) { closeOv(); e.preventDefault(); }
    }, true);
    $('pxs-grid').addEventListener('mouseover', function (e) {
      if (!canHover() || batch || (prevState.it && prevState.mode === 'full')) return;
      if (!isPreviewTarget(e.target)) return;
      var card = cardOf(e.target); if (!card) return;
      clearTimeout(prevState.closeT);
      if (prevState.it && prevState.it.id === card.__it.id && prevState.mode === 'float') return;
      clearTimeout(prevState.hoverT);
      prevState.hoverT = setTimeout(function () { if (card.isConnected) openPreview(card.__it, 0, 'float', card); }, 260);
    });
    $('pxs-grid').addEventListener('mouseout', function (e) {
      if (!canHover() || prevState.mode !== 'float') return;
      var rel = e.relatedTarget;
      if (rel && (box.contains(rel) || (prevState.anchor && prevState.anchor.contains(rel)))) return;
      clearTimeout(prevState.hoverT);
      prevState.closeT = setTimeout(function () { if (prevState.mode === 'float') closePreview(); }, 220);
    });
  }
  bindPreview();

  function drawGrid(slice, start) {
    lastDraw = Date.now(); clearTimeout(lpTimer); lpTimer = 0; if (prevState.it && prevState.mode === 'float') closePreview();
    var g = $('pxs-grid'); g.textContent = '';
    if (!slice.length) { g.innerHTML = '<div id="pxs-empty" style="grid-column:1/-1">' + (running ? '扫描中，结果将陆续出现…' : '没有符合条件的作品') + '</div>'; return; }
    var frag = document.createDocumentFragment();
    slice.forEach(function (it, i) {
      var rank = start + i + 1;
      var a = el('a', { class: 'pxs-card', href: 'https://www.pixiv.net/artworks/' + it.id, target: '_blank', rel: 'noopener', 'data-id': it.id });
      a.innerHTML = '<div class="pxs-th"><img loading="lazy" decoding="async" referrerpolicy="origin" alt="">' +
        '<span class="pxs-rk' + (rank === 1 ? ' g' : rank === 2 ? ' s' : rank === 3 ? ' b' : '') + '">#' + rank + '</span>' +
        '<span class="pxs-ck"></span><button class="pxs-dlb" aria-label="下载原图">⬇</button><span class="pxs-dlp"></span>' +
        '<div class="pxs-tr">' + (it.r18 ? '<span class="pxs-bd r">R-18</span>' : '') + (it.pages > 1 ? '<span class="pxs-bd">' + PAGES + it.pages + '</span>' : '') + '</div></div>' +
        '<div class="pxs-meta"><button class="pxs-more" aria-label="更多">⋯</button><div class="pxs-t"></div><div class="pxs-au"></div><div class="pxs-st">' +
        '<span class="bm">' + HEART + fmt(it.bm) + '</span><span>' + LIKE + fmt(it.like) + '</span>' +
        (it.view ? '<span style="color:#888">' + (it.rate * 100).toFixed(1) + '%</span>' : '') + '</div></div>';
      a.querySelector('.pxs-t').textContent = it.title || '(无题)';
      a.querySelector('.pxs-au').textContent = '@' + (it.user || '');
      if (it.tags && it.tags.length) {
        var tg = document.createElement('div'); tg.className = 'pxs-tags';
        it.tags.slice(0, 3).forEach(function (t) { var s = document.createElement('span'); s.className = 'pxs-tag'; s.textContent = '#' + t; s.setAttribute('data-tag', t); tg.appendChild(s); });
        a.querySelector('.pxs-meta').appendChild(tg);
      }
      if (batch) { a.classList.add('pxs-selmode'); if (sel[it.id]) a.classList.add('sel'); }
      a.__it = it; if (dlProg[it.id]) setTimeout(function () { showProg(it.id, dlProg[it.id]); }, 0);
      var img = a.querySelector('img');
      img.onload = function () { img.classList.add('ld'); img.parentNode.style.animation = 'none'; };
      img.src = it.url;
      frag.appendChild(a);
    });
    g.appendChild(frag);
  }
  function drawPager(n) {
    var pg = $('pxs-pg'), cur = state.page, h = '';
    if (n <= 1) { pg.innerHTML = ''; return; }
    h += '<button data-p="' + (cur - 1) + '"' + (cur === 1 ? ' disabled' : '') + '>‹</button>';
    var nums = [], i;
    for (i = 1; i <= n; i++) if (i === 1 || i === n || Math.abs(i - cur) <= 2) nums.push(i);
    var prev = 0;
    nums.forEach(function (x) { if (x - prev > 1) h += '<button disabled>…</button>'; h += '<button data-p="' + x + '"' + (x === cur ? ' class="on"' : '') + '>' + x + '</button>'; prev = x; });
    h += '<button data-p="' + (cur + 1) + '"' + (cur === n ? ' disabled' : '') + '>›</button>';
    pg.innerHTML = h;
  }

  /* ---------- SPA navigation ---------- */
  function sync() { var on = !!getTag(); if (on && !qTouched && !running) $('pxs-q').value = getTag(); btn.style.display = on ? '' : 'none'; if (!on) panel.classList.remove('open'); }
  var last = location.href; setInterval(function () { if (location.href !== last) { last = location.href; sync(); } }, 800);
  sync();
  // Pixiv's React app may re-render <body> and drop our nodes: re-attach if missing
  setInterval(function () {
    [st].forEach(function (n) { if (!n.isConnected) (document.head || document.documentElement).appendChild(n); });
    [btn, panel, ov, prev].forEach(function (n) { if (!n.isConnected && document.body) document.body.appendChild(n); });
  }, 1000);
  }
})();
