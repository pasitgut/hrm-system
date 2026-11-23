import { z } from "zod";

const payrollItemSchema = z.object({
  code: z.string().trim().min(1).max(30),
  label: z.string().trim().min(1).max(100),
  amount: z.number().finite().min(0).max(1_000_000_000),
  unit: z.enum(["period", "day", "hour", "time"]),
  enabled: z.boolean(),
});

export const employeePayrollDataSchema = z.object({
  bankName: z.string().trim().max(120),
  bankBranch: z.string().trim().max(120),
  accountName: z.string().trim().max(255),
  accountNumber: z.string().trim().max(50),
  taxCondition: z.enum(["withhold", "no_withholding"]),
  payslipLanguage: z.enum(["th", "en"]),
  doNotPrintPayslip: z.boolean(),
  socialSecurityEnabled: z.boolean().default(true),
  incomeItems: z.array(payrollItemSchema).max(50),
  deductionItems: z.array(payrollItemSchema).max(50),
});
