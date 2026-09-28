import { cx } from "@/utils/cx";

export function PageHeader({ eyebrow, title, description, actions, className }) {
  return (
    <header className={cx("hrm-page-header", className)}>
      <div className="min-w-0">
        {eyebrow ? <p className="hrm-page-eyebrow">{eyebrow}</p> : null}
        <h1 className="hrm-page-title">{title}</h1>
        {description ? <p className="hrm-page-description">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function SectionHeading({ id, title, description, actions, as: Heading = "h2", className }) {
  return (
    <div className={cx("hrm-section-heading", className)}>
      <div className="min-w-0">
        <Heading id={id} className="hrm-section-title">{title}</Heading>
        {description ? <p className="hrm-section-description">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
