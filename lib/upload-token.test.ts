import { describe, expect, it } from "vitest";
import { createDriveUploadToken, verifyDriveUploadToken, type DriveUploadTokenPayload } from "@/lib/upload-token";

const samplePayload: DriveUploadTokenPayload = {
  uploadUrl: "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=abc123",
  documentId: "11111111-1111-4111-8111-111111111111",
  employeeId: "22222222-2222-4222-8222-222222222222",
  userId: "33333333-3333-4333-8333-333333333333",
  fileName: "contract.pdf",
  mimeType: "application/pdf",
  fileSize: 8 * 1024 * 1024,
};

describe("drive upload tokens", () => {
  it("encrypts and decrypts an opaque upload token without exposing uploadUrl", async () => {
    const token = await createDriveUploadToken(samplePayload);
    expect(token).not.toContain("googleapis.com");
    expect(token).not.toContain("abc123");

    const verified = await verifyDriveUploadToken(token);
    expect(verified).toEqual(samplePayload);
  });

  it("rejects tampered tokens and non-Google upload URLs", async () => {
    const token = await createDriveUploadToken(samplePayload);
    const tampered = `${token.slice(0, -4)}xxxx`;
    await expect(verifyDriveUploadToken(tampered)).resolves.toBeNull();
    await expect(verifyDriveUploadToken("not-a-jwe")).resolves.toBeNull();

    await expect(
      createDriveUploadToken({ ...samplePayload, uploadUrl: "https://evil.example.com/upload" }),
    ).rejects.toThrow("Invalid Google Drive upload URL");
  });
});
