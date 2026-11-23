import { eq, isNotNull } from "drizzle-orm";
import { hashPassword } from "@/lib/auth/password";
import { isValidProvisionEmail, normalizeProvisionEmail } from "@/lib/auth/provision-users";
import { getStoredPermissionsForRole } from "@/lib/auth/role-permissions";
import { ensureCoreLookupData } from "@/lib/db/auto-migrate";
import { db } from "@/lib/db/client";
import { isUniqueViolation, postgresConstraintName } from "@/lib/db/errors";
import {
  assetAgreementSigners,
  assetAgreements,
  assetRequestAttachments,
  assetRequestEvents,
  assetRequestItems,
  assetRequestReads,
  assetRequests,
  departments,
  employees,
  employmentStatuses,
  employmentTypes,
  leaveRequests,
  lineCalendarEvents,
  overtimeRequests,
  positions,
  users,
  workTrackingActivities,
  workTrackingRecords,
  workTrackingRequests,
} from "@/lib/db/schema";
import {
  SheetMigrationError,
  type ParsedEmployee,
  type ParsedSheetMigration,
  type SheetMigrationSummary,
} from "@/lib/migration/appsheet";
import {
  MIGRATION_SECTIONS,
  SHEET_BY_SECTION,
  type MigrationSection,
} from "@/lib/migration/constants";

const BATCH_SIZE = 200;

export type ImportSheetOptions = {
  sections?: MigrationSection[];
};

export type SheetMigrationImportResult = SheetMigrationSummary & {
  importedSections: MigrationSection[];
  employeesInserted: number;
  employeesUpdated: number;
  usersExistingKept: number;
};

function chunkArray<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function uniqueConflictMessage(error: unknown): string {
  const constraint = postgresConstraintName(error) ?? "";
  if (constraint.includes("email")) return "พบอีเมลซ้ำกับข้อมูลอื่นในระบบ ไม่สามารถอัปเดตได้";
  if (constraint.includes("line_uid")) return "พบ LINE UID ซ้ำกับพนักงานอื่นในระบบ ไม่สามารถอัปเดตได้";
  if (constraint.includes("code")) return "พบรหัสพนักงานซ้ำในระบบ ไม่สามารถนำเข้าได้";
  return "พบข้อมูลซ้ำกับรายการที่มีอยู่แล้วในระบบ";
}

export async function replaceDatabaseFromSheetMigration(
  parsed: ParsedSheetMigration,
  options: ImportSheetOptions = {},
): Promise<SheetMigrationImportResult> {
  const importedSections = options.sections !== undefined
    ? MIGRATION_SECTIONS.filter((section) => options.sections!.includes(section))
    : MIGRATION_SECTIONS.filter((section) => parsed.sheetsFound.includes(SHEET_BY_SECTION[section]));

  if (importedSections.length === 0) {
    throw new SheetMigrationError("กรุณาเลือกอย่างน้อย 1 ส่วนที่ต้องการนำเข้า", 400);
  }

  for (const section of importedSections) {
    const sheetName = SHEET_BY_SECTION[section];
    if (!parsed.sheetsFound.includes(sheetName)) {
      throw new SheetMigrationError(`ไม่พบแท็บ "${sheetName}" ในไฟล์สำหรับส่วนที่เลือกนำเข้า`, 400);
    }
  }

  const selected = new Set<MigrationSection>(importedSections);
  const relevantErrors = selected.has("employees")
    ? parsed.errors
    : parsed.errors.filter((err) => !err.startsWith("[employees]"));
  if (relevantErrors.length > 0) {
    throw new SheetMigrationError("พบข้อผิดพลาดในไฟล์ ไม่สามารถนำเข้าได้", 400);
  }
  if (selected.has("employees") && parsed.data.employees.length === 0) {
    throw new SheetMigrationError("ไม่พบข้อมูลพนักงานที่นำเข้าได้ในไฟล์", 400);
  }

  // Compute bcrypt password hashes before entering the transaction so DB locks are not held during CPU-bound hashing.
  const passwordHashByCode = new Map<string, string>();
  if (selected.has("employees")) {
    const [existingEmpRows, existingUserRows] = await Promise.all([
      db.select({ id: employees.id, code: employees.code }).from(employees),
      db.select({ employeeId: users.employeeId }).from(users),
    ]);
    const existingEmpIdByCode = new Map(existingEmpRows.map((row) => [row.code, row.id]));
    const employeeIdsWithUser = new Set(existingUserRows.map((row) => row.employeeId));

    for (const emp of parsed.data.employees) {
      if (emp.isFormerStub || !isValidProvisionEmail(emp.email)) continue;
      const existingEmpId = existingEmpIdByCode.get(emp.code);
      if (existingEmpId && employeeIdsWithUser.has(existingEmpId)) continue;
      passwordHashByCode.set(emp.code, await hashPassword(emp.code));
    }
  }

  let employeesInserted = 0;
  let employeesUpdated = 0;
  let usersProvisioned = 0;
  let usersExistingKept = 0;
  let usersSkippedNoEmail = 0;

  try {
    await db.transaction(async (tx) => {
      await ensureCoreLookupData(tx);
      const defaultEmployeePermissions = selected.has("employees")
        ? await getStoredPermissionsForRole("employee", tx)
        : [];

      const [statusRows, typeRows, existingEmpRows, existingUserRows] = await Promise.all([
        tx.select({ id: employmentStatuses.id, name: employmentStatuses.name }).from(employmentStatuses),
        tx.select({ id: employmentTypes.id, code: employmentTypes.code }).from(employmentTypes),
        tx
          .select({
            id: employees.id,
            code: employees.code,
            firstName: employees.firstName,
            lastName: employees.lastName,
            email: employees.email,
            deletedAt: employees.deletedAt,
          })
          .from(employees),
        tx
          .select({
            id: users.id,
            employeeId: users.employeeId,
            email: users.email,
            isActive: users.isActive,
          })
          .from(users),
      ]);

      const statusIdByName = new Map(statusRows.map((row) => [row.name, row.id]));
      const typeIdByCode = new Map(typeRows.map((row) => [row.code, row.id]));
      const activeStatusId = statusIdByName.get("ปฏิบัติงาน") ?? null;
      const formerStatusId = statusIdByName.get("พ้นสภาพ") ?? null;

      type ExistingEmpEntry = {
        id: string;
        code: string;
        firstName: string;
        lastName: string;
        email: string | null;
        deletedAt: Date | null;
      };
      const empByCode = new Map<string, ExistingEmpEntry>(
        existingEmpRows.map((row) => [row.code, row]),
      );
      const employeeIdByCode = new Map<string, string>(
        existingEmpRows.map((row) => [row.code, row.id]),
      );
      const userByEmployeeId = new Map(
        existingUserRows.map((row) => [row.employeeId, { ...row }]),
      );
      const userIdByEmail = new Map<string, string>();
      for (const row of existingUserRows) {
        const norm = normalizeProvisionEmail(row.email);
        if (norm) userIdByEmail.set(norm, row.id);
      }

      const now = new Date();

      if (selected.has("employees")) {
        if (parsed.data.departments.length > 0) {
          for (const batch of chunkArray(parsed.data.departments, BATCH_SIZE)) {
            await tx
              .insert(departments)
              .values(batch.map((name) => ({ name })))
              .onConflictDoNothing({ target: departments.name });
          }
        }
        if (parsed.data.positions.length > 0) {
          for (const batch of chunkArray(parsed.data.positions, BATCH_SIZE)) {
            await tx
              .insert(positions)
              .values(batch.map((name) => ({ name })))
              .onConflictDoNothing({ target: positions.name });
          }
        }

        const [allDepts, allPos] = await Promise.all([
          tx.select({ id: departments.id, name: departments.name }).from(departments),
          tx.select({ id: positions.id, name: positions.name }).from(positions),
        ]);
        const deptIdByName = new Map(allDepts.map((row) => [row.name, row.id]));
        const posIdByName = new Map(allPos.map((row) => [row.name, row.id]));

        for (const emp of parsed.data.employees) {
          const departmentId = emp.department ? (deptIdByName.get(emp.department) ?? null) : null;
          const positionId = emp.position ? (posIdByName.get(emp.position) ?? null) : null;
          const employmentStatusId = emp.isFormerStub ? formerStatusId : activeStatusId;
          const employmentTypeId = emp.employmentTypeCode ? (typeIdByCode.get(emp.employmentTypeCode) ?? null) : null;

          const existing = empByCode.get(emp.code);
          if (existing) {
            const existingUser = userByEmployeeId.get(existing.id);
            const nextEmail = emp.email ?? (existingUser ? existing.email : null);
            const nextDeletedAt = emp.isFormerStub ? (existing.deletedAt ?? now) : null;

            await tx
              .update(employees)
              .set({
                prefix: emp.prefix,
                firstName: emp.firstName,
                lastName: emp.lastName,
                email: nextEmail,
                phone: emp.phone,
                avatarUrl: emp.avatarUrl,
                lineUid: emp.lineUid,
                birthDate: emp.birthDate,
                startDate: emp.startDate,
                weeklyHolidays: emp.weeklyHolidays,
                departmentId,
                positionId,
                employmentStatusId,
                employmentTypeId,
                deletedAt: nextDeletedAt,
                updatedAt: now,
              })
              .where(eq(employees.id, existing.id));

            existing.firstName = emp.firstName;
            existing.lastName = emp.lastName;
            existing.email = nextEmail;
            existing.deletedAt = nextDeletedAt;
            employeesUpdated += 1;

            if (emp.isFormerStub) {
              if (existingUser) {
                usersExistingKept += 1;
                if (existingUser.isActive) {
                  await tx
                    .update(users)
                    .set({ isActive: false, updatedAt: now })
                    .where(eq(users.id, existingUser.id));
                  existingUser.isActive = false;
                }
              }
            } else if (existingUser) {
              usersExistingKept += 1;
              const userUpdates: { isActive?: boolean; email?: string; updatedAt: Date } = { updatedAt: now };
              let needsUpdate = false;

              if (!existingUser.isActive) {
                userUpdates.isActive = true;
                existingUser.isActive = true;
                needsUpdate = true;
              }
              const oldEmailNorm = normalizeProvisionEmail(existingUser.email);
              const newEmailNorm = normalizeProvisionEmail(nextEmail);
              if (
                newEmailNorm
                && isValidProvisionEmail(newEmailNorm)
                && newEmailNorm !== oldEmailNorm
                && (!userIdByEmail.has(newEmailNorm) || userIdByEmail.get(newEmailNorm) === existingUser.id)
              ) {
                userUpdates.email = newEmailNorm;
                if (oldEmailNorm) userIdByEmail.delete(oldEmailNorm);
                userIdByEmail.set(newEmailNorm, existingUser.id);
                existingUser.email = newEmailNorm;
                needsUpdate = true;
              }

              if (needsUpdate) {
                await tx.update(users).set(userUpdates).where(eq(users.id, existingUser.id));
              }
            } else {
              const normEmail = normalizeProvisionEmail(nextEmail);
              if (normEmail && isValidProvisionEmail(normEmail) && !userIdByEmail.has(normEmail)) {
                const passwordHash = passwordHashByCode.get(emp.code) ?? await hashPassword(emp.code);
                const [insertedUser] = await tx
                  .insert(users)
                  .values({
                    employeeId: existing.id,
                    email: normEmail,
                    passwordHash,
                    role: "employee",
                    permissions: defaultEmployeePermissions,
                    mustChangePassword: true,
                    isActive: true,
                  })
                  .onConflictDoNothing()
                  .returning({ id: users.id });
                if (insertedUser) {
                  userIdByEmail.set(normEmail, insertedUser.id);
                  userByEmployeeId.set(existing.id, {
                    id: insertedUser.id,
                    employeeId: existing.id,
                    email: normEmail,
                    isActive: true,
                  });
                  usersProvisioned += 1;
                }
              } else {
                usersSkippedNoEmail += 1;
              }
            }
          } else {
            const deletedAt = emp.isFormerStub ? now : null;
            const [inserted] = await tx
              .insert(employees)
              .values({
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
                departmentId,
                positionId,
                employmentStatusId,
                employmentTypeId,
                deletedAt,
              })
              .returning({ id: employees.id, code: employees.code });

            empByCode.set(emp.code, {
              id: inserted.id,
              code: inserted.code,
              firstName: emp.firstName,
              lastName: emp.lastName,
              email: emp.email,
              deletedAt,
            });
            employeeIdByCode.set(emp.code, inserted.id);
            employeesInserted += 1;

            if (!emp.isFormerStub) {
              const normEmail = normalizeProvisionEmail(emp.email);
              if (normEmail && isValidProvisionEmail(normEmail) && !userIdByEmail.has(normEmail)) {
                const passwordHash = passwordHashByCode.get(emp.code) ?? await hashPassword(emp.code);
                const [insertedUser] = await tx
                  .insert(users)
                  .values({
                    employeeId: inserted.id,
                    email: normEmail,
                    passwordHash,
                    role: "employee",
                    permissions: defaultEmployeePermissions,
                    mustChangePassword: true,
                    isActive: true,
                  })
                  .onConflictDoNothing()
                  .returning({ id: users.id });
                if (insertedUser) {
                  userIdByEmail.set(normEmail, insertedUser.id);
                  userByEmployeeId.set(inserted.id, {
                    id: insertedUser.id,
                    employeeId: inserted.id,
                    email: normEmail,
                    isActive: true,
                  });
                  usersProvisioned += 1;
                }
              } else {
                usersSkippedNoEmail += 1;
              }
            }
          }
        }
      } else if (selected.has("overtime") || selected.has("leave") || selected.has("assets")) {
        const referencedCodes = new Set<string>();
        if (selected.has("overtime")) {
          for (const ot of parsed.data.overtime) referencedCodes.add(ot.employeeCode);
        }
        if (selected.has("leave")) {
          for (const leave of parsed.data.leave) referencedCodes.add(leave.employeeCode);
        }
        if (selected.has("assets")) {
          for (const asset of parsed.data.assets) referencedCodes.add(asset.employeeCode);
        }

        const parsedEmpByCode = new Map<string, ParsedEmployee>(
          parsed.data.employees.map((emp) => [emp.code, emp]),
        );
        const missingActiveCodes: string[] = [];
        const missingFormerStubs: ParsedEmployee[] = [];

        for (const code of referencedCodes) {
          if (employeeIdByCode.has(code)) continue;
          const parsedEmp = parsedEmpByCode.get(code);
          if (parsedEmp?.isFormerStub) {
            missingFormerStubs.push(parsedEmp);
          } else {
            missingActiveCodes.push(code);
          }
        }

        if (missingActiveCodes.length > 0) {
          missingActiveCodes.sort();
          throw new SheetMigrationError(
            `ไม่พบรหัสพนักงานในระบบปัจจุบัน: ${missingActiveCodes.join(", ")} — กรุณาเพิ่มพนักงานก่อน หรือเลือกนำเข้า "ข้อมูลพนักงาน" ร่วมด้วย`,
            400,
          );
        }

        if (missingFormerStubs.length > 0) {
          for (const batch of chunkArray(missingFormerStubs, BATCH_SIZE)) {
            const insertedStubs = await tx
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
                  departmentId: null,
                  positionId: null,
                  employmentStatusId: formerStatusId,
                  employmentTypeId: null,
                  deletedAt: now,
                })),
              )
              .onConflictDoNothing()
              .returning({
                id: employees.id,
                code: employees.code,
                firstName: employees.firstName,
                lastName: employees.lastName,
                email: employees.email,
                deletedAt: employees.deletedAt,
              });
            for (const row of insertedStubs) {
              empByCode.set(row.code, row);
              employeeIdByCode.set(row.code, row.id);
              employeesInserted += 1;
            }
          }
        }
      }

      if (selected.has("overtime")) {
        await tx.update(workTrackingActivities).set({ overtimeRequestId: null });
        await tx.delete(overtimeRequests);

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
      }

      if (selected.has("leave")) {
        await tx.delete(lineCalendarEvents).where(isNotNull(lineCalendarEvents.leaveRequestId));
        await tx.delete(leaveRequests);

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
      }

      if (selected.has("assets")) {
        await tx.delete(assetRequestEvents);
        await tx.delete(assetRequestReads);
        await tx.delete(assetRequestAttachments);
        await tx.delete(assetRequestItems);
        await tx.delete(assetRequests);
        await tx.delete(assetAgreementSigners);
        await tx.delete(assetAgreements);

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
                const borrower = empByCode.get(asset.employeeCode);
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
      }

      if (selected.has("workTracking")) {
        await tx.update(workTrackingActivities).set({ workTrackingRecordId: null });
        await tx.update(workTrackingRequests).set({ workTrackingRecordId: null });
        await tx.delete(workTrackingRecords);

        if (parsed.data.workTracking.length > 0) {
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
      }
    });
  } catch (error) {
    if (error instanceof SheetMigrationError) throw error;
    if (isUniqueViolation(error)) {
      throw new SheetMigrationError(uniqueConflictMessage(error), 409);
    }
    throw error;
  }

  return {
    ...parsed.summary,
    usersProvisioned: selected.has("employees") ? usersProvisioned : 0,
    usersSkippedNoEmail: selected.has("employees") ? usersSkippedNoEmail : 0,
    importedSections,
    employeesInserted,
    employeesUpdated,
    usersExistingKept,
  };
}
