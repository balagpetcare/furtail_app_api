import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, normalize, relative, sep } from 'node:path';
import { randomUUID } from 'node:crypto';

export interface UploadedMediaInput {
  ownerUserId: number;
  filename: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
  purpose?: 'profile' | 'post' | 'gallery' | 'generic';
}

export interface StoredMediaDescriptor {
  storageKey: string;
  publicUrl: string;
  thumbnailUrl?: string | null;
  hlsUrl?: string | null;
  status: 'READY' | 'PROCESSING' | 'FAILED';
  processingError?: string | null;
}

export interface MediaStorageAdapter {
  upload(input: UploadedMediaInput): Promise<StoredMediaDescriptor>;
  delete(storageKey: string): Promise<void>;
}

const DEFAULT_MEDIA_ROOT = join(process.cwd(), '.media-store');
const MEDIA_PUBLIC_PREFIX = '/api/v1/media';

function safeFilename(filename: string): string {
  const clean = filename.trim() || 'upload.bin';
  return Array.from(clean)
    .map((char) => {
      const code = char.charCodeAt(0);
      if (code < 32 || '[<>:"/\\|?*]'.includes(char)) {
        return '_';
      }
      return char;
    })
    .join('');
}

function buildStorageKey(ownerUserId: number, filename: string): string {
  const safeName = encodeURIComponent(safeFilename(filename));
  return `${ownerUserId}/${Date.now()}-${randomUUID().slice(0, 12)}/${safeName}`;
}

function resolveMediaPath(rootDir: string, storageKey: string): string {
  const normalizedRoot = normalize(rootDir);
  const normalizedPath = normalize(join(normalizedRoot, storageKey));
  const rel = relative(normalizedRoot, normalizedPath);
  if (rel.startsWith('..') || rel.includes(`..${sep}`)) {
    throw new Error('Invalid media storage key');
  }
  return normalizedPath;
}

export function resolveStoredMediaPath(storageKey: string, rootDir = DEFAULT_MEDIA_ROOT): string {
  return resolveMediaPath(rootDir, storageKey);
}

export function buildMediaPublicUrl(storageKey: string): string {
  return `${MEDIA_PUBLIC_PREFIX}/${storageKey}`;
}

export class InMemoryMediaStorageAdapter implements MediaStorageAdapter {
  constructor(private readonly rootDir: string = DEFAULT_MEDIA_ROOT) {}

  async upload(input: UploadedMediaInput): Promise<StoredMediaDescriptor> {
    const storageKey = buildStorageKey(input.ownerUserId, input.filename);
    const publicUrl = buildMediaPublicUrl(storageKey);
    const filePath = resolveMediaPath(this.rootDir, storageKey);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, input.buffer);

    return {
      storageKey,
      publicUrl,
      thumbnailUrl: input.mimetype.startsWith('image/') ? publicUrl : null,
      hlsUrl: input.mimetype.startsWith('video/') ? publicUrl : null,
      status: 'READY',
      processingError: null,
    };
  }

  async delete(storageKey: string): Promise<void> {
    const filePath = resolveMediaPath(this.rootDir, storageKey);
    try {
      await unlink(filePath);
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        (error as { code?: string }).code === 'ENOENT'
      ) {
        return;
      }
      throw error;
    }
  }
}
