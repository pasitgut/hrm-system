"use client";

import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { RiCheckLine } from "@remixicon/react";
import { cx } from "@/utils/cx";

export function Checkbox({ isSelected, onChange, isDisabled, className, ...props }) {
  return (
    <CheckboxPrimitive.Root
      checked={isSelected}
      onCheckedChange={(checked) => onChange?.(checked === true)}
      disabled={isDisabled}
      className={cx("peer size-4 shrink-0 rounded-[4px] border border-primary shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground", className)}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
        <RiCheckLine className="size-3.5" aria-hidden="true" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}
