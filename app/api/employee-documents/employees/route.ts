import { asc, isNull } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { employees } from "@/lib/db/schema";
import { requireApiUser, withApiAuth } from "@/lib/auth/dal";
import { canManageEmployeeDocuments } from "@/lib/auth/permissions";
import { employeeDocumentError as jsonError } from "@/lib/employee-documents-api";

export const GET = withApiAuth(async (request: NextRequest) => {
  const user = await requireApiUser(request);
  if (!canManageEmployeeDocuments(user.permissions)) return jsonError(403, "ไม่มีสิทธิ์จัดการเอกสารพนักงาน");

  const items = await db
    .select({
      id: employees.id,
      code: employees.code,
      firstName: employees.firstName,
      lastName: employees.lastName,
    })
    .from(employees)
    .where(isNull(employees.deletedAt))
    .orderBy(asc(employees.firstName), asc(employees.lastName));

  return NextResponse.json({ items }, { headers: { "Cache-Control": "private, no-store" } });
});
