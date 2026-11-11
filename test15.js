// regression: popular_d ignoring bgt must fallback and keep ~pages*60 in-range works
const {JSDOM}=require('jsdom');const fs=require('fs');const F=require('fake-indexeddb');const assert=require('assert');

function mk(opts={}){
  const dom=new JSDOM('<!doctype html><body></body>',{url:'https://www.pixiv.net/search?q=%E7%90%B3',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window;w.indexedDB=new F.IDBFactory();w.__PXSORT_TEST=1;
  w.localStorage.setItem('pxsort_cfg',JSON.stringify({
    v140:1,v141:1,v142:1,v150:1,v160:1,v191:1,
    strategy:'premium',pages:2,minBm:2000,maxBm:6000,mode:'r18',rpm:60,burst:false,testMode:true
  }));
  const L={url:[]};w.__L=L;
  const bgtWorks=!!opts.bgtWorks;
  const PER=36;
  w.fetch=async(u)=>{
    L.url.push(u);
    let m;
    if((m=/\/ajax\/illust\/(\d+)/.exec(u))){
      const id=+m[1];
      const bm = bgtWorks || id<100000 ? 3000 : 12000;
      return {status:200,json:async()=>({error:false,body:{bookmarkCount:bm,likeCount:1,viewCount:9}})};
    }
    const pop=/order=popular_d/.test(u);
    const users=/users%E5%85%A5%E3%82%8A|users入り/.test(u);
    const p=+/[?&]p=(\d+)/.exec(u)[1];
    const start=(p-1)*PER;
    let total, data, base;
    if(pop){
      total=2027;
      const n=Math.max(0,Math.min(PER,total-start));
      data=Array.from({length:n},(_,i)=>{
        const k=start+i;
        // 第 1 页后半段放范围内作品（不会出现在 date_d 结果里），用来检查回退时不能把它们丢掉
        if(p===1 && i>=20) return {id:String(50000+i),title:'p',userName:'u',userId:'1',url:'x',tags:['琳'],pageCount:1,illustType:0,xRestrict:1};
        return {id:String(k%2?100000+k:200000-k),title:'p',userName:'u',userId:'1',url:'x',tags:['琳'],pageCount:1,illustType:0,xRestrict:1};
      });
    } else {
      total=800; base=users?30000:10000;
      const n=Math.max(0,Math.min(PER,total-start));
      data=Array.from({length:n},(_,i)=>({
        id:String(base+start+i),title:'d',userName:'u',userId:'1',url:'x',tags:['琳'],pageCount:1,illustType:0,xRestrict:1,
        bookmarkCount:3000,likeCount:1,viewCount:9
      }));
    }
    return {status:200,json:async()=>({error:false,body:{illustManga:{data,total,lastPage:Math.ceil(total/PER)}}})};
  };
  w.eval(fs.readFileSync('pixiv-tag-sort.user.js','utf8'));
  return w;
}
const wait=(f,ms)=>new Promise((r,j)=>{const t0=Date.now(),iv=setInterval(()=>{if(f()){clearInterval(iv);r();}else if(Date.now()-t0>ms){clearInterval(iv);j(new Error('timeout: '+(typeof f==='function'?'':f)));}},50)});

(async()=>{
  // A: bgt ignored by popular_d — should fallback and keep ~120 in range
  let w=mk(),d=w.document;
  const sel=d.getElementById('pxs-rpm');
  const o=d.createElement('option');o.value='6000';o.textContent='6000';sel.appendChild(o);sel.value='6000';
  d.getElementById('pxs-min').value='2000';
  d.getElementById('pxs-max').value='6000';
  d.getElementById('pxs-pages').value='2';
  d.getElementById('pxs-go').click();
  await wait(()=>/完成|已停止/.test(d.getElementById('pxs-status').textContent),120000);
  const st=w.__pxsortTest.state();
  const txt=d.getElementById('pxs-status').textContent;
  const details=w.__L.url.filter(u=>/\/ajax\/illust\/\d+$/.test(u));
  const searches=w.__L.url.filter(u=>u.includes('/ajax/search/'));
  const dateU=searches.filter(u=>/order=date_d/.test(u));
  const popU=searches.filter(u=>/order=popular_d/.test(u));
  console.log('A kept',st.items.length,'scanned',st.scanned,'total',st.total,'outRange',st.outRange,'details',details.length,'searches',searches.length,'pop',popU.length,'date',dateU.length);
  console.log('A status',txt);
  assert(st.bgtIgnored,'should detect ignored bgt');
  assert(st.items.length>=120,'should keep at least 120 in-range works, got '+st.items.length);
  assert(st.items.every(it=>it.bm>=2000 && it.bm<=6000),'all kept in 2000-6000');
  const keptPop = st.items.filter(it=>+it.id>=50000 && +it.id<100000);
  console.log('A kept popular-page1 in-range', keptPop.length, keptPop.map(it=>it.id).join(','));
  assert.equal(keptPop.length,16,'must keep in-range works from popular page 1, got '+keptPop.length);
  assert(details.length<=50,'should only look up popular page 1, not later popular pages, got '+details.length);
  const popPages=popU.map(u=>+/[?&]p=(\d+)/.exec(u)[1]);
  assert(popPages.every(p=>+p===1),'must not keep flipping popular_d pages after fallback, got '+popPages.join(','));
  const dateMain=dateU.filter(u=>!/users/.test(u));
  console.log('A date sample', (dateMain[0]||dateU[0]||'').slice(-180));
  assert(dateMain.length>=2,'should search date_d in range');
  assert(dateU.every(u=>/blt=2000/.test(u)&&/bgt=6000/.test(u)),'range searches must send blt/bgt');
  assert(st.items.length<=130,'should stop near 2-page target, got '+st.items.length);
  assert(/未应用最高收藏上限/.test(txt+ (st.notice||'')),'notice');
  assert(/范围外|超过最高收藏/.test(txt),'status shows out of range');
  w.close();

  // B: bgt works — no fallback, keep the popular results
  w=mk({bgtWorks:true});d=w.document;
  const sel2=d.getElementById('pxs-rpm');
  const o2=d.createElement('option');o2.value='6000';o2.textContent='6000';sel2.appendChild(o2);sel2.value='6000';
  d.getElementById('pxs-min').value='2000';
  d.getElementById('pxs-max').value='6000';
  d.getElementById('pxs-pages').value='2';
  d.getElementById('pxs-go').click();
  await wait(()=>/完成|已停止/.test(d.getElementById('pxs-status').textContent),120000);
  const st2=w.__pxsortTest.state();
  const txt2=d.getElementById('pxs-status').textContent;
  const searches2=w.__L.url.filter(u=>u.includes('/ajax/search/'));
  const date2=searches2.filter(u=>/order=date_d/.test(u));
  console.log('B kept',st2.items.length,'outRange',st2.outRange,'date searches',date2.length,'|',txt2.slice(0,80));
  assert(!st2.bgtIgnored,'should not fallback when bgt works');
  assert(st2.items.length>=120,'should keep >=120, got '+st2.items.length);
  assert.equal(st2.outRange||0,0);
  assert.equal(date2.length,0,'no date_d fallback');
  w.close();
  console.log('ALL OK');
  process.exit(0);
})().catch(e=>{console.log('FAIL',e);process.exit(1)});
