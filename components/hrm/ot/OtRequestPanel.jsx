"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { RiCheckLine, RiCloseLine } from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/badge";
import { canAccessPage } from "@/lib/auth/page-access";
import { canApproveOtData } from "@/lib/auth/rolePermissionAccess";
import { overtimeTypeLabel, statusColor } from "@/components/hrm/ot/otStatus";
import { cn } from "@/lib/utils";

const FILTERS = [
  { code: "pending", label: "รอจัดการ" },
  { code: "approved", label: "อนุมัติแล้ว" },
  { code: "rejected", label: "ไม่อนุมัติ" },
];

function OtRequest({ item, canApprove, busy, onDecision }) {
  return (
    <article className="rounded-lg border border-border p-3 sm:p-4">
      <div className="flex items-start gap-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-xs font-semibold text-primary" aria-hidden="true">
          {item.employeeName?.trim().slice(0, 2) || "พน"}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <strong className="text-sm font-semibold text-foreground">{item.employeeName}</strong>
            <Chip variant="caption" color={statusColor(item.statusCode)}>{item.statusName}</Chip>
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{overtimeTypeLabel(item.overtimeType)} · {item.detail}</p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{item.reason || "ไม่ได้ระบุรายละเอียดงาน"}</p>
        </div>
      </div>
      {canApprove && item.statusCode === "pending" ? (
        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3">
          <Button disabled={busy} leadingIcon={RiCheckLine} onClick={() => onDecision(item, "approved")}>
            {busy ? "กำลังบันทึก..." : "อนุมัติ"}
          </Button>
          <Button variant="outline" disabled={busy} leadingIcon={RiCloseLine} onClick={() => onDecision(item, "rejected")}>
            ไม่อนุมัติ
          </Button>
        </div>
      ) : null}
    </article>
  );
}

export function OtRequestPanel({
  refreshKey = 0,
  role = undefined,
  permissions = undefined,
  title = undefined,
  description = undefined,
  canViewCompany = false,
  onUpdated = () => {},
}) {
  const isApprover = canApproveOtData({ role, permissions });
  const canOpenApprovalsPage = isApprover && (!Array.isArray(permissions) || canAccessPage(permissions, "approvals"));
  const [items, setItems] = useState([]);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    fetch("/api/approvals?type=ot")
      .then((response) => {
        if (!response.ok) throw new Error("failed to load");
        return response.json();
      })
      .then((payload) => {
        if (!cancelled) setItems(payload.items || []);
      })
      .catch(() => {
        if (!cancelled) setError("ไม่สามารถโหลดรายการคำขอ OT ได้ กรุณาลองใหม่");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [refreshKey]);

  const visibleItems = useMemo(() => {
    const eligible = isApprover
      ? items.filter((item) => item.statusCode === statusFilter)
      : items.filter((item) => item.statusCode !== "cancelled");
    return eligible.slice(0, 4);
  }, [isApprover, items, statusFilter]);

  async function decide(item, decision) {
    setBusyId(item.id);
    setError("");
    try {
      const response = await fetch(`/api/ot/${item.id}/decision`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload.error || "ไม่สามารถบันทึกผลการพิจารณาได้ กรุณาลองใหม่");
        return;
      }
      setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, statusCode: payload.item.statusCode, statusName: payload.item.statusName } : entry));
      onUpdated(payload.item);
    } catch {
      setError("ไม่สามารถเชื่อมต่อกับระบบได้ กรุณาลองใหม่");
    } finally {
      setBusyId(null);
    }
  }

  const heading = title || (isApprover ? "คำขอ OT" : "คำขอ OT ล่าสุด");
  const subheading = description || (
    isApprover
      ? "ตรวจสอบและบันทึกผลคำขอจากพนักงาน"
      : canViewCompany
        ? "ติดตามรายการคำขอ OT ล่าสุดของบริษัท"
        : "ติดตามสถานะคำขอและผลการพิจารณา"
  );
  const count = isApprover ? items.filter((item) => item.statusCode === statusFilter).length : items.filter((item) => item.statusCode !== "cancelled").length;
  const emptyMessage = isApprover
    ? { pending: "ไม่มีคำขอ OT ที่รอจัดการ", approved: "ยังไม่มีคำขอ OT ที่อนุมัติแล้ว", rejected: "ยังไม่มีคำขอ OT ที่ไม่อนุมัติ" }[statusFilter]
    : "ยังไม่มีประวัติคำขอ OT";

  return (
    <section className="min-w-0 overflow-hidden rounded-xl border border-border bg-card shadow-sm" aria-labelledby="ot-request-panel-heading">
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="ot-request-panel-heading" className="text-base font-semibold leading-6 text-foreground sm:text-lg">{heading}</h2>
            <Chip variant="caption" color={isApprover && statusFilter === "pending" && count ? "orange" : "gray"}>{count} รายการ</Chip>
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {subheading}
          </p>
        </div>
        {canOpenApprovalsPage ? <Button asChild variant="outline" className="min-h-10"><Link href="/approvals">ดูทั้งหมด</Link></Button> : null}
      </div>

      {isApprover ? (
        <div role="group" aria-label="กรองสถานะคำขอ OT" className="flex flex-wrap gap-2 border-b border-border px-4 py-3 sm:px-5">
          {FILTERS.map((filter) => {
            const selected = statusFilter === filter.code;
            const filterCount = items.filter((item) => item.statusCode === filter.code).length;
            return (
              <Button
                type="button"
                aria-pressed={selected}
                key={filter.code}
                onClick={() => setStatusFilter(filter.code)}
                variant={selected ? "default" : "outline"}
                className={cn(
                  "min-h-10 h-auto rounded-full px-3 py-2 text-xs font-medium",
                  selected ? "border-primary" : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {filter.label}
                <span className={cn("rounded-full px-1.5 py-0.5 text-[11px]", selected ? "bg-background/15 text-current" : "bg-muted text-muted-foreground")}>{filterCount}</span>
              </Button>
            );
          })}
        </div>
      ) : null}

      <div className="space-y-3 p-3 sm:p-4">
        {error ? <p role="alert" className="rounded-md bg-status-danger/10 px-3 py-2 text-xs leading-5 text-status-danger">{error}</p> : null}
        {visibleItems.map((item) => (
          <OtRequest key={item.id} item={item} canApprove={isApprover} busy={busyId === item.id} onDecision={decide} />
        ))}
        {loading ? <p className="py-8 text-center text-xs text-muted-foreground">กำลังโหลดคำขอ OT...</p> : null}
        {!loading && visibleItems.length === 0 ? (
          <p className="py-10 text-center text-xs leading-5 text-muted-foreground">{emptyMessage || "ไม่มีคำขอ OT ในสถานะนี้"}</p>
        ) : null}
      </div>
    </section>
  );
}

export default OtRequestPanel;
