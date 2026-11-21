# Google Drive storage for employee documents

Employee document contents are uploaded to an app-managed `HRM Employee Documents` folder in the Google Drive account that authorized the OAuth refresh token. PostgreSQL stores only document metadata, the Google Drive file ID, and the existing per-document access list. Downloads go through the HRM API, which checks the user's permissions before fetching the file. The app does not create public Drive links or grant Drive permissions to HRM users; the Google account's own Drive sharing policies still apply.

## Large file uploads and downloads (> 4.5 MB on Vercel)

Vercel serverless functions enforce a 4.5 MB request body limit and a 4.5 MB non-streamed response limit. To support employee documents up to **50 MB**:

1. **Initialize upload (`POST /api/employees/[id]/documents/upload/init`):** Validates permission, filename, size (`<= 50 MB`), and file header magic bytes, opens a Google Drive resumable upload session, and returns an encrypted stateless `uploadToken` (JWE via `JWT_SECRET`) plus the `chunkSize` (3 MiB, aligned to Google Drive's 256 KiB block requirement).
2. **Chunked upload (`PUT /api/employees/[id]/documents/upload/chunk`):** Streams the file from the browser in 3 MiB chunks to Google Drive (`308 Resume Incomplete` -> `200 OK`), verifies chunk 0's magic bytes, and inserts the metadata row into `employee_documents` once the final chunk completes.
3. **Streaming download (`GET /api/employee-documents/[id]/file`):** Verifies permissions and streams the response body directly from Google Drive in Node.js runtime (`force-dynamic`).

## Configure Google Drive

1. Create a Google Cloud project and enable the Google Drive API.
2. Configure the OAuth consent screen and create an OAuth client.
3. Obtain an offline refresh token for the same OAuth client with the `https://www.googleapis.com/auth/drive.file` scope. In Google OAuth Playground, open the settings, enable **Use your own OAuth credentials**, enter the client ID and secret, authorize the scope, then exchange the authorization code for tokens and copy the refresh token.
4. Add these server-side values to `.env` (or your deployment's secret settings):

   ```env
   GOOGLE_DRIVE_OAUTH_CLIENT_ID=...
   GOOGLE_DRIVE_OAUTH_CLIENT_SECRET=...
   GOOGLE_DRIVE_REFRESH_TOKEN=...
   ```

5. Apply database migrations with `npm run db:migrate`, then restart the app. The HRM folder is created automatically on the first upload.

Use a dedicated Google account for HRM files. Do not put these credentials in client-side variables or commit them. For production, publish the OAuth consent configuration; a Google OAuth project left in Testing mode can issue refresh tokens that expire after seven days.
