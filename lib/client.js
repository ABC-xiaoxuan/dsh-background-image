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
  return `
body { isolation:isolate; ${tokens} }
body::before {
  content:""; position:fixed; inset:0; z-index:-1; pointer-events:none;
  background-image:linear-gradient(color-mix(in srgb,${base} ${p.overlay}%,transparent),color-mix(in srgb,${base} ${p.overlay}%,transparent)),url(${JSON.stringify(url)});
  background-size:${p.fit === 'repeat' ? 'auto' : p.fit};
  background-position:center; background-repeat:${p.fit === 'repeat' ? 'repeat' : 'no-repeat'};
  opacity:${(100 - p.imageTransparency) / 100}; filter:blur(${p.blur}px);
}
.BynINW_frame, .BynINW_frame > .BynINW_centerCol,
.BynINW_frame > .BynINW_sidebarCol, .BynINW_frame > .BynINW_rightbarCol,
.BynINW_frame .Dc7zOa_root { background:transparent !important; }
`;
}

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
        const [, refresh] = React.useState(0);
        React.useEffect(() => { const fn = () => refresh(n => n + 1); listeners.add(fn); return () => listeners.delete(fn); }, []);
        const p = record.preferences;
        const set = (key, value) => update(r => ({ ...r, preferences: normalizePreferences({ ...r.preferences, [key]: value }) }));
        const row = (label, control) => h('label', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, margin: '18px 0' } }, h('span', null, label), control);
        return h('section', { style: { padding: 24, maxWidth: 680, color: 'var(--dsw-alias-label-primary)' } },
          h('h2', { style: { fontSize: 22, fontWeight: 600 } }, '背景图片'),
          h('p', { style: { margin: '12px 0', color: 'var(--dsw-alias-label-secondary)' } }, '图片仅保存在此浏览器／桌面端本地，不上传服务器。支持最大 20 MB 的图片。'),
          h('fieldset', { disabled: !ready || busy, style: { border: 0, padding: 0 } },
            row('选择本地图片', h('input', { type: 'file', accept: [...IMAGE_TYPES].join(','), onChange: e => {
              const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
              void update(async r => {
                validateImage(file);
                const checkURL = URL.createObjectURL(file);
                try { const image = new Image(); image.src = checkURL; await image.decode(); }
                catch { throw new Error('无法解码图片，请选择有效图片。'); }
                finally { URL.revokeObjectURL(checkURL); }
                return { ...r, image: file, name: file.name, preferences: { ...r.preferences, enabled: true } };
              });
            } })),
            url ? h('img', { src: url, alt: '当前背景预览', style: { width: '100%', height: 180, objectFit: 'contain', borderRadius: 12, background: 'var(--dsw-alias-bg-layer-2)' } }) : null,
            h('p', null, record.name || '尚未选择背景图片'),
            row('启用背景', h('input', { type: 'checkbox', checked: p.enabled, onChange: e => set('enabled', e.target.checked) })),
            row(`背景图片透明度 ${p.imageTransparency}%`, h('input', { type: 'range', min: 0, max: 100, value: p.imageTransparency, onChange: e => set('imageTransparency', Number(e.target.value)) })),
            row(`界面面板透明度 ${p.panelTransparency}%`, h('input', { type: 'range', min: 0, max: 100, value: p.panelTransparency, onChange: e => set('panelTransparency', Number(e.target.value)) })),
            h('p', { style: { color: 'var(--dsw-alias-label-secondary)' } }, '图片透明度越高，图片越淡；面板透明度越高，背景越清晰。文字和图标不会变透明。网页、PDF 等嵌入内容不受影响。'),
            row(`主题遮罩 ${p.overlay}%`, h('input', { type: 'range', min: 0, max: 90, value: p.overlay, onChange: e => set('overlay', Number(e.target.value)) })),
            row(`背景模糊 ${p.blur}px`, h('input', { type: 'range', min: 0, max: 24, value: p.blur, onChange: e => set('blur', Number(e.target.value)) })),
            row('图片适配', h('select', { value: p.fit, onChange: e => set('fit', e.target.value), style: { background: 'var(--dsw-alias-bg-layer-1)', color: 'inherit', padding: 6 } },
              h('option', { value: 'cover' }, '铺满（裁切）'), h('option', { value: 'contain' }, '完整显示'), h('option', { value: 'repeat' }, '平铺'))),
            h('button', { type: 'button', onClick: () => update(() => ({ preferences: normalizePreferences(), image: null, name: '' })), style: { padding: '8px 16px', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 8 } }, '移除图片并恢复默认')
          ),
          h('p', { role: error ? 'alert' : 'status', style: { marginTop: 16 } }, error || (!ready ? '正在读取…' : busy ? '正在保存…' : '设置自动保存。'))
        );
      }
      ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'dsh-background-image', label: '背景图片', order: 80 }, Settings));
      const themeObserver = new MutationObserver(() => { if (!disposed && ready) { renderBackground(); emit(); } });
      themeObserver.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme', 'class'] });
      ctx.effect(() => () => { disposed = true; themeObserver.disconnect(); style.remove(); if (url) URL.revokeObjectURL(url); listeners.clear(); void storage.close(); });
    },
  };
}

return createPlugin(require('react'));
}});
