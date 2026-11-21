# Asset borrowing domain

The HRM uses `domain/asset.ts` and `application/AssetApplicationService.ts` as the source of truth for the borrowing lifecycle and agreement rules. The former standalone system's page, API handler, repository, and PostgreSQL migration have been removed (see git history before this cleanup); HRM uses its own UI and adapters.

## HRM integration

- `lib/assets/DrizzleAssetRepository.ts` adapts the application service to the HRM database and employee records.
- `/api/asset-requests` and its action routes use the HRM session and per-account permissions.
- `drizzle/0007_asset_borrowing.sql` creates the integrated request, item, agreement, signer, attachment, read, and event tables. It also copies existing HRM `asset_loans` rows into the request model.
- `components/hrm/assets/AssetBorrowingRequests.jsx` is the HRM-native request, approval, signature, and return workflow. Asset requests store the item names and quantities on each request; this module does not use a registered asset inventory.
- Set server-only Cloudinary credentials (`CLOUDINARY_URL` or `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`) to enable signed image and signature uploads via `/api/media/signature` and `/api/asset-requests/uploads`. Legacy `ibb.co` URLs are automatically migrated to Cloudinary on read, write, and via `npm run db:migrate-imgbb-cloudinary`.
