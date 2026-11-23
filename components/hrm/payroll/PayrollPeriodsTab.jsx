"use client";

import { useEffect, useState } from "react";
import { RiCheckLine, RiEyeLine, RiLock2Line, RiLockUnlockLine } from "@remixicon/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatMoney, formatThaiDate, toBuddhistYear } from "./payrollFormat";

export function PayrollPeriodsTab({
  year,
  currentMonth,
  refreshToken = 0,
  canOperate = false,
  busy = false,
  onSelectPeriod,
  onClosePeriodForMonth,
  onReopenPeriodForMonth,
}) {
  const [periods, setPeriods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/payroll?year=${year}&listPeriods=1`, { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.error || "โหลดรายการงวดเงินเดือนไม่สำเร็จ");
        }
        if (!cancelled) {
          setPeriods(payload.periods ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "โหลดรายการงวดเงินเดือนไม่สำเร็จ");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [year, refreshToken]);

  return (
    <Card className="min-w-0 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3.5">
        <div>
          <h2 className="text-base font-semibold text-foreground">
            ตารางงวดการจ่ายเงินเดือน — ปี พ.ศ. {toBuddhistYear(year)}
          </h2>
          <p className="text-xs text-muted-foreground">
            จัดการสถานะเปิด/ปิดงวด กำหนดวันที่ตัด OT และวันลา หรือคลิก “ดู” เพื่อเปิดตารางคำนวณของงวดนั้น
          </p>
        </div>
      </div>

      {error ? (
        <p role="alert" className="mx-4 mb-3 rounded-md border border-status-danger/30 bg-status-danger/10 px-3 py-2 text-xs text-status-danger">
          {error}
        </p>
      ) : null}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>จัดการ</TableHead>
            <TableHead>รหัสงวด</TableHead>
            <TableHead>สถานะ</TableHead>
            <TableHead>กลุ่ม</TableHead>
            <TableHead className="text-center">รายเดือน</TableHead>
            <TableHead className="text-center">รายวัน</TableHead>
            <TableHead>จากวันที่</TableHead>
            <TableHead>ถึงวันที่</TableHead>
            <TableHead>วันที่จ่าย</TableHead>
            <TableHead>วันที่ตัด ขาด,ลา,มาสาย</TableHead>
            <TableHead>วันที่ตัด OT</TableHead>
            <TableHead className="text-right">ยอดจ่ายสุทธิ (ปิดงวด)</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={12} className="py-10 text-center text-sm text-muted-foreground">
                กำลังโหลดรายการงวดเงินเดือน…
              </TableCell>
            </TableRow>
          ) : periods.length === 0 ? (
            <TableRow>
              <TableCell colSpan={12} className="py-10 text-center text-sm text-muted-foreground">
                ไม่พบข้อมูลงวดเงินเดือน
              </TableCell>
            </TableRow>
          ) : (
            periods.map((period) => {
              const isSelected = String(period.month) === String(currentMonth);
              const isClosed = period.status === "closed";

              return (
                <TableRow
                  key={period.periodCode}
                  className={cn(isSelected && "bg-primary/5")}
                >
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        leadingIcon={RiEyeLine}
                        onClick={() => onSelectPeriod?.(period.month)}
                        className="h-7 px-2 text-xs"
                      >
                        ดู
                      </Button>
                      {canOperate && !isClosed ? (
                        <Button
                          type="button"
                          size="xs"
                          variant="ghost"
                          leadingIcon={RiLock2Line}
                          disabled={busy}
                          onClick={() => onClosePeriodForMonth?.(period.month)}
                          className="h-7 px-2 text-xs text-status-danger hover:bg-status-danger/10 hover:text-status-danger"
                        >
                          ปิดงวด
                        </Button>
                      ) : null}
                      {canOperate && isClosed && period.workflowStatus === "locked" ? (
                        <Button
                          type="button"
                          size="xs"
                          variant="ghost"
                          leadingIcon={RiLockUnlockLine}
                          disabled={busy}
                          onClick={() => onReopenPeriodForMonth?.(period.month)}
                          className="h-7 px-2 text-xs text-muted-foreground"
                        >
                          ปลดล็อก
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                  <td className="px-3 py-2 font-mono text-xs font-medium tabular-nums text-foreground">
                    {period.periodCode}
                    {isSelected ? <Badge color="info" variant="caption" className="ml-1.5">กำลังดู</Badge> : null}
                  </td>
                  <TableCell>
                    <Badge color={isClosed ? "danger" : "success"} variant="caption">
                      {isClosed ? "ปิดงวด" : "เปิด"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">{period.groupName}</TableCell>
                  <TableCell className="text-center">
                    {period.includeMonthly ? <RiCheckLine className="mx-auto size-4 text-status-success" aria-label="รวมรายเดือน" /> : "—"}
                  </TableCell>
                  <TableCell className="text-center">
                    {period.includeDaily ? <RiCheckLine className="mx-auto size-4 text-status-success" aria-label="รวมรายวัน" /> : "—"}
                  </TableCell>
                  <TableCell className="text-xs tabular-nums">{formatThaiDate(period.periodStart)}</TableCell>
                  <TableCell className="text-xs tabular-nums">{formatThaiDate(period.periodEnd)}</TableCell>
                  <TableCell className="text-xs tabular-nums">{formatThaiDate(period.payDate)}</TableCell>
                  <TableCell className="text-xs tabular-nums">{formatThaiDate(period.leaveCutoffDate)}</TableCell>
                  <TableCell className="text-xs tabular-nums">{formatThaiDate(period.otCutoffDate)}</TableCell>
                  <TableCell className="text-right text-xs font-medium tabular-nums">
                    {period.netTotal != null ? formatMoney(period.netTotal) : "—"}
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </Card>
  );
}
