import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAnyPermission, requireApiPermission } from "@/lib/auth/dal";
import { PayrollWorkflowError, updatePayrollWorkflow } from "@/lib/payroll/service";
import { salaryRoute } from "@/app/api/salary-slips/_shared";

export const runtime = "nodejs";

const nonNegativeMoney = z.number().finite().min(0).max(1_000_000_000);

const overrideSchema = z.object({
  incomes: z.record(z.string(), nonNegativeMoney).optional(),
  deductions: z.record(z.string(), nonNegativeMoney).optional(),
  workingDays: z.number().finite().min(0).max(366).nullable().optional(),
  dailyRate: nonNegativeMoney.nullable().optional(),
  ot1xAmount: nonNegativeMoney.nullable().optional(),
  weekdayOtAmount: nonNegativeMoney.nullable().optional(),
  holidayOtAmount: nonNegativeMoney.nullable().optional(),
  paymentMethod: z.enum(["transfer", "cash"]).optional(),
  remark: z.string().trim().max(200).optional(),
  quantities: z.record(z.string(), z.number().finite().min(0).max(10_000)).optional(),
});

const workflowBodySchema = z.object({
  year: z.number().int().min(1900).max(2200),
  month: z.number().int().min(1).max(12),
  action: z.enum([
    "toggle_verify",
    "submit_approval",
    "approve",
    "reject_to_review",
    "lock",
    "reopen",
    "mark_paid",
    "save_employee_override",
    "reset_employee_override",
    "save_working_days",
    "bulk_import_overrides",
    "recalculate_period",
    "close_period",
    "update_period_settings",
  ]),
  employeeId: z.string().uuid().optional(),
  note: z.string().max(1000).optional(),
  override: overrideSchema.optional(),
  workingDaysMap: z
    .record(
      z.string().uuid(),
      z.object({
        workingDays: z.number().finite().min(0).max(366).nullable().optional(),
        quantities: z.record(z.string(), z.number().finite().min(0).max(10_000)).optional(),
      }),
    )
    .optional(),
  importedRows: z
    .array(
      z.object({
        code: z.string().trim().max(20).optional(),
        employeeId: z.string().uuid().optional(),
        incomes: z.record(z.string(), nonNegativeMoney).optional(),
        deductions: z.record(z.string(), nonNegativeMoney).optional(),
        workingDays: z.number().finite().min(0).max(366).nullable().optional(),
      }),
    )
    .max(2000)
    .optional(),
  settings: z
    .object({
      groupName: z.string().trim().max(100).optional(),
      includeMonthly: z.boolean().optional(),
      includeDaily: z.boolean().optional(),
      payDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      leaveCutoffDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      otCutoffDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    })
    .optional(),
});

export const POST = salaryRoute(async (request: NextRequest) => {
  const user = await requireApiPermission(request, "salary_slips.view");
  await requireApiPermission(request, "employees.compensation.view");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูล JSON ไม่ถูกต้อง" }, { status: 400 });
  }

  const parsed = workflowBodySchema.parse(body);

  if (parsed.action === "approve" || parsed.action === "reject_to_review") {
    await requireApiAnyPermission(
      request,
      "salary_slips.export",
      "employees.compensation.manage",
      "ot.approve",
      "leave.approve",
    );
  } else {
    await requireApiAnyPermission(request, "salary_slips.export", "employees.compensation.manage");
  }

  try {
    const payroll = await updatePayrollWorkflow({
      year: parsed.year,
      month: parsed.month,
      action: parsed.action,
      employeeId: parsed.employeeId,
      note: parsed.note,
      override: parsed.override,
      workingDaysMap: parsed.workingDaysMap,
      importedRows: parsed.importedRows,
      settings: parsed.settings,
      actor: {
        userId: user.sub,
        employeeId: user.employeeId,
        email: user.email,
      },
    });
    return NextResponse.json(payroll, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof PayrollWorkflowError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
});
