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
