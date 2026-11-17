import { redirect } from "next/navigation";
export const metadata = { title: "นำเข้าสลิปเงินเดือน | HRM" };
export default function ImportPage() {
  redirect("/payroll");
}
