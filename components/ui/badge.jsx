import { cx } from "@/utils/cx";

const tones = {
  default: "border-transparent bg-primary text-primary-foreground",
  primary: "border-transparent bg-primary text-primary-foreground",
  neutral: "border-transparent bg-secondary text-secondary-foreground",
  lime: "border-transparent bg-status-success/10 text-status-success",
  green: "border-transparent bg-status-success/10 text-status-success",
  blue: "border-transparent bg-status-info/10 text-status-info",
  cyan: "border-transparent bg-status-info/10 text-status-info",
  yellow: "border-transparent bg-status-warning/10 text-status-warning",
  orange: "border-transparent bg-status-warning/10 text-status-warning",
  rose: "border-transparent bg-status-danger/10 text-status-danger",
  pink: "border-transparent bg-status-danger/10 text-status-danger",
  purple: "border-transparent bg-status-violet/10 text-status-violet",
  violet: "border-transparent bg-status-violet/10 text-status-violet",
  gray: "border-transparent bg-muted text-muted-foreground",
};

export function Badge({ color = "default", variant = "default", className, ...props }) {
  const tone = tones[color] || tones.neutral;
  return (
    <span
      className={cx(
        "inline-flex w-fit items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold leading-5 transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        variant === "outline" && "bg-transparent",
        variant === "caption" && "px-2 py-0.5 text-[11px] font-medium leading-4",
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
