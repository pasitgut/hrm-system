import { count, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { employees, payrollRuns } from "@/lib/db/schema";
import { isSystemAdminUserId, SYSTEM_ADMIN_DISPLAY_NAME } from "@/lib/auth/admin";
import { monthRangeUtc, utcToBangkokParts } from "@/app/api/ot/_shared";
import { getSocialSecurityRuleForPeriod } from "@/lib/settings/socialSecuritySettings";
import { buildPayrollRow, groupLeaves, money, summarizeOvertime, summarizePayroll } from "./calculate";
import { loadPayrollInputs, loadPayrollRun, type PayrollRunRecord } from "./inputs";
import type {
  Payroll,
  PayrollEmployeeOverride,
  PayrollPeriodSettings,
  PayrollPeriodSummary,
  PayrollWorkflow,
  PayrollWorkflowAction,
} from "./types";

const DAY_MS = 86_400_000;

export const PAYROLL_COMPANY_NAME = "บริษัท ต.จรัสชัย สากลก่อสร้าง จำกัด";

export class PayrollWorkflowError extends Error {
  constructor(message: string, public status = 409) {
    super(message);
    this.name = "PayrollWorkflowError";
  }
}

function toWorkflowDto(run: PayrollRunRecord | null): PayrollWorkflow {
  if (!run) {
    return {
      status: "review",
      verifiedEmployeeIds: [],
      hasSnapshot: false,
      overrides: {},
      settings: {},
      submittedByName: null,
      submittedAt: null,
      approvedByName: null,
      approvedAt: null,
      lockedByName: null,
      lockedAt: null,
      paidByName: null,
      paidAt: null,
      note: null,
    };
  }
  return {
    status: run.status,
    verifiedEmployeeIds: run.verifiedEmployeeIds ?? [],
    hasSnapshot: Array.isArray(run.snapshot),
    overrides: run.overrides ?? {},
    settings: run.settings ?? {},
    submittedByName: run.submittedByName ?? null,
    submittedAt: run.submittedAt ? run.submittedAt.toISOString() : null,
    approvedByName: run.approvedByName ?? null,
    approvedAt: run.approvedAt ? run.approvedAt.toISOString() : null,
    lockedByName: run.lockedByName ?? null,
    lockedAt: run.lockedAt ? run.lockedAt.toISOString() : null,
    paidByName: run.paidByName ?? null,
    paidAt: run.paidAt ? run.paidAt.toISOString() : null,
    note: run.note ?? null,
  };
}

export type CreatePayrollOptions = {
  includePreviousComparison?: boolean;
  ignoreSnapshot?: boolean;
};

/** Payroll for the period labelled by `year`/`month`: the calendar month, 1st through last day (Asia/Bangkok). */
export async function createPayroll(
  year: number,
  month: number,
  options: CreatePayrollOptions = {},
): Promise<Payroll> {
  const { start, end } = monthRangeUtc(`${year}-${String(month).padStart(2, "0")}`);
  const startDate = utcToBangkokParts(start).date;
  const endExclusiveDate = utcToBangkokParts(end).date;
  const periodEnd = new Date(new Date(`${endExclusiveDate}T00:00:00Z`).getTime() - DAY_MS).toISOString().slice(0, 10);

  const [payrollRun, socialSecurityRule] = await Promise.all([
    loadPayrollRun(year, month),
    getSocialSecurityRuleForPeriod(year, month),
  ]);
  const verifiedSet = new Set(payrollRun?.verifiedEmployeeIds ?? []);
  const overrides = payrollRun?.overrides ?? {};
  const useSnapshot = Boolean(
    payrollRun
    && (payrollRun.status === "locked" || payrollRun.status === "paid")
    && Array.isArray(payrollRun.snapshot)
    && !options.ignoreSnapshot,
  );

  let rows;
  if (useSnapshot && payrollRun?.snapshot) {
    rows = payrollRun.snapshot;
  } else {
    const inputs = await loadPayrollInputs({ start, end, startDate, endExclusiveDate });
    const overtimeByEmployee = summarizeOvertime(inputs.overtime, inputs.employees);
    const leavesByEmployee = groupLeaves(inputs.leaves);
    rows = inputs.employees.map((employee) =>
      buildPayrollRow(
        employee,
        overtimeByEmployee.get(employee.employeeId),
        leavesByEmployee.get(employee.employeeId),
        {
          periodStart: startDate,
          periodEnd,
          verifiedEmployeeIds: verifiedSet,
          employeeOverride: overrides[employee.employeeId],
          socialSecurityRule,
        },
      ));
  }

  let previousGrossTotal: number | null = null;
  if (options.includePreviousComparison !== false) {
    const prevYear = month === 1 ? year - 1 : year;
    const prevMonth = month === 1 ? 12 : month - 1;
    const previousPayroll = await createPayroll(prevYear, prevMonth, { includePreviousComparison: false });
    previousGrossTotal = previousPayroll.rows.length > 0 ? previousPayroll.summary.grossTotal : null;
  }

  return {
    year,
    month,
    periodStart: startDate,
    periodEnd,
    payDate: payrollRun?.settings?.payDate || periodEnd,
    companyName: PAYROLL_COMPANY_NAME,
    socialSecurityRule,
    rows,
    summary: summarizePayroll(rows, previousGrossTotal),
    workflow: toWorkflowDto(payrollRun),
  };
}

/** Lists all 12 periods (Dec down to Jan) for the given year with status and period settings. */
export async function listPayrollPeriods(year: number): Promise<PayrollPeriodSummary[]> {
  let runs: PayrollRunRecord[] = [];
  try {
    runs = await db.select().from(payrollRuns).where(eq(payrollRuns.year, year));
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String((error as { code: unknown }).code) : "";
    if (code !== "42P01") throw error;
  }

  const [{ activeCount }] = await db
    .select({ activeCount: count() })
    .from(employees)
    .where(isNull(employees.deletedAt));

  const runByMonth = new Map(runs.map((run) => [run.month, run]));

  return Array.from({ length: 12 }, (_, idx) => 12 - idx).map((month) => {
    const mm = String(month).padStart(2, "0");
    const { start, end } = monthRangeUtc(`${year}-${mm}`);
    const periodStart = utcToBangkokParts(start).date;
    const endExclusiveDate = utcToBangkokParts(end).date;
    const periodEnd = new Date(new Date(`${endExclusiveDate}T00:00:00Z`).getTime() - DAY_MS).toISOString().slice(0, 10);

    const run = runByMonth.get(month) ?? null;
    const settings = run?.settings ?? {};
    const workflowStatus = run?.status ?? "review";
    const isClosed = workflowStatus === "locked" || workflowStatus === "paid";
    const snapshot = Array.isArray(run?.snapshot) ? run.snapshot : null;

    return {
      year,
      month,
      periodCode: `${year}-${mm}-01`,
      periodStart,
      periodEnd,
      payDate: settings.payDate || periodEnd,
      leaveCutoffDate: settings.leaveCutoffDate || periodEnd,
      otCutoffDate: settings.otCutoffDate || periodEnd,
      status: isClosed ? "closed" : "open",
      workflowStatus,
      groupName: settings.groupName || "บัญชีเงินเดือน",
      includeMonthly: settings.includeMonthly ?? true,
      includeDaily: settings.includeDaily ?? true,
      employeeCount: snapshot ? snapshot.length : activeCount,
      overrideCount: Object.keys(run?.overrides ?? {}).length,
      netTotal: snapshot ? money(snapshot.reduce((sum, row) => sum + (row.netPay ?? 0), 0)) : null,
      lockedAt: run?.lockedAt ? run.lockedAt.toISOString() : null,
      lockedByName: run?.lockedByName ?? null,
    };
  });
}

export type WorkflowActor = {
  userId: string;
  employeeId?: string | null;
  email: string;
};

async function resolveActor(actor: WorkflowActor): Promise<{ userId: string | null; name: string }> {
  if (isSystemAdminUserId(actor.userId)) {
    return { userId: null, name: SYSTEM_ADMIN_DISPLAY_NAME };
  }
  if (actor.employeeId) {
    const [emp] = await db
      .select({ firstName: employees.firstName, lastName: employees.lastName })
      .from(employees)
      .where(eq(employees.id, actor.employeeId))
      .limit(1);
    if (emp) {
      const fullName = `${emp.firstName} ${emp.lastName}`.trim();
      if (fullName) return { userId: actor.userId, name: fullName };
    }
  }
  return { userId: actor.userId, name: actor.email || "ผู้ใช้งานระบบ" };
}

export type BulkImportOverrideRow = {
  code?: string;
  employeeId?: string;
  incomes?: Partial<Record<string, number>>;
  deductions?: Partial<Record<string, number>>;
  workingDays?: number | null;
};

export type UpdatePayrollWorkflowInput = {
  year: number;
  month: number;
  action: PayrollWorkflowAction;
  employeeId?: string;
  note?: string;
  override?: PayrollEmployeeOverride;
  workingDaysMap?: Record<string, { workingDays?: number | null; quantities?: Record<string, number> }>;
  importedRows?: BulkImportOverrideRow[];
  settings?: PayrollPeriodSettings;
  actor: WorkflowActor;
};

export async function updatePayrollWorkflow(input: UpdatePayrollWorkflowInput): Promise<Payroll> {
  const { year, month, action, employeeId, note, actor } = input;
  const existing = await loadPayrollRun(year, month);
  const currentStatus = existing?.status ?? "review";
  const resolvedActor = await resolveActor(actor);
  const now = new Date();

  let nextStatus = currentStatus;
  let nextVerifiedIds = [...(existing?.verifiedEmployeeIds ?? [])];
  let nextOverrides: Record<string, PayrollEmployeeOverride> = structuredClone(existing?.overrides ?? {});
  let nextSettings: PayrollPeriodSettings = { ...(existing?.settings ?? {}) };
  let nextSnapshot = existing?.snapshot ?? null;
  let submittedByUserId = existing?.submittedByUserId ?? null;
  let submittedByName = existing?.submittedByName ?? null;
  let submittedAt = existing?.submittedAt ?? null;
  let approvedByUserId = existing?.approvedByUserId ?? null;
  let approvedByName = existing?.approvedByName ?? null;
  let approvedAt = existing?.approvedAt ?? null;
  let lockedByUserId = existing?.lockedByUserId ?? null;
  let lockedByName = existing?.lockedByName ?? null;
  let lockedAt = existing?.lockedAt ?? null;
  let paidByUserId = existing?.paidByUserId ?? null;
  let paidByName = existing?.paidByName ?? null;
  let paidAt = existing?.paidAt ?? null;
  let nextNote = note !== undefined ? (note.trim() || null) : (existing?.note ?? null);

  const ensureUnlocked = () => {
    if (currentStatus === "locked" || currentStatus === "paid") {
      throw new PayrollWorkflowError("งวดนี้ถูกปิด/ล็อกแล้ว กรุณาปลดล็อกงวดก่อนแก้ไขข้อมูล", 409);
    }
  };

  switch (action) {
    case "toggle_verify": {
      if (currentStatus !== "review") {
        throw new PayrollWorkflowError("สามารถยืนยันตรวจสอบรายบุคคลได้เฉพาะในขั้นตอนตรวจสอบเท่านั้น", 409);
      }
      if (!employeeId) {
        throw new PayrollWorkflowError("กรุณาระบุรหัสพนักงานที่ต้องการตรวจสอบ", 400);
      }
      const livePayroll = await createPayroll(year, month, { includePreviousComparison: false, ignoreSnapshot: true });
      const row = livePayroll.rows.find((item) => item.employeeId === employeeId);
      if (!row) {
        throw new PayrollWorkflowError("ไม่พบพนักงานในงวดเงินเดือนนี้", 404);
      }
      const alreadyVerified = nextVerifiedIds.includes(employeeId);
      if (alreadyVerified) {
        nextVerifiedIds = nextVerifiedIds.filter((id) => id !== employeeId);
      } else {
        if (row.hasBlockingIssue) {
          throw new PayrollWorkflowError("ไม่สามารถยืนยันพนักงานที่ข้อมูลยังไม่สมบูรณ์ได้", 409);
        }
        nextVerifiedIds.push(employeeId);
        const verifiedSet = new Set(nextVerifiedIds);
        const allReviewedAndClean = livePayroll.rows.length > 0 && livePayroll.rows.every(
          (item) => !item.hasBlockingIssue && (item.reviewIssues.length === 0 || verifiedSet.has(item.employeeId)),
        );
        if (allReviewedAndClean) {
          nextStatus = "pending_approval";
          submittedByUserId = resolvedActor.userId;
          submittedByName = resolvedActor.name;
          submittedAt = now;
        }
      }
      break;
    }

    case "save_employee_override": {
      ensureUnlocked();
      if (!employeeId) {
        throw new PayrollWorkflowError("กรุณาระบุรหัสพนักงานที่ต้องการแก้ไข", 400);
      }
      const prevEntry = nextOverrides[employeeId] ?? {};
      nextOverrides[employeeId] = {
        ...prevEntry,
        ...(input.override?.incomes ? { incomes: { ...prevEntry.incomes, ...input.override.incomes } } : {}),
        ...(input.override?.deductions ? { deductions: { ...prevEntry.deductions, ...input.override.deductions } } : {}),
        ...(input.override && "workingDays" in input.override ? { workingDays: input.override.workingDays } : {}),
        ...(input.override && "dailyRate" in input.override ? { dailyRate: input.override.dailyRate } : {}),
        ...(input.override && "ot1xAmount" in input.override ? { ot1xAmount: input.override.ot1xAmount } : {}),
        ...(input.override && "weekdayOtAmount" in input.override ? { weekdayOtAmount: input.override.weekdayOtAmount } : {}),
        ...(input.override && "holidayOtAmount" in input.override ? { holidayOtAmount: input.override.holidayOtAmount } : {}),
        ...(input.override && "paymentMethod" in input.override ? { paymentMethod: input.override.paymentMethod } : {}),
        ...(input.override && "remark" in input.override ? { remark: input.override.remark } : {}),
        ...(input.override?.quantities ? { quantities: { ...prevEntry.quantities, ...input.override.quantities } } : {}),
        updatedAt: now.toISOString(),
      };
      break;
    }

    case "reset_employee_override": {
      ensureUnlocked();
      if (!employeeId) {
        throw new PayrollWorkflowError("กรุณาระบุรหัสพนักงานที่ต้องการรีเซ็ต", 400);
      }
      delete nextOverrides[employeeId];
      break;
    }

    case "save_working_days": {
      ensureUnlocked();
      for (const [targetId, entry] of Object.entries(input.workingDaysMap ?? {})) {
        const prevEntry = nextOverrides[targetId] ?? {};
        nextOverrides[targetId] = {
          ...prevEntry,
          ...(entry.workingDays !== undefined ? { workingDays: entry.workingDays } : {}),
          ...(entry.quantities ? { quantities: { ...prevEntry.quantities, ...entry.quantities } } : {}),
          updatedAt: now.toISOString(),
        };
      }
      break;
    }

    case "bulk_import_overrides": {
      ensureUnlocked();
      const livePayroll = await createPayroll(year, month, { includePreviousComparison: false, ignoreSnapshot: true });
      const idByCode = new Map(livePayroll.rows.map((row) => [row.code, row.employeeId]));
      const validIds = new Set(livePayroll.rows.map((row) => row.employeeId));
      let matched = 0;

      for (const item of input.importedRows ?? []) {
        const targetId = item.employeeId && validIds.has(item.employeeId)
          ? item.employeeId
          : item.code
            ? idByCode.get(item.code.trim())
            : undefined;
        if (!targetId) continue;
        matched += 1;
        const prevEntry = nextOverrides[targetId] ?? {};
        nextOverrides[targetId] = {
          ...prevEntry,
          ...(item.incomes ? { incomes: { ...prevEntry.incomes, ...item.incomes } } : {}),
          ...(item.deductions ? { deductions: { ...prevEntry.deductions, ...item.deductions } } : {}),
          ...(item.workingDays !== undefined ? { workingDays: item.workingDays } : {}),
          updatedAt: now.toISOString(),
        };
      }
      if (matched === 0) {
        throw new PayrollWorkflowError("ไม่พบรหัสพนักงานที่ตรงกับงวดนี้ในข้อมูลที่นำเข้า", 400);
      }
      break;
    }

    case "recalculate_period": {
      ensureUnlocked();
      nextOverrides = {};
      nextVerifiedIds = [];
      nextStatus = "review";
      submittedByUserId = null;
      submittedByName = null;
      submittedAt = null;
      approvedByUserId = null;
      approvedByName = null;
      approvedAt = null;
      break;
    }

    case "update_period_settings": {
      ensureUnlocked();
      nextSettings = { ...nextSettings, ...(input.settings ?? {}) };
      break;
    }

    case "submit_approval": {
      if (currentStatus !== "review") {
        throw new PayrollWorkflowError("งวดเงินเดือนนี้ไม่ได้อยู่ในขั้นตอนรอตรวจสอบ", 409);
      }
      const livePayroll = await createPayroll(year, month, { includePreviousComparison: false, ignoreSnapshot: true });
      if (livePayroll.rows.length === 0) {
        throw new PayrollWorkflowError("ไม่พบพนักงานในงวดเงินเดือนที่เลือก", 409);
      }
      if (livePayroll.summary.blockingCount > 0) {
        throw new PayrollWorkflowError("ยังมีรายการที่ข้อมูลไม่ครบถ้วน กรุณาแก้ไขก่อนส่งอนุมัติ", 409);
      }
      if (livePayroll.summary.reviewCount > 0) {
        throw new PayrollWorkflowError("ยังมีรายการที่ต้องตรวจสอบ กรุณายืนยันให้ครบก่อนส่งอนุมัติ", 409);
      }
      nextStatus = "pending_approval";
      submittedByUserId = resolvedActor.userId;
      submittedByName = resolvedActor.name;
      submittedAt = now;
      approvedByUserId = null;
      approvedByName = null;
      approvedAt = null;
      break;
    }

    case "approve": {
      if (currentStatus !== "pending_approval") {
        throw new PayrollWorkflowError("งวดเงินเดือนนี้ยังไม่ได้ส่งขออนุมัติ", 409);
      }
      nextStatus = "approved";
      approvedByUserId = resolvedActor.userId;
      approvedByName = resolvedActor.name;
      approvedAt = now;
      break;
    }

    case "reject_to_review": {
      if (currentStatus !== "pending_approval" && currentStatus !== "approved") {
        throw new PayrollWorkflowError("สามารถส่งกลับไปตรวจสอบได้เฉพาะงวดที่รออนุมัติหรืออนุมัติแล้วเท่านั้น", 409);
      }
      nextStatus = "review";
      approvedByUserId = null;
      approvedByName = null;
      approvedAt = null;
      break;
    }

    case "lock": {
      if (currentStatus !== "approved") {
        throw new PayrollWorkflowError("กรุณาอนุมัติงวดเงินเดือนก่อนทำการล็อกงวด", 409);
      }
      const livePayroll = await createPayroll(year, month, { includePreviousComparison: false, ignoreSnapshot: true });
      if (livePayroll.rows.length === 0 || livePayroll.summary.blockingCount > 0 || livePayroll.summary.reviewCount > 0) {
        throw new PayrollWorkflowError("ข้อมูลในงวดยังไม่สมบูรณ์ ไม่สามารถล็อกงวดได้", 409);
      }
      nextStatus = "locked";
      nextSnapshot = livePayroll.rows;
      lockedByUserId = resolvedActor.userId;
      lockedByName = resolvedActor.name;
      lockedAt = now;
      break;
    }

    case "close_period": {
      if (currentStatus === "locked" || currentStatus === "paid") {
        throw new PayrollWorkflowError("งวดเงินเดือนนี้ถูกปิดงวดแล้ว", 409);
      }
      const livePayroll = await createPayroll(year, month, { includePreviousComparison: false, ignoreSnapshot: true });
      if (livePayroll.rows.length === 0) {
        throw new PayrollWorkflowError("ไม่พบพนักงานในงวดเงินเดือนนี้", 409);
      }
      if (livePayroll.summary.blockingCount > 0) {
        throw new PayrollWorkflowError("ยังมีรายการที่ข้อมูลไม่ครบถ้วน กรุณาแก้ไขก่อนปิดงวด", 409);
      }
      nextStatus = "locked";
      nextSnapshot = livePayroll.rows;
      submittedByUserId ??= resolvedActor.userId;
      submittedByName ??= resolvedActor.name;
      submittedAt ??= now;
      approvedByUserId ??= resolvedActor.userId;
      approvedByName ??= resolvedActor.name;
      approvedAt ??= now;
      lockedByUserId = resolvedActor.userId;
      lockedByName = resolvedActor.name;
      lockedAt = now;
      break;
    }

    case "reopen": {
      if (currentStatus !== "locked") {
        throw new PayrollWorkflowError("สามารถปลดล็อกได้เฉพาะงวดที่อยู่ในสถานะล็อกงวดเท่านั้น", 409);
      }
      nextStatus = "review";
      nextSnapshot = null;
      submittedByUserId = null;
      submittedByName = null;
      submittedAt = null;
      approvedByUserId = null;
      approvedByName = null;
      approvedAt = null;
      lockedByUserId = null;
      lockedByName = null;
      lockedAt = null;
      break;
    }

    case "mark_paid": {
      if (currentStatus !== "locked") {
        throw new PayrollWorkflowError("กรุณาล็อกงวดเงินเดือนก่อนบันทึกการจ่ายเงิน", 409);
      }
      nextStatus = "paid";
      paidByUserId = resolvedActor.userId;
      paidByName = resolvedActor.name;
      paidAt = now;
      break;
    }
  }

  await db
    .insert(payrollRuns)
    .values({
      year,
      month,
      status: nextStatus,
      verifiedEmployeeIds: nextVerifiedIds,
      overrides: nextOverrides,
      settings: nextSettings,
      snapshot: nextSnapshot,
      submittedByUserId,
      submittedByName,
      submittedAt,
      approvedByUserId,
      approvedByName,
      approvedAt,
      lockedByUserId,
      lockedByName,
      lockedAt,
      paidByUserId,
      paidByName,
      paidAt,
      note: nextNote,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [payrollRuns.year, payrollRuns.month],
      set: {
        status: nextStatus,
        verifiedEmployeeIds: nextVerifiedIds,
        overrides: nextOverrides,
        settings: nextSettings,
        snapshot: nextSnapshot,
        submittedByUserId,
        submittedByName,
        submittedAt,
        approvedByUserId,
        approvedByName,
        approvedAt,
        lockedByUserId,
        lockedByName,
        lockedAt,
        paidByUserId,
        paidByName,
        paidAt,
        note: nextNote,
        updatedAt: now,
      },
    });

  return createPayroll(year, month);
}
