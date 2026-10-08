import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { normalizePreferences, validateImage, MAX_FILE_BYTES } from '../src/preferences.js';
import { backgroundCSS } from '../src/background.js';
test('defaults and bounds', () => {
  assert.deepEqual(normalizePreferences(), { enabled: true, overlay: 20, imageTransparency:0, panelTransparency:80, blur: 0, fit: 'cover' });
  assert.deepEqual(normalizePreferences({enabled:false, overlay:100, blur:-4, fit:'bad'}), {enabled:false, overlay:90, imageTransparency:0, panelTransparency:80, blur:0, fit:'cover'});
  assert.equal(normalizePreferences({overlay:NaN}).overlay,20);
  assert.equal(normalizePreferences({imageTransparency:999}).imageTransparency,100);
  assert.equal(normalizePreferences({panelTransparency:-20}).panelTransparency,0);
});
test('image validation', () => {
  assert.doesNotThrow(() => validateImage({type:'image/png',size:1024}));
  for (const file of [null, {type:'image/svg+xml',size:10}, {type:'image/png',size:0}, {type:'image/png',size:MAX_FILE_BYTES+1}]) assert.throws(() => validateImage(file));
});
test('CSS spans the app and validates local URLs', () => {
  const css = backgroundCSS('blob:local-image',{overlay:70,blur:5,fit:'contain'});
  assert.match(css,/70%/); assert.match(css,/blur\(5px\)/); assert.match(css,/background-size:contain/);
  assert.match(css,/Dc7zOa_root/); assert.doesNotMatch(css,/RlGAzG_card/);
  assert.throws(() => backgroundCSS('https://example.com/image',{}));
});
test('independent transparency affects image and surfaces, not text', () => {
  const css = backgroundCSS('blob:test',{imageTransparency:35,panelTransparency:80},{'--dsw-alias-bg-base':'rgb(255, 255, 255)','--dsw-specific-input-major':'rgb(20, 20, 20)'});
  assert.match(css,/opacity:0.65/);
  assert.match(css,/rgb\(20, 20, 20\) 20%,transparent/);
  assert.match(css,/body:not\(:has\(\.wCInkW_overlay\)\)::before/);
  assert.match(css,/BynINW_rightbarCol/);
  assert.doesNotMatch(css,/label-primary:/);
});
test('every background rule is inactive while settings is open', () => {
  const css = backgroundCSS('blob:test',{}, {'--dsw-alias-bg-base':'rgb(255, 255, 255)'});
  const selectors = [...css.matchAll(/([^{}]+)\{/g)].flatMap(match => match[1].trim().split(/,\s*(?=body)/));
  assert.ok(selectors.length >= 3);
  for (const selector of selectors) assert.ok(selector.startsWith('body:not(:has(.wCInkW_overlay))'), selector);
});
test('bundle registers through the runtime ModuleLoader', async () => {
  let definition;
  vm.runInNewContext(await readFile(new URL('../lib/client.js',import.meta.url),'utf8'),{window:{__ModuleLoader__:{load:d=>definition=d}}});
  assert.equal(definition.id,'dsh-background-image');
  const plugin = definition.factory(name => { assert.equal(name,'react'); return {createElement(){}}; });
  assert.equal(typeof plugin.apply,'function');
  assert.equal(plugin.inject[0],'slots');
});
