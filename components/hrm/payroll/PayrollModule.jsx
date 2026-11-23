"use client";

import { useEffect, useMemo, useState } from "react";
import {
  RiArrowGoBackLine,
  RiCalendar2Line,
  RiCheckLine,
  RiFileChartLine,
  RiFilePdf2Line,
  RiLock2Line,
  RiLockUnlockLine,
  RiMoneyDollarCircleLine,
  RiSendPlaneLine,
  RiTableLine,
} from "@remixicon/react";
import { PageHeader } from "@/components/hrm/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectItem } from "@/components/ui/select";
import { Tab, TabList, TabPanel, Tabs } from "@/components/ui/tabs";
import { hasAnyPermission, hasPermission } from "@/lib/auth/permissions";
import { PayrollCostDonutCard } from "./PayrollCostDonutCard";
import { PayrollEmployeeEditDialog } from "./PayrollEmployeeEditDialog";
import { PayrollExportsCard } from "./PayrollExportsCard";
import { PayrollKpiRow } from "./PayrollKpiRow";
import { PayrollPeriodsTab } from "./PayrollPeriodsTab";
import { PayrollRowDetailDialog } from "./PayrollRowDetailDialog";
import { PayrollSheetTab } from "./PayrollSheetTab";
import { PayrollStatutoryTab } from "./PayrollStatutoryTab";
import { PayrollStepper } from "./PayrollStepper";
import { PayrollTableCard } from "./PayrollTableCard";
import { SalarySlipsTab } from "./SalarySlipsTab";
import {
  formatThaiDate,
  getShortMonthLabel,
  THAI_MONTH_OPTIONS,
  toBuddhistYear,
} from "./payrollFormat";

const EXPORT_FILENAMES = {
  xlsx: (slug) => `payroll-${slug}.xlsx`,
  "matrix-xlsx": (slug) => `payroll-matrix-${slug}.xlsx`,
  "summary-xlsx": (slug) => `TJARUSCH_PAYROLL_${slug}-01.xlsx`,
  "summary-pdf": (slug) => `TJARUSCH_PAYROLL_${slug}-01.pdf`,
  "gl-csv": (slug) => `gl-journal-${slug}.csv`,
  "bank-txt": (slug) => `bank-transfer-${slug}.txt`,
  "pnd1-xlsx": (slug) => `pnd1-${slug}.xlsx`,
  "sso-xlsx": (slug) => `sso-1-10-${slug}.xlsx`,
};

function downloadBlob(blob, filename) {
  const blobUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = blobUrl;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}

export default function PayrollModule({ permissions = [] }) {
  const now = new Date();
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [activeTab, setActiveTab] = useState("payroll");
  const [periodsRefreshToken, setPeriodsRefreshToken] = useState(0);

  const [payroll, setPayroll] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [search, setSearch] = useState("");
  const [onlyNeedsReview, setOnlyNeedsReview] = useState(false);
  const [selectedRowId, setSelectedRowId] = useState(null);
  const [editingOverrideRowId, setEditingOverrideRowId] = useState(null);

  const [workflowBusy, setWorkflowBusy] = useState(false);
  const [downloadingKey, setDownloadingKey] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionNotice, setActionNotice] = useState("");

  const canExport = hasPermission(permissions, "salary_slips.export");
  const canOperateWorkflow = hasAnyPermission(permissions, "salary_slips.export", "employees.compensation.manage");
  const canApproveWorkflow = canOperateWorkflow || hasAnyPermission(permissions, "ot.approve", "leave.approve");

  const years = useMemo(() => Array.from({ length: 8 }, (_, index) => now.getFullYear() - index), []);

  useEffect(() => {
    let cancelled = false;
    async function loadPeriod() {
      setLoading(true);
      setLoadError("");
      setActionError("");
      setActionNotice("");
      setSelectedRowId(null);
      setEditingOverrideRowId(null);
      try {
        const response = await fetch(`/api/payroll?year=${year}&month=${month}`, { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.error || "โหลดข้อมูลเงินเดือนไม่สำเร็จ");
        }
        if (!cancelled) {
          setPayroll(payload);
        }
      } catch (error) {
        if (!cancelled) {
          setPayroll(null);
          setLoadError(error instanceof Error ? error.message : "โหลดข้อมูลเงินเดือนไม่สำเร็จ");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    loadPeriod();
    return () => {
      cancelled = true;
    };
  }, [year, month]);

  const selectedRow = useMemo(
    () => (payroll?.rows ?? []).find((row) => row.employeeId === selectedRowId) ?? null,
    [payroll, selectedRowId],
  );

  const editingOverrideRow = useMemo(
    () => (payroll?.rows ?? []).find((row) => row.employeeId === editingOverrideRowId) ?? null,
    [payroll, editingOverrideRowId],
  );

  async function runWorkflowAction(action, extra = {}, targetMonth = Number(month)) {
    setWorkflowBusy(true);
    setActionError("");
    setActionNotice("");
    try {
      const response = await fetch("/api/payroll/workflow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year: Number(year),
          month: targetMonth,
          action,
          ...extra,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "อัปเดตสถานะงวดเงินเดือนไม่สำเร็จ");
      }
      if (targetMonth === Number(month)) {
        setPayroll(payload);
      }
      setPeriodsRefreshToken((token) => token + 1);
      if (action === "toggle_verify") {
        setSelectedRowId(null);
        if ((payload?.summary?.reviewCount ?? 0) === 0) {
          setOnlyNeedsReview(false);
        }
      }
      if (action === "save_employee_override" || action === "reset_employee_override") {
        setEditingOverrideRowId(null);
      }
      const noticeMap = {
        toggle_verify:
          payload?.workflow?.status === "pending_approval"
            ? "ยืนยันตรวจสอบครบทุกรายการและส่งงวดเงินเดือนเข้าสู่ขั้นตอนอนุมัติแล้ว"
            : "อัปเดตสถานะการตรวจสอบพนักงานแล้ว",
        submit_approval: "ส่งงวดเงินเดือนเพื่อขออนุมัติแล้ว",
        approve: "อนุมัติงวดเงินเดือนเรียบร้อยแล้ว",
        reject_to_review: "ส่งงวดเงินเดือนกลับไปขั้นตอนตรวจสอบแล้ว",
        lock: "ล็อกงวดเงินเดือนเรียบร้อยแล้ว",
        close_period: "ปิดงวดเงินเดือนเรียบร้อยแล้ว",
        reopen: "ปลดล็อกงวดเงินเดือนกลับสู่ขั้นตอนตรวจสอบแล้ว",
        mark_paid: "บันทึกการจ่ายเงินเดือนเรียบร้อยแล้ว",
        save_employee_override: "บันทึกรายได้และรายหักเฉพาะงวดของพนักงานแล้ว",
        reset_employee_override: "รีเซ็ตยอดพนักงานกลับเป็นค่าจากโปรไฟล์หลักแล้ว",
        save_working_days: "บันทึกจำนวนวันทำงานประจำงวดเรียบร้อยแล้ว",
        bulk_import_overrides: "นำเข้าข้อมูลรายได้และรายหักประจำงวดแล้ว",
        recalculate_period: "คำนวณค่าจ้างงวดนี้ใหม่จากโปรไฟล์พนักงานและ OT แล้ว",
        update_period_settings: "บันทึกการตั้งค่างวดเงินเดือนแล้ว",
      };
      setActionNotice(noticeMap[action] || "บันทึกสถานะแล้ว");
      return true;
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "อัปเดตสถานะไม่สำเร็จ");
      return false;
    } finally {
      setWorkflowBusy(false);
    }
  }

  async function handleDownloadExport(formatKey) {
    setDownloadingKey(formatKey);
    setActionError("");
    setActionNotice("");
    try {
      const response = await fetch(`/api/payroll?year=${year}&month=${month}&format=${formatKey}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "ส่งออกไฟล์ไม่สำเร็จ");
      }
      const slug = `${year}-${String(month).padStart(2, "0")}`;
      const filename = EXPORT_FILENAMES[formatKey]?.(slug) ?? `payroll-${slug}.bin`;
      downloadBlob(await response.blob(), filename);
      setActionNotice(`ดาวน์โหลดไฟล์ ${filename} แล้ว`);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "ส่งออกไฟล์ไม่สำเร็จ");
    } finally {
      setDownloadingKey("");
    }
  }

  async function handleExportSingleSlip(row, format) {
    setWorkflowBusy(true);
    setActionError("");
    setActionNotice("");
    try {
      const response = await fetch("/api/payroll/slips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year: Number(year),
          month: Number(month),
          format,
          employeeIds: [row.employeeId],
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "ออกสลิปเงินเดือนไม่สำเร็จ");
      }
      const slug = `${year}-${String(month).padStart(2, "0")}`;
      downloadBlob(await response.blob(), `salary-slip-${row.code}-${slug}.${format}`);
      setActionNotice(`ออกสลิปเงินเดือนของ ${row.name} (.${format}) แล้ว`);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "ออกสลิปเงินเดือนไม่สำเร็จ");
    } finally {
      setWorkflowBusy(false);
    }
  }

  const workflowStatus = payroll?.workflow?.status ?? "review";
  const isLocked = workflowStatus === "locked" || workflowStatus === "paid";
  const hasRows = (payroll?.rows?.length ?? 0) > 0;
  const hasUnresolvedReview = (payroll?.summary?.blockingCount ?? 0) > 0 || (payroll?.summary?.reviewCount ?? 0) > 0;

  const ssoRule = payroll?.socialSecurityRule;
  const ssoMaxLabel = ssoRule
    ? `ปกส. ${ssoRule.employeeRatePercent}% เพดาน ฿${Number(ssoRule.maxWageBase).toLocaleString("th-TH")} (สูงสุด ฿${Math.round(ssoRule.maxWageBase * (ssoRule.employeeRatePercent / 100)).toLocaleString("th-TH")})`
    : "";
  const periodHeading = `เงินเดือน — งวด ${getShortMonthLabel(month)} ${toBuddhistYear(year)}`;
  const periodDescription = payroll
    ? `ตัดรอบ ${formatThaiDate(payroll.periodStart)} – ${formatThaiDate(payroll.periodEnd)} · จ่าย ${formatThaiDate(payroll.payDate)} · ${payroll.companyName}${ssoMaxLabel ? ` · ${ssoMaxLabel}` : ""}`
    : "กำลังโหลดข้อมูลรอบเงินเดือนจากระบบ HRM…";

  return (
    <div className="hrm-page space-y-5">
      <PageHeader
        eyebrow="HRM · PAYROLL THAILAND"
        title={periodHeading}
        description={periodDescription}
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-36">
              <Select
                id="payroll-month"
                aria-label="เลือกเดือนงวดเงินเดือน"
                selectedKey={month}
                onSelectionChange={(value) => setMonth(String(value))}
              >
                {THAI_MONTH_OPTIONS.map((item) => (
                  <SelectItem id={item.value} key={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </Select>
            </div>
            <div className="w-28">
              <Select
                id="payroll-year"
                aria-label="เลือกปีงวดเงินเดือน"
                selectedKey={year}
                onSelectionChange={(value) => setYear(String(value))}
              >
                {years.map((item) => (
                  <SelectItem id={String(item)} key={item}>
                    {toBuddhistYear(item)}
                  </SelectItem>
                ))}
              </Select>
            </div>

            {workflowStatus === "review" && canOperateWorkflow ? (
              <Button
                type="button"
                leadingIcon={RiSendPlaneLine}
                disabled={loading || workflowBusy || !hasRows || hasUnresolvedReview}
                title={hasUnresolvedReview ? "กรุณาตรวจสอบและยืนยันรายการที่มีประเด็นให้ครบก่อนส่งอนุมัติ" : undefined}
                onClick={() => runWorkflowAction("submit_approval")}
              >
                ส่งอนุมัติ
              </Button>
            ) : null}

            {workflowStatus === "pending_approval" && canApproveWorkflow ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  leadingIcon={RiArrowGoBackLine}
                  disabled={loading || workflowBusy}
                  onClick={() => runWorkflowAction("reject_to_review")}
                >
                  ส่งกลับแก้ไข
                </Button>
                <Button
                  type="button"
                  leadingIcon={RiCheckLine}
                  disabled={loading || workflowBusy}
                  onClick={() => runWorkflowAction("approve")}
                >
                  อนุมัติงวด
                </Button>
              </>
            ) : null}

            {workflowStatus === "approved" && canOperateWorkflow ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  leadingIcon={RiArrowGoBackLine}
                  disabled={loading || workflowBusy}
                  onClick={() => runWorkflowAction("reject_to_review")}
                >
                  ส่งกลับแก้ไข
                </Button>
                <Button
                  type="button"
                  leadingIcon={RiLock2Line}
                  disabled={loading || workflowBusy}
                  onClick={() => runWorkflowAction("lock")}
                >
                  ล็อกงวดเงินเดือน
                </Button>
              </>
            ) : null}

            {workflowStatus === "locked" && canOperateWorkflow ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  leadingIcon={RiLockUnlockLine}
                  disabled={loading || workflowBusy}
                  onClick={() => runWorkflowAction("reopen")}
                >
                  ปลดล็อกงวด
                </Button>
                <Button
                  type="button"
                  leadingIcon={RiMoneyDollarCircleLine}
                  disabled={loading || workflowBusy}
                  onClick={() => runWorkflowAction("mark_paid")}
                >
                  บันทึกจ่าย &amp; เปิดสลิป
                </Button>
              </>
            ) : null}

            {workflowStatus === "paid" ? (
              <Badge color="success" className="h-10 px-3 text-xs">
                จ่ายเงินเดือนแล้ว
              </Badge>
            ) : null}
          </div>
        )}
      />

      {loadError ? (
        <p role="alert" className="rounded-md border border-status-danger/30 bg-status-danger/10 px-4 py-3 text-sm text-status-danger">
          {loadError}
        </p>
      ) : null}
      {actionError ? (
        <p role="alert" className="rounded-md border border-status-danger/30 bg-status-danger/10 px-4 py-3 text-sm text-status-danger">
          {actionError}
        </p>
      ) : null}
      {actionNotice ? (
        <p role="status" className="rounded-md border border-status-success/30 bg-status-success/10 px-4 py-3 text-sm text-status-success">
          {actionNotice}
        </p>
      ) : null}

      <Tabs selectedKey={activeTab} onSelectionChange={(key) => setActiveTab(String(key))}>
        <TabList aria-label="มุมมองระบบเงินเดือน">
          <Tab id="payroll" count={payroll?.rows?.length ?? 0}>
            คำนวณเงินเดือน
          </Tab>
          <Tab id="sheet" icon={RiTableLine}>
            ตารางคำนวณรายงวด
          </Tab>
          <Tab id="periods" icon={RiCalendar2Line}>
            จัดการงวดเงินเดือน
          </Tab>
          <Tab id="slips" icon={RiFilePdf2Line}>
            ออกสลิปเงินเดือน
          </Tab>
          <Tab id="statutory" icon={RiFileChartLine}>
            รายงานภาษี &amp; สปส.
          </Tab>
        </TabList>

        <TabPanel id="payroll" className="mt-4 space-y-5">
          <PayrollStepper payroll={payroll} />

          <PayrollKpiRow
            payroll={payroll}
            loading={loading}
            onlyNeedsReview={onlyNeedsReview}
            onToggleReviewFilter={() => setOnlyNeedsReview((prev) => !prev)}
          />

          <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
            <PayrollTableCard
              rows={payroll?.rows ?? []}
              loading={loading}
              search={search}
              onSearchChange={setSearch}
              onlyNeedsReview={onlyNeedsReview}
              onOnlyNeedsReviewChange={setOnlyNeedsReview}
              onSelectRow={(row) => setSelectedRowId(row.employeeId)}
            />

            <div className="space-y-5">
              <PayrollCostDonutCard summary={payroll?.summary} loading={loading} />
              <PayrollExportsCard
                year={year}
                month={month}
                payroll={payroll}
                canExport={canExport}
                downloadingKey={downloadingKey}
                onDownload={handleDownloadExport}
                onOpenSlipsTab={() => setActiveTab("slips")}
              />
            </div>
          </div>
        </TabPanel>

        <TabPanel id="sheet" className="mt-4">
          <PayrollSheetTab
            payroll={payroll}
            loading={loading}
            canOperate={canOperateWorkflow}
            canExport={canExport}
            busy={workflowBusy}
            downloadingKey={downloadingKey}
            onEditRow={(row) => setEditingOverrideRowId(row.employeeId)}
            onClosePeriod={() => runWorkflowAction("close_period")}
            onReopenPeriod={() => runWorkflowAction("reopen")}
            onRecalculatePeriod={() => runWorkflowAction("recalculate_period")}
            onExportRegister={() => handleDownloadExport("matrix-xlsx")}
            onExportSummaryPdf={() => handleDownloadExport("summary-pdf")}
            onExportSummaryXlsx={() => handleDownloadExport("summary-xlsx")}
            onSaveWorkingDays={(workingDaysMap) => runWorkflowAction("save_working_days", { workingDaysMap })}
            onBulkImportOverrides={(importedRows) => runWorkflowAction("bulk_import_overrides", { importedRows })}
          />
        </TabPanel>

        <TabPanel id="periods" className="mt-4">
          <PayrollPeriodsTab
            year={year}
            currentMonth={month}
            refreshToken={periodsRefreshToken}
            canOperate={canOperateWorkflow}
            busy={workflowBusy}
            onSelectPeriod={(targetMonth) => {
              setMonth(String(targetMonth));
              setActiveTab("sheet");
            }}
            onClosePeriodForMonth={(targetMonth) => runWorkflowAction("close_period", {}, targetMonth)}
            onReopenPeriodForMonth={(targetMonth) => runWorkflowAction("reopen", {}, targetMonth)}
          />
        </TabPanel>

        <TabPanel id="slips" className="mt-4">
          <SalarySlipsTab
            year={year}
            month={month}
            payroll={payroll}
            loadingPayroll={loading}
            permissions={permissions}
          />
        </TabPanel>

        <TabPanel id="statutory" className="mt-4">
          <PayrollStatutoryTab
            year={year}
            month={month}
            payroll={payroll}
            canExport={canExport}
            onOpenSlipsTab={() => setActiveTab("slips")}
          />
        </TabPanel>
      </Tabs>

      <PayrollRowDetailDialog
        row={selectedRow}
        workflowStatus={workflowStatus}
        canVerify={canOperateWorkflow}
        canExport={canExport}
        busy={workflowBusy}
        onClose={() => setSelectedRowId(null)}
        onToggleVerify={(employeeId) => runWorkflowAction("toggle_verify", { employeeId })}
        onExportSingleSlip={handleExportSingleSlip}
        onEditOverride={(row) => {
          setSelectedRowId(null);
          setEditingOverrideRowId(row.employeeId);
        }}
      />

      <PayrollEmployeeEditDialog
        row={editingOverrideRow}
        socialSecurityRule={payroll?.socialSecurityRule ?? null}
        locked={isLocked}
        busy={workflowBusy}
        onClose={() => setEditingOverrideRowId(null)}
        onSave={(employeeId, override) => runWorkflowAction("save_employee_override", { employeeId, override })}
        onReset={(employeeId) => runWorkflowAction("reset_employee_override", { employeeId })}
      />
    </div>
  );
}
