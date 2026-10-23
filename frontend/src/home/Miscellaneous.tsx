import { CategoryHeading, CategorySummary } from "./CategoryIntro";
import { RobotVacuumIcon } from "./RobotVacuumIcon";
import { MiscDeviceCard } from "./MiscDeviceCard";
import { homeAsset } from "./HomeOverview";
import { useState, type ReactNode } from "react";
import { LayoutGrid, Blinds, Plug, Search } from "lucide-react";
import type { Control, Home } from "../types";
import { VacuumCard } from "./Cleaning";
import { ToolbarToggle, useToolbarDisclosure } from "./ToolbarToggle";
import "./cleaning.css";
import "./miscellaneous.css";

export function miscellaneousKind(c: Control) {
  if (c.diagnostic) return null;
  if (c.domain === "vacuum") return "cleaning";
  if (
    c.domain === "cover" &&
    !["garage", "gate", "door"].includes(String(c.attributes.device_class))
  )
    return "covers";
  if (["switch", "input_boolean"].includes(c.domain)) return "switches";
  return null;
}
export function hasMiscellaneous(home: Home) {
  return home.controls.some((c) => {
    const kind = miscellaneousKind(c);
    const feature =
      kind === "cleaning"
        ? "cleaning"
        : kind === "covers"
          ? "security"
          : "other";
    return (
      kind &&
      (!home.permissions || home.permissions.includes(feature + ".view"))
    );
  });
}
export function Miscellaneous({
  home,
  lang,
  offline,
}: {
  home: Home;
  lang: string;
  offline: boolean;
  renderControls: (c: Control[]) => ReactNode;
}) {
  const en = lang === "en";
  const toolbar = useToolbarDisclosure();
  const [search, setSearch] = useState("");
  const [room, setRoom] = useState("all");
  const groups = [
    {
      id: "cleaning",
      feature: "cleaning",
      Icon: RobotVacuumIcon,
      name: en ? "Robot vacuums" : "Robotstøvsugere",
    },
    {
      id: "covers",
      feature: "security",
      Icon: Blinds,
      name: en
        ? "Blinds, curtains & awnings"
        : "Persienner, gardiner og markiser",
    },
    {
      id: "switches",
      feature: "other",
      Icon: Plug,
      name: en ? "Switches & sockets" : "Brytere og stikkontakter",
    },
  ]
    .filter(
      (g) =>
        !home.permissions || home.permissions.includes(g.feature + ".view"),
    )
    .map((g) => ({
      ...g,
      controls: home.controls.filter(
        (c) =>
          miscellaneousKind(c) === g.id &&
          (room === "all" || (c.area_id || "none") === room) &&
          (
            c.name +
            " " +
            (home.areas.find((a) => a.area_id === c.area_id)?.name || "")
          )
            .toLocaleLowerCase()
            .includes(search.toLocaleLowerCase()),
      ),
    }))
    .filter((g) => g.controls.length);
  return (
    <section className="miscellaneous-view">
      <CategoryHeading
        Icon={LayoutGrid}
        title={en ? "More" : "Diverse"}
        subtitle={
          en
            ? "Everyday helpers, together in one place."
            : "Hverdagens hjelpere, samlet på ett sted."
        }
      >
        <ToolbarToggle {...toolbar} lang={lang} />
      </CategoryHeading>
      <div
        className="miscellaneous-toolbar"
        id={toolbar.id}
        hidden={!toolbar.expanded}
        data-collapsible-toolbar
      >
        <label className="cleaning-search">
          <Search size={19} />
          <input
            aria-label={en ? "Search other devices" : "Søk i diverse"}
            placeholder={
              en ? "Search devices or rooms…" : "Søk etter enhet eller rom…"
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <select
          aria-label={en ? "Choose room" : "Velg rom"}
          value={room}
          onChange={(e) => setRoom(e.target.value)}
        >
          <option value="all">{en ? "All rooms" : "Alle rom"}</option>
          {home.areas.map((a) => (
            <option key={a.area_id} value={a.area_id}>
              {a.name}
            </option>
          ))}
          <option value="none">{en ? "No room" : "Uten rom"}</option>
        </select>
      </div>
      <CategorySummary
        image={homeAsset("home-office")}
        eyebrow={en ? "EVERYDAY HELPERS" : "HJELPERE I HJEMMET"}
        title={
          en
            ? "Small helpers. A simpler everyday life."
            : "Små hjelpere. En enklere hverdag."
        }
        description={
          en
            ? "Cleaning, shade and power — at your fingertips."
            : "Rengjøring, solskjerming og strøm – rett ved hånden."
        }
      >
        {[
          {
            Icon: RobotVacuumIcon,
            kind: "cleaning",
            label: en ? "Robots" : "Roboter",
          },
          {
            Icon: Blinds,
            kind: "covers",
            label: en ? "Shades" : "Solskjerming",
          },
          {
            Icon: Plug,
            kind: "switches",
            label: en ? "Switches" : "Brytere",
          },
        ].map(({ Icon, kind, label }) => {
          const count = groups.find((g) => g.id === kind)?.controls.length || 0;
          return (
            <div key={kind}>
              <Icon size={23} />
              <span>
                <strong>{count}</strong>
                <small>{label}</small>
              </span>
            </div>
          );
        })}
      </CategorySummary>
      {groups.map(({ id, Icon, name, controls }) => (
        <section className="miscellaneous-section" key={id} aria-label={name}>
          <header>
            <Icon size={23} />
            <h2>{name}</h2>
            <span>{controls.length}</span>
          </header>
          {id === "cleaning" ? (
            <div className="cleaning-grid">
              {controls.map((c) => (
                <VacuumCard
                  key={c.id}
                  c={c}
                  home={home}
                  lang={lang}
                  offline={offline}
                />
              ))}
            </div>
          ) : (
            <div className="misc-device-grid">
              {controls.map((c) => (
                <MiscDeviceCard
                  key={c.id}
                  c={c}
                  home={home}
                  lang={lang}
                  offline={offline}
                />
              ))}
            </div>
          )}
        </section>
      ))}
      {!groups.length && (
        <p role="status">
          {en
            ? "No devices match your choices."
            : "Ingen enheter passer med valgene dine."}
        </p>
      )}
    </section>
  );
}
