// 1.11.0: result-page preview URL mapping + overlay flip/close (no original-image requests)
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

const w = mk();
const d = w.document;
const T = w.__pxsortTest;
assert(T && T.previewUrl && T.openPreview, 'preview hook');

const sq = 'https://i.pximg.net/c/250x250_80_a2/img-master/img/2024/01/02/03/04/05/12345_p0_square1200.jpg';
assert.equal(
  T.previewUrl(sq, 0),
  'https://i.pximg.net/img-master/img/2024/01/02/03/04/05/12345_p0_master1200.jpg'
);
assert.equal(
  T.previewUrl(sq, 2),
  'https://i.pximg.net/img-master/img/2024/01/02/03/04/05/12345_p2_master1200.jpg'
);
const cu = 'https://i.pximg.net/c/480x960/custom-thumb/img/2023/11/10/12/00/00/999_p0_custom1200.jpg';
assert.equal(
  T.previewUrl(cu, 1),
  'https://i.pximg.net/img-master/img/2023/11/10/12/00/00/999_p1_master1200.jpg'
);
assert.equal(T.previewUrl('', 0), '');

const it = { id: '12345', title: '测试图', url: sq, pages: 3, type: 0 };
T.openPreview(it, 0, 'full');
const box = d.getElementById('pxs-prev');
assert(box && !box.hidden, 'preview open');
assert(box.classList.contains('pxs-prev-full'));
assert.equal(d.getElementById('pxs-prev-img').getAttribute('src'), T.previewUrl(sq, 0));
assert.ok(d.getElementById('pxs-prev-meta').textContent.includes('1/3'));
assert.equal(d.getElementById('pxs-prev-nav').style.display, '');

T.previewStep(1);
assert.equal(T.previewState().page, 1);
assert.equal(d.getElementById('pxs-prev-img').getAttribute('src'), T.previewUrl(sq, 1));
assert.ok(d.getElementById('pxs-prev-meta').textContent.includes('2/3'));

T.previewStep(1);
T.previewStep(1);
assert.equal(T.previewState().page, 0, 'wrap around');

const ug = { id: '2', title: '动', url: sq, pages: 1, type: 2 };
T.openPreview(ug, 0, 'full');
assert.ok(d.getElementById('pxs-prev-meta').textContent.includes('动图'));
assert.equal(d.getElementById('pxs-prev-nav').style.display, 'none');
// ugoira preview stays on the cover master url, not original / zip
assert.equal(d.getElementById('pxs-prev-img').getAttribute('src'), T.previewUrl(sq, 0));

d.getElementById('pxs-prev-x').click();
assert(box.hidden, 'closed');
assert.equal(T.previewState().it, null);

console.log('test17 ok');
process.exit(0);
