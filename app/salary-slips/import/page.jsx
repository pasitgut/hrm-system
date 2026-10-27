import SalarySlipImport from "@/components/hrm/salary-slips/SalarySlipImport";
import { requirePermission } from "@/lib/auth/dal";
import { Suspense } from "react";
export const metadata = { title: "นำเข้าสลิปเงินเดือน | HRM" };
export default async function ImportPage() {
  await requirePermission("salary_slips.view");
  const user = await requirePermission("salary_slips.import");
  return <Suspense fallback={<p role="status">กำลังโหลดหน้านำเข้า…</p>}><SalarySlipImport permissions={user.permissions} /></Suspense>;
}
