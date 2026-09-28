"use client";

import { useMemo, useState } from "react";
import { CalendarDate, getLocalTimeZone, today } from "@internationalized/date";
import { RiCalendarLine } from "@remixicon/react";
import { Calendar, CalendarNavigation } from "@/components/ui/calendar";
import { formatThaiDate } from "@/components/hrm/leave/leaveStatus";
import { getLeaveTypePresentation, LEAVE_TYPE_PRESENTATION } from "@/components/hrm/leave/leaveTypes";
import { cn } from "@/lib/utils";

const UNKNOWN_TONE = {
  surfaceClass: "bg-muted",
  textClass: "text-muted-foreground",
};

function currentDate() {
  return today(getLocalTimeZone());
}

function monthLabel(date) {
  return new Intl.DateTimeFormat("th-TH-u-ca-buddhist", { month: "long", year: "numeric", timeZone: "UTC" }).format(date.toDate("UTC"));
}

function requestsForDate(items, key) {
  return items.filter(
    (item) =>
      (item.statusCode === "approved" || item.statusCode === "pending") &&
      item.startOn <= key &&
      item.endOn >= key,
  );
}

export function LeaveCalendarView({ items = [], isTeamView = false }) {
  const [month, setMonth] = useState(() => {
    const current = currentDate();
    return new CalendarDate(current.year, current.month, 1);
  });
  const [selectedDate, setSelectedDate] = useState(() => currentDate().toString());
  const todayDate = currentDate();
  const selectedRequests = useMemo(() => requestsForDate(items, selectedDate), [items, selectedDate]);

  function changeMonth(offset) {
    const next = new CalendarDate(month.year, month.month, 1).add({ months: offset });
    setMonth(next);
    setSelectedDate(next.toString());
  }

  return (
    <section className="min-w-0 overflow-hidden rounded-xl border border-border bg-card shadow-sm" aria-labelledby="leave-calendar-heading">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
        <div>
          <h2 id="leave-calendar-heading" className="text-base font-semibold leading-6 text-foreground sm:text-lg">{isTeamView ? "ปฏิทินการลาของทีม" : "ปฏิทินวันลาของฉัน"}</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">แสดงรายการที่อนุมัติแล้วและกำลังรออนุมัติ</p>
        </div>
        <CalendarNavigation monthLabel={monthLabel(month)} onPreviousMonth={() => changeMonth(-1)} onNextMonth={() => changeMonth(1)} />
      </div>

      <div className="overflow-x-auto p-3 sm:p-4">
        <Calendar
          month={month}
          ariaLabel={`ปฏิทินเดือน${monthLabel(month)}`}
          todayDate={todayDate}
          selectedDate={selectedDate}
          className="min-w-[490px] overflow-hidden rounded-b-xl"
          renderEmptyDay={() => <div aria-hidden="true" className="min-h-20 bg-muted/30" />}
          renderDay={({ date, dateKey, isSelected, isToday }) => {
            const dayRequests = requestsForDate(items, dateKey);
            return (
              <button
                type="button"
                aria-label={formatThaiDate(dateKey)}
                aria-pressed={isSelected}
                aria-current={isToday ? "date" : undefined}
                onClick={() => setSelectedDate(dateKey)}
                className={cn(
                  "flex min-h-20 w-full flex-col items-start gap-1 p-1.5 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isSelected && "bg-primary/5 ring-1 ring-inset ring-primary/40",
                )}
              >
                <span className={cn("text-[11px] leading-4", isToday ? "font-semibold text-primary" : "text-muted-foreground")}>{date.day}</span>
                <div className="mt-1 w-full space-y-1">
                  {dayRequests.slice(0, 2).map((item) => {
                    const tone = getLeaveTypePresentation(item.leaveTypeCode) || UNKNOWN_TONE;
                    return (
                      <div
                        key={item.id}
                        title={`${item.employeeName} · ${item.leaveTypeName}`}
                        className={cn(
                          "truncate rounded px-1 py-0.5 text-[10px] leading-4",
                          tone.surfaceClass,
                          tone.textClass,
                          item.statusCode === "pending" && "border border-dashed border-current/40",
                        )}
                      >
                        {item.employeeName}
                      </div>
                    );
                  })}
                  {dayRequests.length > 2 ? <p className="px-1 text-[10px] leading-4 text-muted-foreground">+{dayRequests.length - 2} รายการ</p> : null}
                </div>
              </button>
            );
          }}
        />
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-2 border-t border-border px-4 py-3 sm:px-5">
        {LEAVE_TYPE_PRESENTATION.map((type) => (
          <span key={type.code} className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <span className={cn("size-2.5 rounded-sm", type.dotClass)} aria-hidden="true" />{type.name}
          </span>
        ))}
        <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
          <span className="size-2.5 rounded-sm border border-dashed border-muted-foreground" aria-hidden="true" />รออนุมัติ
        </span>
      </div>

      <div className="flex items-start gap-3 border-t border-border bg-muted/30 px-4 py-3 sm:px-5">
        <RiCalendarLine className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0 text-xs leading-5">
          <p className="font-medium text-foreground">{formatThaiDate(selectedDate)}</p>
          {selectedRequests.length > 0 ? (
            <p className="mt-0.5 text-muted-foreground">{selectedRequests.map((item) => `${item.employeeName} · ${item.leaveTypeName}`).join(" / ")}</p>
          ) : (
            <p className="mt-0.5 text-muted-foreground">ไม่มีรายการลาในวันนี้</p>
          )}
        </div>
      </div>
    </section>
  );
}

export default LeaveCalendarView;
