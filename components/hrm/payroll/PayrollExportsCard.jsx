"use client";

import {
  RiBankLine,
  RiDownload2Line,
  RiFileExcel2Line,
  RiFileList3Line,
  RiFilePdf2Line,
  RiFileTextLine,
  RiLock2Line,
  RiShieldCheckLine,
} from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getShortMonthLabel, toBuddhistYear } from "./payrollFormat";

export function PayrollExportsCard({
  year,
  month,
  payroll,
  canExport = false,
  downloadingKey = "",
  onDownload,
  onOpenSlipsTab,
}) {
  const status = payroll?.workflow?.status ?? "review";
  const isLocked = status === "locked" || status === "paid";
  const hasRows = (payroll?.rows?.length ?? 0) > 0;
  const periodLabel = `${getShortMonthLabel(month)} ${toBuddhistYear(year)}`;

  const items = [
    {
      key: "summary-sheet",
      label: "ใบสรุปจ่ายเงินเดือน (TJARUSCH)",
      icon: RiFileList3Line,
      isSummaryDual: true,
      requiresLock: false,
    },
    {
      key: "bank-txt",
      label: "Bank file (โอนเงิน .txt)",
      icon: RiBankLine,
      requiresLock: true,
    },
    {
      key: "pnd1-xlsx",
      label: `ภ.ง.ด.1 (${periodLabel})`,
      icon: RiFileTextLine,
      requiresLock: true,
    },
    {
      key: "sso-xlsx",
      label: "สปส.1-10 ส่วนที่ 1–2",
      icon: RiShieldCheckLine,
      requiresLock: true,
    },
    {
      key: "slips-tab",
      label: "สลิปเงินเดือน (PDF / Excel)",
      icon: RiFilePdf2Line,
      isTabJump: true,
      requiresLock: true,
    },
    {
      key: "xlsx",
      label: "Payroll Register (XLSX)",
      icon: RiFileExcel2Line,
      requiresLock: false,
    },
    {
      key: "gl-csv",
      label: "GL Journal (CSV)",
      icon: RiFileList3Line,
      requiresLock: false,
    },
  ];

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">ไฟล์ส่งออก &amp; รายงานตามกฎหมาย</h2>
      </div>
      <ul className="mt-3 space-y-2">
        {items.map((item) => {
          const Icon = item.icon;
          const locked = item.requiresLock && !isLocked;
          const isBusy = downloadingKey === item.key;

          return (
            <li
              key={item.key}
              className={cn(
                "flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs transition-colors",
                locked && !item.isTabJump
                  ? "border-border bg-muted/40 text-muted-foreground"
                  : "border-border bg-background text-foreground",
              )}
            >
              <div className="flex min-w-0 items-center gap-2">
                <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="truncate font-medium">{item.label}</span>
              </div>

              {item.isSummaryDual ? (
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button
                    type="button"
                    variant="link"
                    size="xs"
                    className="h-auto px-1 py-0 text-xs font-medium text-primary"
                    disabled={!canExport || !hasRows || Boolean(downloadingKey)}
                    onClick={() => onDownload?.("summary-pdf")}
                  >
                    <RiFilePdf2Line className="size-3.5" aria-hidden="true" />
                    {downloadingKey === "summary-pdf" ? "สร้าง…" : "PDF"}
                  </Button>
                  <span className="text-border" aria-hidden="true">|</span>
                  <Button
                    type="button"
                    variant="link"
                    size="xs"
                    className="h-auto px-1 py-0 text-xs font-medium text-primary"
                    disabled={!canExport || !hasRows || Boolean(downloadingKey)}
                    onClick={() => onDownload?.("summary-xlsx")}
                  >
                    <RiFileExcel2Line className="size-3.5" aria-hidden="true" />
                    {downloadingKey === "summary-xlsx" ? "สร้าง…" : "XLSX"}
                  </Button>
                </div>
              ) : item.isTabJump ? (
                <Button
                  type="button"
                  variant="link"
                  size="xs"
                  className="h-auto shrink-0 px-1 py-0 text-xs font-medium text-primary"
                  onClick={onOpenSlipsTab}
                >
                  {locked ? (
                    <span className="inline-flex items-center gap-1">
                      <RiLock2Line className="size-3.5 text-muted-foreground" aria-hidden="true" />
                      เปิดแท็บสลิป
                    </span>
                  ) : (
                    "ออกสลิป"
                  )}
                </Button>
              ) : locked ? (
                <span
                  className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground"
                  title="ล็อกงวดเงินเดือนก่อนส่งออกไฟล์นี้"
                >
                  <RiLock2Line className="size-3.5" aria-hidden="true" />
                  รอล็อกงวด
                </span>
              ) : (
                <Button
                  type="button"
                  variant="link"
                  size="xs"
                  className="h-auto shrink-0 px-1 py-0 text-xs font-medium text-primary"
                  disabled={!canExport || !hasRows || Boolean(downloadingKey)}
                  onClick={() => onDownload?.(item.key)}
                >
                  <RiDownload2Line className="size-3.5" aria-hidden="true" />
                  {isBusy ? "กำลังสร้าง…" : "ดาวน์โหลด"}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {!isLocked ? (
        <p className="mt-2.5 text-[11px] leading-4 text-muted-foreground">
          ไฟล์โอนเงินธนาคาร, ภ.ง.ด.1 และ สปส.1-10 จะเปิดให้ดาวน์โหลดเมื่ออนุมัติและล็อกงวดแล้ว
        </p>
      ) : null}
    </Card>
  );
}
