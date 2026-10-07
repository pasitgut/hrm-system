const DRIVE_API_ROOT = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_ROOT = "https://www.googleapis.com/upload/drive/v3";
const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const APP_FOLDER_NAME = "HRM Employee Documents";
const APP_FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
const REQUEST_TIMEOUT_MS = 120_000;

type TokenResponse = { access_token?: string; expires_in?: number };
type DriveFileResponse = { id?: string };

export class GoogleDriveError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "GoogleDriveError";
  }
}

let tokenCache: { value: string; expiresAt: number } | null = null;
let tokenRequest: Promise<string> | null = null;
let appFolderId: string | null = null;
let folderRequest: Promise<string> | null = null;

export function isGoogleDriveConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_DRIVE_OAUTH_CLIENT_ID?.trim()
      && process.env.GOOGLE_DRIVE_OAUTH_CLIENT_SECRET?.trim()
      && process.env.GOOGLE_DRIVE_REFRESH_TOKEN?.trim(),
  );
}

async function getAccessToken(): Promise<string> {
  if (!isGoogleDriveConfigured()) {
    throw new GoogleDriveError("Google Drive credentials are not configured", 503);
  }
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.value;
  if (tokenRequest) return tokenRequest;

  tokenRequest = (async () => {
    const body = new URLSearchParams({
      client_id: process.env.GOOGLE_DRIVE_OAUTH_CLIENT_ID!,
      client_secret: process.env.GOOGLE_DRIVE_OAUTH_CLIENT_SECRET!,
      refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN!,
      grant_type: "refresh_token",
    });
    let response: Response;
    try {
      response = await fetch(OAUTH_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new GoogleDriveError("Could not connect to Google OAuth", 502);
    }
    if (!response.ok) throw new GoogleDriveError("Google OAuth rejected the refresh token", response.status);

    const token = await response.json() as TokenResponse;
    if (!token.access_token) throw new GoogleDriveError("Google OAuth returned no access token", 502);
    tokenCache = {
      value: token.access_token,
      expiresAt: Date.now() + Math.max(60, token.expires_in ?? 3600) * 1000,
    };
    return token.access_token;
  })().finally(() => {
    tokenRequest = null;
  });

  return tokenRequest;
}

async function driveRequest(url: string, init: RequestInit = {}, accessToken?: string): Promise<Response> {
  const token = accessToken ?? await getAccessToken();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers,
      signal: init.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new GoogleDriveError("Could not connect to Google Drive", 502);
  }
  if (!response.ok) throw new GoogleDriveError("Google Drive request failed", response.status);
  return response;
}

async function getAppFolderId(accessToken: string): Promise<string> {
  if (appFolderId) return appFolderId;
  if (folderRequest) return folderRequest;

  folderRequest = (async () => {
    const query = new URLSearchParams({
      q: `name = '${APP_FOLDER_NAME}' and mimeType = '${APP_FOLDER_MIME_TYPE}' and trashed = false`,
      spaces: "drive",
      pageSize: "1",
      fields: "files(id)",
    });
    const listResponse = await driveRequest(`${DRIVE_API_ROOT}/files?${query}`, {}, accessToken);
    const listing = await listResponse.json() as { files?: DriveFileResponse[] };
    const existingId = listing.files?.[0]?.id;
    if (existingId) {
      appFolderId = existingId;
      return existingId;
    }

    const createResponse = await driveRequest(`${DRIVE_API_ROOT}/files?fields=id`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify({ name: APP_FOLDER_NAME, mimeType: APP_FOLDER_MIME_TYPE }),
    }, accessToken);
    const created = await createResponse.json() as DriveFileResponse;
    if (!created.id) throw new GoogleDriveError("Google Drive did not return a folder ID", 502);
    appFolderId = created.id;
    return created.id;
  })().finally(() => {
    folderRequest = null;
  });

  return folderRequest;
}

export async function uploadEmployeeDocumentToDrive(
  fileName: string,
  mimeType: string,
  fileData: Buffer,
  employeeDocumentId: string,
): Promise<string> {
  const token = await getAccessToken();
  const parentId = await getAppFolderId(token);
  const startResponse = await driveRequest(`${DRIVE_UPLOAD_ROOT}/files?uploadType=resumable&fields=id`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": mimeType,
      "X-Upload-Content-Length": String(fileData.byteLength),
    },
    body: JSON.stringify({
      name: fileName,
      mimeType,
      parents: [parentId],
      appProperties: { employeeDocumentId },
    }),
  }, token);
  const uploadUrl = startResponse.headers.get("Location");
  if (!uploadUrl) throw new GoogleDriveError("Google Drive did not return an upload URL", 502);
  const uploadEndpoint = new URL(uploadUrl);
  if (uploadEndpoint.protocol !== "https:" || uploadEndpoint.origin !== "https://www.googleapis.com") {
    throw new GoogleDriveError("Google Drive returned an invalid upload URL", 502);
  }

  const bytes = new Uint8Array(fileData.byteLength);
  bytes.set(fileData);
  const uploadResponse = await driveRequest(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": mimeType },
    body: bytes,
  }, token);
  const uploaded = await uploadResponse.json() as DriveFileResponse;
  if (!uploaded.id) throw new GoogleDriveError("Google Drive did not return a file ID", 502);
  return uploaded.id;
}

export async function findEmployeeDocumentInDrive(employeeDocumentId: string): Promise<string | null> {
  const token = await getAccessToken();
  const query = new URLSearchParams({
    q: `appProperties has { key='employeeDocumentId' and value='${employeeDocumentId}' } and trashed = false`,
    spaces: "drive",
    pageSize: "1",
    fields: "files(id)",
  });
  const response = await driveRequest(`${DRIVE_API_ROOT}/files?${query}`, {}, token);
  const listing = await response.json() as { files?: DriveFileResponse[] };
  return listing.files?.[0]?.id ?? null;
}

export async function downloadEmployeeDocumentFromDrive(fileId: string): Promise<Response> {
  return driveRequest(`${DRIVE_API_ROOT}/files/${encodeURIComponent(fileId)}?alt=media`, {
    method: "GET",
  });
}

export async function deleteEmployeeDocumentFromDrive(fileId: string): Promise<void> {
  try {
    await driveRequest(`${DRIVE_API_ROOT}/files/${encodeURIComponent(fileId)}`, { method: "DELETE" });
  } catch (error) {
    // Treat a file already removed directly from Drive as successfully deleted.
    if (error instanceof GoogleDriveError && error.status === 404) return;
    throw error;
  }
}
