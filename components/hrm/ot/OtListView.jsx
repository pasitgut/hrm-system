"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { RiArrowLeftSLine, RiArrowRightSLine, RiCloseLine, RiPencilLine } from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/badge";
import { IconButton } from "@/components/ui/icon-button";
import { HrmDialog } from "@/components/hrm/HrmDialog";
import { useHrmRole } from "@/components/hrm/HrmShell";
import { canViewCompanyOtData } from "@/lib/auth/rolePermissionAccess";
import { canManageOwnOtRequests } from "@/lib/auth/permissions";
import { OT_STATUS_TABS, currentMonthInBangkok, formatMonthLabel, overtimeTypeLabel, shiftMonth, statusColor } from "@/components/hrm/ot/otStatus";
import { cx } from "@/utils/cx";

function StatusTabs({ selected, counts, onChange }) {
  return (
    <div className="flex flex-wrap gap-2" role="tablist" aria-label="กรองสถานะ OT">
      {OT_STATUS_TABS.map((tab) => {
        const isSelected = selected === tab.key;
        return (
          <button
            type="button"
            role="tab"
            aria-selected={isSelected}
            key={tab.key}
            onClick={() => onChange(tab.key)}
            className={cx(
              "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-medium leading-5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isSelected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {tab.label}
            <span className={cx("rounded-full px-1.5 py-0.5 text-xs font-medium leading-4", isSelected ? "bg-card/20 text-primary-foreground" : "bg-muted text-muted-foreground")}>
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

// Own-pending edit/cancel buttons — shared by the table row and card
// layouts. Never shown for someone else's request or a decided one.
function OwnActions({ item, canManage, onEdit, onCancel }) {
  if (!canManage) return null;
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <Button size="xs" variant="ghost" leadingIcon={RiPencilLine} onClick={() => onEdit(item)}>แก้ไข</Button>
      <Button size="xs" variant="ghost" className="text-status-danger hover:text-status-danger" leadingIcon={RiCloseLine} onClick={() => onCancel(item)}>ยกเลิก</Button>
    </div>
  );
}

function OtRow({ item, showEmployeeColumn, showActionsColumn, canManage, onEdit, onCancel }) {
  return (
    <tr className="border-b border-border last:border-0 hover:bg-accent">
      <td className="whitespace-nowrap px-3 py-3 text-xs leading-5 text-foreground">{item.date}</td>
      <td className="whitespace-nowrap px-3 py-3 text-xs leading-5 text-muted-foreground">{item.startTime} – {item.endTime}</td>
      <td className="whitespace-nowrap px-3 py-3 text-xs leading-5 text-muted-foreground">{item.durationHours} ชม.</td>
      <td className="whitespace-nowrap px-3 py-3 text-xs leading-5 text-muted-foreground">{overtimeTypeLabel(item.overtimeType)}</td>
      {showEmployeeColumn ? <td className="px-3 py-3 text-xs leading-5 text-foreground">{item.employeeName}</td> : null}
      <td className="min-w-48 px-3 py-3 text-xs leading-5 text-muted-foreground">{item.reason}</td>
      <td className="px-3 py-3"><StatusChip item={item} /></td>
      {showActionsColumn ? (
        <td className="px-3 py-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <OwnActions item={item} canManage={canManage} onEdit={onEdit} onCancel={onCancel} />
          </div>
        </td>
      ) : null}
    </tr>
  );
}

function OtCard({ item, showEmployeeColumn, canManage, onEdit, onCancel }) {
  return (
    <article className="rounded-xl border border-border bg-card p-4 shadow-xs">
      <div className="flex items-start justify-between gap-3">
        <div>
          <strong className="block text-sm font-medium leading-5 text-foreground">{item.date}</strong>
          <span className="text-xs leading-4 text-muted-foreground">{item.startTime} – {item.endTime} · {item.durationHours} ชม.</span>
          <span className="mt-1 block text-xs leading-4 text-muted-foreground">ประเภทวัน: {overtimeTypeLabel(item.overtimeType)}</span>
        </div>
        <StatusChip item={item} />
      </div>
      {showEmployeeColumn ? <p className="mt-2 text-xs font-medium leading-5 text-foreground">{item.employeeName}</p> : null}
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{item.reason}</p>
      {canManage ? (
        <div className="mt-3 border-t border-border pt-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <OwnActions item={item} canManage={canManage} onEdit={onEdit} onCancel={onCancel} />
          </div>
        </div>
      ) : null}
    </article>
  );
}

// `items` (fixture) bypasses the internal fetch entirely — used by tests and
// available to any caller that already has a list to filter. Without it the
// view fetches GET /api/ot?month=...&status=all itself and filters the 4
// tabs client-side, so switching tabs never re-hits the network.
export function OtListView({ items: itemsProp, refreshKey = 0, onEdit = () => {}, onCancelled = () => {} }) {
  const user = useHrmRole() ?? {};
  const { employeeId } = user;
  const [month, setMonth] = useState(() => currentMonthInBangkok());
  const [items, setItems] = useState(itemsProp || []);
  const [loading, setLoading] = useState(!itemsProp);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState("");

  useEffect(() => {
    if (itemsProp) {
      setItems(itemsProp);
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    setError("");
    fetch(`/api/ot?month=${month}&status=all`)
      .then((response) => {
        if (!response.ok) throw new Error("failed to load");
        return response.json();
      })
      .then((payload) => {
        if (!cancelled) setItems(payload.items || []);
      })
      .catch(() => {
        if (!cancelled) setError("ไม่สามารถโหลดรายการ OT ได้");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [itemsProp, month, refreshKey]);

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

  const showEmployeeColumn = canViewCompanyOtData(user);
  const canManageOwnRequests = canManageOwnOtRequests(user.permissions);

  function handleEdit(item) {
    onEdit?.(item);
  }

  function requestCancel(item) {
    setCancelError("");
    setCancelTarget(item);
  }

  async function confirmCancel() {
    if (!cancelTarget) return;
    setCancelling(true);
    setCancelError("");
    try {
      const response = await fetch(`/api/ot/${cancelTarget.id}`, { method: "DELETE" });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setCancelError(payload.error || "ไม่สามารถยกเลิกคำขอได้ กรุณาลองใหม่");
        return;
      }
      const payload = await response.json();
      if (!itemsProp) {
        setItems((current) => current.map((item) => (item.id === payload.item.id ? payload.item : item)));
      }
      setCancelTarget(null);
      onCancelled?.(payload.item);
    } catch {
      setCancelError("ไม่สามารถเชื่อมต่อกับระบบได้ กรุณาลองใหม่");
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div className="space-y-4">
      {!itemsProp ? (
        <div className="flex items-center justify-between rounded-xl border border-border bg-card p-3 shadow-sm">
          <IconButton icon={RiArrowLeftSLine} aria-label="เดือนก่อนหน้า" onClick={() => setMonth((current) => shiftMonth(current, -1))} />
          <strong className="text-sm font-semibold leading-5 text-foreground">{formatMonthLabel(month)}</strong>
          <IconButton icon={RiArrowRightSLine} aria-label="เดือนถัดไป" onClick={() => setMonth((current) => shiftMonth(current, 1))} />
        </div>
      ) : null}
      <StatusTabs selected={statusFilter} counts={counts} onChange={setStatusFilter} />
      {error ? <p className="text-xs leading-5 text-status-danger">{error}</p> : null}
      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[760px] text-left">
            <thead className="bg-muted">
              <tr className="text-xs font-semibold leading-4 text-muted-foreground">
                <th className="px-3 py-3">วันที่</th>
                <th className="px-3 py-3">เวลา</th>
                <th className="px-3 py-3">ระยะเวลา</th>
                <th className="px-3 py-3">ประเภทวัน</th>
                {showEmployeeColumn ? <th className="px-3 py-3">พนักงาน</th> : null}
                <th className="px-3 py-3">รายละเอียดงานที่ทำ</th>
                <th className="px-3 py-3">สถานะ</th>
                <th className="px-3 py-3">การดำเนินการ</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <OtRow
                  key={item.id}
                  item={item}
                  showEmployeeColumn={showEmployeeColumn}
                  showActionsColumn
                  canManage={canManageOwnRequests && item.employeeId === employeeId && item.statusCode === "pending"}
                  onEdit={handleEdit}
                  onCancel={requestCancel}
                />
              ))}
            </tbody>
          </table>
        </div>
        <div className="grid gap-3 p-3 md:hidden">
          {filtered.map((item) => (
            <OtCard
              key={item.id}
              item={item}
              showEmployeeColumn={showEmployeeColumn}
              canManage={canManageOwnRequests && item.employeeId === employeeId && item.statusCode === "pending"}
              onEdit={handleEdit}
              onCancel={requestCancel}
            />
          ))}
        </div>
        {!loading && filtered.length === 0 ? <p className="p-10 text-center text-xs leading-5 text-muted-foreground">ไม่พบรายการ OT ในหมวดนี้</p> : null}
        {loading ? <p className="p-10 text-center text-xs leading-5 text-muted-foreground">กำลังโหลดข้อมูล...</p> : null}
      </section>
      <HrmDialog
        open={Boolean(cancelTarget)}
        onClose={() => setCancelTarget(null)}
        title="ยกเลิกคำขอ OT"
        description="ต้องการยกเลิกคำขอนี้ใช่หรือไม่"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelTarget(null)} disabled={cancelling}>ปิด</Button>
            <Button variant="danger" onClick={confirmCancel} disabled={cancelling}>ยืนยันยกเลิก</Button>
          </>
        }
      >
        {cancelTarget ? (
          <p className="text-sm leading-6 text-muted-foreground">
            คำขอ OT วันที่ <strong className="text-foreground">{cancelTarget.date}</strong> เวลา {cancelTarget.startTime} – {cancelTarget.endTime}
          </p>
        ) : null}
        {cancelError ? <p className="mt-2 text-xs leading-5 text-status-danger">{cancelError}</p> : null}
      </HrmDialog>
    </div>
  );
}

export default OtListView;
