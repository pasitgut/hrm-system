import { createHash } from "node:crypto";

export const CLOUDINARY_FOLDERS = {
  asset: "hrm/assets",
  signature: "hrm/signatures",
  avatar: "hrm/avatars",
  agreement: "hrm/agreements",
  leave: "hrm/leave",
} as const;

export type CloudinaryScope = keyof typeof CLOUDINARY_FOLDERS;

type CloudinaryConfig = {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
};

type CloudinaryUploadResponse = {
  secure_url?: string;
  public_id?: string;
  error?: { message?: string };
};

const UPLOAD_TIMEOUT_MS = 30_000;
const MAX_MIGRATION_CACHE_SIZE = 500;
const IMGBB_URL_IN_TEXT_REGEX = /https?:\/\/(?:[a-z0-9-]+\.)*ibb\.co\/[^\s"'<>)]+/gi;
const DATA_IMAGE_URL_REGEX = /^data:image\/(?:png|jpe?g|gif|webp);base64,/i;
const EXCLUDED_SIGN_KEYS = new Set(["file", "api_key", "cloud_name", "resource_type", "signature"]);

const migratedUrlCache = new Map<string, string>();

export class CloudinaryError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "CloudinaryError";
  }
}

export function isCloudinaryScope(value: unknown): value is CloudinaryScope {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(CLOUDINARY_FOLDERS, value);
}

function getCloudinaryConfig(): CloudinaryConfig | null {
  const rawUrl = process.env.CLOUDINARY_URL?.trim();
  if (rawUrl) {
    try {
      const parsed = new URL(rawUrl);
      const cloudName = parsed.hostname.trim();
      const apiKey = decodeURIComponent(parsed.username).trim();
      const apiSecret = decodeURIComponent(parsed.password).trim();
      if (parsed.protocol === "cloudinary:" && cloudName && apiKey && apiSecret) {
        return { cloudName, apiKey, apiSecret };
      }
    } catch {
      // Fall through to individual environment variables.
    }
  }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
  const apiKey = process.env.CLOUDINARY_API_KEY?.trim();
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim();
  if (cloudName && apiKey && apiSecret) {
    return { cloudName, apiKey, apiSecret };
  }
  return null;
}

export function isCloudinaryConfigured(): boolean {
  return getCloudinaryConfig() !== null;
}

function requireCloudinaryConfig(): CloudinaryConfig {
  const config = getCloudinaryConfig();
  if (!config) {
    throw new CloudinaryError("ยังไม่ได้ตั้งค่าการเชื่อมต่อ Cloudinary", 503);
  }
  return config;
}

export function signCloudinaryParams(
  params: Record<string, string | number | boolean | undefined>,
  apiSecret: string,
): string {
  const pairs = Object.entries(params)
    .filter(([key, value]) => !EXCLUDED_SIGN_KEYS.has(key) && value !== undefined && value !== null && value !== "")
    .sort(([left], [right]) => left.localeCompare(right, "en-US"))
    .map(([key, value]) => `${key}=${String(value)}`);
  return createHash("sha1").update(`${pairs.join("&")}${apiSecret}`).digest("hex");
}

export function createCloudinaryDirectUploadParams(
  scope: CloudinaryScope,
  options: { publicId?: string; timestamp?: number } = {},
) {
  const config = requireCloudinaryConfig();
  const folder = CLOUDINARY_FOLDERS[scope];
  const timestamp = options.timestamp ?? Math.floor(Date.now() / 1000);
  const signParams: Record<string, string | number | undefined> = {
    folder,
    timestamp,
    ...(options.publicId ? { public_id: options.publicId } : {}),
  };
  const signature = signCloudinaryParams(signParams, config.apiSecret);

  return {
    uploadUrl: `https://api.cloudinary.com/v1_1/${encodeURIComponent(config.cloudName)}/image/upload`,
    cloudName: config.cloudName,
    apiKey: config.apiKey,
    timestamp,
    folder,
    signature,
    ...(options.publicId ? { publicId: options.publicId } : {}),
  };
}

export async function uploadImageToCloudinary(
  source: Blob | File | Buffer | string,
  options: { scope: CloudinaryScope; fileName?: string; publicId?: string; overwrite?: boolean },
): Promise<{ url: string; publicId: string }> {
  const config = requireCloudinaryConfig();
  const folder = CLOUDINARY_FOLDERS[options.scope];
  const timestamp = Math.floor(Date.now() / 1000);
  const signParams: Record<string, string | number | boolean | undefined> = {
    folder,
    overwrite: options.overwrite,
    public_id: options.publicId,
    timestamp,
  };
  const signature = signCloudinaryParams(signParams, config.apiSecret);

  const form = new FormData();
  if (typeof source === "string") {
    form.append("file", source);
  } else if (Buffer.isBuffer(source)) {
    const bytes = new Uint8Array(source.byteLength);
    bytes.set(source);
    form.append("file", new Blob([bytes]), options.fileName || "image");
  } else {
    form.append("file", source, options.fileName || (source instanceof File ? source.name : "image"));
  }
  form.append("api_key", config.apiKey);
  form.append("timestamp", String(timestamp));
  form.append("folder", folder);
  form.append("signature", signature);
  if (options.publicId) form.append("public_id", options.publicId);
  if (options.overwrite !== undefined) form.append("overwrite", String(options.overwrite));

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
  try {
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${encodeURIComponent(config.cloudName)}/image/upload`,
      { method: "POST", body: form, signal: controller.signal },
    );
    const payload = await response.json().catch(() => ({})) as CloudinaryUploadResponse;
    if (!response.ok) {
      throw new CloudinaryError(
        payload.error?.message || "อัปโหลดรูปไป Cloudinary ไม่สำเร็จ กรุณาลองใหม่",
        response.status >= 400 && response.status < 500 ? 400 : 502,
      );
    }
    const url = payload.secure_url?.trim();
    if (!url || !/^https:\/\//i.test(url)) {
      throw new CloudinaryError("Cloudinary ไม่ส่ง URL รูปกลับมา", 502);
    }
    return { url, publicId: payload.public_id ?? options.publicId ?? "" };
  } catch (error) {
    if (error instanceof CloudinaryError) throw error;
    throw new CloudinaryError(
      controller.signal.aborted
        ? "อัปโหลดรูปไป Cloudinary ใช้เวลานานเกินไป กรุณาลองใหม่"
        : "เชื่อมต่อบริการ Cloudinary ไม่สำเร็จ",
      controller.signal.aborted ? 504 : 502,
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

export function isImgbbUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    return host === "ibb.co" || host.endsWith(".ibb.co");
  } catch {
    return false;
  }
}

export function extractImgbbUrls(text: string): string[] {
  if (!text) return [];
  const matches = text.match(IMGBB_URL_IN_TEXT_REGEX) ?? [];
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const candidate of matches) {
    const cleaned = candidate.replace(/[.,;!?]+$/, "");
    if (isImgbbUrl(cleaned) && !seen.has(cleaned)) {
      seen.add(cleaned);
      unique.push(cleaned);
    }
  }
  return unique;
}

export function containsImgbbUrl(text: unknown): boolean {
  if (typeof text !== "string" || !text) return false;
  return extractImgbbUrls(text).length > 0;
}

export function imgbbPublicId(url: string): string {
  return `imgbb_${createHash("sha256").update(url.trim()).digest("hex").slice(0, 24)}`;
}

export function clearImgbbMigrationCache(): void {
  migratedUrlCache.clear();
}

function cacheMigratedUrl(sourceUrl: string, targetUrl: string) {
  if (migratedUrlCache.size >= MAX_MIGRATION_CACHE_SIZE) {
    const firstKey = migratedUrlCache.keys().next().value;
    if (firstKey !== undefined) migratedUrlCache.delete(firstKey);
  }
  migratedUrlCache.set(sourceUrl, targetUrl);
}

export async function migrateImgbbUrlToCloudinary(
  url: string,
  scope: CloudinaryScope,
  options: { strict?: boolean } = {},
): Promise<string> {
  if (!isImgbbUrl(url)) return url;
  const trimmed = url.trim();
  const cacheKey = `${scope}:${trimmed}`;
  const cached = migratedUrlCache.get(cacheKey);
  if (cached) return cached;

  if (!isCloudinaryConfigured()) {
    if (options.strict) throw new CloudinaryError("ยังไม่ได้ตั้งค่าการเชื่อมต่อ Cloudinary", 503);
    return url;
  }

  try {
    const uploaded = await uploadImageToCloudinary(trimmed, {
      scope,
      publicId: imgbbPublicId(trimmed),
      overwrite: false,
    });
    cacheMigratedUrl(cacheKey, uploaded.url);
    return uploaded.url;
  } catch (error) {
    if (options.strict) throw error;
    console.warn("Auto-migration of ImgBB URL to Cloudinary failed", error instanceof Error ? error.message : error);
    return url;
  }
}

export async function migrateHtmlImgbbUrlsToCloudinary(
  html: string,
  scope: CloudinaryScope = "agreement",
  options: { strict?: boolean } = {},
): Promise<{ html: string; migratedCount: number; failedUrls: string[] }> {
  if (!html) return { html, migratedCount: 0, failedUrls: [] };
  const urls = extractImgbbUrls(html);
  if (!urls.length) return { html, migratedCount: 0, failedUrls: [] };

  let nextHtml = html;
  let migratedCount = 0;
  const failedUrls: string[] = [];

  for (const sourceUrl of urls) {
    try {
      const targetUrl = await migrateImgbbUrlToCloudinary(sourceUrl, scope, options);
      if (targetUrl !== sourceUrl) {
        nextHtml = nextHtml.split(sourceUrl).join(targetUrl);
        migratedCount += 1;
      } else {
        failedUrls.push(sourceUrl);
      }
    } catch (error) {
      if (options.strict) throw error;
      failedUrls.push(sourceUrl);
    }
  }

  return { html: nextHtml, migratedCount, failedUrls };
}

export async function migrateDataImageUrlToCloudinary(
  value: string,
  scope: CloudinaryScope,
): Promise<string> {
  if (!value || !DATA_IMAGE_URL_REGEX.test(value.trim()) || !isCloudinaryConfigured()) {
    return value;
  }
  try {
    const uploaded = await uploadImageToCloudinary(value.trim(), { scope });
    return uploaded.url;
  } catch (error) {
    console.warn("Migration of data:image URL to Cloudinary failed", error instanceof Error ? error.message : error);
    return value;
  }
}
