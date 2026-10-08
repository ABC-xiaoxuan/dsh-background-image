export const DEFAULTS = Object.freeze({ enabled: true, overlay: 20, imageTransparency: 0, panelTransparency: 80, blur: 0, fit: 'cover' });
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/bmp']);

function bounded(value, fallback, max) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.round(Math.min(max, Math.max(0, value))) : fallback;
}
export function normalizePreferences(value) {
  return {
    enabled: typeof value?.enabled === 'boolean' ? value.enabled : DEFAULTS.enabled,
    overlay: bounded(value?.overlay, DEFAULTS.overlay, 90),
    imageTransparency: bounded(value?.imageTransparency, DEFAULTS.imageTransparency, 100),
    panelTransparency: bounded(value?.panelTransparency, DEFAULTS.panelTransparency, 100),
    blur: bounded(value?.blur, DEFAULTS.blur, 24),
    fit: ['cover', 'contain', 'repeat'].includes(value?.fit) ? value.fit : DEFAULTS.fit,
  };
}
export function validateImage(file) {
  if (!file || !IMAGE_TYPES.has(file.type)) throw new Error('请选择 JPG、PNG、WebP、GIF、AVIF 或 BMP 图片。');
  if (!file.size) throw new Error('图片文件为空。');
  if (file.size > MAX_FILE_BYTES) throw new Error('图片不能超过 20 MB。');
}
