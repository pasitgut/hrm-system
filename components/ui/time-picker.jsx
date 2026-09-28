"use client";

import { useId, useState } from "react";
import { RiCloseLine, RiTimeLine } from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { Select, SelectItem } from "@/components/ui/select";
import { cx } from "@/utils/cx";

const HOURS = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, "0"));
const MINUTES = Array.from({ length: 60 }, (_, minute) => String(minute).padStart(2, "0"));

function splitTime(value) {
  const [hour = "", minute = ""] = (value || "").split(":");
  return { hour, minute };
}

export function TimePicker({
  id: providedId,
  label,
  value,
  defaultValue,
  onChange,
  optional,
  isRequired,
  isDisabled,
  disabled,
  name,
  className,
  ...props
}) {
  const generatedId = useId();
  const baseId = providedId || generatedId;
  const [internalValue, setInternalValue] = useState(defaultValue || "");
  const currentValue = value !== undefined ? value || "" : internalValue;
  const { hour, minute } = splitTime(currentValue);
  const isControlDisabled = isDisabled ?? disabled ?? false;
  const visibleLabel = optional ? `${label} (ไม่บังคับ)` : label;

  function updateTime(part, nextPart) {
    const nextHour = part === "hour" ? nextPart : hour || "00";
    const nextMinute = part === "minute" ? nextPart : minute || "00";
    const nextValue = `${nextHour}:${nextMinute}`;
    if (value === undefined) setInternalValue(nextValue);
    onChange?.(nextValue);
  }

  function clearTime() {
    if (value === undefined) setInternalValue("");
    onChange?.("");
  }

  return (
    <div className={cx("grid min-w-0 gap-1.5", className)}>
      {visibleLabel ? <label id={`${baseId}-label`} className="text-xs font-medium leading-4 text-muted-foreground">{visibleLabel}</label> : null}
      {name ? <input type="hidden" name={name} value={currentValue} /> : null}
      <div
        role="group"
        aria-labelledby={visibleLabel ? `${baseId}-label` : undefined}
        className="flex h-12 min-w-0 items-center gap-1.5 rounded-sm border border-input bg-background px-2 text-foreground focus-within:ring-2 focus-within:ring-ring"
        {...props}
      >
        <RiTimeLine className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <Select
          id={`${baseId}-hour`}
          aria-label={label ? `${label} · ชั่วโมง` : "ชั่วโมง"}
          aria-required={isRequired || undefined}
          selectedKey={hour || undefined}
          placeholder="ชช"
          onSelectionChange={(nextHour) => updateTime("hour", String(nextHour))}
          isDisabled={isControlDisabled}
          className="h-10 w-[4.25rem] flex-none justify-center border-0 bg-transparent px-1 text-center"
        >
          {HOURS.map((item) => <SelectItem key={item} id={item}>{item}</SelectItem>)}
        </Select>
        <span aria-hidden="true" className="text-sm font-medium text-muted-foreground">:</span>
        <Select
          id={`${baseId}-minute`}
          aria-label={label ? `${label} · นาที` : "นาที"}
          aria-required={isRequired || undefined}
          selectedKey={minute || undefined}
          placeholder="นน"
          onSelectionChange={(nextMinute) => updateTime("minute", String(nextMinute))}
          isDisabled={isControlDisabled}
          className="h-10 w-[4.25rem] flex-none justify-center border-0 bg-transparent px-1 text-center"
        >
          {MINUTES.map((item) => <SelectItem key={item} id={item}>{item}</SelectItem>)}
        </Select>
        {!isRequired && currentValue ? (
          <Button type="button" variant="ghost" size="icon" className="ml-auto size-7" aria-label={`ล้าง${label || "เวลา"}`} onClick={clearTime} disabled={isControlDisabled}>
            <RiCloseLine aria-hidden="true" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export default TimePicker;
