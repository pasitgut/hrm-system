"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Calendar, CalendarNavigation } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Select, SelectItem } from "@/components/ui/select";
import { Tabs, Tab, TabList, TabPanel } from "@/components/ui/tabs";
import { Chip } from "@/components/ui/badge";
import { HrmDialog } from "@/components/hrm/HrmDialog";
import { currentMonthInBangkok, formatMonthLabel, shiftMonth, statusColor } from "@/components/hrm/ot/otStatus";
import { cn } from "@/lib/utils";

const MONTH_OPTIONS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];
const YEAR_OPTIONS = Array.from({ length: 151 }, (_, index) => 1950 + index);
const DATE_FORMAT_OPTIONS = { day: "numeric", month: "short", year: "numeric" };

function currentDateInBangkok() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return values.year + "-" + values.month + "-" + values.day;
}

function toUtcDate(dateKey) {
  return new Date(dateKey + "T12:00:00Z");
}

function shiftDate(dateKey, days) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function shiftCursorDate(dateKey, view, delta) {
  if (view === "daily") return shiftDate(dateKey, delta);
  if (view === "weekly") return shiftDate(dateKey, delta * 7);

  const targetMonth = shiftMonth(dateKey.slice(0, 7), delta);
  const [year, month] = targetMonth.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const day = Math.min(Number(dateKey.slice(8, 10)), lastDay);
  return targetMonth + "-" + String(day).padStart(2, "0");
}

function getViewPeriod(view, dateKey) {
  if (view === "daily") return { start: dateKey, end: dateKey };
  if (view === "weekly") {
    const weekday = toUtcDate(dateKey).getUTCDay();
    const start = shiftDate(dateKey, -weekday);
    return { start, end: shiftDate(start, 6) };
  }

  const [year, month] = dateKey.slice(0, 7).split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    start: dateKey.slice(0, 7) + "-01",
    end: dateKey.slice(0, 7) + "-" + String(lastDay).padStart(2, "0"),
  };
}

function getMonthKeys(period) {
  const months = [period.start.slice(0, 7)];
  const lastMonth = period.end.slice(0, 7);
  while (months[months.length - 1] < lastMonth) {
    months.push(shiftMonth(months[months.length - 1], 1));
  }
  return months;
}

function getDateKeys(period) {
  const dates = [];
  for (let date = period.start; date <= period.end; date = shiftDate(date, 1)) {
    dates.push(date);
  }
  return dates;
}

function formatThaiDate(dateKey, options = DATE_FORMAT_OPTIONS) {
  return new Intl.DateTimeFormat("th-TH", { ...options, timeZone: "UTC" }).format(toUtcDate(dateKey));
}

function formatPeriodLabel(view, dateKey, period) {
  if (view === "monthly") return formatMonthLabel(dateKey.slice(0, 7));
  if (view === "daily") return formatThaiDate(dateKey);

  const formatter = new Intl.DateTimeFormat("th-TH", { ...DATE_FORMAT_OPTIONS, timeZone: "UTC" });
  if (typeof formatter.formatRange === "function") {
    return formatter.formatRange(toUtcDate(period.start), toUtcDate(period.end));
  }
  return formatter.format(toUtcDate(period.start)) + " – " + formatter.format(toUtcDate(period.end));
}

function OtAgendaItem({ item }) {
  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <strong className="block break-words text-sm font-medium leading-5 text-foreground">{item.employeeName}</strong>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            <time>{item.startTime}</time> – <time>{item.endTime}</time> · {item.durationHours} ชม.
          </p>
        </div>
        <Chip variant="caption" color={statusColor(item.statusCode)}>{item.statusName}</Chip>
      </div>
      <p className="mt-2 break-words text-xs leading-5 text-muted-foreground">{item.reason}</p>
    </li>
  );
}

function OtAgenda({ dates, itemsByDate, loading }) {
  return (
    <div className="px-4 py-2 sm:px-5">
      <div className="divide-y divide-border border-y border-border">
        {dates.map((date) => {
          const dateItems = [...(itemsByDate.get(date) || [])].sort((a, b) => a.startTime.localeCompare(b.startTime));
          return (
            <section key={date} className="py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <h3 className="text-sm font-semibold leading-5 text-foreground">
                  {formatThaiDate(date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                </h3>
                <span className="text-xs leading-5 text-muted-foreground">{dateItems.length} รายการ</span>
              </div>
              {dateItems.length ? (
                <ul className="mt-3 divide-y divide-border">
                  {dateItems.map((item) => <OtAgendaItem key={item.id} item={item} />)}
                </ul>
              ) : loading ? null : <p className="mt-2 text-xs leading-5 text-muted-foreground">ไม่มีรายการ OT</p>}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function OtWeekGrid({ dates, itemsByDate, loading }) {
  return (
    <div
      className="overflow-x-auto p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-4"
      role="region"
      aria-label="ตาราง OT รายสัปดาห์ เลื่อนแนวนอนเพื่อดูครบ 7 วัน"
      tabIndex={0}
    >
      <div className="grid min-w-[700px] grid-cols-7 divide-x divide-border overflow-hidden rounded-md border border-border">
        {dates.map((date) => {
          const dayItems = [...(itemsByDate.get(date) || [])].sort((a, b) => a.startTime.localeCompare(b.startTime));
          return (
            <section key={date} className="min-w-0">
              <header className="min-h-[68px] border-b border-border bg-muted/50 px-2 py-2">
                <span className="block text-[11px] leading-4 text-muted-foreground">
                  {formatThaiDate(date, { weekday: "short" })}
                </span>
                <h3 className="mt-0.5 text-xs font-semibold leading-4 text-foreground">
                  {formatThaiDate(date, { day: "numeric", month: "short" })}
                </h3>
                <p className="mt-0.5 text-[10px] leading-4 text-muted-foreground">{dayItems.length} รายการ</p>
              </header>
              <div className="min-h-28 px-2">
                {dayItems.map((item) => (
                  <article key={item.id} className="border-b border-border py-2 last:border-b-0">
                    <p className="text-[11px] font-semibold leading-4 tabular-nums text-foreground">
                      <time>{item.startTime}</time>–<time>{item.endTime}</time>
                    </p>
                    <p className="mt-0.5 text-[10px] leading-4 text-muted-foreground">{item.durationHours} ชม.</p>
                    <p className="mt-1 break-words text-[11px] leading-4 text-foreground">{item.employeeName}</p>
                    <Chip
                      variant="caption"
                      color={statusColor(item.statusCode)}
                      className="mt-1 max-w-full whitespace-normal break-words"
                    >
                      {item.statusName}
                    </Chip>
                    <p className="mt-1 break-words text-[10px] leading-4 text-muted-foreground" title={item.reason}>
                      {item.reason}
                    </p>
                  </article>
                ))}
                {!loading && dayItems.length === 0 ? (
                  <p className="py-3 text-[11px] leading-4 text-muted-foreground">ไม่มี OT</p>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

export function OtCalendarView({ refreshKey = 0 }) {
  const [cursorDate, setCursorDate] = useState(() => currentDateInBangkok());
  const [view, setView] = useState("monthly");
  const month = cursorDate.slice(0, 7);
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [draftMonth, setDraftMonth] = useState(() => currentMonthInBangkok().slice(5));
  const [draftYear, setDraftYear] = useState(() => currentMonthInBangkok().slice(0, 4));
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedDate, setSelectedDate] = useState(null);
  const monthPickerRef = useRef(null);
  const monthPickerTriggerRef = useRef(null);
  const period = useMemo(() => getViewPeriod(view, cursorDate), [view, cursorDate]);
  const monthKey = getMonthKeys(period).join(",");
  const dates = view === "monthly" ? [] : getDateKeys(period);

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
    Promise.all(monthKey.split(",").map((requestedMonth) => (
      fetch("/api/ot?month=" + requestedMonth + "&status=all").then((response) => {
        if (!response.ok) throw new Error("failed to load");
        return response.json();
      })
    )))
      .then((payloads) => {
        if (!cancelled) setItems(payloads.flatMap((payload) => payload.items || []));
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
  }, [monthKey, refreshKey]);

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
    setCursorDate(draftYear + "-" + draftMonth + "-01");
    setSelectedDate(null);
    setMonthPickerOpen(false);
    monthPickerTriggerRef.current?.focus();
  }

  function movePeriod(delta) {
    setCursorDate((current) => shiftCursorDate(current, view, delta));
    setSelectedDate(null);
  }

  function changeView(nextView) {
    setMonthPickerOpen(false);
    setView(nextView);
    setSelectedDate(null);
  }

  const periodLabel = formatPeriodLabel(view, cursorDate, period);
  const previousLabel = view === "daily" ? "วันก่อนหน้า" : view === "weekly" ? "สัปดาห์ก่อนหน้า" : "เดือนก่อนหน้า";
  const nextLabel = view === "daily" ? "วันถัดไป" : view === "weekly" ? "สัปดาห์ถัดไป" : "เดือนถัดไป";

  return (
    <section className="relative min-w-0 rounded-xl border border-border bg-card shadow-sm" aria-labelledby="ot-calendar-heading">
      <Tabs selectedKey={view} onSelectionChange={changeView}>
        <div className="relative z-10 flex flex-col gap-3 border-b border-border px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold leading-4 uppercase tracking-[0.08em] text-muted-foreground">ตารางเวลาทำงาน</p>
            <h2 id="ot-calendar-heading" className="mt-1 text-base font-semibold leading-6 text-foreground sm:text-lg">ปฏิทิน OT</h2>
          </div>
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between lg:justify-end">
            <TabList aria-label="เลือกมุมมองปฏิทิน OT" className="w-fit">
              <Tab id="daily">Daily</Tab>
              <Tab id="weekly">Weekly</Tab>
              <Tab id="monthly">Monthly</Tab>
            </TabList>
            <CalendarNavigation
              monthLabel={periodLabel}
              previousLabel={previousLabel}
              nextLabel={nextLabel}
              onPrevious={() => movePeriod(-1)}
              onNext={() => movePeriod(1)}
              monthControl={view === "monthly" ? (
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
              ) : undefined}
            />
          </div>
        </div>
        <TabPanel id={view} className="mt-0">
          {error ? <p role="alert" className="px-4 pt-3 text-xs leading-5 text-status-danger sm:px-5">{error}</p> : null}
          {view === "monthly" ? (
            <div className="overflow-x-auto p-3 sm:p-4">
              <Calendar
                month={month}
                ariaLabel={"ปฏิทินเดือน" + formatMonthLabel(month)}
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
                      onClick={() => {
                        setCursorDate(date.toString());
                        setSelectedDate(date);
                      }}
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
          ) : view === "weekly" ? (
            <OtWeekGrid dates={dates} itemsByDate={itemsByDate} loading={loading} />
          ) : <OtAgenda dates={dates} itemsByDate={itemsByDate} loading={loading} />}
          {loading ? <p role="status" className="px-4 pb-4 text-xs leading-5 text-muted-foreground">กำลังโหลดข้อมูล...</p> : null}
        </TabPanel>
      </Tabs>
      <HrmDialog
        open={Boolean(selectedDate)}
        onClose={() => setSelectedDate(null)}
        size="sm"
        title={selectedDate ? "รายการ OT วันที่ " + selectedDate.toString() : ""}
        description={selectedItems.length ? selectedItems.length + " รายการ" : undefined}
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
