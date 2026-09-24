"use client";

import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cx } from "@/utils/cx";

export function Tabs({ selectedKey, defaultSelectedKey, onSelectionChange, className, ...props }) {
  return (
    <TabsPrimitive.Root
      value={selectedKey == null ? undefined : String(selectedKey)}
      defaultValue={defaultSelectedKey == null ? undefined : String(defaultSelectedKey)}
      onValueChange={onSelectionChange}
      className={cx("w-full", className)}
      {...props}
    />
  );
}

export function TabList({ className, ...props }) {
  return <TabsPrimitive.List className={cx("inline-flex min-h-10 max-w-full items-center gap-1 overflow-x-auto rounded-lg bg-muted p-1 text-muted-foreground", className)} {...props} />;
}

export function Tab({ id, icon: Icon, count, className, children, ...props }) {
  return (
    <TabsPrimitive.Trigger
      value={String(id)}
      className={cx("group inline-flex min-h-8 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm", className)}
      {...props}
    >
      {Icon ? <Icon className="size-4" aria-hidden="true" /> : null}
      {children}
      {count != null ? <span className="rounded-sm bg-background/60 px-1.5 py-0.5 text-[10px] leading-none text-current">{count}</span> : null}
    </TabsPrimitive.Trigger>
  );
}

export function TabPanel({ id, className, ...props }) {
  return <TabsPrimitive.Content value={String(id)} className={cx("mt-2 focus-visible:outline-none", className)} {...props} />;
}
