"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { RiArrowGoBackLine } from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/badge";
import { LOAN_STATUS_TABS, loanStatusColor } from "@/components/hrm/assets/assetStatus";
import { cx } from "@/utils/cx";

function StatusTabs({ selected, counts, onChange }) {
  return (
    <div className="flex flex-wrap gap-2" role="tablist" aria-label="กรองสถานะการยืมคืน">
      {LOAN_STATUS_TABS.map((tab) => {
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

// Pending rows link to /approvals instead of exposing an inline
// approve/reject affordance here — that surface belongs to ApprovalModule.jsx
// (owned separately), matching OT's established pattern (see OtListView.jsx).
function StatusChip({ item }) {
  const chip = <Chip variant="caption" color={loanStatusColor(item.statusCode)}>{item.statusName}</Chip>;
  if (item.statusCode !== "pending") return chip;
  return (
    <Link href="/approvals" className="inline-flex focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="ไปที่หน้าอนุมัติ">
      {chip}
    </Link>
  );
}

function ReturnAction({ item, canReturn, onReturn, size }) {
  if (item.isReturned) return <span className="text-xs leading-5 text-muted-foreground">คืนแล้ว</span>;
  if (!item.isActive || !canReturn) return null;
  return (
    <Button size={size} variant="secondary" leadingIcon={RiArrowGoBackLine} onClick={() => onReturn(item)}>
      รับคืนทรัพย์สิน
    </Button>
  );
}

function LoanRow({ item, showEmployeeColumn, canReturn, onReturn }) {
  return (
    <tr className="border-b border-border last:border-0 hover:bg-accent">
      <td className="px-3 py-3 text-xs leading-5 text-foreground">
        {item.assetName} <span className="text-muted-foreground">· {item.assetCode}</span>
      </td>
      {showEmployeeColumn ? <td className="px-3 py-3 text-xs leading-5 text-foreground">{item.employeeName}</td> : null}
      <td className="whitespace-nowrap px-3 py-3 text-xs leading-5 text-muted-foreground">{item.checkoutDate} – {item.dueDate}</td>
      <td className="px-3 py-3"><StatusChip item={item} /></td>
      <td className="px-3 py-3"><ReturnAction item={item} canReturn={canReturn} onReturn={onReturn} size="xs" /></td>
    </tr>
  );
}

function LoanCard({ item, showEmployeeColumn, canReturn, onReturn }) {
  return (
    <article className="rounded-xl border border-border bg-card p-4 shadow-xs">
      <div className="flex items-start justify-between gap-3">
        <div>
          <strong className="block text-sm font-medium leading-5 text-foreground">{item.assetName}</strong>
          <span className="text-xs leading-4 text-muted-foreground">{item.assetCode} · {item.checkoutDate} – {item.dueDate}</span>
        </div>
        <StatusChip item={item} />
      </div>
      {showEmployeeColumn ? <p className="mt-2 text-xs font-medium leading-5 text-foreground">{item.employeeName}</p> : null}
      {item.purpose ? <p className="mt-2 text-xs leading-5 text-muted-foreground">{item.purpose}</p> : null}
      <div className="mt-3">
        <ReturnAction item={item} canReturn={canReturn} onReturn={onReturn} size="small" />
      </div>
    </article>
  );
}

// `role`/`employeeId` are passed down from useHrmRole() in AssetModule rather
// than read here directly, so this view stays a plain function of props.
// `canApprove` (canApproveAssetLoan(role)) lets a supervisor/ceo return
// anyone's active loan; an `employee` may only return their own.
export function AssetLoansView({ refreshKey = 0, role, employeeId, canApprove = false, onChanged = () => {} }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError("");
    fetch("/api/asset-loans?status=all")
      .then((response) => {
        if (!response.ok) throw new Error("failed to load");
        return response.json();
      })
      .then((payload) => {
        if (!cancelled) setItems(payload.items || []);
      })
      .catch(() => {
        if (!cancelled) setLoadError("ไม่สามารถโหลดประวัติการยืมคืนได้");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

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

  async function handleReturn(item) {
    setActionError("");
    try {
      const response = await fetch(`/api/asset-loans/${item.id}/return`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setActionError(payload.error || "ไม่สามารถบันทึกรับคืนทรัพย์สินได้");
        return;
      }
      onChanged(`บันทึกรับคืน "${item.assetName}" เรียบร้อยแล้ว`);
    } catch {
      setActionError("ไม่สามารถเชื่อมต่อกับระบบได้ กรุณาลองใหม่");
    }
  }

  const canReturn = (item) => canApprove || item.employeeId === employeeId;

  return (
    <div className="mt-5 space-y-4">
      <StatusTabs selected={statusFilter} counts={counts} onChange={setStatusFilter} />
      {loadError ? <p className="text-xs leading-5 text-status-danger">{loadError}</p> : null}
      {actionError ? <p className="text-xs leading-5 text-status-danger">{actionError}</p> : null}
      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[720px] text-left">
            <thead className="bg-muted">
              <tr className="text-xs font-semibold leading-4 text-muted-foreground">
                <th className="px-3 py-3">ทรัพย์สิน</th>
                {showEmployeeColumn ? <th className="px-3 py-3">ผู้ยืม</th> : null}
                <th className="px-3 py-3">วันที่ยืม – กำหนดคืน</th>
                <th className="px-3 py-3">สถานะ</th>
                <th className="px-3 py-3">การจัดการ</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <LoanRow key={item.id} item={item} showEmployeeColumn={showEmployeeColumn} canReturn={canReturn(item)} onReturn={handleReturn} />
              ))}
            </tbody>
          </table>
        </div>
        <div className="grid gap-3 p-3 md:hidden">
          {filtered.map((item) => (
            <LoanCard key={item.id} item={item} showEmployeeColumn={showEmployeeColumn} canReturn={canReturn(item)} onReturn={handleReturn} />
          ))}
        </div>
        {!loading && filtered.length === 0 ? <p className="p-10 text-center text-xs leading-5 text-muted-foreground">ไม่พบรายการในหมวดนี้</p> : null}
        {loading ? <p className="p-10 text-center text-xs leading-5 text-muted-foreground">กำลังโหลดข้อมูล...</p> : null}
      </section>
    </div>
  );
}

export default AssetLoansView;
