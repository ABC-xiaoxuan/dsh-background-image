window.__ModuleLoader__.load({id:'dsh-background-image',factory(require){
const DEFAULTS = Object.freeze({ enabled: true, overlay: 20, imageTransparency: 0, panelTransparency: 80, blur: 0, fit: 'cover' });
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/bmp']);

function bounded(value, fallback, max) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.round(Math.min(max, Math.max(0, value))) : fallback;
}
function normalizePreferences(value) {
  return {
    enabled: typeof value?.enabled === 'boolean' ? value.enabled : DEFAULTS.enabled,
    overlay: bounded(value?.overlay, DEFAULTS.overlay, 90),
    imageTransparency: bounded(value?.imageTransparency, DEFAULTS.imageTransparency, 100),
    panelTransparency: bounded(value?.panelTransparency, DEFAULTS.panelTransparency, 100),
    blur: bounded(value?.blur, DEFAULTS.blur, 24),
    fit: ['cover', 'contain', 'repeat'].includes(value?.fit) ? value.fit : DEFAULTS.fit,
  };
}
function validateImage(file) {
  if (!file || !IMAGE_TYPES.has(file.type)) throw new Error('请选择 JPG、PNG、WebP、GIF、AVIF 或 BMP 图片。');
  if (!file.size) throw new Error('图片文件为空。');
  if (file.size > MAX_FILE_BYTES) throw new Error('图片不能超过 20 MB。');
}

// Image and preferences live in one record, committed in one transaction.
// No base64 in the profile, no uploads, and no localStorage quota limit.
function createStorage(indexedDB) {
  let connection;
  function open() {
    if (!indexedDB) return Promise.reject(new Error('当前环境不支持本地图片存储。'));
    if (!connection) connection = new Promise((resolve, reject) => {
      const request = indexedDB.open('dsh-background-image', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('settings');
      request.onerror = () => { connection = undefined; reject(request.error); };
      request.onblocked = () => { connection = undefined; reject(new Error('图片存储被其他窗口占用，请关闭旧窗口后重试。')); };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); connection = undefined; };
        resolve(db);
      };
    });
    return connection;
  }
  async function transaction(mode, operation) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('settings', mode);
      const request = operation(tx.objectStore('settings'));
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = () => reject(tx.error || request.error || new Error('保存图片失败。'));
      tx.onerror = () => {}; // onabort is the authoritative failure.
    });
  }
  return {
    read: () => transaction('readonly', (store) => store.get('current')),
    write: (record) => transaction('readwrite', (store) => store.put(record, 'current')),
    clear: () => transaction('readwrite', (store) => store.delete('current')),
    async close() {
      if (connection) (await connection.catch(() => null))?.close();
      connection = undefined;
    },
  };
}

// Background tokens are captured BEFORE our stylesheet is applied so overrides
// never compound and continue to follow the active light/dark theme.
function backgroundCSS(url, preferences, surfaces = {}) {
  const p = normalizePreferences(preferences);
  if (!url.startsWith('blob:')) throw new Error('Background must use a local Blob URL');
  const base = surfaces['--dsw-alias-bg-base'] || '#ffffff';
  const alpha = 100 - p.panelTransparency;
  const tokens = Object.entries(surfaces)
    .filter(([key, value]) => /^--dsw-[a-z0-9-]+$/.test(key) && value && !/[{};]/.test(value))
    .map(([key, value]) => `${key}:color-mix(in srgb,${value} ${alpha}%,transparent) !important;`).join('\n');
  // Settings is a modal owned by ui-settings-general in this runtime.
  // Disable ALL background overrides while it is open, restoring pristine tokens.
  const home = 'body:not(:has(.wCInkW_overlay))';
  return `
${home} { isolation:isolate; ${tokens} }
${home}::before {
  content:""; position:fixed; inset:0; z-index:-1; pointer-events:none;
  background-image:linear-gradient(color-mix(in srgb,${base} ${p.overlay}%,transparent),color-mix(in srgb,${base} ${p.overlay}%,transparent)),url(${JSON.stringify(url)});
  background-size:${p.fit === 'repeat' ? 'auto' : p.fit};
  background-position:center; background-repeat:${p.fit === 'repeat' ? 'repeat' : 'no-repeat'};
  opacity:${(100 - p.imageTransparency) / 100}; filter:blur(${p.blur}px);
}
${home} .BynINW_frame, ${home} .BynINW_frame > .BynINW_centerCol,
${home} .BynINW_frame > .BynINW_sidebarCol, ${home} .BynINW_frame > .BynINW_rightbarCol,
${home} .BynINW_frame .Dc7zOa_root { background:transparent !important; }
`;
}

const SETTINGS_CSS = `
.dsh-bg-settings{color:var(--dsw-alias-label-primary);padding:8px 0 24px;max-width:640px;--bg-accent:var(--dsw-alias-brand-primary)}
.dsh-bg-settings *{box-sizing:border-box}.dsh-bg-settings h2{font-size:22px;letter-spacing:-.4px;margin:0 0 8px;font-weight:650}.dsh-bg-settings p{margin:0}
.dsh-bg-muted{font-size:12px;line-height:1.7;color:var(--dsw-alias-label-secondary)}
.dsh-bg-card{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:16px;padding:18px;margin-top:18px;overflow:hidden}
.dsh-bg-top{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:14px}.dsh-bg-title{font-size:14px;font-weight:600}.dsh-bg-tag{font-size:11px;color:var(--bg-accent);background:color-mix(in srgb,var(--bg-accent) 9%,transparent);padding:4px 8px;border-radius:6px;white-space:nowrap}
.dsh-bg-preview{height:190px;position:relative;border-radius:12px;overflow:hidden;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);display:grid;place-items:center}
.dsh-bg-preview img{width:100%;height:100%;object-fit:cover}.dsh-bg-empty{text-align:center;padding:18px}.dsh-bg-empty svg{color:var(--bg-accent);margin-bottom:8px}.dsh-bg-empty strong{display:block;font-size:13px;margin-bottom:4px}
.dsh-bg-upload{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:14px}.dsh-bg-filename{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:var(--dsw-alias-label-secondary)}
.dsh-bg-button{font:inherit;font-size:12px;font-weight:500;padding:8px 12px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1);cursor:pointer;white-space:nowrap}.dsh-bg-button:hover{background:var(--dsw-alias-bg-layer-2)}.dsh-bg-button:disabled{opacity:.45;cursor:default}.dsh-bg-primary{color:white;background:var(--bg-accent);border-color:transparent}.dsh-bg-primary:hover{background:color-mix(in srgb,var(--bg-accent) 88%,black)}
.dsh-bg-switch{width:38px;height:22px;border:0;border-radius:99px;padding:3px;background:var(--dsw-alias-border-l2);cursor:pointer;transition:background .15s}.dsh-bg-switch[aria-checked=true]{background:var(--bg-accent)}.dsh-bg-switch span{display:block;width:16px;height:16px;background:white;border-radius:50%;transition:transform .15s;box-shadow:0 1px 3px #0002}.dsh-bg-switch[aria-checked=true] span{transform:translateX(16px)}
.dsh-bg-control{padding:14px 0;border-top:1px solid var(--dsw-alias-border-l1)}.dsh-bg-control-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:5px;font-size:13px}.dsh-bg-value{font-variant-numeric:tabular-nums;color:var(--bg-accent);font-size:12px;background:color-mix(in srgb,var(--bg-accent) 8%,transparent);padding:3px 7px;border-radius:6px;min-width:42px;text-align:center}
.dsh-bg-control input[type=range]{width:100%;margin:12px 0 0;accent-color:var(--bg-accent);cursor:pointer;height:18px}.dsh-bg-control input:disabled{cursor:default}
.dsh-bg-segments{display:flex;gap:4px;padding:4px;background:var(--dsw-alias-bg-layer-2);border-radius:10px;margin-top:12px}.dsh-bg-segments button{flex:1;border:0;background:transparent;color:var(--dsw-alias-label-secondary);padding:8px 4px;font:inherit;font-size:12px;border-radius:7px;cursor:pointer}.dsh-bg-segments button[aria-pressed=true]{background:var(--dsw-alias-bg-layer-1);color:var(--bg-accent);box-shadow:0 1px 4px #0001;font-weight:600}
.dsh-bg-footer{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:18px}.dsh-bg-status{font-size:12px;color:var(--dsw-alias-label-secondary)}.dsh-bg-status[role=alert]{color:var(--dsw-alias-state-error-primary)}
.dsh-bg-settings button:focus-visible,.dsh-bg-settings input:focus-visible{outline:2px solid var(--bg-accent);outline-offset:3px}.dsh-bg-settings fieldset{border:0;padding:0;margin:0;min-width:0}.dsh-bg-settings fieldset:disabled .dsh-bg-switch{opacity:.5}
@media(max-width:520px){.dsh-bg-card{padding:14px}.dsh-bg-preview{height:150px}.dsh-bg-footer{align-items:flex-start;flex-direction:column}}
`;

// Bundled by scripts/build.mjs into the DSH ModuleLoader format.
function createPlugin(React) {
  const h = React.createElement;
  return {
    inject: ['slots'],
    apply(ctx) {
      const storage = createStorage(window.indexedDB);
      let record = { preferences: normalizePreferences(), image: null, name: '' };
      let ready = false, busy = false, error = '', disposed = false, url = '';
      const listeners = new Set();
      const style = document.createElement('style');
      style.dataset.dshBackground = 'true';
      document.head.append(style);
      const settingsStyle = document.createElement('style');
      settingsStyle.textContent = SETTINGS_CSS;
      document.head.append(settingsStyle);
      const emit = () => listeners.forEach(fn => fn());
      function renderBackground() {
        if (url) URL.revokeObjectURL(url);
        url = record.image ? URL.createObjectURL(record.image) : '';
        const p = record.preferences;
        // Read pristine theme colors (not our own translucent overrides).
        style.textContent = '';
        const surfaces = {};
        if (p.enabled && url) {
          const computed = getComputedStyle(document.body);
          const probe = document.createElement('span');
          probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none';
          document.body.append(probe);
          for (let i = 0; i < computed.length; i++) {
            const key = computed[i];
            if (!key.startsWith('--dsw-') || !/(?:-bg-|(?:-fill)$|(?:-input-(?:major|minor))$)/.test(key)) continue;
            probe.style.color = `var(${key})`;
            surfaces[key] = getComputedStyle(probe).color;
          }
          probe.remove();
          style.textContent = backgroundCSS(url, p, surfaces);
        }
      }
      storage.read().then(saved => {
        if (disposed) return;
        if (saved) record = { ...saved, preferences: normalizePreferences(saved.preferences) };
        renderBackground();
      }).catch(e => { error = `读取背景失败：${e.message}`; }).finally(() => { ready = true; if (!disposed) emit(); });
      async function update(change) {
        if (!ready || busy || disposed) return;
        busy = true; error = ''; emit();
        try {
          const next = await change(record);
          await storage.write(next);
          if (!disposed) { record = next; renderBackground(); }
        } catch (e) { error = e.message || '保存失败，请重试。'; }
        finally { busy = false; if (!disposed) emit(); }
      }
      function Settings() {
        const fileInput = React.useRef(null);
        const [draft, setDraft] = React.useState({});
        const [, refresh] = React.useState(0);
        React.useEffect(() => { const fn = () => refresh(n => n + 1); listeners.add(fn); return () => listeners.delete(fn); }, []);
        const p = record.preferences;
        const set = (key, value) => update(r => ({ ...r, preferences: normalizePreferences({ ...r.preferences, [key]: value }) }));
        const commit = (key, value) => {
          void update(r => ({ ...r, preferences: normalizePreferences({ ...r.preferences, [key]: value }) })).finally(() => setDraft(d => { const next = { ...d }; delete next[key]; return next; }));
        };
        const slider = (key, title, hint, max, unit = '%') => {
          const value = draft[key] ?? p[key];
          return h('div', { className: 'dsh-bg-control', key },
            h('div', { className: 'dsh-bg-control-head' }, h('label', { htmlFor: `dsh-bg-${key}` }, title), h('output', { className: 'dsh-bg-value', htmlFor: `dsh-bg-${key}` }, `${value}${unit}`)),
            h('p', { className: 'dsh-bg-muted' }, hint),
            h('input', { id: `dsh-bg-${key}`, type: 'range', min: 0, max, value,
              onChange: e => setDraft(d => ({ ...d, [key]: Number(e.target.value) })),
              onPointerUp: e => commit(key, Number(e.currentTarget.value)),
              onKeyUp: e => { if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(e.key)) commit(key, Number(e.currentTarget.value)); },
              onBlur: e => { if (draft[key] !== undefined && !busy) commit(key, Number(e.currentTarget.value)); }
            })
          );
        };
        const icon = h('svg', { width: 32, height: 32, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, 'aria-hidden': true }, h('rect', { x: 3, y: 3, width: 18, height: 18, rx: 4 }), h('circle', { cx: 8, cy: 8, r: 1.5 }), h('path', { d: 'M3 17l5-5 4 4 4-6 5 7' }));
        return h('section', { className: 'dsh-bg-settings' },
          h('h2', null, '背景图片'),
          h('p', { className: 'dsh-bg-muted' }, '让首页多一点你的风格。设置页面保持原始主题，不受背景影响。'),
          h('fieldset', { disabled: !ready || busy },
            h('div', { className: 'dsh-bg-card' },
              h('div', { className: 'dsh-bg-top' }, h('span', { className: 'dsh-bg-title' }, '你的背景'), h('span', { className: 'dsh-bg-tag' }, '仅本地存储')),
              h('div', { className: 'dsh-bg-preview' }, url ? h('img', { src: url, alt: '所选背景图片预览', style: { objectFit: p.fit === 'contain' ? 'contain' : 'cover' } }) : h('div', { className: 'dsh-bg-empty' }, icon, h('strong', null, '选择一张喜欢的图片'), h('p', { className: 'dsh-bg-muted' }, '风景、插画，或你捕捉的美好瞬间'))),
              h('div', { className: 'dsh-bg-upload' }, h('span', { className: 'dsh-bg-filename', title: record.name }, record.name || 'JPG · PNG · WebP 等，最大 20 MB'), h('button', { type: 'button', className: 'dsh-bg-button dsh-bg-primary', onClick: () => fileInput.current?.click() }, url ? '更换图片' : '选择图片')),
              h('input', { ref: fileInput, type: 'file', hidden: true, accept: [...IMAGE_TYPES].join(','), onChange: e => {
                const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
                void update(async r => {
                  validateImage(file);
                  const checkURL = URL.createObjectURL(file);
                  try { const image = new Image(); image.src = checkURL; await image.decode(); }
                  catch { throw new Error('无法解码图片，请选择有效图片。'); }
                  finally { URL.revokeObjectURL(checkURL); }
                  return { ...r, image: file, name: file.name, preferences: { ...r.preferences, enabled: true } };
                });
              } })
            ),
            h('div', { className: 'dsh-bg-card' },
              h('div', { className: 'dsh-bg-top' }, h('div', null, h('div', { className: 'dsh-bg-title' }, '背景效果'), h('p', { className: 'dsh-bg-muted' }, '启用后仅在首页／聊天主界面显示')), h('button', { type: 'button', role: 'switch', 'aria-label': '启用背景图片', 'aria-checked': p.enabled, className: 'dsh-bg-switch', onClick: () => set('enabled', !p.enabled) }, h('span'))),
              slider('imageTransparency', '图片透明度', '数值越高，图片越淡。', 100),
              slider('panelTransparency', '面板透明度', '数值越高，背景越清晰；文字和图标保持清晰。', 100),
              slider('overlay', '主题遮罩', '柔化图片颜色，让聊天内容更易阅读。', 90),
              slider('blur', '背景模糊', '为背景添加柔和的虚化效果。', 24, 'px'),
              h('div', { className: 'dsh-bg-control' }, h('div', { className: 'dsh-bg-control-head' }, h('span', null, '图片适配')), h('div', { className: 'dsh-bg-segments', role: 'group', 'aria-label': '图片适配' }, ...[['cover','铺满'],['contain','完整显示'],['repeat','平铺']].map(([value,label]) => h('button', { key: value, type: 'button', 'aria-pressed': p.fit === value, onClick: () => set('fit', value) }, label))))
            ),
            h('div', { className: 'dsh-bg-footer' }, h('span', { className: 'dsh-bg-muted' }, '图片不上传服务器 · 设置自动保存'), h('button', { type: 'button', disabled: !record.image, className: 'dsh-bg-button', onClick: () => { setDraft({}); void update(() => ({ preferences: normalizePreferences(), image: null, name: '' })); } }, '移除背景'))
          ),
          h('p', { className: 'dsh-bg-status', role: error ? 'alert' : 'status', style: { marginTop: 12 } }, error || (!ready ? '正在读取设置…' : busy ? '正在保存…' : '关闭设置后即可查看首页效果。'))
        );
      }
      ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'dsh-background-image', label: '背景图片', order: 80 }, Settings));
      const themeObserver = new MutationObserver(() => { if (!disposed && ready) { renderBackground(); emit(); } });
      themeObserver.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme', 'class'] });
      ctx.effect(() => () => { disposed = true; themeObserver.disconnect(); style.remove(); settingsStyle.remove(); if (url) URL.revokeObjectURL(url); listeners.clear(); void storage.close(); });
    },
  };
}

return createPlugin(require('react'));
}});
