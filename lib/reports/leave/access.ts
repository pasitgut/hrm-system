import { canViewCompanyLeave, canViewOwnLeaveRequests, canViewReports } from "@/lib/auth/permissions";
import type { LeaveReportDefinition } from "./options";

export class LeaveReportAccessError extends Error {
  constructor(message = "ไม่มีสิทธิ์ดูหรือส่งออกรายงานวันลา") {
    super(message);
    this.name = "LeaveReportAccessError";
  }
}

export type LeaveReportAccess = { company: boolean; ownEmployeeId: string };

export function getLeaveReportAccess(permissions: unknown, ownEmployeeId: string): LeaveReportAccess {
  if (!canViewReports(permissions)) throw new LeaveReportAccessError("ไม่มีสิทธิ์ดูรายงาน");
  const company = canViewCompanyLeave(permissions);
  if (!company && !canViewOwnLeaveRequests(permissions)) throw new LeaveReportAccessError();
  return { company, ownEmployeeId };
}

export function assertLeaveReportExportAccess(access: LeaveReportAccess, definition: LeaveReportDefinition, employeeIds?: readonly string[]) {
  if (access.company) return;
  if (definition.scope !== "individual") throw new LeaveReportAccessError("สิทธิ์วันลาของคุณส่งออกรายงานได้เฉพาะข้อมูลของตนเอง");
  if (!employeeIds || employeeIds.length !== 1 || employeeIds[0] !== access.ownEmployeeId) {
    throw new LeaveReportAccessError("สามารถส่งออกข้อมูลวันลาของตนเองเท่านั้น");
  }
}
