"use client";

import * as AvatarPrimitive from "@radix-ui/react-avatar";
import { cx } from "@/utils/cx";

const colorClasses = {
  lime: "bg-status-success/10 text-status-success",
  green: "bg-status-success/10 text-status-success",
  blue: "bg-status-info/10 text-status-info",
  cyan: "bg-status-info/10 text-status-info",
  pink: "bg-status-danger/10 text-status-danger",
  rose: "bg-status-danger/10 text-status-danger",
  orange: "bg-status-warning/10 text-status-warning",
  purple: "bg-status-violet/10 text-status-violet",
};

export function Avatar({ initials, color = "blue", size = "md", src, alt = "", className, ...props }) {
  const dimensions = { sm: "size-8 text-xs", md: "size-10 text-sm", lg: "size-12 text-base" };
  return (
    <AvatarPrimitive.Root
      className={cx("relative flex shrink-0 overflow-hidden rounded-xl", dimensions[size] || dimensions.md, className)}
      role={props["aria-label"] ? "img" : undefined}
      {...props}
    >
      {src ? <AvatarPrimitive.Image src={src} alt={alt} className="aspect-square size-full object-cover" /> : null}
      <AvatarPrimitive.Fallback className={cx("flex size-full items-center justify-center font-semibold", colorClasses[color] || "bg-primary/10 text-primary")}>
        {initials || "?"}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}
