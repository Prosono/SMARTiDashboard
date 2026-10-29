import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff } from "lucide-react";
import { api } from "./api";
import type { Control } from "./types";
import { SettingsDialog } from "./home/SettingsDialog";
import "./controlVisibility.css";
async function changeVisibility(c: Control, hidden: boolean) {
  await api(`controls/${encodeURIComponent(c.entity_id)}/visibility`, "PUT", {
    hidden,
  });
}
export function HideControl({
  c,
  lang,
  disabled,
}: {
  c: Control;
  lang: string;
  disabled: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const qc = useQueryClient();
  const en = lang === "en";
  return (
    <div className="control-visibility-action">
      <button
        disabled={disabled || busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await changeVisibility(c, true);
            await qc.invalidateQueries({ queryKey: ["home"] });
            await qc.invalidateQueries({ queryKey: ["control-visibility"] });
          } catch {
            setError(
              en
                ? "Could not hide device. Try again."
                : "Kunne ikke skjule enheten. Prøv igjen.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <EyeOff size={17} />
        {en ? "Hide device" : "Skjul enhet"}
      </button>
      <small>
        {en
          ? "Restore it under Devices → Hidden devices. Automations keep running."
          : "Hentes tilbake under Enheter → Skjulte enheter. Automasjoner fortsetter å kjøre."}
      </small>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
export function HiddenControls({ lang }: { lang: string }) {
  const [open, setOpen] = useState(false),
    [search, setSearch] = useState(""),
    [all, setAll] = useState(false),
    [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  const en = lang === "en",
    qc = useQueryClient();
  const data = useQuery({
    queryKey: ["control-visibility"],
    queryFn: () => api<Control[]>("control-visibility"),
    enabled: open,
  });
  const items = (data.data || []).filter(
    (c) =>
      (all || c.attributes.smarti_hidden) &&
      `${c.name} ${c.domain}`
        .toLocaleLowerCase()
        .includes(search.toLocaleLowerCase()),
  );
  return (
    <>
      <button className="hidden-controls-open" onClick={() => setOpen(true)}>
        <EyeOff size={18} />
        {en ? "Hidden devices" : "Skjulte enheter"}
      </button>
      {open && (
        <SettingsDialog
          title={en ? "Device visibility" : "Synlighet for enheter"}
          lang={lang}
          onClose={() => setOpen(false)}
        >
          <div className="visibility-manager">
            <p>
              {en
                ? "Hidden devices are excluded from pages and device counts for everyone in this home. Automations are unaffected."
                : "Skjulte enheter utelates fra sidene og enhetsstatistikken for alle i hjemmet. Automasjoner påvirkes ikke."}
            </p>
            <input
              aria-label={en ? "Search devices" : "Søk etter enheter"}
              placeholder={en ? "Search devices…" : "Søk etter enheter…"}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <label>
              <input
                type="checkbox"
                checked={all}
                onChange={(e) => setAll(e.target.checked)}
              />
              {en
                ? "Show all devices to organize"
                : "Vis alle enheter for å organisere"}
            </label>
            {data.isPending && <p>{en ? "Loading…" : "Laster…"}</p>}
            {data.isError && (
              <p role="alert">
                {en ? "Could not load devices." : "Kunne ikke hente enheter."}
                <button onClick={() => void data.refetch()}>
                  {en ? "Retry" : "Prøv igjen"}
                </button>
              </p>
            )}
            {error && <p role="alert">{error}</p>}
            {!data.isPending && !data.isError && !items.length && (
              <p>
                {en
                  ? "No devices in this selection."
                  : "Ingen enheter i dette utvalget."}
              </p>
            )}
            <ul>
              {items.map((c) => (
                <li key={c.id}>
                  <span>
                    <strong>{c.name}</strong>
                    <small>
                      {c.domain} · {c.entity_id}
                    </small>
                  </span>
                  <button
                    disabled={!!busy}
                    onClick={async () => {
                      setBusy(c.id);
                      setError("");
                      try {
                        await changeVisibility(c, !c.attributes.smarti_hidden);
                        await qc.invalidateQueries({ queryKey: ["home"] });
                        await data.refetch();
                      } catch {
                        setError(
                          en
                            ? "Could not save. Try again."
                            : "Kunne ikke lagre. Prøv igjen.",
                        );
                      } finally {
                        setBusy("");
                      }
                    }}
                  >
                    {c.attributes.smarti_hidden ? (
                      <Eye size={18} />
                    ) : (
                      <EyeOff size={18} />
                    )}{" "}
                    {c.attributes.smarti_hidden
                      ? en
                        ? "Show again"
                        : "Vis igjen"
                      : en
                        ? "Hide"
                        : "Skjul"}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </SettingsDialog>
      )}
    </>
  );
}
