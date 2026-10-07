import PayrollModule from "@/components/hrm/payroll/PayrollModule";
import { requireAnyPermission } from "@/lib/auth/dal";

export const metadata = {
  title: "เงินเดือน | HRM",
  description: "ตัวอย่างหน้าจัดการรอบเงินเดือน",
};

export default async function PayrollPage() {
  await requireAnyPermission("employees.compensation.view", "employees.compensation.manage");
  return <PayrollModule />;
}
