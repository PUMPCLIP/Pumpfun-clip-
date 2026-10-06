import path from 'node:path';

export const mediaRoot = path.resolve(
  process.env.PUMPCLIP_MEDIA_ROOT || process.env.MEDIA_ROOT || path.join(process.cwd(), 'data/private'),
);

export function localMediaPath(key) {
  if (typeof key !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,240}$/.test(key) || key.split('/').includes('..')) {
    throw new Error('Invalid local media key');
  }
  const resolved = path.resolve(mediaRoot, key);
  if (!resolved.startsWith(mediaRoot + path.sep)) throw new Error('Invalid local media path');
  return resolved;
}

export function mediaWorkdir(value = process.env.VIDEO_WORKDIR || '') {
  if (!value) return path.join(mediaRoot, 'native-clips');
  return path.isAbsolute(value) ? path.normalize(value) : path.resolve(process.cwd(), value);
}
