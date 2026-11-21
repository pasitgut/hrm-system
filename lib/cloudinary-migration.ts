import { and, eq, ilike, or } from "drizzle-orm";
import type { AssetAgreement, AssetRequest } from "@/asset-borrowing/domain/asset";
import { db } from "@/lib/db/client";
import {
  assetAgreements,
  assetAgreementSigners,
  assetAgreementTemplates,
  assetRequestAttachments,
  assetRequests,
  employees,
  leaveRequests,
} from "@/lib/db/schema";
import {
  containsImgbbUrl,
  isCloudinaryConfigured,
  isImgbbUrl,
  migrateDataImageUrlToCloudinary,
  migrateHtmlImgbbUrlsToCloudinary,
  migrateImgbbUrlToCloudinary,
} from "@/lib/cloudinary";

function hasImgbbInAgreement(agreement: AssetAgreement | null | undefined): boolean {
  if (!agreement) return false;
  if (
    containsImgbbUrl(agreement.header) ||
    containsImgbbUrl(agreement.body) ||
    containsImgbbUrl(agreement.footer)
  ) {
    return true;
  }
  return agreement.signatureBoxes.some(
    (box) => isImgbbUrl(box.signatureData) || isImgbbUrl(box.returnSignatureData),
  );
}

function hasImgbbInAssetRequest(item: AssetRequest): boolean {
  if (
    isImgbbUrl(item.imageUrl) ||
    isImgbbUrl(item.borrowerSignatureData) ||
    isImgbbUrl(item.approvedBorrowSignatureData) ||
    item.additionalImages.some((url) => isImgbbUrl(url))
  ) {
    return true;
  }
  return hasImgbbInAgreement(item.agreement);
}

export async function migrateAgreementImgbbUrls(
  agreement: AssetAgreement,
  options: { strict?: boolean } = {},
): Promise<{ agreement: AssetAgreement; changed: boolean }> {
  if (!isCloudinaryConfigured() || !hasImgbbInAgreement(agreement)) {
    return { agreement, changed: false };
  }

  let changed = false;
  const [headerRes, bodyRes, footerRes] = await Promise.all([
    migrateHtmlImgbbUrlsToCloudinary(agreement.header, "agreement", options),
    migrateHtmlImgbbUrlsToCloudinary(agreement.body, "agreement", options),
    migrateHtmlImgbbUrlsToCloudinary(agreement.footer, "agreement", options),
  ]);
  if (headerRes.migratedCount > 0 || bodyRes.migratedCount > 0 || footerRes.migratedCount > 0) {
    changed = true;
  }

  const nextBoxes = await Promise.all(
    agreement.signatureBoxes.map(async (box) => {
      const nextSig = box.signatureData && isImgbbUrl(box.signatureData)
        ? await migrateImgbbUrlToCloudinary(box.signatureData, "signature", options)
        : box.signatureData;
      const nextReturnSig = box.returnSignatureData && isImgbbUrl(box.returnSignatureData)
        ? await migrateImgbbUrlToCloudinary(box.returnSignatureData, "signature", options)
        : box.returnSignatureData;
      if (nextSig !== box.signatureData || nextReturnSig !== box.returnSignatureData) {
        changed = true;
        return {
          ...box,
          ...(nextSig !== undefined ? { signatureData: nextSig } : {}),
          ...(nextReturnSig !== undefined ? { returnSignatureData: nextReturnSig } : {}),
        };
      }
      return box;
    }),
  );

  if (!changed) return { agreement, changed: false };
  return {
    changed: true,
    agreement: {
      ...agreement,
      header: headerRes.html,
      body: bodyRes.html,
      footer: footerRes.html,
      signatureBoxes: nextBoxes,
    },
  };
}

export async function healAssetRequestImgbbUrls(item: AssetRequest): Promise<AssetRequest> {
  if (!isCloudinaryConfigured() || !hasImgbbInAssetRequest(item)) {
    return item;
  }

  const attachmentUpdates: Array<{ kind: "request" | "additional"; oldUrl: string; newUrl: string }> = [];

  let nextImageUrl = item.imageUrl;
  if (isImgbbUrl(item.imageUrl)) {
    nextImageUrl = await migrateImgbbUrlToCloudinary(item.imageUrl, "asset");
    if (nextImageUrl !== item.imageUrl) {
      attachmentUpdates.push({ kind: "request", oldUrl: item.imageUrl, newUrl: nextImageUrl });
    }
  }

  const nextAdditionalImages = await Promise.all(
    item.additionalImages.map(async (url) => {
      if (!isImgbbUrl(url)) return url;
      const migrated = await migrateImgbbUrlToCloudinary(url, "asset");
      if (migrated !== url) {
        attachmentUpdates.push({ kind: "additional", oldUrl: url, newUrl: migrated });
      }
      return migrated;
    }),
  );

  const nextBorrowerSig = isImgbbUrl(item.borrowerSignatureData)
    ? await migrateImgbbUrlToCloudinary(item.borrowerSignatureData, "signature")
    : item.borrowerSignatureData;
  const nextApprovedSig = isImgbbUrl(item.approvedBorrowSignatureData)
    ? await migrateImgbbUrlToCloudinary(item.approvedBorrowSignatureData, "signature")
    : item.approvedBorrowSignatureData;

  const agreementOutcome = item.agreement
    ? await migrateAgreementImgbbUrls(item.agreement)
    : { agreement: null, changed: false };

  const requestSigChanged =
    nextBorrowerSig !== item.borrowerSignatureData ||
    nextApprovedSig !== item.approvedBorrowSignatureData;

  if (!attachmentUpdates.length && !requestSigChanged && !agreementOutcome.changed) {
    return item;
  }

  try {
    await db.transaction(async (tx) => {
      for (const update of attachmentUpdates) {
        await tx
          .update(assetRequestAttachments)
          .set({ url: update.newUrl })
          .where(
            and(
              eq(assetRequestAttachments.requestId, item.id),
              eq(assetRequestAttachments.kind, update.kind),
              eq(assetRequestAttachments.url, update.oldUrl),
            ),
          );
      }

      if (requestSigChanged) {
        await tx
          .update(assetRequests)
          .set({
            borrowerSignatureData: nextBorrowerSig,
            approvedBorrowSignatureData: nextApprovedSig,
          })
          .where(eq(assetRequests.id, item.id));
      }

      if (agreementOutcome.changed && agreementOutcome.agreement && item.agreementId) {
        await tx
          .update(assetAgreements)
          .set({
            headerHtml: agreementOutcome.agreement.header,
            bodyHtml: agreementOutcome.agreement.body,
            footerHtml: agreementOutcome.agreement.footer,
          })
          .where(eq(assetAgreements.id, item.agreementId));

        for (const box of agreementOutcome.agreement.signatureBoxes) {
          const orig = item.agreement?.signatureBoxes.find((candidate) => candidate.id === box.id);
          if (
            orig &&
            (orig.signatureData !== box.signatureData || orig.returnSignatureData !== box.returnSignatureData)
          ) {
            await tx
              .update(assetAgreementSigners)
              .set({
                signatureData: box.signatureData ?? null,
                returnSignatureData: box.returnSignatureData ?? null,
              })
              .where(
                and(
                  eq(assetAgreementSigners.agreementId, item.agreementId),
                  eq(assetAgreementSigners.boxId, box.id),
                ),
              );
          }
        }
      }
    });
  } catch (error) {
    console.warn("Failed to persist healed ImgBB URLs for asset request", item.id, error instanceof Error ? error.message : error);
  }

  return {
    ...item,
    imageUrl: nextImageUrl,
    additionalImages: nextAdditionalImages,
    borrowerSignatureData: nextBorrowerSig,
    approvedBorrowSignatureData: nextApprovedSig,
    agreement: agreementOutcome.agreement,
  };
}

export async function healAgreementTemplateImgbbUrls<
  T extends { id: string; headerHtml: string; bodyHtml: string; footerHtml: string },
>(row: T): Promise<T> {
  if (
    !isCloudinaryConfigured() ||
    (!containsImgbbUrl(row.headerHtml) && !containsImgbbUrl(row.bodyHtml) && !containsImgbbUrl(row.footerHtml))
  ) {
    return row;
  }

  const [headerRes, bodyRes, footerRes] = await Promise.all([
    migrateHtmlImgbbUrlsToCloudinary(row.headerHtml, "agreement"),
    migrateHtmlImgbbUrlsToCloudinary(row.bodyHtml, "agreement"),
    migrateHtmlImgbbUrlsToCloudinary(row.footerHtml, "agreement"),
  ]);

  if (headerRes.migratedCount === 0 && bodyRes.migratedCount === 0 && footerRes.migratedCount === 0) {
    return row;
  }

  try {
    await db
      .update(assetAgreementTemplates)
      .set({
        headerHtml: headerRes.html,
        bodyHtml: bodyRes.html,
        footerHtml: footerRes.html,
      })
      .where(eq(assetAgreementTemplates.id, row.id));
  } catch (error) {
    console.warn("Failed to persist healed ImgBB URLs for agreement template", row.id, error instanceof Error ? error.message : error);
  }

  return {
    ...row,
    headerHtml: headerRes.html,
    bodyHtml: bodyRes.html,
    footerHtml: footerRes.html,
  };
}

export async function healEmployeeAvatarImgbbUrl<
  T extends { id: string; avatarUrl: string | null },
>(row: T): Promise<T> {
  if (!isCloudinaryConfigured() || !isImgbbUrl(row.avatarUrl)) {
    return row;
  }

  const migrated = await migrateImgbbUrlToCloudinary(row.avatarUrl!, "avatar");
  if (migrated === row.avatarUrl) return row;

  try {
    await db.update(employees).set({ avatarUrl: migrated }).where(eq(employees.id, row.id));
  } catch (error) {
    console.warn("Failed to persist healed ImgBB avatar URL", row.id, error instanceof Error ? error.message : error);
  }

  return { ...row, avatarUrl: migrated };
}

export async function healLeaveAttachmentImgbbUrl<
  T extends { id: string; attachmentUrl: string | null },
>(row: T): Promise<T> {
  if (!isCloudinaryConfigured() || !isImgbbUrl(row.attachmentUrl)) {
    return row;
  }

  const migrated = await migrateImgbbUrlToCloudinary(row.attachmentUrl!, "leave");
  if (migrated === row.attachmentUrl) return row;

  try {
    await db.update(leaveRequests).set({ attachmentUrl: migrated }).where(eq(leaveRequests.id, row.id));
  } catch (error) {
    console.warn("Failed to persist healed ImgBB leave attachment URL", row.id, error instanceof Error ? error.message : error);
  }

  return { ...row, attachmentUrl: migrated };
}

type TableMigrationStats = {
  scannedRows: number;
  updatedRows: number;
  migratedUrls: number;
  failedUrls: number;
};

export type BatchImgbbMigrationResult = {
  dryRun: boolean;
  scannedRows: number;
  updatedRows: number;
  migratedUrls: number;
  failedUrls: string[];
  tables: Record<string, TableMigrationStats>;
};

export async function migrateAllImgbbRecordsInDb(
  options: { dryRun?: boolean; includeDataUrls?: boolean } = {},
): Promise<BatchImgbbMigrationResult> {
  const dryRun = Boolean(options.dryRun);
  const includeDataUrls = Boolean(options.includeDataUrls);
  const failedUrls = new Set<string>();
  const tables: Record<string, TableMigrationStats> = {
    employees: { scannedRows: 0, updatedRows: 0, migratedUrls: 0, failedUrls: 0 },
    asset_requests: { scannedRows: 0, updatedRows: 0, migratedUrls: 0, failedUrls: 0 },
    asset_request_attachments: { scannedRows: 0, updatedRows: 0, migratedUrls: 0, failedUrls: 0 },
    asset_agreement_signers: { scannedRows: 0, updatedRows: 0, migratedUrls: 0, failedUrls: 0 },
    asset_agreements: { scannedRows: 0, updatedRows: 0, migratedUrls: 0, failedUrls: 0 },
    asset_agreement_templates: { scannedRows: 0, updatedRows: 0, migratedUrls: 0, failedUrls: 0 },
    leave_requests: { scannedRows: 0, updatedRows: 0, migratedUrls: 0, failedUrls: 0 },
  };

  // 1. employees.avatarUrl
  const empRows = await db
    .select({ id: employees.id, avatarUrl: employees.avatarUrl })
    .from(employees)
    .where(
      includeDataUrls
        ? or(ilike(employees.avatarUrl, "%ibb.co%"), ilike(employees.avatarUrl, "data:image/%"))
        : ilike(employees.avatarUrl, "%ibb.co%"),
    );
  for (const row of empRows) {
    tables.employees.scannedRows += 1;
    if (!row.avatarUrl) continue;
    const isData = /^data:image\/(?:png|jpe?g|gif|webp);base64,/i.test(row.avatarUrl);
    if (!isImgbbUrl(row.avatarUrl) && !(includeDataUrls && isData)) continue;
    if (dryRun) {
      tables.employees.migratedUrls += 1;
      tables.employees.updatedRows += 1;
      continue;
    }
    const nextUrl = isImgbbUrl(row.avatarUrl)
      ? await migrateImgbbUrlToCloudinary(row.avatarUrl, "avatar")
      : await migrateDataImageUrlToCloudinary(row.avatarUrl, "avatar");
    if (nextUrl !== row.avatarUrl) {
      await db.update(employees).set({ avatarUrl: nextUrl }).where(eq(employees.id, row.id));
      tables.employees.updatedRows += 1;
      tables.employees.migratedUrls += 1;
    } else {
      tables.employees.failedUrls += 1;
      failedUrls.add(isData ? `employee:${row.id}:data-avatar` : row.avatarUrl);
    }
  }

  // 2. asset_requests signatures
  const reqRows = await db
    .select({
      id: assetRequests.id,
      borrowerSignatureData: assetRequests.borrowerSignatureData,
      approvedBorrowSignatureData: assetRequests.approvedBorrowSignatureData,
    })
    .from(assetRequests)
    .where(
      or(
        ilike(assetRequests.borrowerSignatureData, "%ibb.co%"),
        ilike(assetRequests.approvedBorrowSignatureData, "%ibb.co%"),
      ),
    );
  for (const row of reqRows) {
    tables.asset_requests.scannedRows += 1;
    let nextBorrower = row.borrowerSignatureData;
    let nextApproved = row.approvedBorrowSignatureData;
    let rowMigrated = 0;

    for (const [label, current] of [
      ["borrower", row.borrowerSignatureData],
      ["approved", row.approvedBorrowSignatureData],
    ] as const) {
      if (!isImgbbUrl(current)) continue;
      if (dryRun) {
        rowMigrated += 1;
      } else {
        const migrated = await migrateImgbbUrlToCloudinary(current, "signature");
        if (migrated !== current) {
          if (label === "borrower") nextBorrower = migrated;
          else nextApproved = migrated;
          rowMigrated += 1;
        } else {
          tables.asset_requests.failedUrls += 1;
          failedUrls.add(current);
        }
      }
    }

    if (rowMigrated > 0) {
      if (!dryRun) {
        await db
          .update(assetRequests)
          .set({
            borrowerSignatureData: nextBorrower,
            approvedBorrowSignatureData: nextApproved,
          })
          .where(eq(assetRequests.id, row.id));
      }
      tables.asset_requests.updatedRows += 1;
      tables.asset_requests.migratedUrls += rowMigrated;
    }
  }

  // 3. asset_request_attachments
  const attachmentRows = await db
    .select({ id: assetRequestAttachments.id, url: assetRequestAttachments.url })
    .from(assetRequestAttachments)
    .where(ilike(assetRequestAttachments.url, "%ibb.co%"));
  for (const row of attachmentRows) {
    tables.asset_request_attachments.scannedRows += 1;
    if (!isImgbbUrl(row.url)) continue;
    if (dryRun) {
      tables.asset_request_attachments.updatedRows += 1;
      tables.asset_request_attachments.migratedUrls += 1;
      continue;
    }
    const migrated = await migrateImgbbUrlToCloudinary(row.url, "asset");
    if (migrated !== row.url) {
      await db.update(assetRequestAttachments).set({ url: migrated }).where(eq(assetRequestAttachments.id, row.id));
      tables.asset_request_attachments.updatedRows += 1;
      tables.asset_request_attachments.migratedUrls += 1;
    } else {
      tables.asset_request_attachments.failedUrls += 1;
      failedUrls.add(row.url);
    }
  }

  // 4. asset_agreement_signers
  const signerRows = await db
    .select({
      agreementId: assetAgreementSigners.agreementId,
      boxId: assetAgreementSigners.boxId,
      signatureData: assetAgreementSigners.signatureData,
      returnSignatureData: assetAgreementSigners.returnSignatureData,
    })
    .from(assetAgreementSigners)
    .where(
      or(
        ilike(assetAgreementSigners.signatureData, "%ibb.co%"),
        ilike(assetAgreementSigners.returnSignatureData, "%ibb.co%"),
      ),
    );
  for (const row of signerRows) {
    tables.asset_agreement_signers.scannedRows += 1;
    let nextSig = row.signatureData;
    let nextReturnSig = row.returnSignatureData;
    let rowMigrated = 0;

    if (row.signatureData && isImgbbUrl(row.signatureData)) {
      if (dryRun) {
        rowMigrated += 1;
      } else {
        const migrated = await migrateImgbbUrlToCloudinary(row.signatureData, "signature");
        if (migrated !== row.signatureData) {
          nextSig = migrated;
          rowMigrated += 1;
        } else {
          tables.asset_agreement_signers.failedUrls += 1;
          failedUrls.add(row.signatureData);
        }
      }
    }
    if (row.returnSignatureData && isImgbbUrl(row.returnSignatureData)) {
      if (dryRun) {
        rowMigrated += 1;
      } else {
        const migrated = await migrateImgbbUrlToCloudinary(row.returnSignatureData, "signature");
        if (migrated !== row.returnSignatureData) {
          nextReturnSig = migrated;
          rowMigrated += 1;
        } else {
          tables.asset_agreement_signers.failedUrls += 1;
          failedUrls.add(row.returnSignatureData);
        }
      }
    }

    if (rowMigrated > 0) {
      if (!dryRun) {
        await db
          .update(assetAgreementSigners)
          .set({ signatureData: nextSig, returnSignatureData: nextReturnSig })
          .where(and(eq(assetAgreementSigners.agreementId, row.agreementId), eq(assetAgreementSigners.boxId, row.boxId)));
      }
      tables.asset_agreement_signers.updatedRows += 1;
      tables.asset_agreement_signers.migratedUrls += rowMigrated;
    }
  }

  // 5. asset_agreements HTML
  const agreementRows = await db
    .select({
      id: assetAgreements.id,
      headerHtml: assetAgreements.headerHtml,
      bodyHtml: assetAgreements.bodyHtml,
      footerHtml: assetAgreements.footerHtml,
    })
    .from(assetAgreements)
    .where(
      or(
        ilike(assetAgreements.headerHtml, "%ibb.co%"),
        ilike(assetAgreements.bodyHtml, "%ibb.co%"),
        ilike(assetAgreements.footerHtml, "%ibb.co%"),
      ),
    );
  for (const row of agreementRows) {
    tables.asset_agreements.scannedRows += 1;
    if (dryRun) {
      const count = [row.headerHtml, row.bodyHtml, row.footerHtml]
        .filter((html) => containsImgbbUrl(html))
        .length;
      if (count > 0) {
        tables.asset_agreements.updatedRows += 1;
        tables.asset_agreements.migratedUrls += count;
      }
      continue;
    }
    const [h, b, f] = await Promise.all([
      migrateHtmlImgbbUrlsToCloudinary(row.headerHtml, "agreement"),
      migrateHtmlImgbbUrlsToCloudinary(row.bodyHtml, "agreement"),
      migrateHtmlImgbbUrlsToCloudinary(row.footerHtml, "agreement"),
    ]);
    for (const url of [...h.failedUrls, ...b.failedUrls, ...f.failedUrls]) {
      tables.asset_agreements.failedUrls += 1;
      failedUrls.add(url);
    }
    const migratedCount = h.migratedCount + b.migratedCount + f.migratedCount;
    if (migratedCount > 0) {
      await db
        .update(assetAgreements)
        .set({ headerHtml: h.html, bodyHtml: b.html, footerHtml: f.html })
        .where(eq(assetAgreements.id, row.id));
      tables.asset_agreements.updatedRows += 1;
      tables.asset_agreements.migratedUrls += migratedCount;
    }
  }

  // 6. asset_agreement_templates HTML
  const templateRows = await db
    .select({
      id: assetAgreementTemplates.id,
      headerHtml: assetAgreementTemplates.headerHtml,
      bodyHtml: assetAgreementTemplates.bodyHtml,
      footerHtml: assetAgreementTemplates.footerHtml,
    })
    .from(assetAgreementTemplates)
    .where(
      or(
        ilike(assetAgreementTemplates.headerHtml, "%ibb.co%"),
        ilike(assetAgreementTemplates.bodyHtml, "%ibb.co%"),
        ilike(assetAgreementTemplates.footerHtml, "%ibb.co%"),
      ),
    );
  for (const row of templateRows) {
    tables.asset_agreement_templates.scannedRows += 1;
    if (dryRun) {
      const count = [row.headerHtml, row.bodyHtml, row.footerHtml]
        .filter((html) => containsImgbbUrl(html))
        .length;
      if (count > 0) {
        tables.asset_agreement_templates.updatedRows += 1;
        tables.asset_agreement_templates.migratedUrls += count;
      }
      continue;
    }
    const [h, b, f] = await Promise.all([
      migrateHtmlImgbbUrlsToCloudinary(row.headerHtml, "agreement"),
      migrateHtmlImgbbUrlsToCloudinary(row.bodyHtml, "agreement"),
      migrateHtmlImgbbUrlsToCloudinary(row.footerHtml, "agreement"),
    ]);
    for (const url of [...h.failedUrls, ...b.failedUrls, ...f.failedUrls]) {
      tables.asset_agreement_templates.failedUrls += 1;
      failedUrls.add(url);
    }
    const migratedCount = h.migratedCount + b.migratedCount + f.migratedCount;
    if (migratedCount > 0) {
      await db
        .update(assetAgreementTemplates)
        .set({ headerHtml: h.html, bodyHtml: b.html, footerHtml: f.html })
        .where(eq(assetAgreementTemplates.id, row.id));
      tables.asset_agreement_templates.updatedRows += 1;
      tables.asset_agreement_templates.migratedUrls += migratedCount;
    }
  }

  // 7. leave_requests.attachmentUrl
  const leaveRows = await db
    .select({ id: leaveRequests.id, attachmentUrl: leaveRequests.attachmentUrl })
    .from(leaveRequests)
    .where(ilike(leaveRequests.attachmentUrl, "%ibb.co%"));
  for (const row of leaveRows) {
    tables.leave_requests.scannedRows += 1;
    if (!row.attachmentUrl || !isImgbbUrl(row.attachmentUrl)) continue;
    if (dryRun) {
      tables.leave_requests.updatedRows += 1;
      tables.leave_requests.migratedUrls += 1;
      continue;
    }
    const migrated = await migrateImgbbUrlToCloudinary(row.attachmentUrl, "leave");
    if (migrated !== row.attachmentUrl) {
      await db.update(leaveRequests).set({ attachmentUrl: migrated }).where(eq(leaveRequests.id, row.id));
      tables.leave_requests.updatedRows += 1;
      tables.leave_requests.migratedUrls += 1;
    } else {
      tables.leave_requests.failedUrls += 1;
      failedUrls.add(row.attachmentUrl);
    }
  }

  const summary = Object.values(tables).reduce(
    (acc, item) => ({
      scannedRows: acc.scannedRows + item.scannedRows,
      updatedRows: acc.updatedRows + item.updatedRows,
      migratedUrls: acc.migratedUrls + item.migratedUrls,
    }),
    { scannedRows: 0, updatedRows: 0, migratedUrls: 0 },
  );

  return {
    dryRun,
    ...summary,
    failedUrls: [...failedUrls],
    tables,
  };
}
