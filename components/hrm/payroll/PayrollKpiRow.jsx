"use client";

import {
  RiAlertLine,
  RiBankLine,
  RiGovernmentLine,
  RiMoneyDollarCircleLine,
  RiTeamLine,
} from "@remixicon/react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatCompactBaht, formatThaiDate } from "./payrollFormat";

function KpiIcon({ icon: Icon, tone }) {
  return (
    <span
      className={cn(
        "grid size-7 shrink-0 place-items-center rounded-md",
        tone === "info" && "bg-status-info/10 text-status-info",
        tone === "success" && "bg-status-success/10 text-status-success",
        tone === "warning" && "bg-status-warning/10 text-status-warning",
        tone === "danger" && "bg-status-danger/10 text-status-danger",
        tone === "neutral" && "bg-muted text-muted-foreground",
      )}
    >
      <Icon className="size-4" aria-hidden="true" />
    </span>
  );
}

export function PayrollKpiRow({ payroll, loading = false, onlyNeedsReview = false, onToggleReviewFilter }) {
  const summary = payroll?.summary;
  const employeeCount = summary?.employeeCount ?? 0;
  const newHireCount = summary?.newHireCount ?? 0;
  const offboardedCount = summary?.offboardedCount ?? 0;

  const grossSubtext = summary?.grossChangePercent != null
    ? `${summary.grossChangePercent >= 0 ? "+" : ""}${summary.grossChangePercent}% จากเดือนก่อน`
    : "ไม่มีข้อมูลงวดก่อน";

  const reviewCount = summary?.reviewCount ?? 0;
  const blockingCount = summary?.blockingCount ?? 0;
  const reviewSubtext = blockingCount > 0
    ? `ข้อมูลไม่ครบ ${blockingCount} รายการ`
    : reviewCount > 0
      ? "ต้องยืนยันก่อนส่งอนุมัติ"
      : "ตรวจสอบครบแล้ว";

  return (
    <section aria-label="สรุปตัวเลขสำคัญประจำงวด" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <Card className="p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground">พนักงานในงวด</p>
          <KpiIcon icon={RiTeamLine} tone="info" />
        </div>
        <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-foreground">
          {loading ? "—" : employeeCount.toLocaleString("th-TH")}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {loading ? "กำลังคำนวณ…" : `เข้าใหม่ ${newHireCount} · ออก ${offboardedCount}`}
        </p>
      </Card>

      <Card className="p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground">รวมเงินได้ (Gross)</p>
          <KpiIcon icon={RiMoneyDollarCircleLine} tone="success" />
        </div>
        <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-foreground">
          {loading ? "—" : formatCompactBaht(summary?.grossTotal ?? 0)}
        </p>
        <p
          className={cn(
            "mt-1 text-xs",
            summary?.grossChangePercent != null && summary.grossChangePercent > 0
              ? "text-status-success"
              : summary?.grossChangePercent != null && summary.grossChangePercent < 0
                ? "text-status-danger"
                : "text-muted-foreground",
          )}
        >
          {loading ? "…" : grossSubtext}
        </p>
      </Card>

      <Card className="p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground">ภาษี + ประกันสังคม</p>
          <KpiIcon icon={RiGovernmentLine} tone="neutral" />
        </div>
        <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-foreground">
          {loading ? "—" : formatCompactBaht(summary?.taxAndSsoTotal ?? 0)}
        </p>
        <p className="mt-1 text-xs text-muted-foreground tabular-nums">
          {loading ? "…" : `นายจ้างสมทบ ปกส. ${formatCompactBaht(summary?.employerSocialSecurityTotal ?? 0)}`}
        </p>
      </Card>

      <Card className="p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground">จ่ายสุทธิ (Net)</p>
          <KpiIcon icon={RiBankLine} tone="info" />
        </div>
        <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-foreground">
          {loading ? "—" : formatCompactBaht(summary?.netTotal ?? 0)}
        </p>
        <p className="mt-1 text-xs text-muted-foreground tabular-nums">
          {loading ? "…" : `โอน ${formatThaiDate(payroll?.payDate)}`}
        </p>
      </Card>

      <button
        type="button"
        onClick={onToggleReviewFilter}
        aria-pressed={onlyNeedsReview}
        className={cn(
          "rounded-lg border border-border bg-card p-4 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          onlyNeedsReview && "border-primary ring-2 ring-primary/30",
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground">รายการต้องตรวจสอบ</p>
          <KpiIcon
            icon={RiAlertLine}
            tone={blockingCount > 0 ? "danger" : reviewCount > 0 ? "warning" : "success"}
          />
        </div>
        <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-foreground">
          {loading ? "—" : reviewCount.toLocaleString("th-TH")}
        </p>
        <p
          className={cn(
            "mt-1 text-xs",
            blockingCount > 0
              ? "text-status-danger"
              : reviewCount > 0
                ? "text-status-warning"
                : "text-status-success",
          )}
        >
          {loading ? "…" : reviewSubtext}
        </p>
      </button>
    </section>
  );
}
