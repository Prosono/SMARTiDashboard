import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { HomeHeaderImage } from "./HomeAppearance";
import "./categoryIntro.css";

/** Shared title and photo summary for the home's device categories. */
export function CategoryHeading({
  Icon,
  title,
  subtitle,
  children,
  image,
}: {
  Icon: LucideIcon;
  title: string;
  subtitle: string;
  children?: ReactNode;
  image?: string;
}) {
  return (
    <header className="category-heading toolbar-heading">
      <HomeHeaderImage
        fallback={
          image || new URL("home/home-living.webp", document.baseURI).href
        }
      />
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
}: {
  image: string;
  eyebrow: string;
  title: ReactNode;
  description: ReactNode;
  alert?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="category-summary" data-alert={alert}>
      <img src={image} alt="" />
      <div className="category-summary-copy">
        <small>{eyebrow}</small>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <div className="category-metrics">{children}</div>
    </section>
  );
}
