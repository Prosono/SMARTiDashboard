import { Children, isValidElement, type ReactNode } from "react";
import { BarChart3, Coins, Sun, Tag, Zap, type LucideIcon } from "lucide-react";
import type { Home } from "../types";
import { HomeGrid, type HomeGridCard } from "./HomeGrid";
import { CardIcon, CardTitle } from "./CardPresentation";
import type { MobileSummary } from "./mobileCardModel";
import "./energyModules.css";

const moduleIcons: Record<string, LucideIcon> = {
  "energy:spot": Tag,
  "energy:prices": Tag,
  "energy:today": BarChart3,
  "energy:consumption": BarChart3,
  "energy:history": BarChart3,
  "energy:cost": Coins,
  "energy:today-cost": Coins,
  "energy:breakdown": Coins,
  "energy:self-supply": Sun,
};

type ModuleProps = {
  id: string;
  title: string;
  children: ReactNode;
  w?: number;
  h?: number;
  defaultHidden?: boolean;
  summary?: MobileSummary;
};

/** Declarative slots preserve the original presentation outside the Home canvas. */
export function EnergyModule({ children }: ModuleProps) {
  return <>{children}</>;
}
export function EnergyModuleGroup({
  children,
  className,
  label,
}: {
  children: ReactNode;
  className: string;
  label?: string;
}) {
  return (
    <div className={className} aria-label={label}>
      {children}
    </div>
  );
}

export function EnergyModules({
  children,
  home,
  offline,
  lang,
  page,
}: {
  children: ReactNode;
  home?: Home;
  offline: boolean;
  lang: string;
  page: "energy" | "energy_history";
}) {
  if (!home) return <>{children}</>;
  const cards: HomeGridCard[] = [];
  function collect(nodes: ReactNode) {
    Children.forEach(nodes, (child) => {
      if (!isValidElement(child)) return;
      if (child.type === EnergyModuleGroup) {
        collect((child.props as { children: ReactNode }).children);
      } else if (child.type === EnergyModule) {
        const {
          id,
          title,
          children: content,
          ...options
        } = child.props as ModuleProps;
        cards.push({
          id,
          title,
          ...options,
          content: (
            <section className="energy-module" data-energy-module={id}>
              <header className="energy-module-heading">
                <CardIcon
                  fallback={
                    moduleIcons[id] || (id.includes("solar") ? Sun : Zap)
                  }
                  size={22}
                />
                <h2>
                  <CardTitle>{title}</CardTitle>
                </h2>
              </header>
              <div className="energy-module-body">
                {Children.toArray(content).length ? (
                  content
                ) : (
                  <p>
                    {lang === "en"
                      ? "Waiting for readings."
                      : "Venter på målinger."}
                  </p>
                )}
              </div>
            </section>
          ),
        });
      }
    });
  }
  collect(children);
  return (
    <HomeGrid
      key={page}
      page={page}
      home={home}
      offline={offline}
      lang={lang}
      cards={cards}
    />
  );
}
