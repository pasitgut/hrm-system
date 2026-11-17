import { and, eq, isNull } from "drizzle-orm";
import { db, sqlClient } from "@/lib/db/client";
import { employeeDocuments } from "@/lib/db/schema";
import {
  deleteEmployeeDocumentFromDrive,
  findEmployeeDocumentInDrive,
  isGoogleDriveConfigured,
  uploadEmployeeDocumentToDrive,
} from "@/lib/google-drive";

async function main() {
  if (!isGoogleDriveConfigured()) {
    throw new Error("Set GOOGLE_DRIVE_OAUTH_CLIENT_ID, GOOGLE_DRIVE_OAUTH_CLIENT_SECRET, and GOOGLE_DRIVE_REFRESH_TOKEN first.");
  }

  const legacyDocuments = await db
    .select({
      id: employeeDocuments.id,
      fileName: employeeDocuments.fileName,
      mimeType: employeeDocuments.mimeType,
      fileData: employeeDocuments.fileData,
    })
    .from(employeeDocuments)
    .where(isNull(employeeDocuments.driveFileId));

  if (legacyDocuments.length === 0) {
    console.log("No legacy employee documents need migration.");
    return;
  }

  for (const document of legacyDocuments) {
    if (!document.fileData) {
      throw new Error(`Document ${document.id} has neither a Drive file ID nor legacy file data.`);
    }

    const existingDriveFileId = await findEmployeeDocumentInDrive(document.id);
    const driveFileId = existingDriveFileId ?? await uploadEmployeeDocumentToDrive(
      document.fileName,
      document.mimeType,
      document.fileData,
      document.id,
    );
    try {
      const [updated] = await db
        .update(employeeDocuments)
        .set({ driveFileId, fileData: null })
        .where(and(eq(employeeDocuments.id, document.id), isNull(employeeDocuments.driveFileId)))
        .returning({ id: employeeDocuments.id });

      if (!updated) {
        if (!existingDriveFileId) await deleteEmployeeDocumentFromDrive(driveFileId);
        continue;
      }
    } catch (error) {
      await deleteEmployeeDocumentFromDrive(driveFileId).catch(() => undefined);
      throw error;
    }

    console.log(`Migrated employee document ${document.id} to Google Drive.`);
  }

  console.log(`Migrated ${legacyDocuments.length} employee document(s).`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Employee document migration failed.");
    process.exitCode = 1;
  })
  .finally(async () => {
    await sqlClient.end();
  });
