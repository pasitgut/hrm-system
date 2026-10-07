import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { AssetApplicationService } from "@/asset-borrowing/application/AssetApplicationService";
import { AssetApplicationError } from "@/asset-borrowing/application/AssetApplicationError";
import { COMPANY_ASSET_FORM_AGREEMENT, COMPANY_BORROW_AGREEMENT } from "@/asset-borrowing/presets/companyAgreements";
import { createDefaultBorrowAgreement } from "@/asset-borrowing/application/agreementFactory";
import {
  assetAgreementSchema,
  assetTransitionSchema,
  canEditAgreement,
  isAssetFormOnly,
  type AssetAgreement,
  type AssetAgreementParticipant,
  type AssetStatus,
} from "@/asset-borrowing/domain/asset";
import { jsonError, isHttpUrl, assetRequestDto, requestId, toDate } from "@/app/api/asset-requests/_shared";
import { db } from "@/lib/db/client";
import { AssetRepositoryError, DrizzleAssetRepository } from "@/lib/assets/DrizzleAssetRepository";
import { assetAgreementTemplates, assetRequests, employees } from "@/lib/db/schema";
import { requireApiUser, withApiAuth } from "@/lib/auth/dal";
import { canManageAssets, canViewCompanyAssetRequests, canViewOwnAssetRequests } from "@/lib/auth/permissions";

type RouteContext = { params: Promise<{ id: string }> };
const agreementTemplates = {
  borrow: COMPANY_BORROW_AGREEMENT,
  assetForm: COMPANY_ASSET_FORM_AGREEMENT,
};

function deserializeAgreement(value: unknown): AssetAgreement | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const documentDate = toDate(raw.documentDate) ?? (typeof raw.documentDate === "string" ? new Date(raw.documentDate) : null);
  if (!documentDate || Number.isNaN(documentDate.getTime())) return null;
  return assetAgreementSchema.parse({
    ...raw,
    documentDate,
    updatedAt: raw.updatedAt ? new Date(String(raw.updatedAt)) : null,
    signatureBoxes: Array.isArray(raw.signatureBoxes) ? raw.signatureBoxes.map((rawBox) => {
      if (!rawBox || typeof rawBox !== "object") return rawBox;
      const box = rawBox as Record<string, unknown>;
      return {
        ...box,
        signedAt: box.signedAt === null ? null : box.signedAt ? String(box.signedAt) : null,
        returnSignedAt: box.returnSignedAt === null ? null : box.returnSignedAt ? String(box.returnSignedAt) : null,
      };
    }) : [],
  });
}

async function requestContext(request: NextRequest, id: string) {
  const user = await requireApiUser(request);
  if (!requestId(id)) return { response: jsonError(400, "Invalid request id") } as const;
  const [row] = await db.select({ borrowerEmployeeId: assetRequests.borrowerEmployeeId })
    .from(assetRequests).where(eq(assetRequests.id, id));
  if (!row) return { response: jsonError(404, "Not found") } as const;
  if (!canViewOwnAssetRequests(user.permissions) && !canViewCompanyAssetRequests(user.permissions)) {
    return { response: jsonError(403, "Asset request view permission required") } as const;
  }
  if (!canViewCompanyAssetRequests(user.permissions) && row.borrowerEmployeeId !== user.employeeId) return { response: jsonError(403, "Forbidden") } as const;
  const [employee] = await db.select({
    code: employees.code,
    name: employees.firstName,
    lastName: employees.lastName,
  }).from(employees).where(eq(employees.id, user.employeeId));
  if (!employee) return { response: jsonError(404, "Employee not found") } as const;
  return { user, employee, repository: new DrizzleAssetRepository(user.employeeId) } as const;
}

export const GET = withApiAuth(async (request: NextRequest, context: RouteContext) => {
  const { id } = await context.params;
  const auth = await requestContext(request, id);
  if ("response" in auth) return auth.response;
  try {
    const item = await auth.repository.getById(id);
    if (!item) return jsonError(404, "Not found");
    return NextResponse.json({ item: assetRequestDto(item) });
  } catch (error) {
    if (error instanceof AssetRepositoryError) return jsonError(409, error.message);
    throw error;
  }
});

export const PATCH = withApiAuth(async (request: NextRequest, context: RouteContext) => {
  const { id } = await context.params;
  const auth = await requestContext(request, id);
  if ("response" in auth) return auth.response;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }
  if (typeof body !== "object" || body === null) return jsonError(400, "Invalid request body");
  const input = body as Record<string, unknown>;
  const entry = await auth.repository.getById(id);
  if (!entry) return jsonError(404, "Not found");
  const manager = canManageAssets(auth.user.permissions);
  const actorName = `${auth.employee.name} ${auth.employee.lastName}`.trim();
  const service = new AssetApplicationService(auth.repository, agreementTemplates);
  const signatureData = typeof input.signatureData === "string" ? input.signatureData.trim() : "";
  const imageUrl = typeof input.imageUrl === "string" ? input.imageUrl.trim() : "";
  if (signatureData && (signatureData.length > 2048 || !isHttpUrl(signatureData))) return jsonError(400, "Invalid signature image URL");
  if (imageUrl && (imageUrl.length > 2048 || !isHttpUrl(imageUrl))) return jsonError(400, "Invalid attachment URL");

  try {
    if (input.action === "transition") {
      if (typeof input.status !== "string") return jsonError(400, "Invalid status");
      const candidate = assetTransitionSchema.safeParse({
        id,
        status: input.status,
        actorName,
        returnInspector: input.status === "returned" ? actorName : "",
        approvedReturnBy: input.status === "returned" ? actorName : "",
        imageUrl,
        approvedBorrowDate: input.status === "approved" ? new Date() : null,
        returnInspection: typeof input.returnInspection === "string" ? input.returnInspection : "",
      });
      if (!candidate.success) return jsonError(400, "Invalid request status change");
      const next = candidate.data.status as AssetStatus;
      if ((next === "approved" || next === "rejected" || next === "returned") && !manager) return jsonError(403, "Asset management permission required");
      const assetFormOnly = isAssetFormOnly(entry.agreement);
      if ((next === "approved" || next === "rejected") && entry.agreement && !assetFormOnly) {
        return jsonError(409, "Requests with an agreement must follow the agreement workflow");
      }
      if (next === "approved" && entry.status === "pending" && !entry.agreement && entry.borrowerSignatureData) {
        return jsonError(409, "Please approve the signed borrowing form");
      }
      if (next === "approved" && assetFormOnly) return jsonError(409, "Asset Form requests must be approved with a manager signature");
      if (next === "rejected" && assetFormOnly && (entry.status !== "pending" || entry.agreement?.status !== "waitingAdmin")) {
        return jsonError(409, "Asset Form can only be rejected while awaiting approval");
      }
      if (next === "returnPending" && entry.employeeCode.toLowerCase() !== auth.employee.code.toLowerCase()) return jsonError(403, "Only the borrower can request a return");
      if (next === "returnPending" && entry.agreement && entry.agreement.status !== "completed") return jsonError(409, "The agreement must be completed before requesting a return");
      if (next === "returned" && !candidate.data.returnInspection.trim()) return jsonError(400, "Return inspection is required");
      if (next === "returned" && entry.agreement && !assetFormOnly && !hasBothReturnSignatures(entry.agreement)) {
        return jsonError(409, "Borrower and receiver return signatures are required before confirming return");
      }
      await service.changeStatus(entry, candidate.data);
    } else if (input.action === "signAgreement") {
      if (!entry.agreement) return jsonError(409, "Agreement not found");
      const signer = input.signer;
      if (signer !== "employee" && signer !== "handover" && signer !== "admin") return jsonError(400, "Invalid signer");
      if (!signatureData) return jsonError(400, "Signature is required");
      await service.signAgreement({
        entry,
        agreement: entry.agreement,
        signer: signer as AssetAgreementParticipant,
        signatureData,
        actorName,
        actorEmployeeCode: auth.employee.code,
        actorIsAdmin: canManageAssets(auth.user.permissions),
        actorCanManageRequests: manager,
        storeSignature: async (value) => value,
      });
    } else if (input.action === "signReturn") {
      if (!entry.agreement) return jsonError(409, "Agreement not found");
      if (input.signer !== "employee" && input.signer !== "admin") return jsonError(400, "Invalid signer");
      if (!signatureData) return jsonError(400, "Signature is required");
      await service.signReturn({
        entry,
        agreement: entry.agreement,
        signer: input.signer,
        signatureData,
        actorName,
        actorEmployeeCode: auth.employee.code,
        actorCanManageRequests: manager,
        storeSignature: async (value) => value,
      });
    } else if (input.action === "approveFormRequest") {
      if (!manager) return jsonError(403, "Asset management permission required");
      if (!signatureData) return jsonError(400, "Signature is required");
      await service.approveFormRequest(id, actorName, signatureData);
    } else if (input.action === "attachAgreementTemplate") {
      if (!manager) return jsonError(403, "Asset management permission required");
      if (entry.status !== "pending" || entry.agreement) return jsonError(409, "Agreement can only be added to a pending request without one");
      const templateId = typeof input.templateId === "string" ? input.templateId : "";
      if (!requestId(templateId)) return jsonError(400, "Invalid Agreement template id");
      const [template] = await db.select().from(assetAgreementTemplates).where(eq(assetAgreementTemplates.id, templateId));
      if (!template || !template.isActive || template.type !== "borrow") return jsonError(400, "Agreement template is unavailable");
      const agreement = createDefaultBorrowAgreement(entry, {
        templateId: template.id,
        title: template.title,
        header: template.headerHtml,
        body: template.bodyHtml,
        footer: template.footerHtml,
        handoverSigner: COMPANY_BORROW_AGREEMENT.handoverSigner,
        approverSigner: COMPANY_BORROW_AGREEMENT.approverSigner,
      }, actorName, auth.employee.code);
      await service.saveAgreement(id, agreement);
    } else if (input.action === "confirmReturn") {
      if (!manager) return jsonError(403, "Asset management permission required");
      if (typeof input.returnInspection !== "string" || !input.returnInspection.trim()) return jsonError(400, "Return inspection is required");
      if (!entry.agreement) return jsonError(409, "Agreement not found");
      if (!isAssetFormOnly(entry.agreement) && !hasBothReturnSignatures(entry.agreement)) return jsonError(409, "Borrower and receiver return signatures are required before confirming return");
      const agreement = deserializeAgreement(input.agreement) ?? entry.agreement;
      await service.confirmReturn({
        entry,
        agreement,
        returnInspector: actorName,
        approvedReturnBy: actorName,
        imageUrl,
        returnInspection: input.returnInspection.trim(),
      });
    } else if (input.action === "updateDetails") {
      if (!manager) return jsonError(403, "Asset management permission required");
      if (typeof input.items !== "string") return jsonError(400, "Asset items are required");
      const agreement = deserializeAgreement(input.agreement);
      if (!agreement || !canEditAgreement(manager, true, agreement.status, agreement.signatureBoxes.some((box) => box.status === "signed"))) {
        return jsonError(409, "This agreement can no longer be edited");
      }
      await service.updateRequestDetails(id, input.items, agreement);
    } else if (input.action === "saveAgreement") {
      if (!manager) return jsonError(403, "Asset management permission required");
      const agreement = deserializeAgreement(input.agreement);
      if (!agreement) return jsonError(400, "Invalid agreement");
      if (!canEditAgreement(manager, true, agreement.status, agreement.signatureBoxes.some((box) => box.status === "signed"))) {
        return jsonError(409, "This agreement can no longer be edited");
      }
      await service.saveAgreement(id, agreement);
    } else {
      return jsonError(400, "Unsupported asset request action");
    }
  } catch (error) {
    if (error instanceof AssetApplicationError) return jsonError(400, error.message);
    if (error instanceof AssetRepositoryError) return jsonError(409, error.message);
    if (error instanceof Error && error.name === "ZodError") return jsonError(400, "Agreement data is invalid");
    throw error;
  }

  const updated = await auth.repository.getById(id);
  return NextResponse.json({ item: updated ? assetRequestDto(updated) : null });
});

function hasBothReturnSignatures(agreement: AssetAgreement): boolean {
  const employeeSigned = agreement.signatureBoxes.some((box) => box.id === "employee" && Boolean(box.returnSignatureData));
  const adminSigned = agreement.signatureBoxes.some((box) => box.id === "admin" && Boolean(box.returnSignatureData));
  return employeeSigned && adminSigned;
}

export const DELETE = withApiAuth(async (request: NextRequest, context: RouteContext) => {
  const { id } = await context.params;
  const auth = await requestContext(request, id);
  if ("response" in auth) return auth.response;
  if (!canManageAssets(auth.user.permissions)) return jsonError(403, "Forbidden");
  try {
    const entry = await auth.repository.getById(id);
    if (!entry) return jsonError(404, "Not found");
    if (entry.status !== "rejected" && entry.status !== "returned") return jsonError(409, "Only rejected or returned requests can be removed");
    await auth.repository.remove(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AssetRepositoryError) return jsonError(409, error.message);
    throw error;
  }
});
