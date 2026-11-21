import PayrollModule from "@/components/hrm/payroll/PayrollModule";
import { requirePermission } from "@/lib/auth/dal";

export const metadata = {
  title: "สลิปเงินเดือน | HRM",
  description: "นำเข้าไฟล์ Excel เงินเดือนเพื่อสร้างและส่งออกสลิปเงินเดือน (.pdf / .xlsx) พร้อมยอดสะสมรายปี",
};

export default async function PayrollPage() {
  await requirePermission("salary_slips.view");
  const user = await requirePermission("employees.compensation.view");
  return <PayrollModule permissions={user.permissions} />;
}
