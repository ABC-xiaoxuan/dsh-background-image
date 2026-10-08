import { normalizePreferences } from './preferences.js';
// Background tokens are captured BEFORE our stylesheet is applied so overrides
// never compound and continue to follow the active light/dark theme.
export function backgroundCSS(url, preferences, surfaces = {}) {
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
