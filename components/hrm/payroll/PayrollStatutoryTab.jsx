"use client";

import { useEffect, useMemo, useState } from "react";
import {
  RiBankLine,
  RiDownload2Line,
  RiFileExcel2Line,
  RiFilePdf2Line,
  RiFileTextLine,
  RiShieldCheckLine,
} from "@remixicon/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectItem } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatMoney, getFullMonthLabel, toBuddhistYear } from "./payrollFormat";

const REPORT_GROUPS = [
  {
    title: "ฟอร์มภาษี",
    items: [
      { id: "pnd1-xlsx", label: "ภ.ง.ด.1", description: "แบบยื่นรายการภาษีเงินได้หัก ณ ที่จ่ายรายเดือน", annual: false },
      { id: "pnd1k-xlsx", label: "ภ.ง.ด.1ก (สรุปรายปี)", description: "สรุปรายได้ ภาษี ประกันสังคม และกองทุนฯ สะสมทั้งปี", annual: true },
    ],
  },
  {
    title: "ฟอร์มค่าจ้าง",
    items: [
      {
        id: "summary-xlsx",
        label: "ใบสรุปจ่ายเงินเดือน (TJARUSCH_PAYROLL)",
        description: "ตารางสรุปจ่ายเงินเดือนแยกแผนก แยกยอดหักเงินสด และยอดจ่ายตรง Payroll (.pdf / .xlsx)",
        annual: false,
        supportsPdf: true,
      },
      { id: "bank-xlsx", label: "นำส่งเงินเดือนธนาคาร", description: "ไฟล์รายการโอนเงินเดือนเข้าบัญชีธนาคาร (.xlsx / .txt)", annual: false, supportsTxt: true },
      { id: "payslip-jump", label: "ใบแจ้งเงินได้ [Pay Slip]", description: "ออกสลิปเงินเดือน .pdf / .xlsx รายคนหรือทั้งงวด", isSlipJump: true },
    ],
  },
  {
    title: "ฟอร์มประกันสังคม",
    items: [
      { id: "sso-xlsx", label: "รายการแสดงนำส่งเงินสมทบ [สปส.1-10]", description: "สปส.1-10 ส่วนที่ 1 และส่วนที่ 2 (.xlsx ออนไลน์)", annual: false },
      { id: "kt20k-xlsx", label: "รายงานค่าจ้างตามแบบ กท.20 ก", description: "รายงานค่าจ้างประจำปีแยก 12 เดือนสำหรับกองทุนเงินทดแทน", annual: true },
    ],
  },
];

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function PayrollStatutoryTab({
  year,
  month,
  payroll,
  canExport = false,
  onOpenSlipsTab,
}) {
  const [selectedReportId, setSelectedReportId] = useState("sso-xlsx");
  const [filterMode, setFilterMode] = useState("department");
  const [selectedDepartments, setSelectedDepartments] = useState([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [sortBy, setSortBy] = useState("code");
  const [filingType, setFilingType] = useState("normal");
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const rows = payroll?.rows ?? [];
  const departments = useMemo(
    () => [...new Set(rows.map((r) => r.department || "ไม่ระบุแผนก"))].sort((a, b) => a.localeCompare(b, "th-TH")),
    [rows],
  );

  useEffect(() => {
    setSelectedDepartments(departments);
    if (!selectedEmployeeId && rows[0]) {
      setSelectedEmployeeId(rows[0].employeeId);
    }
  }, [departments.join("|"), rows.length]);

  const activeReport = useMemo(
    () => REPORT_GROUPS.flatMap((g) => g.items).find((item) => item.id === selectedReportId) ?? REPORT_GROUPS[2].items[0],
    [selectedReportId],
  );

  const previewRows = useMemo(() => {
    const deptSet = new Set(selectedDepartments);
    const filtered = rows.filter((row) => {
      if (filterMode === "employee") {
        return selectedEmployeeId ? row.employeeId === selectedEmployeeId : true;
      }
      return deptSet.has(row.department || "ไม่ระบุแผนก");
    });

    return [...filtered].sort((left, right) => {
      if (sortBy === "name") return left.name.localeCompare(right.name, "th-TH");
      if (sortBy === "department") {
        return (left.department || "").localeCompare(right.department || "", "th-TH")
          || left.code.localeCompare(right.code, "th-TH", { numeric: true });
      }
      return left.code.localeCompare(right.code, "th-TH", { numeric: true });
    });
  }, [rows, filterMode, selectedDepartments, selectedEmployeeId, sortBy]);

  const missingCitizenCount = previewRows.filter((r) => !r.citizenId).length;
  const missingBankCount = previewRows.filter((r) => !r.bankAccount).length;
  const allDepartmentsChecked = departments.length > 0 && selectedDepartments.length === departments.length;

  function toggleAllDepartments(checked) {
    setSelectedDepartments(checked ? departments : []);
  }

  function toggleDepartment(dept, checked) {
    setSelectedDepartments((prev) =>
      checked ? (prev.includes(dept) ? prev : [...prev, dept]) : prev.filter((item) => item !== dept),
    );
  }

  async function handleExport(formatOverride) {
    const targetFormat = formatOverride || selectedReportId;
    if (filterMode === "department" && selectedDepartments.length === 0) {
      setError("กรุณาเลือกแผนกอย่างน้อย 1 แผนก");
      return;
    }
    setExporting(true);
    setError("");
    setNotice("");
    try {
      const qs = new URLSearchParams({
        year: String(year),
        month: String(month),
        format: targetFormat,
        sortBy,
        filingType,
        allowUnlocked: "1",
      });
      if (filterMode === "department") {
        qs.set("departments", selectedDepartments.join(","));
      } else if (selectedEmployeeId) {
        qs.set("employeeId", selectedEmployeeId);
      }

      const response = await fetch(`/api/payroll?${qs.toString()}`, { cache: "no-store" });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "ส่งออกรายงานไม่สำเร็จ");
      }
      const periodSlug = `${year}-${String(month).padStart(2, "0")}`;
      const filenameMap = {
        "summary-xlsx": `TJARUSCH_PAYROLL_${periodSlug}-01.xlsx`,
        "summary-pdf": `TJARUSCH_PAYROLL_${periodSlug}-01.pdf`,
        "sso-xlsx": `sso-1-10-${periodSlug}.xlsx`,
        "kt20k-xlsx": `kt20k-${year}.xlsx`,
        "pnd1-xlsx": `pnd1-${periodSlug}.xlsx`,
        "pnd1k-xlsx": `pnd1k-${year}.xlsx`,
        "bank-xlsx": `bank-transfer-${periodSlug}.xlsx`,
        "bank-txt": `bank-transfer-${periodSlug}.txt`,
      };
      const filename = filenameMap[targetFormat] ?? `report-${periodSlug}.xlsx`;
      triggerDownload(await response.blob(), filename);
      setNotice(`ดาวน์โหลดรายงาน ${filename} แล้ว`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ส่งออกรายงานไม่สำเร็จ");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
      {/* Left sidebar matching IMG_2997 */}
      <Card className="p-3">
        <nav aria-label="ประเภทรายงานภาษีและประกันสังคม" className="space-y-4">
          {REPORT_GROUPS.map((group) => (
            <div key={group.title} className="space-y-1">
              <p className="px-2.5 py-1 text-xs font-semibold text-muted-foreground">{group.title}</p>
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const selected = selectedReportId === item.id;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => {
                          if (item.isSlipJump) {
                            onOpenSlipsTab?.();
                            return;
                          }
                          setSelectedReportId(item.id);
                          setError("");
                          setNotice("");
                        }}
                        className={cn(
                          "w-full rounded-md px-2.5 py-2 text-left text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          selected
                            ? "bg-primary text-primary-foreground"
                            : "text-foreground hover:bg-muted",
                        )}
                      >
                        {item.label}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </Card>

      {/* Right report configuration & preview panel */}
      <Card className="space-y-5 p-5">
        <div className="border-b border-border pb-3">
          <h2 className="text-base font-semibold text-foreground">{activeReport.label}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{activeReport.description}</p>
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
          <div className="space-y-4">
            <div className="rounded-md border border-border p-3.5">
              <p className="text-xs font-medium text-muted-foreground">ขอบเขตพนักงาน</p>
              <div className="mt-2 flex flex-wrap gap-6">
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-foreground">
                  <input
                    type="radio"
                    name="statutory-filter-mode"
                    checked={filterMode === "department"}
                    onChange={() => setFilterMode("department")}
                    className="accent-primary"
                  />
                  <span>แผนก</span>
                </label>
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-foreground">
                  <input
                    type="radio"
                    name="statutory-filter-mode"
                    checked={filterMode === "employee"}
                    onChange={() => setFilterMode("employee")}
                    className="accent-primary"
                  />
                  <span>รหัสพนักงาน</span>
                </label>
              </div>

              {filterMode === "employee" ? (
                <div className="mt-3 max-w-xs">
                  <Select
                    aria-label="เลือกพนักงาน"
                    selectedKey={selectedEmployeeId}
                    onSelectionChange={(val) => setSelectedEmployeeId(String(val))}
                  >
                    {rows.map((row) => (
                      <SelectItem id={row.employeeId} key={row.employeeId}>
                        {row.code} · {row.name}
                      </SelectItem>
                    ))}
                  </Select>
                </div>
              ) : null}
            </div>

            <div className="grid gap-3 rounded-md border border-border p-3.5 sm:grid-cols-2">
              <div>
                <p className="text-xs text-muted-foreground">ปี พ.ศ.</p>
                <p className="mt-1 text-sm font-medium text-foreground">{toBuddhistYear(year)} ({year})</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">งวดเดือน</p>
                <p className="mt-1 text-sm font-medium text-foreground">
                  {activeReport.annual ? "ทั้งปี (ม.ค. – ธ.ค.)" : getFullMonthLabel(month)}
                </p>
              </div>
            </div>

            <div className="rounded-md border border-border p-3.5">
              <label htmlFor="statutory-sort" className="block text-xs font-medium text-muted-foreground">
                เรียงลำดับการแสดงตาม
              </label>
              <div className="mt-2 max-w-xs">
                <Select
                  id="statutory-sort"
                  selectedKey={sortBy}
                  onSelectionChange={(val) => setSortBy(String(val))}
                >
                  <SelectItem id="code">รหัสพนักงาน</SelectItem>
                  <SelectItem id="name">ชื่อพนักงาน</SelectItem>
                  <SelectItem id="department">แผนก</SelectItem>
                </Select>
              </div>
            </div>

            <div className="rounded-md border border-border p-3.5">
              <p className="text-xs font-medium text-muted-foreground">ประเภทเอกสารและการยื่น</p>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
                <span className="text-sm font-medium text-foreground">
                  {activeReport.supportsPdf ? ".pdf และ .xlsx" : ".xlsx (ออนไลน์)"}
                </span>
                <div className="flex items-center gap-5">
                  <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-foreground">
                    <input
                      type="radio"
                      name="statutory-filing-type"
                      checked={filingType === "normal"}
                      onChange={() => setFilingType("normal")}
                      className="accent-primary"
                    />
                    <span>ยื่นปกติ</span>
                  </label>
                  <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-foreground">
                    <input
                      type="radio"
                      name="statutory-filing-type"
                      checked={filingType === "additional"}
                      onChange={() => setFilingType("additional")}
                      className="accent-primary"
                    />
                    <span>ยื่นเพิ่มเติม</span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Right department multi-select table matching IMG_2997 */}
          <div className="overflow-hidden rounded-md border border-border">
            <div className="flex items-center gap-2.5 border-b border-border bg-muted/50 px-3 py-2.5">
              <Checkbox
                id="statutory-dept-all"
                isSelected={allDepartmentsChecked}
                isDisabled={filterMode !== "department" || departments.length === 0}
                onChange={(checked) => toggleAllDepartments(Boolean(checked))}
              />
              <label htmlFor="statutory-dept-all" className="cursor-pointer text-xs font-semibold text-foreground">
                แผนก ({selectedDepartments.length}/{departments.length})
              </label>
            </div>
            <ul className={cn("max-h-64 divide-y divide-border overflow-y-auto", filterMode !== "department" && "opacity-50")}>
              {departments.length === 0 ? (
                <li className="px-3 py-4 text-center text-xs text-muted-foreground">ไม่มีข้อมูลแผนก</li>
              ) : (
                departments.map((dept) => {
                  const checked = selectedDepartments.includes(dept);
                  return (
                    <li key={dept} className="flex items-center gap-2.5 px-3 py-2 text-xs hover:bg-muted/30">
                      <Checkbox
                        isSelected={checked}
                        isDisabled={filterMode !== "department"}
                        onChange={(nextChecked) => toggleDepartment(dept, Boolean(nextChecked))}
                      />
                      <span className="truncate text-foreground">{dept}</span>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        </div>

        {/* Warnings & summary strip */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-muted/30 px-4 py-3 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <span>จำนวนพนักงานตามเงื่อนไข: <strong>{previewRows.length} คน</strong></span>
            {missingCitizenCount > 0 && selectedReportId !== "bank-xlsx" ? (
              <Badge color="warning" variant="caption">
                ยังไม่มีเลขบัตรประชาชน {missingCitizenCount} คน
              </Badge>
            ) : null}
            {missingBankCount > 0 && selectedReportId === "bank-xlsx" ? (
              <Badge color="warning" variant="caption">
                ยังไม่มีเลขบัญชี {missingBankCount} คน
              </Badge>
            ) : null}
          </div>
          <span className="tabular-nums text-muted-foreground">
            ยอดรายได้รวมในรายการ: <strong className="text-foreground">{formatMoney(previewRows.reduce((s, r) => s + (r.incomeTotal ?? 0), 0))} บาท</strong>
          </span>
        </div>

        {error ? <p role="alert" className="text-sm text-status-danger">{error}</p> : null}
        {notice ? <p role="status" className="text-sm text-status-success">{notice}</p> : null}

        <div className="flex flex-wrap items-center gap-2">
          {canExport ? (
            <>
              <Button
                type="button"
                leadingIcon={RiFileExcel2Line}
                disabled={exporting || previewRows.length === 0}
                onClick={() => handleExport()}
              >
                {exporting ? "กำลังสร้างไฟล์…" : "Export Excel"}
              </Button>
              {activeReport.supportsPdf ? (
                <Button
                  type="button"
                  variant="outline"
                  leadingIcon={RiFilePdf2Line}
                  disabled={exporting || previewRows.length === 0}
                  onClick={() => handleExport("summary-pdf")}
                >
                  Export PDF
                </Button>
              ) : null}
              {activeReport.supportsTxt ? (
                <Button
                  type="button"
                  variant="outline"
                  leadingIcon={RiBankLine}
                  disabled={exporting || previewRows.length === 0}
                  onClick={() => handleExport("bank-txt")}
                >
                  Export Bank File (.txt)
                </Button>
              ) : null}
            </>
          ) : (
            <p className="text-xs text-muted-foreground">บัญชีนี้ไม่มีสิทธิ์ส่งออกรายงานเงินเดือน</p>
          )}
        </div>
      </Card>
    </div>
  );
}
