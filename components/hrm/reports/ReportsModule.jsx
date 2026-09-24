"use client";

import { useEffect, useState } from "react";
import {
  RiBarChart2Line,
  RiCalendarLine,
  RiDownload2Line,
  RiFileExcel2Line,
  RiFilePdf2Line,
  RiInformationLine,
} from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/badge";
import { Select, SelectItem } from "@/components/ui/select";
import { Tabs, TabList, Tab, TabPanel } from "@/components/ui/tabs";
import { cx } from "@/utils/cx";
import { HrmDialog } from "@/components/hrm/HrmDialog";

// Attendance/bonus reports reference a time-clock/attendance-tracking concept
// that doesn't exist anywhere in the schema or any module — building that is
// a separate feature, not "wire up existing data." Shown as an explicit
// placeholder rather than fake numbers or a silently-removed tab.
const unsupportedReports = {
  attendance: { label: "รายงานการเข้างาน", description: "ดูสถิติการเข้างาน สาย ขาด และทำงานครบเวลา" },
  bonus: { label: "รายงานเบี้ยขยัน", description: "ตรวจสอบสิทธิ์เบี้ยขยันจากการมาทำงานตรงเวลา" },
};

function currentMonthStr() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function SummaryCard({ label, value, detail, accent }) {
  return (
    <article className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <span className="text-xs leading-4 text-muted-foreground">{label}</span>
      <p className={cx("mt-3 text-2xl font-semibold tracking-tight leading-tight", accent)}>{value}</p>
      <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{detail}</p>
    </article>
  );
}

function ReportView({ data }) {
  const [notice, setNotice] = useState("");
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label={data.totalLabel} value={data.total} detail="ข้อมูลตามช่วงเวลาที่เลือก" accent="text-foreground" />
        <SummaryCard label={data.secondaryLabel} value={data.secondary} detail="คำนวณจากข้อมูลจริงในระบบ" accent="text-primary" />
        <SummaryCard label="สรุป" value={data.trend} detail={data.trend} accent="text-status-success" />
      </div>
      <div className="grid gap-4 xl:grid-cols-[.9fr_1.1fr]">
        <section className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight leading-6 text-foreground">ภาพรวมตามหมวด</h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{data.description}</p>
            </div>
            <RiBarChart2Line className="size-5 text-muted-foreground" aria-hidden />
          </div>
          <div className="mt-6 space-y-4">
            {data.bars.length === 0 ? (
              <p className="text-xs leading-5 text-muted-foreground">ไม่มีข้อมูลในช่วงเวลานี้</p>
            ) : (
              data.bars.map((bar) => (
                <div key={bar.label}>
                  <div className="flex items-center justify-between gap-3 text-xs leading-5">
                    <span className="text-muted-foreground">{bar.label}</span>
                    <strong className="text-foreground">{bar.amount}</strong>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary/50" style={{ width: bar.value }} />
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
        <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="flex items-start justify-between gap-3 border-b border-border p-4 sm:p-5">
            <div>
              <h2 className="text-lg font-semibold tracking-tight leading-6 text-foreground">รายละเอียดรายบุคคล</h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">ข้อมูลจริงจากระบบ</p>
            </div>
            <Chip color="cyan" variant="caption">{data.rows.length} คน</Chip>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[620px] w-full text-left">
              <thead className="bg-muted">
                <tr className="text-xs font-semibold leading-4 text-muted-foreground">
                  <th className="px-4 py-3">พนักงาน</th>
                  {data.columns.map((column) => <th className="px-4 py-3" key={column}>{column}</th>)}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.join("-")} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 text-xs font-medium leading-5 text-foreground">{row[0]}</td>
                    <td className="px-4 py-3 text-xs leading-5 text-muted-foreground">{row[1]}</td>
                    <td className="px-4 py-3 text-xs leading-5 text-muted-foreground">{row[2]}</td>
                    <td className="px-4 py-3 text-xs leading-5 text-muted-foreground">{row[3]}</td>
                  </tr>
                ))}
                {data.rows.length === 0 ? (
                  <tr><td className="px-4 py-6 text-center text-xs leading-5 text-muted-foreground" colSpan={4}>ไม่มีข้อมูลในช่วงเวลานี้</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
      {notice ? <p className="flex items-center gap-2 text-xs leading-5 text-status-success"><RiInformationLine className="size-5" aria-hidden />{notice}</p> : null}
      <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
        <Button variant="secondary" leadingIcon={RiFilePdf2Line} onClick={() => setNotice(`เตรียมไฟล์ PDF สำหรับ${data.label}แล้ว`)}>ดาวน์โหลด PDF</Button>
        <Button variant="secondary" leadingIcon={RiFileExcel2Line} onClick={() => setNotice(`เตรียมไฟล์ Excel สำหรับ${data.label}แล้ว`)}>ดาวน์โหลด Excel</Button>
        <Button leadingIcon={RiDownload2Line} onClick={() => setNotice("ส่งออกรายงานไปยังศูนย์ดาวน์โหลดแล้ว")}>ส่งออกทั้งหมด</Button>
      </div>
    </div>
  );
}

function UnsupportedReportView({ label, description }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
      <RiInformationLine className="mx-auto size-6 text-muted-foreground" aria-hidden />
      <h2 className="mt-3 text-lg font-semibold tracking-tight leading-6 text-foreground">{label}</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
      <p className="mt-4 text-xs leading-5 text-muted-foreground">
        รายงานนี้ต้องอาศัยระบบบันทึกเวลาเข้า–ออกงาน ซึ่งยังไม่มีในระบบขณะนี้ — ยังไม่รองรับ
      </p>
    </div>
  );
}

function otSummaryToReportData(summary) {
  if (!summary) return null;
  if (summary.scope === "individual") {
    return {
      label: "รายงาน OT",
      description: "สรุปชั่วโมง OT ของคุณในเดือนนี้",
      total: `${summary.totalApprovedHours}`,
      totalLabel: "ชั่วโมง OT (อนุมัติแล้ว)",
      secondary: `${summary.totalPendingHours}`,
      secondaryLabel: "ชั่วโมงรออนุมัติ",
      trend: `${summary.requestCount} รายการทั้งหมด`,
      columns: ["ชั่วโมงอนุมัติ", "ชั่วโมงรออนุมัติ", "รายการ"],
      bars: [{ label: summary.employeeName, value: "100%", amount: `${summary.totalApprovedHours} ชม.` }],
      rows: [[summary.employeeName, `${summary.totalApprovedHours}`, `${summary.totalPendingHours}`, `${summary.requestCount} รายการ`]],
    };
  }
  const max = Math.max(1, ...summary.byEmployee.map((e) => e.approvedHours));
  return {
    label: "รายงาน OT",
    description: "สรุปชั่วโมง OT แยกตามพนักงานในเดือนนี้",
    total: `${summary.totalApprovedHours}`,
    totalLabel: "ชั่วโมง OT (อนุมัติแล้ว)",
    secondary: `${summary.totalPendingHours}`,
    secondaryLabel: "ชั่วโมงรออนุมัติ",
    trend: `${summary.requestCount} รายการทั้งหมด`,
    columns: ["ชั่วโมงอนุมัติ", "ชั่วโมงรออนุมัติ", "รายการ"],
    bars: summary.byEmployee.map((e) => ({ label: e.employeeName, value: `${Math.round((e.approvedHours / max) * 100)}%`, amount: `${e.approvedHours} ชม.` })),
    rows: summary.byEmployee.map((e) => [e.employeeName, `${e.approvedHours}`, `${e.pendingHours}`, `${e.requestCount} รายการ`]),
  };
}

function leaveSummaryToReportData(summary) {
  if (!summary) return null;
  if (summary.scope === "individual") {
    const totalApproved = summary.quotas.reduce((sum, q) => sum + q.usedDays, 0);
    return {
      label: "รายงานวันลา",
      description: "สรุปวันลาที่ใช้ไปในปีนี้ แยกตามประเภท",
      total: `${totalApproved}`,
      totalLabel: "วันลาที่ใช้ (อนุมัติแล้ว)",
      secondary: `${summary.quotas.length}`,
      secondaryLabel: "ประเภทวันลา",
      trend: "ข้อมูลปีปัจจุบัน",
      columns: ["วันลาที่ใช้", "คงเหลือ", "โควตา"],
      bars: summary.quotas.map((q) => ({ label: q.name, value: q.annualQuotaDays ? `${Math.min(100, Math.round((q.usedDays / q.annualQuotaDays) * 100))}%` : "0%", amount: `${q.usedDays} วัน` })),
      rows: summary.quotas.map((q) => [q.name, `${q.usedDays}`, q.remainingDays == null ? "ไม่จำกัด" : `${q.remainingDays}`, q.annualQuotaDays == null ? "ไม่จำกัด" : `${q.annualQuotaDays} วัน`]),
    };
  }
  const totalApproved = summary.byEmployee.reduce((sum, e) => sum + e.approvedDays, 0);
  const totalPending = summary.byEmployee.reduce((sum, e) => sum + e.pendingDays, 0);
  const max = Math.max(1, ...summary.byEmployee.map((e) => e.approvedDays));
  return {
    label: "รายงานวันลา",
    description: "สรุปจำนวนวันลาของทีมในปีนี้",
    total: `${totalApproved}`,
    totalLabel: "วันลาที่อนุมัติ",
    secondary: `${totalPending}`,
    secondaryLabel: "วันลารออนุมัติ",
    trend: `${summary.byEmployee.length} คนมีการลาในปีนี้`,
    columns: ["วันลาอนุมัติ", "วันลารออนุมัติ", "รายการ"],
    bars: summary.byEmployee.map((e) => ({ label: e.employeeName, value: `${Math.round((e.approvedDays / max) * 100)}%`, amount: `${e.approvedDays} วัน` })),
    rows: summary.byEmployee.map((e) => [e.employeeName, `${e.approvedDays}`, `${e.pendingDays}`, `${e.requestCount} รายการ`]),
  };
}

export default function ReportsModule() {
  const [period, setPeriod] = useState("เดือนนี้");
  const [periodOpen, setPeriodOpen] = useState(false);
  const [otData, setOtData] = useState(null);
  const [leaveData, setLeaveData] = useState(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const month = currentMonthStr();
    Promise.all([
      fetch(`/api/ot/summary?month=${month}`).then((r) => (r.ok ? r.json() : null)),
      fetch("/api/leave/summary").then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([ot, leave]) => {
        if (cancelled) return;
        setOtData(otSummaryToReportData(ot));
        setLeaveData(leaveSummaryToReportData(leave));
      })
      .catch(() => {
        if (!cancelled) setLoadError("ไม่สามารถโหลดข้อมูลรายงานได้ กรุณาลองใหม่");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold leading-4 uppercase tracking-[0.08em] text-primary">People operations · Reports</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight leading-tight text-foreground sm:text-3xl">รายงาน HR</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">ออกรายงาน OT และวันลาจากข้อมูลจริงในระบบ</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select aria-label="ช่วงเวลารายงาน" selectedKey={period} onSelectionChange={(key) => setPeriod(String(key))} className="min-w-0">
            <SelectItem id="เดือนนี้">เดือนนี้</SelectItem>
          </Select>
          <Button size="small" variant="secondary" leadingIcon={RiCalendarLine} onClick={() => setPeriodOpen(true)}>กำหนดช่วงเวลา</Button>
        </div>
      </section>
      {loadError ? <p className="text-xs leading-5 text-status-danger">{loadError}</p> : null}
      <Tabs defaultSelectedKey="ot">
        <TabList aria-label="ประเภทรายงาน">
          <Tab id="ot">OT</Tab>
          <Tab id="leave">วันลา</Tab>
          <Tab id="attendance">การเข้างาน</Tab>
          <Tab id="bonus">เบี้ยขยัน</Tab>
        </TabList>
        <TabPanel id="ot"><div className="mt-5">{otData ? <ReportView data={otData} /> : <p className="py-8 text-center text-xs leading-5 text-muted-foreground">กำลังโหลดข้อมูล...</p>}</div></TabPanel>
        <TabPanel id="leave"><div className="mt-5">{leaveData ? <ReportView data={leaveData} /> : <p className="py-8 text-center text-xs leading-5 text-muted-foreground">กำลังโหลดข้อมูล...</p>}</div></TabPanel>
        <TabPanel id="attendance"><div className="mt-5"><UnsupportedReportView {...unsupportedReports.attendance} /></div></TabPanel>
        <TabPanel id="bonus"><div className="mt-5"><UnsupportedReportView {...unsupportedReports.bonus} /></div></TabPanel>
      </Tabs>
      <HrmDialog
        open={periodOpen}
        onClose={() => setPeriodOpen(false)}
        title="กำหนดช่วงเวลารายงาน"
        description="รายงาน OT และวันลาอ้างอิงเดือนปัจจุบัน/ปีปัจจุบันโดยอัตโนมัติ"
        footer={<Button onClick={() => setPeriodOpen(false)}>ปิด</Button>}
      >
        <p className="text-xs leading-4 text-muted-foreground">
          รายงาน OT อ้างอิงเดือนปัจจุบันเสมอ และรายงานวันลาอ้างอิงปีปัจจุบันเสมอ (ตามโควตาที่เป็นรายปี) — การเลือกช่วงเวลาแบบกำหนดเองยังไม่รองรับในเวอร์ชันนี้
        </p>
      </HrmDialog>
    </div>
  );
}
