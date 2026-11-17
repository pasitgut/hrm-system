import { redirect } from "next/navigation";
export const metadata = { title: "สลิปเงินเดือน | HRM" };
export default function SalarySlipsPage() {
  redirect("/payroll");
}
