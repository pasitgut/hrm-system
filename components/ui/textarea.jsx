"use client";

import { useId } from "react";
import { cx } from "@/utils/cx";

export function Textarea({ label, hint, className, isRequired, ...props }) {
  const generatedId = useId();
  const id = props.id || generatedId;
  return (
    <div className={cx("grid gap-1.5", className)}>
      {label ? <label htmlFor={id} className="text-sm font-medium leading-none">{label}</label> : null}
      <textarea
        id={id}
        required={isRequired}
        className="flex min-h-24 w-full resize-y rounded-sm border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        {...props}
      />
      {hint ? <p className="text-xs leading-5 text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
