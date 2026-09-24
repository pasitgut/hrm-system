"use client";

import { Input } from "@/components/ui/input";
import { parseDate } from "@internationalized/date";
import { RiCalendarLine } from "@remixicon/react";

export function DatePickerField({ label, value, onChange, isRequired, ...props }) {
  return (
    <Input
      type="date"
      label={label}
      value={value?.toString?.() || value || ""}
      onChange={(nextValue) => onChange?.(nextValue ? parseDate(nextValue) : null)}
      leadingIcon={RiCalendarLine}
      isRequired={isRequired}
      {...props}
    />
  );
}
