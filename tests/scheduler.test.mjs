import test from 'node:test';
import assert from 'node:assert/strict';
import { createPreferenceScheduler } from '../src/save-scheduler.js';
import { normalizePreferences } from '../src/preferences.js';
import { backgroundCSS } from '../src/background.js';
test('slider events coalesce and closing settings flushes final values', async () => {
 const saved=[]; const scheduler=createPreferenceScheduler(p=>{saved.push(p); return Promise.resolve();},10000);
 scheduler.schedule('blur',1); scheduler.schedule('blur',12); scheduler.schedule('overlay',25);
 await scheduler.flush(); assert.deepEqual(saved,[{blur:12,overlay:25}]);
 await scheduler.flush(); assert.equal(saved.length,1);
});
test('reset cancels pending slider writes', async () => {
 const saved=[]; const scheduler=createPreferenceScheduler(p=>saved.push(p),10000);
 scheduler.schedule('blur',12); scheduler.cancel(); await scheduler.flush(); assert.equal(saved.length,0);
});
test('legacy transparency migrates and inputs stay more readable',()=>{
 const p=normalizePreferences({panelTransparency:95});
 assert.equal(p.sidebarTransparency,95); assert.equal(p.chatTransparency,95); assert.equal(p.inputTransparency,30);
 const css=backgroundCSS('blob:test',{sidebarTransparency:90,chatTransparency:75,inputTransparency:20});
 assert.match(css,/90|10%/); assert.match(css,/25%,transparent/); assert.match(css,/80%,transparent/);
 assert.doesNotMatch(css,/--dsw-alias-bg-overlay:/);
});
