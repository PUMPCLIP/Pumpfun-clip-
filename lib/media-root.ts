import path from 'node:path';

/**
 * Root for local private media. On Render, point this at the mounted persistent
 * disk (for example /var/data/pumpclip). Relative values remain compatible with
 * the repository's local development layout.
 */
export const mediaRoot = path.resolve(
  process.env.PUMPCLIP_MEDIA_ROOT || process.env.MEDIA_ROOT || path.join(process.cwd(), 'data/private'),
);

const safeKey = (key: string) => /^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,240}$/.test(key) && !key.split('/').includes('..');

export function localMediaPath(key: string): string {
  if (!safeKey(key)) throw new Error('INVALID_MEDIA_KEY');
  const resolved = path.resolve(mediaRoot, key);
  if (!resolved.startsWith(mediaRoot + path.sep)) throw new Error('INVALID_MEDIA_KEY');
  return resolved;
}

export function mediaWorkdir(value = process.env.VIDEO_WORKDIR || ''): string {
  if (!value) return path.join(mediaRoot, 'native-clips');
  return path.isAbsolute(value) ? path.normalize(value) : path.resolve(process.cwd(), value);
}
