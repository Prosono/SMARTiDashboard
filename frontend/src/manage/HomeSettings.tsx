import { Zones } from "./Zones";
import { HomeMap } from "./HomeMap";
import { HubStatus } from "./HubStatus";
import { Accounts } from "./Accounts";
import { Backups } from "./Backups";
import { SystemActions } from "./SystemActions";
import { type Sample } from "./SystemGraph";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Network, MapPin, Pencil } from "lucide-react";
import { api } from "../api";
import { SettingsDialog } from "../home/SettingsDialog";
import { Presence } from "../home/People";
import type { Home } from "../types";
import "./homeSettings.css";
type Location = {
  location_name: string;
  latitude: number;
  longitude: number;
  elevation: number;
  time_zone: string;
};
type Person = {
  id: string;
  name: string;
  device_trackers: string[];
  editable: boolean;
};
export type System = {
  history?: Sample[];
  demo: boolean;
  unavailable: string[];
  host: {
    hostname: string | null;
    operating_system: string | null;
    kernel: string | null;
    disk_total: number | null;
    disk_used: number | null;
    disk_free: number | null;
  };
  core: {
    cpu_percent: number | null;
    memory_percent: number | null;
    memory_usage: number | null;
    memory_limit: number | null;
  };
  network:
    | {
        interface: string;
        type: string;
        connected: boolean;
        primary: boolean;
        addresses: string[];
      }[]
    | null;
  backups:
    | {
        slug: string;
        name: string;
        date: string;
        size: number;
        type: string;
        protected: boolean;
      }[]
    | null;
};
export function HomeSettings({
  lang,
  home,
  section = "household",
}: {
  lang: string;
  home: Home;
  section?: "household" | "backups" | "network" | "system";
}) {
  const t = (nb: string, en: string) => (lang === "en" ? en : nb);
  const qc = useQueryClient();
  const system = useQuery({
    queryKey: ["settings", "system"],
    queryFn: () => api<System>("manage/settings/system"),
    refetchInterval: section === "system" ? 30000 : false,
    enabled: section !== "household",
  });
  const location = useQuery({
    queryKey: ["settings", "location"],
    enabled: section === "household",
    queryFn: () => api<Location>("manage/settings/home"),
    retry: false,
  });
  const people = useQuery({
    queryKey: ["settings", "people"],
    enabled: section === "household",
    queryFn: () =>
      api<{ people: Person[]; trackers: { id: string; name: string }[] }>(
        "manage/settings/people",
      ),
    retry: false,
  });
  const [place, setPlace] = useState<Location | null>(null),
    [person, setPerson] = useState<Person | null>(null),
    [remove, setRemove] = useState<Person | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function save(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["settings"] }),
        qc.invalidateQueries({ queryKey: ["home"] }),
        qc.invalidateQueries({ queryKey: ["people-preferences"] }),
      ]);
      setPlace(null);
      setPerson(null);
      setRemove(null);
    } catch {
      setError(
        t(
          "Endringen kunne ikke bekreftes. Kontroller forbindelsen og feltene, og prøv igjen.",
          "The change could not be confirmed. Check the connection and fields, then retry.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  const s = system.data;
  return (
    <section className="home-settings">
      <div className="section-heading">
        <h2>
          {section === "household"
            ? t("Hjem og personer", "Home and people")
            : section === "backups"
              ? t("Sikkerhetskopiering", "Backups")
              : section === "network"
                ? t("Nettverk", "Network")
                : "System"}
        </h2>
        <button
          onClick={() => {
            if (section === "household") {
              void location.refetch();
              void people.refetch();
              void qc.invalidateQueries({ queryKey: ["settings", "zones"] });
            } else void system.refetch();
          }}
        >
          {t("Oppdater", "Refresh")}
        </button>
      </div>
      {section === "household" && (
        <div className="settings-personal-grid">
          <section className="settings-panel location-panel">
            <h3>
              <MapPin />{" "}
              {t("Hjemmets plassering og soner", "Home location and zones")}
            </h3>
            {location.data ? (
              <>
                <HomeMap
                  latitude={location.data.latitude}
                  longitude={location.data.longitude}
                  name={location.data.location_name}
                  lang={lang}
                />
                <strong>{location.data.location_name}</strong>
                <p>
                  {location.data.latitude}, {location.data.longitude} ·{" "}
                  {location.data.time_zone}
                </p>
                <button
                  onClick={() => {
                    setError("");
                    setPlace({ ...location.data! });
                  }}
                >
                  <Pencil size={17} />
                  {t("Endre plassering", "Edit location")}
                </button>
                <Zones
                  latitude={location.data.latitude}
                  longitude={location.data.longitude}
                  lang={lang}
                />
              </>
            ) : (
              <p>
                {t(
                  "Plassering krever forbindelse til hjemmesentralen og er utilgjengelig i demo.",
                  "Location requires a connected controller and is unavailable in demo.",
                )}
              </p>
            )}
          </section>
          <Accounts
            lang={lang}
            people={people.data?.people}
            onPerson={(p) => {
              setError("");
              setPerson({ ...p });
            }}
          >
            {people.isError && (
              <p role="alert">
                {t(
                  "Personer kunne ikke hentes fra sentralen.",
                  "Could not load people from the controller.",
                )}
              </p>
            )}
            <details className="household-presence">
              <summary>
                {t(
                  "Hvem vises på hjemskjermen?",
                  "Who appears on the home screen?",
                )}
              </summary>
              <Presence
                home={home}
                offline={!home.connected}
                lang={lang}
                admin={true}
              />
            </details>
          </Accounts>
        </div>
      )}
      {section !== "household" && system.isError && (
        <p role="alert">
          {t("Kunne ikke hente systemstatus.", "Could not load system status.")}
        </p>
      )}
      {section !== "household" && system.isPending && (
        <p role="status">
          {t("Henter systemstatus …", "Loading system status …")}
        </p>
      )}
      {s && section !== "household" && (
        <>
          {section === "system" && (
            <>
              <HubStatus
                system={s}
                home={home}
                lang={lang}
                stale={system.isError}
              />
              {s.unavailable.length > 0 && (
                <p className="note">
                  {t(
                    "Enkelte systemdata er utilgjengelige. Målinger, nettverk og sikkerhetskopier krever SMARTi-appen på en Supervisor-basert hjemmesentral. Demo viser ikke oppdiktede systemtall.",
                    "Some system data is unavailable. Metrics, network and backups require the SMARTi app on a Supervisor-based controller. Demo does not invent system values.",
                  )}
                </p>
              )}
              <p className="muted">
                {t(
                  "Historikk samles mens statusvisningen er åpen, og beholdes i inntil 24 timer. Pek på grafen for detaljer.",
                  "History is collected while this view is open and retained for up to 24 hours. Point at a graph for details.",
                )}
              </p>
            </>
          )}
          {section === "network" && (
            <div className="settings-layout">
              <section className="settings-panel">
                <h3>
                  <Network /> {t("Nettverk", "Network")}
                </h3>
                {s.network === null ? (
                  <p>
                    {t(
                      "Nettverksstatus utilgjengelig",
                      "Network status unavailable",
                    )}
                  </p>
                ) : (
                  s.network.map((n) => (
                    <div className="system-list-row" key={n.interface}>
                      <SystemActions lang={lang} network={n.interface} />
                      <div>
                        <strong>
                          {n.interface}{" "}
                          {n.primary
                            ? "· " + t("Hovedforbindelse", "Primary")
                            : ""}
                        </strong>
                        <small>
                          {n.type} · {n.addresses.join(", ") || "—"}
                        </small>
                      </div>
                      <span>
                        {n.connected
                          ? t("Tilkoblet", "Connected")
                          : t("Frakoblet", "Disconnected")}
                      </span>
                    </div>
                  ))
                )}
              </section>
            </div>
          )}
          {section === "backups" && <Backups items={s.backups} lang={lang} />}
        </>
      )}
      {(place || person || remove) && (
        <SettingsDialog
          lang={lang}
          busy={busy}
          title={
            place
              ? t("Hjemmets plassering", "Home location")
              : remove
                ? t("Fjern person", "Remove person")
                : person?.id
                  ? t("Rediger person", "Edit person")
                  : t("Legg til person", "Add person")
          }
          onClose={() => {
            setPlace(null);
            setPerson(null);
            setRemove(null);
          }}
        >
          {error && (
            <p role="alert" className="notice">
              {error}
            </p>
          )}
          {place && (
            <form
              className="system-settings-form"
              onSubmit={(e) => {
                e.preventDefault();
                void save(() => api("manage/settings/home", "PUT", place));
              }}
            >
              <p>
                {t(
                  "Påvirker hjemsonen, soloppgang/-nedgang og automasjoner som bruker plassering eller tid.",
                  "Affects the home zone, sunrise/sunset and automations using location or time.",
                )}
              </p>
              <HomeMap
                latitude={place.latitude}
                longitude={place.longitude}
                name={place.location_name}
                lang={lang}
                onChange={(point) => {
                  if (!busy) setPlace({ ...place, ...point });
                }}
              />
              <label>
                {t("Hjemmets navn", "Home name")}
                <input
                  required
                  maxLength={80}
                  value={place.location_name}
                  onChange={(e) =>
                    setPlace({ ...place, location_name: e.target.value })
                  }
                />
              </label>
              {(
                [
                  ["latitude", t("Breddegrad", "Latitude"), -90, 90],
                  ["longitude", t("Lengdegrad", "Longitude"), -180, 180],
                  [
                    "elevation",
                    t("Høyde over havet (m)", "Elevation (m)"),
                    -500,
                    9000,
                  ],
                ] as const
              ).map(([key, label, min, max]) => (
                <label key={key}>
                  {label}
                  <input
                    type="number"
                    required
                    min={min}
                    max={max}
                    step={key === "elevation" ? 1 : "any"}
                    value={place[key]}
                    onChange={(e) =>
                      setPlace({ ...place, [key]: e.target.valueAsNumber })
                    }
                  />
                </label>
              ))}
              <label>
                {t("Tidssone", "Time zone")}
                <input
                  required
                  value={place.time_zone}
                  placeholder="Europe/Oslo"
                  onChange={(e) =>
                    setPlace({ ...place, time_zone: e.target.value })
                  }
                />
              </label>
              <button className="primary compact" disabled={busy}>
                {t("Lagre plassering", "Save location")}
              </button>
            </form>
          )}
          {person && !remove && (
            <form
              className="system-settings-form"
              onSubmit={(e) => {
                e.preventDefault();
                void save(() =>
                  api(
                    `manage/settings/people${person.id ? "/" + encodeURIComponent(person.id) : ""}`,
                    person.id ? "PUT" : "POST",
                    {
                      name: person.name,
                      device_trackers: person.device_trackers,
                    },
                  ),
                );
              }}
            >
              <label>
                {t("Navn", "Name")}
                <input
                  required
                  maxLength={80}
                  value={person.name}
                  onChange={(e) =>
                    setPerson({ ...person, name: e.target.value })
                  }
                />
              </label>
              <fieldset>
                <legend>
                  {t(
                    "Enheter som viser om personen er hjemme",
                    "Devices that track this person’s presence",
                  )}
                </legend>
                {people.data?.trackers.map((d) => (
                  <label className="check-label" key={d.id}>
                    <input
                      type="checkbox"
                      checked={person.device_trackers.includes(d.id)}
                      onChange={(e) =>
                        setPerson({
                          ...person,
                          device_trackers: e.target.checked
                            ? [...person.device_trackers, d.id]
                            : person.device_trackers.filter(
                                (id) => id !== d.id,
                              ),
                        })
                      }
                    />
                    {d.name}
                  </label>
                ))}
                {!people.data?.trackers.length && (
                  <p>
                    {t(
                      "Ingen tilstedeværelsesenheter funnet. Du kan legge dem til senere.",
                      "No presence trackers found. You can add them later.",
                    )}
                  </p>
                )}
              </fieldset>
              <button className="primary compact" disabled={busy}>
                {t("Lagre person", "Save person")}
              </button>
              {person.id && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setRemove(person)}
                >
                  {t("Fjern person …", "Remove person …")}
                </button>
              )}
            </form>
          )}
          {remove && (
            <>
              <p>
                {t(
                  `Fjerne ${remove.name} fra hjemmets personer? Sporingsenheter og innloggingskontoer beholdes.`,
                  `Remove ${remove.name} from household members? Tracker devices and login accounts are kept.`,
                )}
              </p>
              <button
                disabled={busy}
                onClick={() =>
                  void save(() =>
                    api(
                      `manage/settings/people/${encodeURIComponent(remove.id)}`,
                      "DELETE",
                    ),
                  )
                }
              >
                {t("Bekreft fjerning", "Confirm removal")}
              </button>
              <button disabled={busy} onClick={() => setRemove(null)}>
                {t("Tilbake", "Back")}
              </button>
            </>
          )}
        </SettingsDialog>
      )}
    </section>
  );
}
