import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { aggregateOtReport, type OtReportEmployee, type OtReportRequestRow } from "@/lib/reports/ot/model";
import { getOtReportPeriod, OT_REPORT_VARIANTS } from "@/lib/reports/ot/options";
import { renderOtReportPdf } from "@/lib/reports/pdf";

const year = 2026;
const monthlyPeriod = 10;
const qaDirectory = process.env.PDFMAKE_QA_DIR ?? process.argv[2];
const outputDirectory = qaDirectory
  ? path.join(path.resolve(qaDirectory), "ot-report-fixtures")
  : path.join(process.cwd(), "output", "pdf", "ot-report-fixtures");
const generatedAt = new Date("2026-10-09T04:30:00.000Z");
const selectedIds = new Set([1, 2, 3, 4].map((number) => `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`));
const departments = ["ฝ่ายตรวจสอบ", "แผนกคลังสินค้า", "สำนักงาน", "ฝ่ายผลิต"];
const positions = ["เจ้าหน้าที่", "หัวหน้าหน่วย", "ผู้ประสานงาน"];
const firstNames = ["กานต์", "ปรียา", "นที", "พิมพ์ชนก", "ธนกร", "มาลี", "สมชาย", "รัตนา", "ภาคิน", "สุรีย์", "กฤษณะ", "ศิริพร", "ปกรณ์", "ชนิกานต์"];
const lastNames = ["ใจดี", "แสงทอง", "บุญมี", "วัฒนชัย", "ตั้งมั่น", "ศรีสวัสดิ์", "ชูเกียรติ", "อินทร์สุข", "ชัยมงคล", "พูนทรัพย์", "สกุลไทย", "มีสุข", "พัฒนกุล", "เจริญกิจ"];

const employees: OtReportEmployee[] = Array.from({ length: 14 }, (_, index) => {
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

function bangkokDate(yearValue: number, monthValue: number, day: number, hour: number, minute: number) {
  return new Date(Date.UTC(yearValue, monthValue - 1, day, hour, minute) - 7 * 60 * 60 * 1000);
}

const requests: OtReportRequestRow[] = [];
for (let month = 1; month <= 12; month += 1) {
  for (let employeeIndex = 0; employeeIndex < 4; employeeIndex += 1) {
    const employee = employees[employeeIndex];
    const slotCount = employeeIndex === 0 ? 3 : 2;
    for (let slot = 0; slot < slotCount; slot += 1) {
      const day = 3 + ((month * 3 + employeeIndex * 2 + slot) % 24);
      const overnight = employeeIndex === 0 && slot === 2;
      const startHour = overnight ? 23 : 18 + (slot % 2);
      const startMinute = overnight ? 30 : slot === 0 ? 0 : 15;
      const durationMinutes = [75, 125, 90, 45][(month + employeeIndex + slot) % 4];
      const startAt = bangkokDate(year, month, day, startHour, startMinute);
      const endAt = new Date(startAt.getTime() + durationMinutes * 60_000);
      const reason = employeeIndex === 0 && month === 10 && slot === 0
        ? `<script>alert("escape")</script> ตรวจนับสินค้าและจัดทำเอกสารส่งมอบ ${"รายละเอียดงานที่ต้องตรวจสอบให้ครบถ้วนและประสานทีมที่เกี่ยวข้อง ".repeat(4)}`
        : `ดำเนินงานตามแผน ${month}/${year} · ตรวจสอบรายการและประสานงานกับทีมที่เกี่ยวข้อง ${"บันทึกผลการปฏิบัติงานและตรวจความถูกต้องก่อนส่งมอบ ".repeat(2)}`;
      requests.push({
        id: `request-${month}-${employeeIndex}-${slot}`,
        employeeId: employee.id,
        startAt,
        endAt,
        overtimeType: (month + employeeIndex + slot) % 5 === 0 ? null : (month + employeeIndex + slot) % 2 === 0 ? "holiday" : "weekday",
        reason,
      });
    }
  }
}

await mkdir(outputDirectory, { recursive: true });
const sortRules = [
  { field: "position", direction: "desc" },
  { field: "hours", direction: "desc" },
] as const;

for (const definition of OT_REPORT_VARIANTS) {
  const month = definition.period === "monthly" ? monthlyPeriod : undefined;
  const period = getOtReportPeriod(year, month);
  const reportEmployees = definition.scope === "all"
    ? employees
    : employees.filter((employee) => selectedIds.has(employee.id));
  const selectedEmployeeIds = new Set(reportEmployees.map((employee) => employee.id));
  const reportRequests = requests.filter((request) => selectedEmployeeIds.has(request.employeeId));
  const model = aggregateOtReport({
    year,
    month,
    periodStart: period.startLocalDate,
    periodEnd: period.endLocalDate,
    generatedAt,
    employees: reportEmployees,
    requests: reportRequests,
  });
  const pdf = await renderOtReportPdf({ variant: definition.id, model, sortRules });
  if (pdf.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw new Error(`Renderer returned an invalid document for ${definition.id}`);
  }
  const destination = path.join(outputDirectory, `${definition.id}.pdf`);
  await writeFile(destination, pdf);
  process.stdout.write(`${definition.id}: ${pdf.byteLength} bytes -> ${path.relative(process.cwd(), destination)}\n`);
}

const overflowSentinel = "OTEND9F4C";
const stressReason = `บันทึกการตรวจสอบงานหลายขั้นตอนประกอบการส่งมอบและทบทวนข้อมูลภาษาไทย ${"ผู้ปฏิบัติงานตรวจรายการ เอกสารประกอบ ความครบถ้วน และผลการประสานงานกับแผนกที่เกี่ยวข้องอย่างละเอียด ".repeat(120)}${overflowSentinel}`;
const stressPeriod = getOtReportPeriod(year);
const stressModel = aggregateOtReport({
  year,
  periodStart: stressPeriod.startLocalDate,
  periodEnd: stressPeriod.endLocalDate,
  generatedAt,
  employees: [employees[0]],
  requests: [{
    id: "long-reason-overflow",
    employeeId: employees[0].id,
    startAt: bangkokDate(2026, 6, 12, 18, 0),
    endAt: bangkokDate(2026, 6, 12, 19, 15),
    overtimeType: "weekday",
    reason: stressReason,
  }],
});
const stressPdf = await renderOtReportPdf({
  variant: "yearly-individual-detail",
  model: stressModel,
  sortRules: [],
});
if (!stressPdf.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
  throw new Error("Renderer returned an invalid document for long-reason-overflow");
}
const stressDestination = path.join(outputDirectory, "long-reason-overflow.pdf");
await writeFile(stressDestination, stressPdf);
process.stdout.write(`long-reason-overflow (sentinel ${overflowSentinel}): ${stressPdf.byteLength} bytes -> ${path.relative(process.cwd(), stressDestination)}\n`);
