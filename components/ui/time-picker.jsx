"use client";

import { Input } from "@/components/ui/input";
import { RiTimeLine } from "@remixicon/react";

export function TimePicker({ label, value, onChange, optional, isRequired, ...props }) {
  return (
    <Input
      type="time"
      label={optional ? `${label} (ไม่บังคับ)` : label}
      value={value || ""}
      onChange={onChange}
      leadingIcon={RiTimeLine}
      isRequired={isRequired}
      {...props}
    />
  );
}
