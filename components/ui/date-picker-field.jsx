"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDate, getLocalTimeZone, parseDate, today } from "@internationalized/date";
import { RiCalendarLine, RiCloseLine } from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { Calendar, CalendarNavigation } from "@/components/ui/calendar";
import { cx } from "@/utils/cx";

function toCalendarDate(value) {
  if (value == null || value === "") return null;
  try {
    return parseDate(typeof value === "string" ? value : value.toString());
  } catch {
    return null;
  }
}

function startOfMonth(date) {
  return new CalendarDate(date.year, date.month, 1);
}

function currentDate() {
  try {
    return today(getLocalTimeZone());
  } catch {
    return new CalendarDate(2026, 1, 1);
  }
}

function formatDate(date, options = { day: "numeric", month: "short", year: "numeric" }) {
  return new Intl.DateTimeFormat("th-TH-u-ca-buddhist", { ...options, timeZone: "UTC" }).format(date.toDate("UTC"));
}

export function DatePickerField({
  id: providedId,
  label,
  value,
  defaultValue,
  onChange,
  isRequired,
  isDisabled,
  disabled,
  isReadOnly,
  required,
  min,
  max,
  name,
  placeholder = "เลือกวันที่",
  className,
  ...props
}) {
  const generatedId = useId();
  const triggerId = providedId || generatedId;
  const panelId = `${triggerId}-calendar`;
  const headingId = `${triggerId}-month`;
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const gridRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [popoverPosition, setPopoverPosition] = useState(null);
  const [internalValue, setInternalValue] = useState(() => toCalendarDate(value ?? defaultValue));
  const selectedDate = value !== undefined ? toCalendarDate(value) : internalValue;
  const initialFocusDate = selectedDate || currentDate();
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(initialFocusDate));
  const [focusedDate, setFocusedDate] = useState(initialFocusDate.toString());
  const isControlDisabled = isDisabled ?? disabled ?? false;
  const isFieldRequired = isRequired ?? required ?? false;
  const minDate = toCalendarDate(min);
  const maxDate = toCalendarDate(max);
  const portalTarget = open ? rootRef.current?.closest("[data-datepicker-portal-root]") : null;
  const todayDate = currentDate();
  const todayOutsideRange = (minDate && todayDate.toString() < minDate.toString()) || (maxDate && todayDate.toString() > maxDate.toString());
  const monthTitle = formatDate(startOfMonth(visibleMonth), { month: "long", year: "numeric" });

  useLayoutEffect(() => {
    if (!open || !portalTarget) {
      setPopoverPosition(null);
      return undefined;
    }

    const updatePosition = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;

      const triggerRect = trigger.getBoundingClientRect();
      const hostRect = portalTarget.getBoundingClientRect();
      const panelWidth = Math.min(320, window.innerWidth - 32, portalTarget.clientWidth - 16);
      const leftInViewport = Math.max(16, Math.min(triggerRect.left, window.innerWidth - panelWidth - 16));
      const spaceBelow = window.innerHeight - triggerRect.bottom - 16;
      const spaceAbove = triggerRect.top - 16;
      const opensBelow = spaceBelow >= 360 || spaceBelow >= spaceAbove;
      const availableSpace = opensBelow ? spaceBelow : spaceAbove;
      const maxHeight = Math.max(160, Math.min(400, availableSpace - 6));
      const topInViewport = opensBelow
        ? triggerRect.bottom + 6
        : Math.max(8, triggerRect.top - maxHeight - 6);

      setPopoverPosition({
        left: leftInViewport - hostRect.left - portalTarget.clientLeft,
        top: topInViewport - hostRect.top - portalTarget.clientTop,
        width: panelWidth,
        maxHeight,
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, portalTarget]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target) && !panelRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const frame = window.requestAnimationFrame(() => {
      gridRef.current?.querySelector(`[data-calendar-date="${focusedDate}"]`)?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, focusedDate, visibleMonth]);

  function setSelectedDate(nextDate) {
    if (value === undefined) setInternalValue(nextDate);
    onChange?.(nextDate);
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }

  function openCalendar() {
    if (isControlDisabled || isReadOnly) return;
    const focusDate = selectedDate || currentDate();
    setVisibleMonth(startOfMonth(focusDate));
    setFocusedDate(focusDate.toString());
    setOpen(true);
  }

  function changeMonth(offset) {
    const nextMonth = startOfMonth(visibleMonth).add({ months: offset });
    setVisibleMonth(nextMonth);
    setFocusedDate(new CalendarDate(nextMonth.year, nextMonth.month, 1).toString());
  }

  function moveFocus(date, offset) {
    const nextDate = date.add({ days: offset });
    setVisibleMonth(startOfMonth(nextDate));
    setFocusedDate(nextDate.toString());
  }

  function handleCalendarKeyDown(event, date) {
    const offsets = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    const offset = offsets[event.key];
    if (offset != null) {
      event.preventDefault();
      moveFocus(date, offset);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    }
  }

  return (
    <div ref={rootRef} className={cx("relative grid min-w-0 gap-1.5", className)}>
      {label ? <label htmlFor={triggerId} className="text-xs font-medium leading-4 text-muted-foreground">{label}</label> : null}
      {name ? <input type="hidden" name={name} value={selectedDate?.toString() || ""} /> : null}
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        aria-required={isFieldRequired || undefined}
        aria-readonly={isReadOnly || undefined}
        {...props}
        disabled={isControlDisabled}
        onClick={() => (open ? setOpen(false) : openCalendar())}
        className={cx(
          "inline-flex h-10 w-full min-w-0 items-center gap-2 rounded-sm border border-input bg-background px-3 text-left text-sm text-foreground transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          !selectedDate && "text-muted-foreground",
          isReadOnly && "cursor-default",
        )}
      >
        <RiCalendarLine className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">{selectedDate ? formatDate(selectedDate) : placeholder}</span>
      </button>

      {open ? (() => {
        const calendarPanel = (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-labelledby={headingId}
          style={portalTarget ? popoverPosition || { visibility: "hidden" } : undefined}
          className={cx(
            "hrm-popover-surface absolute z-50 w-[min(20rem,calc(100vw-2rem))] rounded-md border border-border bg-popover p-3 text-popover-foreground",
            portalTarget ? "overflow-y-auto overscroll-contain" : "right-0 top-full mt-1.5",
          )}
        >
          <CalendarNavigation
            compact
            className="mb-2 justify-between"
            monthLabel={monthTitle}
            monthControl={<h2 id={headingId} className="text-sm font-semibold text-foreground">{monthTitle}</h2>}
            onPreviousMonth={() => changeMonth(-1)}
            onNextMonth={() => changeMonth(1)}
          />

          <Calendar
            compact
            gridRef={gridRef}
            month={visibleMonth}
            ariaLabel={monthTitle}
            selectedDate={selectedDate}
            todayDate={todayDate}
            className="gap-y-1 text-center"
            weekdayClassName="grid h-8 place-items-center py-0"
            weekClassName="gap-1"
            renderEmptyDay={() => <span aria-hidden="true" className="h-9" />}
            renderDay={({ date, dateKey, isSelected, isToday }) => {
              const outsideRange = (minDate && dateKey < minDate.toString()) || (maxDate && dateKey > maxDate.toString());
              return (
                <button
                  type="button"
                  data-calendar-date={dateKey}
                  tabIndex={dateKey === focusedDate ? 0 : -1}
                  aria-label={formatDate(date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                  aria-current={isToday ? "date" : undefined}
                  aria-pressed={isSelected}
                  disabled={Boolean(outsideRange)}
                  onFocus={() => setFocusedDate(dateKey)}
                  onKeyDown={(event) => handleCalendarKeyDown(event, date)}
                  onClick={() => setSelectedDate(date)}
                  className={cx(
                    "grid h-9 w-full place-items-center rounded-sm text-xs tabular-nums text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:text-muted-foreground/50",
                    isSelected && "bg-primary font-semibold text-primary-foreground hover:bg-primary",
                    isToday && !isSelected && "font-semibold text-primary ring-1 ring-primary/40",
                  )}
                >
                  {date.day}
                </button>
              );
            }}
          />

          <div className="mt-3 flex items-center justify-between border-t border-border pt-2">
            {isFieldRequired ? <span className="text-[11px] text-muted-foreground">เลือกวันที่</span> : selectedDate ? (
              <Button type="button" variant="ghost" size="xs" leadingIcon={RiCloseLine} onClick={() => setSelectedDate(null)}>ล้างวันที่</Button>
            ) : <span />}
            <Button type="button" variant="ghost" size="xs" disabled={Boolean(todayOutsideRange)} onClick={() => setSelectedDate(todayDate)}>วันนี้</Button>
          </div>
        </div>
        );
        return portalTarget ? createPortal(calendarPanel, portalTarget) : calendarPanel;
      })() : null}
    </div>
  );
}

export default DatePickerField;
