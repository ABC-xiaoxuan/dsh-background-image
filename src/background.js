import { normalizePreferences } from './preferences.js';
export function backgroundCSS(url, preferences, surfaces = {}) {
  const p = normalizePreferences(preferences);
  if (!url.startsWith('blob:')) throw new Error('Background must use a local Blob URL');
  const base = surfaces['--dsw-alias-bg-base'] || '#ffffff';
  const sidebar = surfaces['--dsw-specific-sidebar-fill'] || base;
  const input = surfaces['--dsw-specific-input-major'] || base;
  const mix = (color, transparency) => `color-mix(in srgb,${color} ${100 - transparency}%,transparent)`;
  // Gate every rule to the actual home/conversation surface, not merely the shell.
  const home = 'body:not(:has(.wCInkW_overlay)):has(.Dc7zOa_root, .Hqq-bq_root)';
  return `
${home} { isolation:isolate; }
${home}::before {
  content:""; position:fixed; inset:0; z-index:-1; pointer-events:none;
  background-image:linear-gradient(color-mix(in srgb,${base} ${p.overlay}%,transparent),color-mix(in srgb,${base} ${p.overlay}%,transparent)),url(${JSON.stringify(url)});
  background-size:${p.fit === 'repeat' ? 'auto' : p.fit};
  background-position:center; background-repeat:${p.fit === 'repeat' ? 'repeat' : 'no-repeat'};
  opacity:${(100 - p.imageTransparency) / 100}; filter:blur(${p.blur}px);
}
${home} .BynINW_frame { background:transparent !important; }
${home} .BynINW_sidebarCol { background:${mix(sidebar, p.sidebarTransparency)} !important; }
${home} .BynINW_sidebarCol ._2H3hWW_root { background:transparent !important; }
${home} .BynINW_centerCol { background:${base} !important; }
${home} .BynINW_centerCol:has(.Dc7zOa_root, .Hqq-bq_root) { background:${mix(base, p.chatTransparency)} !important; }
${home} .BynINW_rightbarCol { background:${base} !important; }
${home} .Dc7zOa_root { background:transparent !important; }
${home} .RlGAzG_card { background:${mix(input, p.inputTransparency)} !important; }
`;
}
