"use client";

import Link from "next/link";
import {
  RiAlertLine,
  RiCheckLine,
  RiEditLine,
  RiErrorWarningLine,
  RiExternalLinkLine,
  RiFilePdf2Line,
} from "@remixicon/react";
import { HrmDialog } from "@/components/hrm/HrmDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatBaht, formatHours, formatThaiDate } from "./payrollFormat";

const SESSION_LABELS = {
  full: "เต็มวัน",
  am: "ครึ่งวันเช้า",
  pm: "ครึ่งวันบ่าย",
};

export function PayrollRowDetailDialog({
  row,
  workflowStatus = "review",
  canVerify = false,
  canExport = false,
  busy = false,
  onClose,
  onToggleVerify,
  onExportSingleSlip,
  onEditOverride,
}) {
  if (!row) return null;

  const blockingIssues = (row.reviewIssues ?? []).filter((issue) => issue.severity === "blocking");
  const warningIssues = (row.reviewIssues ?? []).filter((issue) => issue.severity === "warning");

  return (
    <HrmDialog
      open={Boolean(row)}
      onClose={onClose}
      size="lg"
      title={`${row.name} (${row.code})`}
      description={`${row.department || "ไม่ระบุแผนก"} · ชั่วโมงทำงาน ${row.workHoursPerDay} ชม./วัน · บัญชี ${row.bankName || "—"} ${row.bankAccount || "—"}`}
      footer={(
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="ghost" size="sm" trailingIcon={RiExternalLinkLine}>
              <Link href="/employees">แก้ไขข้อมูลพนักงาน</Link>
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canVerify && workflowStatus !== "locked" && workflowStatus !== "paid" ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                leadingIcon={RiEditLine}
                disabled={busy}
                onClick={() => onEditOverride?.(row)}
              >
                แก้ไขยอดรายงวด
              </Button>
            ) : null}
            {canExport && row.netPay != null ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                leadingIcon={RiFilePdf2Line}
                disabled={busy}
                onClick={() => onExportSingleSlip?.(row, "pdf")}
              >
                ออกสลิป PDF
              </Button>
            ) : null}
            {workflowStatus === "review" && canVerify && !row.hasBlockingIssue ? (
              <Button
                type="button"
                size="sm"
                variant={row.isVerified ? "outline" : "default"}
                leadingIcon={RiCheckLine}
                disabled={busy}
                onClick={() => onToggleVerify?.(row.employeeId)}
              >
                {row.isVerified ? "ยกเลิกการยืนยัน" : "ยืนยันตรวจสอบแล้ว"}
              </Button>
            ) : null}
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              ปิด
            </Button>
          </div>
        </div>
      )}
    >
      <div className="space-y-4 py-2">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>วันเริ่มงาน: {formatThaiDate(row.startDate)}</span>
          {row.endDate ? <span>· วันสิ้นสุดงาน: {formatThaiDate(row.endDate)}</span> : null}
          {row.isNewHire ? <Badge color="info" variant="caption">เข้างานใหม่ระหว่างงวด</Badge> : null}
          {row.isOffboarded ? <Badge color="neutral" variant="caption">พ้นสภาพระหว่างงวด</Badge> : null}
          {row.doNotPrintPayslip ? <Badge color="neutral" variant="caption">ตั้งค่างดพิมพ์สลิป</Badge> : null}
        </div>

        {blockingIssues.length > 0 ? (
          <div role="alert" className="space-y-1 rounded-md border border-status-danger/30 bg-status-danger/10 p-3 text-xs text-status-danger">
            <p className="flex items-center gap-1.5 font-semibold">
              <RiErrorWarningLine className="size-4 shrink-0" aria-hidden="true" />
              ข้อมูลไม่ครบถ้วน (ต้องแก้ไขก่อนส่งอนุมัติ)
            </p>
            <ul className="list-disc space-y-0.5 pl-5">
              {blockingIssues.map((issue, index) => (
                <li key={`${issue.code}-${index}`}>{issue.message}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {warningIssues.length > 0 ? (
          <div className="space-y-1 rounded-md border border-status-warning/30 bg-status-warning/10 p-3 text-xs text-status-warning">
            <p className="flex items-center justify-between gap-2 font-semibold">
              <span className="flex items-center gap-1.5">
                <RiAlertLine className="size-4 shrink-0" aria-hidden="true" />
                รายการที่ควรตรวจสอบ
              </span>
              {row.isVerified ? (
                <Badge color="success" variant="caption">ยืนยันแล้ว</Badge>
              ) : null}
            </p>
            <ul className="list-disc space-y-0.5 pl-5">
              {warningIssues.map((issue, index) => (
                <li key={`${issue.code}-${index}`}>{issue.message}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-md border border-border bg-muted/20 p-3.5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">รายได้ (Incomes)</h3>
            <dl className="mt-2.5 space-y-1.5 text-sm">
              {row.incomes.length > 0 ? (
                row.incomes.map((item, index) => (
                  <div key={`${item.label}-${index}`} className="flex items-center justify-between gap-2">
                    <dt className="text-foreground">{item.label}</dt>
                    <dd className="font-medium tabular-nums">{formatBaht(item.amount)}</dd>
                  </div>
                ))
              ) : (
                <p className="text-xs text-muted-foreground">ไม่มีรายการรายได้</p>
              )}
              <div className="border-t border-border pt-2 text-xs text-muted-foreground">
                <div className="flex items-center justify-between">
                  <span>OT วันธรรมดา / วันหยุด (อนุมัติ)</span>
                  <span className="tabular-nums">
                    {formatHours(row.weekdayOtHours)} / {formatHours(row.holidayOtHours)} ชม.
                  </span>
                </div>
                {row.pendingOtRequests > 0 ? (
                  <div className="mt-1 flex items-center justify-between text-status-warning">
                    <span>OT รออนุมัติ ({row.pendingOtRequests} รายการ)</span>
                    <span className="tabular-nums">{formatHours(row.pendingOtHours)} ชม.</span>
                  </div>
                ) : null}
              </div>
              <div className="flex items-center justify-between border-t border-border pt-2 font-semibold text-foreground">
                <dt>รวมเงินได้</dt>
                <dd className="tabular-nums">{formatBaht(row.incomeTotal)}</dd>
              </div>
            </dl>
          </div>

          <div className="rounded-md border border-border bg-muted/20 p-3.5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">รายการหัก (Deductions)</h3>
            <dl className="mt-2.5 space-y-1.5 text-sm">
              {row.deductions.length > 0 ? (
                row.deductions.map((item, index) => (
                  <div key={`${item.label}-${index}`} className="flex items-center justify-between gap-2">
                    <dt className="text-foreground">{item.label}</dt>
                    <dd className="font-medium tabular-nums text-status-danger">{formatBaht(item.amount)}</dd>
                  </div>
                ))
              ) : (
                <p className="text-xs text-muted-foreground">ไม่มีรายการหักประจำ</p>
              )}
              {row.employerSocialSecurity > 0 ? (
                <div className="flex items-center justify-between border-t border-border pt-2 text-xs text-muted-foreground">
                  <dt>นายจ้างสมทบประกันสังคม (อ้างอิง)</dt>
                  <dd className="tabular-nums">{formatBaht(row.employerSocialSecurity)}</dd>
                </div>
              ) : null}
              <div className="flex items-center justify-between border-t border-border pt-2 font-semibold text-foreground">
                <dt>รวมรายหัก</dt>
                <dd className="tabular-nums text-status-danger">{formatBaht(row.deductionTotal)}</dd>
              </div>
            </dl>
          </div>
        </div>

        {row.approvedLeaves?.length > 0 ? (
          <div className="rounded-md border border-border bg-muted/20 p-3.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                วันลาที่อนุมัติในงวด ({row.approvedLeaveRequests} รายการ)
              </h3>
              <Link href="/leave" className="text-xs text-primary hover:underline">
                ดูหน้าวันลา
              </Link>
            </div>
            <ul className="mt-2 space-y-1 text-xs text-foreground">
              {row.approvedLeaves.map((leave, index) => (
                <li key={`${leave.type}-${leave.startOn}-${index}`} className="flex flex-wrap items-center justify-between gap-2">
                  <span>{leave.type}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {formatThaiDate(leave.startOn)}
                    {leave.endOn !== leave.startOn ? ` – ${formatThaiDate(leave.endOn)}` : ""}
                    {" · "}
                    {SESSION_LABELS[leave.session] ?? leave.session}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="flex items-center justify-between rounded-md border border-border bg-muted/40 px-4 py-3">
          <span className="text-sm font-semibold text-foreground">ยอดจ่ายสุทธิ (Net Pay)</span>
          <span className="text-lg font-semibold tabular-nums text-foreground">{formatBaht(row.netPay)}</span>
        </div>
      </div>
    </HrmDialog>
  );
}
