import { Children, isValidElement, useState, type ReactNode } from "react";
import { ChevronRight, House, LayoutGrid } from "lucide-react";
import type { Home } from "../types";
import type { GridItem } from "./homeGridModel";
import type { HomeGridCard } from "./HomeGrid";
import { photoImages } from "./CardPresentation";
import "./phoneMisc.css";

export function miscPhoneControl(
  item: GridItem,
  card: HomeGridCard | undefined,
  home: Home,
) {
  const config = item.config;
  if (
    config &&
    (!["auto", "compact"].includes(config.type) ||
      config.sources.length > 1 ||
      photoImages.has(config.image))
  )
    return undefined;
  return home.controls.find(
    (c) => c.entity_id === (config?.sources[0] || card?.entityId),
  );
}

/** Reuses the canvas cells, including their configured content and full-view openers. */
export function PhoneMiscBoard({
  children,
  items,
  catalog,
  home,
  grouped,
  roomOf,
  lang,
  enabled,
}: {
  children: ReactNode;
  items: GridItem[];
  catalog: Map<string, HomeGridCard>;
  home: Home;
  grouped: boolean;
  roomOf: (item: GridItem) => string;
  lang: string;
  enabled: boolean;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  if (!enabled) return children;
  const en = lang === "en";
  const cells = new Map(
    Children.toArray(children).flatMap((child) =>
      isValidElement<{ "data-card"?: string }>(child) &&
      child.props["data-card"]
        ? [[child.props["data-card"]!, child] as const]
        : [],
    ),
  );
  const groups = new Map<string, GridItem[]>();
  for (const item of items) {
    const key = grouped ? roomOf(item) : "all";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }
  return (
    <div className="phone-misc-board">
      {[...groups]
        .sort(
          ([a], [b]) =>
            Number(["none", "shared"].includes(a)) -
            Number(["none", "shared"].includes(b)),
        )
        .map(([key, cards]) => {
          const name =
            key === "none"
              ? en
                ? "No room"
                : "Uten rom"
              : key === "shared"
                ? en
                  ? "Shared"
                  : "Felles for hjemmet"
                : home.areas.find((a) => `room:${a.area_id}` === key)?.name ||
                  "";
          const switches = cards.filter((item) =>
            ["switch", "input_boolean"].includes(
              miscPhoneControl(item, catalog.get(item.id), home)?.domain || "",
            ),
          );
          const switchIds = new Set(switches.map((item) => item.id));
          const opened = expanded.has(key);
          return (
            <section
              className="phone-misc-room"
              data-room={key}
              key={key}
              aria-label={name || (en ? "Other devices" : "Andre enheter")}
            >
              {grouped && (
                <h2>
                  <House size={22} aria-hidden="true" />
                  <span>{name}</span>
                  {key === "none" && (
                    <small>
                      {cards.length} {en ? "devices" : "enheter"}
                    </small>
                  )}
                </h2>
              )}
              {cards
                .filter((item) => !switchIds.has(item.id))
                .map((item) => cells.get(item.id))}
              {!!switches.length && (
                <div className="phone-misc-switches">
                  {(opened ? switches : switches.slice(0, 2)).map((item) =>
                    cells.get(item.id),
                  )}
                  {switches.length > 2 && (
                    <button
                      className="phone-misc-show-all"
                      aria-expanded={opened}
                      onClick={() =>
                        setExpanded((current) => {
                          const next = new Set(current);
                          if (next.has(key)) next.delete(key);
                          else next.add(key);
                          return next;
                        })
                      }
                    >
                      <LayoutGrid size={23} />
                      <span>
                        {opened
                          ? en
                            ? "Show fewer"
                            : "Vis færre"
                          : en
                            ? `Show all ${switches.length} devices`
                            : `Vis alle ${switches.length} enheter`}
                      </span>
                      <ChevronRight size={22} />
                    </button>
                  )}
                </div>
              )}
            </section>
          );
        })}
    </div>
  );
}
