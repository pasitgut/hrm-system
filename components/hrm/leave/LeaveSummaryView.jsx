"use client";

import { useEffect, useState } from "react";
import { Chip } from "@/components/ui/badge";
import { useHrmRole } from "@/components/hrm/HrmShell";
import { LEAVE_TYPE_CODES, LEAVE_TYPE_PRESENTATION } from "@/components/hrm/leave/leaveTypes";
import { cn } from "@/lib/utils";

function QuotaCard({ type, quota }) {
  const isMissing = !quota;
  const isUncapped = quota?.annualQuotaDays == null;
  const remainingDays = quota?.remainingDays;
  const usedDays = quota?.usedDays ?? 0;
  const progress = isMissing || isUncapped || quota.annualQuotaDays === 0
    ? 0
    : Math.min(100, Math.round((usedDays / quota.annualQuotaDays) * 100));

  return (
    <article className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={cn("size-2.5 rounded-full", type.dotClass)} aria-hidden="true" />
          <h3 className="text-sm font-medium leading-5 text-foreground">{type.name}</h3>
        </div>
        {isMissing ? <Chip variant="caption" color="gray">ยังไม่ตั้งค่า</Chip> : isUncapped ? <Chip variant="caption" color="cyan">ไม่จำกัด</Chip> : null}
      </div>
      <div className="mt-4 flex items-baseline gap-2">
        <strong className="text-2xl font-semibold tracking-tight text-foreground">
          {isMissing ? "—" : isUncapped ? usedDays : remainingDays}
        </strong>
        <span className="text-xs text-muted-foreground">{isUncapped ? "วันที่ใช้ไป" : "วันคงเหลือ"}</span>
      </div>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        {isMissing
          ? "ยังไม่มีข้อมูลโควต้าสำหรับประเภทนี้"
          : isUncapped
            ? `ใช้ไป ${usedDays} วัน`
            : `ใช้ไป ${usedDays} จาก ${quota.annualQuotaDays} วัน`}
      </p>
      {!isUncapped && !isMissing ? (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted" role="meter" aria-label={`ใช้สิทธิ์${type.name}ไป ${progress}%`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
          <div className={cn("h-full rounded-full transition-[width]", type.barClass)} style={{ width: `${progress}%` }} />
        </div>
      ) : null}
    </article>
  );
}

export function LeaveSummaryView({ refreshKey = 0 }) {
  const { employeeId } = useHrmRole();
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    const query = employeeId ? `?employeeId=${encodeURIComponent(employeeId)}` : "";

    fetch(`/api/leave/summary${query}`)
      .then((response) => {
        if (!response.ok) throw new Error("failed to load");
        return response.json();
      })
      .then((payload) => {
        if (!cancelled) setSummary(payload);
      })
      .catch(() => {
        if (!cancelled) setError("ไม่สามารถโหลดสิทธิ์วันลาของคุณได้");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [employeeId, refreshKey]);

  const quotas = new Map((summary?.quotas || []).filter((quota) => LEAVE_TYPE_CODES.has(quota.code)).map((quota) => [quota.code, quota]));

  return (
    <div>
      {error ? <p role="alert" className="mb-3 text-xs leading-5 text-status-danger">{error}</p> : null}
      {loading && !summary ? (
        <p className="rounded-xl border border-border bg-card p-8 text-center text-xs text-muted-foreground">กำลังโหลดสิทธิ์วันลา...</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {LEAVE_TYPE_PRESENTATION.map((type) => <QuotaCard key={type.code} type={type} quota={quotas.get(type.code)} />)}
        </div>
      )}
    </div>
  );
}

export default LeaveSummaryView;
