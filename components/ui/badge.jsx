import { cx } from "@/utils/cx";

const tones = {
  default: "border-transparent bg-muted text-muted-foreground",
  primary: "border-transparent bg-primary text-primary-foreground",
  info: "border-transparent bg-status-info/10 text-status-info",
  success: "border-transparent bg-status-success/10 text-status-success",
  warning: "border-transparent bg-status-warning/10 text-status-warning",
  danger: "border-transparent bg-status-danger/10 text-status-danger",
  neutral: "border-transparent bg-muted text-muted-foreground",
  lime: "border-transparent bg-status-success/10 text-status-success",
  green: "border-transparent bg-status-success/10 text-status-success",
  blue: "border-transparent bg-status-info/10 text-status-info",
  cyan: "border-transparent bg-status-info/10 text-status-info",
  yellow: "border-transparent bg-status-warning/10 text-status-warning",
  orange: "border-transparent bg-status-warning/10 text-status-warning",
  rose: "border-transparent bg-status-danger/10 text-status-danger",
  pink: "border-transparent bg-status-danger/10 text-status-danger",
  purple: "border-transparent bg-status-neutral/10 text-status-neutral",
  violet: "border-transparent bg-status-neutral/10 text-status-neutral",
  gray: "border-transparent bg-muted text-muted-foreground",
};

export function Badge({ color = "default", variant = "default", className, ...props }) {
  const tone = tones[color] || tones.neutral;
  return (
    <span
      className={cx(
        "inline-flex w-fit items-center rounded-sm border px-1.5 py-0.5 text-xs font-medium leading-4",
        variant === "outline" && "bg-transparent",
        variant === "caption" && "text-[11px]",
        tone,
        className,
      )}
      {...props}
    />
  );
}

export function Chip(props) {
  return <Badge {...props} />;
}

const statusTones = {
  pending: "warning",
  return_pending: "warning",
  returnPending: "warning",
  approved: "success",
  rejected: "danger",
  cancelled: "neutral",
  canceled: "neutral",
  active: "success",
  inactive: "neutral",
  completed: "success",
  delivered: "success",
  in_progress: "warning",
  "in progress": "warning",
  failed: "danger",
  available: "info",
  maintenance: "warning",
  retired: "neutral",
  "รออนุมัติ": "warning",
  "รอจัดการ": "warning",
  "อนุมัติแล้ว": "success",
  "ไม่อนุมัติ": "danger",
  "ยกเลิก": "neutral",
  "ปฏิบัติงาน": "success",
  "พ้นสภาพ": "neutral",
};

export function StatusBadge({ status, children, className, ...props }) {
  const tone = statusTones[String(status ?? "").toLowerCase()] || "neutral";
  return (
    <Badge color={tone} variant="caption" className={className} {...props}>
      {children ?? status}
    </Badge>
  );
}
