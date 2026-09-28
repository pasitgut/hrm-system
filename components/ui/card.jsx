import { cx } from "@/utils/cx";

export function Card({ className, ...props }) {
  return <div className={cx("rounded-lg border border-border bg-card text-card-foreground", className)} {...props} />;
}

export function CardHeader({ className, ...props }) {
  return <div className={cx("flex flex-col gap-1 p-4", className)} {...props} />;
}

export function CardTitle({ className, ...props }) {
  return <h3 className={cx("text-base font-semibold leading-6", className)} {...props} />;
}

export function CardDescription({ className, ...props }) {
  return <p className={cx("text-sm text-muted-foreground", className)} {...props} />;
}

export function CardContent({ className, ...props }) {
  return <div className={cx("p-4 pt-0", className)} {...props} />;
}

export function CardFooter({ className, ...props }) {
  return <div className={cx("flex items-center p-4 pt-0", className)} {...props} />;
}
