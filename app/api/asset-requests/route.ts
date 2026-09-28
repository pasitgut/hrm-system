import { and, inArray, isNull, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { AssetApplicationService } from "@/asset-borrowing/application/AssetApplicationService";
import { AssetApplicationError } from "@/asset-borrowing/application/AssetApplicationError";
import { parseAssetItems, serializeAssetItems } from "@/asset-borrowing/domain/asset";
import { type BorrowAgreementTemplate } from "@/asset-borrowing/application/agreementFactory";
import { COMPANY_ASSET_FORM_AGREEMENT, COMPANY_BORROW_AGREEMENT } from "@/asset-borrowing/presets/companyAgreements";
import { jsonError, isManagerRole, assetRequestDtos, isHttpUrl, requestId, toDate } from "@/app/api/asset-requests/_shared";
import { db } from "@/lib/db/client";
import { assetAgreementTemplates as agreementTemplateTable, departments, employees, positions } from "@/lib/db/schema";
import { requireApiUser, withApiAuth } from "@/lib/auth/dal";
import { AssetRepositoryError, DrizzleAssetRepository } from "@/lib/assets/DrizzleAssetRepository";

const agreementTemplates = { borrow: COMPANY_BORROW_AGREEMENT, assetForm: COMPANY_ASSET_FORM_AGREEMENT };

export const GET = withApiAuth(async (request: NextRequest) => {
  const user = await requireApiUser(request);
  const repository = new DrizzleAssetRepository(user.employeeId);
  const [employee] = await db.select({ code: employees.code }).from(employees).where(eq(employees.id, user.employeeId));
  if (!employee) return jsonError(404, "Employee not found");
  const items = isManagerRole(user.role) ? await repository.listAll() : await repository.listForEmployee(employee.code);
  return NextResponse.json({ items: assetRequestDtos(items) });
});

export const POST = withApiAuth(async (request: NextRequest) => {
  const user = await requireApiUser(request);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }
  if (typeof body !== "object" || body === null) return jsonError(400, "Invalid request body");

  const input = body as Record<string, unknown>;
  const flow = input.flow === "admin-managed" ? "admin-managed" : "self-service";
  const manager = isManagerRole(user.role);
  if (flow === "admin-managed" && !manager) return jsonError(403, "Only a supervisor or CEO can submit on behalf of employees");

  let selectedAgreementTemplate: BorrowAgreementTemplate | null = null;
  if (input.agreementTemplateId != null && input.agreementTemplateId !== "") {
    if (!manager || flow !== "admin-managed") return jsonError(403, "Only a supervisor or CEO can attach an Agreement");
    if (typeof input.agreementTemplateId !== "string" || !requestId(input.agreementTemplateId)) return jsonError(400, "Invalid Agreement template id");
    const [template] = await db.select().from(agreementTemplateTable).where(eq(agreementTemplateTable.id, input.agreementTemplateId));
    if (!template || !template.isActive || template.type !== "borrow") return jsonError(400, "Agreement template is unavailable");
    selectedAgreementTemplate = {
      templateId: template.id,
      title: template.title,
      header: template.headerHtml,
      body: template.bodyHtml,
      footer: template.footerHtml,
      handoverSigner: COMPANY_BORROW_AGREEMENT.handoverSigner,
      approverSigner: COMPANY_BORROW_AGREEMENT.approverSigner,
    };
  }

  const fromDate = toDate(input.fromDate);
  const toReturnDate = input.toDate === null || input.toDate === "" ? null : toDate(input.toDate);
  if (!fromDate || (input.toDate != null && input.toDate !== "" && !toReturnDate)) return jsonError(400, "Invalid borrowing date");

  let items: string;
  try {
    if (!Array.isArray(input.items)) return jsonError(400, "At least one asset item is required");
    items = serializeAssetItems(input.items as Array<{ name: string; quantity: number; note: string }>);
  } catch (error) {
    return jsonError(400, error instanceof Error ? error.message : "Invalid asset items");
  }

  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  const remarks = typeof input.remarks === "string" ? input.remarks.trim() : "";
  if (reason.length > 4000 || remarks.length > 4000) return jsonError(400, "Request text is too long");
  const imageUrl = typeof input.imageUrl === "string" ? input.imageUrl.trim() : "";
  const additionalImages = Array.isArray(input.additionalImages)
    ? input.additionalImages.filter((value): value is string => typeof value === "string").map((value) => value.trim()).filter(Boolean)
    : [];
  if (additionalImages.length > 10 || [imageUrl, ...additionalImages].some((url) => url && (url.length > 2048 || !isHttpUrl(url)))) return jsonError(400, "Too many or invalid attachment URLs");

  let borrowerIds: string[];
  if (flow === "admin-managed") {
    if (!Array.isArray(input.employeeIds)) return jsonError(400, "Select at least one employee");
    borrowerIds = [...new Set(input.employeeIds.filter((value): value is string => typeof value === "string"))];
  } else {
    borrowerIds = [user.employeeId];
  }
  if (!borrowerIds.length || borrowerIds.length > 20) return jsonError(400, "Select between 1 and 20 employees");
  if (!borrowerIds.every(requestId)) return jsonError(400, "Invalid employee selection");
  if (flow === "self-service" && borrowerIds[0] !== user.employeeId) return jsonError(403, "Employees may submit requests for themselves only");

  const borrowers = await db.select({
    id: employees.id,
    employeeName: employees.firstName,
    lastName: employees.lastName,
    employeeCode: employees.code,
    department: departments.name,
    position: positions.name,
  }).from(employees)
    .leftJoin(departments, eq(employees.departmentId, departments.id))
    .leftJoin(positions, eq(employees.positionId, positions.id))
    .where(and(inArray(employees.id, borrowerIds), isNull(employees.deletedAt)));
  if (borrowers.length !== borrowerIds.length) return jsonError(400, "One or more selected employees could not be found");
  const actor = borrowers.find((employee) => employee.id === user.employeeId) ?? (await db.select({
    id: employees.id, employeeName: employees.firstName, lastName: employees.lastName, employeeCode: employees.code,
  }).from(employees).where(eq(employees.id, user.employeeId)).limit(1))[0];
  if (!actor) return jsonError(404, "Employee not found");

  const borrowerSignature = typeof input.borrowerSignature === "string" ? input.borrowerSignature.trim() : "";
  if (flow === "self-service" && (!borrowerSignature || borrowerSignature.length > 2048 || !isHttpUrl(borrowerSignature))) return jsonError(400, "A borrower signature is required");

  try {
    const repository = new DrizzleAssetRepository(user.employeeId);
    const service = new AssetApplicationService(repository, agreementTemplates);
    const created = await service.submitBorrowRequests({
      borrowers: borrowers.map((employee) => ({
        employeeName: `${employee.employeeName} ${employee.lastName}`.trim(),
        employeeCode: employee.employeeCode,
        department: employee.department ?? "",
        position: employee.position ?? "",
      })),
      requestedBy: { name: `${actor.employeeName} ${actor.lastName}`.trim(), employeeCode: actor.employeeCode },
      fromDate,
      toDate: toReturnDate,
      items: parseAssetItems(items),
      reason,
      remarks,
      imageUrl,
      additionalImages,
      ...(flow === "admin-managed"
        ? { flow, agreementTemplate: selectedAgreementTemplate }
        : { flow, borrowerSignature }),
    });
    return NextResponse.json({ items: assetRequestDtos(created) }, { status: 201 });
  } catch (error) {
    if (error instanceof AssetApplicationError) return jsonError(400, error.message);
    if (error instanceof AssetRepositoryError) return jsonError(409, error.message);
    if (error instanceof Error && error.name === "ZodError") return jsonError(400, "Asset request data is invalid");
    throw error;
  }
});
