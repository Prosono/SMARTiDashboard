import { Children, isValidElement, type ReactNode } from "react";
import {
  BarChart3,
  Coins,
  Gauge,
  Sun,
  Tag,
  UtilityPole,
  Clock3,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { Home } from "../types";
import { HomeGrid, type HomeGridCard } from "./HomeGrid";
import { CardIcon, CardTitle } from "./CardPresentation";
import type { MobileSummary } from "./mobileCardModel";
import "./energyModules.css";
import { energyControlDefaults } from "./energyControlModel";
import { cardTone } from "./cardToneModel";
import type { PhoneSize } from "./phoneLayout";

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
  "energy:capacity": Gauge,
  "energy:tariff": UtilityPole,
  "energy:price-hours": Clock3,
};

type ModuleProps = {
  id: string;
  title: string;
  children: ReactNode;
  w?: number;
  h?: number;
  defaultHidden?: boolean;
  summary?: MobileSummary;
  phoneSize?: PhoneSize;
  phoneContent?: (open: () => void) => ReactNode;
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
  page: "energy" | "energy_history" | "energy_control";
}) {
  if (!home && page !== "energy_control") return <>{children}</>;
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
        if (cards.some((card) => card.id === id)) return;
        cards.push({
          id,
          title,
          ...options,
          content: (
            <section
              className="energy-module"
              data-energy-module={id}
              data-energy-tone={
                home ? undefined : cardTone({ id }, undefined, [])
              }
            >
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
  if (page === "energy_control") {
    const order = (id: string) => {
      const index = energyControlDefaults.indexOf(id);
      return index < 0 ? 100 : index;
    };
    cards.sort((a, b) => order(a.id) - order(b.id));
    for (const card of cards) {
      card.defaultHidden =
        card.defaultHidden || !energyControlDefaults.includes(card.id);
      if (card.id === "energy:flow") card.w = 2;
    }
  }
  if (!home) {
    const renderCards = (list: HomeGridCard[]) => (
      <div className="energy-control-legacy-grid">
        {list.map((card) => (
          <div
            key={card.id}
            style={{
              gridColumn: `span ${card.w || 1}`,
              gridRow: `span ${card.h || 2}`,
            }}
          >
            {card.content}
          </div>
        ))}
      </div>
    );
    return (
      <>
        {renderCards(cards.filter((card) => !card.defaultHidden))}
        <details className="energy-more">
          <summary>Flere energimålinger</summary>
          {renderCards(cards.filter((card) => card.defaultHidden))}
        </details>
      </>
    );
  }
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
