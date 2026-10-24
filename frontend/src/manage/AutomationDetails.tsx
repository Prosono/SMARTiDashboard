import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Workflow,
  Lightbulb,
  Sun,
  Moon,
  House,
  Thermometer,
  Shield,
  LockKeyhole,
  DoorOpen,
  PersonStanding,
  Music2,
  Zap,
  Clock3,
  Leaf,
  Blinds,
  Bot,
  Pencil,
  Radio,
  CalendarClock,
} from "lucide-react";
import { api } from "../api";
import type { Home } from "../types";
import { SettingsDialog } from "../home/SettingsDialog";
import { Feedback, useWork, words } from "./shared";
import { flowSummary } from "./AutomationFlow";

const icons = [
  ["auto", Workflow, "Rutine", "Routine"],
  ["light", Lightbulb, "Lys", "Lights"],
  ["sun", Sun, "Sol", "Sun"],
  ["moon", Moon, "Natt", "Night"],
  ["home", House, "Hjem", "Home"],
  ["climate", Thermometer, "Klima", "Climate"],
  ["shield", Shield, "Sikkerhet", "Security"],
  ["lock", LockKeyhole, "Lås", "Lock"],
  ["door", DoorOpen, "Dør", "Door"],
  ["motion", PersonStanding, "Bevegelse", "Motion"],
  ["music", Music2, "Musikk", "Music"],
  ["energy", Zap, "Energi", "Energy"],
  ["clock", Clock3, "Tid", "Time"],
  ["leaf", Leaf, "Miljø", "Environment"],
  ["blinds", Blinds, "Solskjerming", "Blinds"],
  ["vacuum", Bot, "Rengjøring", "Cleaning"],
] as const;

export function AutomationIcon({
  entityId,
  name,
  icon,
  lang,
}: {
  entityId: string;
  name: string;
  icon?: string;
  lang: string;
}) {
  const [open, setOpen] = useState(false);
  const w = useWork(lang);
  const t = (nb: string, en: string) => words(lang, nb, en);
  const selected = icons.find((i) => i[0] === icon) || icons[0];
  const Icon = selected[1];
  return (
    <>
      <button
        className="automation-symbol automation-icon-button"
        data-icon={selected[0]}
        aria-label={`${t("Velg ikon for", "Choose icon for")} ${name}`}
        title={t("Velg ikon", "Choose icon")}
        onClick={() => setOpen(true)}
      >
        <Icon size={25} />
        <Pencil className="automation-icon-edit" size={11} />
      </button>
      {open && (
        <SettingsDialog
          title={`${t("Velg ikon", "Choose icon")} · ${name}`}
          lang={lang}
          compact
          busy={w.busy}
          onClose={() => setOpen(false)}
        >
          <p className="muted">
            {t(
              "Gi rutinen et symbol som er lett å kjenne igjen.",
              "Give this routine a symbol that is easy to recognize.",
            )}
          </p>
          <div className="automation-icon-picker">
            {icons.map(([id, Choice, nb, en]) => (
              <button
                key={id}
                data-icon={id}
                aria-pressed={selected[0] === id}
                disabled={w.busy}
                onClick={() =>
                  void w.run(
                    () =>
                      api(
                        `manage/automation-appearance/${encodeURIComponent(entityId)}`,
                        "PUT",
                        { icon: id },
                      ),
                    () => setOpen(false),
                  )
                }
              >
                <Choice size={26} />
                <span>{t(nb, en)}</span>
              </button>
            ))}
          </div>
          <Feedback message={w.message} />
        </SettingsDialog>
      )}
    </>
  );
}

export function triggerItems(
  config: Record<string, any>,
): Record<string, any>[] {
  const value = config.triggers ?? config.trigger ?? [];
  return (Array.isArray(value) ? value : [value]).flatMap((row) =>
    row && typeof row === "object" && Array.isArray(row.triggers)
      ? triggerItems(row)
      : [row],
  );
}
function triggerIcon(row: Record<string, any>, home: Home) {
  const kind = row?.trigger || row?.platform;
  if (kind === "time" || kind === "time_pattern") return Clock3;
  if (kind === "sun") return row.event === "sunset" ? Moon : Sun;
  if (kind === "calendar") return CalendarClock;
  if (kind === "zone") return House;
  const id = Array.isArray(row?.entity_id) ? row.entity_id[0] : row?.entity_id;
  const cls = home.controls.find((c) => c.entity_id === id)?.attributes
    .device_class;
  if (["door", "window", "opening", "garage_door"].includes(String(cls)))
    return DoorOpen;
  if (["motion", "occupancy", "presence"].includes(String(cls)))
    return PersonStanding;
  if (cls === "temperature") return Thermometer;
  if (kind === "numeric_state") return Zap;
  return Radio;
}
export function AutomationTrigger({
  id,
  home,
  lang,
}: {
  id: string | null;
  home: Home;
  lang: string;
}) {
  const [open, setOpen] = useState(false);
  const t = (nb: string, en: string) => words(lang, nb, en);
  const triggerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    if (triggerRef.current) observer.observe(triggerRef.current);
    return () => observer.disconnect();
  }, []);
  const q = useQuery({
    queryKey: ["manage", "automation-summary", id],
    queryFn: () =>
      api<{ config: Record<string, any> }>(
        `manage/automations/${encodeURIComponent(id!)}`,
      ),
    enabled: !!id && visible,
    staleTime: 60_000,
    retry: false,
  });
  const config = q.data?.config;
  const rows = config ? triggerItems(config) : [];
  const first = rows[0];
  const summary = first ? flowSummary(first, "triggers", home, lang) : null;
  const Icon = first ? triggerIcon(first, home) : Workflow;
  const fallback =
    !id || q.isError
      ? t("Detaljer utilgjengelige", "Details unavailable")
      : q.isPending
        ? t("Henter utløser …", "Loading trigger …")
        : config?.use_blueprint
          ? t("Styres av blueprint", "Defined by blueprint")
          : t("Ingen utløsere", "No triggers");
  return (
    <div className="automation-trigger" ref={triggerRef}>
      <span className="automation-field-label">{t("Når", "When")}</span>
      <button
        disabled={!config}
        onClick={() => setOpen(true)}
        className="automation-trigger-summary"
        aria-label={t("Vis utløsere", "Show triggers")}
      >
        <Icon size={22} />
        <span>
          <strong>{summary?.title || fallback}</strong>
          <small>
            {summary?.detail ||
              (config?.use_blueprint
                ? t("Åpne redigering for oppsett", "Open editor for setup")
                : t("Starter rutinen", "Starts the routine"))}
          </small>
          {rows.length > 1 && (
            <em>
              {t(
                `+ ${rows.length - 1} flere utløsere`,
                `+ ${rows.length - 1} more triggers`,
              )}
            </em>
          )}
        </span>
      </button>
      {config && !config.use_blueprint && (
        <div
          className="automation-flow-preview"
          aria-label={t("Krav og handlinger", "Conditions and actions")}
        >
          {(["conditions", "actions"] as const).map((kind) => {
            const value =
              config[kind] ??
              config[kind === "conditions" ? "condition" : "action"] ??
              [];
            const steps = Array.isArray(value) ? value : [value];
            const info = steps.length
              ? flowSummary(steps[0], kind, home, lang)
              : null;
            return (
              <div key={kind} className={`preview-${kind}`}>
                <b>
                  {kind === "conditions" ? t("Og", "And") : t("Så", "Then")}
                </b>
                <span>
                  {info?.title ||
                    (kind === "conditions"
                      ? t("Ingen ekstra krav", "No extra conditions")
                      : t("Ingen handlinger", "No actions"))}
                  {steps.length > 1 && <small> +{steps.length - 1}</small>}
                </span>
              </div>
            );
          })}
        </div>
      )}
      {open && (
        <SettingsDialog
          title={t("Hva starter rutinen?", "What starts this routine?")}
          lang={lang}
          compact
          onClose={() => setOpen(false)}
        >
          {config?.description && <p>{String(config.description)}</p>}
          {rows.length > 1 && (
            <p className="muted">
              {t(
                "Rutinen starter når én av utløserne inntreffer. Betingelsene i automasjonen sjekkes deretter.",
                "Any of these triggers can start the routine. Its conditions are then checked.",
              )}
            </p>
          )}
          <div className="automation-trigger-list">
            {rows.map((row, i) => {
              const info = flowSummary(row, "triggers", home, lang);
              const Symbol = triggerIcon(row, home);
              return (
                <div key={i}>
                  <Symbol size={24} />
                  <div>
                    <strong>{info.title}</strong>
                    <p>{info.detail}</p>
                    {row?.alias && <small>{String(row.alias)}</small>}
                  </div>
                </div>
              );
            })}
          </div>
          {!rows.length && <p>{fallback}</p>}
          <p className="muted">
            {t(
              "Åpne Rediger for alle betingelser, tidsgrenser og avanserte innstillinger.",
              "Open Edit for all conditions, timing constraints and advanced settings.",
            )}
          </p>
        </SettingsDialog>
      )}
    </div>
  );
}
