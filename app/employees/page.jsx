import EmployeeModule from "@/components/hrm/employees/EmployeeModule";
import { requirePageAccess } from "@/lib/auth/dal";

export default async function EmployeesPage() {
  await requirePageAccess("employees");
  return <EmployeeModule />;
}
