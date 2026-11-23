"use client";

import { Card } from "@/components/ui/card";
import { formatCompactBaht } from "./payrollFormat";

const RADIUS = 58;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function PayrollCostDonutCard({ summary, loading = false }) {
  const breakdown = summary?.costBreakdown ?? {
    baseSalary: 0,
    overtime: 0,
    incentives: 0,
    allowances: 0,
    employerContributions: 0,
    total: 0,
  };

  const segments = [
    { key: "baseSalary", label: "เงินเดือนฐาน", value: breakdown.baseSalary, color: "var(--chart-1)" },
    { key: "overtime", label: "OT", value: breakdown.overtime, color: "var(--chart-4)" },
    { key: "incentives", label: "ค่าคอม/โบนัส", value: breakdown.incentives, color: "var(--chart-2)" },
    { key: "allowances", label: "สวัสดิการ/เบี้ยเลี้ยง", value: breakdown.allowances, color: "var(--chart-5)" },
    { key: "employerContributions", label: "ปกส. นายจ้าง", value: breakdown.employerContributions, color: "var(--chart-3)" },
  ];

  const total = breakdown.total > 0
    ? breakdown.total
    : segments.reduce((sum, item) => sum + item.value, 0);
  const useMillions = total >= 1_000_000;

  let cumulativeLength = 0;
  const arcs = total > 0
    ? segments
        .filter((segment) => segment.value > 0)
        .map((segment) => {
          const length = (segment.value / total) * CIRCUMFERENCE;
          const dashOffset = -cumulativeLength;
          cumulativeLength += length;
          return {
            ...segment,
            dashArray: `${Math.max(length - 1.5, 0.5)} ${CIRCUMFERENCE}`,
            dashOffset,
          };
        })
    : [];

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">
          {useMillions ? "โครงสร้างต้นทุน (ล้านบาท)" : "โครงสร้างต้นทุน (บาท)"}
        </h2>
        <span className="text-xs text-muted-foreground tabular-nums">
          {loading ? "…" : formatCompactBaht(total)}
        </span>
      </div>

      <div className="mt-4 flex flex-col items-center">
        <div className="relative size-40">
          <svg viewBox="0 0 160 160" className="size-full -rotate-90" role="img" aria-label="แผนภูมิโครงสร้างต้นทุนเงินเดือน">
            <circle
              cx="80"
              cy="80"
              r={RADIUS}
              fill="none"
              stroke="var(--border)"
              strokeWidth="20"
            />
            {arcs.map((arc) => (
              <circle
                key={arc.key}
                cx="80"
                cy="80"
                r={RADIUS}
                fill="none"
                stroke={arc.color}
                strokeWidth="20"
                strokeDasharray={arc.dashArray}
                strokeDashoffset={arc.dashOffset}
              />
            ))}
          </svg>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-[11px] text-muted-foreground">ต้นทุนรวม</span>
            <span className="text-sm font-semibold tabular-nums text-foreground">
              {loading ? "—" : formatCompactBaht(total)}
            </span>
          </div>
        </div>

        <ul className="mt-4 grid w-full grid-cols-2 gap-x-3 gap-y-2 text-xs">
          {segments.map((segment) => {
            const percent = total > 0 ? Math.round((segment.value / total) * 100) : 0;
            return (
              <li key={segment.key} className="flex min-w-0 items-center justify-between gap-1.5">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: segment.color }}
                    aria-hidden="true"
                  />
                  <span className="truncate text-muted-foreground">{segment.label}</span>
                </span>
                <span className="shrink-0 font-medium tabular-nums text-foreground">
                  {total > 0 ? `${percent}%` : "0%"}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </Card>
  );
}
