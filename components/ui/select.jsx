"use client";

import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { RiArrowDownSLine, RiCheckLine } from "@remixicon/react";
import { cx } from "@/utils/cx";

function flattenItems(children) {
  return React.Children.toArray(children).flatMap((child) => {
    if (React.isValidElement(child) && child.type === React.Fragment) return flattenItems(child.props.children);
    return [child];
  });
}

export function Select({ selectedKey, defaultSelectedKey, onSelectionChange, children, className, size, id, placeholder, isDisabled, disabled, required, ...props }) {
  const items = flattenItems(children);
  const selected = items.find((item) => React.isValidElement(item) && String(item.props.id) === String(selectedKey ?? defaultSelectedKey));
  const ariaLabel = props["aria-label"];
  const ariaLabelledBy = props["aria-labelledby"];
  const ariaRequired = props["aria-required"];
  const rootProps = { ...props };
  delete rootProps["aria-label"];
  delete rootProps["aria-labelledby"];
  delete rootProps["aria-required"];
  const isControlDisabled = isDisabled ?? disabled ?? false;
  return (
    <SelectPrimitive.Root
      value={selectedKey == null ? undefined : String(selectedKey)}
      defaultValue={defaultSelectedKey == null ? undefined : String(defaultSelectedKey)}
      onValueChange={onSelectionChange}
      disabled={isControlDisabled}
      required={required}
      {...rootProps}
    >
      <SelectPrimitive.Trigger id={id} aria-label={ariaLabel} aria-labelledby={ariaLabelledBy} aria-required={ariaRequired ?? (required ? "true" : undefined)} disabled={isControlDisabled} className={cx("inline-flex w-full items-center justify-between gap-2 rounded-sm border border-input bg-background outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50", size === "sm" ? "h-9 px-3 text-xs" : "h-10 px-3 py-2 text-sm", className)}>
        <SelectPrimitive.Value aria-label={ariaLabel} placeholder={placeholder}>{selected?.props.children}</SelectPrimitive.Value>
        <SelectPrimitive.Icon asChild><RiArrowDownSLine className="size-4 text-muted-foreground" aria-hidden="true" /></SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
      <SelectPrimitive.Content position="popper" sideOffset={4} className="hrm-popover-surface z-50 max-h-[var(--radix-select-content-available-height)] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-md border border-border bg-popover text-popover-foreground">
          <SelectPrimitive.Viewport className="p-1">
            {items.map((item) => React.isValidElement(item) ? React.cloneElement(item, { key: item.key ?? item.props.id }) : item)}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

export function SelectItem({ id, children, className, ...props }) {
  return (
    <SelectPrimitive.Item value={String(id)} className={cx("relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-primary/10 focus:text-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50", className)} {...props}>
      <span className="absolute left-2 flex size-4 items-center justify-center"><SelectPrimitive.ItemIndicator><RiCheckLine className="size-4" aria-hidden="true" /></SelectPrimitive.ItemIndicator></span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}
