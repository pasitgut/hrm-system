import { asc, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { requireApiPermission, withApiAuth } from "@/lib/auth/dal";
import { db } from "@/lib/db/client";
import { employees, users } from "@/lib/db/schema";

export const GET = withApiAuth(async (request: NextRequest) => {
  await requireApiPermission(request, "users.permissions.manage");
  const items = await db
    .select({
      id: users.id,
      employeeId: employees.id,
      employeeCode: employees.code,
      firstName: employees.firstName,
      lastName: employees.lastName,
      email: users.email,
      permissions: users.permissions,
      isActive: users.isActive,
    })
    .from(users)
    .innerJoin(employees, eq(users.employeeId, employees.id))
    .where(eq(users.isActive, true))
    .orderBy(asc(employees.firstName), asc(employees.lastName));

  return NextResponse.json({ items });
});
