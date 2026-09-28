"use client";

import { Slot } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";
import { cx } from "@/utils/cx";

export const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-secondary hover:text-secondary-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-secondary hover:text-secondary-foreground",
        link: "text-foreground underline-offset-4 hover:text-primary hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-10 px-3",
        xs: "h-9 px-2.5 text-xs",
        lg: "h-11 px-8",
        icon: "size-10",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

const variantAliases = { primary: "default", danger: "destructive" };
const sizeAliases = { small: "sm" };

export function Button({
  asChild = false,
  variant = "default",
  size = "default",
  leadingIcon: LeadingIcon,
  trailingIcon: TrailingIcon,
  isDisabled,
  disabled,
  iconOnly,
  className,
  children,
  ...props
}) {
  const Component = asChild ? Slot : "button";
  const buttonProps = {
    className: cx(buttonVariants({ variant: variantAliases[variant] || variant, size: sizeAliases[size] || size }), className),
    disabled: disabled ?? isDisabled,
    ...props,
  };
  if (asChild) return <Component {...buttonProps}>{children}</Component>;
  return (
    <Component {...buttonProps}>
      {LeadingIcon ? <LeadingIcon aria-hidden="true" /> : null}
      {children}
      {TrailingIcon ? <TrailingIcon aria-hidden="true" /> : null}
    </Component>
  );
}
