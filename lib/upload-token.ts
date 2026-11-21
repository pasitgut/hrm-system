import { createHash } from "node:crypto";
import { EncryptJWT, jwtDecrypt } from "jose";

const TOKEN_ISSUER = "hrm:drive-upload";
const TOKEN_TTL = "30m";

export type DriveUploadTokenPayload = {
  uploadUrl: string;
  documentId: string;
  employeeId: string;
  userId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
};

function getEncryptionKey(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not set");
  }
  return new Uint8Array(createHash("sha256").update(`drive-upload:${secret}`).digest());
}

function isValidDriveUploadUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && parsed.origin === "https://www.googleapis.com";
  } catch {
    return false;
  }
}

export async function createDriveUploadToken(payload: DriveUploadTokenPayload): Promise<string> {
  if (!isValidDriveUploadUrl(payload.uploadUrl)) {
    throw new Error("Invalid Google Drive upload URL");
  }
  return new EncryptJWT({ ...payload })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuer(TOKEN_ISSUER)
    .setIssuedAt()
    .setExpirationTime(TOKEN_TTL)
    .encrypt(getEncryptionKey());
}

export async function verifyDriveUploadToken(token: string): Promise<DriveUploadTokenPayload | null> {
  try {
    const { payload } = await jwtDecrypt(token, getEncryptionKey(), { issuer: TOKEN_ISSUER });
    if (
      typeof payload.uploadUrl !== "string" ||
      typeof payload.documentId !== "string" ||
      typeof payload.employeeId !== "string" ||
      typeof payload.userId !== "string" ||
      typeof payload.fileName !== "string" ||
      typeof payload.mimeType !== "string" ||
      typeof payload.fileSize !== "number" ||
      !Number.isInteger(payload.fileSize) ||
      payload.fileSize <= 0 ||
      !isValidDriveUploadUrl(payload.uploadUrl)
    ) {
      return null;
    }

    return {
      uploadUrl: payload.uploadUrl,
      documentId: payload.documentId,
      employeeId: payload.employeeId,
      userId: payload.userId,
      fileName: payload.fileName,
      mimeType: payload.mimeType,
      fileSize: payload.fileSize,
    };
  } catch {
    return null;
  }
}
