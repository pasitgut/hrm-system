import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { departments, employees, salarySlipImports, salarySlips, salarySlipVersions } from "@/lib/db/schema";
import { hasPermission } from "@/lib/auth/permissions";
import type { SessionPayload } from "@/lib/auth/session";
import { sameData, withCumulative, type ImportRow } from "./model";

export class SlipError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export type Selection = { key: string; employeeId: string; expectedRevision: number; replace: boolean };
export async function employeeOptions() {
  return db.select({ id: employees.id, code: employees.code, firstName: employees.firstName, lastName: employees.lastName,
    department: departments.name, ended: employees.endDate }).from(employees)
    .leftJoin(departments, eq(departments.id, employees.departmentId)).orderBy(asc(employees.code));
}
export async function previewImport(id: string, selections: { key: string; employeeId: string }[] = []) {
  const [batch] = await db.select().from(salarySlipImports).where(eq(salarySlipImports.id, id));
  if (!batch) throw new SlipError("ไม่พบชุดนำเข้า", 404);
  const options = await employeeOptions();
  const existing = await db.select().from(salarySlips);
  const mapped = new Map(selections.map((selection) => [selection.key, selection.employeeId]));
  const rows = batch.rows.map((row) => {
    const employeeId = mapped.has(row.key) ? mapped.get(row.key)! : options.find((employee) => employee.code === row.data?.code)?.id ?? "";
    const current = existing.find((slip) => slip.employeeId === employeeId && slip.year === row.data?.year && slip.month === row.data?.month);
    const errors = [...row.errors];
    if (!employeeId || !options.some((employee) => employee.id === employeeId)) errors.push("กรุณาจับคู่พนักงาน");
    return { ...row, errors, employeeId, current: current ? { id: current.id, revision: current.revision, data: current.data } : null,
      status: !row.data ? "invalid" : !current ? "new" : sameData(row.data, current.data) ? "unchanged" : "replace" };
  });
  const seen = new Map<string, typeof rows[number]>();
  for (const row of rows) {
    if (!row.data || !row.employeeId) continue;
    const key = `${row.employeeId}:${row.data.year}:${row.data.month}`;
    const previous = seen.get(key);
    if (previous) { previous.errors.push("พนักงานและงวดซ้ำในชุดนำเข้า"); row.errors.push("พนักงานและงวดซ้ำในชุดนำเข้า"); }
    else seen.set(key, row);
  }
  return { id: batch.id, committedAt: batch.committedAt, rows, employees: options };
}
export async function commitImport(id: string, selections: Selection[], reason: string, user: SessionPayload) {
  return db.transaction(async (tx) => {
    // A small local system: serialize commits, including inserts into empty periods.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(73190217)`);
    const [batch] = await tx.select().from(salarySlipImports).where(eq(salarySlipImports.id, id)).for("update");
    if (!batch) throw new SlipError("ไม่พบชุดนำเข้า", 404);
    if (batch.committedAt) throw new SlipError("ชุดนี้บันทึกแล้ว กรุณากลับไปดูประวัติ", 409);
    if (selections.length !== batch.rows.length || new Set(selections.map((item) => item.key)).size !== selections.length) throw new SlipError("รายการยืนยันไม่ครบหรือซ้ำ");
    const options = await tx.select({ id: employees.id }).from(employees);
    const employeeIds = new Set(options.map((employee) => employee.id));
    const seen = new Set<string>();
    let inserted = 0, replaced = 0, unchanged = 0;
    for (const row of batch.rows) {
      if (!row.data || row.errors.length) throw new SlipError("ยังมีข้อมูลผิดพลาด กรุณาแก้ไฟล์แล้วนำเข้าใหม่");
      const selection = selections.find((item) => item.key === row.key);
      if (!selection || !employeeIds.has(selection.employeeId)) throw new SlipError("กรุณาจับคู่พนักงานให้ครบ");
      const key = `${selection.employeeId}:${row.data.year}:${row.data.month}`;
      if (seen.has(key)) throw new SlipError("พนักงานและงวดซ้ำในชุดนำเข้า");
      seen.add(key);
      const [current] = await tx.select().from(salarySlips).where(and(eq(salarySlips.employeeId, selection.employeeId), eq(salarySlips.year, row.data.year), eq(salarySlips.month, row.data.month))).for("update");
      if ((current?.revision ?? 0) !== selection.expectedRevision) throw new SlipError("ข้อมูลเปลี่ยนหลังตรวจสอบ กรุณาตรวจสอบการจับคู่อีกครั้ง", 409);
      if (current && sameData(current.data, row.data)) { unchanged++; continue; }
      if (current && !hasPermission(user.permissions, "salary_slips.replace")) throw new SlipError("ไม่มีสิทธิ์แทนที่สลิป", 403);
      if (current && (!selection.replace || !reason.trim())) throw new SlipError("กรุณายืนยันการแทนที่และระบุเหตุผล");
      const fields = { data: row.data, incomeTotal: (row.data.incomeTotal / 100).toFixed(2), deductionTotal: (row.data.deductionTotal / 100).toFixed(2), netPay: (row.data.netPay / 100).toFixed(2) };
      let slipId: string;
      const revision = (current?.revision ?? 0) + 1;
      if (current) {
        await tx.update(salarySlips).set({ ...fields, revision, updatedAt: new Date() }).where(eq(salarySlips.id, current.id));
        slipId = current.id; replaced++;
      } else {
        const [created] = await tx.insert(salarySlips).values({ ...fields, employeeId: selection.employeeId, year: row.data.year, month: row.data.month }).returning();
        slipId = created.id; inserted++;
      }
      await tx.insert(salarySlipVersions).values({ slipId, importId: id, revision, data: row.data, createdBy: user.sub, reason: current ? reason.trim() : "นำเข้าครั้งแรก" });
    }
    await tx.update(salarySlipImports).set({ committedAt: new Date() }).where(eq(salarySlipImports.id, id));
    return { inserted, replaced, unchanged };
  });
}
export async function slipsWithCumulative(year: number) {
  // One query yields a consistent snapshot for all cumulative totals and documents.
  return withCumulative(await db.select().from(salarySlips).where(eq(salarySlips.year, year)));
}
export function duplicateSourceRows(rows: ImportRow[]) {
  const seen = new Map<string, ImportRow>();
  for (const row of rows) {
    if (!row.data) continue;
    const key = `${row.data.code}:${row.data.year}:${row.data.month}`;
    const previous = seen.get(key);
    if (previous) { row.errors.push("รหัสพนักงานและงวดซ้ำในไฟล์ที่อัปโหลด"); previous.errors.push("รหัสพนักงานและงวดซ้ำในไฟล์ที่อัปโหลด"); }
    else seen.set(key, row);
  }
}
