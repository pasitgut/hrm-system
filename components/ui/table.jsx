import { cx } from "@/utils/cx";

export function Table({ className, ...props }) {
  return <div className="hrm-table-shell"><table className={cx("hrm-data-table caption-bottom", className)} {...props} /></div>;
}

export function TableHeader({ className, ...props }) {
  return <thead className={cx("[&_tr]:border-b", className)} {...props} />;
}

export function TableBody({ className, ...props }) {
  return <tbody className={cx("[&_tr:last-child]:border-0", className)} {...props} />;
}

export function TableFooter({ className, ...props }) {
  return <tfoot className={cx("border-t bg-muted/50 font-medium [&>tr]:last:border-b-0", className)} {...props} />;
}

export function TableRow({ className, ...props }) {
  return <tr className={cx("transition-colors data-[state=selected]:bg-muted", className)} {...props} />;
}

export function TableHead({ className, ...props }) {
  return <th className={cx("text-left align-middle [&:has([role=checkbox])]:pr-0", className)} {...props} />;
}

export function TableCell({ className, ...props }) {
  return <td className={cx("align-middle [&:has([role=checkbox])]:pr-0", className)} {...props} />;
}

export function TableCaption({ className, ...props }) {
  return <caption className={cx("mt-4 text-sm text-muted-foreground", className)} {...props} />;
}
