import PayrollModule from "@/components/hrm/payroll/PayrollModule";
import { requirePageAccess } from "@/lib/auth/dal";

export const metadata = {
  title: "สลิปเงินเดือน | HRM",
  description: "นำเข้าไฟล์ Excel เงินเดือนเพื่อสร้างและส่งออกสลิปเงินเดือน (.pdf / .xlsx) พร้อมยอดสะสมรายปี",
};

export default async function PayrollPage() {
  const user = await requirePageAccess("payroll");
  return <PayrollModule permissions={user.permissions} />;
}
