import { ensureCoreLookupData } from "@/lib/db/auto-migrate";
import { db } from "@/lib/db/client";
import {
  assetAgreementSigners,
  assetAgreements,
  assetAgreementTemplates,
  assetRequestAttachments,
  assetRequestEvents,
  assetRequestItems,
  assetRequestReads,
  assetRequests,
  departments,
  employeeDocuments,
  employees,
  employmentStatuses,
  employmentTypes,
  leaveRequests,
  overtimeRequests,
  positions,
  users,
  workTrackingActivities,
  workTrackingRecords,
  workTrackingRequests,
} from "@/lib/db/schema";
import {
  SheetMigrationError,
  type ParsedSheetMigration,
  type SheetMigrationSummary,
} from "@/lib/migration/appsheet";
import { SHEET_WORK } from "@/lib/migration/constants";

const BATCH_SIZE = 200;

function chunkArray<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export async function replaceDatabaseFromSheetMigration(
  parsed: ParsedSheetMigration,
): Promise<SheetMigrationSummary> {
  if (parsed.errors.length > 0) {
    throw new SheetMigrationError("พบข้อผิดพลาดในไฟล์ ไม่สามารถนำเข้าได้", 400);
  }
  if (parsed.data.employees.length === 0) {
    throw new SheetMigrationError("ไม่พบข้อมูลพนักงานที่นำเข้าได้ในไฟล์", 400);
  }

  const replaceWorkTracking = parsed.sheetsFound.includes(SHEET_WORK);

  await db.transaction(async (tx) => {
    // Clear optional cross-domain FKs before replacing referenced employees/OT/work records.
    await tx.update(workTrackingActivities).set({
      employeeId: null,
      overtimeRequestId: null,
      ...(replaceWorkTracking ? { workTrackingRecordId: null } : {}),
    });
    await tx.update(workTrackingRequests).set({
      latestEmployeeId: null,
      ...(replaceWorkTracking ? { workTrackingRecordId: null } : {}),
    });
    await tx.update(assetAgreementTemplates).set({ createdByEmployeeId: null });

    if (replaceWorkTracking) {
      await tx.delete(workTrackingRecords);
    }

    // Clear all HR / AppSheet tables in reverse FK dependency order.
    await tx.delete(assetRequestEvents);
    await tx.delete(assetRequestReads);
    await tx.delete(assetRequestAttachments);
    await tx.delete(assetRequestItems);
    await tx.delete(assetRequests);
    await tx.delete(assetAgreementSigners);
    await tx.delete(assetAgreements);
    await tx.delete(employeeDocuments);
    await tx.delete(overtimeRequests);
    await tx.delete(leaveRequests);
    await tx.delete(users);
    await tx.update(employees).set({ managerId: null });
    await tx.delete(employees);
    await tx.delete(departments);
    await tx.delete(positions);

    await ensureCoreLookupData(tx);

    const deptIdByName = new Map<string, number>();
    if (parsed.data.departments.length > 0) {
      for (const batch of chunkArray(parsed.data.departments, BATCH_SIZE)) {
        const inserted = await tx
          .insert(departments)
          .values(batch.map((name) => ({ name })))
          .returning({ id: departments.id, name: departments.name });
        for (const row of inserted) deptIdByName.set(row.name, row.id);
      }
    }

    const posIdByName = new Map<string, number>();
    if (parsed.data.positions.length > 0) {
      for (const batch of chunkArray(parsed.data.positions, BATCH_SIZE)) {
        const inserted = await tx
          .insert(positions)
          .values(batch.map((name) => ({ name })))
          .returning({ id: positions.id, name: positions.name });
        for (const row of inserted) posIdByName.set(row.name, row.id);
      }
    }

    const [statusRows, typeRows] = await Promise.all([
      tx.select({ id: employmentStatuses.id, name: employmentStatuses.name }).from(employmentStatuses),
      tx.select({ id: employmentTypes.id, code: employmentTypes.code }).from(employmentTypes),
    ]);
    const statusIdByName = new Map(statusRows.map((row) => [row.name, row.id]));
    const typeIdByCode = new Map(typeRows.map((row) => [row.code, row.id]));
    const activeStatusId = statusIdByName.get("ปฏิบัติงาน") ?? null;
    const formerStatusId = statusIdByName.get("พ้นสภาพ") ?? null;

    const now = new Date();
    const employeeIdByCode = new Map<string, string>();
    const employeeByCode = new Map(parsed.data.employees.map((e) => [e.code, e]));

    for (const batch of chunkArray(parsed.data.employees, BATCH_SIZE)) {
      const inserted = await tx
        .insert(employees)
        .values(
          batch.map((emp) => ({
            code: emp.code,
            prefix: emp.prefix,
            firstName: emp.firstName,
            lastName: emp.lastName,
            email: emp.email,
            phone: emp.phone,
            avatarUrl: emp.avatarUrl,
            lineUid: emp.lineUid,
            birthDate: emp.birthDate,
            startDate: emp.startDate,
            weeklyHolidays: emp.weeklyHolidays,
            departmentId: emp.department ? (deptIdByName.get(emp.department) ?? null) : null,
            positionId: emp.position ? (posIdByName.get(emp.position) ?? null) : null,
            employmentStatusId: emp.isFormerStub ? formerStatusId : activeStatusId,
            employmentTypeId: emp.employmentTypeCode ? (typeIdByCode.get(emp.employmentTypeCode) ?? null) : null,
            deletedAt: emp.isFormerStub ? now : null,
          })),
        )
        .returning({ id: employees.id, code: employees.code });
      for (const row of inserted) employeeIdByCode.set(row.code, row.id);
    }

    if (parsed.data.overtime.length > 0) {
      for (const batch of chunkArray(parsed.data.overtime, BATCH_SIZE)) {
        await tx.insert(overtimeRequests).values(
          batch.map((ot) => {
            const employeeId = employeeIdByCode.get(ot.employeeCode);
            if (!employeeId) {
              throw new SheetMigrationError(`ไม่พบรหัสพนักงาน ${ot.employeeCode} สำหรับข้อมูล OT`, 400);
            }
            const startAt = new Date(ot.startAtIso);
            const endAt = new Date(ot.endAtIso);
            return {
              id: ot.id,
              employeeId,
              startAt,
              endAt,
              reason: ot.reason,
              source: "hrm",
              statusCode: ot.status,
              decidedByEmployeeId: ot.decidedByCode ? (employeeIdByCode.get(ot.decidedByCode) ?? null) : null,
              decidedAt: null,
              decisionNote: ot.decisionNote,
              createdAt: startAt,
              updatedAt: startAt,
            };
          }),
        );
      }
    }

    if (parsed.data.leave.length > 0) {
      for (const batch of chunkArray(parsed.data.leave, BATCH_SIZE)) {
        await tx.insert(leaveRequests).values(
          batch.map((leave) => {
            const employeeId = employeeIdByCode.get(leave.employeeCode);
            if (!employeeId) {
              throw new SheetMigrationError(`ไม่พบรหัสพนักงาน ${leave.employeeCode} สำหรับข้อมูลการลา`, 400);
            }
            const decidedAt = leave.decidedAtIso ? new Date(leave.decidedAtIso) : null;
            const fallbackTimestamp = new Date(`${leave.startOn}T05:00:00.000Z`); // 12:00:00+07:00
            const timestamp = decidedAt ?? fallbackTimestamp;
            return {
              id: leave.id,
              employeeId,
              leaveTypeCode: leave.leaveTypeCode,
              startOn: leave.startOn,
              endOn: leave.endOn,
              session: leave.session,
              reason: leave.reason,
              attachmentUrl: leave.attachmentUrl,
              statusCode: leave.status,
              decidedByEmployeeId: leave.decidedByCode ? (employeeIdByCode.get(leave.decidedByCode) ?? null) : null,
              decidedAt,
              decisionNote: leave.decisionNote,
              createdAt: timestamp,
              updatedAt: timestamp,
            };
          }),
        );
      }
    }

    if (parsed.data.assets.length > 0) {
      for (const batch of chunkArray(parsed.data.assets, BATCH_SIZE)) {
        const agreementRows = batch.flatMap((asset) => {
          if (!asset.agreement) return [];
          const ag = asset.agreement;
          return [{
            id: ag.id,
            templateId: null,
            type: ag.type,
            title: ag.title,
            headerHtml: ag.headerHtml,
            bodyHtml: ag.bodyHtml,
            footerHtml: ag.footerHtml,
            status: ag.status,
            createdByEmployeeId: ag.createdByCode ? (employeeIdByCode.get(ag.createdByCode) ?? null) : null,
            createdByName: ag.createdByName,
            createdByEmployeeCode: ag.createdByRawCode,
            returnCondition: ag.returnCondition,
            documentDate: ag.documentDate,
            updatedAt: ag.updatedAtIso ? new Date(ag.updatedAtIso) : null,
          }];
        });

        if (agreementRows.length > 0) {
          for (const agBatch of chunkArray(agreementRows, BATCH_SIZE)) {
            await tx.insert(assetAgreements).values(agBatch);
          }

          const signerRows = batch.flatMap((asset) =>
            (asset.agreement?.signers ?? []).map((signer) => ({
              agreementId: asset.agreement!.id,
              boxId: signer.boxId,
              position: signer.position,
              participant: signer.participant,
              label: signer.label,
              role: signer.role,
              signerKind: signer.signerKind,
              signerName: signer.signerName,
              layoutPosition: signer.layoutPosition,
              page: signer.page,
              xPercent: signer.xPercent,
              yPercent: signer.yPercent,
              signatureData: signer.signatureData,
              signatureStatus: signer.signatureStatus,
              signedByEmployeeId: signer.signedByCode ? (employeeIdByCode.get(signer.signedByCode) ?? null) : null,
              signedByName: signer.signedByName,
              signedAt: signer.signedAtIso ? new Date(signer.signedAtIso) : null,
              returnSignatureData: signer.returnSignatureData,
              returnSignedByEmployeeId: signer.returnSignedByCode ? (employeeIdByCode.get(signer.returnSignedByCode) ?? null) : null,
              returnSignedByName: signer.returnSignedByName,
              returnSignedAt: signer.returnSignedAtIso ? new Date(signer.returnSignedAtIso) : null,
            })),
          );
          for (const signerBatch of chunkArray(signerRows, BATCH_SIZE)) {
            await tx.insert(assetAgreementSigners).values(signerBatch);
          }
        }

        await tx.insert(assetRequests).values(
          batch.map((asset) => {
            const borrowerId = employeeIdByCode.get(asset.employeeCode);
            const borrower = employeeByCode.get(asset.employeeCode);
            if (!borrowerId || !borrower) {
              throw new SheetMigrationError(`ไม่พบรหัสพนักงาน ${asset.employeeCode} สำหรับการยืมทรัพย์สิน`, 400);
            }
            const formAt = new Date(asset.formAtIso);
            const updatedAt = new Date(asset.updatedAtIso);
            return {
              id: asset.sheetId,
              agreementId: asset.agreement?.id ?? null,
              legacySheetId: asset.sheetId,
              borrowerEmployeeId: borrowerId,
              borrowerEmployeeCode: borrower.code,
              borrowerName: `${borrower.firstName} ${borrower.lastName}`.trim(),
              borrowerDepartment: asset.department,
              borrowerPosition: asset.position,
              formDate: formAt,
              fromDate: asset.fromDate,
              toDate: asset.toDate,
              reason: asset.reason,
              remarks: asset.remarks,
              status: asset.status,
              approvedBorrowByEmployeeId: asset.approverCode ? (employeeIdByCode.get(asset.approverCode) ?? null) : null,
              approvedBorrowByName: asset.approverName,
              approvedBorrowAt: asset.approvedBorrowAtIso ? new Date(asset.approvedBorrowAtIso) : null,
              borrowerSignatureData: asset.borrowerSignatureData,
              approvedBorrowSignatureData: asset.approvedBorrowSignatureData,
              returnInspectorEmployeeId: asset.returnInspectorCode ? (employeeIdByCode.get(asset.returnInspectorCode) ?? null) : null,
              returnInspectorName: asset.returnInspectorName,
              approvedReturnByEmployeeId: asset.approvedReturnByCode ? (employeeIdByCode.get(asset.approvedReturnByCode) ?? null) : null,
              approvedReturnByName: asset.approvedReturnByName,
              createdAt: formAt,
              updatedAt,
            };
          }),
        );

        const itemRows = batch.flatMap((asset) =>
          asset.items.map((item, position) => ({
            requestId: asset.sheetId,
            position,
            name: item.name,
            quantity: item.quantity,
            note: item.note,
          })),
        );
        for (const itemBatch of chunkArray(itemRows, BATCH_SIZE)) {
          await tx.insert(assetRequestItems).values(itemBatch);
        }

        const attachmentRows = batch.flatMap((asset) => {
          const borrowerId = employeeIdByCode.get(asset.employeeCode) ?? null;
          const formAt = new Date(asset.formAtIso);
          return [
            ...asset.requestAttachments.map((url, position) => ({
              requestId: asset.sheetId,
              kind: "request" as const,
              position,
              url,
              uploadedByEmployeeId: borrowerId,
              createdAt: formAt,
            })),
            ...asset.additionalAttachments.map((url, position) => ({
              requestId: asset.sheetId,
              kind: "additional" as const,
              position,
              url,
              uploadedByEmployeeId: borrowerId,
              createdAt: formAt,
            })),
          ];
        });
        for (const attachBatch of chunkArray(attachmentRows, BATCH_SIZE)) {
          await tx.insert(assetRequestAttachments).values(attachBatch);
        }

        await tx.insert(assetRequestEvents).values(
          batch.map((asset) => ({
            requestId: asset.sheetId,
            actorEmployeeId: asset.approverCode ? (employeeIdByCode.get(asset.approverCode) ?? null) : null,
            eventType: "imported_from_spreadsheet",
            fromStatus: null,
            toStatus: asset.status,
            details: {
              source: "appsheet_web_import",
              approverName: asset.approverName,
              hasAgreement: Boolean(asset.agreement),
              signerCount: asset.agreement?.signers.length ?? 0,
            },
            createdAt: new Date(asset.formAtIso),
          })),
        );
      }
    }

    if (replaceWorkTracking && parsed.data.workTracking.length > 0) {
      for (const batch of chunkArray(parsed.data.workTracking, BATCH_SIZE)) {
        await tx.insert(workTrackingRecords).values(
          batch.map((record) => ({
            id: record.id,
            houseNo: record.houseNo,
            round: record.round,
            eventDate: record.eventDate,
            projectText: record.projectText,
            detail: record.detail,
            status: record.status,
            deliveredDate: record.deliveredDate,
            reportStatuses: record.reportStatuses,
            subStatuses: record.subStatuses,
            workers: record.workers,
          })),
        );
      }
    }
  });

  return parsed.summary;
}
