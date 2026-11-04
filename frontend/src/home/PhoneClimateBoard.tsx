import { Children, isValidElement, useState, type ReactNode } from "react";
import { ChevronRight, LayoutGrid } from "lucide-react";
import type { Home } from "../types";
import type { GridItem } from "./homeGridModel";
import type { HomeGridCard } from "./HomeGrid";
import { miscPhoneControl as nativeControl } from "./PhoneMiscBoard";
import "./phoneClimate.css";

export function PhoneClimateBoard({
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
    <div className="phone-climate-board">
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
          const sensors = cards.filter(
            (item) =>
              nativeControl(item, catalog.get(item.id), home)?.domain ===
              "sensor",
          );
          const sensorIds = new Set(sensors.map((item) => item.id));
          const opened = expanded.has(key),
            remaining = sensors.slice(2);
          return (
            <section
              key={key}
              className="phone-climate-room"
              data-room={key}
              aria-label={name || (en ? "Climate devices" : "Klimaenheter")}
            >
              {grouped && (
                <h2>
                  <span>{name}</span>
                  {!!sensors.length && (
                    <small>
                      {sensors.length} {en ? "sensors" : "sensorer"}
                    </small>
                  )}
                </h2>
              )}
              {cards
                .filter((item) => !sensorIds.has(item.id))
                .map((item) => cells.get(item.id))}
              {!!sensors.length && (
                <div className="phone-climate-readings">
                  {sensors.slice(0, 2).map((item) => cells.get(item.id))}
                </div>
              )}
              {!!remaining.length && (
                <>
                  <h3>{en ? "More sensors" : "Flere sensorer"}</h3>
                  <div className="phone-climate-more">
                    {(opened ? remaining : remaining.slice(0, 2)).map((item) =>
                      cells.get(item.id),
                    )}
                  </div>
                  {remaining.length > 2 && (
                    <button
                      className="phone-climate-show-all"
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
                      <LayoutGrid size={22} />
                      <span>
                        {opened
                          ? en
                            ? "Show fewer sensors"
                            : "Vis færre sensorer"
                          : en
                            ? `Show all ${sensors.length} sensors`
                            : `Vis alle ${sensors.length} sensorer`}
                      </span>
                      <ChevronRight size={21} />
                    </button>
                  )}
                </>
              )}
            </section>
          );
        })}
    </div>
  );
}
