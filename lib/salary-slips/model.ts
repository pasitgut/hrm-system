export const incomeFields = [
  ["salary", "เงินเดือน", 7], ["ot", "ค่าล่วงเวลา", 13],
  ["attendance_bonus", "เบี้ยขยัน", 29], ["compensation", "ค่าตอบแทน", 27],
  ["bonus", "โบนัส", 26], ["housing", "ค่าที่พักอาศัย", 23],
  ["license", "ค่าใบประกอบวิชาชีพ", 21], ["phone", "ค่าโทรศัพท์", 17],
] as const;
export const deductionFields = [
  ["leave", "ลางาน", 37], ["late", "มาสาย", 35], ["absence", "ขาดงาน", 34],
  ["provident_fund", "กองทุนสำรองเลี้ยงชีพ", 36], ["loan", "กองทุนกู้ยืม", 33],
  ["social_security", "ประกันสังคม", 32], ["tax", "ภาษี", 31],
] as const;

// All monetary values in JSON are integer satang, never floating point baht.
export type SlipData = {
  code: string; name: string; department: string; year: number; month: number;
  bank: string; bankAccount: string;
  incomes: Record<string, number>; deductions: Record<string, number>;
  incomeTotal: number; deductionTotal: number; netPay: number;
};
export type ImportRow = {
  key: string; file: string; sheet: string; row: number;
  data: SlipData | null; errors: string[]; warnings: string[];
};
export type ExportSlip = {
  id: string; employeeId: string; revision: number; data: SlipData;
  cumulative: { income: number; tax: number; social: number; provident: number };
  missingMonths: number[];
};
export const formatMoney = (satang: number) => (satang / 100).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const periodLabel = (year: number, month: number) => new Intl.DateTimeFormat("th-TH", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 1)));
export function withCumulative(items: { id: string; employeeId: string; revision: number; data: SlipData }[]): ExportSlip[] {
  const ordered = [...items].sort((a, b) => a.data.year - b.data.year || a.data.month - b.data.month);
  return ordered.map((item) => {
    const previous = ordered.filter((other) => other.employeeId === item.employeeId && other.data.year === item.data.year && other.data.month <= item.data.month);
    const months = new Set(previous.map((other) => other.data.month));
    return { ...item, cumulative: previous.reduce((sum, other) => ({
      income: sum.income + other.data.incomeTotal,
      tax: sum.tax + (other.data.deductions.tax ?? 0),
      social: sum.social + (other.data.deductions.social_security ?? 0),
      provident: sum.provident + (other.data.deductions.provident_fund ?? 0),
    }), { income: 0, tax: 0, social: 0, provident: 0 }),
    missingMonths: Array.from({ length: item.data.month }, (_, i) => i + 1).filter((month) => !months.has(month)) };
  });
}
