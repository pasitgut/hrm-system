import PayrollModule from "@/components/hrm/payroll/PayrollModule";
import { requirePermission } from "@/lib/auth/dal";

export const metadata = {
  title: "เงินเดือน | HRM",
  description: "คำนวณเงินเดือนจากข้อมูลพนักงานและ OT ในระบบ พร้อมส่งออก Excel",
};

export default async function PayrollPage() {
  await requirePermission("salary_slips.view");
  const user = await requirePermission("employees.compensation.view");
  return <PayrollModule permissions={user.permissions} />;
}
