"use client";

import { useState } from "react";
import { RiAddLine, RiCalendarTodoLine, RiFileList3Line, RiPieChartLine } from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/badge";
import { Tab, TabList, TabPanel, Tabs } from "@/components/ui/tabs";
import { useHrmRole } from "@/components/hrm/HrmShell";
import { AddOtDialog } from "@/components/hrm/ot/AddOtDialog";
import { OtCalendarView } from "@/components/hrm/ot/OtCalendarView";
import { OtListView } from "@/components/hrm/ot/OtListView";
import { OtSummaryView } from "@/components/hrm/ot/OtSummaryView";

const ROLE_LABELS = { employee: "พนักงาน", supervisor: "หัวหน้างาน", ceo: "ผู้บริหาร" };

export default function OTModule() {
  const { role } = useHrmRole();
  const [addOpen, setAddOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [notice, setNotice] = useState("");

  function handleCreated() {
    setRefreshKey((current) => current + 1);
    setNotice("ส่งคำขอ OT เรียบร้อยแล้ว รอการอนุมัติ");
  }

  function handleUpdated() {
    setRefreshKey((current) => current + 1);
    setNotice("แก้ไขคำขอ OT เรียบร้อยแล้ว");
  }

  function handleCancelled() {
    setRefreshKey((current) => current + 1);
    setNotice("ยกเลิกคำขอ OT เรียบร้อยแล้ว");
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold leading-4 uppercase tracking-[0.08em] text-primary">Work management · OT</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight leading-tight text-foreground sm:text-3xl">ระบบ OT</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">บันทึกและติดตามเวลาทำงานล่วงเวลาของคุณให้ครบในโมดูลเดียว</p>
        </div>
        <div className="flex items-center gap-2">
          <Chip color="cyan" variant="caption">บทบาท: {ROLE_LABELS[role] || role}</Chip>
          <Button leadingIcon={RiAddLine} onClick={() => setAddOpen(true)}>เพิ่ม OT</Button>
        </div>
      </section>
      {notice ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-xs font-medium leading-5 text-primary">
          <span>{notice}</span>
          <Button size="xs" variant="ghost" onClick={() => setNotice("")}>ปิด</Button>
        </div>
      ) : null}
      <Tabs defaultSelectedKey="calendar">
        <TabList aria-label="เมนูระบบ OT">
          <Tab id="calendar" icon={RiCalendarTodoLine}>ปฏิทิน</Tab>
          <Tab id="list" icon={RiFileList3Line}>รายการ</Tab>
          <Tab id="summary" icon={RiPieChartLine}>สรุป</Tab>
        </TabList>
        <TabPanel id="calendar"><OtCalendarView refreshKey={refreshKey} /></TabPanel>
        <TabPanel id="list">
          <OtListView refreshKey={refreshKey} onEdit={setEditingItem} onCancelled={handleCancelled} />
        </TabPanel>
        <TabPanel id="summary"><OtSummaryView refreshKey={refreshKey} /></TabPanel>
      </Tabs>
      <AddOtDialog open={addOpen} onClose={() => setAddOpen(false)} onCreated={handleCreated} />
      <AddOtDialog
        open={Boolean(editingItem)}
        editingItem={editingItem}
        onClose={() => setEditingItem(null)}
        onUpdated={handleUpdated}
      />
    </div>
  );
}
