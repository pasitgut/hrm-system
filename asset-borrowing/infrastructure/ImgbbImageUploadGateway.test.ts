import { describe, expect, it, vi } from 'vitest';
import { ImgbbImageUploadGateway } from './ImgbbImageUploadGateway';

describe('ImgbbImageUploadGateway', () => {
  it('uploads an image and returns ImgBB direct URL', async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(JSON.stringify({ success: true, data: { url: 'https://i.ibb.co/example/photo.png' } }), {
          headers: { 'content-type': 'application/json' },
          status: 200,
        }),
    );
    const gateway = new ImgbbImageUploadGateway('test-key', fetcher);

    await expect(gateway.upload({ fileName: 'photo.png', mediaType: 'image/png', bytes: new TextEncoder().encode('image') })).resolves.toBe(
      'https://i.ibb.co/example/photo.png',
    );
    expect(fetcher).toHaveBeenCalledWith(
      'https://api.imgbb.com/1/upload?key=test-key',
      expect.objectContaining({ body: expect.any(FormData), method: 'POST' }),
    );
  });

  it('fails clearly for missing configuration or non-image input', async () => {
    await expect(
      new ImgbbImageUploadGateway('').upload({ fileName: 'photo.png', mediaType: 'image/png', bytes: new Uint8Array([1]) }),
    ).rejects.toThrow('ImgBB API key');
    await expect(
      new ImgbbImageUploadGateway('test-key').upload({ fileName: 'notes.txt', mediaType: 'text/plain', bytes: new Uint8Array([1]) }),
    ).rejects.toThrow('เฉพาะไฟล์รูปภาพ');
  });

  it('fails with a useful timeout when ImgBB never responds', async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
          }),
      );
      const gateway = new ImgbbImageUploadGateway('test-key', fetcher);
      const upload = gateway.upload({ fileName: 'photo.png', mediaType: 'image/png', bytes: new Uint8Array([1]) });

      const result = expect(upload).rejects.toThrow('ImgBB อัปโหลดใช้เวลานานเกินไป');
      await vi.advanceTimersByTimeAsync(15_000);
      await result;
    } finally {
      vi.useRealTimers();
    }
  });
});
