"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { RiDownload2Line, RiUpload2Line } from "@remixicon/react";
import { PageHeader } from "@/components/hrm/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectItem } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { hasPermission } from "@/lib/auth/permissions";
import { formatMoney, periodLabel } from "@/lib/salary-slips/model";
import { cn } from "@/lib/utils";
import { downloadSlips, readResponse } from "./helpers";

export default function SalarySlipsModule({ permissions, showHeader = true }) {
  const [items, setItems] = useState([]), [employees, setEmployees] = useState([]);
  const [year, setYear] = useState(String(new Date().getFullYear())), [month, setMonth] = useState("all");
  const [query, setQuery] = useState(""), [department, setDepartment] = useState("all");
  const [selected, setSelected] = useState([]), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [pending, setPending] = useState(null);
  async function load() {
    setLoading(true); setError("");
    try {
      const payload = await readResponse(await fetch("/api/salary-slips", { cache: "no-store" }));
      setItems(payload.items); setEmployees(payload.employees);
    } catch (error) { setError(error.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);
  useEffect(() => { setSelected([]); setPending(null); }, [year, month, query, department]);
  const years = [...new Set([new Date().getFullYear(), ...items.map((item) => item.year)])].sort((a, b) => b - a);
  const departments = [...new Set(items.map((item) => item.data.department).filter(Boolean))].sort();
  const visible = useMemo(() => items.filter((item) => item.year === Number(year)
    && (month === "all" || item.month === Number(month)) && (department === "all" || item.data.department === department)
    && `${item.data.code} ${item.data.name} ${employees.find((employee) => employee.id === item.employeeId)?.code ?? ""}`.toLocaleLowerCase("th").includes(query.trim().toLocaleLowerCase("th")))
    .sort((a, b) => b.month - a.month || a.data.code.localeCompare(b.data.code)), [items, year, month, department, query, employees]);
  async function send(format, acknowledgeMissing = false) {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await downloadSlips({ ids: selected, year: Number(year), format, acknowledgeMissing });
      if (result.missing) setPending({ format, missing: result.missing });
      else { setPending(null); setNotice("สร้างไฟล์และเริ่มดาวน์โหลดแล้ว"); }
    } catch (error) { setError(error.message); }
    finally { setBusy(false); }
  }
  return <div className="space-y-6">
    {showHeader ? <PageHeader title="สลิปเงินเดือน" description="นำเข้ารายรับ–รายหัก ตรวจสอบประวัติ และดาวน์โหลดสลิปของพนักงาน" actions={hasPermission(permissions, "salary_slips.import") && <Button asChild leadingIcon={RiUpload2Line}><Link href="/salary-slips/import">นำเข้า Excel</Link></Button>} /> : null}
    {error && <div role="alert" className="text-sm text-status-danger">{error} <Button variant="outline" onClick={load}>โหลดใหม่</Button></div>}
    {notice && <p role="status" className="text-sm text-status-success">{notice}</p>}
    <div className="flex flex-wrap items-end gap-3">
      <Input label="ค้นหาพนักงาน" value={query} onChange={setQuery} placeholder="ชื่อหรือรหัสพนักงาน" className="w-full sm:w-64" />
      <div className="grid w-36 gap-1.5"><label htmlFor="slip-year" className="text-sm font-medium">ปี พ.ศ.</label><Select id="slip-year" selectedKey={year} onSelectionChange={setYear}>{years.map((value) => <SelectItem id={String(value)} key={value}>{value + 543}</SelectItem>)}</Select></div>
      <div className="grid w-40 gap-1.5"><label htmlFor="slip-month" className="text-sm font-medium">เดือน</label><Select id="slip-month" selectedKey={month} onSelectionChange={setMonth}><SelectItem id="all">ทุกเดือน</SelectItem>{Array.from({ length: 12 }, (_, i) => <SelectItem id={String(i + 1)} key={i}>{periodLabel(Number(year), i + 1).split(" ")[0]}</SelectItem>)}</Select></div>
      <div className="grid w-full gap-1.5 sm:w-48"><label htmlFor="slip-department" className="text-sm font-medium">แผนก ณ งวด</label><Select id="slip-department" selectedKey={department} onSelectionChange={setDepartment}><SelectItem id="all">ทุกแผนก</SelectItem>{departments.map((value) => <SelectItem id={value} key={value}>{value}</SelectItem>)}</Select></div>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm"><p className="text-muted-foreground">{visible.length} สลิป · เลือก {selected.length} รายการ</p>{hasPermission(permissions, "salary_slips.export") && <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={!selected.length || busy} onClick={() => send("xlsx")}>ดาวน์โหลด Excel</Button><Button leadingIcon={RiDownload2Line} disabled={!selected.length || busy} onClick={() => send("pdf")}>{busy ? "กำลังสร้างไฟล์…" : "ดาวน์โหลด PDF"}</Button></div>}</div>
    {pending && <div role="alert" className="space-y-3 rounded-md border border-border bg-muted p-4 text-sm"><p className="font-medium">ประวัติบางเดือนยังไม่ครบ</p><p>ยอดสะสมจะรวมเฉพาะข้อมูลที่บันทึก กรุณาตรวจสอบก่อนดาวน์โหลด</p><ul className="max-h-40 overflow-auto">{pending.missing.map((item, i) => <li key={i}>{item.name} · งวด {item.month} · ยังไม่มีเดือน {item.missingMonths.join(", ")}</li>)}</ul><div className="flex flex-wrap gap-2"><Button disabled={busy} onClick={() => send(pending.format, true)}>ยืนยันดาวน์โหลดตามข้อมูลที่มี</Button><Button variant="outline" onClick={() => setPending(null)}>ยกเลิก</Button></div></div>}
    <Table><TableHeader><TableRow><TableHead><label className="inline-flex size-10 items-center justify-center"><Checkbox aria-label="เลือกสลิปทั้งหมดที่แสดง" isSelected={visible.length > 0 && selected.length === visible.length} onChange={(checked) => setSelected(checked ? visible.map((item) => item.id) : [])} /></label></TableHead><TableHead>พนักงาน</TableHead><TableHead>งวด</TableHead><TableHead>แผนก</TableHead><TableHead className="text-right">รายได้</TableHead><TableHead className="text-right">รายหัก</TableHead><TableHead className="text-right">รับสุทธิ</TableHead><TableHead /></TableRow></TableHeader>
      <TableBody>{loading ? <TableRow><TableCell colSpan={8} role="status">กำลังโหลดประวัติสลิป…</TableCell></TableRow> : visible.length ? visible.map((item) => <TableRow key={item.id} className={cn(selected.includes(item.id) && "bg-muted")}><TableCell><label className="inline-flex size-10 items-center justify-center"><Checkbox aria-label={`เลือก ${item.data.name} ${periodLabel(item.year, item.month)}`} isSelected={selected.includes(item.id)} onChange={(checked) => { setPending(null); setSelected((current) => checked ? [...current, item.id] : current.filter((id) => id !== item.id)); }} /></label></TableCell><TableCell><span className="font-medium">{item.data.name}</span><span className="block text-xs text-muted-foreground">{item.data.code}</span></TableCell><TableCell>{periodLabel(item.year, item.month)}</TableCell><TableCell>{item.data.department || "—"}</TableCell><TableCell className="text-right tabular-nums">{formatMoney(item.data.incomeTotal)}</TableCell><TableCell className="text-right tabular-nums">{formatMoney(item.data.deductionTotal)}</TableCell><TableCell className="text-right font-medium tabular-nums">{formatMoney(item.data.netPay)}</TableCell><TableCell><Button asChild variant="ghost"><Link href={`/salary-slips/${item.id}`}>รายละเอียด</Link></Button></TableCell></TableRow>) : <TableRow><TableCell colSpan={8}><div className="py-10 text-center"><p className="font-medium">ยังไม่มีสลิปตามเงื่อนไขที่เลือก</p><p className="mt-1 text-sm text-muted-foreground">เลือกปีหรือเดือนอื่น หรือนำเข้าไฟล์ Excel รายรับ–รายหักเพื่อเริ่มเก็บประวัติ</p></div></TableCell></TableRow>}</TableBody>
    </Table>
  </div>;
}
