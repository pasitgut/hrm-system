"use client";

import { useState } from "react";
import { RiAddLine, RiCalendarCheckLine, RiFileList3Line } from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/badge";
import { useHrmRole } from "@/components/hrm/HrmShell";
import { HrmDialog } from "@/components/hrm/HrmDialog";
import { LeaveListView } from "@/components/hrm/leave/LeaveListView";
import { LeaveRequestDialog } from "@/components/hrm/leave/LeaveRequestDialog";
import { LeaveSummaryView } from "@/components/hrm/leave/LeaveSummaryView";

const ROLE_LABELS = { employee: "พนักงาน", supervisor: "หัวหน้างาน", ceo: "ผู้บริหาร" };

export default function LeaveModule() {
  const { role } = useHrmRole();
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [notice, setNotice] = useState("");

  function bump() {
    setRefreshKey((current) => current + 1);
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold leading-4 uppercase tracking-[0.08em] text-primary">People operations · Leave</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight leading-tight text-foreground sm:text-3xl">ระบบวันลา</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">ตรวจสอบโควตา ยื่นคำขอ และติดตามสถานะวันลาของคุณ</p>
        </div>
        <div className="flex items-center gap-2">
          <Chip color="cyan" variant="caption">บทบาท: {ROLE_LABELS[role] || role}</Chip>
          <Button leadingIcon={RiCalendarCheckLine} variant="secondary" onClick={() => setPolicyOpen(true)}>นโยบายการลา</Button>
          <Button leadingIcon={RiAddLine} onClick={() => setAddOpen(true)}>ขอลา</Button>
        </div>
      </section>
      {notice ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-xs font-medium leading-5 text-primary">
          <span>{notice}</span>
          <Button size="xs" variant="ghost" onClick={() => setNotice("")}>ปิด</Button>
        </div>
      ) : null}
      <section>
        <div className="mb-3">
          <p className="text-xs font-semibold leading-4 uppercase tracking-[0.08em] text-muted-foreground">โควต้าประจำปี</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight leading-6 text-foreground">โควต้าวันลาคงเหลือ</h2>
        </div>
        <LeaveSummaryView refreshKey={refreshKey} />
      </section>
      <section>
        <div className="mb-3 flex items-center gap-2">
          <RiFileList3Line className="size-5 text-muted-foreground" aria-hidden />
          <h2 className="text-lg font-semibold tracking-tight leading-6 text-foreground">ประวัติการลา</h2>
        </div>
        <LeaveListView
          refreshKey={refreshKey}
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
      <HrmDialog
        open={policyOpen}
        onClose={() => setPolicyOpen(false)}
        title="นโยบายการลา"
        description="ประเภทการลาและสิทธิ์การลาต่อปี"
        footer={<Button onClick={() => setPolicyOpen(false)}>เข้าใจแล้ว</Button>}
      >
        <div className="space-y-3 text-xs leading-5 text-muted-foreground">
          <div className="rounded-xl border border-border p-4">
            <strong className="text-sm font-medium leading-5 text-foreground">ลาป่วย</strong>
            <p className="mt-1">ใช้ได้ตามโควต้าประจำปี แนบใบรับรองแพทย์เมื่อหยุดต่อเนื่องหลายวัน</p>
          </div>
          <div className="rounded-xl border border-border p-4">
            <strong className="text-sm font-medium leading-5 text-foreground">ลาพักร้อน</strong>
            <p className="mt-1">แจ้งล่วงหน้าและรอการอนุมัติจากหัวหน้างานก่อนวันที่ลา</p>
          </div>
          <p>ดูรายละเอียดประเภทการลาทั้งหมดและโควต้าคงเหลือได้ที่การ์ดโควต้าด้านบน</p>
        </div>
      </HrmDialog>
    </div>
  );
}
