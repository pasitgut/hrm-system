"use client";

import { useMemo } from "react";
import { RiAlertLine, RiCheckLine, RiErrorWarningLine, RiSearchLine } from "@remixicon/react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatMoney, getAvatarColor, getEmployeeInitials } from "./payrollFormat";

function ReviewCell({ row, onInspect }) {
  if (row.hasBlockingIssue) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="xs"
        className="h-7 gap-1 border border-status-danger/30 bg-status-danger/10 px-2 text-xs font-medium text-status-danger hover:bg-status-danger/20 hover:text-status-danger"
        onClick={(event) => {
          event.stopPropagation();
          onInspect(row);
        }}
      >
        <RiErrorWarningLine className="size-3.5" aria-hidden="true" />
        ข้อมูลไม่ครบ
      </Button>
    );
  }
  if (row.needsReview) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="xs"
        className="h-7 gap-1 border border-status-warning/30 bg-status-warning/10 px-2 text-xs font-medium text-status-warning hover:bg-status-warning/20 hover:text-status-warning"
        onClick={(event) => {
          event.stopPropagation();
          onInspect(row);
        }}
      >
        <RiAlertLine className="size-3.5" aria-hidden="true" />
        ตรวจสอบ
      </Button>
    );
  }
  if (row.isVerified) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="xs"
        className="h-7 gap-1 border border-status-success/30 bg-status-success/10 px-2 text-xs font-medium text-status-success hover:bg-status-success/20 hover:text-status-success"
        onClick={(event) => {
          event.stopPropagation();
          onInspect(row);
        }}
      >
        <RiCheckLine className="size-3.5" aria-hidden="true" />
        ยืนยันแล้ว
      </Button>
    );
  }
  return <span className="text-muted-foreground">—</span>;
}

export function PayrollTableCard({
  rows = [],
  loading = false,
  search = "",
  onSearchChange,
  onlyNeedsReview = false,
  onOnlyNeedsReviewChange,
  onSelectRow,
}) {
  const filteredRows = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (onlyNeedsReview && !row.needsReview) return false;
      if (!keyword) return true;
      return (
        row.name.toLowerCase().includes(keyword)
        || row.code.toLowerCase().includes(keyword)
        || row.department.toLowerCase().includes(keyword)
      );
    });
  }, [rows, onlyNeedsReview, search]);

  const totals = useMemo(() => {
    return filteredRows.reduce(
      (acc, row) => ({
        baseSalary: acc.baseSalary + (row.baseSalary ?? 0),
        otAmount: acc.otAmount + (row.otAmount ?? 0),
        otherIncomeTotal: acc.otherIncomeTotal + row.otherIncomeTotal,
        incomeTotal: acc.incomeTotal + (row.incomeTotal ?? 0),
        taxAmount: acc.taxAmount + row.taxAmount,
        socialSecurityAmount: acc.socialSecurityAmount + row.socialSecurityAmount,
        otherDeductionsAmount: acc.otherDeductionsAmount + row.otherDeductionsAmount,
        netPay: acc.netPay + (row.netPay ?? 0),
      }),
      {
        baseSalary: 0,
        otAmount: 0,
        otherIncomeTotal: 0,
        incomeTotal: 0,
        taxAmount: 0,
        socialSecurityAmount: 0,
        otherDeductionsAmount: 0,
        netPay: 0,
      },
    );
  }, [filteredRows]);

  return (
    <Card className="min-w-0 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
        <div className="min-w-0">
          <h2 className="text-base font-semibold leading-6 text-foreground">ผลคำนวณรายบุคคล</h2>
          <p className="text-xs text-muted-foreground">
            แสดง {filteredRows.length.toLocaleString("th-TH")} จาก {rows.length.toLocaleString("th-TH")} รายการ · คลิกแถวเพื่อดูรายละเอียด
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-foreground">
            <Checkbox
              id="filter-needs-review"
              isSelected={onlyNeedsReview}
              onChange={(checked) => onOnlyNeedsReviewChange(Boolean(checked))}
            />
            <span>เฉพาะรายการที่ต้องตรวจสอบ</span>
          </label>
          <div className="w-full sm:w-52">
            <Input
              aria-label="ค้นหาพนักงาน"
              leadingIcon={RiSearchLine}
              placeholder="ค้นหา..."
              value={search}
              onChange={onSearchChange}
              className="[&_input]:h-9 [&_input]:text-xs"
            />
          </div>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>พนักงาน</TableHead>
            <TableHead className="text-right">เงินเดือน</TableHead>
            <TableHead className="text-right">OT</TableHead>
            <TableHead className="text-right">เงินได้อื่น</TableHead>
            <TableHead className="text-right">รวมเงินได้</TableHead>
            <TableHead className="text-right">ภาษี</TableHead>
            <TableHead className="text-right">ปกส.</TableHead>
            <TableHead className="text-right">หักอื่น</TableHead>
            <TableHead className="text-right">สุทธิ</TableHead>
            <TableHead className="text-center">ตรวจสอบ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={10} className="py-10 text-center text-sm text-muted-foreground">
                กำลังคำนวณเงินเดือนจากข้อมูลระบบ…
              </TableCell>
            </TableRow>
          ) : filteredRows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={10} className="py-10 text-center text-sm text-muted-foreground">
                {rows.length === 0 ? "ไม่พบพนักงานที่ปฏิบัติงานในงวดนี้" : "ไม่พบรายการที่ตรงกับเงื่อนไขการค้นหา"}
              </TableCell>
            </TableRow>
          ) : (
            filteredRows.map((row) => (
              <TableRow
                key={row.employeeId}
                onClick={() => onSelectRow?.(row)}
                className={cn(
                  "cursor-pointer",
                  row.hasBlockingIssue && "bg-status-danger/5 hover:bg-status-danger/10",
                )}
              >
                <TableCell>
                  <div className="flex min-w-44 items-center gap-2.5">
                    <Avatar
                      size="sm"
                      src={row.avatarUrl || undefined}
                      initials={getEmployeeInitials(row.name, row.code)}
                      color={getAvatarColor(row.code)}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate font-medium text-foreground">{row.name}</span>
                        {row.isNewHire ? <Badge color="info" variant="caption">เข้าใหม่</Badge> : null}
                        {row.isOffboarded ? <Badge color="neutral" variant="caption">พ้นสภาพ</Badge> : null}
                      </div>
                      <span className="block truncate text-xs text-muted-foreground">
                        {row.code} · {row.department || "ไม่ระบุแผนก"}
                      </span>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatMoney(row.baseSalary)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatMoney(row.otAmount)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatMoney(row.otherIncomeTotal)}</TableCell>
                <TableCell className="text-right font-medium tabular-nums">{formatMoney(row.incomeTotal)}</TableCell>
                <TableCell className={cn("text-right tabular-nums", row.taxAmount > 0 ? "text-status-danger" : "text-muted-foreground")}>
                  {formatMoney(row.taxAmount)}
                </TableCell>
                <TableCell className={cn("text-right tabular-nums", row.socialSecurityAmount > 0 ? "text-status-danger" : "text-muted-foreground")}>
                  {formatMoney(row.socialSecurityAmount)}
                </TableCell>
                <TableCell className={cn("text-right tabular-nums", row.otherDeductionsAmount > 0 ? "text-status-danger" : "text-muted-foreground")}>
                  {formatMoney(row.otherDeductionsAmount)}
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums text-foreground">
                  {formatMoney(row.netPay)}
                </TableCell>
                <TableCell className="text-center">
                  <ReviewCell row={row} onInspect={onSelectRow} />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
        {!loading && filteredRows.length > 0 ? (
          <TableFooter>
            <TableRow>
              <TableCell className="font-semibold text-foreground">
                รวม ({filteredRows.length.toLocaleString("th-TH")} คน)
              </TableCell>
              <TableCell className="text-right font-semibold tabular-nums">{formatMoney(totals.baseSalary)}</TableCell>
              <TableCell className="text-right font-semibold tabular-nums">{formatMoney(totals.otAmount)}</TableCell>
              <TableCell className="text-right font-semibold tabular-nums">{formatMoney(totals.otherIncomeTotal)}</TableCell>
              <TableCell className="text-right font-semibold tabular-nums">{formatMoney(totals.incomeTotal)}</TableCell>
              <TableCell className="text-right font-semibold tabular-nums text-status-danger">{formatMoney(totals.taxAmount)}</TableCell>
              <TableCell className="text-right font-semibold tabular-nums text-status-danger">{formatMoney(totals.socialSecurityAmount)}</TableCell>
              <TableCell className="text-right font-semibold tabular-nums text-status-danger">{formatMoney(totals.otherDeductionsAmount)}</TableCell>
              <TableCell className="text-right font-semibold tabular-nums text-foreground">{formatMoney(totals.netPay)}</TableCell>
              <TableCell />
            </TableRow>
          </TableFooter>
        ) : null}
      </Table>
    </Card>
  );
}
