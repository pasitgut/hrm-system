import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearImgbbMigrationCache,
  CLOUDINARY_FOLDERS,
  createCloudinaryDirectUploadParams,
  imgbbPublicId,
  isCloudinaryConfigured,
  isImgbbUrl,
  migrateHtmlImgbbUrlsToCloudinary,
  migrateImgbbUrlToCloudinary,
  signCloudinaryParams,
} from "@/lib/cloudinary";

function collectSourceFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      if (entry === "node_modules" || entry === ".next") continue;
      results.push(...collectSourceFiles(full));
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry) && !entry.includes(".test.")) {
      results.push(full);
    }
  }
  return results;
}

describe("cloudinary service and ImgBB migration", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    clearImgbbMigrationCache();
    delete process.env.CLOUDINARY_URL;
    delete process.env.CLOUDINARY_CLOUD_NAME;
    delete process.env.CLOUDINARY_API_KEY;
    delete process.env.CLOUDINARY_API_SECRET;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
  });

  it("loads config from individual env vars or CLOUDINARY_URL", () => {
    expect(isCloudinaryConfigured()).toBe(false);

    process.env.CLOUDINARY_CLOUD_NAME = "demo-cloud";
    process.env.CLOUDINARY_API_KEY = "123456";
    process.env.CLOUDINARY_API_SECRET = "mysecret";
    expect(isCloudinaryConfigured()).toBe(true);

    const signed = createCloudinaryDirectUploadParams("asset", { timestamp: 1735689600 });
    expect(signed.uploadUrl).toBe("https://api.cloudinary.com/v1_1/demo-cloud/image/upload");
    expect(signed.folder).toBe(CLOUDINARY_FOLDERS.asset);
    expect(signed.signature).toBe(
      signCloudinaryParams({ folder: "hrm/assets", timestamp: 1735689600 }, "mysecret"),
    );

    delete process.env.CLOUDINARY_CLOUD_NAME;
    delete process.env.CLOUDINARY_API_KEY;
    delete process.env.CLOUDINARY_API_SECRET;
    process.env.CLOUDINARY_URL = "cloudinary://key99:sec99@cloud99";
    expect(isCloudinaryConfigured()).toBe(true);
    expect(createCloudinaryDirectUploadParams("avatar", { timestamp: 1735689600 }).cloudName).toBe("cloud99");
  });

  it("matches Cloudinary SHA-1 signature specification exactly", () => {
    const sig = signCloudinaryParams(
      {
        timestamp: 1735689600,
        folder: "hrm/assets",
        file: "ignored",
        api_key: "ignored",
        signature: "ignored",
        empty: "",
      },
      "abcd",
    );
    expect(sig).toMatch(/^[a-f0-9]{40}$/);
    expect(sig).toBe(signCloudinaryParams({ folder: "hrm/assets", timestamp: 1735689600 }, "abcd"));
  });

  it("detects valid ImgBB URLs and rejects spoofs or other providers", () => {
    expect(isImgbbUrl("https://i.ibb.co/abc/sign.png")).toBe(true);
    expect(isImgbbUrl("https://ibb.co/xyz123")).toBe(true);
    expect(isImgbbUrl("http://image.ibb.co/foo.jpg")).toBe(true);

    expect(isImgbbUrl("https://res.cloudinary.com/demo/image/upload/v1/a.png")).toBe(false);
    expect(isImgbbUrl("https://notibb.co/a.png")).toBe(false);
    expect(isImgbbUrl("https://ibb.co.evil.com/a.png")).toBe(false);
    expect(isImgbbUrl("javascript:alert(1)")).toBe(false);
    expect(isImgbbUrl("")).toBe(false);
  });

  it("migrates ImgBB URLs idempotently to Cloudinary and caches repeat lookups", async () => {
    process.env.CLOUDINARY_URL = "cloudinary://k:s@demo";
    const sourceUrl = "https://i.ibb.co/bM8xXyGy/signature-1.jpg";
    const targetUrl = `https://res.cloudinary.com/demo/image/upload/hrm/signatures/${imgbbPublicId(sourceUrl)}.jpg`;

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ secure_url: targetUrl, public_id: `hrm/signatures/${imgbbPublicId(sourceUrl)}` }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const first = await migrateImgbbUrlToCloudinary(sourceUrl, "signature");
    const second = await migrateImgbbUrlToCloudinary(sourceUrl, "signature");
    expect(first).toBe(targetUrl);
    expect(second).toBe(targetUrl);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const nonImgbb = "https://res.cloudinary.com/demo/image/upload/v1/existing.png";
    await expect(migrateImgbbUrlToCloudinary(nonImgbb, "asset")).resolves.toBe(nonImgbb);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back safely on migration failure unless strict mode is enabled", async () => {
    process.env.CLOUDINARY_URL = "cloudinary://k:s@demo";
    const sourceUrl = "https://i.ibb.co/broken/image.png";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { message: "Not found" } }), { status: 404 })));

    await expect(migrateImgbbUrlToCloudinary(sourceUrl, "asset")).resolves.toBe(sourceUrl);
    await expect(migrateImgbbUrlToCloudinary(sourceUrl, "asset", { strict: true })).rejects.toThrow("Not found");
  });

  it("migrates all ImgBB URLs inside HTML while leaving other URLs intact", async () => {
    process.env.CLOUDINARY_URL = "cloudinary://k:s@demo";
    const html = '<p><img src="https://i.ibb.co/111/a.png" /><img src="https://res.cloudinary.com/demo/b.png" /><img src="https://i.ibb.co/222/c.jpg" /></p>';
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ secure_url: "https://res.cloudinary.com/demo/image/upload/migrated.png", public_id: "migrated" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await migrateHtmlImgbbUrlsToCloudinary(html, "agreement");
    expect(result.migratedCount).toBe(2);
    expect(result.failedUrls).toEqual([]);
    expect(result.html).not.toContain("ibb.co");
    expect(result.html).toContain("https://res.cloudinary.com/demo/b.png");
  });

  it("keeps ImgBB API endpoints and keys completely out of application source code", () => {
    const roots = ["app", "components", "lib"].map((folder) => path.join(process.cwd(), folder));
    const files = roots.flatMap((root) => collectSourceFiles(root));
    for (const file of files) {
      const content = readFileSync(file, "utf8");
      expect(content, `Unexpected api.imgbb.com in ${file}`).not.toContain("api.imgbb.com");
      expect(content, `Unexpected IMGBB_API_KEY in ${file}`).not.toContain("IMGBB_API_KEY");
    }
  });
});
