"use client";

import { useEffect, useState } from "react";
import { RiAddLine, RiFileList3Line } from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { useHrmRole } from "@/components/hrm/HrmShell";
import { LeaveCalendarView } from "@/components/hrm/leave/LeaveCalendarView";
import { LeaveInsightsView } from "@/components/hrm/leave/LeaveInsightsView";
import { LeaveListView } from "@/components/hrm/leave/LeaveListView";
import { LeaveRequestDialog } from "@/components/hrm/leave/LeaveRequestDialog";
import { LeaveRequestPanel } from "@/components/hrm/leave/LeaveRequestPanel";
import { LeaveQuotaDialog } from "@/components/hrm/leave/LeaveQuotaDialog";
import { LeaveSummaryView } from "@/components/hrm/leave/LeaveSummaryView";

export default function LeaveModule() {
  const { role } = useHrmRole();
  const [addOpen, setAddOpen] = useState(false);
  const [quotaOpen, setQuotaOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const isTeamView = role === "supervisor" || role === "ceo";

  function bump() {
    setRefreshKey((current) => current + 1);
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError("");

    fetch("/api/leave?status=all")
      .then((response) => {
        if (!response.ok) throw new Error("failed to load");
        return response.json();
      })
      .then((payload) => {
        if (!cancelled) setItems(payload.items || []);
      })
      .catch(() => {
        if (!cancelled) setLoadError("ไม่สามารถโหลดรายการวันลาได้ กรุณาลองใหม่");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  function handleDecision(updatedItem) {
    setItems((current) => current.map((item) => (item.id === updatedItem.id ? updatedItem : item)));
    setNotice(updatedItem.statusCode === "approved" ? "อนุมัติคำขอลาเรียบร้อยแล้ว" : "ไม่อนุมัติคำขอลาเรียบร้อยแล้ว");
    bump();
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold leading-4 uppercase tracking-[0.08em] text-primary">HRM · Leave management</p>
          <h1 className="mt-2 text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl">การลา</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">ตรวจสอบสิทธิ์ ยื่นคำขอ และติดตามการลาของคุณ{isTeamView ? "และทีม" : ""}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button leadingIcon={RiAddLine} onClick={() => setAddOpen(true)}>ยื่นคำขอลา</Button>
        </div>
      </section>

      {notice ? (
        <div role="status" className="flex items-center justify-between gap-3 rounded-xl border border-status-success/25 bg-status-success/10 px-4 py-3 text-xs font-medium leading-5 text-status-success">
          <span>{notice}</span>
          <Button size="xs" variant="ghost" onClick={() => setNotice("")}>ปิด</Button>
        </div>
      ) : null}
      {loadError ? <p role="alert" className="rounded-xl border border-status-danger/25 bg-status-danger/10 px-4 py-3 text-xs leading-5 text-status-danger">{loadError}</p> : null}

      <section aria-labelledby="leave-balance-heading">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-xs font-semibold leading-4 uppercase tracking-[0.08em] text-muted-foreground">โควต้าประจำปี</p>
            <h2 id="leave-balance-heading" className="mt-1 text-base font-semibold leading-6 text-foreground sm:text-lg">สิทธิ์วันลาคงเหลือของฉัน</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">ปี {new Date().getFullYear() + 543}</span>
            {isTeamView ? <Button size="small" variant="outline" className="min-h-10" onClick={() => setQuotaOpen(true)}>ตั้งค่าโควตา</Button> : null}
          </div>
        </div>
        <LeaveSummaryView refreshKey={refreshKey} />
      </section>

      <section className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.95fr)]">
        <LeaveCalendarView items={items} isTeamView={isTeamView} />
        <LeaveRequestPanel items={items} loading={loading} role={role} onUpdated={handleDecision} />
      </section>

      <LeaveInsightsView items={items} isTeamView={isTeamView} />

      <section aria-labelledby="leave-history-heading">
        <div className="mb-3 flex items-center gap-2">
          <RiFileList3Line className="size-5 text-muted-foreground" aria-hidden="true" />
          <div>
            <h2 id="leave-history-heading" className="text-base font-semibold leading-6 text-foreground sm:text-lg">ประวัติการลา</h2>
            <p className="text-xs leading-5 text-muted-foreground">รายการคำขอทั้งหมดและสถานะล่าสุด</p>
          </div>
        </div>
        <LeaveListView
          items={items}
          loading={loading}
          onEdit={(item) => setEditTarget(item)}
          onCancelled={() => { bump(); setNotice("ยกเลิกคำขอลาเรียบร้อยแล้ว"); }}
        />
      </section>

      <LeaveRequestDialog
        open={addOpen}
        mode="create"
        onClose={() => setAddOpen(false)}
        onSaved={() => { bump(); setNotice("ส่งคำขอลาเรียบร้อยแล้ว รอการอนุมัติ"); }}
      />
      <LeaveRequestDialog
        open={Boolean(editTarget)}
        mode="edit"
        initialValues={editTarget}
        onClose={() => setEditTarget(null)}
        onSaved={() => { bump(); setNotice("บันทึกการแก้ไขคำขอลาเรียบร้อยแล้ว"); setEditTarget(null); }}
      />
      <LeaveQuotaDialog
        open={quotaOpen}
        onClose={() => setQuotaOpen(false)}
        onSaved={() => { bump(); setNotice("บันทึกโควต้าวันลาเรียบร้อยแล้ว"); }}
      />
    </div>
  );
}
