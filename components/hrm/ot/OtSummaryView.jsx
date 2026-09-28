"use client";

import { useEffect, useState } from "react";
import {
  RiArrowLeftSLine,
  RiArrowRightSLine,
  RiCheckboxCircleLine,
  RiClockwise2Line,
  RiCloseCircleLine,
  RiFileList3Line,
} from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { useHrmRole } from "@/components/hrm/HrmShell";
import { currentMonthInBangkok, formatMonthLabel, shiftMonth } from "@/components/hrm/ot/otStatus";

function SummaryCard({ icon: Icon, label, value, helper }) {
  return (
    <article className="min-w-0 border-r border-border py-1 pr-3 last:border-r-0 sm:pr-4">
      <div className="flex items-center gap-1.5">
        <Icon className="size-4 text-muted-foreground" aria-hidden />
        <span className="text-xs leading-4 text-muted-foreground">{label}</span>
      </div>
      <strong className="mt-2 block text-lg font-semibold tracking-tight leading-6 text-foreground">{value}</strong>
      {helper ? <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">{helper}</span> : null}
    </article>
  );
}

function MonthNav({ month, onChange }) {
  return (
    <div className="flex items-center justify-between border-y border-border py-1">
      <IconButton icon={RiArrowLeftSLine} aria-label="เดือนก่อนหน้า" onClick={() => onChange(shiftMonth(month, -1))} />
      <strong className="text-sm font-semibold leading-5 text-foreground">{formatMonthLabel(month)}</strong>
      <IconButton icon={RiArrowRightSLine} aria-label="เดือนถัดไป" onClick={() => onChange(shiftMonth(month, 1))} />
    </div>
  );
}

function IndividualSummary({ month, onMonthChange, summary, loading, error, backAction }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        {backAction ? <Button size="small" variant="secondary" onClick={backAction}>ย้อนกลับ</Button> : <span />}
        {summary ? <span className="text-xs leading-5 text-muted-foreground">{summary.employeeName}</span> : null}
      </div>
      <MonthNav month={month} onChange={onMonthChange} />
      {error ? <p className="text-xs leading-5 text-status-danger">{error}</p> : null}
      {loading || !summary ? (
        <p className="text-xs leading-5 text-muted-foreground">กำลังโหลดข้อมูล...</p>
      ) : (
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 border-y border-border py-3 sm:grid-cols-3">
          <SummaryCard icon={RiCheckboxCircleLine} label="ชั่วโมงที่อนุมัติแล้ว" value={`${summary.totalApprovedHours} ชม.`} helper={`${summary.byStatus.approved} รายการ`} />
          <SummaryCard icon={RiClockwise2Line} label="ชั่วโมงรอดำเนินการ" value={`${summary.totalPendingHours} ชม.`} helper={`${summary.byStatus.pending} รายการ`} />
          <SummaryCard icon={RiCloseCircleLine} label="ชั่วโมงที่ไม่อนุมัติ" value={`${summary.totalRejectedHours} ชม.`} helper={`${summary.byStatus.rejected} รายการ`} />
        </div>
      )}
    </div>
  );
}

export function OtSummaryView({ refreshKey = 0 }) {
  const { role } = useHrmRole();
  const isCompanyCapable = role === "supervisor" || role === "ceo";
  const [month, setMonth] = useState(() => currentMonthInBangkok());
  const [drillEmployeeId, setDrillEmployeeId] = useState(null);
  const [individualSummary, setIndividualSummary] = useState(null);
  const [companySummary, setCompanySummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    const targetEmployeeId = isCompanyCapable ? drillEmployeeId : null;
    const query = new URLSearchParams({ month });
    if (targetEmployeeId) query.set("employeeId", targetEmployeeId);

    fetch(`/api/ot/summary?${query.toString()}`)
      .then((response) => {
        if (!response.ok) throw new Error("failed to load");
        return response.json();
      })
      .then((payload) => {
        if (cancelled) return;
        if (payload.scope === "company") setCompanySummary(payload);
        else setIndividualSummary(payload);
      })
      .catch(() => {
        if (!cancelled) setError("ไม่สามารถโหลดสรุป OT ได้");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [month, drillEmployeeId, isCompanyCapable, refreshKey]);

  if (!isCompanyCapable) {
    return <IndividualSummary month={month} onMonthChange={setMonth} summary={individualSummary} loading={loading} error={error} />;
  }

  if (drillEmployeeId) {
    return (
      <IndividualSummary
        month={month}
        onMonthChange={setMonth}
        summary={individualSummary}
        loading={loading}
        error={error}
        backAction={() => setDrillEmployeeId(null)}
      />
    );
  }

  const byEmployee = companySummary?.byEmployee || [];

  return (
    <div className="space-y-4">
      <MonthNav month={month} onChange={setMonth} />
      {error ? <p className="text-xs leading-5 text-status-danger">{error}</p> : null}
      {companySummary ? (
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 border-y border-border py-3 sm:grid-cols-3">
          <SummaryCard icon={RiCheckboxCircleLine} label="ชั่วโมงที่อนุมัติแล้วทั้งบริษัท" value={`${companySummary.totalApprovedHours} ชม.`} />
          <SummaryCard icon={RiClockwise2Line} label="ชั่วโมงรอดำเนินการทั้งบริษัท" value={`${companySummary.totalPendingHours} ชม.`} />
          <SummaryCard icon={RiFileList3Line} label="จำนวนคำขอทั้งหมด" value={`${companySummary.requestCount} รายการ`} />
        </div>
      ) : null}
      <section className="overflow-hidden border-y border-border bg-card">
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[640px] text-left">
            <thead className="bg-muted">
              <tr className="text-xs font-semibold leading-4 text-muted-foreground">
                <th className="px-3 py-3">พนักงาน</th>
                <th className="px-3 py-3">อนุมัติแล้ว</th>
                <th className="px-3 py-3">รอดำเนินการ</th>
                <th className="px-3 py-3">ไม่อนุมัติ</th>
                <th className="px-3 py-3">จำนวนคำขอ</th>
              </tr>
            </thead>
            <tbody>
              {byEmployee.map((row) => (
                <tr
                  key={row.employeeId}
                  className="cursor-pointer border-b border-border last:border-0 hover:bg-accent"
                  onClick={() => setDrillEmployeeId(row.employeeId)}
                >
                  <td className="px-3 py-3 text-xs font-medium leading-5 text-foreground">{row.employeeName} <span className="text-muted-foreground">({row.employeeCode})</span></td>
                  <td className="px-3 py-3 text-xs leading-5 text-muted-foreground">{row.approvedHours} ชม.</td>
                  <td className="px-3 py-3 text-xs leading-5 text-muted-foreground">{row.pendingHours} ชม.</td>
                  <td className="px-3 py-3 text-xs leading-5 text-muted-foreground">{row.rejectedHours} ชม.</td>
                  <td className="px-3 py-3 text-xs leading-5 text-muted-foreground">{row.requestCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="grid gap-3 p-3 md:hidden">
          {byEmployee.map((row) => (
            <button
              type="button"
              key={row.employeeId}
              onClick={() => setDrillEmployeeId(row.employeeId)}
              className="rounded-md border border-border bg-card p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <strong className="block text-sm font-medium leading-5 text-foreground">{row.employeeName}</strong>
              <span className="text-xs leading-4 text-muted-foreground">{row.employeeCode}</span>
              <div className="mt-2 grid grid-cols-3 gap-2 text-xs leading-4 text-muted-foreground">
                <span>อนุมัติ {row.approvedHours} ชม.</span>
                <span>รอ {row.pendingHours} ชม.</span>
                <span>ไม่อนุมัติ {row.rejectedHours} ชม.</span>
              </div>
            </button>
          ))}
        </div>
        {!loading && byEmployee.length === 0 ? <p className="p-10 text-center text-xs leading-5 text-muted-foreground">ไม่มีข้อมูล OT ในเดือนนี้</p> : null}
        {loading ? <p className="p-10 text-center text-xs leading-5 text-muted-foreground">กำลังโหลดข้อมูล...</p> : null}
      </section>
    </div>
  );
}

export default OtSummaryView;
