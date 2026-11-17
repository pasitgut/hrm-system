# Asset borrowing domain

The HRM uses `domain/asset.ts` and `application/AssetApplicationService.ts` as the source of truth for the borrowing lifecycle and agreement rules. The former standalone system's page, API handler, repository, and PostgreSQL migration have been removed (see git history before this cleanup); HRM uses its own UI and adapters.

## HRM integration

- `lib/assets/DrizzleAssetRepository.ts` adapts the application service to the HRM database and employee records.
- `/api/asset-requests` and its action routes use the HRM session and per-account permissions.
- `drizzle/0007_asset_borrowing.sql` creates the integrated request, item, agreement, signer, attachment, read, and event tables. It also copies existing HRM `asset_loans` rows into the request model.
- `components/hrm/assets/AssetBorrowingRequests.jsx` is the HRM-native request, approval, signature, and return workflow. Asset requests store the item names and quantities on each request; this module does not use a registered asset inventory.
- Set the server-only `IMGBB_API_KEY` environment variable to enable image and signature uploads. The upload route (`app/api/asset-requests/uploads/route.ts`) keeps the provider key off the browser and stores only returned image URLs in PostgreSQL.
