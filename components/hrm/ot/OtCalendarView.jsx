"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Calendar, CalendarNavigation } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Select, SelectItem } from "@/components/ui/select";
import { Chip } from "@/components/ui/badge";
import { HrmDialog } from "@/components/hrm/HrmDialog";
import { currentMonthInBangkok, formatMonthLabel, shiftMonth, statusColor } from "@/components/hrm/ot/otStatus";
import { cn } from "@/lib/utils";

const MONTH_OPTIONS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];
const YEAR_OPTIONS = Array.from({ length: 151 }, (_, index) => 1950 + index);

export function OtCalendarView({ refreshKey = 0 }) {
  const [month, setMonth] = useState(() => currentMonthInBangkok());
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [draftMonth, setDraftMonth] = useState(() => currentMonthInBangkok().slice(5));
  const [draftYear, setDraftYear] = useState(() => currentMonthInBangkok().slice(0, 4));
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedDate, setSelectedDate] = useState(null);
  const monthPickerRef = useRef(null);
  const monthPickerTriggerRef = useRef(null);

  useEffect(() => {
    if (!monthPickerOpen) return undefined;

    function handlePointerDown(event) {
      const target = event.target;
      if (monthPickerRef.current?.contains(target)) return;
      // The shared Select renders its option list in a Radix portal.
      if (target instanceof Element && target.closest("[data-radix-popper-content-wrapper]")) return;
      setMonthPickerOpen(false);
    }

    function handleKeyDown(event) {
      if (event.key !== "Escape") return;
      setMonthPickerOpen(false);
      monthPickerTriggerRef.current?.focus();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [monthPickerOpen]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    fetch(`/api/ot?month=${month}&status=all`)
      .then((response) => {
        if (!response.ok) throw new Error("failed to load");
        return response.json();
      })
      .then((payload) => {
        if (!cancelled) setItems(payload.items || []);
      })
      .catch(() => {
        if (!cancelled) setError("ไม่สามารถโหลดข้อมูล OT ได้");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [month, refreshKey]);

  const itemsByDate = useMemo(() => {
    const map = new Map();
    for (const item of items) {
      if (!map.has(item.date)) map.set(item.date, []);
      map.get(item.date).push(item);
    }
    return map;
  }, [items]);

  const selectedItems = selectedDate ? itemsByDate.get(selectedDate.toString()) || [] : [];

  function toggleMonthPicker() {
    if (monthPickerOpen) {
      setMonthPickerOpen(false);
      return;
    }
    setDraftYear(month.slice(0, 4));
    setDraftMonth(month.slice(5));
    setMonthPickerOpen(true);
  }

  function applyMonthSelection() {
    setMonth(`${draftYear}-${draftMonth}`);
    setMonthPickerOpen(false);
    monthPickerTriggerRef.current?.focus();
  }

  return (
    <section className="relative min-w-0 rounded-xl border border-border bg-card shadow-sm" aria-labelledby="ot-calendar-heading">
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
        <div>
          <p className="text-xs font-semibold leading-4 uppercase tracking-[0.08em] text-muted-foreground">ตารางเวลาทำงาน</p>
          <h2 id="ot-calendar-heading" className="mt-1 text-base font-semibold leading-6 text-foreground sm:text-lg">ปฏิทิน OT</h2>
        </div>
        <CalendarNavigation
          monthLabel={formatMonthLabel(month)}
          onPreviousMonth={() => setMonth((current) => shiftMonth(current, -1))}
          onNextMonth={() => setMonth((current) => shiftMonth(current, 1))}
          monthControl={(
          <div className="relative" ref={monthPickerRef}>
            <Button
              ref={monthPickerTriggerRef}
              type="button"
              variant="outline"
              aria-label="เลือกเดือนและปี"
              aria-haspopup="dialog"
              aria-expanded={monthPickerOpen}
              onClick={toggleMonthPicker}
              className="min-h-10 min-w-40 justify-center border-border bg-card px-4 text-sm font-semibold text-foreground shadow-xs"
            >
              {formatMonthLabel(month)}
            </Button>
            {monthPickerOpen ? (
              <div
                role="dialog"
                aria-label="เลือกเดือนและปี"
                className="absolute left-1/2 top-full z-20 mt-2 w-72 -translate-x-1/2 rounded-xl border border-border bg-popover p-4 text-popover-foreground shadow-lg"
              >
                <div className="grid grid-cols-2 gap-3">
                  <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
                    <span>เดือน</span>
                    <Select aria-label="เดือน" selectedKey={draftMonth} onSelectionChange={setDraftMonth}>
                      {MONTH_OPTIONS.map((name, index) => {
                        const value = String(index + 1).padStart(2, "0");
                        return <SelectItem id={value} key={value}>{name}</SelectItem>;
                      })}
                    </Select>
                  </label>
                  <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
                    <span>ปี พ.ศ.</span>
                    <Select aria-label="ปี พ.ศ." selectedKey={draftYear} onSelectionChange={setDraftYear}>
                      {YEAR_OPTIONS.map((year) => <SelectItem id={String(year)} key={year}>{year + 543}</SelectItem>)}
                    </Select>
                  </label>
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setMonthPickerOpen(false);
                      monthPickerTriggerRef.current?.focus();
                    }}
                  >
                    ยกเลิก
                  </Button>
                  <Button type="button" onClick={applyMonthSelection}>แสดงเดือน</Button>
                </div>
              </div>
            ) : null}
          </div>
          )}
        />
      </div>
      {error ? <p className="px-4 pt-3 text-xs leading-5 text-status-danger sm:px-5">{error}</p> : null}
      <div className="overflow-x-auto p-3 sm:p-4">
        <Calendar
          month={month}
          ariaLabel={`ปฏิทินเดือน${formatMonthLabel(month)}`}
          selectedDate={selectedDate}
          className="min-w-[490px] overflow-hidden rounded-b-xl"
          renderDay={({ date, isSelected, isToday }) => {
            if (!date) return <div className="min-h-20 bg-muted/30" aria-hidden="true" />;
            const dayItems = itemsByDate.get(date.toString()) || [];
            return (
              <button
                type="button"
                disabled={dayItems.length === 0}
                aria-pressed={isSelected}
                aria-current={isToday ? "date" : undefined}
                onClick={() => setSelectedDate(date)}
                className={cn(
                  "flex min-h-20 w-full flex-col items-start gap-1 p-1.5 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:hover:bg-transparent",
                  isSelected && "bg-primary/5 ring-1 ring-inset ring-primary/40",
                )}
              >
                <span className={cn("text-[11px] leading-4", isToday ? "font-semibold text-primary" : "text-muted-foreground")}>{date.day}</span>
                <div className="flex flex-wrap gap-1">
                  {dayItems.slice(0, 2).map((item) => (
                    <Chip key={item.id} variant="caption" color={statusColor(item.statusCode)}>{item.startTime}</Chip>
                  ))}
                  {dayItems.length > 2 ? <span className="text-[10px] leading-4 text-muted-foreground">+{dayItems.length - 2}</span> : null}
                </div>
              </button>
            );
          }}
        />
      </div>
      {loading ? <p className="px-4 pb-4 text-xs leading-5 text-muted-foreground">กำลังโหลดข้อมูล...</p> : null}
      <HrmDialog
        open={Boolean(selectedDate)}
        onClose={() => setSelectedDate(null)}
        size="sm"
        title={selectedDate ? `รายการ OT วันที่ ${selectedDate.toString()}` : ""}
        description={selectedItems.length ? `${selectedItems.length} รายการ` : undefined}
      >
        <div className="space-y-3">
          {selectedItems.map((item) => (
            <div className="rounded-lg border border-border p-3" key={item.id}>
              <div className="flex items-center justify-between gap-2">
                <strong className="text-xs font-medium leading-5 text-foreground">{item.employeeName}</strong>
                <Chip variant="caption" color={statusColor(item.statusCode)}>{item.statusName}</Chip>
              </div>
              <p className="mt-1 text-xs leading-4 text-muted-foreground">{item.startTime} – {item.endTime} · {item.durationHours} ชม.</p>
              <p className="mt-1 text-xs leading-4 text-muted-foreground">{item.reason}</p>
            </div>
          ))}
        </div>
      </HrmDialog>
    </section>
  );
}

export default OtCalendarView;
