"use client";

import { useMemo, useState } from "react";
import { RiArrowLeftSLine, RiArrowRightSLine, RiCalendarLine } from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { formatThaiDate } from "@/components/hrm/leave/leaveStatus";
import { getLeaveTypePresentation, LEAVE_TYPE_PRESENTATION } from "@/components/hrm/leave/leaveTypes";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const UNKNOWN_TONE = {
  surfaceClass: "bg-muted",
  textClass: "text-muted-foreground",
};

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function monthLabel(date) {
  return new Intl.DateTimeFormat("th-TH", { month: "long", year: "numeric" }).format(date);
}

function buildCalendarDays(month) {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  const dayCount = new Date(year, monthIndex + 1, 0).getDate();
  const cellCount = Math.ceil((firstWeekday + dayCount) / 7) * 7;

  return Array.from({ length: cellCount }, (_, index) => {
    const dayNumber = index - firstWeekday + 1;
    if (dayNumber < 1 || dayNumber > dayCount) return null;
    const date = new Date(year, monthIndex, dayNumber);
    return { date, key: dateKey(date), dayNumber };
  });
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
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState(() => dateKey(new Date()));
  const todayKey = dateKey(new Date());
  const days = useMemo(() => buildCalendarDays(month), [month]);
  const weeks = useMemo(() => Array.from({ length: days.length / 7 }, (_, index) => days.slice(index * 7, index * 7 + 7)), [days]);
  const selectedRequests = useMemo(() => requestsForDate(items, selectedDate), [items, selectedDate]);

  function changeMonth(offset) {
    const next = new Date(month.getFullYear(), month.getMonth() + offset, 1);
    setMonth(next);
    setSelectedDate(dateKey(next));
  }

  return (
    <section className="min-w-0 overflow-hidden rounded-xl border border-border bg-card shadow-sm" aria-labelledby="leave-calendar-heading">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
        <div>
          <h2 id="leave-calendar-heading" className="text-base font-semibold leading-6 text-foreground sm:text-lg">{isTeamView ? "ปฏิทินการลาของทีม" : "ปฏิทินวันลาของฉัน"}</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">แสดงรายการที่อนุมัติแล้วและกำลังรออนุมัติ</p>
        </div>
        <div className="flex min-h-10 items-center gap-2">
          <Button size="icon" variant="outline" aria-label="เดือนก่อนหน้า" onClick={() => changeMonth(-1)} className="size-10">
            <RiArrowLeftSLine aria-hidden="true" />
          </Button>
          <span className="min-w-32 text-center text-sm font-semibold text-foreground" aria-live="polite">{monthLabel(month)}</span>
          <Button size="icon" variant="outline" aria-label="เดือนถัดไป" onClick={() => changeMonth(1)} className="size-10">
            <RiArrowRightSLine aria-hidden="true" />
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto p-3 sm:p-4">
        <div className="min-w-[490px]">
          <div role="group" aria-label={`ปฏิทินเดือน${monthLabel(month)}`}>
            <div className="mb-2 grid grid-cols-7">
              {WEEKDAYS.map((weekday) => (
                <div key={weekday} className="py-2 text-center text-[11px] font-medium text-muted-foreground">{weekday}</div>
              ))}
            </div>
            {weeks.map((week, weekIndex) => (
              <div key={`week-${weekIndex}`} className="mb-1.5 grid grid-cols-7 gap-1.5 last:mb-0">
                {week.map((day, dayIndex) => {
                  if (!day) return <div key={`empty-${weekIndex}-${dayIndex}`} aria-hidden="true" className="min-h-24 rounded-lg border border-transparent sm:min-h-28" />;
                  const dayRequests = requestsForDate(items, day.key);
                  const isSelected = selectedDate === day.key;
                  const isToday = todayKey === day.key;

                  return (
                    <div
                      key={day.key}
                      className={cn(
                        "min-h-24 min-w-0 rounded-lg border p-1.5 transition-colors sm:min-h-28 sm:p-2",
                        isSelected ? "border-primary ring-1 ring-primary/30" : "border-border",
                        isToday && !isSelected && "bg-primary/5",
                      )}
                    >
                      <button
                        type="button"
                        aria-label={formatThaiDate(day.key)}
                        aria-pressed={isSelected}
                        aria-current={isToday ? "date" : undefined}
                        onClick={() => setSelectedDate(day.key)}
                        className={cn(
                          "grid size-10 place-items-center rounded-full text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          isToday ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted",
                        )}
                      >
                        {day.dayNumber}
                      </button>
                      <div className="mt-1 space-y-1">
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
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
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
