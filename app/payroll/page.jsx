import PayrollModule from "@/components/hrm/payroll/PayrollModule";
import { requirePermission } from "@/lib/auth/dal";

export const metadata = {
  title: "เงินเดือน | HRM",
  description: "ดูข้อมูลเงินเดือนในระบบและส่งออกเอกสารประกันสังคม",
};

export default async function PayrollPage() {
  const user = await requirePermission("salary_slips.view");
  return <PayrollModule permissions={user.permissions} />;
}
