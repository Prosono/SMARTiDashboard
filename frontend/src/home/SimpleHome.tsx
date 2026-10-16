import { Multimedia } from "./Multimedia";
import { SecurityOverview } from "./SecurityOverview";
import { useState, type ReactNode } from "react";
import { House, Search, Star } from "lucide-react";
import type { Home, Control } from "../types";
export function SimpleHome({
  home,
  lang,
  offline,
  renderControls,
}: {
  home: Home;
  lang: string;
  offline: boolean;
  renderControls: (c: Control[]) => ReactNode;
}) {
  const en = lang === "en";
  const [room, setRoom] = useState("all"),
    [search, setSearch] = useState(""),
    [limit, setLimit] = useState(8);
  const [view, setView] = useState("devices");
  const controls = home.controls.filter(
    (c) =>
      !c.diagnostic &&
      ![
        "automation",
        "scene",
        "script",
        "update",
        "button",
        "camera",
        "media_player",
      ].includes(c.domain),
  );
  const shown = controls.filter(
    (c) =>
      (room === "all" ||
        (room === "favorites"
          ? home.favorites.includes(c.entity_id)
          : (c.area_id || "none") === room)) &&
      c.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  );
  shown.sort(
    (a, b) =>
      Number(home.favorites.includes(b.entity_id)) -
        Number(home.favorites.includes(a.entity_id)) ||
      Number(b.capabilities.length > 0) - Number(a.capabilities.length > 0),
  );
  const alerts = controls.filter(
    (c) =>
      c.state === "triggered" ||
      (c.domain === "binary_sensor" &&
        ["smoke", "gas", "carbon_monoxide", "moisture"].includes(
          String(c.attributes.device_class),
        ) &&
        c.state === "on"),
  );
  if (view !== "devices")
    return (
      <section className="simple-home">
        <button onClick={() => setView("devices")}>
          {en ? "← Back to my home" : "← Tilbake til hjemmet"}
        </button>
        {view === "media" ? (
          <Multimedia home={home} lang={lang} offline={offline} admin={false} />
        ) : (
          <SecurityOverview
            home={home}
            lang={lang}
            offline={offline}
            renderControls={renderControls}
          />
        )}
      </section>
    );
  return (
    <section className="simple-home">
      <header>
        <House size={32} />
        <div>
          <h1>{home.home_name}</h1>
          <p>
            {en
              ? "What would you like to do at home?"
              : "Hva vil du gjøre hjemme?"}
          </p>
        </div>
      </header>
      {offline && (
        <p role="status">
          {en
            ? "The home is disconnected. Values may be old; controls are paused."
            : "Hjemmet er frakoblet. Tallene kan være gamle, og styringen er satt på pause."}
        </p>
      )}
      {alerts.length > 0 && (
        <div className="simple-alert" role="alert">
          <strong>
            {en ? "Needs your attention" : "Trenger din oppmerksomhet"}
          </strong>
          {alerts.map((c) => (
            <p key={c.id}>
              {c.name}: {en ? "Alarm detected" : "Varsel registrert"}
            </p>
          ))}
        </div>
      )}
      <div className="simple-shortcuts">
        {home.controls.some((c) => c.domain === "media_player") && (
          <button onClick={() => setView("media")}>
            {en ? "Music and TV" : "Musikk og TV"}
          </button>
        )}
        {home.controls.some((c) =>
          ["camera", "alarm_control_panel"].includes(c.domain),
        ) && (
          <button onClick={() => setView("security")}>
            {en ? "Cameras and security" : "Kameraer og trygghet"}
          </button>
        )}
      </div>
      <div className="simple-filters">
        <label>
          {en ? "Choose room" : "Velg rom"}
          <select
            value={room}
            onChange={(e) => {
              setRoom(e.target.value);
              setLimit(8);
            }}
          >
            <option value="all">{en ? "All rooms" : "Alle rom"}</option>
            <option value="favorites">
              {en ? "My favorites" : "Mine favoritter"}
            </option>
            {home.areas.map((a) => (
              <option key={a.area_id} value={a.area_id}>
                {a.name}
              </option>
            ))}
            <option value="none">{en ? "Without a room" : "Uten rom"}</option>
          </select>
        </label>
        <label>
          <Search size={19} />
          {en ? "Find a device" : "Finn en enhet"}
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setLimit(8);
            }}
            placeholder={
              en ? "For example: kitchen light" : "For eksempel: kjøkkenlys"
            }
          />
        </label>
      </div>
      <p className="simple-help">
        <Star size={18} />
        {en
          ? "Use the star on a device to find it in My favorites."
          : "Trykk på stjernen ved en enhet for å finne den igjen i Mine favoritter."}
      </p>
      <p aria-live="polite">
        {en
          ? `Showing ${Math.min(limit, shown.length)} of ${shown.length} devices`
          : `Viser ${Math.min(limit, shown.length)} av ${shown.length} enheter`}
      </p>
      {renderControls(shown.slice(0, limit))}
      {!shown.length && (
        <p>
          {en
            ? "No devices here. Choose another room or change your search."
            : "Ingen enheter her. Velg et annet rom eller endre søket."}
        </p>
      )}
      {shown.length > limit && (
        <button className="secondary" onClick={() => setLimit((v) => v + 8)}>
          {en ? "Show more devices" : "Vis flere enheter"}
        </button>
      )}
    </section>
  );
}
