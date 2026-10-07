import EmployeeModule from "@/components/hrm/employees/EmployeeModule";
import { requireAnyPermission } from "@/lib/auth/dal";

export default async function EmployeesPage() {
  await requireAnyPermission(
    "employees.profile.view",
    "employees.profile.create",
    "employees.profile.update",
    "employees.profile.offboard",
    "employees.compensation.view",
    "employees.compensation.manage",
  );
  return <EmployeeModule />;
}
