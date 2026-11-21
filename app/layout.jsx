import "@/styles/globals.css";
import { eq } from "drizzle-orm";
import HrmShell from "@/components/hrm/HrmShell";
import { isSystemAdminSession, SYSTEM_ADMIN_DISPLAY_NAME } from "@/lib/auth/admin";
import { getCurrentUser, getUserAccess } from "@/lib/auth/dal";
import { classifyDatabaseError, ensureDatabaseMigrated } from "@/lib/db/auto-migrate";
import { db } from "@/lib/db/client";
import { employees } from "@/lib/db/schema";
import { getIntegrationStatus } from "@/lib/integrations/status";

export const metadata = {
  title: "HRM",
  description: "ระบบ HRM สำหรับจัดการพนักงาน OT วันลา ทรัพย์สิน การอนุมัติ และรายงาน",
};

export default async function RootLayout({ children }) {
  // Non-throwing lookup: /login is wrapped by this same root layout, so using
  // requireUser() here would redirect-loop for unauthenticated visitors.
  // proxy.ts already redirects every other unauthenticated route to /login
  // before this layout renders.
  const [integrations, dbBootStatus, sessionUser] = await Promise.all([
    Promise.resolve(getIntegrationStatus()),
    ensureDatabaseMigrated(),
    getCurrentUser(),
  ]);

  let dbStatus = dbBootStatus;
  let user = sessionUser;
  let permissions = [];
  let employeeName = null;
  let employeeCode = null;

  if (sessionUser) {
    if (isSystemAdminSession(sessionUser)) {
      const access = await getUserAccess(sessionUser.sub);
      user = { ...sessionUser, role: access?.role ?? sessionUser.role, isSystemAdmin: true };
      permissions = access?.permissions ?? [];
      employeeName = SYSTEM_ADMIN_DISPLAY_NAME;
    } else {
      try {
        const access = await getUserAccess(sessionUser.sub);
        user = { ...sessionUser, role: access?.role ?? sessionUser.role };
        permissions = access?.permissions ?? [];

        const [employee] = await db
          .select({ firstName: employees.firstName, lastName: employees.lastName, code: employees.code })
          .from(employees)
          .where(eq(employees.id, user.employeeId))
          .limit(1);
        if (employee) {
          employeeName = `${employee.firstName} ${employee.lastName}`;
          employeeCode = employee.code;
        }
      } catch (error) {
        dbStatus = classifyDatabaseError(error, process.env.DATABASE_URL);
        console.error("RootLayout DB query failed:", dbStatus.reason);
      }
    }
  }

  return (
    <html lang="th" data-scroll-behavior="smooth">
      <body>
        <HrmShell
          user={user}
          permissions={permissions}
          employeeName={employeeName}
          employeeCode={employeeCode}
          integrations={integrations}
          dbStatus={dbStatus}
        >
          {children}
        </HrmShell>
      </body>
    </html>
  );
}
