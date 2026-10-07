import { arrayContains, asc, desc, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { departments, employeeDocuments, employees } from "@/lib/db/schema";
import { requireApiUser, withApiAuth } from "@/lib/auth/dal";
import { canViewAllEmployeeDocuments, canViewEmployeeDocuments } from "@/lib/auth/permissions";
import { employeeDocumentError as jsonError } from "@/lib/employee-documents-api";

export const GET = withApiAuth(async (request: NextRequest) => {
  const user = await requireApiUser(request);
  if (!canViewEmployeeDocuments(user.permissions)) return jsonError(403, "ไม่มีสิทธิ์ดูเอกสารพนักงาน");

  const canViewAll = canViewAllEmployeeDocuments(user.permissions);
  const documents = await db
    .select({
      id: employeeDocuments.id,
      employeeId: employeeDocuments.employeeId,
      fileName: employeeDocuments.fileName,
      mimeType: employeeDocuments.mimeType,
      fileSize: employeeDocuments.fileSize,
      uploadedByUserId: employeeDocuments.uploadedByUserId,
      sharedWithUserIds: employeeDocuments.sharedWithUserIds,
      createdAt: employeeDocuments.createdAt,
      employeeCode: employees.code,
      employeeFirstName: employees.firstName,
      employeeLastName: employees.lastName,
      employeeDeletedAt: employees.deletedAt,
      departmentName: departments.name,
    })
    .from(employeeDocuments)
    .innerJoin(employees, eq(employeeDocuments.employeeId, employees.id))
    .leftJoin(departments, eq(employees.departmentId, departments.id))
    .where(canViewAll ? undefined : arrayContains(employeeDocuments.sharedWithUserIds, [user.sub]))
    .orderBy(desc(employeeDocuments.createdAt), asc(employees.firstName), asc(employees.lastName));

  const items = documents
    .map(({ sharedWithUserIds, employeeFirstName, employeeLastName, employeeDeletedAt, ...document }) => ({
      ...document,
      employeeName: [employeeFirstName, employeeLastName].filter(Boolean).join(" "),
      employeeIsActive: employeeDeletedAt === null,
      ...(canViewAll ? {
        sharedWithUserIds,
        sharedUserCount: sharedWithUserIds.length,
      } : {}),
    }));

  return NextResponse.json({ items }, { headers: { "Cache-Control": "private, no-store" } });
});
