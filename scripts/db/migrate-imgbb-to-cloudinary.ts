import { sqlClient } from "@/lib/db/client";
import { isCloudinaryConfigured } from "@/lib/cloudinary";
import { migrateAllImgbbRecordsInDb } from "@/lib/cloudinary-migration";

async function main() {
  const args = new Set(process.argv.slice(2));
  const dryRun = args.has("--dry-run");
  const includeDataUrls = args.has("--include-data-urls");

  if (!dryRun && !isCloudinaryConfigured()) {
    console.error("Cloudinary credentials are not configured. Set CLOUDINARY_URL or CLOUDINARY_CLOUD_NAME/CLOUDINARY_API_KEY/CLOUDINARY_API_SECRET.");
    process.exitCode = 1;
    await sqlClient.end();
    return;
  }

  const result = await migrateAllImgbbRecordsInDb({ dryRun, includeDataUrls });
  console.log(JSON.stringify(result, null, 2));

  if (result.failedUrls.length > 0) {
    process.exitCode = 1;
  }

  await sqlClient.end();
}

main().catch(async (error) => {
  console.error("ImgBB to Cloudinary migration failed:", error);
  await sqlClient.end().catch(() => undefined);
  process.exit(1);
});
