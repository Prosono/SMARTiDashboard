import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import "./categoryIntro.css";

/** Shared title and photo summary for the home's device categories. */
export function CategoryHeading({
  Icon,
  title,
  subtitle,
  children,
}: {
  Icon: LucideIcon;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <header className="category-heading toolbar-heading">
      <Icon size={36} aria-hidden="true" />
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {children}
    </header>
  );
}
export function CategorySummary({
  image,
  eyebrow,
  title,
  description,
  alert = false,
  children,
  action,
}: {
  image: string;
  eyebrow: string;
  title: ReactNode;
  description: ReactNode;
  alert?: boolean;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="category-summary" data-alert={alert}>
      <img src={image} alt="" />
      <div className="category-summary-copy">
        <small>{eyebrow}</small>
        <h2>{title}</h2>
        <p>{description}</p>
        {action && <div className="category-summary-action">{action}</div>}
      </div>
      <div className="category-metrics">{children}</div>
    </section>
  );
}
