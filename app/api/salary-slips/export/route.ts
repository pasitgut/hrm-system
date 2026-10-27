import { z } from "zod";
import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/dal";
import { slipsWithCumulative, SlipError } from "@/lib/salary-slips/service";
import { createExcel, createPdf } from "@/lib/salary-slips/documents";
import { salaryRoute } from "../_shared";

export const runtime = "nodejs";
export const POST = salaryRoute(async (request) => {
  await requireApiPermission(request, "salary_slips.view");
  await requireApiPermission(request, "salary_slips.export");
  const body = z.object({ year: z.number().int().min(1900).max(2200), ids: z.array(z.uuid()).min(1).max(240), format: z.enum(["pdf", "xlsx"]), acknowledgeMissing: z.boolean().default(false) }).parse(await request.json());
  const ids = new Set(body.ids);
  const items = (await slipsWithCumulative(body.year)).filter((item) => ids.has(item.id)).sort((a, b) => a.data.code.localeCompare(b.data.code) || a.data.month - b.data.month);
  if (items.length !== ids.size) throw new SlipError("สลิปที่เลือกต้องมีอยู่และอยู่ในปีเดียวกัน");
  if (items.some((item) => item.missingMonths.length) && !body.acknowledgeMissing) return NextResponse.json({ error: "ประวัติบางเดือนยังไม่ครบ ยอดสะสมจะรวมเฉพาะข้อมูลที่บันทึก", missing: items.filter((item) => item.missingMonths.length).map((item) => ({ name: item.data.name, month: item.data.month, missingMonths: item.missingMonths })) }, { status: 409 });
  let buffer: Buffer;
  try { buffer = body.format === "pdf" ? await createPdf(items) : await createExcel(items); }
  catch (error) {
    if (body.format === "pdf" && /Executable doesn't exist/.test((error as Error).message)) throw new SlipError("ยังไม่ได้ติดตั้ง Chromium กรุณารัน npm run salary-slips:install-browser แล้วลองใหม่ หรือดาวน์โหลด Excel", 503);
    throw error;
  }
  return new Response(new Uint8Array(buffer), { headers: {
    "Content-Type": body.format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="salary-slips-${body.year}.${body.format}"`,
    "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
  } });
});
