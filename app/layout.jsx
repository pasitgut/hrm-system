import "@/styles/globals.css";
import { eq } from "drizzle-orm";
import HrmShell from "@/components/hrm/HrmShell";
import { getCurrentUser } from "@/lib/auth/dal";
import { db } from "@/lib/db/client";
import { employees } from "@/lib/db/schema";

export const metadata = {
  title: "PeopleOS | ระบบงานบุคคล",
  description: "ระบบ HRM สำหรับจัดการพนักงาน OT วันลา ทรัพย์สิน การอนุมัติ และรายงาน",
};

export default async function RootLayout({ children }) {
  // Non-throwing lookup: /login is wrapped by this same root layout, so using
  // requireUser() here would redirect-loop for unauthenticated visitors.
  // proxy.ts already redirects every other unauthenticated route to /login
  // before this layout renders.
  const user = await getCurrentUser();

  let employeeName = null;
  let employeeCode = null;
  if (user) {
    const [employee] = await db
      .select({ firstName: employees.firstName, lastName: employees.lastName, code: employees.code })
      .from(employees)
      .where(eq(employees.id, user.employeeId))
      .limit(1);
    if (employee) {
      employeeName = `${employee.firstName} ${employee.lastName}`;
      employeeCode = employee.code;
    }
  }

  return (
    <html lang="th" data-scroll-behavior="smooth">
      <body>
        <HrmShell user={user} employeeName={employeeName} employeeCode={employeeCode}>
          {children}
        </HrmShell>
      </body>
    </html>
  );
}
