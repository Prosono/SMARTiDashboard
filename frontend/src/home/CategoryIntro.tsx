import { createContext, useContext, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { HeaderAppearance, HomeHeaderImage } from "./HomeAppearance";
import "./categoryIntro.css";

const InCategoryHeader = createContext(false);

/** Shared title and photo summary for the home's device categories. */
export function CategoryHeading({
  Icon,
  title,
  subtitle,
  children,
  image,
  summary,
}: {
  Icon: LucideIcon;
  title: string;
  subtitle: string;
  children?: ReactNode;
  image?: string;
  summary?: ReactNode;
}) {
  const harmony = useContext(HeaderAppearance);
  const heading = (
    <>
      <Icon size={36} aria-hidden="true" />
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {children}
    </>
  );
  return (
    <header className="category-heading toolbar-heading">
      <HomeHeaderImage
        fallback={
          image || new URL("home/home-living.webp", document.baseURI).href
        }
      />
      {harmony && summary ? (
        <>
          <div className="category-heading-main">{heading}</div>
          <InCategoryHeader.Provider value={true}>
            {summary}
          </InCategoryHeader.Provider>
        </>
      ) : (
        heading
      )}
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
  const harmony = useContext(HeaderAppearance);
  const inHeader = useContext(InCategoryHeader);
  // Harmoni renders the same summary in its photo header; Classic/Living retain their existing layout.
  if (harmony && !inHeader) return null;
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
