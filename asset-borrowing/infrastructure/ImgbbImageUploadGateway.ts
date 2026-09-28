import { ConfigurationError, DataContractError } from '@/shared/lib/errors';
import type { AssetImageUpload, AssetImageUploadGateway } from '../application/ports';

const MAX_IMAGE_BYTES = 32 * 1024 * 1024;
const UPLOAD_TIMEOUT_MS = 15_000;

type ImgbbResponse = {
  success?: boolean;
  data?: { url?: string };
};

const defaultFetch: typeof fetch = (input, init) => globalThis.fetch(input, init);

export class ImgbbImageUploadGateway implements AssetImageUploadGateway {
  constructor(
    private readonly apiKey: string,
    private readonly fetcher: typeof fetch = defaultFetch,
  ) {}

  async upload(image: AssetImageUpload): Promise<string> {
    if (!this.apiKey.trim()) {
      throw new ConfigurationError('ยังไม่ได้ตั้งค่า ImgBB API key ใน VITE_IMGBB_API_KEY');
    }
    if (!image.mediaType.startsWith('image/')) {
      throw new DataContractError('รองรับเฉพาะไฟล์รูปภาพสำหรับการอัปโหลด');
    }
    if (image.bytes.byteLength > MAX_IMAGE_BYTES) {
      throw new DataContractError('ไฟล์รูปภาพต้องมีขนาดไม่เกิน 32 MB');
    }

    const body = new FormData();
    const buffer = image.bytes.buffer.slice(
      image.bytes.byteOffset,
      image.bytes.byteOffset + image.bytes.byteLength,
    ) as ArrayBuffer;
    body.append('image', new Blob([buffer], { type: image.mediaType }), image.fileName);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
    try {
      const response = await this.fetcher(
        `https://api.imgbb.com/1/upload?key=${encodeURIComponent(this.apiKey.trim())}`,
        { method: 'POST', body, signal: controller.signal },
      );
      if (!response.ok) {
        throw new DataContractError(`ImgBB อัปโหลดไม่สำเร็จ (HTTP ${response.status})`);
      }
      const payload = (await response.json()) as ImgbbResponse;
      const url = payload.success && payload.data?.url?.trim();
      if (!url) {
        throw new DataContractError('ImgBB ตอบกลับโดยไม่มี URL รูปภาพ');
      }
      return url;
    } catch (error) {
      if (controller.signal.aborted) {
        throw new DataContractError('ImgBB อัปโหลดใช้เวลานานเกินไป กรุณาลองใหม่อีกครั้ง');
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
