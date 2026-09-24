"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/badge";
import { useHrmRole } from "@/components/hrm/HrmShell";
import { HrmDialog } from "@/components/hrm/HrmDialog";
import { formatDateRange, formatDays, LEAVE_STATUS_TABS, statusColor } from "@/components/hrm/leave/leaveStatus";
import { cn } from "@/lib/utils";

function StatusTabs({ selected, counts, onChange }) {
  return (
    <div className="flex flex-wrap gap-2" role="tablist" aria-label="กรองสถานะการลา">
      {LEAVE_STATUS_TABS.map((tab) => {
        const isSelected = selected === tab.key;
        return (
          <button
            type="button"
            role="tab"
            aria-selected={isSelected}
            key={tab.key}
            onClick={() => onChange(tab.key)}
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-medium leading-5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isSelected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {tab.label}
            <span className={cn("rounded-full px-1.5 py-0.5 text-xs font-medium leading-4", isSelected ? "bg-card/20 text-primary-foreground" : "bg-muted text-muted-foreground")}>
              {counts[tab.key] ?? 0}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function StatusChip({ item }) {
  const chip = <Chip variant="caption" color={statusColor(item.statusCode)}>{item.statusName}</Chip>;
  if (item.statusCode !== "pending") return chip;
  return (
    <Link href="/approvals" className="inline-flex focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="ไปที่หน้าอนุมัติ">
      {chip}
    </Link>
  );
}

function RowActions({ item, canManage, onEdit, onCancel }) {
  if (!canManage || item.statusCode !== "pending") return null;
  return (
    <div className="flex justify-end gap-2">
      <Button size="xs" variant="secondary" onClick={() => onEdit(item)}>แก้ไข</Button>
      <Button size="xs" variant="danger" onClick={() => onCancel(item)}>ยกเลิก</Button>
    </div>
  );
}

function LeaveRow({ item, showEmployeeColumn, canManage, onEdit, onCancel }) {
  return (
    <tr className="border-b border-border last:border-0 hover:bg-accent">
      <td className="whitespace-nowrap px-3 py-3 text-xs leading-5 text-foreground">{formatDateRange(item.startOn, item.endOn)}</td>
      <td className="whitespace-nowrap px-3 py-3 text-xs leading-5 text-muted-foreground">{item.leaveTypeName}</td>
      <td className="whitespace-nowrap px-3 py-3 text-xs leading-5 text-muted-foreground">{formatDays(item.days)}</td>
      {showEmployeeColumn ? <td className="px-3 py-3 text-xs leading-5 text-foreground">{item.employeeName}</td> : null}
      <td className="min-w-48 px-3 py-3 text-xs leading-5 text-muted-foreground">{item.reason || "-"}</td>
      <td className="px-3 py-3"><StatusChip item={item} /></td>
      {canManage ? <td className="px-3 py-3"><RowActions item={item} canManage={canManage} onEdit={onEdit} onCancel={onCancel} /></td> : null}
    </tr>
  );
}

function LeaveCard({ item, showEmployeeColumn, canManage, onEdit, onCancel }) {
  return (
    <article className="rounded-xl border border-border bg-card p-4 shadow-xs">
      <div className="flex items-start justify-between gap-3">
        <div>
          <strong className="block text-sm font-medium leading-5 text-foreground">{formatDateRange(item.startOn, item.endOn)}</strong>
          <span className="text-xs leading-4 text-muted-foreground">{item.leaveTypeName} · {formatDays(item.days)}</span>
        </div>
        <StatusChip item={item} />
      </div>
      {showEmployeeColumn ? <p className="mt-2 text-xs font-medium leading-5 text-foreground">{item.employeeName}</p> : null}
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{item.reason || "-"}</p>
      {canManage && item.statusCode === "pending" ? (
        <div className="mt-3 flex justify-end gap-2 border-t border-border pt-3">
          <RowActions item={item} canManage={canManage} onEdit={onEdit} onCancel={onCancel} />
        </div>
      ) : null}
    </article>
  );
}

// `items` (fixture) bypasses the internal fetch entirely — used by tests and
// available to any caller that already has a list to filter. Without it the
// view fetches GET /api/leave?status=all itself and filters the 4 tabs
// client-side, so switching tabs never re-hits the network.
export function LeaveListView({ items: itemsProp, loading: loadingProp = false, refreshKey = 0, onEdit = () => {}, onCancelled = () => {} }) {
  const { role, employeeId } = useHrmRole();
  const [items, setItems] = useState(itemsProp || []);
  const [loading, setLoading] = useState(itemsProp === undefined);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState("");

  useEffect(() => {
    if (itemsProp !== undefined) {
      setItems(itemsProp || []);
      setLoading(Boolean(loadingProp));
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    setError("");
    fetch("/api/leave?status=all")
      .then((response) => {
        if (!response.ok) throw new Error("failed to load");
        return response.json();
      })
      .then((payload) => {
        if (!cancelled) setItems(payload.items || []);
      })
      .catch(() => {
        if (!cancelled) setError("ไม่สามารถโหลดรายการการลาได้");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [itemsProp, loadingProp, refreshKey]);

  const counts = useMemo(
    () => ({
      all: items.length,
      pending: items.filter((item) => item.statusCode === "pending").length,
      approved: items.filter((item) => item.statusCode === "approved").length,
      rejected: items.filter((item) => item.statusCode === "rejected").length,
    }),
    [items],
  );

  const filtered = useMemo(
    () => items.filter((item) => statusFilter === "all" || item.statusCode === statusFilter),
    [items, statusFilter],
  );

  const showEmployeeColumn = role === "supervisor" || role === "ceo";

  function isOwn(item) {
    return item.employeeId === employeeId;
  }

  async function confirmCancel() {
    if (!cancelTarget) return;
    setCancelling(true);
    setCancelError("");
    try {
      const response = await fetch(`/api/leave/${cancelTarget.id}`, { method: "DELETE" });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setCancelError(payload.error || "ไม่สามารถยกเลิกคำขอลาได้");
        return;
      }
      const payload = await response.json();
      setItems((current) => current.map((item) => (item.id === payload.item.id ? payload.item : item)));
      onCancelled(payload.item);
      setCancelTarget(null);
    } catch {
      setCancelError("ไม่สามารถเชื่อมต่อกับระบบได้ กรุณาลองใหม่");
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div className="space-y-4">
      <StatusTabs selected={statusFilter} counts={counts} onChange={setStatusFilter} />
      {error ? <p className="text-xs leading-5 text-status-danger">{error}</p> : null}
      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[820px] text-left">
            <thead className="bg-muted">
              <tr className="text-xs font-semibold leading-4 text-muted-foreground">
                <th className="px-3 py-3">วันที่ลา</th>
                <th className="px-3 py-3">ประเภท</th>
                <th className="px-3 py-3">จำนวนวัน</th>
                {showEmployeeColumn ? <th className="px-3 py-3">พนักงาน</th> : null}
                <th className="px-3 py-3">เหตุผล</th>
                <th className="px-3 py-3">สถานะ</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <LeaveRow
                  key={item.id}
                  item={item}
                  showEmployeeColumn={showEmployeeColumn}
                  canManage={isOwn(item)}
                  onEdit={onEdit}
                  onCancel={setCancelTarget}
                />
              ))}
            </tbody>
          </table>
        </div>
        <div className="grid gap-3 p-3 md:hidden">
          {filtered.map((item) => (
            <LeaveCard
              key={item.id}
              item={item}
              showEmployeeColumn={showEmployeeColumn}
              canManage={isOwn(item)}
              onEdit={onEdit}
              onCancel={setCancelTarget}
            />
          ))}
        </div>
        {!loading && filtered.length === 0 ? <p className="p-10 text-center text-xs leading-5 text-muted-foreground">ไม่พบคำขอลาในหมวดนี้</p> : null}
        {loading ? <p className="p-10 text-center text-xs leading-5 text-muted-foreground">กำลังโหลดข้อมูล...</p> : null}
      </section>
      <HrmDialog
        open={Boolean(cancelTarget)}
        onClose={() => { setCancelTarget(null); setCancelError(""); }}
        title="ยกเลิกคำขอลา"
        description="คำขอนี้จะถูกเปลี่ยนสถานะเป็นยกเลิกและไม่สามารถย้อนกลับได้"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setCancelTarget(null); setCancelError(""); }}>ปิด</Button>
            <Button variant="danger" onClick={confirmCancel} disabled={cancelling}>ยืนยันยกเลิก</Button>
          </>
        }
      >
        <p className="text-sm leading-6 text-muted-foreground">
          ต้องการยกเลิกคำขอลา <strong className="text-foreground">{cancelTarget ? formatDateRange(cancelTarget.startOn, cancelTarget.endOn) : ""}</strong> ใช่หรือไม่
        </p>
        {cancelError ? <p className="mt-2 text-xs leading-5 text-status-danger">{cancelError}</p> : null}
      </HrmDialog>
    </div>
  );
}

export default LeaveListView;
