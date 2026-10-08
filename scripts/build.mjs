import { readFile, writeFile, mkdir } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const names = ['preferences', 'storage', 'background', 'settings-style', 'save-scheduler', 'client'];
const parts = await Promise.all(names.map(name => readFile(new URL(`src/${name}.js`, root), 'utf8')));
const code = parts.map(text => text.replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '')).join('\n');
await mkdir(new URL('lib/', root), { recursive: true });
await writeFile(new URL('lib/client.js', root), `window.__ModuleLoader__.load({id:'dsh-background-image',factory(require){\n${code}\nreturn createPlugin(require('react'));\n}});\n`);
console.log('Built lib/client.js');
