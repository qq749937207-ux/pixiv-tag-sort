// 1.11.2: popular_d looks real but ignores blt (most works below min) must fallback
const {JSDOM}=require('jsdom');const fs=require('fs');const F=require('fake-indexeddb');const assert=require('assert');

function mk(){
  const dom=new JSDOM('<!doctype html><body></body>',{url:'https://www.pixiv.net/tags/%E3%81%8B%E3%81%90%E3%82%84/artworks',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window;w.indexedDB=new F.IDBFactory();w.__PXSORT_TEST=1;
  w.localStorage.setItem('pxsort_cfg',JSON.stringify({
    v140:1,v141:1,v142:1,v150:1,v160:1,v191:1,
    strategy:'premium',pages:2,minBm:100,maxBm:0,mode:'all',rpm:6000,burst:false,testMode:true
  }));
  const L={url:[]};w.__L=L;
  const PER=36;
  w.fetch=async(u)=>{
    L.url.push(u);
    let m;
    if((m=/\/ajax\/illust\/(\d+)/.exec(u))){
      const id=+m[1];
      const bm = id<100000 ? 20 : 800; // "popular" low ids = below min; fallback high ids in range
      return {status:200,json:async()=>({error:false,body:{bookmarkCount:bm,likeCount:1,viewCount:9}})};
    }
    const pop=/order=popular_d/.test(u);
    const p=+/[?&]p=(\d+)/.exec(u)[1];
    const start=(p-1)*PER;
    let total, data;
    if(pop){
      total=5423;
      const n=Math.max(0,Math.min(PER,total-start));
      // IDs go up so detector does not treat this as date order
      data=Array.from({length:n},(_,i)=>({id:String(1000+start+i),title:'p',userName:'u',userId:'1',url:'x',tags:['かぐや'],pageCount:1,illustType:0,xRestrict:0}));
    } else {
      total=800;
      const n=Math.max(0,Math.min(PER,total-start));
      data=Array.from({length:n},(_,i)=>({
        id:String(200000+start+i),title:'d',userName:'u',userId:'1',url:'x',tags:['かぐや'],pageCount:1,illustType:0,xRestrict:0,
        bookmarkCount:800,likeCount:1,viewCount:9
      }));
    }
    return {status:200,json:async()=>({error:false,body:{illustManga:{data,total,lastPage:Math.ceil(total/PER)}}})};
  };
  w.eval(fs.readFileSync('pixiv-tag-sort.user.js','utf8'));
  return w;
}
const wait=(f,ms)=>new Promise((r,j)=>{const t0=Date.now(),iv=setInterval(()=>{if(f()){clearInterval(iv);r();}else if(Date.now()-t0>ms){clearInterval(iv);j(new Error('timeout'));}},50)});

(async()=>{
  const w=mk(), d=w.document;
  const sel=d.getElementById('pxs-rpm');
  const o=d.createElement('option');o.value='6000';o.textContent='6000';sel.appendChild(o);sel.value='6000';
  d.getElementById('pxs-min').value='100';
  d.getElementById('pxs-max').value='';
  d.getElementById('pxs-pages').value='2';
  const sum=d.getElementById('pxs-scansum').textContent;
  console.log('scanSum', sum);
  assert(/收藏 100–不限/.test(sum),'summary shows default range');
  d.getElementById('pxs-go').click();
  await wait(()=>/完成|已停止/.test(d.getElementById('pxs-status').textContent),120000);
  const st=w.__pxsortTest.state();
  const txt=d.getElementById('pxs-status').textContent;
  const searches=w.__L.url.filter(u=>u.includes('/ajax/search/'));
  const dateU=searches.filter(u=>/order=date_d/.test(u));
  const popU=searches.filter(u=>/order=popular_d/.test(u));
  console.log('kept',st.items.length,'scanned',st.scanned,'below',st.belowMin,'above',st.aboveMax,'out',st.outRange);
  console.log('status',txt);
  console.log('pop',popU.length,'date',dateU.length);
  assert(st.bgtIgnored,'should fallback when most works are below min');
  assert(st.rangeWhy==='min','why=min');
  assert(st.items.length>=120,'should keep at least 120, got '+st.items.length);
  assert(st.items.every(it=>it.bm>=100),'all kept >=100');
  assert(dateU.some(u=>/blt=100/.test(u)),'fallback search sends blt');
  assert(/低于最低收藏/.test(txt),'status names below-min');
  assert(/范围 100–不限/.test(txt),'status shows range');
  assert(/未筛掉低于最低收藏/.test(txt+(st.notice||'')),'notice');
  const popPages=popU.map(u=>+/[?&]p=(\d+)/.exec(u)[1]);
  assert(popPages.every(p=>+p===1),'must not keep flipping popular pages, got '+popPages.join(','));
  w.close();
  console.log('test19 ok');
  process.exit(0);
})().catch(e=>{console.log('FAIL',e);process.exit(1)});
