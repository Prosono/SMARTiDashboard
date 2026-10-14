import { SystemActions } from "./SystemActions";
import { SystemGraph, type Sample } from "./SystemGraph";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Cpu,
  HardDrive,
  Network,
  MapPin,
  Users,
  Archive,
  Pencil,
  Plus,
} from "lucide-react";
import { api } from "../api";
import { smartiName } from "../branding";
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
type System = {
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
export function HomeSettings({ lang, home }: { lang: string; home: Home }) {
  const t = (nb: string, en: string) => (lang === "en" ? en : nb);
  const qc = useQueryClient();
  const system = useQuery({
    queryKey: ["settings", "system"],
    queryFn: () => api<System>("manage/settings/system"),
    refetchInterval: 30000,
  });
  const location = useQuery({
    queryKey: ["settings", "location"],
    queryFn: () => api<Location>("manage/settings/home"),
    retry: false,
  });
  const people = useQuery({
    queryKey: ["settings", "people"],
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
  const number = (v: number | null | undefined, suffix: string) =>
    v == null
      ? "—"
      : `${v.toLocaleString(lang === "en" ? "en-GB" : "nb-NO", { maximumFractionDigits: 1 })} ${suffix}`;
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
        <h2>{t("Hjem og hjemmesentral", "Home and controller")}</h2>
        <button
          onClick={() => {
            void system.refetch();
            void location.refetch();
            void people.refetch();
          }}
        >
          {t("Oppdater", "Refresh")}
        </button>
      </div>
      {system.isError && (
        <p role="alert">
          {t("Kunne ikke hente systemstatus.", "Could not load system status.")}
        </p>
      )}
      {system.isPending && (
        <p role="status">
          {t("Henter systemstatus …", "Loading system status …")}
        </p>
      )}
      {s && (
        <>
          <p className="muted">
            {smartiName(
              s.host.hostname || t("Hjemmesentral", "Home controller"),
            )}{" "}
            · {smartiName(s.host.operating_system || "SMARTi")}{" "}
            {s.host.kernel ? `· ${s.host.kernel}` : ""}
          </p>
          <div className="system-metrics">
            <article>
              <SystemGraph
                history={s.history || []}
                metric="cpu"
                unit="%"
                lang={lang}
              />
              <Cpu />
              <h3>{t("Prosessor · SMARTi-kjerne", "CPU · SMARTi core")}</h3>
              <strong>{number(s.core.cpu_percent, "%")}</strong>
              <small>
                {t(
                  "Prosessbruk, kan overstige 100 % med flere kjerner",
                  "Process usage, may exceed 100% across multiple cores",
                )}
              </small>
            </article>
            <article>
              <SystemGraph
                history={s.history || []}
                metric="memory"
                unit="%"
                lang={lang}
              />
              <Cpu />
              <h3>{t("Minne · SMARTi-kjerne", "Memory · SMARTi core")}</h3>
              <strong>{number(s.core.memory_percent, "%")}</strong>
              <small>
                {number(
                  s.core.memory_usage == null
                    ? null
                    : s.core.memory_usage / 1048576,
                  "MiB",
                )}{" "}
                /{" "}
                {number(
                  s.core.memory_limit == null
                    ? null
                    : s.core.memory_limit / 1048576,
                  "MiB",
                )}
              </small>
            </article>
            <article>
              <SystemGraph
                history={s.history || []}
                metric="storage"
                unit="GB"
                lang={lang}
              />
              <HardDrive />
              <h3>{t("Lagring · sentralen", "Storage · controller")}</h3>
              <strong>
                {number(s.host.disk_free, "GB")} {t("ledig", "free")}
              </strong>
              {s.host.disk_total != null &&
                s.host.disk_total > 0 &&
                s.host.disk_used != null && (
                  <progress
                    aria-label={t("Brukt lagringsplass", "Used storage")}
                    value={s.host.disk_used}
                    max={s.host.disk_total}
                  />
                )}
              <small>
                {number(s.host.disk_used, "GB")} /{" "}
                {number(s.host.disk_total, "GB")}
              </small>
            </article>
          </div>
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
            <section className="settings-panel">
              <h3>
                <Archive /> {t("Sikkerhetskopier", "Backups")}
              </h3>
              <p className="muted">
                {t(
                  "Oversikt over sikkerhetskopier registrert på sentralen.",
                  "Backups registered on the controller.",
                )}
              </p>
              {s.backups !== null && <SystemActions lang={lang} />}
              {s.backups === null ? (
                <p>
                  {t("Sikkerhetskopier utilgjengelige", "Backups unavailable")}
                </p>
              ) : s.backups.length === 0 ? (
                <p>
                  {t(
                    "Ingen sikkerhetskopier registrert.",
                    "No backups registered.",
                  )}
                </p>
              ) : (
                <div className="system-backups">
                  {[...s.backups]
                    .sort((a, b) => b.date.localeCompare(a.date))
                    .map((b) => (
                      <div className="system-list-row" key={b.slug}>
                        <div>
                          <strong>{smartiName(b.name)}</strong>
                          <small>
                            {new Date(b.date).toLocaleString(
                              lang === "en" ? "en-GB" : "nb-NO",
                            )}{" "}
                            · {number(b.size, "MB")} ·{" "}
                            {b.type === "full"
                              ? t("Full", "Full")
                              : t("Delvis", "Partial")}
                          </small>
                        </div>
                        <span>
                          {b.protected
                            ? t("Beskyttet", "Protected")
                            : t("Uten passord", "No password")}
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </section>
          </div>
        </>
      )}
      <div className="settings-layout">
        <section className="settings-panel">
          <h3>
            <MapPin /> {t("Hjemmets plassering", "Home location")}
          </h3>
          {location.data ? (
            <>
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
        <section className="settings-panel">
          <h3>
            <Users /> {t("Personer i hjemmet", "Household members")}
          </h3>
          <p className="muted">
            {t(
              "Personer brukes til tilstedeværelse. Innloggingskontoer administreres separat nedenfor.",
              "People are used for presence. Login accounts are managed separately below.",
            )}
          </p>
          {people.data ? (
            <>
              <button
                onClick={() => {
                  setError("");
                  setPerson({
                    id: "",
                    name: "",
                    device_trackers: [],
                    editable: true,
                  });
                }}
              >
                <Plus size={17} />
                {t("Legg til person", "Add person")}
              </button>
              {people.data.people.map((p) => (
                <div className="system-list-row" key={p.id}>
                  <div>
                    <strong>{p.name}</strong>
                    <small>
                      {p.device_trackers.length}{" "}
                      {t("tilstedeværelsesenheter", "presence trackers")}
                      {!p.editable ? " · YAML" : ""}
                    </small>
                  </div>
                  <button
                    disabled={!p.editable}
                    onClick={() => {
                      setError("");
                      setPerson({ ...p });
                    }}
                  >
                    {t("Rediger", "Edit")}
                  </button>
                </div>
              ))}
            </>
          ) : (
            <p>
              {t(
                "Kunne ikke hente personer. Krever personintegrasjonen på en tilkoblet sentral.",
                "Could not load people. Requires the person integration on a connected controller.",
              )}
            </p>
          )}
        </section>
      </div>
      <Presence
        home={home}
        offline={!home.connected}
        lang={lang}
        admin={true}
      />
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
