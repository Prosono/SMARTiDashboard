import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, MapPin } from "lucide-react";
import { api } from "../api";
import { SettingsDialog } from "../home/SettingsDialog";
import { HomeMap } from "./HomeMap";
type Zone = {
  id?: string;
  name: string;
  latitude: number;
  longitude: number;
  radius: number;
  passive: boolean;
};
export function Zones({
  latitude,
  longitude,
  lang,
}: {
  latitude: number;
  longitude: number;
  lang: string;
}) {
  const t = (nb: string, en: string) => (lang === "en" ? en : nb);
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["settings", "zones"],
    queryFn: () => api<Zone[]>("manage/settings/zones"),
    retry: false,
  });
  const [draft, setDraft] = useState<Zone | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  function open(zone: Zone) {
    setError("");
    setDeleting(false);
    setDraft({ ...zone });
  }
  async function save(remove = false) {
    if (!draft) return;
    setBusy(true);
    setError("");
    const { id, ...body } = draft;
    try {
      await api(
        `manage/settings/zones${id ? `/${encodeURIComponent(id)}` : ""}`,
        remove ? "DELETE" : id ? "PUT" : "POST",
        remove ? undefined : body,
      );
      await qc.invalidateQueries({ queryKey: ["settings", "zones"] });
      setDraft(null);
    } catch {
      setError(
        t(
          "Kunne ikke lagre endringen. Kontroller forbindelsen og prøv igjen.",
          "Could not save the change. Check your connection and retry.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="zone-settings">
      <header>
        <strong>{t("Egne soner", "Your zones")}</strong>
        <button
          disabled={query.isError || query.isPending}
          onClick={() =>
            open({ name: "", latitude, longitude, radius: 100, passive: false })
          }
        >
          <Plus size={16} />
          {t("Ny sone", "New zone")}
        </button>
      </header>
      <p className="muted">
        {t(
          "Jobb, skole eller hytta — steder som kan brukes til tilstedeværelse og automasjoner.",
          "Work, school or your cabin — places for presence and automations.",
        )}
      </p>
      {query.isPending && (
        <p role="status">{t("Henter soner …", "Loading zones …")}</p>
      )}
      {query.isError && (
        <p role="alert">
          {t("Kunne ikke hente sonene.", "Could not load zones.")}{" "}
          <button onClick={() => void query.refetch()}>
            {t("Prøv igjen", "Retry")}
          </button>
        </p>
      )}
      {Array.isArray(query.data) &&
        query.data.map((z) => (
          <div className="zone-row" key={z.id}>
            <MapPin size={19} />
            <span>
              <strong>{z.name}</strong>
              <small>
                {z.radius} m ·{" "}
                {z.passive
                  ? t("Kun automasjoner", "Automations only")
                  : t("Tilstedeværelse", "Presence")}
              </small>
            </span>
            <button
              onClick={() => open(z)}
              aria-label={`${t("Endre", "Edit")} ${z.name}`}
            >
              {t("Endre", "Edit")}
            </button>
          </div>
        ))}
      {query.data?.length === 0 && (
        <small>
          {t(
            "Ingen egne soner ennå. Legg til ditt første sted.",
            "No zones yet. Add your first place.",
          )}
        </small>
      )}
      {draft && (
        <SettingsDialog
          lang={lang}
          title={
            deleting
              ? t("Slett sone?", "Delete zone?")
              : draft.id
                ? t("Rediger sone", "Edit zone")
                : t("Ny sone", "New zone")
          }
          busy={busy}
          onClose={() => setDraft(null)}
        >
          {error && <p role="alert">{error}</p>}
          {deleting ? (
            <>
              <p>
                {t(
                  `Slette «${draft.name}»? Automasjoner som bruker denne sonen må oppdateres.`,
                  `Delete “${draft.name}”? Automations using this zone will need updating.`,
                )}
              </p>
              <button disabled={busy} onClick={() => setDeleting(false)}>
                {t("Tilbake", "Back")}
              </button>
              <button disabled={busy} onClick={() => void save(true)}>
                {t("Slett sone", "Delete zone")}
              </button>
            </>
          ) : (
            <form
              className="system-settings-form"
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              <fieldset
                disabled={busy}
                style={{
                  border: 0,
                  padding: 0,
                  margin: 0,
                  display: "grid",
                  gap: 16,
                }}
              >
                <label>
                  {t("Navn på sonen", "Zone name")}
                  <input
                    required
                    maxLength={80}
                    value={draft.name}
                    placeholder={t("For eksempel Jobb", "For example Work")}
                    onChange={(e) =>
                      setDraft({ ...draft, name: e.target.value })
                    }
                  />
                </label>
                <HomeMap
                  {...draft}
                  zones={query.data?.filter(
                    (zone) => !draft.id || zone.id !== draft.id,
                  )}
                  lang={lang}
                  onChange={(point) => {
                    if (!busy) setDraft({ ...draft, ...point });
                  }}
                />
                <label>
                  {t("Radius (meter)", "Radius (meters)")}
                  <input
                    type="number"
                    min={1}
                    max={100000}
                    required
                    value={draft.radius}
                    onChange={(e) =>
                      setDraft({ ...draft, radius: e.target.valueAsNumber })
                    }
                  />
                </label>
                <details>
                  <summary>
                    {t("Nøyaktige koordinater", "Exact coordinates")}
                  </summary>
                  {(["latitude", "longitude"] as const).map((key) => (
                    <label key={key}>
                      {key === "latitude"
                        ? t("Breddegrad", "Latitude")
                        : t("Lengdegrad", "Longitude")}
                      <input
                        type="number"
                        required
                        min={key === "latitude" ? -90 : -180}
                        max={key === "latitude" ? 90 : 180}
                        step="any"
                        value={draft[key]}
                        onChange={(e) =>
                          setDraft({ ...draft, [key]: e.target.valueAsNumber })
                        }
                      />
                    </label>
                  ))}
                </details>
                <label>
                  <input
                    type="checkbox"
                    checked={draft.passive}
                    onChange={(e) =>
                      setDraft({ ...draft, passive: e.target.checked })
                    }
                  />
                  {t("Kun til automasjoner", "For automations only")}
                </label>
                <small>
                  {t(
                    "Når dette er valgt, endrer ikke sonen personers viste plassering.",
                    "When selected, this zone does not change people's displayed location.",
                  )}
                </small>
                <button className="primary compact" type="submit">
                  {busy
                    ? t("Lagrer …", "Saving …")
                    : t("Lagre sone", "Save zone")}
                </button>
                {draft.id && (
                  <button type="button" onClick={() => setDeleting(true)}>
                    {t("Slett sone", "Delete zone")}
                  </button>
                )}
              </fieldset>
            </form>
          )}
        </SettingsDialog>
      )}
    </div>
  );
}
