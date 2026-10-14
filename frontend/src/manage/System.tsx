import { IntegrationLogo } from "./IntegrationLogo";
import { IntegrationSetup } from "./IntegrationSetup";
import { IntegrationDevice } from "./IntegrationDevice";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Download,
  Plug,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Box,
} from "lucide-react";
import { smartiName, integrationName } from "../branding";
import { api } from "../api";
import { Feedback, LoadError, useWork, words } from "./shared";
type Integration = {
  entry_id: string;
  title: string;
  domain: string;
  state: string;
  disabled_by: string | null;
  devices: number;
  device_items?: {
    id: string;
    name: string;
    model: string | null;
    area: string | null;
  }[];
};
type Update = {
  entity_id: string;
  name: string;
  smarti: boolean;
  installed_version: string | null;
  latest_version: string | null;
  state: string;
  in_progress: boolean;
  percentage: number | null;
  pending: boolean;
  can_install: boolean;
  can_backup: boolean;
  summary: string;
};
export function Integrations({ lang }: { lang: string }) {
  const t = (nb: string, en: string) => words(lang, nb, en);
  const q = useQuery({
    queryKey: ["manage", "integrations"],
    queryFn: () => api<Integration[]>("manage/integrations"),
    refetchInterval: 15000,
  });
  const [adding, setAdding] = useState(false);
  const [selectedDevice, selectDevice] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [edit, setEdit] = useState<Integration | null>(null);
  const [name, setName] = useState("");
  const [confirm, setConfirm] = useState<{ id: string; action: string } | null>(
    null,
  );
  const w = useWork(lang);
  async function action(id: string, action: string) {
    await w.run(
      async () => {
        const result = await api<{ require_restart: boolean; status: string }>(
          `manage/integrations/${encodeURIComponent(id)}`,
          "POST",
          {
            action,
            name: edit && name === smartiName(edit.title) ? edit.title : name,
          },
        );
        w.setMessage(
          result.require_restart
            ? t(
                "Endringen krever omstart av systemet for å tre i kraft.",
                "The change requires a system restart.",
              )
            : result.status === "simulated"
              ? t("Endret i demohjemmet.", "Changed in the demo home.")
              : t(
                  "Forespørselen er mottatt. Status oppdateres nedenfor.",
                  "Request accepted. Status refreshes below.",
                ),
        );
      },
      () => {
        setConfirm(null);
        setEdit(null);
      },
    );
  }
  const states: Record<string, string> = {
    loaded: t("Tilkoblet", "Connected"),
    not_loaded: t("Ikke lastet", "Not loaded"),
    setup_retry: t("Prøver på nytt", "Retrying"),
    setup_error: t("Oppsettsfeil", "Setup error"),
    setup_in_progress: t("Starter", "Starting"),
    unload_in_progress: t("Stopper", "Stopping"),
    failed_unload: t("Kunne ikke stoppe", "Could not stop"),
    migration_error: t("Migreringsfeil", "Migration error"),
  };
  const groups = Object.entries(
    (q.data || []).reduce<Record<string, Integration[]>>((all, i) => {
      (all[i.domain] ||= []).push(i);
      return all;
    }, {}),
  ).filter(([domain, entries]) =>
    (
      integrationName(domain) +
      " " +
      domain +
      " " +
      entries
        .map(
          (i) =>
            smartiName(i.title) +
            " " +
            i.title +
            " " +
            (i.device_items || []).map((d) => d.name + " " + d.area).join(" "),
        )
        .join(" ")
    )
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <section>
      {adding && (
        <IntegrationSetup lang={lang} close={() => setAdding(false)} />
      )}
      {selectedDevice && (
        <IntegrationDevice
          id={selectedDevice}
          lang={lang}
          close={() => selectDevice(null)}
        />
      )}
      <div className="page-heading">
        <span className="eyebrow">
          {t("Tjenestene i hjemmet", "Services in your home")}
        </span>
        <h1>{t("Integrasjoner", "Integrations")}</h1>
        <p>
          {t(
            "Se hva som er koblet til, og hold forbindelsene i orden.",
            "See what is connected and manage each connection.",
          )}
        </p>
      </div>
      <Feedback message={w.message} />
      <div className="device-toolbar">
        <button className="primary compact" onClick={() => setAdding(true)}>
          <Plug size={18} />
          {t("Legg til integrasjon", "Add integration")}
        </button>
        <input
          aria-label={t("Søk i integrasjoner", "Search integrations")}
          placeholder={t("Søk i integrasjoner …", "Search integrations …")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button onClick={() => void q.refetch()}>
          <RefreshCw size={17} />
          {t("Oppdater", "Refresh")}
        </button>
      </div>
      {q.isError && <LoadError lang={lang} retry={() => void q.refetch()} />}
      {q.isPending && (
        <p>{t("Henter integrasjoner …", "Loading integrations …")}</p>
      )}
      <div className="integration-grid">
        {groups.map(([domain, entries]) => {
          const open = expanded.has(domain);
          const devices = new Set(
            entries.flatMap((i) => (i.device_items || []).map((d) => d.id)),
          ).size;
          const issues = entries.filter(
            (i) => !i.disabled_by && i.state !== "loaded",
          ).length;
          return (
            <article
              className={"integration-card" + (open ? " expanded" : "")}
              key={domain}
            >
              <div className="integration-card-header">
                <div className="integration-logo">
                  <IntegrationLogo key={domain} domain={domain} />
                </div>
                <div>
                  <h2>
                    {entries.length === 1
                      ? smartiName(entries[0].title)
                      : (
                          {
                            hue: "Philips Hue",
                            mqtt: "MQTT",
                            zwave_js: "Z-Wave JS",
                            bluetooth: "Bluetooth",
                            zha: "Zigbee Home Automation",
                          } as Record<string, string>
                        )[domain] || integrationName(domain)}
                  </h2>
                  <p>
                    {entries.length} {t("oppsett", "connections")} · {devices}{" "}
                    {t("enheter", "devices")}
                  </p>
                  <small>
                    {issues
                      ? t(
                          `${issues} trenger oppmerksomhet`,
                          `${issues} need attention`,
                        )
                      : entries.every((i) => i.disabled_by)
                        ? t("Deaktivert", "Disabled")
                        : t("Tilkoblet", "Connected")}
                  </small>
                </div>
              </div>
              <button
                className="integration-expand"
                type="button"
                aria-expanded={open}
                aria-controls={`integration-${domain}`}
                onClick={() =>
                  setExpanded((old) => {
                    const next = new Set(old);
                    if (open) next.delete(domain);
                    else next.add(domain);
                    return next;
                  })
                }
              >
                {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}{" "}
                {open ? t("Skjul", "Collapse") : t("Utvid", "Expand")}
              </button>
              {open && (
                <div
                  id={`integration-${domain}`}
                  className="integration-entries"
                >
                  {entries.map((i) => (
                    <section className="integration-entry" key={i.entry_id}>
                      <div>
                        <h3>{smartiName(i.title)}</h3>
                        <span className="status-label">
                          {i.disabled_by
                            ? t("Deaktivert", "Disabled")
                            : states[i.state] ||
                              t("Ukjent status", "Unknown status")}
                        </span>
                      </div>
                      <ul className="integration-devices">
                        {(i.device_items || []).map((d) => (
                          <li key={d.id}>
                            <button
                              className="integration-device-open"
                              onClick={() => selectDevice(d.id)}
                              aria-label={`${t("Åpne enhet", "Open device")}: ${smartiName(d.name)}`}
                            >
                              <Box size={19} />
                              <div>
                                <strong>{smartiName(d.name)}</strong>
                                <small>
                                  {smartiName(
                                    [
                                      d.area || t("Uten rom", "No room"),
                                      d.model,
                                    ]
                                      .filter(Boolean)
                                      .join(" · "),
                                  )}
                                </small>
                              </div>
                            </button>
                          </li>
                        ))}
                      </ul>
                      {!i.device_items?.length && (
                        <p className="integration-empty">
                          {t(
                            "Ingen registrerte enheter. Integrasjonen kan fortsatt tilby tjenester og entiteter.",
                            "No registered devices. This integration may still provide services and entities.",
                          )}
                        </p>
                      )}
                      <div className="row-actions">
                        <button
                          disabled={w.busy}
                          onClick={() => {
                            setEdit(i);
                            setName(smartiName(i.title));
                          }}
                        >
                          {t("Endre navn", "Rename")}
                        </button>
                        <button
                          disabled={w.busy || !!i.disabled_by}
                          onClick={() =>
                            setConfirm({ id: i.entry_id, action: "reload" })
                          }
                        >
                          {t("Last på nytt", "Reload")}
                        </button>
                        <button
                          disabled={w.busy}
                          onClick={() =>
                            setConfirm({
                              id: i.entry_id,
                              action: i.disabled_by ? "enable" : "disable",
                            })
                          }
                        >
                          {i.disabled_by
                            ? t("Aktiver", "Enable")
                            : t("Deaktiver", "Disable")}
                        </button>
                      </div>
                      {edit?.entry_id === i.entry_id && (
                        <form
                          className="inline-form full-row"
                          onSubmit={(e) => {
                            e.preventDefault();
                            void action(i.entry_id, "rename");
                          }}
                        >
                          <label>
                            {t("Navn", "Name")}
                            <input
                              maxLength={80}
                              required
                              value={name}
                              onChange={(e) => setName(e.target.value)}
                            />
                          </label>
                          <button disabled={w.busy || !name.trim()}>
                            {t("Lagre", "Save")}
                          </button>
                          <button type="button" onClick={() => setEdit(null)}>
                            {t("Avbryt", "Cancel")}
                          </button>
                        </form>
                      )}
                      {confirm?.id === i.entry_id && (
                        <div className="inline-confirm full-row">
                          <p>
                            {t(
                              "Dette kan midlertidig gjøre tilknyttede enheter og automasjoner utilgjengelige.",
                              "This may temporarily affect connected devices and automations.",
                            )}
                          </p>
                          <button
                            disabled={w.busy}
                            onClick={() =>
                              void action(i.entry_id, confirm.action)
                            }
                          >
                            {t("Bekreft", "Confirm")}
                          </button>
                          <button onClick={() => setConfirm(null)}>
                            {t("Avbryt", "Cancel")}
                          </button>
                        </div>
                      )}
                    </section>
                  ))}
                </div>
              )}
            </article>
          );
        })}
      </div>
      {q.data && q.data.length > 0 && !groups.length && (
        <p>
          {t(
            "Ingen integrasjoner eller enheter passer søket.",
            "No integrations or devices match your search.",
          )}
        </p>
      )}
      {q.data?.length === 0 && (
        <p>
          {t(
            "Ingen konfigurerte integrasjoner funnet.",
            "No configured integrations found.",
          )}
        </p>
      )}
    </section>
  );
}
export function Updates({ lang }: { lang: string }) {
  const t = (nb: string, en: string) => words(lang, nb, en);
  const q = useQuery({
    queryKey: ["manage", "updates"],
    queryFn: () => api<Update[]>("manage/updates"),
    refetchInterval: 4000,
  });
  const [selected, select] = useState<Update | null>(null);
  const [backup, setBackup] = useState(false);
  const w = useWork(lang);
  const available = q.data?.filter(
    (u) => (u.state === "on" && u.can_install) || u.in_progress || u.pending,
  );
  return (
    <section>
      <div className="page-heading">
        <span className="eyebrow">SMARTi</span>
        <h1>{t("Hold hjemmet oppdatert.", "Keep your home up to date.")}</h1>
        <p>
          {t(
            "System, apper og enheter samlet på ett sted.",
            "System, apps and devices in one place.",
          )}
        </p>
      </div>
      <Feedback message={w.message} />
      {q.isError && <LoadError lang={lang} retry={() => void q.refetch()} />}
      {q.isPending && <p>{t("Henter oppdateringer …", "Loading updates …")}</p>}
      <div className="management-rows">
        {available?.map((u) => (
          <article className="system-row" key={u.entity_id}>
            {u.smarti || smartiName(u.name) !== u.name ? (
              <img
                className="update-logo"
                src="./brand/smarti-logo.png"
                alt="SMARTi"
              />
            ) : (
              <Download size={25} />
            )}
            <div>
              <h2>{smartiName(u.name)}</h2>
              <p>
                {u.installed_version || "–"} → {u.latest_version || "–"}
              </p>
              <span role="status">
                {u.in_progress
                  ? t("Installerer …", "Installing …")
                  : u.pending
                    ? t(
                        "Installasjon er forespurt. Venter på status …",
                        "Installation requested. Waiting for status …",
                      )
                    : u.state === "on"
                      ? t("Ny versjon tilgjengelig", "New version available")
                      : u.state === "off"
                        ? t("Oppdatert", "Up to date")
                        : t("Status ukjent", "Status unknown")}
                {u.in_progress && u.percentage != null
                  ? ` ${u.percentage}%`
                  : ""}
              </span>
            </div>
            <button
              className="primary compact"
              disabled={
                w.busy ||
                !u.can_install ||
                u.state !== "on" ||
                u.in_progress ||
                u.pending
              }
              onClick={() => {
                select(u);
                setBackup(u.can_backup);
              }}
            >
              {t("Installer", "Install")}
            </button>
            {u.summary && (
              <details className="full-row">
                <summary>{t("Om versjonen", "About this version")}</summary>
                <p className="preserve-text">{smartiName(u.summary)}</p>
              </details>
            )}
            {selected?.entity_id === u.entity_id && (
              <div className="inline-confirm full-row">
                <h3>
                  {t("Installer ", "Install ")}
                  {selected.latest_version}?
                </h3>
                <p>
                  {t(
                    "Oppdateringen kan starte komponenten på nytt og avbryte styringen midlertidig.",
                    "The update may restart the component and temporarily interrupt control.",
                  )}
                </p>
                {selected.can_backup && (
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={backup}
                      onChange={(e) => setBackup(e.target.checked)}
                    />
                    {t(
                      "Ta sikkerhetskopi før installasjon",
                      "Back up before installation",
                    )}
                  </label>
                )}
                <button
                  className="primary compact"
                  disabled={w.busy}
                  onClick={() =>
                    void w.run(
                      async () => {
                        const result = await api<{ status: string }>(
                          `manage/updates/${encodeURIComponent(u.entity_id)}/install`,
                          "POST",
                          { version: selected.latest_version, backup },
                        );
                        w.setMessage(
                          result.status === "simulated"
                            ? t(
                                "Simulert i demohjemmet. Ingen programvare ble installert.",
                                "Simulated in the demo home. No software was installed.",
                              )
                            : t(
                                "Installasjon forespurt. Vent på oppdatert status.",
                                "Installation requested. Wait for updated status.",
                              ),
                        );
                      },
                      () => select(null),
                    )
                  }
                >
                  {t("Bekreft installasjon", "Confirm installation")}
                </button>
                <button onClick={() => select(null)}>
                  {t("Avbryt", "Cancel")}
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
      {available?.length === 0 && (
        <p className="empty">
          {t(
            "Alt er oppdatert. Ingen tilgjengelige oppdateringer.",
            "Everything is up to date. No updates available.",
          )}
        </p>
      )}
    </section>
  );
}
