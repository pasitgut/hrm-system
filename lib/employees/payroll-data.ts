export type PayrollValueUnit = "period" | "day" | "hour" | "time";

export type EmployeePayrollItem = {
  code: string;
  label: string;
  amount: number;
  unit: PayrollValueUnit;
  enabled: boolean;
};

export type EmployeePayrollData = {
  bankName: string;
  bankBranch: string;
  accountName: string;
  accountNumber: string;
  taxCondition: "withhold" | "no_withholding";
  payslipLanguage: "th" | "en";
  doNotPrintPayslip: boolean;
  incomeItems: EmployeePayrollItem[];
  deductionItems: EmployeePayrollItem[];
};

export const PAYROLL_VALUE_UNITS: { id: PayrollValueUnit; label: string }[] = [
  { id: "period", label: "งวด" },
  { id: "day", label: "วัน" },
  { id: "hour", label: "ชั่วโมง" },
  { id: "time", label: "ครั้ง" },
];

const DEFAULT_INCOME_ITEMS: EmployeePayrollItem[] = [
  { code: "INT002", label: "ค่าล่วงเวลา", amount: 0, unit: "period", enabled: false },
  { code: "INT003", label: "เบี้ยขยัน", amount: 0, unit: "period", enabled: false },
  { code: "INT008", label: "ค่าตอบแทน", amount: 0, unit: "period", enabled: false },
  { code: "INT1801001", label: "โบนัส", amount: 0, unit: "period", enabled: false },
  { code: "INT19", label: "ค่าที่พักอาศัย", amount: 0, unit: "period", enabled: false },
  { code: "license", label: "ค่าใบประกอบวิชาชีพ", amount: 0, unit: "period", enabled: false },
  { code: "Tel", label: "ค่าโทรศัพท์", amount: 0, unit: "period", enabled: false },
];

const DEFAULT_DEDUCTION_ITEMS: EmployeePayrollItem[] = [
  { code: "leave", label: "ลางาน", amount: 0, unit: "period", enabled: false },
  { code: "late", label: "มาสาย", amount: 0, unit: "period", enabled: false },
  { code: "absence", label: "ขาดงาน", amount: 0, unit: "period", enabled: false },
  { code: "provident_fund", label: "กองทุนสำรองเลี้ยงชีพ", amount: 0, unit: "period", enabled: false },
  { code: "loan", label: "กองทุนกู้ยืม", amount: 0, unit: "period", enabled: false },
  { code: "social_security", label: "ประกันสังคม", amount: 0, unit: "period", enabled: false },
  { code: "tax", label: "ภาษีหัก ณ ที่จ่าย", amount: 0, unit: "period", enabled: false },
];

export function createDefaultEmployeePayrollData(): EmployeePayrollData {
  return {
    bankName: "",
    bankBranch: "",
    accountName: "",
    accountNumber: "",
    taxCondition: "withhold",
    payslipLanguage: "th",
    doNotPrintPayslip: false,
    incomeItems: DEFAULT_INCOME_ITEMS.map((item) => ({ ...item })),
    deductionItems: DEFAULT_DEDUCTION_ITEMS.map((item) => ({ ...item })),
  };
}

function normalizeItems(value: unknown, defaults: EmployeePayrollItem[]): EmployeePayrollItem[] {
  if (!Array.isArray(value)) return defaults.map((item) => ({ ...item }));
  const supplied = new Map(value.filter((item) => item && typeof item === "object").map((item) => {
    const row = item as Record<string, unknown>;
    return [row.code, row] as const;
  }));
  return defaults.map((item) => {
    const saved = supplied.get(item.code);
    if (!saved) return { ...item };
    const unit = PAYROLL_VALUE_UNITS.some((option) => option.id === saved.unit) ? saved.unit as PayrollValueUnit : item.unit;
    return {
      code: item.code,
      label: item.label,
      amount: typeof saved.amount === "number" && Number.isFinite(saved.amount) ? saved.amount : item.amount,
      unit,
      enabled: typeof saved.enabled === "boolean" ? saved.enabled : item.enabled,
    };
  });
}

export function normalizeEmployeePayrollData(value: unknown): EmployeePayrollData {
  const defaults = createDefaultEmployeePayrollData();
  if (!value || typeof value !== "object" || Array.isArray(value)) return defaults;
  const data = value as Record<string, unknown>;
  return {
    bankName: typeof data.bankName === "string" ? data.bankName : defaults.bankName,
    bankBranch: typeof data.bankBranch === "string" ? data.bankBranch : defaults.bankBranch,
    accountName: typeof data.accountName === "string" ? data.accountName : defaults.accountName,
    accountNumber: typeof data.accountNumber === "string" ? data.accountNumber : defaults.accountNumber,
    taxCondition: data.taxCondition === "no_withholding" ? "no_withholding" : defaults.taxCondition,
    payslipLanguage: data.payslipLanguage === "en" ? "en" : defaults.payslipLanguage,
    doNotPrintPayslip: typeof data.doNotPrintPayslip === "boolean" ? data.doNotPrintPayslip : defaults.doNotPrintPayslip,
    incomeItems: normalizeItems(data.incomeItems, defaults.incomeItems),
    deductionItems: normalizeItems(data.deductionItems, defaults.deductionItems),
  };
}
