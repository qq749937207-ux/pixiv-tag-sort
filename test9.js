const {JSDOM}=require('jsdom');const fs=require('fs');const F=require('fake-indexeddb');const assert=require('assert');
const URLS=[];let illust=0;
function mk(ls){const dom=new JSDOM('<!doctype html><body></body>',{url:'https://www.pixiv.net/tags/'+encodeURIComponent('原神')+'/artworks?s_mode=s_tag',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window;w.indexedDB=new F.IDBFactory();w.__PXSORT_TEST=1;w.confirm=()=>true;w.prompt=()=>'方案A';
 for(const k in ls||{})w.localStorage.setItem(k,ls[k]);
 w.fetch=async(u)=>{URLS.push(u);const m=/\/ajax\/illust\/(\d+)/.exec(u);
  if(m){illust++;return {status:200,json:async()=>({error:false,body:{bookmarkCount:+m[1]%1000,likeCount:1,viewCount:10}})};}
  const data=[];for(let i=0;i<20;i++){const id=900-i;data.push({id:String(id),title:'t'+id,userName:'u'+(i%5),userId:String(i%5),url:'x.jpg',
   tags:i%4===0?['原神','腐向け']:i%4===1?['原神','Genshin Impact']:['原神','風景'],aiType:i===3?2:1,xRestrict:0});}
  return {status:200,json:async()=>({error:false,body:{illustManga:{data,total:20,lastPage:1}}})};};
 w.eval(fs.readFileSync('pixiv-tag-sort.user.js','utf8'));return w;}
const cfg=JSON.stringify({v140:1,v141:1,v142:1,v150:1,v160:1,rpm:6000,strategy:'new',pages:1,minBm:0,testMode:true});
(async()=>{
 let w=mk({pxsort_cfg:cfg});const T=w.__pxsortTest;
 // query building
 let q=T.buildQuery('原神 刻晴 OR 甘雨 -腐向け');assert.equal(q.word,'原神 (刻晴 OR 甘雨) -腐向け');
 assert.equal(T.buildQuery('A|B C').word,'(A OR B) C');
 assert.equal(T.buildQuery('(A OR B) -C').word,'(A OR B) -C');
 q=T.buildQuery('原神 "Genshin Impact" -"x y" 甘雨(原神)');assert.equal(q.word,'原神 Genshin Impact 甘雨（原神）');assert.deepEqual(q.localExcl,['x y']);assert.equal(q.localGroups.length,1);
 q=T.buildQuery('A '+Array.from({length:13},(_,i)=>'-ex'+i).join(' '));assert.equal(q.serverExcl.length,10);assert.deepEqual(q.localExcl,['ex10','ex11','ex12']);
 q=T.buildQuery('A '+Array.from({length:8},(_,i)=>'-'+'長'.repeat(30)+i).join(' '));assert(q.word.length<=200 && q.localExcl.length>0,'len cap');
 assert.equal(T.buildQuery('-only').word,'');
 console.log('query OK');
 // filtering
 const BL=T.BL();assert(T.blockReason({tags:['GENSHIN IMPACT']},null)==='');
 BL.tags=['genshin impact'];assert.equal(T.blockReason({tags:['Genshin Impact']},null),'标签');
 BL.tags=['genshin'];assert.equal(T.blockReason({tags:['Genshin Impact']},null),'');BL.partial=true;assert.equal(T.blockReason({tags:['Genshin Impact']},null),'标签');
 BL.tags=[];BL.partial=false;
 // full scan: query with server exclude + blocklist tag 腐向け is server-side; block local: user 1, AI, tag 風景? use must
 T.blImport('# x\n腐向け\nuser:1 u1\n',true);BL.hideAI=true;
 const d=w.document;d.getElementById('pxs-q').value='原神 -"Genshin Impact"';d.getElementById('pxs-noai').checked=true;
 d.getElementById('pxs-go').click();
 await new Promise(r=>{const iv=setInterval(()=>{if(/完成/.test(d.getElementById('pxs-status').textContent)){clearInterval(iv);r();}},100)});
 const st=T.state(),txt=d.getElementById('pxs-status').textContent;console.log(txt);
 const su=URLS.find(u=>u.includes('/ajax/search/'));console.log('search url',decodeURIComponent(su));
 assert(decodeURIComponent(su).includes('word=原神&'),'word');
 // 20 items: i%4==0 腐向け (5) blocked; uid1 = i%5==1 ; ai i=3; i%4==1 Genshin Impact local excl
 let exp=0;for(let i=0;i<20;i++){const bad=i%4===0||i%5===1||i===3||i%4===1;if(bad)exp++;}
 assert.equal(st.blocked,exp);assert.equal(illust,20-exp);assert(txt.includes('已屏蔽 '+exp+' 个（节省 '+exp+' 次请求）'));
 console.log('blocked',st.blocked,'illust',illust,'filter OK');
 // overlay hides newly blocked artist + menu
 const before=d.querySelectorAll('.pxs-card').length;const card=d.querySelector('.pxs-card');
 await new Promise(r=>setTimeout(r,400));
 card.querySelector('.pxs-more').dispatchEvent(new w.MouseEvent('click',{bubbles:true,cancelable:true,clientX:50,clientY:50}));
 const mb=[...d.querySelectorAll('#pxs-menu button')];assert(mb[0].textContent.startsWith('下载原图'));mb.find(b=>b.textContent.startsWith('屏蔽此画师')).click();
 const after=d.querySelectorAll('.pxs-card').length;console.log('cards',before,'->',after);assert(after<before);
 await new Promise(r=>setTimeout(r,400));
 d.querySelector('.pxs-tag').dispatchEvent(new w.MouseEvent('click',{bubbles:true,cancelable:true}));
 [...d.querySelectorAll('#pxs-menu button')].find(b=>b.textContent.startsWith('加入搜索')).click();
 console.log('query now',d.getElementById('pxs-q').value);
 // presets
 assert(T.savePreset('方案A'));const savedQ=d.getElementById('pxs-q').value;
 d.getElementById('pxs-q').value='别的';T.blImport('',true);assert.equal(T.BL().tags.length,0);
 assert(T.loadPreset('方案A'));assert.equal(d.getElementById('pxs-q').value,savedQ);assert(T.BL().tags.includes('腐向け'));assert.equal(T.BL().users.length,2);
 assert.equal(d.getElementById('pxs-pre').options.length,2);assert(T.delPreset('方案A'));assert.equal(Object.keys(T.presets()).length,0);
 assert(T.blText().includes('user:1 u1'));
 console.log('presets OK, size',w.localStorage.getItem('pxsort_block').length);
 console.log('ALL OK');process.exit(0);})().catch(e=>{console.log('FAIL',e);process.exit(1)});
