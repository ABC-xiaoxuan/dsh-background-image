// Bundled by scripts/build.mjs into the DSH ModuleLoader format.
function createPlugin(React) {
  const h = React.createElement;
  return {
    inject: ['slots'],
    apply(ctx) {
      const storage = createStorage(window.indexedDB);
      let record = { preferences: normalizePreferences(), image: null, name: '' };
      let ready = false, busy = false, error = '', disposed = false, url = '';
      let urlImage, cachedSurfaces, migrated = false, queue = Promise.resolve();
      const listeners = new Set();
      const style = document.createElement('style');
      style.dataset.dshBackground = 'true';
      document.head.append(style);
      const settingsStyle = document.createElement('style');
      settingsStyle.textContent = SETTINGS_CSS;
      document.head.append(settingsStyle);
      const emit = () => listeners.forEach(fn => fn());
      function renderBackground() {
        if (record.image !== urlImage) {
          if (url) URL.revokeObjectURL(url);
          url = record.image ? URL.createObjectURL(record.image) : '';
          urlImage = record.image;
        }
        const p = record.preferences;
        // Read pristine theme colors (not our own translucent overrides).
        style.textContent = '';
        const surfaces = cachedSurfaces || {};
        if (p.enabled && url && !cachedSurfaces) {
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
          cachedSurfaces = surfaces;
        }
        if (p.enabled && url) style.textContent = backgroundCSS(url, p, surfaces);
      }
      storage.read().then(saved => {
        if (disposed) return;
        if (saved) record = { ...saved, preferences: normalizePreferences(saved.preferences) };
        renderBackground();
      }).catch(e => { error = `读取背景失败：${e.message}`; }).finally(() => { ready = true; if (!disposed) emit(); });
      function update(change) {
        queue = queue.then(async () => {
          if (!ready || disposed) return;
          busy = true; error = ''; emit();
          try {
            const next = await change(record);
            await storage.write(next, !migrated || next.image !== record.image);
            migrated = true;
            if (!disposed) { record = next; renderBackground(); }
            return true;
          } catch (e) { error = e.message || '保存失败，请重试。'; return false; }
          finally { busy = false; if (!disposed) emit(); }
        });
        return queue;
      }
      function Settings() {
        const fileInput = React.useRef(null);
        const [draft, setDraft] = React.useState({});
        const mounted = React.useRef(true);
        const generation = React.useRef(0);
        const [scheduler] = React.useState(() => createPreferenceScheduler(async patch => {
          const revision = generation.current;
          const success = await update(r => ({ ...r, preferences: normalizePreferences({ ...r.preferences, ...patch }) }));
          if (mounted.current && revision === generation.current) setDraft(d => acknowledgeDraft(d, patch));
          // On failure revert preview to persisted values; error remains visible.
          return success;
        }));
        React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
        React.useEffect(() => () => { void scheduler.flush(); }, [scheduler]);
        const [, refresh] = React.useState(0);
        React.useEffect(() => { const fn = () => refresh(n => n + 1); listeners.add(fn); return () => listeners.delete(fn); }, []);
        const p = record.preferences;
        const set = (key, value) => update(r => ({ ...r, preferences: normalizePreferences({ ...r.preferences, [key]: value }) }));
        const commit = () => { void scheduler.flush(); };
        const slider = (key, title, hint, max, unit = '%') => {
          const value = draft[key] ?? p[key];
          return h('div', { className: 'dsh-bg-control', key },
            h('div', { className: 'dsh-bg-control-head' }, h('label', { htmlFor: `dsh-bg-${key}` }, title), h('output', { className: 'dsh-bg-value', htmlFor: `dsh-bg-${key}` }, `${value}${unit}`)),
            h('p', { className: 'dsh-bg-muted' }, hint),
            h('input', { id: `dsh-bg-${key}`, type: 'range', min: 0, max, value,
              onChange: e => { const value = Number(e.target.value); setDraft(d => ({ ...d, [key]: value })); scheduler.schedule(key, value); },
              onPointerUp: e => commit(key, Number(e.currentTarget.value)),
              onKeyUp: e => { if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(e.key)) commit(key, Number(e.currentTarget.value)); },
              onBlur: commit,
              onPointerCancel: commit
            })
          );
        };
        const preview = normalizePreferences({ ...p, ...draft });
        const tint = transparency => `color-mix(in srgb,var(--dsw-alias-bg-base) ${100 - transparency}%,transparent)`;
        const icon = h('svg', { width: 32, height: 32, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, 'aria-hidden': true }, h('rect', { x: 3, y: 3, width: 18, height: 18, rx: 4 }), h('circle', { cx: 8, cy: 8, r: 1.5 }), h('path', { d: 'M3 17l5-5 4 4 4-6 5 7' }));
        return h('section', { className: 'dsh-bg-settings' },
          h('h2', null, '背景图片'),
          h('p', { className: 'dsh-bg-muted' }, '让首页多一点你的风格。设置页面保持原始主题，不受背景影响。'),
          h('fieldset', { disabled: !ready },
            h('div', { className: 'dsh-bg-card' },
              h('div', { className: 'dsh-bg-top' }, h('span', { className: 'dsh-bg-title' }, '你的背景'), h('span', { className: 'dsh-bg-tag' }, '仅本地存储')),
              h('div', { className: 'dsh-bg-preview' }, url ? h(React.Fragment, null,
                h('div', { className: 'dsh-bg-preview-image', style: { backgroundImage: `url(${JSON.stringify(url)})`, backgroundSize: preview.fit === 'repeat' ? '80px auto' : preview.fit, backgroundRepeat: preview.fit === 'repeat' ? 'repeat' : 'no-repeat', opacity: preview.enabled ? 1 - preview.imageTransparency / 100 : 0, filter: `blur(${preview.blur / 3}px)` } }),
                h('div', { className: 'dsh-bg-preview-mask', style: { background: `color-mix(in srgb,var(--dsw-alias-bg-base) ${preview.overlay}%,transparent)`, opacity: preview.enabled ? 1 - preview.imageTransparency / 100 : 0 } }),
                h('div', { className: 'dsh-bg-mini', 'aria-label': '实时背景效果预览' },
                  h('aside', { style: { background: tint(preview.sidebarTransparency) } }, h('b', null, 'Harness'), h('span', null, '＋ 新会话'), h('span', null, '工作区')),
                  h('main', { style: { background: tint(preview.chatTransparency) } }, h('b', null, '你好，今天想做些什么？'), h('span', null, '这是聊天内容的可读性预览'), h('div', { style: { background: tint(preview.inputTransparency) } }, '发送消息…'))
                )) : h('div', { className: 'dsh-bg-empty' }, icon, h('strong', null, '选择一张喜欢的图片'), h('p', { className: 'dsh-bg-muted' }, '风景、插画，或你捕捉的美好瞬间'))),
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
              slider('sidebarTransparency', '侧栏透明度', '单独调整工作区与会话列表的底色。', 100),
              slider('chatTransparency', '聊天区透明度', '在背景展示与文字可读性之间取得平衡。', 100),
              slider('inputTransparency', '输入框透明度', '建议保留较强底色，让输入内容更清晰。', 100),
              slider('overlay', '主题遮罩', '柔化图片颜色，让聊天内容更易阅读。', 90),
              slider('blur', '背景模糊', '为背景添加柔和的虚化效果。', 24, 'px'),
              h('div', { className: 'dsh-bg-control' }, h('div', { className: 'dsh-bg-control-head' }, h('span', null, '图片适配')), h('div', { className: 'dsh-bg-segments', role: 'group', 'aria-label': '图片适配' }, ...[['cover','铺满'],['contain','完整显示'],['repeat','平铺']].map(([value,label]) => h('button', { key: value, type: 'button', 'aria-pressed': p.fit === value, onClick: () => set('fit', value) }, label))))
            ),
            h('div', { className: 'dsh-bg-footer' }, h('button', { type: 'button', className: 'dsh-bg-button', disabled: busy, onClick: () => { generation.current++; scheduler.cancel(); setDraft({}); void update(r => ({ ...r, preferences: normalizePreferences() })); } }, '恢复默认效果'), h('button', { type: 'button', disabled: !record.image, className: 'dsh-bg-button', onClick: () => { generation.current++; scheduler.cancel(); setDraft({}); void update(() => ({ preferences: normalizePreferences(), image: null, name: '' })); } }, '移除背景'))
          ),
          h('p', { className: 'dsh-bg-status', role: error ? 'alert' : 'status', style: { marginTop: 12 } }, error || (!ready ? '正在读取设置…' : busy ? '正在保存…' : '关闭设置后即可查看首页效果。'))
        );
      }
      ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'dsh-background-image', label: '背景图片', order: 80 }, Settings));
      const themeObserver = new MutationObserver(() => { if (!disposed && ready) { cachedSurfaces = undefined; renderBackground(); emit(); } });
      themeObserver.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme', 'class'] });
      ctx.effect(() => () => { disposed = true; themeObserver.disconnect(); style.remove(); settingsStyle.remove(); if (url) URL.revokeObjectURL(url); listeners.clear(); void storage.close(); });
    },
  };
}
