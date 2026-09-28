import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  agreementParticipantForSignatureBox,
  assetAgreementSchema,
  assetRequestSchema,
  isAssetFormOnly,
  parseAssetItems,
  type AssetAgreement,
  type AssetAgreementParticipant,
  type AssetCreateInput,
  type AssetRequest,
  type AssetTransition,
} from "@/asset-borrowing/domain/asset";
import type { AssetRepository } from "@/asset-borrowing/application/ports";
import { db } from "@/lib/db/client";
import {
  assetAgreements,
  assetAgreementSigners,
  assetRequestAttachments,
  assetRequestEvents,
  assetRequestItems,
  assetRequestReads,
  assetRequests,
  employees,
} from "@/lib/db/schema";

type AssetTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export class AssetRepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssetRepositoryError";
  }
}

const statusLabels = {
  pending: "รอ",
  approved: "อนุมัติ",
  rejected: "ไม่อนุมัติ",
  return_pending: "รอรับคืน",
  returned: "คืนแล้ว",
  unknown: "ไม่ทราบสถานะ",
} as const;
const statusFromDb = {
  pending: "pending",
  approved: "approved",
  rejected: "rejected",
  return_pending: "returnPending",
  returned: "returned",
  unknown: "unknown",
} as const;
const statusToDb = {
  pending: "pending",
  approved: "approved",
  rejected: "rejected",
  returnPending: "return_pending",
  returned: "returned",
  unknown: "unknown",
} as const;
const agreementStatusToDb = {
  waitingHandover: "waiting_handover",
  waitingEmployee: "waiting_employee",
  waitingAdmin: "waiting_admin",
  completed: "completed",
} as const;
const agreementStatusFromDb = {
  waiting_handover: "waitingHandover",
  waiting_employee: "waitingEmployee",
  waiting_admin: "waitingAdmin",
  completed: "completed",
} as const;

function dateOnly(value: Date | string | null): Date | null {
  if (!value) return null;
  if (value instanceof Date) return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day);
}

function dbDate(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function agreementFromDb(agreement: typeof assetAgreements.$inferSelect, boxes: typeof assetAgreementSigners.$inferSelect[]) {
  return assetAgreementSchema.parse({
    templateId: agreement.templateId,
    type: agreement.type === "asset_form" ? "assetForm" : "borrow",
    title: agreement.title,
    header: agreement.headerHtml,
    body: agreement.bodyHtml,
    footer: agreement.footerHtml,
    status: agreementStatusFromDb[agreement.status],
    createdBy: agreement.createdByName,
    createdByCode: agreement.createdByEmployeeCode,
    returnCondition: agreement.returnCondition,
    documentDate: dateOnly(agreement.documentDate) ?? new Date(),
    updatedAt: agreement.updatedAt,
    signatureBoxes: boxes.map((box) => ({
      id: box.boxId,
      label: box.label,
      role: box.role,
      name: box.signerName,
      signer: box.signerKind,
      position: box.layoutPosition,
      page: box.page ?? undefined,
      x: box.xPercent == null ? undefined : Number(box.xPercent),
      y: box.yPercent == null ? undefined : Number(box.yPercent),
      signatureData: box.signatureData ?? undefined,
      returnSignatureData: box.returnSignatureData ?? undefined,
      returnSignedAt: box.returnSignedAt?.toISOString() ?? null,
      status: box.signatureStatus,
      signedAt: box.signedAt?.toISOString() ?? null,
    })),
  });
}

async function loadAgreement(tx: AssetTransaction, agreementId: string | null): Promise<AssetAgreement | null> {
  if (!agreementId) return null;
  const [agreement] = await tx.select().from(assetAgreements).where(eq(assetAgreements.id, agreementId));
  if (!agreement) return null;
  const boxes = await tx.select().from(assetAgreementSigners).where(eq(assetAgreementSigners.agreementId, agreementId)).orderBy(asc(assetAgreementSigners.position));
  return agreementFromDb(agreement, boxes);
}

async function writeAgreement(tx: AssetTransaction, agreementId: string, value: AssetAgreement, actorEmployeeId: string): Promise<void> {
  const agreement = assetAgreementSchema.parse(value);
  const [actor] = await tx.select({ firstName: employees.firstName, lastName: employees.lastName }).from(employees).where(eq(employees.id, actorEmployeeId));
  if (!actor) throw new AssetRepositoryError("ไม่พบข้อมูลผู้ลงนามในระบบ HRM");
  const actorName = `${actor.firstName} ${actor.lastName}`.trim();
  const oldBoxes = await tx.select().from(assetAgreementSigners).where(eq(assetAgreementSigners.agreementId, agreementId));
  const oldById = new Map(oldBoxes.map((box) => [box.boxId, box]));

  await tx.insert(assetAgreements).values({
    id: agreementId,
    templateId: agreement.templateId,
    type: agreement.type === "assetForm" ? "asset_form" : "borrow",
    title: agreement.title,
    headerHtml: agreement.header,
    bodyHtml: agreement.body,
    footerHtml: agreement.footer,
    status: agreementStatusToDb[agreement.status],
    createdByEmployeeId: actorEmployeeId,
    createdByName: agreement.createdBy,
    createdByEmployeeCode: agreement.createdByCode,
    returnCondition: agreement.returnCondition ?? null,
    documentDate: dbDate(agreement.documentDate),
    updatedAt: agreement.updatedAt,
  }).onConflictDoUpdate({
    target: assetAgreements.id,
    set: {
      templateId: agreement.templateId,
      type: agreement.type === "assetForm" ? "asset_form" : "borrow",
      title: agreement.title,
      headerHtml: agreement.header,
      bodyHtml: agreement.body,
      footerHtml: agreement.footer,
      status: agreementStatusToDb[agreement.status],
      createdByName: agreement.createdBy,
      createdByEmployeeCode: agreement.createdByCode,
      returnCondition: agreement.returnCondition ?? null,
      documentDate: dbDate(agreement.documentDate),
      updatedAt: agreement.updatedAt,
      version: sql`${assetAgreements.version} + 1`,
    },
  });

  await tx.delete(assetAgreementSigners).where(eq(assetAgreementSigners.agreementId, agreementId));
  if (!agreement.signatureBoxes.length) return;
  await tx.insert(assetAgreementSigners).values(agreement.signatureBoxes.map((box, position) => {
    const old = oldById.get(box.id);
    const signer = box.signer ?? (box.id.startsWith("employee") ? "employee" : box.id.startsWith("handover") ? "other" : "admin");
    const participant = agreementParticipantForSignatureBox({ id: box.id, signer });
    const changedSignature = !old || old.signatureData !== (box.signatureData ?? null) || old.signatureStatus !== box.status;
    const changedReturnSignature = !old || old.returnSignatureData !== (box.returnSignatureData ?? null);
    const expectedSignerSigned = box.name.trim().toLowerCase() === actorName.toLowerCase();
    return {
      agreementId,
      boxId: box.id,
      position,
      participant,
      label: box.label,
      role: box.role,
      signerKind: signer,
      signerName: box.name,
      layoutPosition: box.position,
      page: box.page ?? null,
      xPercent: box.x == null ? null : String(box.x),
      yPercent: box.y == null ? null : String(box.y),
      signatureData: box.signatureData ?? null,
      signatureStatus: box.status,
      signedByEmployeeId: box.status !== "signed" ? null : changedSignature ? (expectedSignerSigned ? actorEmployeeId : null) : old?.signedByEmployeeId ?? null,
      signedByName: box.status !== "signed" ? "" : changedSignature ? actorName : old?.signedByName || box.name,
      signedAt: box.signedAt ? new Date(box.signedAt) : null,
      returnSignatureData: box.returnSignatureData ?? null,
      returnSignedByEmployeeId: !box.returnSignatureData ? null : changedReturnSignature ? (expectedSignerSigned ? actorEmployeeId : null) : old?.returnSignedByEmployeeId ?? null,
      returnSignedByName: !box.returnSignatureData ? "" : changedReturnSignature ? actorName : old?.returnSignedByName || box.name,
      returnSignedAt: box.returnSignedAt ? new Date(box.returnSignedAt) : null,
    };
  }));
}

async function writeAgreementForRequest(
  tx: AssetTransaction,
  requestId: string,
  value: AssetAgreement,
  actorEmployeeId: string,
): Promise<string> {
  const [request] = await tx.select({ agreementId: assetRequests.agreementId }).from(assetRequests)
    .where(eq(assetRequests.id, requestId)).for("update");
  if (!request) throw new AssetRepositoryError("ไม่พบคำขอยืมทรัพย์สิน");
  const agreementId = request.agreementId ?? globalThis.crypto.randomUUID();
  await writeAgreement(tx, agreementId, value, actorEmployeeId);
  if (!request.agreementId) {
    await tx.update(assetRequests).set({ agreementId }).where(eq(assetRequests.id, requestId));
  }
  return agreementId;
}

async function addEvent(
  tx: AssetTransaction,
  requestId: string,
  actorEmployeeId: string,
  eventType: string,
  fromStatus: keyof typeof statusToDb | null,
  toStatus: keyof typeof statusToDb | null,
  details: Record<string, unknown> = {},
) {
  await tx.insert(assetRequestEvents).values({
    requestId,
    actorEmployeeId,
    eventType,
    fromStatus: fromStatus ? statusToDb[fromStatus] : null,
    toStatus: toStatus ? statusToDb[toStatus] : null,
    details,
  });
}

export class DrizzleAssetRepository implements AssetRepository {
  constructor(private readonly actorEmployeeId: string) {}

  async getById(id: string): Promise<AssetRequest | null> {
    const [row] = await db.select({ id: assetRequests.id }).from(assetRequests)
      .where(and(eq(assetRequests.id, id), isNull(assetRequests.deletedAt)));
    if (!row) return null;
    return (await this.hydrateMany([id]))[0] ?? null;
  }

  async listAll(): Promise<AssetRequest[]> {
    const rows = await db.select().from(assetRequests).where(isNull(assetRequests.deletedAt)).orderBy(desc(assetRequests.formDate));
    return this.hydrateMany(rows.map((row) => row.id));
  }

  async listForEmployee(employeeCode: string): Promise<AssetRequest[]> {
    const rows = await db.select({ id: assetRequests.id }).from(assetRequests)
      .where(and(isNull(assetRequests.deletedAt), sql`lower(btrim(${assetRequests.borrowerEmployeeCode})) = lower(btrim(${employeeCode}))`))
      .orderBy(desc(assetRequests.formDate));
    return this.hydrateMany(rows.map((row) => row.id));
  }

  async listForAgreementParticipant(participant: AssetAgreementParticipant, _employeeCode: string, employeeName: string): Promise<AssetRequest[]> {
    const rows = await db.select({ id: assetRequests.id }).from(assetAgreementSigners)
      .innerJoin(assetRequests, eq(assetRequests.agreementId, assetAgreementSigners.agreementId))
      .where(and(
        isNull(assetRequests.deletedAt),
        eq(assetAgreementSigners.participant, participant),
        sql`lower(btrim(${assetAgreementSigners.signerName})) = lower(btrim(${employeeName}))`,
      ))
      .orderBy(desc(assetRequests.formDate));
    return this.hydrateMany([...new Set(rows.map((row) => row.id))]);
  }

  async create(input: AssetCreateInput): Promise<AssetRequest> {
    const [created] = await this.createMany([input]);
    if (!created) throw new AssetRepositoryError("ไม่พบคำขอที่เพิ่งสร้าง");
    return created;
  }

  async createMany(inputs: readonly AssetCreateInput[]): Promise<AssetRequest[]> {
    if (!inputs.length) return [];
    await db.transaction(async (tx) => {
      for (const input of inputs) {
        const items = parseAssetItems(input.items);
        const agreementId = input.agreement ? globalThis.crypto.randomUUID() : null;
        if (input.agreement && agreementId) await writeAgreement(tx, agreementId, input.agreement, this.actorEmployeeId);
        await tx.insert(assetRequests).values({
          id: input.id,
          agreementId,
          borrowerEmployeeId: await this.borrowerIdByCode(tx, input.employeeCode),
          borrowerEmployeeCode: input.employeeCode,
          borrowerName: input.employeeName,
          borrowerDepartment: input.department,
          borrowerPosition: input.position,
          formDate: input.formDate,
          fromDate: dbDate(input.fromDate),
          toDate: input.toDate ? dbDate(input.toDate) : null,
          reason: input.reason,
          remarks: input.remarks,
          status: input.initialStatus ?? "pending",
          borrowerSignatureData: input.borrowerSignatureData ?? "",
          approvedBorrowByEmployeeId: input.initialStatus === "approved" ? this.actorEmployeeId : null,
          approvedBorrowByName: input.initialApprovedBy ?? "",
          approvedBorrowAt: input.initialStatus === "approved" ? input.formDate : null,
        });
        await tx.insert(assetRequestItems).values(items.map((item, position) => ({ requestId: input.id, position, ...item })));
        await this.writeAttachments(tx, input.id, "request", input.imageUrl ? [input.imageUrl] : []);
        await this.writeAttachments(tx, input.id, "additional", input.additionalImages);
        await addEvent(tx, input.id, this.actorEmployeeId, "created", null, input.initialStatus ?? "pending");
      }
    });
    return this.hydrateMany(inputs.map((input) => input.id));
  }

  async transition(input: AssetTransition): Promise<void> {
    await db.transaction(async (tx) => {
      const [row] = await tx.select().from(assetRequests).where(eq(assetRequests.id, input.id)).for("update");
      if (!row || row.deletedAt) throw new AssetRepositoryError("ไม่พบคำขอยืมทรัพย์สิน");
      const next = statusToDb[input.status];
      const current = statusFromDb[row.status];
      if (input.status === "returnPending") {
        const agreement = await loadAgreement(tx, row.agreementId);
        if (agreement && agreement.status !== "completed") {
          throw new AssetRepositoryError("Agreement ต้องลงชื่อให้ครบก่อนแจ้งคืนทรัพย์สิน");
        }
      }
      if (input.status === "returned" && !input.returnInspection?.trim()) throw new AssetRepositoryError("กรุณาระบุผลการตรวจสภาพก่อนยืนยันรับคืน");
      if (input.status === "returned") {
        const agreement = await loadAgreement(tx, row.agreementId);
        if (agreement && !isAssetFormOnly(agreement) && !hasBothReturnSignatures(agreement)) {
          throw new AssetRepositoryError("ต้องมีลายเซ็นผู้ยืมและผู้รับคืนก่อนยืนยันรับคืน");
        }
      }
      await tx.update(assetRequests).set({
        status: next,
        approvedBorrowByEmployeeId: input.status === "approved" || input.status === "rejected" ? this.actorEmployeeId : row.approvedBorrowByEmployeeId,
        approvedBorrowByName: input.status === "approved" || input.status === "rejected" ? input.actorName : row.approvedBorrowByName,
        approvedBorrowAt: input.status === "approved" ? input.approvedBorrowDate ?? new Date() : row.approvedBorrowAt,
        returnInspectorEmployeeId: input.status === "returned" ? this.actorEmployeeId : row.returnInspectorEmployeeId,
        returnInspectorName: input.status === "returned" ? input.returnInspector : row.returnInspectorName,
        approvedReturnByEmployeeId: input.status === "returned" ? this.actorEmployeeId : row.approvedReturnByEmployeeId,
        approvedReturnByName: input.status === "returned" ? input.approvedReturnBy : row.approvedReturnByName,
        returnInspection: input.status === "returned" ? input.returnInspection ?? "" : row.returnInspection,
        version: sql`${assetRequests.version} + 1`,
        updatedAt: new Date(),
      }).where(eq(assetRequests.id, row.id));
      if (input.status === "returned") await this.writeAttachments(tx, row.id, "return", input.imageUrl ? [input.imageUrl] : []);
      await addEvent(tx, row.id, this.actorEmployeeId, "status_changed", current, input.status, { returnInspection: input.returnInspection ?? "" });
    });
  }

  async markSeen(ids: readonly string[]): Promise<void> {
    if (!ids.length) return;
    await db.insert(assetRequestReads).values(ids.map((requestId) => ({ requestId, employeeId: this.actorEmployeeId })))
      .onConflictDoUpdate({ target: [assetRequestReads.requestId, assetRequestReads.employeeId], set: { seenAt: new Date() } });
  }

  async remove(id: string): Promise<void> {
    await db.transaction(async (tx) => {
      const [row] = await tx.select().from(assetRequests).where(eq(assetRequests.id, id)).for("update");
      if (!row || row.deletedAt) throw new AssetRepositoryError("ไม่พบคำขอยืมทรัพย์สิน");
      await tx.update(assetRequests).set({ deletedAt: new Date(), deletedByEmployeeId: this.actorEmployeeId, updatedAt: new Date(), version: sql`${assetRequests.version} + 1` }).where(eq(assetRequests.id, id));
      await addEvent(tx, id, this.actorEmployeeId, "deleted", statusFromDb[row.status], statusFromDb[row.status]);
    });
  }

  async updateItems(id: string, itemsValue: string): Promise<void> {
    const items = parseAssetItems(itemsValue);
    await db.transaction(async (tx) => {
      await tx.delete(assetRequestItems).where(eq(assetRequestItems.requestId, id));
      await tx.insert(assetRequestItems).values(items.map((item, position) => ({ requestId: id, position, ...item })));
      await tx.update(assetRequests).set({ version: sql`${assetRequests.version} + 1`, updatedAt: new Date() }).where(eq(assetRequests.id, id));
      await addEvent(tx, id, this.actorEmployeeId, "items_updated", null, null);
    });
  }

  async updateDetails(id: string, itemsValue: string, agreement: AssetAgreement): Promise<void> {
    const items = parseAssetItems(itemsValue);
    await db.transaction(async (tx) => {
      await tx.delete(assetRequestItems).where(eq(assetRequestItems.requestId, id));
      await tx.insert(assetRequestItems).values(items.map((item, position) => ({ requestId: id, position, ...item })));
      await writeAgreementForRequest(tx, id, agreement, this.actorEmployeeId);
      await tx.update(assetRequests).set({ version: sql`${assetRequests.version} + 1`, updatedAt: new Date() }).where(eq(assetRequests.id, id));
      await addEvent(tx, id, this.actorEmployeeId, "request_updated", null, null);
    });
  }

  async confirmReturn(input: { id: string; agreement: AssetAgreement; returnInspector: string; approvedReturnBy: string; imageUrl: string; returnInspection: string }): Promise<void> {
    await db.transaction(async (tx) => {
      const [row] = await tx.select().from(assetRequests).where(eq(assetRequests.id, input.id)).for("update");
      if (!row || row.deletedAt) throw new AssetRepositoryError("ไม่พบคำขอยืมทรัพย์สิน");
      if (row.status !== "return_pending") throw new AssetRepositoryError("คำขอต้องอยู่ในสถานะรอรับคืนก่อน");
      const currentAgreement = await loadAgreement(tx, row.agreementId);
      if (!currentAgreement || (!isAssetFormOnly(currentAgreement) && !hasBothReturnSignatures(currentAgreement))) {
        throw new AssetRepositoryError("ต้องมีลายเซ็นผู้ยืมและผู้รับคืนก่อนยืนยันรับคืน");
      }
      await writeAgreementForRequest(tx, row.id, input.agreement, this.actorEmployeeId);
      await tx.update(assetRequests).set({
        status: "returned",
        returnInspectorEmployeeId: this.actorEmployeeId,
        returnInspectorName: input.returnInspector,
        approvedReturnByEmployeeId: this.actorEmployeeId,
        approvedReturnByName: input.approvedReturnBy,
        returnInspection: input.returnInspection,
        version: sql`${assetRequests.version} + 1`,
        updatedAt: new Date(),
      }).where(eq(assetRequests.id, row.id));
      await this.writeAttachments(tx, row.id, "return", input.imageUrl ? [input.imageUrl] : []);
      await addEvent(tx, row.id, this.actorEmployeeId, "return_confirmed", statusFromDb[row.status], "returned", { inspection: input.returnInspection });
    });
  }

  async saveAgreement(id: string, agreement: AssetAgreement): Promise<void> {
    await db.transaction(async (tx) => {
      const [request] = await tx.select().from(assetRequests).where(eq(assetRequests.id, id)).for("update");
      if (!request || request.deletedAt) throw new AssetRepositoryError("ไม่พบคำขอยืมทรัพย์สิน");
      await writeAgreementForRequest(tx, id, agreement, this.actorEmployeeId);
      const managerSigner = agreement.signatureBoxes.find((box) => box.id === "admin");
      const completesPendingRequest = request.status === "pending" && agreement.type === "borrow" && agreement.status === "completed" && managerSigner?.status === "signed";
      const [actor] = completesPendingRequest
        ? await tx.select({ firstName: employees.firstName, lastName: employees.lastName }).from(employees).where(eq(employees.id, this.actorEmployeeId))
        : [];
      const actorName = `${actor?.firstName ?? ""} ${actor?.lastName ?? ""}`.trim() || managerSigner?.name || "";
      await tx.update(assetRequests).set({
        ...(completesPendingRequest ? {
          status: "approved" as const,
          approvedBorrowByEmployeeId: this.actorEmployeeId,
          approvedBorrowByName: actorName,
          approvedBorrowAt: managerSigner.signedAt ? new Date(managerSigner.signedAt) : new Date(),
          approvedBorrowSignatureData: managerSigner.signatureData ?? "",
        } : {}),
        version: sql`${assetRequests.version} + 1`,
        updatedAt: new Date(),
      }).where(eq(assetRequests.id, id));
      await addEvent(tx, id, this.actorEmployeeId, completesPendingRequest ? "agreement_approved" : "agreement_updated", completesPendingRequest ? "pending" : null, completesPendingRequest ? "approved" : null);
    });
  }

  async approveFormRequest(id: string, actorName: string, signatureData: string): Promise<void> {
    await db.transaction(async (tx) => {
      const [row] = await tx.select().from(assetRequests).where(eq(assetRequests.id, id)).for("update");
      if (!row || row.deletedAt) throw new AssetRepositoryError("ไม่พบคำขอยืมทรัพย์สิน");
      if (row.status !== "pending" || row.agreementId || !row.borrowerSignatureData) {
        throw new AssetRepositoryError("รายการนี้ไม่พร้อมให้ผู้อนุมัติลงชื่อ");
      }
      const signedAt = new Date();
      await tx.update(assetRequests).set({
        status: "approved",
        approvedBorrowByEmployeeId: this.actorEmployeeId,
        approvedBorrowByName: actorName,
        approvedBorrowAt: signedAt,
        approvedBorrowSignatureData: signatureData,
        version: sql`${assetRequests.version} + 1`,
        updatedAt: new Date(),
      }).where(eq(assetRequests.id, id));
      await addEvent(tx, id, this.actorEmployeeId, "form_approved", "pending", "approved");
    });
  }

  private async borrowerIdByCode(tx: AssetTransaction, employeeCode: string): Promise<string> {
    const [employee] = await tx.select({ id: employees.id }).from(employees)
      .where(and(eq(employees.code, employeeCode), isNull(employees.deletedAt)));
      if (!employee) throw new AssetRepositoryError("ไม่พบข้อมูลผู้ยืมในฐานข้อมูล");
    return employee.id;
  }

  private async writeAttachments(tx: AssetTransaction, requestId: string, kind: "request" | "additional" | "return", urls: readonly string[]): Promise<void> {
    await tx.delete(assetRequestAttachments).where(and(eq(assetRequestAttachments.requestId, requestId), eq(assetRequestAttachments.kind, kind)));
    const cleaned = urls.map((url) => url.trim()).filter(Boolean);
    if (!cleaned.length) return;
    await tx.insert(assetRequestAttachments).values(cleaned.map((url, position) => ({
      requestId,
      kind,
      position,
      url,
      uploadedByEmployeeId: this.actorEmployeeId,
    })));
  }

  private async hydrateMany(ids: string[]): Promise<AssetRequest[]> {
    if (!ids.length) return [];
    const rows = await db.select().from(assetRequests).where(and(inArray(assetRequests.id, ids), isNull(assetRequests.deletedAt)));
    const order = new Map(ids.map((id, index) => [id, index]));
    rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    const requestIds = rows.map((row) => row.id);
    const agreementIds = rows.flatMap((row) => row.agreementId ? [row.agreementId] : []);
    const [allItems, allAttachments, allAgreements, allSigners, reads] = await Promise.all([
      db.select().from(assetRequestItems).where(inArray(assetRequestItems.requestId, requestIds)).orderBy(asc(assetRequestItems.position)),
      db.select().from(assetRequestAttachments).where(inArray(assetRequestAttachments.requestId, requestIds)).orderBy(asc(assetRequestAttachments.position)),
      agreementIds.length ? db.select().from(assetAgreements).where(inArray(assetAgreements.id, agreementIds)) : Promise.resolve([]),
      agreementIds.length ? db.select().from(assetAgreementSigners).where(inArray(assetAgreementSigners.agreementId, agreementIds)).orderBy(asc(assetAgreementSigners.position)) : Promise.resolve([]),
      db.select({ requestId: assetRequestReads.requestId }).from(assetRequestReads)
        .where(and(inArray(assetRequestReads.requestId, requestIds), eq(assetRequestReads.employeeId, this.actorEmployeeId))),
    ]);
    const itemsByRequest = groupBy(allItems, (item) => item.requestId);
    const attachmentsByRequest = groupBy(allAttachments, (attachment) => attachment.requestId);
    const agreementsById = new Map(allAgreements.map((agreement) => [agreement.id, agreement]));
    const signersByAgreement = groupBy(allSigners, (signer) => signer.agreementId);
    const seenIds = new Set(reads.map((read) => read.requestId));

    return rows.map((row) => {
      const requestItems = itemsByRequest.get(row.id) ?? [];
      const attachments = attachmentsByRequest.get(row.id) ?? [];
      const requestImages = attachments.filter((attachment) => attachment.kind === "request");
      const agreement = row.agreementId ? agreementsById.get(row.agreementId) : undefined;
      const request = assetRequestSchema.parse({
        id: row.id,
        agreementId: row.agreementId,
        formDate: row.formDate,
        employeeName: row.borrowerName,
        department: row.borrowerDepartment,
        position: row.borrowerPosition,
        employeeCode: row.borrowerEmployeeCode,
        reason: row.reason,
        fromDate: dateOnly(row.fromDate),
        toDate: dateOnly(row.toDate),
        items: requestItems.map((item) => `${item.name}|${item.quantity}|${item.note}`).join("\n"),
        remarks: row.remarks,
        status: statusFromDb[row.status],
        statusLabel: statusLabels[row.status],
        approvedBorrowBy: row.approvedBorrowByName,
        borrowerSignatureData: row.borrowerSignatureData,
        approvedBorrowSignatureData: row.approvedBorrowSignatureData,
        returnInspector: row.returnInspectorName,
        approvedReturnBy: row.approvedReturnByName,
        imageUrl: requestImages[0]?.url ?? "",
        seen: seenIds.has(row.id),
        additionalImages: attachments.filter((attachment) => attachment.kind === "additional").map((attachment) => attachment.url),
        approvedBorrowDate: row.approvedBorrowAt,
        agreement: agreement ? agreementFromDb(agreement, signersByAgreement.get(row.agreementId!) ?? []) : null,
      });
      return request;
    });
  }
}

function groupBy<T, K extends string>(values: T[], key: (value: T) => K): Map<K, T[]> {
  const grouped = new Map<K, T[]>();
  for (const value of values) {
    const groupKey = key(value);
    const group = grouped.get(groupKey) ?? [];
    group.push(value);
    grouped.set(groupKey, group);
  }
  return grouped;
}

function hasBothReturnSignatures(agreement: AssetAgreement): boolean {
  const employeeSigned = agreement.signatureBoxes.some((box) => box.id === "employee" && Boolean(box.returnSignatureData));
  const adminSigned = agreement.signatureBoxes.some((box) => box.id === "admin" && Boolean(box.returnSignatureData));
  return employeeSigned && adminSigned;
}
