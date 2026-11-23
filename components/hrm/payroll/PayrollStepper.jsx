"use client";

import {
  RiCalculatorLine,
  RiCheckLine,
  RiDatabase2Line,
  RiLock2Line,
  RiSearchEyeLine,
  RiSendPlaneLine,
  RiShieldCheckLine,
} from "@remixicon/react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

function resolveStepStates(payroll) {
  const status = payroll?.workflow?.status ?? "review";
  const rowCount = payroll?.rows?.length ?? 0;
  const blockingCount = payroll?.summary?.blockingCount ?? 0;

  const collectDone = rowCount > 0;
  const calcDone = rowCount > 0 && blockingCount === 0;

  const isAfterReview = status === "pending_approval" || status === "approved" || status === "locked" || status === "paid";
  const isAfterApproval = status === "approved" || status === "locked" || status === "paid";
  const isAfterLock = status === "locked" || status === "paid";
  const isPaid = status === "paid";

  return [
    {
      key: "collect",
      label: "รวบรวมข้อมูล",
      icon: RiDatabase2Line,
      state: collectDone ? "done" : "active",
      sublabel: collectDone ? "เสร็จแล้ว" : "รอข้อมูล",
    },
    {
      key: "calculate",
      label: "คำนวณ",
      icon: RiCalculatorLine,
      state: calcDone ? "done" : collectDone ? "active" : "pending",
      sublabel: calcDone ? "เสร็จแล้ว" : collectDone ? "ข้อมูลไม่ครบ" : "รอ",
    },
    {
      key: "review",
      label: "ตรวจสอบ",
      icon: RiSearchEyeLine,
      state: isAfterReview ? "done" : calcDone ? "active" : "pending",
      sublabel: isAfterReview ? "เสร็จแล้ว" : calcDone ? "กำลังดำเนินการ" : "รอ",
    },
    {
      key: "approve",
      label: "อนุมัติ",
      icon: RiShieldCheckLine,
      state: isAfterApproval ? "done" : status === "pending_approval" ? "active" : "pending",
      sublabel: isAfterApproval ? "อนุมัติแล้ว" : status === "pending_approval" ? "รออนุมัติ" : "รอ",
    },
    {
      key: "lock",
      label: "ล็อกงวด",
      icon: RiLock2Line,
      state: isAfterLock ? "done" : status === "approved" ? "active" : "pending",
      sublabel: isAfterLock ? "ล็อกแล้ว" : status === "approved" ? "พร้อมล็อก" : "รอ",
    },
    {
      key: "pay",
      label: "จ่าย & สลิป",
      icon: RiSendPlaneLine,
      state: isPaid ? "done" : status === "locked" ? "active" : "pending",
      sublabel: isPaid ? "จ่ายแล้ว" : status === "locked" ? "พร้อมจ่าย" : "รอ",
    },
  ];
}

export function PayrollStepper({ payroll }) {
  const steps = resolveStepStates(payroll);

  return (
    <Card className="p-4">
      <div className="overflow-x-auto">
        <ol
          aria-label="ขั้นตอนการทำเงินเดือนประจำงวด"
          className="flex min-w-[680px] items-center justify-between gap-2"
        >
          {steps.map((step, index) => {
            const Icon = step.state === "done" ? RiCheckLine : step.icon;
            const isLast = index === steps.length - 1;
            const prevDone = step.state === "done";

            return (
              <li
                key={step.key}
                aria-current={step.state === "active" ? "step" : undefined}
                className={cn("flex items-center gap-2.5", !isLast && "flex-1")}
              >
                <div className="flex shrink-0 items-center gap-2.5">
                  <span
                    className={cn(
                      "grid size-8 shrink-0 place-items-center rounded-full border text-sm transition-colors",
                      step.state === "done" && "border-status-success/40 bg-status-success/15 text-status-success",
                      step.state === "active" && "border-primary bg-primary text-primary-foreground",
                      step.state === "pending" && "border-border bg-muted text-muted-foreground",
                    )}
                  >
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p
                      className={cn(
                        "whitespace-nowrap text-xs font-semibold leading-4",
                        step.state === "pending" ? "text-muted-foreground" : "text-foreground",
                      )}
                    >
                      {step.label}
                    </p>
                    <p
                      className={cn(
                        "whitespace-nowrap text-[11px] leading-4",
                        step.state === "done" && "text-status-success",
                        step.state === "active" && "text-primary",
                        step.state === "pending" && "text-muted-foreground",
                      )}
                    >
                      {step.sublabel}
                    </p>
                  </div>
                </div>
                {!isLast ? (
                  <div
                    aria-hidden="true"
                    className={cn(
                      "h-0.5 min-w-4 flex-1 rounded-full",
                      prevDone ? "bg-status-success/40" : "bg-border",
                    )}
                  />
                ) : null}
              </li>
            );
          })}
        </ol>
      </div>
    </Card>
  );
}
