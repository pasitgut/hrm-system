import { asc, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { employees, users } from "@/lib/db/schema";
import { requireApiUser, withApiAuth } from "@/lib/auth/dal";
import { canShareEmployeeDocuments, canViewEmployeeDocuments } from "@/lib/auth/permissions";
import { employeeDocumentError as jsonError } from "@/lib/employee-documents-api";

export const GET = withApiAuth(async (request: NextRequest) => {
  const actor = await requireApiUser(request);
  if (!canShareEmployeeDocuments(actor.permissions)) return jsonError(403, "ไม่มีสิทธิ์จัดการสิทธิ์เอกสารพนักงาน");

  const accounts = await db
    .select({
      id: users.id,
      email: users.email,
      permissions: users.permissions,
      code: employees.code,
      firstName: employees.firstName,
      lastName: employees.lastName,
    })
    .from(users)
    .innerJoin(employees, eq(users.employeeId, employees.id))
    .where(eq(users.isActive, true))
    .orderBy(asc(employees.firstName), asc(employees.lastName));

  const items = accounts
    .filter((account) => canViewEmployeeDocuments(account.permissions))
    .map(({ permissions: _permissions, ...account }) => account);
  return NextResponse.json({ items }, { headers: { "Cache-Control": "private, no-store" } });
});
