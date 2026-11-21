import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DRIVE_CHUNK_ALIGNMENT_BYTES,
  DRIVE_UPLOAD_CHUNK_BYTES,
  GoogleDriveError,
  startEmployeeDocumentResumableUpload,
  uploadEmployeeDocumentChunkToDrive,
} from "@/lib/google-drive";

describe("google-drive resumable chunked uploads", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.GOOGLE_DRIVE_OAUTH_CLIENT_ID = "client-id";
    process.env.GOOGLE_DRIVE_OAUTH_CLIENT_SECRET = "client-secret";
    process.env.GOOGLE_DRIVE_REFRESH_TOKEN = "refresh-token";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
  });

  it("uses 3 MiB chunks aligned to Google Drive 256 KiB blocks", () => {
    expect(DRIVE_CHUNK_ALIGNMENT_BYTES).toBe(256 * 1024);
    expect(DRIVE_UPLOAD_CHUNK_BYTES).toBe(3 * 1024 * 1024);
    expect(DRIVE_UPLOAD_CHUNK_BYTES % DRIVE_CHUNK_ALIGNMENT_BYTES).toBe(0);
  });

  it("starts a resumable session and uploads multi-chunk files handling 308 -> 200", async () => {
    const uploadUrl = "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=session-1";
    const fetchMock = vi.fn()
      // 1. OAuth token
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "tok-1", expires_in: 3600 }), { status: 200 }))
      // 2. Folder listing
      .mockResolvedValueOnce(new Response(JSON.stringify({ files: [{ id: "folder-1" }] }), { status: 200 }))
      // 3. Init resumable session
      .mockResolvedValueOnce(new Response(null, { status: 200, headers: { Location: uploadUrl } }))
      // 4. First chunk -> 308 Resume Incomplete
      .mockResolvedValueOnce(new Response(null, { status: 308, headers: { Range: `bytes=0-${DRIVE_UPLOAD_CHUNK_BYTES - 1}` } }))
      // 5. Final chunk -> 200 OK
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "drive-file-99" }), { status: 200 }));

    vi.stubGlobal("fetch", fetchMock);

    const totalSize = DRIVE_UPLOAD_CHUNK_BYTES + 1024;
    const sessionUrl = await startEmployeeDocumentResumableUpload({
      fileName: "big.pdf",
      mimeType: "application/pdf",
      fileSize: totalSize,
      employeeDocumentId: "doc-1",
    });
    expect(sessionUrl).toBe(uploadUrl);

    const first = await uploadEmployeeDocumentChunkToDrive({
      uploadUrl: sessionUrl,
      mimeType: "application/pdf",
      chunk: new Uint8Array(DRIVE_UPLOAD_CHUNK_BYTES),
      start: 0,
      end: DRIVE_UPLOAD_CHUNK_BYTES - 1,
      totalSize,
    });
    expect(first).toEqual({ done: false, nextByte: DRIVE_UPLOAD_CHUNK_BYTES });

    const second = await uploadEmployeeDocumentChunkToDrive({
      uploadUrl: sessionUrl,
      mimeType: "application/pdf",
      chunk: new Uint8Array(1024),
      start: DRIVE_UPLOAD_CHUNK_BYTES,
      end: totalSize - 1,
      totalSize,
    });
    expect(second).toEqual({ done: true, driveFileId: "drive-file-99" });
  });

  it("rejects unaligned intermediate chunks and surfaces 410 expired sessions", async () => {
    const uploadUrl = "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=session-2";
    await expect(
      uploadEmployeeDocumentChunkToDrive({
        uploadUrl,
        mimeType: "application/pdf",
        chunk: new Uint8Array(1000),
        start: 0,
        end: 999,
        totalSize: 5000,
      }),
    ).rejects.toMatchObject({ status: 400 });

    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(null, { status: 410 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      uploadEmployeeDocumentChunkToDrive({
        uploadUrl,
        mimeType: "application/pdf",
        chunk: new Uint8Array(DRIVE_CHUNK_ALIGNMENT_BYTES),
        start: 0,
        end: DRIVE_CHUNK_ALIGNMENT_BYTES - 1,
        totalSize: DRIVE_CHUNK_ALIGNMENT_BYTES + 512,
      }),
    ).rejects.toBeInstanceOf(GoogleDriveError);
  });
});
