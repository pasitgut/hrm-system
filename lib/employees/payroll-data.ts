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
  { code: "INT19", label: "ค่าที่พักอาศัย", amount: 0, unit: "period", enabled: true },
  { code: "license", label: "ค่าใบประกอบวิชาชีพ", amount: 0, unit: "period", enabled: true },
  { code: "Tel", label: "ค่าโทรศัพท์", amount: 0, unit: "period", enabled: true },
];

const DEFAULT_DEDUCTION_ITEMS: EmployeePayrollItem[] = [
  { code: "DDT003", label: "ลางาน", amount: 0, unit: "period", enabled: true },
  { code: "DDT004", label: "มาสาย", amount: 0, unit: "period", enabled: true },
  { code: "DDT005", label: "ขาดงาน", amount: 0, unit: "period", enabled: true },
  { code: "SYSWELFARE", label: "กองทุนสงเคราะห์ลูกจ้าง", amount: 0, unit: "period", enabled: false },
  { code: "SYS002", label: "ภาษี", amount: 0, unit: "period", enabled: false },
  { code: "DDT006", label: "กองทุนสำรองเลี้ยงชีพ", amount: 0, unit: "period", enabled: false },
  { code: "DDT009", label: "กองทุนกู้ยืม", amount: 0, unit: "period", enabled: false },
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
  const aliases: Record<string, string> = {
    leave: "DDT003",
    late: "DDT004",
    absence: "DDT005",
    tax: "SYS002",
    provident_fund: "DDT006",
    loan: "DDT009",
  };
  const normalized = value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    if (typeof row.code !== "string" || typeof row.label !== "string") return [];
    const code = aliases[row.code] ?? row.code;
    const defaultItem = defaults.find((entry) => entry.code === code);
    const unit = PAYROLL_VALUE_UNITS.some((option) => option.id === row.unit) ? row.unit as PayrollValueUnit : defaultItem?.unit ?? "period";
    return [{
      code,
      label: row.label,
      amount: typeof row.amount === "number" && Number.isFinite(row.amount) ? row.amount : defaultItem?.amount ?? 0,
      unit,
      enabled: typeof row.enabled === "boolean" ? row.enabled : defaultItem?.enabled ?? false,
    }];
  });
  return normalized.length ? normalized : defaults.map((item) => ({ ...item }));
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
