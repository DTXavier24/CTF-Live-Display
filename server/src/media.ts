// Uploaded media: sponsor videos (played by the sponsor-video template) and sponsor logos (ticker).
import { createWriteStream, mkdirSync, readdirSync, renameSync, rmSync, existsSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Transform, type Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

export type MediaKind = 'videos' | 'logos';

const ROOT = fileURLToPath(new URL('../../data/media/', import.meta.url));

export const MEDIA: Record<MediaKind, { dir: string; ext: RegExp; maxBytes: number }> = {
  videos: { dir: ROOT + 'videos/', ext: /\.(mp4|webm)$/i, maxBytes: 500 * 1024 * 1024 },
  // No SVG: served from our own origin it could run script against the admin session.
  logos: { dir: ROOT + 'logos/', ext: /\.(png|jpe?g|webp|gif)$/i, maxBytes: 5 * 1024 * 1024 },
};
for (const m of Object.values(MEDIA)) mkdirSync(m.dir, { recursive: true });

/** Plain names only: no paths, no dotfiles, known extension. */
export const validName = (kind: MediaKind, name: string) => /^[\w][\w .-]{0,100}$/.test(name) && MEDIA[kind].ext.test(name);

export function listMedia(kind: MediaKind) {
  return readdirSync(MEDIA[kind].dir).filter((f) => validName(kind, f)).sort();
}

export const mediaExists = (kind: MediaKind, name: string) => validName(kind, name) && existsSync(MEDIA[kind].dir + name);
export const mediaUrl = (kind: MediaKind, name: string) => `/media/${kind}/${encodeURIComponent(name)}`;

/** Stream an upload to disk via a temp file, so a failed or oversized upload never leaves a half file. */
export async function saveMedia(kind: MediaKind, name: string, body: Readable) {
  const { dir, maxBytes } = MEDIA[kind];
  const tmp = `${dir}.upload-${process.pid}-${Date.now()}`;
  let size = 0;
  const cap = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      size += chunk.length;
      cb(size > maxBytes ? new Error(`file larger than ${maxBytes / 1024 / 1024} MB`) : null, chunk);
    },
  });
  try {
    await pipeline(body, cap, createWriteStream(tmp));
    renameSync(tmp, dir + name);
  } catch (err) {
    rmSync(tmp, { force: true });
    throw err;
  }
  return size;
}

export function deleteMedia(kind: MediaKind, name: string) {
  if (!mediaExists(kind, name)) return false;
  rmSync(MEDIA[kind].dir + name);
  return true;
}
