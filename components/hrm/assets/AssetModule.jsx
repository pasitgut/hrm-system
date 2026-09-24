"use client";

import { useMemo, useState } from "react";
import {
  RiAddLine,
  RiArchiveLine,
  RiArrowGoBackLine,
  RiCalendarLine,
  RiCheckboxCircleLine,
  RiComputerLine,
  RiFileList3Line,
  RiMapPinLine,
  RiSearchLine,
} from "@remixicon/react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectItem } from "@/components/ui/select";
import { Tabs, TabList, Tab, TabPanel } from "@/components/ui/tabs";
import { useHrmRole } from "@/components/hrm/HrmShell";
import { cx } from "@/utils/cx";

const initialAssets = [
  { id: "AST-001", name: "MacBook Air M2", category: "คอมพิวเตอร์", serial: "C02M2-001", holder: "นภัสสร สายทอง", location: "People team", status: "ใช้งานอยู่", color: "lime" },
  { id: "AST-002", name: "MacBook Air M2", category: "คอมพิวเตอร์", serial: "C02M2-002", holder: "ธนากร มั่นคง", location: "Engineering", status: "ใช้งานอยู่", color: "blue" },
  { id: "AST-003", name: "MacBook Air M2", category: "คอมพิวเตอร์", serial: "C02M2-003", holder: "ว่าง", location: "ตู้เก็บอุปกรณ์", status: "พร้อมให้ยืม", color: "cyan" },
  { id: "AST-004", name: "iPad 10th Gen", category: "แท็บเล็ต", serial: "IP10-004", holder: "ปิยะนุช แก้วใส", location: "Operations", status: "ใช้งานอยู่", color: "orange" },
  { id: "AST-005", name: "จอ Dell 27”", category: "อุปกรณ์โต๊ะทำงาน", serial: "DL27-005", holder: "ว่าง", location: "ตู้เก็บอุปกรณ์", status: "พร้อมให้ยืม", color: "cyan" },
  { id: "AST-006", name: "หูฟัง Sony WH-1000XM5", category: "อุปกรณ์เสริม", serial: "SNY-006", holder: "มะลิวัลย์ รุ่งเรือง", location: "Growth", status: "ใช้งานอยู่", color: "purple" },
  { id: "AST-007", name: "โปรเจกเตอร์ Epson", category: "ห้องประชุม", serial: "EPS-007", holder: "ว่าง", location: "ห้องประชุม A", status: "พร้อมให้ยืม", color: "cyan" },
  { id: "AST-008", name: "คีย์บอร์ด Mechanical", category: "อุปกรณ์เสริม", serial: "KB-008", holder: "วรพล ภักดี", location: "Engineering", status: "ใช้งานอยู่", color: "blue" },
];

const recentHistory = [
  { id: "TX-091", asset: "MacBook Air M2 · AST-003", borrower: "ธนากร มั่นคง", range: "10 – 15 ก.ย. 2569", status: "คืนแล้ว", color: "lime" },
  { id: "TX-090", asset: "โปรเจกเตอร์ Epson · AST-007", borrower: "อรทัย ชูใจ", range: "05 – 06 ก.ย. 2569", status: "คืนแล้ว", color: "lime" },
  { id: "TX-089", asset: "iPad 10th Gen · AST-004", borrower: "ปิยะนุช แก้วใส", range: "01 – 30 ก.ย. 2569", status: "กำลังยืม", color: "yellow" },
];

function AssetStatus({ status }) {
  return <Chip variant="caption" color={status === "พร้อมให้ยืม" ? "cyan" : status === "ใช้งานอยู่" ? "lime" : "yellow"}>{status}</Chip>;
}

function AssetCard({ asset, onReturn }) {
  return <article className="rounded-xl border border-border p-4"><div className="flex items-start justify-between gap-3"><div className="flex items-start gap-3"><div className="hrm-soft-icon"><RiComputerLine className="size-5" aria-hidden /></div><div><strong className="block text-sm font-medium leading-5 text-foreground">{asset.name}</strong><span className="text-[11px] leading-4 text-muted-foreground">{asset.id} · {asset.serial}</span></div></div><AssetStatus status={asset.status} /></div><div className="mt-4 grid gap-1 text-xs leading-5 text-muted-foreground"><span>ผู้ถือครอง: {asset.holder}</span><span className="inline-flex items-center gap-1 text-xs leading-4 text-muted-foreground"><RiMapPinLine className="size-3.5" aria-hidden />{asset.location}</span></div>{asset.status === "ใช้งานอยู่" && asset.holder !== "ว่าง" ? <Button size="small" variant="secondary" leadingIcon={RiArrowGoBackLine} className="mt-4 w-full" onClick={() => onReturn(asset.id)}>รับคืนทรัพย์สิน</Button> : null}</article>;
}

export default function AssetModule() {
  const { role } = useHrmRole();
  const [assets, setAssets] = useState(initialAssets);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [assetTab, setAssetTab] = useState("inventory");
  const [borrower, setBorrower] = useState("นภัสสร สายทอง");
  const [assetId, setAssetId] = useState("AST-003");
  const available = assets.filter((asset) => asset.status === "พร้อมให้ยืม");
  const filtered = useMemo(() => assets.filter((asset) => `${asset.name} ${asset.id} ${asset.holder} ${asset.category}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())), [assets, query]);
  const returnAsset = (id) => { setAssets((current) => current.map((asset) => asset.id === id ? { ...asset, holder: "ว่าง", location: "ตู้เก็บอุปกรณ์", status: "พร้อมให้ยืม", color: "cyan" } : asset)); setNotice("บันทึกรับคืนทรัพย์สินเรียบร้อยแล้ว"); };
  const submitBorrow = (event) => { event.preventDefault(); const selected = assets.find((asset) => asset.id === assetId); if (!selected) return; setAssets((current) => current.map((asset) => asset.id === assetId ? { ...asset, holder: borrower, location: "กำลังยืม", status: "รออนุมัติ", color: "yellow" } : asset)); setNotice(`ส่งคำขอยืม ${selected.name} ให้หัวหน้าอนุมัติแล้ว`); setAssetTab("inventory"); };

  return <div className="space-y-6"><section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-xs font-semibold leading-4 uppercase tracking-[0.08em] text-primary">People operations · Assets</p><h1 className="mt-2 text-2xl font-semibold tracking-tight leading-tight text-foreground sm:text-3xl">ยืมคืนทรัพย์สิน</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">ติดตามอุปกรณ์ของบริษัท 10 คนให้รู้ว่าใครถืออยู่และคืนเมื่อไร</p></div><div className="flex flex-wrap gap-2"><Chip color="cyan" variant="caption">บทบาท: {role === "manager" ? "หัวหน้างาน" : "พนักงาน"}</Chip><Button leadingIcon={RiAddLine} onClick={() => setAssetTab("borrow")}>สร้างรายการยืม</Button></div></section>{notice ? <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-xs leading-5 text-primary"><span>{notice}</span><Button size="xs" variant="ghost" onClick={() => setNotice("")}>ปิด</Button></div> : null}<section className="grid grid-cols-2 gap-3 lg:grid-cols-4"><article className="rounded-xl border border-border bg-card p-4 shadow-sm"><span className="text-xs leading-4 text-muted-foreground">ทรัพย์สินทั้งหมด</span><p className="mt-3 text-2xl font-semibold tracking-tight leading-tight text-foreground">{assets.length}</p><span className="text-[11px] leading-4 text-muted-foreground">รายการในทะเบียน</span></article><article className="rounded-xl border border-border bg-card p-4 shadow-sm"><span className="text-xs leading-4 text-muted-foreground">กำลังใช้งาน</span><p className="mt-3 text-2xl font-semibold tracking-tight leading-tight text-foreground">{assets.filter((asset) => asset.status === "ใช้งานอยู่").length}</p><span className="text-[11px] leading-4 text-muted-foreground">อยู่กับพนักงาน</span></article><article className="rounded-xl border border-border bg-card p-4 shadow-sm"><span className="text-xs leading-4 text-muted-foreground">พร้อมให้ยืม</span><p className="mt-3 text-2xl font-semibold tracking-tight leading-tight text-foreground">{available.length}</p><span className="text-[11px] leading-4 text-muted-foreground">รับคำขอใหม่</span></article><article className="rounded-xl border border-border bg-card p-4 shadow-sm"><span className="text-xs leading-4 text-muted-foreground">รออนุมัติ</span><p className="mt-3 text-2xl font-semibold tracking-tight leading-tight text-foreground">{assets.filter((asset) => asset.status === "รออนุมัติ").length}</p><span className="text-[11px] leading-4 text-muted-foreground">ส่งต่อหัวหน้างาน</span></article></section><Tabs selectedKey={assetTab} onSelectionChange={(key) => setAssetTab(String(key))}><TabList aria-label="เมนูทรัพย์สิน"><Tab id="inventory" icon={RiArchiveLine}>ทะเบียนทรัพย์สิน</Tab><Tab id="borrow" icon={RiAddLine}>ยืมทรัพย์สิน</Tab><Tab id="history" icon={RiFileList3Line}>ประวัติ</Tab></TabList><TabPanel id="inventory"><section className="mt-5 overflow-hidden rounded-xl border border-border bg-card shadow-sm"><div className="flex flex-col gap-4 border-b border-border p-4 sm:flex-row sm:items-end sm:justify-between sm:p-5"><div><h2 className="text-lg font-semibold tracking-tight leading-6 text-foreground">ทะเบียนทรัพย์สิน</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">รายการอุปกรณ์และผู้ถือครองปัจจุบัน</p></div><Input aria-label="ค้นหาทรัพย์สิน" placeholder="ค้นหาชื่อหรือรหัส" value={query} onChange={(value) => setQuery(value)} leadingIcon={RiSearchLine} className="sm:w-64" /></div><div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">{filtered.map((asset) => <AssetCard key={asset.id} asset={asset} onReturn={returnAsset} />)}</div></section></TabPanel><TabPanel id="borrow"><section className="mt-5 grid gap-4 xl:grid-cols-[1.05fr_.95fr]"><form className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6" onSubmit={submitBorrow}><div className="flex items-start gap-3"><div className="hrm-soft-icon"><RiArchiveLine className="size-5" aria-hidden /></div><div><h2 className="text-lg font-semibold tracking-tight leading-6 text-foreground">สร้างคำขอยืมทรัพย์สิน</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">เลือกอุปกรณ์และกำหนดวันคืนเพื่อส่งให้หัวหน้างาน</p></div></div><div className="mt-6 space-y-4"><div className="space-y-1"><span className="text-xs font-medium leading-5 text-muted-foreground">ทรัพย์สิน</span><Select aria-label="ทรัพย์สินที่ต้องการยืม" selectedKey={assetId} onSelectionChange={(key) => setAssetId(String(key))} className="w-full"><>{available.map((asset) => <SelectItem id={asset.id} key={asset.id}>{asset.name} · {asset.id}</SelectItem>)}</></Select></div><div className="space-y-1"><span className="text-xs font-medium leading-5 text-muted-foreground">ผู้ยืม</span><Select aria-label="ผู้ยืม" selectedKey={borrower} onSelectionChange={(key) => setBorrower(String(key))} className="w-full"><SelectItem id="นภัสสร สายทอง">นภัสสร สายทอง</SelectItem><SelectItem id="อรทัย ชูใจ">อรทัย ชูใจ</SelectItem><SelectItem id="ธนากร มั่นคง">ธนากร มั่นคง</SelectItem><SelectItem id="ปิยะนุช แก้วใส">ปิยะนุช แก้วใส</SelectItem></Select></div><Input label="วันที่รับทรัพย์สิน" type="date" defaultValue="2026-09-23" leadingIcon={RiCalendarLine} isRequired /><Input label="กำหนดคืน" type="date" defaultValue="2026-09-30" leadingIcon={RiCalendarLine} isRequired /><Input label="วัตถุประสงค์" placeholder="เช่น ใช้งานนอกสถานที่กับลูกค้า" /></div><div className="mt-6 flex justify-end"><Button type="submit" leadingIcon={RiCheckboxCircleLine} isDisabled={available.length === 0}>ส่งคำขอยืม</Button></div></form><aside className="hrm-note-panel"><RiArchiveLine className="size-5 text-muted-foreground" aria-hidden /><div><h3 className="text-lg font-semibold tracking-tight leading-6 text-foreground">ขั้นตอนการยืมคืน</h3><ul className="mt-3 space-y-2 text-xs leading-5 text-muted-foreground"><li>คำขอใหม่จะเข้ากล่องอนุมัติของหัวหน้างาน</li><li>รับอุปกรณ์แล้วตรวจสอบสภาพก่อนเซ็นรับ</li><li>กดรับคืนเมื่อส่งอุปกรณ์กลับ People Operations</li></ul></div></aside></section></TabPanel><TabPanel id="history"><section className="mt-5 overflow-hidden rounded-xl border border-border bg-card shadow-sm"><div className="border-b border-border p-4 sm:p-5"><h2 className="text-lg font-semibold tracking-tight leading-6 text-foreground">ประวัติการยืมคืน</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">รายการเคลื่อนไหวล่าสุดของทรัพย์สิน</p></div><div className="divide-y divide-border">{recentHistory.map((item) => <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5" key={item.id}><div className="flex items-center gap-3"><Avatar initials={item.borrower.slice(0, 2)} color="blue" size="md" /><div><strong className="block text-xs font-medium leading-5 text-foreground">{item.asset}</strong><span className="text-xs leading-4 text-muted-foreground">{item.borrower} · {item.range}</span></div></div><Chip variant="caption" color={item.color}>{item.status}</Chip></div>)}</div></section></TabPanel></Tabs></div>;
}
