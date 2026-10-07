"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/badge";
import { formatDateRange, formatDays, statusColor } from "@/components/hrm/leave/leaveStatus";
import { cn } from "@/lib/utils";
import { canApproveLeave } from "@/lib/auth/permissions";
const APPROVAL_FILTERS = [
  { code: "pending", label: "รออนุมัติ" },
  { code: "approved", label: "อนุมัติแล้ว" },
  { code: "rejected", label: "ไม่อนุมัติ" },
];

function RequestItem({ item, canApprove, busy, onDecision }) {
  return (
    <article className="rounded-lg border border-border p-3 sm:p-4">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary" aria-hidden="true">
          {item.employeeName?.trim().slice(0, 2) || "พน"}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <strong className="text-sm font-semibold text-foreground">{item.employeeName}</strong>
            <Chip variant="caption" color={statusColor(item.statusCode)}>{item.statusName}</Chip>
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {item.leaveTypeName} · {formatDateRange(item.startOn, item.endOn)} · {formatDays(item.days)}
          </p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{item.reason || "ไม่ได้ระบุเหตุผล"}</p>
        </div>
      </div>
      {canApprove && item.statusCode === "pending" ? (
        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3">
          <Button disabled={busy} onClick={() => onDecision(item, "approved")}>
            {busy ? "กำลังบันทึก..." : "อนุมัติ"}
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => onDecision(item, "rejected")}>
            ไม่อนุมัติ
          </Button>
        </div>
      ) : null}
    </article>
  );
}

export function LeaveRequestPanel({ items = [], loading = false, permissions = [], onUpdated = () => {} }) {
  const canApprove = canApproveLeave(permissions);
  const [statusFilter, setStatusFilter] = useState("pending");
  const visibleItems = (canApprove
    ? items.filter((item) => item.statusCode === statusFilter)
    : items.filter((item) => item.statusCode !== "cancelled")).slice(0, 4);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");

  async function decide(item, decision) {
    setBusyId(item.id);
    setError("");
    try {
      const response = await fetch(`/api/leave/${item.id}/decision`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload.error || "ไม่สามารถบันทึกผลการพิจารณาได้");
        return;
      }
      onUpdated(payload.item);
    } catch {
      setError("ไม่สามารถเชื่อมต่อกับระบบได้ กรุณาลองใหม่");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="min-w-0 overflow-hidden rounded-xl border border-border bg-card shadow-sm" aria-labelledby="leave-request-panel-heading">
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="leave-request-panel-heading" className="text-base font-semibold leading-6 text-foreground sm:text-lg">
              {canApprove ? "คำขอลา" : "คำขอลาล่าสุด"}
            </h2>
            <Chip variant="caption" color={canApprove && statusFilter === "pending" && items.some((item) => item.statusCode === "pending") ? "orange" : "gray"}>
              {canApprove ? `${items.filter((item) => item.statusCode === statusFilter).length} รายการ` : `${items.length} รายการ`}
            </Chip>
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {canApprove ? "ตรวจสอบคำขอของพนักงานในทีม" : "ติดตามสถานะคำขอและประวัติการยื่นล่าสุด"}
          </p>
        </div>
        {canApprove ? (
          <Button asChild size="sm" variant="outline">
            <Link href="/approvals">ดูทั้งหมด</Link>
          </Button>
        ) : null}
      </div>
      {canApprove ? (
        <div role="group" aria-label="กรองสถานะคำขอลา" className="flex flex-wrap gap-2 border-b border-border px-4 py-3 sm:px-5">
          {APPROVAL_FILTERS.map((filter) => {
            const selected = statusFilter === filter.code;
            const count = items.filter((item) => item.statusCode === filter.code).length;
            return (
              <button
                type="button"
                aria-pressed={selected}
                key={filter.code}
                onClick={() => setStatusFilter(filter.code)}
                className={cn(
                  "inline-flex min-h-10 items-center gap-2 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {filter.label}
                <span className={cn("rounded-full px-1.5 py-0.5 text-[11px]", selected ? "bg-background/15 text-current" : "bg-muted text-muted-foreground")}>{count}</span>
              </button>
            );
          })}
        </div>
      ) : null}
      <div className="space-y-3 p-3 sm:p-4">
        {error ? <p role="alert" className="rounded-md bg-status-danger/10 px-3 py-2 text-xs leading-5 text-status-danger">{error}</p> : null}
        {visibleItems.map((item) => (
          <RequestItem
            key={item.id}
            item={item}
            canApprove={canApprove}
            busy={busyId === item.id}
            onDecision={decide}
          />
        ))}
        {loading ? <p className="py-8 text-center text-xs text-muted-foreground">กำลังโหลดคำขอลา...</p> : null}
        {!loading && visibleItems.length === 0 ? (
          <p className="py-10 text-center text-xs leading-5 text-muted-foreground">
            {canApprove
              ? statusFilter === "pending"
                ? "ไม่มีคำขอที่รออนุมัติ"
                : statusFilter === "approved"
                  ? "ยังไม่มีคำขอที่อนุมัติแล้ว"
                  : "ยังไม่มีคำขอที่ไม่อนุมัติ"
              : "ยังไม่มีประวัติคำขอลา"}
          </p>
        ) : null}
      </div>
    </section>
  );
}

export default LeaveRequestPanel;
