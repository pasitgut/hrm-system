"use client";

import { useState } from "react";
import { RiAddLine, RiFileList3Line } from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { useHrmRole } from "@/components/hrm/HrmShell";
import { PageHeader } from "@/components/hrm/PageHeader";
import { AddOtDialog } from "@/components/hrm/ot/AddOtDialog";
import { OtCalendarView } from "@/components/hrm/ot/OtCalendarView";
import { OtListView } from "@/components/hrm/ot/OtListView";
import { OtRequestPanel } from "@/components/hrm/ot/OtRequestPanel";
import { OtSummaryView } from "@/components/hrm/ot/OtSummaryView";
import { canManageOwnOtRequests, canViewCompanyOt } from "@/lib/auth/permissions";

export default function OTModule() {
  const { permissions = [] } = useHrmRole();
  const canRequestOwnOt = canManageOwnOtRequests(permissions);
  const canViewTeam = canViewCompanyOt(permissions);
  const [addOpen, setAddOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [notice, setNotice] = useState("");

  function announce(message) {
    setRefreshKey((current) => current + 1);
    setNotice(message);
  }

  return (
    <div className="hrm-page">
      <PageHeader
        eyebrow="การทำงาน · OT"
        title="การทำงานล่วงเวลา"
        description={`ยื่นคำขอ OT ดูชั่วโมงที่ทำ และติดตามผลการพิจารณา${canViewTeam ? "ของทีม" : "ของคุณ"}`}
        actions={canRequestOwnOt ? <Button leadingIcon={RiAddLine} onClick={() => setAddOpen(true)}>ยื่นคำขอ OT</Button> : null}
      />

      {notice ? (
        <div role="status" className="flex items-center justify-between gap-3 rounded-xl border border-status-success/25 bg-status-success/10 px-4 py-3 text-xs font-medium leading-5 text-status-success">
          <span>{notice}</span>
          <Button size="xs" variant="ghost" onClick={() => setNotice("")}>ปิด</Button>
        </div>
      ) : null}

      <section className="grid min-w-0 items-start gap-4 lg:grid-cols-2">
        <OtCalendarView refreshKey={refreshKey} />
        <OtRequestPanel refreshKey={refreshKey} permissions={permissions} onUpdated={() => announce("บันทึกผลการพิจารณาคำขอ OT แล้ว")} />
      </section>

      <section aria-labelledby="ot-summary-heading">
        <div className="mb-3">
          <p className="text-xs font-semibold leading-4 uppercase tracking-[0.08em] text-muted-foreground">ภาพรวมชั่วโมงทำงาน</p>
          <h2 id="ot-summary-heading" className="mt-1 text-base font-semibold leading-6 text-foreground sm:text-lg">สรุป OT</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">ดูชั่วโมงและยอด OT ที่อนุมัติตามงวดเงินเดือน 26–25</p>
        </div>
        <OtSummaryView refreshKey={refreshKey} />
      </section>

      <section aria-labelledby="ot-history-heading">
        <div className="mb-3 flex items-center gap-2">
          <RiFileList3Line className="size-5 text-muted-foreground" aria-hidden="true" />
          <div>
            <h2 id="ot-history-heading" className="text-base font-semibold leading-6 text-foreground sm:text-lg">ประวัติคำขอ OT</h2>
            <p className="text-xs leading-5 text-muted-foreground">ตรวจสอบรายการ แก้ไข หรือยกเลิกคำขอที่ยังรอจัดการ</p>
          </div>
        </div>
        <OtListView refreshKey={refreshKey} onEdit={setEditingItem} onCancelled={() => announce("ยกเลิกคำขอ OT เรียบร้อยแล้ว")} />
      </section>

      {canRequestOwnOt ? (
        <AddOtDialog
          open={addOpen}
          onClose={() => setAddOpen(false)}
          onCreated={() => { announce("ส่งคำขอ OT เรียบร้อยแล้ว สถานะรอจัดการ"); }}
        />
      ) : null}
      <AddOtDialog
        open={Boolean(editingItem)}
        editingItem={editingItem}
        onClose={() => setEditingItem(null)}
        onUpdated={() => { announce("แก้ไขคำขอ OT เรียบร้อยแล้ว"); setEditingItem(null); }}
      />
    </div>
  );
}
