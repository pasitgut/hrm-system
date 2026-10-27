"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/hrm/PageHeader";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { hasPermission } from "@/lib/auth/permissions";
import { deductionFields, incomeFields, formatMoney, periodLabel } from "@/lib/salary-slips/model";
import { downloadSlips, readResponse } from "./helpers";

function Amounts({ title, data, fields, total }) {
  return <section className="min-w-0 space-y-3"><h2 className="text-base font-semibold">{title}</h2><Table><TableHeader><TableRow><TableHead>รายการ</TableHead><TableHead className="text-right">จำนวนเงิน (บาท)</TableHead></TableRow></TableHeader><TableBody>{fields.filter(([key]) => data[key]).map(([key, label]) => <TableRow key={key}><TableCell>{label}</TableCell><TableCell className="text-right tabular-nums">{formatMoney(data[key])}</TableCell></TableRow>)}<TableRow><TableCell className="font-medium">รวม{title}</TableCell><TableCell className="text-right font-medium tabular-nums">{formatMoney(total)}</TableCell></TableRow></TableBody></Table></section>;
}
export default function SalarySlipDetail({ id, permissions }) {
  const [payload, setPayload] = useState(null), [error, setError] = useState(""), [busy, setBusy] = useState(false), [notice, setNotice] = useState("");
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/salary-slips/${id}`, { cache: "no-store" }).then(readResponse).then((data) => { if (!cancelled) setPayload(data); }).catch((error) => { if (!cancelled) setError(error.message); });
    return () => { cancelled = true; };
  }, [id]);
  async function download(format) {
    setBusy(true); setError(""); setNotice("");
    try { await downloadSlips({ ids: [id], year: payload.item.data.year, format, acknowledgeMissing: true }); setNotice("สร้างไฟล์และเริ่มดาวน์โหลดแล้ว"); }
    catch (error) { setError(error.message); } finally { setBusy(false); }
  }
  const item = payload?.item, data = item?.data;
  return <div className="space-y-6"><PageHeader title={data ? `สลิปของ ${data.name}` : "รายละเอียดสลิปเงินเดือน"} description={data ? `${periodLabel(data.year, data.month)} · รุ่นปัจจุบัน ${item.revision}` : "รายละเอียดและประวัติการแก้ไข"} actions={<Button asChild variant="outline"><Link href="/salary-slips">กลับไปประวัติสลิป</Link></Button>} />
    {error && <p role="alert" className="text-sm text-status-danger">{error}</p>}{notice && <p role="status" className="text-sm text-status-success">{notice}</p>}
    {!payload && !error && <p role="status" className="text-sm text-muted-foreground">กำลังโหลดรายละเอียด…</p>}
    {data && <><dl className="grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2 lg:grid-cols-4">{[["รหัสพนักงานในไฟล์", data.code], ["แผนก ณ งวด", data.department || "—"], ["ธนาคาร", data.bank || "—"], ["เลขที่บัญชี", data.bankAccount || "—"]].map(([label, value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="mt-1 break-words font-medium">{value}</dd></div>)}</dl>
      <div className="grid gap-6 lg:grid-cols-2"><Amounts title="รายได้" data={data.incomes} fields={incomeFields} total={data.incomeTotal} /><Amounts title="รายหัก" data={data.deductions} fields={deductionFields} total={data.deductionTotal} /></div>
      <div className="flex flex-wrap items-center justify-between gap-4 border-y border-border py-4"><p className="text-sm">รับสุทธิ <strong className="ml-4 text-xl tabular-nums">{formatMoney(data.netPay)} บาท</strong></p>{hasPermission(permissions, "salary_slips.export") && <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={() => download("xlsx")}>ดาวน์โหลด Excel</Button><Button disabled={busy} onClick={() => download("pdf")}>{busy ? "กำลังสร้างไฟล์…" : "ดาวน์โหลด PDF"}</Button></div>}</div>
      <section className="space-y-3"><h2 className="text-base font-semibold">ยอดสะสมถึง {periodLabel(data.year, data.month)}</h2><dl className="grid grid-cols-2 gap-4 text-sm lg:grid-cols-4">{[["รายได้", item.cumulative.income], ["ภาษี", item.cumulative.tax], ["ประกันสังคม", item.cumulative.social], ["กองทุนสำรองเลี้ยงชีพ", item.cumulative.provident]].map(([label, value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="mt-1 font-medium tabular-nums">{formatMoney(value)}</dd></div>)}</dl>{item.missingMonths.length > 0 && <p role="status" className="text-sm text-status-warning">ยังไม่มีประวัติเดือน {item.missingMonths.join(", ")} ยอดสะสมและไฟล์ที่ดาวน์โหลดจะรวมเฉพาะข้อมูลที่บันทึกไว้</p>}</section>
      <section className="space-y-3"><h2 className="text-base font-semibold">ประวัติรุ่นข้อมูล</h2>{payload.versions.map((version) => <details key={version.id} className="border-b border-border pb-3"><summary className="flex min-h-10 cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><span className="font-medium">รุ่น {version.revision}</span><span>{version.reason}</span><span className="text-xs text-muted-foreground">{version.createdBy} · {new Date(version.createdAt).toLocaleString("th-TH")}</span><span className="ml-auto tabular-nums">สุทธิ {formatMoney(version.data.netPay)}</span></summary><div className="mt-4 grid gap-4 lg:grid-cols-2"><Amounts title="รายได้" data={version.data.incomes} fields={incomeFields} total={version.data.incomeTotal} /><Amounts title="รายหัก" data={version.data.deductions} fields={deductionFields} total={version.data.deductionTotal} /><p className="text-xs text-muted-foreground lg:col-span-2">{version.data.code} · {version.data.name} · {version.data.department} · {version.data.bank} {version.data.bankAccount}</p></div></details>)}</section>
    </>}
  </div>;
}
