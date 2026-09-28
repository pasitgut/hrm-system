"use client";

import { CalendarDate, endOfMonth, getDayOfWeek, getLocalTimeZone, today } from "@internationalized/date";
import { RiArrowLeftSLine, RiArrowRightSLine } from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { cx } from "@/utils/cx";

export const THAI_WEEKDAYS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

function firstOfMonth(month) {
  if (typeof month === "string") {
    const [year, monthNumber] = month.split("-").map(Number);
    return new CalendarDate(year, monthNumber, 1);
  }
  return new CalendarDate(month.year, month.month, 1);
}

function toDateKey(date) {
  if (!date) return "";
  return typeof date === "string" ? date : date.toString();
}

function buildCalendarWeeks(month) {
  const first = firstOfMonth(month);
  const daysInMonth = endOfMonth(first).day;
  const leadingBlanks = getDayOfWeek(first, "en-US");
  const totalCells = Math.ceil((leadingBlanks + daysInMonth) / 7) * 7;
  const cells = Array.from({ length: totalCells }, (_, index) => {
    const day = index - leadingBlanks + 1;
    return day < 1 || day > daysInMonth ? null : new CalendarDate(first.year, first.month, day);
  });

  return Array.from({ length: totalCells / 7 }, (_, index) => cells.slice(index * 7, index * 7 + 7));
}

export function Calendar({
  month,
  ariaLabel,
  gridRef,
  weekdayLabels = THAI_WEEKDAYS,
  selectedDate,
  compact = false,
  todayDate = today(getLocalTimeZone()),
  renderDay,
  renderEmptyDay,
  className,
  weekdayRowClassName,
  weekdayClassName,
  weeksClassName,
  weekClassName,
  cellClassName,
}) {
  const selectedKey = toDateKey(selectedDate);
  const todayKey = toDateKey(todayDate);
  const weeks = buildCalendarWeeks(month);

  return (
    <div ref={gridRef} role="grid" aria-label={ariaLabel} className={cx(compact ? "grid min-w-0 gap-y-1" : "grid min-w-0", className)}>
      <div
        role="row"
        className={cx(
          "grid grid-cols-7",
          compact ? "" : "border-b border-border bg-muted text-center text-[11px] font-semibold leading-4 text-muted-foreground",
          weekdayRowClassName,
        )}
      >
        {weekdayLabels.map((weekday) => (
          <div
            key={weekday}
            role="columnheader"
            className={cx(
              compact ? "grid h-8 place-items-center text-[11px] font-medium text-muted-foreground" : "py-2",
              weekdayClassName,
            )}
          >
            {weekday}
          </div>
        ))}
      </div>
      <div className={cx(compact ? "grid gap-1" : "divide-y divide-border", weeksClassName)}>
        {weeks.map((week, weekIndex) => (
          <div key={`week-${weekIndex}`} role="row" className={cx("grid grid-cols-7", compact ? "gap-1" : "divide-x divide-border", weekClassName)}>
            {week.map((date, dayIndex) => {
              const dateKey = toDateKey(date);
              const cellProps = {
                date,
                dateKey,
                day: date?.day ?? null,
                isToday: Boolean(date && dateKey === todayKey),
                isSelected: Boolean(date && dateKey === selectedKey),
              };

              return (
                <div
                  key={dateKey || `empty-${weekIndex}-${dayIndex}`}
                  role="gridcell"
                  aria-selected={cellProps.isSelected || undefined}
                  className={cx("min-w-0", cellClassName)}
                >
                  {date ? renderDay?.(cellProps) : renderEmptyDay?.(cellProps)}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export function CalendarNavigation({
  monthLabel,
  monthControl,
  onPreviousMonth,
  onNextMonth,
  compact = false,
  className,
}) {
  const buttonSize = compact ? "size-8" : "size-10";
  const buttonVariant = compact ? "ghost" : "outline";

  return (
    <div className={cx("flex min-h-10 items-center gap-2", className)}>
      <Button type="button" size="icon" variant={buttonVariant} className={buttonSize} aria-label="เดือนก่อนหน้า" onClick={onPreviousMonth}>
        <RiArrowLeftSLine aria-hidden="true" />
      </Button>
      {monthControl || (
        <span className="min-w-32 text-center text-sm font-semibold text-foreground" aria-live="polite">
          {monthLabel}
        </span>
      )}
      <Button type="button" size="icon" variant={buttonVariant} className={buttonSize} aria-label="เดือนถัดไป" onClick={onNextMonth}>
        <RiArrowRightSLine aria-hidden="true" />
      </Button>
    </div>
  );
}
