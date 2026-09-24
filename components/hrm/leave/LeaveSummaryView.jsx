"use client";

import { useEffect, useState } from "react";
import { RiFileList3Line } from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/badge";
import { useHrmRole } from "@/components/hrm/HrmShell";
import { cx } from "@/utils/cx";

const QUOTA_TONES = [
  { color: "cyan", dot: "bg-status-info/10" },
  { color: "orange", dot: "bg-status-warning/10" },
  { color: "rose", dot: "bg-status-danger/10" },
  { color: "lime", dot: "bg-status-success/10" },
  { color: "purple", dot: "bg-status-violet/10" },
];

function quotaTone(index) {
  return QUOTA_TONES[index % QUOTA_TONES.length];
}

function QuotaCard({ quota, index }) {
  const tone = quotaTone(index);
  const isUncapped = quota.annualQuotaDays == null;
  const progress = isUncapped || quota.annualQuotaDays === 0 ? 0 : Math.min(100, Math.round((quota.usedDays / quota.annualQuotaDays) * 100));

  return (
    <article className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={cx("size-2.5 rounded-full", tone.dot)} />
          <span className="text-xs font-medium leading-5 text-foreground">{quota.name}</span>
        </div>
        <Chip variant="caption" color={tone.color}>
          {isUncapped ? "ไม่จำกัด" : `เหลือ ${quota.remainingDays} วัน`}
        </Chip>
      </div>
      <div className="mt-4 flex items-baseline gap-2">
        <strong className="text-lg font-semibold tracking-tight leading-6 text-foreground">{quota.usedDays}</strong>
        <span className="text-xs leading-4 text-muted-foreground">{isUncapped ? "วันที่ใช้ไป" : `จาก ${quota.annualQuotaDays} วัน`}</span>
      </div>
      {!isUncapped ? (
        <>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className={cx("h-full rounded-full", tone.dot)} style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-2 text-[11px] leading-4 text-muted-foreground">ใช้สิทธิ์ไปแล้ว {progress}%</p>
        </>
      ) : null}
    </article>
  );
}

function IndividualQuotas({ summary, loading, error, backAction }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        {backAction ? <Button size="small" variant="secondary" onClick={backAction}>ย้อนกลับ</Button> : <span />}
        {summary ? <span className="text-xs leading-5 text-muted-foreground">{summary.employeeName}</span> : null}
      </div>
      {error ? <p className="text-xs leading-5 text-status-danger">{error}</p> : null}
      {loading || !summary ? (
        <p className="text-xs leading-5 text-muted-foreground">กำลังโหลดข้อมูล...</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-3">
          {summary.quotas.map((quota, index) => <QuotaCard quota={quota} index={index} key={quota.code} />)}
          {summary.quotas.length === 0 ? <p className="text-xs leading-5 text-muted-foreground md:col-span-3">ไม่มีประเภทการลาที่เปิดใช้งาน</p> : null}
        </div>
      )}
    </div>
  );
}

export function LeaveSummaryView({ refreshKey = 0 }) {
  const { role } = useHrmRole();
  const isCompanyCapable = role === "supervisor" || role === "ceo";
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
    const query = new URLSearchParams();
    if (targetEmployeeId) query.set("employeeId", targetEmployeeId);
    const qs = query.toString();

    fetch(`/api/leave/summary${qs ? `?${qs}` : ""}`)
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
        if (!cancelled) setError("ไม่สามารถโหลดสรุปวันลาได้");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [drillEmployeeId, isCompanyCapable, refreshKey]);

  if (!isCompanyCapable) {
    return <IndividualQuotas summary={individualSummary} loading={loading} error={error} />;
  }

  if (drillEmployeeId) {
    return <IndividualQuotas summary={individualSummary} loading={loading} error={error} backAction={() => setDrillEmployeeId(null)} />;
  }

  const byEmployee = companySummary?.byEmployee || [];

  return (
    <div className="space-y-4">
      {error ? <p className="text-xs leading-5 text-status-danger">{error}</p> : null}
      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[640px] text-left">
            <thead className="bg-muted">
              <tr className="text-xs font-semibold leading-4 text-muted-foreground">
                <th className="px-3 py-3">พนักงาน</th>
                <th className="px-3 py-3">อนุมัติแล้ว</th>
                <th className="px-3 py-3">รอดำเนินการ</th>
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
                  <td className="px-3 py-3 text-xs leading-5 text-muted-foreground">{row.approvedDays} วัน</td>
                  <td className="px-3 py-3 text-xs leading-5 text-muted-foreground">{row.pendingDays} วัน</td>
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
              className="rounded-xl border border-border bg-card p-4 text-left shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <strong className="block text-sm font-medium leading-5 text-foreground">{row.employeeName}</strong>
              <span className="text-xs leading-4 text-muted-foreground">{row.employeeCode}</span>
              <div className="mt-2 grid grid-cols-3 gap-2 text-xs leading-4 text-muted-foreground">
                <span>อนุมัติ {row.approvedDays} วัน</span>
                <span>รอ {row.pendingDays} วัน</span>
                <span>{row.requestCount} คำขอ</span>
              </div>
            </button>
          ))}
        </div>
        {!loading && byEmployee.length === 0 ? (
          <p className="flex items-center justify-center gap-2 p-10 text-center text-xs leading-5 text-muted-foreground">
            <RiFileList3Line className="size-4" aria-hidden />ไม่มีข้อมูลการลาในปีนี้
          </p>
        ) : null}
        {loading ? <p className="p-10 text-center text-xs leading-5 text-muted-foreground">กำลังโหลดข้อมูล...</p> : null}
      </section>
    </div>
  );
}

export default LeaveSummaryView;
