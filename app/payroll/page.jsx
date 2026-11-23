import PayrollModule from "@/components/hrm/payroll/PayrollModule";
import { requirePageAccess } from "@/lib/auth/dal";

export const metadata = {
  title: "เงินเดือน | HRM",
  description: "คำนวณเงินเดือน ตรวจสอบและอนุมัติงวดเงินเดือน พร้อมออกสลิปเงินเดือนที่เชื่อมโยงกับระบบ HRM",
};

export default async function PayrollPage() {
  const user = await requirePageAccess("payroll");
  return <PayrollModule permissions={user.permissions} />;
}
