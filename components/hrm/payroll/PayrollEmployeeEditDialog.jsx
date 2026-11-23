"use client";

import { useEffect, useMemo, useState } from "react";
import { RiCalculatorLine, RiRestartLine, RiSaveLine } from "@remixicon/react";
import { HrmDialog } from "@/components/hrm/HrmDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectItem } from "@/components/ui/select";
import { STANDARD_DEDUCTION_COLUMNS, STANDARD_INCOME_COLUMNS } from "@/lib/payroll/types";
import { formatBaht } from "./payrollFormat";

function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function toNonNegativeNumber(raw) {
  const num = Number(raw);
  return Number.isFinite(num) && num >= 0 ? round2(num) : 0;
}

function buildInitialAmounts(columns, breakdown) {
  const result = {};
  for (const col of columns) {
    result[col.code] = Number(breakdown?.[col.code] ?? 0);
  }
  return result;
}

export function PayrollEmployeeEditDialog({
  row,
  socialSecurityRule = null,
  locked = false,
  busy = false,
  onClose,
  onSave,
  onReset,
}) {
  const [incomes, setIncomes] = useState({});
  const [deductions, setDeductions] = useState({});
  const [workingDays, setWorkingDays] = useState("");
  const [dailyRate, setDailyRate] = useState("");
  const [ot1xAmount, setOt1xAmount] = useState("0");
  const [weekdayOtAmount, setWeekdayOtAmount] = useState("0");
  const [holidayOtAmount, setHolidayOtAmount] = useState("0");
  const [otSplitTouched, setOtSplitTouched] = useState(false);
  const [dailyRateTouched, setDailyRateTouched] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("transfer");
  const [remark, setRemark] = useState("");

  useEffect(() => {
    if (!row) return;
    setIncomes(buildInitialAmounts(STANDARD_INCOME_COLUMNS, row.incomeBreakdown));
    setDeductions(buildInitialAmounts(STANDARD_DEDUCTION_COLUMNS, row.deductionBreakdown));
    setWorkingDays(row.workingDays == null ? "" : String(row.workingDays));
    setDailyRate(row.dailyRate ? String(row.dailyRate) : "");
    setOt1xAmount(String(row.ot1xAmount ?? 0));
    setWeekdayOtAmount(String(row.weekdayOtAmount ?? 0));
    setHolidayOtAmount(String(row.holidayOtAmount ?? 0));
    setOtSplitTouched(false);
    setDailyRateTouched(false);
    setPaymentMethod(row.paymentMethod === "cash" ? "cash" : "transfer");
    setRemark(row.remark ?? "");
  }, [row]);

  const dailyWagePreview = useMemo(() => {
    const days = workingDays.trim() === "" ? 0 : toNonNegativeNumber(workingDays);
    const rate = dailyRate.trim() === "" ? 0 : toNonNegativeNumber(dailyRate);
    return round2(days * rate);
  }, [workingDays, dailyRate]);

  const totals = useMemo(() => {
    const standardIncomeTotal = STANDARD_INCOME_COLUMNS.reduce((sum, col) => sum + Number(incomes[col.code] || 0), 0);
    const incomeTotal = round2(standardIncomeTotal + dailyWagePreview);
    const deductionTotal = round2(
      STANDARD_DEDUCTION_COLUMNS.reduce((sum, col) => sum + Number(deductions[col.code] || 0), 0),
    );
    return {
      incomeTotal,
      deductionTotal,
      netPay: round2(incomeTotal - deductionTotal),
    };
  }, [incomes, deductions, dailyWagePreview]);

  if (!row) return null;

  function handleIncomeChange(code, raw) {
    const num = raw === "" ? 0 : Number(raw);
    const safeVal = Number.isFinite(num) && num >= 0 ? num : 0;
    setIncomes((prev) => ({ ...prev, [code]: safeVal }));
    if (code === "INT002") {
      setOtSplitTouched(false);
      setOt1xAmount("0");
      setWeekdayOtAmount(String(safeVal));
      setHolidayOtAmount("0");
    }
  }

  function handleOtSplitChange(kind, raw) {
    const next1x = kind === "ot1x" ? raw : ot1xAmount;
    const next15x = kind === "ot15x" ? raw : weekdayOtAmount;
    const next2x = kind === "ot2x" ? raw : holidayOtAmount;
    if (kind === "ot1x") setOt1xAmount(raw);
    if (kind === "ot15x") setWeekdayOtAmount(raw);
    if (kind === "ot2x") setHolidayOtAmount(raw);
    setOtSplitTouched(true);
    const sum = round2(toNonNegativeNumber(next1x) + toNonNegativeNumber(next15x) + toNonNegativeNumber(next2x));
    setIncomes((prev) => ({ ...prev, INT002: sum }));
  }

  function handlePaymentMethodChange(nextMethod) {
    setPaymentMethod(nextMethod);
    if (nextMethod === "cash" && !remark.trim()) {
      setRemark("เงินสด");
    } else if (nextMethod === "transfer" && remark.trim() === "เงินสด") {
      setRemark("");
    }
  }

  function handleDeductionChange(code, raw) {
    const num = raw === "" ? 0 : Number(raw);
    setDeductions((prev) => ({ ...prev, [code]: Number.isFinite(num) && num >= 0 ? num : 0 }));
  }

  const ssoRatePercent = Number(socialSecurityRule?.employeeRatePercent ?? 5);
  const ssoMinWage = Number(socialSecurityRule?.minWageBase ?? 1650);
  const ssoMaxWage = Number(socialSecurityRule?.maxWageBase ?? 17500);
  const ssoMaxAmount = Math.round(ssoMaxWage * (ssoRatePercent / 100));

  function applySsoAuto() {
    const wageBase = Number(incomes.INT001 || 0) + dailyWagePreview;
    if (wageBase <= 0) {
      setDeductions((prev) => ({ ...prev, SYS001: 0 }));
      return;
    }
    const clamped = Math.min(Math.max(wageBase, ssoMinWage), ssoMaxWage);
    const sso = Math.round(clamped * (ssoRatePercent / 100));
    setDeductions((prev) => ({ ...prev, SYS001: sso }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    const parsedDays = workingDays.trim() === "" ? null : Number(workingDays);
    const parsedDailyRate = dailyRate.trim() === "" ? null : toNonNegativeNumber(dailyRate);
    onSave?.(row.employeeId, {
      incomes,
      deductions,
      workingDays: parsedDays != null && Number.isFinite(parsedDays) && parsedDays >= 0 ? parsedDays : null,
      ...(dailyRateTouched ? { dailyRate: parsedDailyRate } : {}),
      ...(otSplitTouched
        ? {
            ot1xAmount: toNonNegativeNumber(ot1xAmount),
            weekdayOtAmount: toNonNegativeNumber(weekdayOtAmount),
            holidayOtAmount: toNonNegativeNumber(holidayOtAmount),
          }
        : {}),
      paymentMethod,
      remark: remark.trim(),
    });
  }

  return (
    <HrmDialog
      open={Boolean(row)}
      onClose={onClose}
      size="lg"
      className="max-w-4xl"
      title={`พนักงาน (${row.code} : ${row.name})`}
      description={`${row.department || "ไม่ระบุแผนก"} · ปรับปรุงรายการรายได้และรายหักประจำงวด (ไม่แก้ฐานข้อมูลหลักในโปรไฟล์พนักงาน)`}
      footer={(
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {!locked && row.hasPeriodOverride ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                leadingIcon={RiRestartLine}
                disabled={busy}
                onClick={() => onReset?.(row.employeeId)}
              >
                ดึงค่าเริ่มต้นจากโปรไฟล์
              </Button>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!locked ? (
              <Button
                type="submit"
                form="payroll-employee-override-form"
                size="sm"
                leadingIcon={RiSaveLine}
                disabled={busy}
              >
                {busy ? "กำลังบันทึก…" : "บันทึก"}
              </Button>
            ) : null}
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              ปิด
            </Button>
          </div>
        </div>
      )}
    >
      <form id="payroll-employee-override-form" onSubmit={handleSubmit} className="space-y-4 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-medium text-foreground">สถานะงวด:</span>
            {locked ? (
              <Badge color="danger" variant="caption">ปิดงวดแล้ว (อ่านอย่างเดียว)</Badge>
            ) : row.hasPeriodOverride ? (
              <Badge color="warning" variant="caption">ปรับปรุงยอดเฉพาะงวดนี้แล้ว</Badge>
            ) : (
              <Badge color="info" variant="caption">ใช้ค่าตามโปรไฟล์ &amp; OT อนุมัติ</Badge>
            )}
          </div>
          {!locked ? (
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span>วันทำงาน (วัน):</span>
                <input
                  type="number"
                  min="0"
                  max="31"
                  step="0.5"
                  value={workingDays}
                  onChange={(event) => setWorkingDays(event.target.value)}
                  placeholder="—"
                  className="h-8 w-20 rounded-sm border border-input bg-background px-2 text-right text-xs tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </label>
              <Button
                type="button"
                variant="outline"
                size="xs"
                leadingIcon={RiCalculatorLine}
                disabled={busy}
                onClick={applySsoAuto}
              >
                คำนวณ ปกส. {ssoRatePercent}% (สูงสุด {ssoMaxAmount.toLocaleString("th-TH")})
              </Button>
            </div>
          ) : null}
        </div>

        <div className="grid gap-3 rounded-md border border-border bg-muted/20 p-3 sm:grid-cols-2 lg:grid-cols-6">
          <label className="space-y-1 text-xs">
            <span className="block font-medium text-muted-foreground">ค่าแรงวันละ (บาท)</span>
            <input
              type="number"
              min="0"
              step="0.01"
              disabled={locked || busy}
              value={dailyRate}
              onChange={(event) => {
                setDailyRate(event.target.value);
                setDailyRateTouched(true);
              }}
              placeholder="0.00"
              className="h-9 w-full rounded-sm border border-input bg-background px-2 text-right text-xs tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:bg-muted disabled:opacity-70"
            />
          </label>
          <label className="space-y-1 text-xs">
            <span className="block font-medium text-muted-foreground">OT x1 (บาท)</span>
            <input
              type="number"
              min="0"
              step="0.01"
              disabled={locked || busy}
              value={ot1xAmount}
              onChange={(event) => handleOtSplitChange("ot1x", event.target.value)}
              className="h-9 w-full rounded-sm border border-input bg-background px-2 text-right text-xs tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:bg-muted disabled:opacity-70"
            />
          </label>
          <label className="space-y-1 text-xs">
            <span className="block font-medium text-muted-foreground">OT x1.5 (บาท)</span>
            <input
              type="number"
              min="0"
              step="0.01"
              disabled={locked || busy}
              value={weekdayOtAmount}
              onChange={(event) => handleOtSplitChange("ot15x", event.target.value)}
              className="h-9 w-full rounded-sm border border-input bg-background px-2 text-right text-xs tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:bg-muted disabled:opacity-70"
            />
          </label>
          <label className="space-y-1 text-xs">
            <span className="block font-medium text-muted-foreground">OT x2 (บาท)</span>
            <input
              type="number"
              min="0"
              step="0.01"
              disabled={locked || busy}
              value={holidayOtAmount}
              onChange={(event) => handleOtSplitChange("ot2x", event.target.value)}
              className="h-9 w-full rounded-sm border border-input bg-background px-2 text-right text-xs tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:bg-muted disabled:opacity-70"
            />
          </label>
          <div className="space-y-1 text-xs">
            <span className="block font-medium text-muted-foreground">วิธีจ่ายเงิน</span>
            <Select
              aria-label="วิธีจ่ายเงิน"
              size="sm"
              isDisabled={locked || busy}
              selectedKey={paymentMethod}
              onSelectionChange={(val) => handlePaymentMethodChange(String(val))}
            >
              <SelectItem id="transfer">โอนเข้าบัญชี (Payroll)</SelectItem>
              <SelectItem id="cash">เงินสด</SelectItem>
            </Select>
          </div>
          <label className="space-y-1 text-xs">
            <span className="block font-medium text-muted-foreground">หมายเหตุ (ใบสรุปจ่าย)</span>
            <input
              type="text"
              maxLength={200}
              disabled={locked || busy}
              value={remark}
              onChange={(event) => setRemark(event.target.value)}
              placeholder={paymentMethod === "cash" ? "เงินสด" : "ระบุหมายเหตุ…"}
              className="h-9 w-full rounded-sm border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:bg-muted disabled:opacity-70"
            />
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="overflow-hidden rounded-md border border-border">
            <div className="border-b border-border bg-muted/50 px-3 py-2">
              <h3 className="text-xs font-semibold text-foreground">สรุปรายได้ (Incomes)</h3>
            </div>
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">รหัสรายได้</th>
                  <th className="px-3 py-2 text-left font-medium">ชื่อรายได้</th>
                  <th className="w-32 px-3 py-2 text-right font-medium">จำนวน</th>
                </tr>
              </thead>
              <tbody>
                {STANDARD_INCOME_COLUMNS.map((col) => (
                  <tr key={col.code} className="border-b border-border last:border-b-0">
                    <td className="px-3 py-1.5 font-mono text-[11px] text-muted-foreground">{col.code}</td>
                    <td className="px-3 py-1.5 font-medium text-foreground">{col.label}</td>
                    <td className="px-3 py-1.5">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        aria-label={`${col.label} (${col.code})`}
                        disabled={locked || busy}
                        value={incomes[col.code] ?? 0}
                        onChange={(event) => handleIncomeChange(col.code, event.target.value)}
                        className="h-8 w-full rounded-sm border border-input bg-background px-2 text-right text-xs tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:bg-muted disabled:opacity-70"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="overflow-hidden rounded-md border border-border">
            <div className="border-b border-border bg-muted/50 px-3 py-2">
              <h3 className="text-xs font-semibold text-foreground">รายการหัก (Deductions)</h3>
            </div>
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">รหัสรายหัก</th>
                  <th className="px-3 py-2 text-left font-medium">ชื่อรายหัก</th>
                  <th className="w-32 px-3 py-2 text-right font-medium">จำนวน</th>
                </tr>
              </thead>
              <tbody>
                {STANDARD_DEDUCTION_COLUMNS.map((col) => (
                  <tr key={col.code} className="border-b border-border last:border-b-0">
                    <td className="px-3 py-1.5 font-mono text-[11px] text-muted-foreground">{col.code}</td>
                    <td className="px-3 py-1.5 font-medium text-foreground">{col.label}</td>
                    <td className="px-3 py-1.5">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        aria-label={`${col.label} (${col.code})`}
                        disabled={locked || busy}
                        value={deductions[col.code] ?? 0}
                        onChange={(event) => handleDeductionChange(col.code, event.target.value)}
                        className="h-8 w-full rounded-sm border border-input bg-background px-2 text-right text-xs tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:bg-muted disabled:opacity-70"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 rounded-md border border-border bg-muted/30 p-3 text-xs sm:grid-cols-3">
          <div className="flex items-center justify-between sm:block">
            <span className="text-muted-foreground">รวมรายได้</span>
            <p className="font-semibold tabular-nums text-foreground sm:mt-0.5 sm:text-sm">{formatBaht(totals.incomeTotal)}</p>
          </div>
          <div className="flex items-center justify-between sm:block">
            <span className="text-muted-foreground">รวมรายหัก</span>
            <p className="font-semibold tabular-nums text-status-danger sm:mt-0.5 sm:text-sm">{formatBaht(totals.deductionTotal)}</p>
          </div>
          <div className="flex items-center justify-between sm:block">
            <span className="text-muted-foreground">สรุปรายรับสุทธิ (Net Pay)</span>
            <p className="font-semibold tabular-nums text-primary sm:mt-0.5 sm:text-sm">{formatBaht(totals.netPay)}</p>
          </div>
        </div>
      </form>
    </HrmDialog>
  );
}
