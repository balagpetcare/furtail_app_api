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
}

export class InMemoryMediaStorageAdapter implements MediaStorageAdapter {
  private nextId = 1;

  async upload(input: UploadedMediaInput): Promise<StoredMediaDescriptor> {
    const id = this.nextId++;
    const safeName = encodeURIComponent(input.filename || `upload-${id}`);
    const publicUrl = `memory://media/${input.ownerUserId}/${id}/${safeName}`;

    return {
      storageKey: `memory:${input.ownerUserId}:${id}`,
      publicUrl,
      thumbnailUrl: input.mimetype.startsWith('image/') ? publicUrl : null,
      hlsUrl: input.mimetype.startsWith('video/') ? `${publicUrl}/stream.m3u8` : null,
      status: 'READY',
      processingError: null,
    };
  }
}
