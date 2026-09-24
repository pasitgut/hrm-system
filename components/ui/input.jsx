"use client";

import { useId } from "react";
import { cx } from "@/utils/cx";

export function Input({
  className,
  label,
  leadingIcon: LeadingIcon,
  onChange,
  isReadOnly,
  isRequired,
  isDisabled,
  ...props
}) {
  const generatedId = useId();
  const id = props.id || generatedId;
  return (
    <div className={cx("grid min-w-0 gap-1.5", className)}>
      {label ? <label htmlFor={id} className="text-sm font-medium leading-none">{label}</label> : null}
      <div className="relative min-w-0">
        {LeadingIcon ? <LeadingIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /> : null}
        <input
          id={id}
          className={cx(
            "flex h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 read-only:bg-muted",
            LeadingIcon && "pl-9",
            props.type === "file" && "cursor-pointer file:mr-3 file:rounded-sm file:border-0 file:bg-transparent file:text-sm file:font-medium",
          )}
          readOnly={isReadOnly}
          required={isRequired}
          disabled={isDisabled}
          onChange={onChange ? (event) => onChange(props.type === "file" ? event : event.currentTarget.value) : undefined}
          {...props}
        />
      </div>
    </div>
  );
}

export const InputBase = Input;
