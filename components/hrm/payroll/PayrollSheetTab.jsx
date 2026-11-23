"use client";

import { useMemo, useRef, useState } from "react";
import {
  RiCalculatorLine,
  RiCalendarCheckLine,
  RiDownload2Line,
  RiEditLine,
  RiFileExcel2Line,
  RiFilePdf2Line,
  RiLock2Line,
  RiLockUnlockLine,
  RiSearchLine,
  RiUpload2Line,
} from "@remixicon/react";
import { HrmDialog } from "@/components/hrm/HrmDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectItem } from "@/components/ui/select";
import { STANDARD_DEDUCTION_COLUMNS, STANDARD_INCOME_COLUMNS } from "@/lib/payroll/types";
import { cn } from "@/lib/utils";
import { formatHours, formatMoney } from "./payrollFormat";

function formatCellMoney(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value === 0) return "-";
  return formatMoney(value);
}

function parseDelimitedImport(text, rows) {
  const cleanLines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (cleanLines.length < 2) {
    throw new Error("กรุณาใส่แถวหัวตารางและข้อมูลอย่างน้อย 1 แถว");
  }
  const delimiter = cleanLines[0].includes("\t") ? "\t" : ",";
  const headers = cleanLines[0].split(delimiter).map((col) => col.trim());
  const codeIdx = headers.findIndex((h) => ["code", "รหัส", "รหัสพนักงาน"].includes(h.toLowerCase()) || h === "รหัส" || h === "รหัสพนักงาน");
  if (codeIdx === -1) {
    throw new Error("ไม่พบคอลัมน์รหัสพนักงาน (รหัส / รหัสพนักงาน / code)");
  }

  const incomeColLookup = new Map();
  for (const col of STANDARD_INCOME_COLUMNS) {
    incomeColLookup.set(col.code.toLowerCase(), col.code);
    incomeColLookup.set(col.label, col.code);
    incomeColLookup.set(col.shortLabel, col.code);
  }
  const deductionColLookup = new Map();
  for (const col of STANDARD_DEDUCTION_COLUMNS) {
    deductionColLookup.set(col.code.toLowerCase(), col.code);
    deductionColLookup.set(col.label, col.code);
    deductionColLookup.set(col.shortLabel, col.code);
  }

  const validCodes = new Set(rows.map((r) => r.code));
  const imported = [];
  for (let i = 1; i < cleanLines.length; i += 1) {
    const cells = cleanLines[i].split(delimiter).map((c) => c.trim());
    const code = cells[codeIdx];
    if (!code || !validCodes.has(code)) continue;
    const incomes = {};
    const deductions = {};
    let workingDays;
    headers.forEach((header, idx) => {
      if (idx === codeIdx) return;
      const rawVal = (cells[idx] ?? "").replaceAll(",", "").trim();
      if (rawVal === "" || rawVal === "-") return;
      const num = Number(rawVal);
      if (!Number.isFinite(num) || num < 0) return;
      const hLower = header.toLowerCase();
      if (hLower === "workingdays" || header === "วันทำงาน") {
        workingDays = num;
        return;
      }
      const incCode = incomeColLookup.get(header) ?? incomeColLookup.get(hLower);
      if (incCode) {
        incomes[incCode] = num;
        return;
      }
      const dedCode = deductionColLookup.get(header) ?? deductionColLookup.get(hLower);
      if (dedCode) {
        deductions[dedCode] = num;
      }
    });
    if (Object.keys(incomes).length > 0 || Object.keys(deductions).length > 0 || workingDays !== undefined) {
      imported.push({ code, incomes, deductions, ...(workingDays !== undefined ? { workingDays } : {}) });
    }
  }
  if (imported.length === 0) {
    throw new Error("ไม่พบแถวที่รหัสพนักงานและคอลัมน์ตรงกับระบบ");
  }
  return imported;
}

export function PayrollSheetTab({
  payroll,
  loading = false,
  canOperate = false,
  canExport = false,
  busy = false,
  downloadingKey = "",
  onEditRow,
  onClosePeriod,
  onReopenPeriod,
  onRecalculatePeriod,
  onExportRegister,
  onExportSummaryPdf,
  onExportSummaryXlsx,
  onSaveWorkingDays,
  onBulkImportOverrides,
}) {
  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("all");

  // Working days modal
  const [workingDaysOpen, setWorkingDaysOpen] = useState(false);
  const [workingDaysDraft, setWorkingDaysDraft] = useState({});

  // Import overrides modal
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState("");
  const fileInputRef = useRef(null);

  const rows = payroll?.rows ?? [];
  const status = payroll?.workflow?.status ?? "review";
  const isLocked = status === "locked" || status === "paid";

  const departments = useMemo(
    () => [...new Set(rows.map((row) => row.department).filter(Boolean))].sort((a, b) => a.localeCompare(b, "th-TH")),
    [rows],
  );

  const filteredRows = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (departmentFilter !== "all" && row.department !== departmentFilter) return false;
      if (!keyword) return true;
      return (
        row.name.toLowerCase().includes(keyword)
        || row.code.toLowerCase().includes(keyword)
        || row.department.toLowerCase().includes(keyword)
      );
    });
  }, [rows, departmentFilter, search]);

  const totals = useMemo(() => {
    const incomeSums = Object.fromEntries(STANDARD_INCOME_COLUMNS.map((c) => [c.code, 0]));
    const deductionSums = Object.fromEntries(STANDARD_DEDUCTION_COLUMNS.map((c) => [c.code, 0]));
    let otHours = 0;
    let netPay = 0;
    let incomeTotal = 0;
    let deductionTotal = 0;

    for (const row of filteredRows) {
      otHours += row.weekdayOtHours + row.holidayOtHours;
      netPay += row.netPay ?? 0;
      incomeTotal += row.incomeTotal ?? 0;
      deductionTotal += row.deductionTotal ?? 0;
      for (const col of STANDARD_INCOME_COLUMNS) {
        incomeSums[col.code] += Number(row.incomeBreakdown?.[col.code] ?? 0);
      }
      for (const col of STANDARD_DEDUCTION_COLUMNS) {
        deductionSums[col.code] += Number(row.deductionBreakdown?.[col.code] ?? 0);
      }
    }
    return { otHours, netPay, incomeTotal, deductionTotal, incomeSums, deductionSums };
  }, [filteredRows]);

  function openWorkingDaysModal() {
    const initial = {};
    for (const row of rows) {
      initial[row.employeeId] = row.workingDays == null ? "" : String(row.workingDays);
    }
    setWorkingDaysDraft(initial);
    setWorkingDaysOpen(true);
  }

  async function submitWorkingDays(event) {
    event.preventDefault();
    const workingDaysMap = {};
    for (const row of rows) {
      const raw = workingDaysDraft[row.employeeId];
      if (raw === undefined) continue;
      const trimmed = String(raw).trim();
      workingDaysMap[row.employeeId] = {
        workingDays: trimmed === "" ? null : Math.max(0, Number(trimmed) || 0),
      };
    }
    const ok = await onSaveWorkingDays?.(workingDaysMap);
    if (ok) setWorkingDaysOpen(false);
  }

  function downloadImportTemplate() {
    const headers = [
      "รหัสพนักงาน",
      "ชื่อ-นามสกุล",
      "วันทำงาน",
      ...STANDARD_INCOME_COLUMNS.map((c) => c.label),
      ...STANDARD_DEDUCTION_COLUMNS.map((c) => c.label),
    ];
    const sampleRows = rows.map((row) => [
      row.code,
      row.name,
      row.workingDays ?? "",
      ...STANDARD_INCOME_COLUMNS.map((c) => row.incomeBreakdown?.[c.code] ?? 0),
      ...STANDARD_DEDUCTION_COLUMNS.map((c) => row.deductionBreakdown?.[c.code] ?? 0),
    ]);
    const csv = `\uFEFF${[headers, ...sampleRows].map((r) => r.join(",")).join("\r\n")}\r\n`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `payroll-import-template-${payroll?.year ?? ""}-${String(payroll?.month ?? "").padStart(2, "0")}.csv`;
    document.body.append(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function submitBulkImport(event) {
    event.preventDefault();
    setImportError("");
    try {
      const importedRows = parseDelimitedImport(importText, rows);
      const ok = await onBulkImportOverrides?.(importedRows);
      if (ok) {
        setImportOpen(false);
        setImportText("");
      }
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "รูปแบบข้อมูลนำเข้าไม่ถูกต้อง");
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {canOperate ? (
              isLocked ? (
                status === "locked" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    leadingIcon={RiLockUnlockLine}
                    disabled={loading || busy}
                    onClick={onReopenPeriod}
                  >
                    เปิดงวด (ปลดล็อก)
                  </Button>
                ) : (
                  <Badge color="success" className="h-9 px-3 text-xs">จ่ายเงินเดือนแล้ว</Badge>
                )
              ) : (
                <Button
                  type="button"
                  size="sm"
                  leadingIcon={RiLock2Line}
                  disabled={loading || busy || rows.length === 0}
                  onClick={onClosePeriod}
                >
                  ปิดงวด
                </Button>
              )
            ) : null}

            {canOperate ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                leadingIcon={RiCalculatorLine}
                disabled={loading || busy || isLocked || rows.length === 0}
                onClick={onRecalculatePeriod}
              >
                คำนวณค่าจ้างใหม่
              </Button>
            ) : null}

            {canExport ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  leadingIcon={RiFileExcel2Line}
                  disabled={loading || busy || Boolean(downloadingKey) || rows.length === 0}
                  onClick={onExportRegister}
                >
                  {downloadingKey === "matrix-xlsx" || downloadingKey === "xlsx" ? "กำลังส่งออก…" : "Export Excel"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  leadingIcon={RiFilePdf2Line}
                  disabled={loading || busy || Boolean(downloadingKey) || rows.length === 0}
                  onClick={onExportSummaryPdf}
                >
                  {downloadingKey === "summary-pdf" ? "กำลังสร้าง PDF…" : "ใบสรุปจ่าย (PDF)"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  leadingIcon={RiFileExcel2Line}
                  disabled={loading || busy || Boolean(downloadingKey) || rows.length === 0}
                  onClick={onExportSummaryXlsx}
                >
                  {downloadingKey === "summary-xlsx" ? "กำลังสร้าง XLSX…" : "ใบสรุปจ่าย (XLSX)"}
                </Button>
              </>
            ) : null}

            {canOperate ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  leadingIcon={RiUpload2Line}
                  disabled={loading || busy || isLocked || rows.length === 0}
                  onClick={() => {
                    setImportError("");
                    setImportOpen(true);
                  }}
                >
                  นำเข้าข้อมูลรายได้รายหัก
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  leadingIcon={RiCalendarCheckLine}
                  disabled={loading || busy || isLocked || rows.length === 0}
                  onClick={openWorkingDaysModal}
                >
                  บันทึก จน. วันทำงาน/งวด
                </Button>
              </>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="w-40">
              <Select
                aria-label="กรองตามแผนก"
                size="sm"
                selectedKey={departmentFilter}
                onSelectionChange={(val) => setDepartmentFilter(String(val))}
              >
                <SelectItem id="all">ทุกแผนก</SelectItem>
                {departments.map((dept) => (
                  <SelectItem id={dept} key={dept}>
                    {dept}
                  </SelectItem>
                ))}
              </Select>
            </div>
            <div className="w-48">
              <Input
                aria-label="ค้นหารหัสหรือชื่อพนักงาน"
                leadingIcon={RiSearchLine}
                placeholder="ค้นหารหัส / ชื่อ…"
                value={search}
                onChange={setSearch}
                className="[&_input]:h-9 [&_input]:text-xs"
              />
            </div>
          </div>
        </div>
      </Card>

      <Card className="min-w-0 overflow-hidden">
        <div className="hrm-table-shell border-y-0">
          <table className="hrm-data-table min-w-[1650px]">
            <thead>
              <tr className="border-b border-border bg-muted">
                <th rowSpan={2} className="w-20 text-center align-middle">แก้ไข</th>
                <th rowSpan={2} className="w-16 align-middle">รหัส</th>
                <th rowSpan={2} className="min-w-44 align-middle">ชื่อ</th>
                <th rowSpan={2} className="w-20 text-right align-middle">ชม.OT</th>
                <th rowSpan={2} className="w-28 border-r border-border text-right align-middle">สรุปรายรับ</th>
                <th colSpan={9} className="border-b border-r border-border text-center font-semibold text-foreground">
                  รายได้
                </th>
                <th colSpan={9} className="border-b border-border text-center font-semibold text-foreground">
                  รายหัก
                </th>
              </tr>
              <tr className="border-b border-border bg-muted/70">
                {STANDARD_INCOME_COLUMNS.map((col) => (
                  <th key={col.code} className="text-right font-medium">{col.shortLabel}</th>
                ))}
                <th className="border-r border-border text-right font-semibold text-foreground">รวมรายได้</th>
                {STANDARD_DEDUCTION_COLUMNS.map((col) => (
                  <th key={col.code} className="text-right font-medium">{col.shortLabel}</th>
                ))}
                <th className="text-right font-semibold text-foreground">รวมรายหัก</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={23} className="py-10 text-center text-sm text-muted-foreground">
                    กำลังคำนวณตารางเงินเดือนรายงวด…
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={23} className="py-10 text-center text-sm text-muted-foreground">
                    ไม่พบรายการพนักงานในงวดนี้
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr
                    key={row.employeeId}
                    onClick={() => onEditRow?.(row)}
                    className={cn(
                      "cursor-pointer",
                      row.hasBlockingIssue && "bg-status-danger/5 hover:bg-status-danger/10",
                    )}
                  >
                    <td className="text-center">
                      <Button
                        type="button"
                        size="xs"
                        variant={row.hasPeriodOverride ? "default" : "outline"}
                        leadingIcon={RiEditLine}
                        onClick={(event) => {
                          event.stopPropagation();
                          onEditRow?.(row);
                        }}
                        className="h-7 px-2 text-[11px]"
                      >
                        แก้ไข
                      </Button>
                    </td>
                    <td className="font-mono text-xs tabular-nums">{row.code}</td>
                    <td>
                      <div className="min-w-0">
                        <span className="font-medium text-foreground">{row.name}</span>
                        {row.hasPeriodOverride ? (
                          <Badge color="warning" variant="caption" className="ml-1.5">แก้ไขแล้ว</Badge>
                        ) : null}
                      </div>
                    </td>
                    <td className="text-right tabular-nums">
                      {formatHours(row.weekdayOtHours + row.holidayOtHours)}
                    </td>
                    <td className="border-r border-border text-right font-semibold tabular-nums text-foreground">
                      {formatMoney(row.netPay)}
                    </td>

                    {STANDARD_INCOME_COLUMNS.map((col) => (
                      <td key={col.code} className="text-right tabular-nums">
                        {formatCellMoney(row.incomeBreakdown?.[col.code])}
                      </td>
                    ))}
                    <td className="border-r border-border text-right font-semibold tabular-nums text-foreground">
                      {formatMoney(row.incomeTotal)}
                    </td>

                    {STANDARD_DEDUCTION_COLUMNS.map((col) => (
                      <td
                        key={col.code}
                        className={cn(
                          "text-right tabular-nums",
                          (row.deductionBreakdown?.[col.code] ?? 0) > 0 ? "text-status-danger" : "text-muted-foreground",
                        )}
                      >
                        {formatCellMoney(row.deductionBreakdown?.[col.code])}
                      </td>
                    ))}
                    <td className="text-right font-semibold tabular-nums text-status-danger">
                      {formatMoney(row.deductionTotal)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {!loading && filteredRows.length > 0 ? (
              <tfoot className="border-t-2 border-border bg-muted/60 font-semibold">
                <tr>
                  <td colSpan={3} className="px-3 py-2.5 text-xs text-foreground">
                    Count: {filteredRows.length.toLocaleString("th-TH")}
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs tabular-nums">{formatHours(totals.otHours)}</td>
                  <td className="border-r border-border px-3 py-2.5 text-right text-xs tabular-nums text-foreground">
                    {formatMoney(totals.netPay)}
                  </td>
                  {STANDARD_INCOME_COLUMNS.map((col) => (
                    <td key={col.code} className="px-3 py-2.5 text-right text-xs tabular-nums">
                      {formatMoney(totals.incomeSums[col.code])}
                    </td>
                  ))}
                  <td className="border-r border-border px-3 py-2.5 text-right text-xs tabular-nums text-foreground">
                    {formatMoney(totals.incomeTotal)}
                  </td>
                  {STANDARD_DEDUCTION_COLUMNS.map((col) => (
                    <td key={col.code} className="px-3 py-2.5 text-right text-xs tabular-nums text-status-danger">
                      {formatMoney(totals.deductionSums[col.code])}
                    </td>
                  ))}
                  <td className="px-3 py-2.5 text-right text-xs tabular-nums text-status-danger">
                    {formatMoney(totals.deductionTotal)}
                  </td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </Card>

      {/* บันทึกจำนวนวันทำงานรายงวด */}
      <HrmDialog
        open={workingDaysOpen}
        onClose={() => setWorkingDaysOpen(false)}
        size="md"
        title="บันทึกจำนวนวันทำงานประจำงวด"
        description="ใช้คำนวณรายการที่ตั้งหน่วยเป็น “วัน” ในโปรไฟล์พนักงาน และบันทึกเป็นข้อมูลอ้างอิงประจำงวด"
        footer={(
          <div className="flex w-full justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setWorkingDaysOpen(false)}>
              ยกเลิก
            </Button>
            <Button type="submit" form="working-days-form" size="sm" disabled={busy}>
              {busy ? "กำลังบันทึก…" : "บันทึกวันทำงาน"}
            </Button>
          </div>
        )}
      >
        <form id="working-days-form" onSubmit={submitWorkingDays} className="py-2">
          <div className="max-h-96 overflow-y-auto rounded-md border border-border">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">รหัส</th>
                  <th className="px-3 py-2 text-left font-medium">พนักงาน</th>
                  <th className="w-32 px-3 py-2 text-right font-medium">จำนวนวันทำงาน</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.employeeId} className="border-b border-border last:border-b-0">
                    <td className="px-3 py-1.5 font-mono text-muted-foreground">{row.code}</td>
                    <td className="px-3 py-1.5 font-medium text-foreground">{row.name}</td>
                    <td className="px-3 py-1.5">
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        max="31"
                        placeholder="—"
                        value={workingDaysDraft[row.employeeId] ?? ""}
                        onChange={(event) =>
                          setWorkingDaysDraft((prev) => ({ ...prev, [row.employeeId]: event.target.value }))
                        }
                        className="h-8 w-full rounded-sm border border-input bg-background px-2 text-right tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </form>
      </HrmDialog>

      {/* นำเข้าข้อมูลรายได้รายหัก */}
      <HrmDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        size="lg"
        title="นำเข้าข้อมูลรายได้ / รายหักประจำงวด"
        description="อัปโหลดไฟล์ .csv หรือวางข้อมูลจาก Excel (คั่นด้วย Tab หรือ Comma) โดยมีคอลัมน์ รหัสพนักงาน และชื่อรายการ/รหัสรายการ"
        footer={(
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <Button type="button" variant="outline" size="sm" leadingIcon={RiDownload2Line} onClick={downloadImportTemplate}>
              ดาวน์โหลดเทมเพลต CSV
            </Button>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setImportOpen(false)}>
                ยกเลิก
              </Button>
              <Button type="submit" form="bulk-import-form" size="sm" disabled={busy || !importText.trim()}>
                {busy ? "กำลังนำเข้า…" : "นำเข้าข้อมูล"}
              </Button>
            </div>
          </div>
        )}
      >
        <form id="bulk-import-form" onSubmit={submitBulkImport} className="space-y-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.tsv,.txt"
              className="sr-only"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                setImportText(await file.text());
                setImportError("");
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              leadingIcon={RiUpload2Line}
              onClick={() => fileInputRef.current?.click()}
            >
              เลือกไฟล์ CSV / TSV
            </Button>
            <span className="text-xs text-muted-foreground">
              รองรับคอลัมน์: รหัสพนักงาน, เงินเดือน, ค่าล่วงเวลา, เบี้ยขยัน, ประกันสังคม, ภาษี ฯลฯ
            </span>
          </div>

          <textarea
            rows={8}
            value={importText}
            onChange={(event) => {
              setImportText(event.target.value);
              setImportError("");
            }}
            placeholder={"รหัสพนักงาน,เงินเดือน,เบี้ยขยัน,ประกันสังคม,ภาษี\n2603,25000,1500,750,300"}
            className="w-full rounded-sm border border-input bg-background p-3 font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />

          {importError ? <p role="alert" className="text-xs text-status-danger">{importError}</p> : null}
        </form>
      </HrmDialog>
    </div>
  );
}
