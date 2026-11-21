"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { RiDownload2Line, RiFileExcel2Line, RiFilePdf2Line, RiUpload2Line } from "@remixicon/react";
import { PageHeader } from "@/components/hrm/PageHeader";
import { Button } from "@/components/ui/button";
import { Select, SelectItem } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { hasPermission } from "@/lib/auth/permissions";

const MONTHS = Array.from({ length: 12 }, (_, index) => ({
  value: String(index + 1),
  label: new Intl.DateTimeFormat("th-TH", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2026, index, 1))),
}));
const formatMoney = (value) => value == null ? "—" : `${Number(value).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท`;
const formatHours = (value) => Number(value || 0).toLocaleString("th-TH", { maximumFractionDigits: 2 });

export default function PayrollModule({ permissions = [] }) {
  const now = new Date();
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [payroll, setPayroll] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reloadCount, setReloadCount] = useState(0);
  const [slipFiles, setSlipFiles] = useState([]);
  const [slipScope, setSlipScope] = useState("selected");
  const [slipExporting, setSlipExporting] = useState("");
  const [slipError, setSlipError] = useState("");
  const [slipNotice, setSlipNotice] = useState("");
  const [slipMissing, setSlipMissing] = useState(null);
  const slipInputRef = useRef(null);
  const canExport = hasPermission(permissions, "salary_slips.export");
  const years = useMemo(() => Array.from({ length: 8 }, (_, index) => now.getFullYear() - index), []);

  async function generateSalarySlips(format, acknowledgeMissing = false) {
    if (!slipFiles.length) {
      setSlipError("กรุณาเลือกไฟล์ Excel (.xlsx) อย่างน้อย 1 ไฟล์");
      return;
    }
    setSlipExporting(format);
    setSlipError("");
    setSlipNotice("");
    if (!acknowledgeMissing) setSlipMissing(null);

    try {
      const form = new FormData();
      for (const file of slipFiles) form.append("files", file);
      form.append("format", format);
      form.append("year", year);
      if (slipScope === "selected") form.append("month", month);
      if (acknowledgeMissing) form.append("acknowledgeMissing", "true");

      const response = await fetch("/api/salary-slips/export", {
        method: "POST",
        body: form,
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        if (response.status === 409 && Array.isArray(payload.missing)) {
          setSlipMissing({ format, message: payload.error, items: payload.missing });
          return;
        }
        throw new Error(payload.error || "ออกสลิปเงินเดือนไม่สำเร็จ");
      }

      const blobUrl = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      const monthSuffix = slipScope === "selected" ? `-${String(month).padStart(2, "0")}` : "";
      anchor.href = blobUrl;
      anchor.download = `salary-slips-${year}${monthSuffix}.${format}`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      setSlipMissing(null);
      setSlipNotice(`สร้างไฟล์สลิปเงินเดือน (.${format}) และเริ่มดาวน์โหลดแล้ว`);
    } catch (exportError) {
      setSlipError(exportError.message);
    } finally {
      setSlipExporting("");
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true); setError(""); setNotice("");
      setPayroll(null);
      try {
        const response = await fetch(`/api/payroll?year=${year}&month=${month}`, { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "โหลดข้อมูลเงินเดือนไม่สำเร็จ");
        if (!cancelled) setPayroll(payload);
      } catch (loadError) {
        if (!cancelled) setError(loadError.message);
      } finally { if (!cancelled) setLoading(false); }
    }
    load();
    return () => { cancelled = true; };
  }, [year, month, reloadCount]);

  const rows = payroll?.rows ?? [];
  const unreadyCount = rows.filter((row) => row.netPay == null).length;
  const readyRows = rows.filter((row) => row.netPay != null);
  const totals = readyRows.reduce((summary, row) => ({
    income: summary.income + row.incomeTotal,
    deduction: summary.deduction + row.deductionTotal,
    net: summary.net + row.netPay,
    otHours: summary.otHours + row.weekdayOtHours + row.holidayOtHours,
  }), { income: 0, deduction: 0, net: 0, otHours: 0 });

  async function exportExcel() {
    setExporting(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/payroll?year=${year}&month=${month}&format=xlsx`, { cache: "no-store" });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error || "สร้างไฟล์ Excel ไม่สำเร็จ");
      }
      const file = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = file;
      anchor.download = `payroll-${year}-${String(month).padStart(2, "0")}.xlsx`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(file), 1000);
      setNotice("สร้างไฟล์ Excel และเริ่มดาวน์โหลดแล้ว");
    } catch (exportError) { setError(exportError.message); }
    finally { setExporting(false); }
  }

  return <div className="hrm-page space-y-5">
    <PageHeader
      eyebrow="ข้อมูล · Payroll"
      title="เงินเดือน"
      description="คำนวณจากเงินเดือนและรายการประจำในโปรไฟล์พนักงาน พร้อม OT ที่อนุมัติแล้ว"
      actions={canExport ? <Button leadingIcon={RiDownload2Line} disabled={loading || exporting || rows.length === 0 || unreadyCount > 0} onClick={exportExcel}>{exporting ? "กำลังสร้าง Excel…" : "ส่งออก Excel"}</Button> : null}
    />

    <section aria-label="เลือกงวดเงินเดือน" className="flex flex-wrap items-end gap-3">
      <div className="grid w-full gap-1.5 sm:w-44">
        <label htmlFor="payroll-month" className="text-sm font-medium text-foreground">เดือนที่จ่าย</label>
        <Select id="payroll-month" selectedKey={month} onSelectionChange={(value) => setMonth(String(value))}>
          {MONTHS.map((item) => <SelectItem id={item.value} key={item.value}>{item.label}</SelectItem>)}
        </Select>
      </div>
      <div className="grid w-full gap-1.5 sm:w-36">
        <label htmlFor="payroll-year" className="text-sm font-medium text-foreground">ปี พ.ศ.</label>
        <Select id="payroll-year" selectedKey={year} onSelectionChange={(value) => setYear(String(value))}>
          {years.map((value) => <SelectItem id={String(value)} key={value}>{value + 543}</SelectItem>)}
        </Select>
      </div>
      {payroll ? <p className="pb-2 text-xs text-muted-foreground">รอบคำนวณ {payroll.periodStart} ถึง {payroll.periodEnd}</p> : null}
    </section>

    {error ? <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-status-danger"><span>{error}</span><Button variant="outline" onClick={() => setReloadCount((value) => value + 1)}>โหลดใหม่</Button></div> : null}
    {notice ? <p role="status" className="text-sm text-status-success">{notice}</p> : null}

    <section aria-label="สรุปยอดเงินเดือน" className="flex flex-wrap gap-x-6 gap-y-2 border-y border-border py-3 text-sm">
      <p><span className="text-muted-foreground">พนักงาน</span> <strong className="tabular-nums">{loading ? "…" : rows.length}</strong></p>
      <p><span className="text-muted-foreground">รายได้</span> <strong className="tabular-nums">{loading ? "…" : formatMoney(unreadyCount ? null : totals.income)}</strong></p>
      <p><span className="text-muted-foreground">รายหัก</span> <strong className="tabular-nums">{loading ? "…" : formatMoney(unreadyCount ? null : totals.deduction)}</strong></p>
      <p><span className="text-muted-foreground">รับสุทธิ</span> <strong className="tabular-nums">{loading ? "…" : formatMoney(unreadyCount ? null : totals.net)}</strong></p>
      <p><span className="text-muted-foreground">OT อนุมัติรวม</span> <strong className="tabular-nums">{loading ? "…" : `${formatHours(totals.otHours)} ชม.`}</strong></p>
    </section>

    {unreadyCount > 0 ? <div role="alert" className="border-l-2 border-status-warning pl-3 text-sm text-foreground">
      ส่งออกไม่ได้จนกว่าจะตรวจรายการข้อมูลที่ยังคำนวณไม่ได้ในตาราง เช่น เงินเดือน หรือรายการคิดตามวัน/ชั่วโมงที่ยังไม่มีปริมาณ ({unreadyCount} คน)
    </div> : null}
    <p className="text-xs leading-5 text-muted-foreground">
      OT คิดจากรายการที่อนุมัติในเดือนที่เลือก (วันที่ 1 ถึงวันสุดท้ายของเดือน) โดยใช้เงินเดือน ÷ 30 ÷ ชั่วโมงทำงานต่อวัน × เรทรายบุคคล. วันลาที่อนุมัติแสดงเป็นจำนวนคำขอและยังไม่หักเงินอัตโนมัติ; รายการประจำที่ใช้คำนวณต้องตั้งหน่วยเป็น “งวด” ในโปรไฟล์พนักงาน.
    </p>

    <div className="overflow-x-auto rounded-md border border-border" aria-label="ตารางคำนวณเงินเดือน">
      <Table>
        <TableHeader><TableRow>
          <TableHead>พนักงาน</TableHead><TableHead>แผนก</TableHead><TableHead className="text-right">เงินเดือน</TableHead>
          <TableHead className="text-right">OT วันธรรมดา</TableHead><TableHead className="text-right">OT วันหยุด</TableHead>
          <TableHead className="text-right">OT รออนุมัติ</TableHead><TableHead className="text-right">ค่าล่วงเวลา</TableHead><TableHead className="text-right">คำขอลาที่อนุมัติ</TableHead>
          <TableHead className="text-right">รายได้</TableHead><TableHead className="text-right">รายหัก</TableHead><TableHead className="text-right">รับสุทธิ</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {loading ? <TableRow><TableCell colSpan={11} role="status">กำลังคำนวณเงินเดือน…</TableCell></TableRow>
            : rows.length ? rows.map((row) => <TableRow key={row.employeeId}>
              <TableCell><span className="font-medium">{row.name}</span><span className="block text-xs text-muted-foreground">{row.code}</span>
                {row.baseSalary == null ? <span className="mt-1 block text-xs text-status-danger">ยังไม่กำหนดเงินเดือน</span> : null}
                {row.workHoursPerDay <= 0 ? <span className="mt-1 block text-xs text-status-danger">ยังไม่กำหนดชั่วโมงทำงานต่อวัน</span> : null}
                {row.unpricedItems.length > 0 ? <span className="mt-1 block text-xs text-status-warning">มีรายการที่ยังคำนวณไม่ได้: {row.unpricedItems.map((item) => `${item.label} (${item.unit})`).join(", ")}</span> : null}
                <details className="mt-1 text-xs">
                  <summary className="flex min-h-10 cursor-pointer items-center text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">ดูรายการรายรับและรายหัก</summary>
                  <ul className="space-y-1 pb-2 text-muted-foreground">
                    <li>บัญชีรับเงิน · {row.bankName || "ไม่ระบุธนาคาร"} · {row.bankAccount || "ไม่ระบุเลขบัญชี"}</li>
                    {row.incomes.map((item, index) => <li key={`income-${index}`}>รายได้ · {item.label}: {formatMoney(item.amount)}</li>)}
                    {row.deductions.map((item, index) => <li key={`deduction-${index}`}>รายหัก · {item.label}: {formatMoney(item.amount)}</li>)}
                    {row.unpricedItems.map((item, index) => <li key={`unpriced-${index}`} className="text-status-warning">ยังไม่รวม · {item.label}: {formatMoney(item.amount)} / {item.unit}</li>)}
                    {row.approvedLeaves.map((item, index) => <li key={`leave-${index}`}>ลาอนุมัติ · {item.type} · {item.startOn}{item.endOn !== item.startOn ? ` ถึง ${item.endOn}` : ""} · {item.session === "full" ? "เต็มวัน" : item.session === "am" ? "ครึ่งวันเช้า" : "ครึ่งวันบ่าย"}</li>)}
                    {!row.incomes.length && !row.deductions.length && !row.unpricedItems.length && !row.approvedLeaves.length ? <li>ไม่มีรายการรายรับ รายหัก หรือวันลาที่อนุมัติในรอบนี้</li> : null}
                  </ul>
                </details>
              </TableCell>
              <TableCell>{row.department || "—"}</TableCell><TableCell className="text-right tabular-nums">{formatMoney(row.baseSalary)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatHours(row.weekdayOtHours)} ชม.</TableCell>
              <TableCell className="text-right tabular-nums">{formatHours(row.holidayOtHours)} ชม.</TableCell>
              <TableCell className="text-right tabular-nums">{formatHours(row.pendingOtHours)} ชม. ({row.pendingOtRequests} คำขอ)</TableCell>
              <TableCell className="text-right tabular-nums">{formatMoney(row.otAmount)}</TableCell>
              <TableCell className="text-right tabular-nums">{row.approvedLeaveRequests}</TableCell>
              <TableCell className="text-right tabular-nums">{formatMoney(row.incomeTotal)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatMoney(row.deductionTotal)}</TableCell>
              <TableCell className="text-right font-medium tabular-nums">{formatMoney(row.netPay)}</TableCell>
            </TableRow>)
            : <TableRow><TableCell colSpan={11}><div className="py-10 text-center"><p className="font-medium">ไม่พบพนักงานในรอบที่เลือก</p><p className="mt-1 text-sm text-muted-foreground">พนักงานจะแสดงเมื่อวันเริ่มงานและวันสิ้นสุดงานครอบคลุมรอบเงินเดือนนี้</p></div></TableCell></TableRow>}
        </TableBody>
      </Table>
    </div>
    {canExport ? (
      <section aria-label="ออกสลิปเงินเดือนจากไฟล์ Excel" className="space-y-3 rounded-md border border-border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-foreground">ออกสลิปเงินเดือน (.pdf / .xlsx)</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              อัปโหลดไฟล์ Excel เงินเดือนตั้งแต่ต้นปีจนถึงเดือนที่เลือก ระบบจะคำนวณยอดสะสมรายปีและสร้างไฟล์สลิปให้ดาวน์โหลดทันทีโดยไม่บันทึกลงฐานข้อมูล
            </p>
          </div>
          <div className="w-full sm:w-52">
            <label htmlFor="slip-scope" className="sr-only">ช่วงเดือนที่ต้องการออกสลิป</label>
            <Select id="slip-scope" selectedKey={slipScope} onSelectionChange={(value) => { setSlipScope(String(value)); setSlipMissing(null); }}>
              <SelectItem id="selected">เฉพาะเดือนที่เลือก ({MONTHS[Number(month) - 1]?.label})</SelectItem>
              <SelectItem id="all">ทุกเดือนที่มีในไฟล์ (ปี {Number(year) + 543})</SelectItem>
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={slipInputRef}
            type="file"
            accept=".xlsx"
            multiple
            className="hidden"
            onChange={(event) => {
              const selected = Array.from(event.target.files ?? []);
              setSlipFiles(selected);
              setSlipError("");
              setSlipNotice("");
              setSlipMissing(null);
            }}
          />
          <Button
            type="button"
            variant="outline"
            leadingIcon={RiUpload2Line}
            disabled={Boolean(slipExporting)}
            onClick={() => slipInputRef.current?.click()}
          >
            {slipFiles.length ? `เลือกไฟล์แล้ว ${slipFiles.length} ไฟล์` : "เลือกไฟล์ .xlsx"}
          </Button>
          <Button
            type="button"
            leadingIcon={RiFilePdf2Line}
            disabled={!slipFiles.length || Boolean(slipExporting)}
            onClick={() => generateSalarySlips("pdf")}
          >
            {slipExporting === "pdf" ? "กำลังสร้าง PDF…" : "ออกสลิป PDF"}
          </Button>
          <Button
            type="button"
            variant="outline"
            leadingIcon={RiFileExcel2Line}
            disabled={!slipFiles.length || Boolean(slipExporting)}
            onClick={() => generateSalarySlips("xlsx")}
          >
            {slipExporting === "xlsx" ? "กำลังสร้าง Excel…" : "ออกสลิป Excel"}
          </Button>
          {slipFiles.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              disabled={Boolean(slipExporting)}
              onClick={() => {
                setSlipFiles([]);
                setSlipError("");
                setSlipNotice("");
                setSlipMissing(null);
                if (slipInputRef.current) slipInputRef.current.value = "";
              }}
            >
              ล้างไฟล์
            </Button>
          ) : null}
        </div>

        {slipFiles.length > 0 ? (
          <p className="text-xs text-muted-foreground">
            ไฟล์ที่เลือก: {slipFiles.map((file) => file.name).join(", ")}
          </p>
        ) : null}

        {slipError ? <p role="alert" className="text-sm text-status-danger">{slipError}</p> : null}
        {slipNotice ? <p role="status" className="text-sm text-status-success">{slipNotice}</p> : null}
        {slipMissing ? (
          <div role="alert" className="space-y-2 rounded-md border border-status-warning/40 bg-status-warning/10 p-3 text-xs text-foreground">
            <p className="font-medium">{slipMissing.message}</p>
            <p className="text-muted-foreground">
              พบพนักงานที่ขาดบางเดือนจำนวน {slipMissing.items.length} รายการ (เช่น {slipMissing.items.slice(0, 3).map((item) => `${item.name} ขาดเดือน ${item.missingMonths.join(", ")}`).join("; ")})
            </p>
            <Button
              type="button"
              size="sm"
              disabled={Boolean(slipExporting)}
              onClick={() => generateSalarySlips(slipMissing.format, true)}
            >
              ยืนยันออกสลิป (.{slipMissing.format}) ตามข้อมูลที่มีในไฟล์
            </Button>
          </div>
        ) : null}
      </section>
    ) : null}

    {!canExport ? <p role="status" className="text-xs text-muted-foreground">บัญชีนี้ไม่มีสิทธิ์ส่งออกข้อมูลเงินเดือน</p> : null}
  </div>;
}
