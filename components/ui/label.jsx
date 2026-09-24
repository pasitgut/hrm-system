import { cx } from "@/utils/cx";

export function Label({ className, ...props }) {
  return <label className={cx("text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70", className)} {...props} />;
}
