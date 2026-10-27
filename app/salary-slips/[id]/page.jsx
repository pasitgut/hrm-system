import SalarySlipDetail from "@/components/hrm/salary-slips/SalarySlipDetail";
import { requirePermission } from "@/lib/auth/dal";
export const metadata = { title: "รายละเอียดสลิปเงินเดือน | HRM" };
export default async function DetailPage({ params }) {
  const user = await requirePermission("salary_slips.view");
  const { id } = await params;
  return <SalarySlipDetail id={id} permissions={user.permissions} />;
}
