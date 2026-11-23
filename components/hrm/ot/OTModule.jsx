"use client";

import { useState } from "react";
import Link from "next/link";
import {
  RiAddLine,
  RiFileChartLine,
  RiFileList3Line,
  RiSettings4Line,
  RiShieldCheckLine,
} from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { useHrmRole } from "@/components/hrm/HrmShell";
import { PageHeader } from "@/components/hrm/PageHeader";
import { AddOtDialog } from "@/components/hrm/ot/AddOtDialog";
import { OtCalendarView } from "@/components/hrm/ot/OtCalendarView";
import { OtListView } from "@/components/hrm/ot/OtListView";
import { OtRequestPanel } from "@/components/hrm/ot/OtRequestPanel";
import { OtSummaryView } from "@/components/hrm/ot/OtSummaryView";
import { canAccessPage } from "@/lib/auth/page-access";
import { canManageOwnOtRequests, canViewReports } from "@/lib/auth/permissions";
import { canApproveOtData, canManageOtRates, canViewCompanyOtData } from "@/lib/auth/rolePermissionAccess";
import { normalizeRole } from "@/lib/auth/roles";

export default function OTModule() {
  const { role = "employee", permissions = [], isSystemAdmin = false } = useHrmRole() ?? {};
  const normalizedRole = isSystemAdmin ? "hr" : normalizeRole(role);

  const canRequestOwnOt = canManageOwnOtRequests(permissions);
  const canViewCompany = canViewCompanyOtData({ role: normalizedRole, permissions });
  const canApproveOt = canApproveOtData({ role: normalizedRole, permissions });
  const canOpenApprovals = canApproveOt && canAccessPage(permissions, "approvals");
  const canManageRates = canManageOtRates({ role: normalizedRole, permissions }) && canAccessPage(permissions, "settings");
  const canOpenReports = canViewReports(permissions) && canAccessPage(permissions, "reports");

  const viewMode = !canViewCompany
    ? "employee"
    : normalizedRole === "executive"
      ? "executive"
      : "hr";

  const [addOpen, setAddOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [notice, setNotice] = useState("");

  function announce(message) {
    setRefreshKey((current) => current + 1);
    setNotice(message);
  }

  const headerConfig = viewMode === "employee"
    ? {
        eyebrow: "Employee Self Service · OT",
        title: "การทำงานล่วงเวลาของฉัน",
        description: "สรุปชั่วโมง OT ส่วนตัว ยื่นคำขอ และติดตามผลการพิจารณา",
        actions: canRequestOwnOt ? (
          <Button leadingIcon={RiAddLine} onClick={() => setAddOpen(true)}>ยื่นคำขอ OT</Button>
        ) : null,
      }
    : viewMode === "executive"
      ? {
          eyebrow: "Executive Dashboard · OT",
          title: "ภาพรวมและอนุมัติ OT องค์กร",
          description: "ติดตามภาระชั่วโมงและงบประมาณ OT รายเดือน พร้อมพิจารณาอนุมัติคำขอขององค์กร",
          actions: (
            <>
              {canOpenReports ? (
                <Button asChild variant="outline" leadingIcon={RiFileChartLine}>
                  <Link href="/reports">ดูรายงานสรุป</Link>
                </Button>
              ) : null}
              {canOpenApprovals ? (
                <Button asChild leadingIcon={RiShieldCheckLine}>
                  <Link href="/approvals">ศูนย์อนุมัติ</Link>
                </Button>
              ) : null}
              {canRequestOwnOt ? (
                <Button
                  variant={canOpenApprovals ? "outline" : "default"}
                  leadingIcon={RiAddLine}
                  onClick={() => setAddOpen(true)}
                >
                  ยื่นคำขอ OT
                </Button>
              ) : null}
            </>
          ),
        }
      : {
          eyebrow: "HR Portal · OT",
          title: "จัดการการทำงานล่วงเวลา",
          description: "ตรวจสอบคำขอ คำนวณชั่วโมงและยอดจ่าย OT ตามฐานเงินเดือน และติดตามรายการทั้งบริษัท",
          actions: (
            <>
              {canManageRates ? (
                <Button asChild variant="outline" leadingIcon={RiSettings4Line}>
                  <Link href="/settings">ตั้งค่าเรท OT</Link>
                </Button>
              ) : null}
              {canOpenApprovals ? (
                <Button asChild variant="outline" leadingIcon={RiShieldCheckLine}>
                  <Link href="/approvals">คิวอนุมัติทั้งหมด</Link>
                </Button>
              ) : null}
              {canRequestOwnOt ? (
                <Button leadingIcon={RiAddLine} onClick={() => setAddOpen(true)}>ยื่นคำขอ OT</Button>
              ) : null}
            </>
          ),
        };

  const summarySection = (
    <section aria-labelledby="ot-summary-heading">
      <div className="mb-3">
        <p className="text-xs font-semibold leading-4 uppercase tracking-[0.08em] text-muted-foreground">
          {viewMode === "executive"
            ? "ภาพรวมงบประมาณและชั่วโมงทำงาน"
            : viewMode === "hr"
              ? "ภาพรวมและคำนวณค่า OT"
              : "ชั่วโมงทำงานล่วงเวลาส่วนตัว"}
        </p>
        <h2 id="ot-summary-heading" className="mt-1 text-base font-semibold leading-6 text-foreground sm:text-lg">
          {viewMode === "executive"
            ? "สรุปภาระชั่วโมงและงบประมาณ OT องค์กร"
            : viewMode === "hr"
              ? "สรุปชั่วโมงและคำนวณค่า OT ทั้งบริษัท"
              : "สรุปชั่วโมง OT ของฉัน"}
        </h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          {viewMode === "employee"
            ? "สรุปชั่วโมง OT ส่วนตัวรายเดือนแยกตามสถานะคำขอ (วันที่ 1 ถึงวันสุดท้ายของเดือน)"
            : "ดูชั่วโมงและยอด OT ที่อนุมัติรายเดือน (วันที่ 1 ถึงวันสุดท้ายของเดือน)"}
        </p>
      </div>
      <OtSummaryView refreshKey={refreshKey} mode={viewMode} />
    </section>
  );

  const calendarAndQueueSection = (
    <section className="grid min-w-0 items-start gap-4 lg:grid-cols-2">
      {viewMode === "employee" ? (
        <>
          <OtCalendarView
            refreshKey={refreshKey}
            eyebrow="ตารางเวลาส่วนตัว"
            title="ปฏิทิน OT ของฉัน"
          />
          <OtRequestPanel
            refreshKey={refreshKey}
            role={normalizedRole}
            permissions={permissions}
            canViewCompany={canViewCompany}
            title="คำขอ OT ล่าสุดของฉัน"
            description="ติดตามสถานะคำขอและผลการพิจารณา"
            onUpdated={() => announce("บันทึกผลการพิจารณาคำขอ OT แล้ว")}
          />
        </>
      ) : (
        <>
          <OtRequestPanel
            refreshKey={refreshKey}
            role={normalizedRole}
            permissions={permissions}
            canViewCompany={canViewCompany}
            title={viewMode === "executive" ? "รายการพิจารณาอนุมัติ OT" : "คิวตรวจสอบและอนุมัติ OT"}
            description={
              canApproveOt
                ? (viewMode === "executive"
                    ? "คำขอที่รอผู้บริหารพิจารณาอนุมัติหรือปฏิเสธ"
                    : "ตรวจสอบคำขอ OT จากพนักงานและบันทึกผลอนุมัติ")
                : "ติดตามรายการคำขอ OT ล่าสุดของบริษัท"
            }
            onUpdated={() => announce("บันทึกผลการพิจารณาคำขอ OT แล้ว")}
          />
          <OtCalendarView
            refreshKey={refreshKey}
            eyebrow={viewMode === "executive" ? "ตารางเวลาองค์กร" : "ตารางเวลาทั้งบริษัท"}
            title={viewMode === "executive" ? "ปฏิทิน OT องค์กร" : "ปฏิทิน OT ทั้งบริษัท"}
          />
        </>
      )}
    </section>
  );

  const historySection = (
    <section aria-labelledby="ot-history-heading">
      <div className="mb-3 flex items-center gap-2">
        <RiFileList3Line className="size-5 text-muted-foreground" aria-hidden="true" />
        <div>
          <h2 id="ot-history-heading" className="text-base font-semibold leading-6 text-foreground sm:text-lg">
            {viewMode === "executive"
              ? "รายการคำขอ OT ทั้งองค์กร"
              : viewMode === "hr"
                ? "ประวัติคำขอ OT ทั้งบริษัท"
                : "ประวัติคำขอ OT ของฉัน"}
          </h2>
          <p className="text-xs leading-5 text-muted-foreground">
            {viewMode === "employee"
              ? "ตรวจสอบรายการ แก้ไข หรือยกเลิกคำขอที่ยังรอจัดการ"
              : "ตรวจสอบรายการคำขอทั้งหมดและกรองตามสถานะการพิจารณา"}
          </p>
        </div>
      </div>
      <OtListView
        refreshKey={refreshKey}
        onEdit={setEditingItem}
        onCancelled={() => announce("ยกเลิกคำขอ OT เรียบร้อยแล้ว")}
      />
    </section>
  );

  return (
    <div className="hrm-page">
      <PageHeader
        eyebrow={headerConfig.eyebrow}
        title={headerConfig.title}
        description={headerConfig.description}
        actions={headerConfig.actions}
      />

      {notice ? (
        <div role="status" className="flex items-center justify-between gap-3 rounded-xl border border-status-success/25 bg-status-success/10 px-4 py-3 text-xs font-medium leading-5 text-status-success">
          <span>{notice}</span>
          <Button size="xs" variant="ghost" onClick={() => setNotice("")}>ปิด</Button>
        </div>
      ) : null}

      {viewMode === "employee" ? (
        <>
          {summarySection}
          {calendarAndQueueSection}
          {historySection}
        </>
      ) : viewMode === "executive" ? (
        <>
          {summarySection}
          {calendarAndQueueSection}
          {historySection}
        </>
      ) : (
        <>
          {calendarAndQueueSection}
          {summarySection}
          {historySection}
        </>
      )}

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
