import SalarySlipsModule from "@/components/hrm/salary-slips/SalarySlipsModule";
import { requirePermission } from "@/lib/auth/dal";
export const metadata = { title: "สลิปเงินเดือน | HRM" };
export default async function SalarySlipsPage() {
  const user = await requirePermission("salary_slips.view");
  return <SalarySlipsModule permissions={user.permissions} />;
}
