"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  RiArrowRightLine,
  RiCalendarEventLine,
  RiCalendarCheckLine,
  RiCalendarTodoLine,
  RiCheckLine,
  RiFileChartLine,
  RiTimeLine,
  RiTimerLine,
  RiUserSharedLine,
} from "@remixicon/react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/badge";
import { useHrmRole } from "@/components/hrm/HrmShell";
import CostBreakdown from "@/components/hrm/payroll/CostBreakdown";
import { cx } from "@/utils/cx";

const requests = [
  { initials: "อช", color: "blue", name: "อรทัย ชูใจ", type: "ลาพักร้อน", range: "22/09/2569 – 24/09/2569 · 3 วัน", reason: "ท่องเที่ยวต่างจังหวัด", code: "LV-69-0912" },
  { initials: "รน", color: "pink", name: "ธนากร มั่นคง", type: "ลาป่วย", range: "17/09/2569 · 1 วัน", reason: "มีไข้ แนบใบรับรองแพทย์", code: "LV-69-0915" },
  { initials: "ปแ", color: "lime", name: "ปิยะนุช แก้วใส", type: "ลากิจ", range: "25/09/2569 · ครึ่งวัน", reason: "ติดต่อราชการ", code: "LV-69-0916" },
];

const MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const WEEKDAYS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const TODAY_KEY = "2026-09-21";

const calendarEvents = {
  "2026-09-03": [{ type: "leave", title: "ลาป่วย", detail: "ธนากร มั่นคง · 1 วัน" }],
  "2026-09-04": [{ type: "leave", title: "ลาป่วย", detail: "ธนากร มั่นคง · 1 วัน" }],
  "2026-09-08": [{ type: "leave", title: "ลากิจ", detail: "ปิยะนุช แก้วใส · เต็มวัน" }],
  "2026-09-09": [{ type: "leave", title: "ลากิจ", detail: "ปิยะนุช แก้วใส · เต็มวัน" }],
  "2026-09-10": [{ type: "leave", title: "ลากิจ", detail: "ปิยะนุช แก้วใส · เต็มวัน" }],
  "2026-09-14": [{ type: "holiday", title: "วันหยุดบริษัท", detail: "วันหยุดประจำบริษัท" }],
  "2026-09-15": [{ type: "holiday", title: "วันหยุดบริษัท", detail: "วันหยุดประจำบริษัท" }],
  "2026-09-16": [{ type: "holiday", title: "วันหยุดบริษัท", detail: "วันหยุดประจำบริษัท" }],
  "2026-09-17": [{ type: "ot", title: "คำขอ OT", detail: "ธนากร มั่นคง · 18:00 – 20:00" }, { type: "holiday", title: "วันหยุดบริษัท", detail: "วันหยุดประจำบริษัท" }],
  "2026-09-18": [{ type: "holiday", title: "วันหยุดบริษัท", detail: "วันหยุดประจำบริษัท" }],
  "2026-09-19": [{ type: "holiday", title: "วันหยุดบริษัท", detail: "วันหยุดประจำบริษัท" }],
  "2026-09-20": [{ type: "holiday", title: "วันหยุดบริษัท", detail: "วันหยุดประจำบริษัท" }],
  "2026-09-21": [{ type: "holiday", title: "วันหยุดบริษัท", detail: "วันหยุดประจำบริษัท" }],
  "2026-09-22": [{ type: "leave", title: "ลาพักร้อน", detail: "อรทัย ชูใจ · วันที่ 1 จาก 3 วัน" }, { type: "holiday", title: "วันหยุดบริษัท", detail: "วันหยุดประจำบริษัท" }],
  "2026-09-23": [{ type: "leave", title: "ลาพักร้อน", detail: "อรทัย ชูใจ · วันที่ 2 จาก 3 วัน" }],
  "2026-09-24": [{ type: "leave", title: "ลาพักร้อน", detail: "อรทัย ชูใจ · วันที่ 3 จาก 3 วัน" }, { type: "holiday", title: "วันหยุดบริษัท", detail: "วันหยุดประจำบริษัท" }],
  "2026-09-25": [{ type: "leave", title: "ลากิจ", detail: "ปิยะนุช แก้วใส · ครึ่งวัน" }],
  "2026-09-26": [{ type: "holiday", title: "วันหยุดบริษัท", detail: "วันหยุดประจำบริษัท" }],
  "2026-09-29": [{ type: "leave", title: "ลากิจ", detail: "ทีม Operations · 1 วัน" }],
  "2026-09-30": [{ type: "leave", title: "ลากิจ", detail: "ทีม Operations · 1 วัน" }],
};

const eventStyles = {
  leave: { bar: "bg-status-success/10", chip: "lime" },
  ot: { bar: "bg-status-info/10", chip: "cyan" },
  holiday: { bar: "bg-status-violet/10", chip: "purple" },
};

function dateKey(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseDateKey(key) {
  const [year, month, day] = key.split("-").map(Number);
  return { year, month: month - 1, day };
}

function thaiDateLabel(key) {
  const { year, month, day } = parseDateKey(key);
  return `${day} ${MONTHS[month]} ${year + 543}`;
}

function Metric({ icon: Icon, label, value, unit, hint, color, progress }) {
  return (
    <article className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex items-center justify-between gap-3"><div className={cx("hrm-icon-tile", color)}><Icon className="size-5" aria-hidden /></div><span className="text-xs leading-4 text-muted-foreground">{label}</span></div>
      <div className="mt-4 flex items-baseline gap-2"><strong className="text-2xl font-semibold tracking-tight leading-tight text-foreground">{value}</strong><span className="text-xs leading-4 text-muted-foreground">{unit}</span></div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${color}`} style={{ width: `${progress}%` }} /></div>
      <p className="mt-2 text-[11px] leading-4 text-muted-foreground">{hint}</p>
    </article>
  );
}

function Calendar() {
  const router = useRouter();
  const [viewDate, setViewDate] = useState(() => new Date(Date.UTC(2026, 8, 1)));
  const [selectedDate, setSelectedDate] = useState(TODAY_KEY);
  const year = viewDate.getUTCFullYear();
  const month = viewDate.getUTCMonth();
  const monthTitle = `${MONTHS[month]} ${year + 543}`;
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const firstDay = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const cells = useMemo(() => {
    const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;
    return Array.from({ length: totalCells }, (_, index) => index < firstDay || index >= firstDay + daysInMonth ? null : index - firstDay + 1);
  }, [daysInMonth, firstDay]);
  const selectedEvents = calendarEvents[selectedDate] || [];

  const changeMonth = (offset) => {
    const next = new Date(Date.UTC(year, month + offset, 1));
    setViewDate(next);
    setSelectedDate(dateKey(next.getUTCFullYear(), next.getUTCMonth(), 1));
  };

  const goToToday = () => {
    setViewDate(new Date(Date.UTC(2026, 8, 1)));
    setSelectedDate(TODAY_KEY);
  };

  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-semibold leading-4 uppercase tracking-[0.08em] text-muted-foreground">ตารางเวลา</p><h2 className="mt-1 text-lg font-semibold tracking-tight leading-6 text-foreground">ปฏิทินการลาและ OT</h2></div><div className="flex items-center gap-2"><Button size="xs" variant="secondary" aria-label="เดือนก่อน" onClick={() => changeMonth(-1)}>‹</Button><span className="min-w-28 text-center text-xs font-medium leading-5 text-muted-foreground">{monthTitle}</span><Button size="xs" variant="secondary" aria-label="เดือนถัดไป" onClick={() => changeMonth(1)}>›</Button><Button size="xs" variant="ghost" onClick={goToToday}>วันนี้</Button></div></div>
      <div className="mt-5 grid grid-cols-7 gap-1.5 text-center sm:gap-2">{WEEKDAYS.map((day) => <span key={day} className="pb-1 text-[11px] font-semibold leading-4 text-muted-foreground">{day}</span>)}{cells.map((day, index) => { const key = day ? dateKey(year, month, day) : `empty-${index}`; const events = day ? calendarEvents[key] || [] : []; const selected = key === selectedDate; return day ? <button type="button" key={key} aria-label={`${thaiDateLabel(key)}${events.length ? ` มี ${events.length} รายการ` : ""}`} aria-current={selected ? "date" : undefined} onClick={() => setSelectedDate(key)} className={cx("min-h-12 rounded-xl border p-1.5 text-left transition-colors", "border-border bg-card hover:border-ring hover:bg-accent", selected && "ring-2 ring-ring ring-offset-1", key === TODAY_KEY && !selected && "border-ring")}><span className="flex items-center justify-between gap-1"><span className={cx("text-[11px] leading-4", selected ? "font-semibold text-primary" : "text-muted-foreground")}>{day}</span>{key === TODAY_KEY ? <><span className="hidden text-[10px] font-medium text-primary sm:inline">วันนี้</span><span className="size-1.5 rounded-full bg-primary sm:hidden" aria-hidden="true" /></> : null}</span>{events.map((event, eventIndex) => <span className={cx("mt-1 block h-1.5 rounded-full", eventStyles[event.type].bar)} key={`${key}-${event.type}-${eventIndex}`} />)}</button> : <span key={key} aria-hidden className="min-h-12 rounded-xl border border-transparent p-1.5" />; })}</div>
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t border-border pt-3 text-[11px] leading-4 text-muted-foreground"><span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-status-success/10" />วันลา</span><span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-status-info/10" />OT</span><span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-status-violet/10" />วันหยุดบริษัท</span></div>
      <div className="mt-4 border-t border-border pt-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-semibold leading-4 uppercase tracking-[0.08em] text-muted-foreground">วันที่เลือก</p><p className="mt-1 text-sm font-medium leading-5 text-foreground">{thaiDateLabel(selectedDate)}</p></div><Chip variant="caption" color={selectedEvents.length ? "cyan" : "neutral"}>{selectedEvents.length ? `${selectedEvents.length} รายการ` : "ไม่มีรายการ"}</Chip></div>{selectedEvents.length ? <div className="mt-3 divide-y divide-border">{selectedEvents.map((event, index) => <div className="flex flex-col gap-2 py-3 first:pt-0 sm:flex-row sm:items-center sm:justify-between" key={`${event.title}-${index}`}><div className="flex min-w-0 items-start gap-2"><span className={cx("mt-1.5 size-2 shrink-0 rounded-full", eventStyles[event.type].bar)} /><div><strong className="block text-xs font-medium leading-5 text-foreground">{event.title}</strong><span className="text-xs leading-4 text-muted-foreground">{event.detail}</span></div></div>{event.type === "ot" || event.type === "leave" ? <Button size="xs" variant="ghost" trailingIcon={RiArrowRightLine} onClick={() => router.push(event.type === "ot" ? "/ot" : "/leave")}>ดูรายละเอียด</Button> : null}</div>)}</div> : <p className="mt-3 text-xs leading-5 text-muted-foreground">ไม่มีคำขอหรือกิจกรรมในวันนี้</p>}</div>
    </section>
  );
}

function ApprovalList() {
  const router = useRouter();
  const [first, ...rest] = requests;
  const [statuses, setStatuses] = useState({});
  const [notice, setNotice] = useState("");
  const takeAction = (code, status) => {
    setStatuses((current) => ({ ...current, [code]: status }));
    setNotice(`${status}คำขอ ${code} แล้ว`);
  };
  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold leading-4 uppercase tracking-[0.08em] text-muted-foreground">หัวหน้างาน</p><h2 className="mt-1 text-lg font-semibold tracking-tight leading-6 text-foreground">คำขอรออนุมัติ</h2></div><Badge color="primary">4 รายการ</Badge></div>
      <div className="mt-4 divide-y divide-border">{[first, ...rest].map((item) => { const status = statuses[item.code] || "รออนุมัติ"; const resolved = status !== "รออนุมัติ"; return <div key={item.code} className="flex gap-3 py-3 first:pt-0 last:pb-0"><Avatar initials={item.initials} color={item.color} size="md" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><strong className="text-sm font-medium leading-5 text-foreground">{item.name}</strong><Chip variant="caption" color={resolved ? (status === "อนุมัติแล้ว" ? "lime" : "rose") : item.color === "pink" ? "rose" : item.color}>{resolved ? status : item.type}</Chip></div><p className="mt-1 text-xs leading-4 text-muted-foreground">{item.range}</p><p className="mt-1 text-[11px] leading-4 text-muted-foreground">{item.reason}</p><div className="mt-2 flex gap-2"><Button size="xs" leadingIcon={RiCheckLine} onClick={() => takeAction(item.code, "อนุมัติแล้ว")} isDisabled={resolved}>อนุมัติ</Button><Button size="xs" variant="secondary" onClick={() => takeAction(item.code, "ไม่อนุมัติ")} isDisabled={resolved}>ไม่อนุมัติ</Button></div></div></div>; })}</div>
      {notice ? <p className="mt-3 text-xs leading-4 text-status-success" role="status">{notice}</p> : null}
      <Button variant="ghost" size="small" trailingIcon={RiArrowRightLine} className="mt-4" onClick={() => router.push("/approvals")}>ดูรายการทั้งหมด</Button>
    </section>
  );
}

export default function OverviewPage() {
  const router = useRouter();
  const { role } = useHrmRole();
  return (
    <div className="space-y-6">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-xs font-semibold leading-4 uppercase tracking-[0.08em] text-primary">วันจันทร์ 21 กันยายน 2569</p><h1 className="mt-2 text-2xl font-semibold tracking-tight leading-tight text-foreground sm:text-3xl">สวัสดีตอนเช้า, นภัสสร</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">จัดการเวลาทำงาน วันลา และคำขอของทีมได้จากที่เดียว</p></div><div className="flex flex-wrap gap-2"><Button variant="secondary" leadingIcon={RiFileChartLine} onClick={() => router.push("/reports")}>ดูรายงาน</Button><Button leadingIcon={RiTimerLine} onClick={() => router.push("/ot")}>สร้างคำขอ OT</Button></div></section>
      {role === "manager" ? <div className="flex flex-col gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><div className="hrm-soft-icon"><RiUserSharedLine className="size-5" aria-hidden /></div><div><strong className="block text-sm font-medium leading-5 text-foreground">มีคำขอรออนุมัติ 4 รายการ</strong><span className="text-xs leading-4 text-muted-foreground">ตรวจสอบคำขอลาของทีมคุณให้เสร็จภายในวันนี้</span></div></div><Button variant="ghost" trailingIcon={RiArrowRightLine} onClick={() => router.push("/approvals")}>ตรวจสอบรายการ</Button></div> : null}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Metric icon={RiCalendarCheckLine} label="วันลาคงเหลือ" value="12.5" unit="วัน" hint="จากสิทธิ์ทั้งหมด 18 วัน" color="bg-chart-1" progress={69} /><Metric icon={RiTimerLine} label="ชั่วโมง OT เดือนนี้" value="8.5" unit="ชม." hint="เป้าหมายไม่เกิน 20 ชั่วโมง" color="bg-chart-2" progress={43} /><Metric icon={RiTimeLine} label="เวลาทำงานเดือนนี้" value="152" unit="ชม." hint="เฉลี่ย 8.4 ชม. / วัน" color="bg-chart-3" progress={76} /><Metric icon={RiCalendarTodoLine} label="Shift ถัดไป" value="09:00" unit="น." hint="อังคาร 22 ก.ย. · ออฟฟิศ" color="bg-chart-4" progress={100} /></section>
      <section>
        <div className="mb-3 flex items-end justify-between">
          <div><p className="text-xs font-semibold leading-4 uppercase tracking-[0.08em] text-muted-foreground">ภาพรวมของคุณ</p><h2 className="mt-1 text-lg font-semibold tracking-tight leading-6 text-foreground">งานที่กำลังดำเนินการ</h2></div>
          <span className="text-xs leading-4 text-muted-foreground">อัปเดตล่าสุดเมื่อสักครู่นี้</span>
        </div>
        <div className={cx("grid gap-4", role === "ceo" && "2xl:grid-cols-[minmax(0,1fr)_19rem]")}>
          <div className="grid min-w-0 gap-4 xl:grid-cols-[1.08fr_.92fr]">
            <Calendar />
            <ApprovalList />
          </div>
          {role === "ceo" ? <CostBreakdown /> : null}
        </div>
      </section>
    </div>
  );
}
