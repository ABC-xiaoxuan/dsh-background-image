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
