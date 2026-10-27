"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/hrm/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectItem } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { hasPermission } from "@/lib/auth/permissions";
import { deductionFields, incomeFields, formatMoney, periodLabel } from "@/lib/salary-slips/model";
import { readResponse } from "./helpers";

function Changes({ oldData, data }) {
  const fields = [["name", "ชื่อ"], ["department", "แผนก"], ["bank", "ธนาคาร"], ["bankAccount", "เลขบัญชี"], ["incomeTotal", "รวมรายได้"], ["deductionTotal", "รวมรายหัก"], ["netPay", "รับสุทธิ"]];
  const changes = fields.filter(([key]) => oldData[key] !== data[key]).map(([key, label]) => `${label}: ${typeof data[key] === "number" ? formatMoney(oldData[key]) : oldData[key]} → ${typeof data[key] === "number" ? formatMoney(data[key]) : data[key]}`);
  for (const [group, mapping] of [["incomes", incomeFields], ["deductions", deductionFields]]) for (const [key, label] of mapping) if (oldData[group][key] !== data[group][key]) changes.push(`${label}: ${formatMoney(oldData[group][key] ?? 0)} → ${formatMoney(data[group][key] ?? 0)}`);
  return <details className="text-xs"><summary className="cursor-pointer py-2 text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">ดูผลต่าง {changes.length} ช่อง</summary><ul className="space-y-1">{changes.map((change, index) => <li key={index}>{change}</li>)}</ul></details>;
}
export default function SalarySlipImport({ permissions }) {
  const router = useRouter(), params = useSearchParams();
  const id = params.get("batch");
  const [files, setFiles] = useState([]), [batch, setBatch] = useState(null), [selections, setSelections] = useState({});
  const [reason, setReason] = useState(""), [busy, setBusy] = useState(false), [dirty, setDirty] = useState(false), [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(true); }, []);
  function accept(payload) { setBatch(payload); setSelections(Object.fromEntries(payload.rows.map((row) => [row.key, { employeeId: row.employeeId, expectedRevision: row.current?.revision ?? 0, replace: false }]))); setDirty(false); }
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setBusy(true); setError("");
    fetch(`/api/salary-slips/imports/${id}`).then(readResponse).then((payload) => { if (!cancelled) accept(payload); }).catch((error) => { if (!cancelled) setError(error.message); }).finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [id]);
  async function upload(event) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const form = new FormData(); for (const file of files) form.append("files", file);
      const payload = await readResponse(await fetch("/api/salary-slips/imports", { method: "POST", body: form }));
      accept(payload); router.replace(`/salary-slips/import?batch=${payload.id}`);
    } catch (error) { setError(error.message); }
    finally { setBusy(false); }
  }
  async function preview() {
    setBusy(true); setError("");
    try { accept(await readResponse(await fetch(`/api/salary-slips/imports/${batch.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ selections: Object.entries(selections).map(([key, selection]) => ({ key, employeeId: selection.employeeId })) }) }))); }
    catch (error) { setError(error.message); } finally { setBusy(false); }
  }
  async function commit() {
    setBusy(true); setError("");
    try {
      await readResponse(await fetch(`/api/salary-slips/imports/${batch.id}/commit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason, selections: Object.entries(selections).map(([key, selection]) => ({ key, ...selection })) }) }));
      router.push("/salary-slips"); router.refresh();
    } catch (error) { setError(error.message); } finally { setBusy(false); }
  }
  const replacements = batch?.rows.filter((row) => row.status === "replace") ?? [];
  const blocked = !batch || batch.rows.some((row) => row.errors.length) || dirty || batch.committedAt || replacements.some((row) => !selections[row.key]?.replace) || (replacements.length > 0 && !reason.trim());
  return <div className="space-y-6"><PageHeader title="นำเข้าสลิปเงินเดือน" description="ตรวจข้อมูลและจับคู่พนักงานก่อนบันทึก ยอดเงินอ้างอิงจาก Excel ต้นฉบับ" actions={<Button asChild variant="outline"><Link href="/salary-slips">กลับไปประวัติสลิป</Link></Button>} />
    {error && <p role="alert" className="text-sm text-status-danger">{error}</p>}
    <form onSubmit={upload} className="max-w-2xl space-y-3"><Input type="file" label="ไฟล์รายรับ–รายหัก (.xlsx)" accept=".xlsx" multiple onChange={(event) => setFiles(Array.from(event.target.files ?? []))} isDisabled={busy || !ready} /><p className="text-xs text-muted-foreground">รูปแบบ Payroll เดิม เริ่มแถว 9 · สูงสุด 12 ไฟล์ · ไฟล์ละ 10 MB รวม 25 MB</p><Button type="submit" disabled={!files.length || busy || !ready}>{busy ? "กำลังประมวลผล…" : "อ่านไฟล์และตรวจสอบ"}</Button></form>
    {batch && <section className="space-y-4" aria-label="ผลตรวจสอบก่อนบันทึก"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-base font-semibold">ตรวจสอบ {batch.rows.length} รายการ</h2><p className="text-sm text-muted-foreground">ใหม่ {batch.rows.filter((row) => row.status === "new").length} · เหมือนเดิม {batch.rows.filter((row) => row.status === "unchanged").length} · แทนที่ {replacements.length}</p></div><Button variant="outline" disabled={busy || !!batch.committedAt} onClick={preview}>ตรวจสอบการจับคู่อีกครั้ง</Button></div>
      {batch.committedAt && <p role="status" className="text-sm text-status-success">ชุดนี้บันทึกแล้ว เปิดดูรายการได้ที่ประวัติสลิป</p>}
      {dirty && <p role="status" className="text-sm text-status-warning">มีการเปลี่ยนการจับคู่ กรุณากดตรวจสอบการจับคู่อีกครั้งก่อนบันทึก</p>}
      <Table><TableHeader><TableRow><TableHead>ไฟล์ / แถว</TableHead><TableHead>พนักงานในไฟล์</TableHead><TableHead>จับคู่กับ HRM</TableHead><TableHead className="text-right">รับสุทธิ</TableHead><TableHead>ผลตรวจสอบ</TableHead></TableRow></TableHeader><TableBody>{batch.rows.map((row) => <TableRow key={row.key}><TableCell><span className="block max-w-44 break-words text-xs">{row.file}</span><span className="text-xs text-muted-foreground">{row.sheet} · แถว {row.row}</span></TableCell><TableCell>{row.data ? <><span className="font-medium">{row.data.name}</span><span className="block text-xs text-muted-foreground">{row.data.code} · {periodLabel(row.data.year, row.data.month)}</span></> : "อ่านข้อมูลไม่ได้"}</TableCell><TableCell><div className="min-w-60"><Select aria-label={`จับคู่พนักงาน ${row.data?.name ?? row.row}`} selectedKey={selections[row.key]?.employeeId || "unmatched"} isDisabled={busy || !!batch.committedAt} onSelectionChange={(employeeId) => { setSelections((current) => ({ ...current, [row.key]: { employeeId: employeeId === "unmatched" ? "" : employeeId, expectedRevision: 0, replace: false } })); setDirty(true); }}><SelectItem id="unmatched">เลือกพนักงาน</SelectItem>{batch.employees.map((employee) => <SelectItem key={employee.id} id={employee.id}>{employee.code} · {employee.firstName} {employee.lastName}{employee.ended ? " (พ้นสภาพ)" : ""}</SelectItem>)}</Select></div></TableCell><TableCell className="text-right tabular-nums">{row.data ? formatMoney(row.data.netPay) : "—"}</TableCell><TableCell><div className="min-w-56 space-y-1 text-sm"><p>{({ new: "รายการใหม่", unchanged: "เหมือนเดิม · จะข้าม", replace: "ข้อมูลต่างจากเดิม", invalid: "ข้อมูลไม่ถูกต้อง" })[row.status]}</p>{row.errors.map((message, index) => <p key={index} className="text-xs text-status-danger">{message}</p>)}{row.warnings.map((message, index) => <p key={index} className="text-xs text-status-warning">{message}</p>)}{row.status === "replace" && <><Changes oldData={row.current.data} data={row.data} />{hasPermission(permissions, "salary_slips.replace") ? <label className="flex min-h-10 items-center gap-2 text-xs"><Checkbox isDisabled={busy || dirty || !!batch.committedAt} isSelected={selections[row.key]?.replace ?? false} onChange={(replace) => setSelections((current) => ({ ...current, [row.key]: { ...current[row.key], replace } }))} />ยืนยันแทนที่รุ่น {row.current.revision}</label> : <p className="text-xs text-status-danger">ต้องมีสิทธิ์แทนที่สลิป</p>}</>}</div></TableCell></TableRow>)}</TableBody></Table>
      {replacements.length > 0 && <Textarea label="เหตุผลที่แทนที่ข้อมูล" value={reason} maxLength={1000} onChange={(event) => setReason(event.target.value)} hint="เหตุผลนี้จะถูกเก็บในประวัติทุกรายการที่แทนที่" />}
      <div className="flex flex-wrap items-center gap-3"><Button disabled={busy || !!blocked} onClick={commit}>{busy ? "กำลังประมวลผล…" : "ยืนยันบันทึกทั้งชุด"}</Button><p className="text-xs text-muted-foreground">รายการที่ผิดต้องแก้ไฟล์และนำเข้าใหม่ก่อนบันทึก</p></div>
    </section>}
  </div>;
}
