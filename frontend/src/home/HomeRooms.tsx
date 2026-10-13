import { useState, type ReactNode } from "react";
import { Lightbulb, Thermometer, Users, Search } from "lucide-react";
import type { Home, Control } from "../types";
import { usable } from "./homeModel";
export function Presence({
  home,
  offline,
  lang,
}: {
  home: Home;
  offline: boolean;
  lang: string;
}) {
  const en = lang === "en";
  const people = home.controls.filter(
    (c) => c.domain === "person" && !c.diagnostic,
  );
  return (
    <section
      className="home-presence"
      aria-label={en ? "Who's home" : "Hvem er hjemme"}
    >
      <div>
        <Users size={20} />
        <h2>{en ? "Who's home" : "Hvem er hjemme"}</h2>
      </div>
      {people.length ? (
        <ul>
          {people.map((c) => {
            const unknown = offline || !usable(c),
              here = !unknown && c.state === "home";
            return (
              <li key={c.id} className={here ? "person-home" : "person-away"}>
                <span className="person-avatar" aria-hidden="true">
                  {c.name.trim().slice(0, 1).toLocaleUpperCase()}
                </span>
                <span>
                  <strong>{c.name}</strong>
                  <small>
                    {unknown
                      ? en
                        ? "Unknown"
                        : "Ukjent"
                      : here
                        ? en
                          ? "Home"
                          : "Hjemme"
                        : en
                          ? "Away"
                          : "Borte"}
                  </small>
                </span>
                <span className="person-dot" aria-hidden="true" />
              </li>
            );
          })}
        </ul>
      ) : (
        <p>
          {en
            ? "No people are configured in Home Assistant yet. Presence appears here when available."
            : "Ingen personer er satt opp i Home Assistant ennå. Tilstedeværelse vises her når den er tilgjengelig."}
        </p>
      )}
      {offline && (
        <small>
          {en
            ? "Waiting for fresh presence data."
            : "Venter på ferske tilstedeværelsesdata."}
        </small>
      )}
    </section>
  );
}
export function RoomControls({
  home,
  kind,
  offline,
  lang,
  renderControls,
}: {
  home: Home;
  kind: "lights" | "climate";
  offline: boolean;
  lang: string;
  renderControls: (c: Control[]) => ReactNode;
}) {
  const [search, setSearch] = useState("");
  const [expanded, expand] = useState<string[]>([]);
  const en = lang === "en",
    lights = kind === "lights",
    Icon = lights ? Lightbulb : Thermometer;
  const controls = home.controls.filter(
    (c) =>
      !c.diagnostic &&
      (lights
        ? c.domain === "light"
        : c.domain === "climate" ||
          (c.domain === "sensor" &&
            ([
              "temperature",
              "humidity",
              "carbon_dioxide",
              "aqi",
              "pm25",
            ].includes(String(c.attributes.device_class)) ||
              ["°C", "°F"].includes(
                String(c.attributes.unit_of_measurement),
              )))),
  );
  const groups = [
    ...home.areas,
    { area_id: "", name: en ? "Without a room" : "Uten rom" },
  ].flatMap((a) => {
    const items = controls.filter(
      (c) =>
        (home.areas.some((a) => a.area_id === c.area_id) ? c.area_id : "") ===
          a.area_id &&
        `${c.name} ${a.name}`
          .toLocaleLowerCase()
          .includes(search.toLocaleLowerCase()),
    );
    return items.length ? [{ ...a, items }] : [];
  });
  return (
    <section className={`home-room-controls home-${kind}`}>
      <header className="home-view-heading">
        <div>
          <span className="home-view-eyebrow">
            {en ? "ROOM BY ROOM" : "ROM FOR ROM"}
          </span>
          <h1>
            <Icon size={27} />
            {lights
              ? en
                ? "Light for every moment"
                : "Lys for alle øyeblikk"
              : en
                ? "A comfortable home"
                : "Et behagelig hjem"}
          </h1>
          <p>
            {offline
              ? en
                ? "Waiting for fresh data. Controls are unavailable."
                : "Venter på ferske data. Styring er utilgjengelig."
              : lights
                ? `${controls.filter((c) => usable(c) && c.state === "on").length} ${en ? "lights on" : "lys på"} · ${controls.length} ${en ? "in total" : "totalt"}`
                : en
                  ? "Temperature, heating and air quality, together by room."
                  : "Temperatur, varme og luftkvalitet, samlet per rom."}
          </p>
        </div>
        <label className="home-room-search">
          <Search size={18} />
          <input
            aria-label={
              en ? "Search rooms and devices" : "Søk i rom og enheter"
            }
            placeholder={
              en ? "Find a room or device…" : "Finn et rom eller en enhet…"
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </header>
      {!controls.length && (
        <div className="home-empty-view">
          <Icon size={32} />
          <h2>
            {lights
              ? en
                ? "Your lights will appear here"
                : "Her kommer lysene dine"
              : en
                ? "Your indoor climate will appear here"
                : "Her kommer inneklimaet ditt"}
          </h2>
          <p>
            {en
              ? "Compatible devices appear automatically when connected to Home Assistant."
              : "Kompatible enheter vises automatisk når de er koblet til Home Assistant."}
          </p>
        </div>
      )}
      {!!controls.length && !groups.length && (
        <p role="status">
          {en
            ? "No matching rooms or devices."
            : "Ingen rom eller enheter passer søket."}
        </p>
      )}
      {groups.map((a) => (
        <section key={a.area_id} className="home-room-control-group">
          <header>
            <h2>{a.name}</h2>
            <span>
              {a.items.length}{" "}
              {a.items.length === 1
                ? en
                  ? "device"
                  : "enhet"
                : en
                  ? "devices"
                  : "enheter"}
            </span>
          </header>
          {renderControls(
            expanded.includes(a.area_id) ? a.items : a.items.slice(0, 12),
          )}
          {a.items.length > 12 && (
            <button
              className="home-customize"
              onClick={() =>
                expand(
                  expanded.includes(a.area_id)
                    ? expanded.filter((id) => id !== a.area_id)
                    : [...expanded, a.area_id],
                )
              }
            >
              {expanded.includes(a.area_id)
                ? en
                  ? "Show fewer"
                  : "Vis færre"
                : `${en ? "Show all" : "Vis alle"} (${a.items.length})`}
            </button>
          )}
        </section>
      ))}
    </section>
  );
}
