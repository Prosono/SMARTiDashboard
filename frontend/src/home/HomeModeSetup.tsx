import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronRight, LayoutGrid, Plus } from "lucide-react";
import { api, ApiError } from "../api";
import type { Home } from "../types";
import { EntityPicker } from "../manage/EntityPicker";
import { SettingsDialog } from "./SettingsDialog";
import { SceneEditor, type SceneDraft } from "./Scenes";
import { usable } from "./homeModel";
import "./homeModeSetup.css";

export type HomeMode = "home" | "away" | "night" | "holiday";

/** Native scene creation and explicit mode binding. Neither operation runs devices. */
export function HomeModeSetup({
  mode,
  label,
  home,
  offline,
  lang,
  close,
  saved,
}: {
  mode: HomeMode;
  label: string;
  home: Home;
  offline: boolean;
  lang: string;
  close: () => void;
  saved: () => void;
}) {
  const t = (nb: string, en: string) => (lang === "en" ? en : nb);
  const qc = useQueryClient();
  const opener = useRef(document.activeElement as HTMLElement | null);
  useEffect(
    () => () => {
      if (opener.current?.isConnected) opener.current.focus();
    },
    [],
  );
  const [view, setView] = useState<"choice" | "existing" | "create">("choice");
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const created = useRef<string | null>(null);
  const [persisted, setPersisted] = useState(false);
  const [initial] = useState<SceneDraft>(() => ({
    name: label,
    icon: mode === "night" ? "mdi:weather-night" : "mdi:home",
    entities: {},
    revision: "",
    preserved: [],
  }));
  const routines = home.controls.filter((c) =>
    ["scene", "script", "automation"].includes(c.domain),
  );
  const selectedControl = routines.find((c) => c.entity_id === selected);
  const disconnected = offline || !home.connected;
  async function refresh() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["home"] }),
      qc.invalidateQueries({ queryKey: ["home-preferences"] }),
      qc.invalidateQueries({ queryKey: ["scenes"] }),
    ]);
    saved();
  }
  async function bind(id: string, signal?: AbortSignal) {
    await api(`home/modes/${mode}`, "PUT", { control_id: id }, signal);
  }
  async function persist(draft: Omit<SceneDraft, "preserved">) {
    try {
      if (!created.current) {
        const result = await api<{ id: string }>(
          "scenes",
          "POST",
          draft,
          AbortSignal.timeout(35000),
        );
        created.current = result.id;
        setPersisted(true);
      }
      // HA entity IDs are based on names, not the scene's config ID. Wait for
      // registry/state registration and match the exact returned ID, never a name.
      const signal = AbortSignal.timeout(12000);
      for (let attempt = 0; attempt < 6; attempt++) {
        const scenes = await api<{ id: string | null; entity_id: string }[]>(
          "scenes",
          "GET",
          undefined,
          signal,
        );
        const scene = scenes.find((s) => s.id === created.current);
        if (scene) {
          const snapshot = await api<Home>("home", "GET", undefined, signal);
          const control = snapshot.controls.find(
            (c) => c.domain === "scene" && c.entity_id === scene.entity_id,
          );
          if (control) {
            await bind(control.id, signal);
            return;
          }
        }
        if (attempt < 5)
          await new Promise((resolve) => setTimeout(resolve, 500));
      }
      throw new Error("registration_pending");
    } catch (e) {
      if (created.current)
        throw new Error(
          t(
            `Rutinen er lagret, men kunne ikke kobles til ${label}. Trykk «Koble til ${label}» for å prøve koblingen igjen.`,
            `The routine is saved but could not be linked to ${label}. Press “Link to ${label}” to retry the link.`,
          ),
        );
      throw new Error(
        e instanceof ApiError && e.status === 422
          ? t(
              "Kontroller de valgte innstillingene før du lagrer igjen.",
              "Check the selected settings before saving again.",
            )
          : e instanceof ApiError && e.status === 403
            ? t(
                "Du har ikke tilgang til å lage rutiner.",
                "You do not have permission to create routines.",
              )
            : t(
                "Kunne ikke bekrefte lagringen. Kontroller rutinelisten før du prøver igjen.",
                "Could not confirm the save. Check the routine list before retrying.",
              ),
      );
    }
  }
  if (view === "create")
    return (
      <SceneEditor
        initial={initial}
        id={null}
        home={home}
        lang={lang}
        offline={disconnected}
        routine={{ label, persisted }}
        persist={persist}
        close={close}
        saved={refresh}
      />
    );
  return (
    <SettingsDialog
      title={t(`Rutine for ${label}`, `Routine for ${label}`)}
      lang={lang}
      busy={busy}
      compact
      onClose={close}
    >
      <div className="home-mode-setup">
        {view === "choice" ? (
          <>
            <p>
              {t(
                `Hva skal skje når du aktiverer ${label}?`,
                `What should happen when you activate ${label}?`,
              )}
            </p>
            <button
              className="home-mode-choice"
              disabled={disconnected}
              onClick={() => setView("create")}
            >
              <Plus size={22} />
              <span>
                <strong>{t("Lag ny rutine", "Create routine")}</strong>
                <small>
                  {t(
                    "Velg enheter og hva de skal gjøre.",
                    "Choose devices and what they should do.",
                  )}
                </small>
              </span>
              <ChevronRight size={18} />
            </button>
            <button
              className="home-mode-choice"
              disabled={disconnected || !routines.length}
              onClick={() => setView("existing")}
            >
              <LayoutGrid size={22} />
              <span>
                <strong>
                  {t("Velg eksisterende rutine", "Choose existing routine")}
                </strong>
                <small>
                  {routines.length
                    ? t(
                        "Bruk en rutine du allerede har.",
                        "Use a routine you already have.",
                      )
                    : t(
                        "Ingen rutiner å velge ennå.",
                        "No routines to choose yet.",
                      )}
                </small>
              </span>
              <ChevronRight size={18} />
            </button>
          </>
        ) : (
          <>
            <button
              className="home-mode-back"
              disabled={busy}
              onClick={() => {
                setView("choice");
                setError("");
              }}
            >
              <ArrowLeft size={16} />
              {t("Tilbake", "Back")}
            </button>
            <p>
              {t(
                `Velg rutinen som skal kjøres i ${label}-modus.`,
                `Choose the routine to run in ${label} mode.`,
              )}
            </p>
            <fieldset disabled={busy || disconnected}>
              <EntityPicker
                value={selected}
                onChange={setSelected}
                choices={routines}
                home={home}
                lang={lang}
                label={t("Velg rutine", "Choose routine")}
              />
              <button
                className="home-mode-save"
                disabled={!selectedControl || !usable(selectedControl)}
                onClick={async () => {
                  if (!selectedControl || busy) return;
                  setBusy(true);
                  setError("");
                  try {
                    await bind(selectedControl.id);
                    await refresh();
                  } catch {
                    setError(
                      t(
                        "Kunne ikke bekrefte koblingen. Prøv igjen.",
                        "Could not confirm the link. Try again.",
                      ),
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy
                  ? t("Lagrer…", "Saving…")
                  : t(`Bruk i ${label}-modus`, `Use in ${label} mode`)}
              </button>
            </fieldset>
          </>
        )}
        {error && (
          <p className="notice" role="alert">
            {error}
          </p>
        )}
        {disconnected && (
          <p role="alert">
            {t("Hjemmet er frakoblet.", "Home is disconnected.")}
          </p>
        )}
      </div>
    </SettingsDialog>
  );
}
