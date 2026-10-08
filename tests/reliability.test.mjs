import test from 'node:test';
import assert from 'node:assert/strict';
import { acknowledgeDraft } from '../src/draft.js';
import { createStorage } from '../src/storage.js';
import { backgroundCSS } from '../src/background.js';
test('save acknowledgement clears submitted draft but keeps newer changes',()=>{
 assert.deepEqual(acknowledgeDraft({blur:5,overlay:30},{blur:5}),{overlay:30});
 assert.deepEqual(acknowledgeDraft({blur:9},{blur:5}),{blur:9});
});
test('main pages stay opaque unless conversation or hero exists',()=>{
 const css=backgroundCSS('blob:test',{}, {'--dsw-alias-bg-base':'rgb(1, 2, 3)'});
 assert.match(css,/\.BynINW_centerCol \{ background:rgb\(1, 2, 3\) !important/);
 assert.match(css,/\.BynINW_centerCol:has\(\.Dc7zOa_root, \.Hqq-bq_root\)/);
});
test('metadata and image read through exactly one snapshot transaction',async()=>{
 const values={metadata:{name:'photo',preferences:{blur:2}},image:new Blob(['image'])};
 let count=0;
 const db={transaction(){ count++; const tx={objectStore(){return {get(key){return {result:values[key]};}};}}; queueMicrotask(()=>tx.oncomplete());return tx;},close(){}};
 const indexedDB={open(){const request={result:db};queueMicrotask(()=>request.onsuccess());return request;}};
 const storage=createStorage(indexedDB);const record=await storage.read();
 assert.equal(count,1);assert.equal(record.name,'photo');assert.equal(record.image,values.image);await storage.close();
});
test('legacy record remains readable in a single transaction',async()=>{
 const legacy={name:'old',image:new Blob(['old'])};
 const db={transaction(){const tx={objectStore(){return {get(key){return {result:key==='current'?legacy:undefined};}};}};queueMicrotask(()=>tx.oncomplete());return tx;},close(){}};
 const storage=createStorage({open(){const r={result:db};queueMicrotask(()=>r.onsuccess());return r;}});
 assert.equal(await storage.read(),legacy);await storage.close();
});
