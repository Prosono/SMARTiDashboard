import { IntegrationSetup } from "./manage/IntegrationSetup";
import { allViews, allControls } from "./access";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Layers, Pencil, Trash2 } from "lucide-react";
import { api, ApiError } from "./api";
import type { Home, Control } from "./types";
import { SettingsDialog } from "./home/SettingsDialog";
import { LightColor } from "./LightColor";
import { controlState } from "./controlState";
import "./groups.css";
type Group = {
  id: string;
  name: string;
  entities: string[];
  revision: string;
  source: "smarti" | "home_assistant";
  config_entry_id?: string | null;
  actions: string[];
  available: boolean;
};
type Draft = {
  id?: string;
  name: string;
  entities: string[];
  revision: string;
};
export function Groups({
  home,
  lang,
  admin,
}: {
  home: Home;
  lang: string;
  admin: boolean;
}) {
  const t = (nb: string, en: string) => (lang === "en" ? en : nb),
    qc = useQueryClient();
  const q = useQuery({
    queryKey: ["groups"],
    enabled: allViews(home),
    queryFn: () => api<Group[]>("groups"),
    refetchInterval: 15000,
  });
  const [nativeEditor, editNative] = useState<string | null>(null);
  function openEditor(g: Group) {
    setOpened(null);
    setError("");
    setSearch("");
    if (g.source === "home_assistant") editNative(g.id.slice(3));
    else
      edit({
        id: g.id,
        name: g.name,
        entities: g.entities,
        revision: g.revision,
      });
  }
  const [editor, edit] = useState<Draft | null>(null),
    [opened, setOpened] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [search, setSearch] = useState("");
  const candidates = home.controls.filter(
    (c) =>
      !c.diagnostic &&
      [
        "light",
        "switch",
        "climate",
        "sensor",
        "binary_sensor",
        "media_player",
        "cover",
      ].includes(c.domain),
  );
  const current = q.data?.find((g) => g.id === opened);
  async function save() {
    if (!editor || busy) return;
    setBusy(true);
    setError("");
    try {
      const { id, ...body } = editor;
      await api(id ? `groups/${id}` : "groups", id ? "PUT" : "POST", body);
      await q.refetch();
      edit(null);
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 409
          ? t(
              "Gruppen er endret et annet sted. Åpne den på nytt.",
              "The group changed elsewhere. Reopen it.",
            )
          : t(
              "Kunne ikke lagre gruppen. Prøv igjen.",
              "Could not save group. Try again.",
            ),
      );
    } finally {
      setBusy(false);
    }
  }
  async function send(g: Group, action: string, value?: number | number[]) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const r = await api<{ results: { entity_id: string; status: string }[] }>(
        `groups/${g.id}/commands`,
        "POST",
        { action, ...(value === undefined ? {} : { value }) },
      );
      const failed = r.results.filter((v) => v.status === "failed");
      const pending = r.results.filter(
        (v) => v.status === "accepted_unconfirmed",
      );
      setMessage(
        failed.length
          ? t(
              `${failed.length} av ${r.results.length} handlinger feilet. Kontroller enhetene før nytt forsøk.`,
              `${failed.length} of ${r.results.length} actions failed. Check devices before retrying.`,
            )
          : pending.length
            ? t(
                "Sendt – noen enheter har ikke bekreftet tilstanden ennå.",
                "Sent – some devices have not confirmed their state yet.",
              )
            : r.results.every((v) => v.status === "simulated")
              ? t("Simulert i demohjemmet.", "Simulated in demo.")
              : t(
                  "Enhetenes tilstander er oppdatert.",
                  "Device states updated.",
                ),
      );
      await qc.invalidateQueries({ queryKey: ["home"] });
      await q.refetch();
    } catch {
      setMessage(
        t(
          "Kunne ikke styre gruppen. Kontroller tilkoblingen og medlemslisten.",
          "Could not control group. Check connection and members.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  async function remove(g: Group) {
    if (
      !window.confirm(
        t(
          `Slette gruppen «${g.name}»? Enhetene beholdes.`,
          `Delete group “${g.name}”? Devices are kept.`,
        ),
      )
    )
      return;
    setBusy(true);
    try {
      await api(
        `groups/${g.id}?revision=${encodeURIComponent(g.revision)}`,
        "DELETE",
      );
      await q.refetch();
      setOpened(null);
    } catch {
      setMessage(
        t(
          "Kunne ikke slette gruppen. Oppdater og prøv igjen.",
          "Could not delete group. Refresh and retry.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  const actions = (g: Group) => {
    const blocked =
      !allControls(home) || busy || !home.connected || !g.available;
    const colorControl: Control = {
      id: g.id,
      entity_id: g.id,
      name: g.name,
      domain: "light",
      state: "unknown",
      attributes: {},
      capabilities: g.actions.includes("set_rgb_color")
        ? [
            {
              kind: "color",
              actions: ["set_rgb_color"],
              minimum: null,
              maximum: null,
              step: null,
              unit: null,
            },
          ]
        : [],
      availability: g.available ? "available" : "unavailable",
      diagnostic: false,
      device_id: null,
      area_id: null,
      updated_at: null,
      integration: null,
    };
    return (
      <div className="group-actions">
        {g.actions.includes("turn_on") && (
          <button disabled={blocked} onClick={() => void send(g, "turn_on")}>
            {t("Slå på alle", "Turn all on")}
          </button>
        )}
        {g.actions.includes("turn_off") && (
          <button disabled={blocked} onClick={() => void send(g, "turn_off")}>
            {t("Slå av alle", "Turn all off")}
          </button>
        )}
        {g.actions.includes("set_brightness") && (
          <label>
            {t("Felles lysstyrke", "Group brightness")}
            <select
              aria-label={t("Felles lysstyrke", "Group brightness")}
              value=""
              disabled={blocked}
              onChange={(e) =>
                void send(g, "set_brightness", Number(e.target.value))
              }
            >
              <option value="">{t("Velg …", "Choose …")}</option>
              {[10, 25, 50, 75, 100].map((v) => (
                <option key={v} value={v}>
                  {v}%
                </option>
              ))}
            </select>
          </label>
        )}
        {g.actions.includes("set_rgb_color") && (
          <LightColor
            c={colorControl}
            lang={lang}
            disabled={blocked}
            change={(action, value) => void send(g, action, value)}
          />
        )}
        {!g.actions.length && (
          <small>
            {t(
              "Medlemmene har ingen felles styring. Du kan fortsatt samle dem i denne oversikten.",
              "Members have no shared controls. You can still organize them here.",
            )}
          </small>
        )}
      </div>
    );
  };
  if (!allViews(home)) return null;
  return (
    <section className="control-groups">
      <header>
        <div>
          <span className="eyebrow">SMARTi</span>
          <h2>
            {t("Enheter som hører sammen", "Devices that belong together")}
          </h2>
          <p>
            {t(
              "Dine grupper fra hjemmesentralen og SMARTi, samlet på ett sted.",
              "Your hub and SMARTi groups, together in one place.",
            )}
          </p>
        </div>
        {admin && (
          <button
            className="primary"
            onClick={() => {
              setError("");
              setSearch("");
              edit({ name: "", entities: [], revision: "" });
            }}
          >
            <Plus size={18} />
            {t("Lag gruppe", "Create group")}
          </button>
        )}
      </header>
      {message && <p role="status">{message}</p>}
      {q.isPending && (
        <p role="status">{t("Henter grupper …", "Loading groups …")}</p>
      )}
      {q.isError && (
        <p role="alert">
          {t("Kunne ikke hente gruppene.", "Could not load groups.")}
          <button onClick={() => void q.refetch()}>
            {t("Prøv igjen", "Retry")}
          </button>
        </p>
      )}
      {q.data?.length === 0 && (
        <div className="groups-empty">
          <Layers size={36} />
          <h3>
            {t("Alt stuelyset. Ett trykk.", "All living-room lights. One tap.")}
          </h3>
          <p>
            {t(
              "Lag den første gruppen, gi den et navn og velg enhetene som skal være med.",
              "Create your first group, give it a name and choose its devices.",
            )}
          </p>
        </div>
      )}
      <div className="groups-grid">
        {q.data?.map((g) => (
          <article key={g.id}>
            <button
              className="group-open"
              onClick={() => {
                setMessage("");
                setOpened(g.id);
              }}
            >
              <Layers size={24} />
              <span>
                <strong>{g.name}</strong>
                <small>
                  {g.source === "home_assistant"
                    ? t("Fra hjemmesentralen", "From the hub")
                    : "SMARTi"}{" "}
                  · {g.entities.length} {t("kontroller", "controls")} ·{" "}
                  {g.available
                    ? t("Tilgjengelig", "Available")
                    : t(
                        "Noen enheter er utilgjengelige",
                        "Some devices unavailable",
                      )}
                </small>
              </span>
            </button>
            {actions(g)}
            {admin && (g.source !== "home_assistant" || g.config_entry_id) && (
              <button
                className="group-edit-button"
                onClick={() => openEditor(g)}
                disabled={busy}
              >
                <Pencil size={16} />
                {t("Rediger gruppe", "Edit group")}
              </button>
            )}
          </article>
        ))}
      </div>
      {current && (
        <SettingsDialog
          title={current.name}
          lang={lang}
          busy={busy}
          onClose={() => setOpened(null)}
        >
          {message && <p role="status">{message}</p>}
          {actions(current)}
          <ul className="group-members">
            {current.entities.map((eid) => {
              const c = home.controls.find((c) => c.entity_id === eid);
              return (
                <li key={eid}>
                  <strong>{c?.name || eid}</strong>
                  <span>
                    {c
                      ? controlState(c, c.state, lang)
                      : t("Ikke tilgjengelig", "Unavailable")}
                  </span>
                </li>
              );
            })}
          </ul>
          {current.source === "home_assistant" && !current.config_entry_id && (
            <p>
              {t(
                "Denne gruppen synkroniseres fra hjemmesentralen. Navn og medlemmer administreres der gruppen ble opprettet.",
                "This group syncs from your hub. Manage its name and members where it was created.",
              )}
            </p>
          )}
          {admin && current.config_entry_id && (
            <button onClick={() => openEditor(current)}>
              <Pencil size={16} />
              {t("Rediger gruppe", "Edit group")}
            </button>
          )}
          {admin && current.source !== "home_assistant" && (
            <div className="group-actions">
              <button
                disabled={busy}
                onClick={() => {
                  edit({
                    id: current.id,
                    name: current.name,
                    entities: current.entities,
                    revision: current.revision,
                  });
                  setOpened(null);
                  setSearch("");
                  setError("");
                }}
              >
                <Pencil size={16} />
                {t("Rediger gruppe", "Edit group")}
              </button>
              <button disabled={busy} onClick={() => void remove(current)}>
                <Trash2 size={16} />
                {t("Slett gruppe", "Delete group")}
              </button>
            </div>
          )}
        </SettingsDialog>
      )}
      {nativeEditor && (
        <IntegrationSetup
          lang={lang}
          home={home}
          groupEntity={nativeEditor}
          close={() => {
            editNative(null);
            void q.refetch();
            void qc.invalidateQueries({ queryKey: ["home"] });
          }}
        />
      )}
      {editor && (
        <SettingsDialog
          title={
            editor.id
              ? t("Rediger gruppe", "Edit group")
              : t("Ny gruppe", "New group")
          }
          lang={lang}
          busy={busy}
          onClose={() => edit(null)}
        >
          <form
            className="group-editor"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            {error && <p role="alert">{error}</p>}
            <label>
              {t("Gruppenavn", "Group name")}
              <input
                required
                maxLength={80}
                value={editor.name}
                onChange={(e) => edit({ ...editor, name: e.target.value })}
              />
            </label>
            <label>
              {t("Søk etter enhet", "Search devices")}
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <p>
              {editor.entities.length}/50 {t("valgt", "selected")}
            </p>
            <div className="group-picker">
              {candidates
                .filter((c) =>
                  c.name
                    .toLocaleLowerCase()
                    .includes(search.toLocaleLowerCase()),
                )
                .map((c) => (
                  <label key={c.entity_id}>
                    <input
                      type="checkbox"
                      checked={editor.entities.includes(c.entity_id)}
                      disabled={
                        busy ||
                        (!editor.entities.includes(c.entity_id) &&
                          editor.entities.length >= 50)
                      }
                      onChange={(e) =>
                        edit({
                          ...editor,
                          entities: e.target.checked
                            ? [...editor.entities, c.entity_id]
                            : editor.entities.filter(
                                (id) => id !== c.entity_id,
                              ),
                        })
                      }
                    />
                    <span>
                      {c.name}
                      <small>
                        {home.areas.find((a) => a.area_id === c.area_id)
                          ?.name || t("Uten rom", "No room")}
                      </small>
                    </span>
                  </label>
                ))}
            </div>
            {editor.entities
              .filter((id) => !candidates.some((c) => c.entity_id === id))
              .map((id) => (
                <button
                  type="button"
                  key={id}
                  onClick={() =>
                    edit({
                      ...editor,
                      entities: editor.entities.filter((eid) => eid !== id),
                    })
                  }
                >
                  {t("Fjern manglende enhet", "Remove missing device")}: {id}
                </button>
              ))}
            <button
              className="primary"
              disabled={busy || !editor.name.trim() || !editor.entities.length}
            >
              {t("Lagre gruppe", "Save group")}
            </button>
          </form>
        </SettingsDialog>
      )}
    </section>
  );
}
