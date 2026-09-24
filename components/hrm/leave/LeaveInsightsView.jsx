"use client";

import { LEAVE_TYPE_PRESENTATION } from "@/components/hrm/leave/leaveTypes";
import { formatDays } from "@/components/hrm/leave/leaveStatus";
import { cn } from "@/lib/utils";

const REQUEST_STATUSES = [
  { code: "pending", label: "รออนุมัติ", dotClass: "bg-status-warning", textClass: "text-status-warning" },
  { code: "approved", label: "อนุมัติแล้ว", dotClass: "bg-status-success", textClass: "text-status-success" },
  { code: "rejected", label: "ไม่อนุมัติ", dotClass: "bg-status-danger", textClass: "text-status-danger" },
  { code: "cancelled", label: "ยกเลิก", dotClass: "bg-muted-foreground", textClass: "text-muted-foreground" },
];

function dateKey(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function daysInMonthForRequest(item, year, month) {
  const monthStart = dateKey(year, month, 1);
  const monthEnd = dateKey(year, month, new Date(year, month + 1, 0).getDate());
  const start = item.startOn > monthStart ? item.startOn : monthStart;
  const end = item.endOn < monthEnd ? item.endOn : monthEnd;
  if (start > end) return 0;
  if (item.startOn === item.endOn && item.session !== "full") return 0.5;

  const startMs = new Date(`${start}T00:00:00Z`).getTime();
  const endMs = new Date(`${end}T00:00:00Z`).getTime();
  return Math.round((endMs - startMs) / 86_400_000) + 1;
}

function overlapsYear(item, year) {
  return item.startOn <= `${year}-12-31` && item.endOn >= `${year}-01-01`;
}

function monthLabel(year, month) {
  return new Intl.DateTimeFormat("th-TH", { month: "short" }).format(new Date(year, month, 1));
}

function MonthlyLeaveChart({ year, items }) {
  const months = Array.from({ length: 12 }, (_, month) => {
    const types = LEAVE_TYPE_PRESENTATION.map((type) => ({
      ...type,
      days: items
        .filter((item) => item.leaveTypeCode === type.code)
        .reduce((total, item) => total + daysInMonthForRequest(item, year, month), 0),
    }));
    return { label: monthLabel(year, month), types, total: types.reduce((total, type) => total + type.days, 0) };
  });
  const maxDays = Math.max(1, ...months.map((month) => month.total));

  return (
    <section className="min-w-0 rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5" aria-labelledby="leave-monthly-heading">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="leave-monthly-heading" className="text-base font-semibold leading-6 text-foreground">วันลารายเดือนตามประเภท</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">วันที่อนุมัติแล้วและรออนุมัติ · {year + 543}</p>
        </div>
        <span className="text-xs text-muted-foreground">12 เดือน</span>
      </div>
      <div className="mt-5 overflow-x-auto pb-1">
        <div className="min-w-[520px]">
          <div role="group" aria-label="กราฟจำนวนวันลาในแต่ละเดือน" className="grid h-36 grid-cols-12 gap-2">
            {months.map((month) => (
              <div key={month.label} className="flex min-w-0 flex-col items-center justify-end gap-2">
                <div
                  role="img"
                  aria-label={`${month.label}: ${formatDays(month.total)}`}
                  title={`${month.label}: ${formatDays(month.total)}`}
                  className="flex h-full w-full flex-col-reverse justify-start overflow-hidden rounded-t-md bg-muted/60"
                >
                  {month.types.map((type) => (
                    <span
                      key={type.code}
                      className={cn("w-full flex-none", type.barClass)}
                      style={{ height: `${(type.days / maxDays) * 100}%` }}
                    />
                  ))}
                </div>
                <span className="text-[10px] leading-4 text-muted-foreground">{month.label}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
            {LEAVE_TYPE_PRESENTATION.map((type) => (
              <span key={type.code} className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                <span className={cn("size-2.5 rounded-sm", type.dotClass)} aria-hidden="true" />{type.name}
              </span>
            ))}
          </div>
        </div>
      </div>
      {items.length === 0 ? <p className="mt-2 text-xs leading-5 text-muted-foreground">ยังไม่มีข้อมูลการลาในปีนี้</p> : null}
    </section>
  );
}

function RequestStatusSummary({ items }) {
  const counts = REQUEST_STATUSES.map((status) => ({
    ...status,
    count: items.filter((item) => item.statusCode === status.code).length,
  }));

  return (
    <section className="min-w-0 rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5" aria-labelledby="leave-status-heading">
      <h2 id="leave-status-heading" className="text-base font-semibold leading-6 text-foreground">สถานะคำขอ</h2>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">สรุปคำขอที่เริ่มต้นในปีนี้</p>
      <div className="mt-4 divide-y divide-border">
        {counts.map((status) => (
          <div key={status.code} className="flex items-center justify-between gap-3 py-3">
            <span className="inline-flex items-center gap-2 text-xs text-foreground">
              <span className={cn("size-2.5 rounded-full", status.dotClass)} aria-hidden="true" />{status.label}
            </span>
            <strong className={cn("text-sm font-semibold", status.textClass)}>{status.count} <span className="text-xs font-normal">คำขอ</span></strong>
          </div>
        ))}
      </div>
    </section>
  );
}

export function LeaveInsightsView({ items = [], isTeamView = false }) {
  const year = new Date().getFullYear();
  const yearItems = items.filter((item) => item.startOn?.slice(0, 4) === String(year));
  const overlappingYearItems = items.filter((item) => overlapsYear(item, year));
  const countableItems = overlappingYearItems.filter((item) => item.statusCode === "approved" || item.statusCode === "pending");

  return (
    <div className={cn("grid min-w-0 gap-4", !isTeamView && "xl:grid-cols-2")}>
      <MonthlyLeaveChart year={year} items={countableItems} />
      {!isTeamView ? <RequestStatusSummary items={yearItems} /> : null}
    </div>
  );
}

export default LeaveInsightsView;
