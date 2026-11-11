// 1.10.2: 8 preset chips in a folded sub-card under 搜索; tap adds/removes official JP tags
const {JSDOM} = require('jsdom');
const fs = require('fs');
const F = require('fake-indexeddb');
const assert = require('assert');

function mk() {
  const dom = new JSDOM('<!doctype html><body></body>', {
    url: 'https://www.pixiv.net/search?q=' + encodeURIComponent('琳尼特'),
    runScripts: 'outside-only',
    pretendToBeVisual: true
  });
  const w = dom.window;
  w.indexedDB = new F.IDBFactory();
  w.__PXSORT_TEST = 1;
  w.fetch = async () => ({ status: 200, json: async () => ({ error: false, body: {} }) });
  w.eval(fs.readFileSync('pixiv-tag-sort.user.js', 'utf8'));
  return w;
}

const EXPECT = [
  ['百合', '百合'],
  ['巨乳', '巨乳'],
  ['贫乳', '貧乳'],
  ['黑裤袜', '黒タイツ'],
  ['拘束', '拘束'],
  ['大腿', '魅惑のふともも'],
  ['穿袜足底', 'ソックス足裏'],
  ['SM', 'SM']
];

const w = mk();
const d = w.document;
const T = w.__pxsortTest;
assert(T, 'test hook');
assert.equal(T.QUICK_TAGS.length, 8);
assert.deepEqual(T.QUICK_TAGS, EXPECT);

const search = d.getElementById('pxs-s-search');
const sub = d.getElementById('pxs-quick');
assert(search && sub, 'search + subcard');
assert(search.contains(sub), 'subcard is inside 搜索');
assert(!sub.open, 'subcard folded by default');
assert.equal(sub.querySelector('summary').textContent, '常用标签');

const chips = [...sub.querySelectorAll('.pxs-qchip')];
assert.equal(chips.length, 8);
assert.deepEqual(chips.map(c => [c.textContent, c.getAttribute('data-t')]), EXPECT);
assert(chips.every(c => !c.classList.contains('on')), 'none selected initially unless already in q');

const q = d.getElementById('pxs-q');
const base = q.value;
assert(base, 'search box has page tag');

T.toggleQuickTag('黒タイツ');
assert.equal(q.value.trim(), (base + ' 黒タイツ').trim());
assert(T.queryHasTag(q.value, '黒タイツ'));
assert(chips.find(c => c.getAttribute('data-t') === '黒タイツ').classList.contains('on'));
assert(chips.find(c => c.getAttribute('data-t') === '百合') && !chips.find(c => c.getAttribute('data-t') === '百合').classList.contains('on'));

T.toggleQuickTag('魅惑のふともも');
assert(T.queryHasTag(q.value, '黒タイツ') && T.queryHasTag(q.value, '魅惑のふともも'));

T.toggleQuickTag('黒タイツ');
assert(!T.queryHasTag(q.value, '黒タイツ'));
assert(T.queryHasTag(q.value, '魅惑のふともも'));
assert.ok(q.value.includes(base));
assert(!q.value.includes('黒タイツ'));

// clicking a chip does the same
chips.find(c => c.getAttribute('data-t') === 'SM').click();
assert(T.queryHasTag(q.value, 'SM'));
chips.find(c => c.getAttribute('data-t') === 'SM').click();
assert(!T.queryHasTag(q.value, 'SM'));

// does not strip an exclude token
q.value = base + ' -SM 百合';
T.syncQuickChips();
assert(chips.find(c => c.getAttribute('data-t') === '百合').classList.contains('on'));
assert(!chips.find(c => c.getAttribute('data-t') === 'SM').classList.contains('on'));

console.log('test16 ok');

process.exit(0);
