import { and, asc, eq, inArray } from "drizzle-orm";
import ExcelJS from "exceljs";
import { z } from "zod";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { departments, employees, salarySlips } from "@/lib/db/schema";
import { requireApiPermission } from "@/lib/auth/dal";
import { SlipError } from "@/lib/salary-slips/stateless";
import { salaryRoute } from "@/app/api/salary-slips/_shared";

export const runtime = "nodejs";

const exportSchema = z.object({
  year: z.number().int().min(1900).max(2200),
  month: z.number().int().min(1).max(12),
  scope: z.enum(["department", "employee"]),
  employeeCode: z.string().trim().max(20).optional(),
  departmentIds: z.array(z.number().int().positive()).max(200).default([]),
  sortBy: z.enum(["code", "name", "department"]).default("code"),
  submissionType: z.enum(["normal", "additional"]).default("normal"),
});

function satangToBaht(value: number | null | undefined, label: string, employeeCode: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new SlipError(`ไม่มีข้อมูล${label}ของรหัสพนักงาน ${employeeCode}`, 400);
  }
  return value / 100;
}

export const POST = salaryRoute(async (request: NextRequest) => {
  await requireApiPermission(request, "salary_slips.view");
  await requireApiPermission(request, "salary_slips.export");

  const input = exportSchema.parse(await request.json());
  if (input.scope === "department" && input.departmentIds.length === 0) {
    throw new SlipError("เลือกอย่างน้อยหนึ่งแผนกก่อนส่งออก", 400);
  }
  if (input.scope === "employee" && !input.employeeCode) {
    throw new SlipError("กรอกรหัสพนักงานก่อนส่งออก", 400);
  }

  const employeeFilter = input.scope === "employee"
    ? eq(employees.code, input.employeeCode ?? "")
    : inArray(employees.departmentId, input.departmentIds);
  const records = await db
    .select({
      code: employees.code,
      citizenId: employees.citizenId,
      prefix: employees.prefix,
      firstName: employees.firstName,
      lastName: employees.lastName,
      departmentName: departments.name,
      data: salarySlips.data,
    })
    .from(salarySlips)
    .innerJoin(employees, eq(salarySlips.employeeId, employees.id))
    .leftJoin(departments, eq(employees.departmentId, departments.id))
    .where(and(
      eq(salarySlips.year, input.year),
      eq(salarySlips.month, input.month),
      employeeFilter,
    ))
    .orderBy(asc(employees.code));

  if (!records.length) {
    throw new SlipError(input.scope === "employee"
      ? "ไม่พบสลิปเงินเดือนของรหัสพนักงานนี้ในงวดที่เลือก"
      : "ไม่พบสลิปเงินเดือนของแผนกที่เลือกในงวดนี้", 404);
  }

  const exportedRows: {
    code: string;
    citizenId: string;
    prefix: string;
    firstName: string;
    lastName: string;
    departmentName: string;
    wage: number;
    contribution: number;
  }[] = [];
  const missingCitizenIds: string[] = [];

  for (const record of records) {
    if (!record.citizenId?.trim()) {
      missingCitizenIds.push(record.code);
      continue;
    }
    exportedRows.push({
      code: record.code,
      citizenId: record.citizenId,
      prefix: record.prefix ?? "",
      firstName: record.firstName,
      lastName: record.lastName,
      departmentName: record.departmentName ?? "",
      wage: satangToBaht(record.data.incomes.salary, "ค่าจ้าง", record.code),
      contribution: satangToBaht(record.data.deductions.social_security ?? 0, "เงินสมทบ", record.code),
    });
  }

  if (missingCitizenIds.length) {
    const shownCodes = missingCitizenIds.slice(0, 10).join(", ");
    const remaining = missingCitizenIds.length > 10 ? ` และอีก ${missingCitizenIds.length - 10} คน` : "";
    throw new SlipError(`กรุณากรอกเลขบัตรประชาชนของรหัสพนักงาน ${shownCodes}${remaining} ในข้อมูลพนักงานก่อนส่งออก`, 400);
  }
  if (!exportedRows.length) {
    throw new SlipError("ไม่พบสลิปเงินเดือนของพนักงานที่เลือกในงวดนี้", 404);
  }

  const compareCode = (left: string, right: string) => left.localeCompare(right, "th-TH", { numeric: true, sensitivity: "base" });
  exportedRows.sort((left, right) => {
    if (input.sortBy === "name") {
      return compareCode(`${left.firstName} ${left.lastName}`, `${right.firstName} ${right.lastName}`) || compareCode(left.code, right.code);
    }
    if (input.sortBy === "department") {
      return compareCode(left.departmentName, right.departmentName) || compareCode(left.code, right.code);
    }
    return compareCode(left.code, right.code);
  });

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("สปส. 1-10");
  worksheet.columns = [
    { header: "บัตรประชาชน", key: "citizenId", width: 18 },
    { header: "คำนำหน้า", key: "prefix", width: 14 },
    { header: "ชื่อ", key: "firstName", width: 22 },
    { header: "สกุล", key: "lastName", width: 22 },
    { header: "ค่าจ้าง", key: "wage", width: 16 },
    { header: "เงินสมทบ", key: "contribution", width: 16 },
  ];
  worksheet.getRow(1).font = { bold: true };
  worksheet.views = [{ state: "frozen", ySplit: 1 }];
  worksheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 6 } };
  worksheet.getColumn(1).numFmt = "@";
  worksheet.getColumn(5).numFmt = "#,##0.00";
  worksheet.getColumn(6).numFmt = "#,##0.00";
  for (const row of exportedRows) {
    worksheet.addRow({
      citizenId: row.citizenId,
      prefix: row.prefix,
      firstName: row.firstName,
      lastName: row.lastName,
      wage: row.wage,
      contribution: row.contribution,
    });
  }

  const fileBuffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const filename = `sso-1-10-${input.year}-${String(input.month).padStart(2, "0")}-${input.submissionType}.xlsx`;
  return new NextResponse(new Uint8Array(fileBuffer), {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
  });
});
