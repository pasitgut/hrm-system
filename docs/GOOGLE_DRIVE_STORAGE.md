# Google Drive storage for employee documents

Employee document contents are uploaded to an app-managed `HRM Employee Documents` folder in the Google Drive account that authorized the OAuth refresh token. PostgreSQL stores only document metadata, the Google Drive file ID, and the existing per-document access list. Downloads go through the HRM API, which checks the user's permissions before fetching the file. The app does not create public Drive links or grant Drive permissions to HRM users; the Google account's own Drive sharing policies still apply.

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

## Move documents already stored in PostgreSQL

The storage migration keeps older file bytes available until they are copied. After setting the Drive credentials and applying database migrations, run:

```sh
npm run db:migrate-employee-documents-drive
```

The command uploads each legacy document, records its Drive file ID, and clears its PostgreSQL binary value. It can be run again if the migration is interrupted.
