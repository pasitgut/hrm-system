import { canViewCompanyOt, canViewOwnOtRequests, canViewReports } from "@/lib/auth/permissions";
import type { OtReportDefinition } from "./options";

export class OtReportAccessError extends Error {
  constructor(message = "ไม่มีสิทธิ์ดูหรือส่งออกรายงาน OT") {
    super(message);
    this.name = "OtReportAccessError";
  }
}

export type OtReportAccess = { company: boolean; ownEmployeeId: string };

export function getOtReportAccess(permissions: unknown, ownEmployeeId: string): OtReportAccess {
  if (!canViewReports(permissions)) throw new OtReportAccessError("ไม่มีสิทธิ์ดูรายงาน");
  const company = canViewCompanyOt(permissions);
  if (!company && !canViewOwnOtRequests(permissions)) throw new OtReportAccessError();
  return { company, ownEmployeeId };
}

export function assertOtReportExportAccess(
  access: OtReportAccess,
  definition: OtReportDefinition,
  employeeIds?: readonly string[],
) {
  if (access.company) return;
  if (definition.scope !== "individual") throw new OtReportAccessError("สิทธิ์ OT ของคุณส่งออกรายงานได้เฉพาะข้อมูลของตนเอง");
  if (!employeeIds || employeeIds.length !== 1 || employeeIds[0] !== access.ownEmployeeId) {
    throw new OtReportAccessError("สามารถส่งออกข้อมูล OT ของตนเองเท่านั้น");
  }
}
