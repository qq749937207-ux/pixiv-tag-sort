// 1.11.1: Esc closes preview, then the results overlay
const {JSDOM} = require('jsdom');
const fs = require('fs');
const F = require('fake-indexeddb');
const assert = require('assert');

const dom = new JSDOM('<!doctype html><body></body>', {
  url: 'https://www.pixiv.net/tags/test/artworks',
  runScripts: 'outside-only',
  pretendToBeVisual: true
});
const w = dom.window;
w.indexedDB = new F.IDBFactory();
w.__PXSORT_TEST = 1;
w.fetch = async () => ({ status: 200, json: async () => ({ error: false, body: {} }) });
w.eval(fs.readFileSync('pixiv-tag-sort.user.js', 'utf8'));
const d = w.document;
const T = w.__pxsortTest;
assert(T && T.openOv && T.closeOv, 'ov hook');

const it = { id: '1', title: 't', url: 'https://i.pximg.net/c/250x250_80_a2/img-master/img/2024/01/01/01/01/01/1_p0_square1200.jpg', pages: 2, type: 0 };
T.openOv();
const ov = d.getElementById('pxs-ov');
assert(ov.classList.contains('open'), 'overlay open');
T.openPreview(it, 0, 'full');
assert(!d.getElementById('pxs-prev').hidden, 'preview open');

d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
assert(d.getElementById('pxs-prev').hidden, 'first Esc closes preview');
assert(ov.classList.contains('open'), 'overlay still open');

d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
assert(!ov.classList.contains('open'), 'second Esc closes results page');

console.log('test18 ok');
process.exit(0);
