import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { aggregateLeaveReport, type LeaveReportEmployee, type LeaveReportRequestRow } from "@/lib/reports/leave/model";
import { LEAVE_REPORT_VARIANTS, getLeaveReportPeriod } from "@/lib/reports/leave/options";
import { renderLeaveReportPdf } from "@/lib/reports/pdf";

const year = 2026;
const monthlyPeriod = 10;
const qaDirectory = process.env.PDFMAKE_QA_DIR ?? process.argv[2];
const outputDirectory = qaDirectory
  ? path.join(path.resolve(qaDirectory), "leave-report-fixtures")
  : path.join(process.cwd(), "output", "pdf", "leave-report-fixtures");
const generatedAt = new Date("2026-10-09T04:30:00.000Z");
const selectedIds = new Set([1, 2, 3].map((number) => `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`));
const departments = ["ฝ่ายตรวจสอบ", "แผนกคลังสินค้า", "สำนักงาน", "ฝ่ายผลิต"];
const positions = ["เจ้าหน้าที่", "หัวหน้าหน่วย", "ผู้ประสานงาน"];
const firstNames = ["กานต์", "ปรียา", "นที", "พิมพ์ชนก", "ธนกร", "มาลี", "สมชาย", "รัตนา", "ภาคิน", "สุรีย์", "กฤษณะ", "ศิริพร", "ปกรณ์", "ชนิกานต์"];
const lastNames = ["ใจดี", "แสงทอง", "บุญมี", "วัฒนชัย", "ตั้งมั่น", "ศรีสวัสดิ์", "ชูเกียรติ", "อินทร์สุข", "ชัยมงคล", "พูนทรัพย์", "สกุลไทย", "มีสุข", "พัฒนกุล", "เจริญกิจ"];

const employees: LeaveReportEmployee[] = Array.from({ length: 14 }, (_, index) => {
  const sequence = index + 1;
  return {
    id: `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`,
    code: String(2000 + sequence),
    firstName: firstNames[index],
    lastName: lastNames[index],
    departmentId: index % departments.length + 1,
    departmentName: departments[index % departments.length],
    positionId: index % positions.length + 1,
    positionName: positions[index % positions.length],
    startDate: index === 3 ? "2026-01-01" : "2020-01-01",
    endDate: index === 3 ? "2026-06-30" : null,
  };
});

const leaveTypes = [
  { code: "sick", name: "ลาป่วย", isActive: true },
  { code: "personal", name: "ลากิจ", isActive: true },
  { code: "birthday", name: "ลาวันเกิด", isActive: true },
  { code: "training", name: "ลาอบรมเพิ่มเติม", isActive: true },
  { code: "legacy", name: "ลาแบบเดิม", isActive: false },
];
const requests: LeaveReportRequestRow[] = [];
const types = ["sick", "personal", "birthday", "training", "legacy"];

for (let month = 1; month <= 12; month += 1) {
  for (let employeeIndex = 0; employeeIndex < 6; employeeIndex += 1) {
    const employee = employees[employeeIndex];
    const day = 3 + ((month * 3 + employeeIndex * 2) % 20);
    const leaveTypeCode = types[(month + employeeIndex) % types.length];
    const startOn = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const halfDay = month % 4 === 0 && employeeIndex % 2 === 0;
    requests.push({
      id: `fixture-${month}-${employeeIndex}`,
      employeeId: employee.id,
      leaveTypeCode,
      startOn,
      endOn: startOn,
      session: halfDay ? (employeeIndex % 4 === 0 ? "am" : "pm") : "full",
      reason: `<script>alert("escape")</script> ตรวจสอบเอกสารและประสานงาน ${month}/${year}`,
    });
  }
}
requests.push(
  { id: "cross-year-into", employeeId: employees[0].id, leaveTypeCode: "sick", startOn: "2025-12-30", endOn: "2026-01-02", session: "full", reason: "รายการข้ามปีเข้าสู่รายงาน" },
  { id: "cross-year-out", employeeId: employees[0].id, leaveTypeCode: "personal", startOn: "2026-12-30", endOn: "2027-01-02", session: "full", reason: "รายการข้ามปีออกจากรายงาน" },
  { id: "cross-month", employeeId: employees[1].id, leaveTypeCode: "birthday", startOn: "2026-03-31", endOn: "2026-04-02", session: "full", reason: "รายการข้ามเดือนมีนาคมถึงเมษายน" },
  { id: "fractional-day", employeeId: employees[2].id, leaveTypeCode: "personal", startOn: "2026-10-09", endOn: "2026-10-09", session: "pm", reason: "ลาครึ่งวัน" },
);

await mkdir(outputDirectory, { recursive: true });
const sortRules = [
  { field: "position", direction: "desc" },
  { field: "days", direction: "desc" },
] as const;

for (const definition of LEAVE_REPORT_VARIANTS) {
  const month = definition.period === "monthly" ? monthlyPeriod : undefined;
  const period = getLeaveReportPeriod(year, month);
  const reportEmployees = definition.scope === "all" ? employees : employees.filter((employee) => selectedIds.has(employee.id));
  const employeeIds = new Set(reportEmployees.map((employee) => employee.id));
  const reportRequests = requests.filter((request) => employeeIds.has(request.employeeId));
  const model = aggregateLeaveReport({
    year, month, periodStart: period.startOn, periodEnd: period.endOn, generatedAt,
    employees: reportEmployees, leaveTypes, requests: reportRequests,
  });
  const pdf = await renderLeaveReportPdf({ variant: definition.id, model, sortRules });
  if (pdf.subarray(0, 5).toString("ascii") !== "%PDF-") throw new Error(`Invalid PDF for ${definition.id}`);
  const destination = path.join(outputDirectory, `${definition.id}.pdf`);
  await writeFile(destination, pdf);
  process.stdout.write(`${definition.id}: ${pdf.byteLength} bytes -> ${path.relative(process.cwd(), destination)}\n`);
}

const overflowSentinel = "LEAVEEND7A3C";
const stressReason = `การตรวจสอบเอกสารประกอบและดำเนินการประสานงานกับหน่วยงานที่เกี่ยวข้องอย่างละเอียด ${"ตรวจสอบรายการเอกสาร ความครบถ้วนของข้อมูลและผลการประสานงานเพิ่มเติม ".repeat(130)}${overflowSentinel}`;
const stressPeriod = getLeaveReportPeriod(year);
const stressModel = aggregateLeaveReport({
  year,
  periodStart: stressPeriod.startOn,
  periodEnd: stressPeriod.endOn,
  generatedAt,
  employees: [employees[0]],
  leaveTypes,
  requests: [{ id: "long-reason-overflow", employeeId: employees[0].id, leaveTypeCode: "sick", startOn: "2026-06-12", endOn: "2026-06-12", session: "full", reason: stressReason }],
});
const stressPdf = await renderLeaveReportPdf({ variant: "yearly-individual-detail", model: stressModel, sortRules: [] });
if (!stressPdf.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new Error("Invalid PDF for long-reason-overflow");
const stressDestination = path.join(outputDirectory, "long-reason-overflow.pdf");
await writeFile(stressDestination, stressPdf);
process.stdout.write(`long-reason-overflow (sentinel ${overflowSentinel}): ${stressPdf.byteLength} bytes -> ${path.relative(process.cwd(), stressDestination)}\n`);
