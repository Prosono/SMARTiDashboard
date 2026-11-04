import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  Leaf,
  LogOut,
  Plug,
  Power,
  Square,
} from "lucide-react";
import { api } from "../api";
import type { Control } from "../types";
import { controlState } from "../controlState";
import { CardIcon, CardTitle, cardImageURL } from "./CardPresentation";
import { MobileCardArtwork } from "./MobileCardArtwork";
import type { MobileCardProps } from "./MobileCardTile";
import { usable } from "./homeModel";
import { SettingsDialog } from "./SettingsDialog";

export function PhoneMiscDeviceCard({
  c,
  onOpen,
  ...props
}: MobileCardProps & { c: Control; onOpen: () => void }) {
  const { home, offline, lang, config } = props;
  const t = (nb: string, en: string) => (lang === "en" ? en : nb);
  const query = useQueryClient(),
    pending = useRef(false);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [confirmation, confirm] = useState<"open_cover" | "close_cover" | null>(
    null,
  );
  const cover = c.domain === "cover",
    vacuum = c.domain === "vacuum";
  const available = !offline && home.connected && usable(c);
  const feature = cover ? "security" : vacuum ? "cleaning" : "other";
  const permitted =
    !home.permissions || home.permissions.includes(`${feature}.control`);
  const blocked = !available || !permitted || busy;
  const supports = (action: string) =>
    c.capabilities.some((cap) => cap.actions.includes(action));
  const on = available && c.state === "on",
    known = ["on", "off"].includes(c.state);
  const toggleAction = c.state === "on" ? "turn_off" : "turn_on";
  const coverStates: Record<string, string> = {
    open: t("Åpen", "Open"),
    closed: t("Lukket", "Closed"),
    opening: t("Åpner", "Opening"),
    closing: t("Lukker", "Closing"),
  };
  const state = !available
    ? offline || !home.connected
      ? t("Frakoblet", "Disconnected")
      : t("Utilgjengelig", "Unavailable")
    : cover
      ? coverStates[c.state] || t("Ukjent", "Unknown")
      : controlState(c, c.state, lang);
  const subtitle =
    c.device_name && c.device_name !== c.name ? c.device_name : "";
  const Icon = /eco|øko|energispar/i.test(c.name)
    ? Leaf
    : /borte|away/i.test(c.name)
      ? LogOut
      : c.domain === "switch"
        ? Plug
        : Power;
  async function send(action: string, confirmed = false) {
    if (pending.current || blocked || !supports(action)) return;
    pending.current = true;
    setBusy(true);
    setMessage("");
    confirm(null);
    try {
      const result = await api<{ status: string }>(
        `controls/${encodeURIComponent(c.entity_id)}/commands`,
        "POST",
        { action, ...(confirmed ? { confirmed: true } : {}) },
      );
      if (result.status === "failed") throw new Error("command_failed");
      if (result.status === "simulated")
        setMessage(t("Simulert i demohjemmet", "Simulated in demo"));
      else if (result.status !== "state_updated")
        setMessage(
          t("Sendt. Venter på bekreftelse.", "Sent. Waiting for confirmation."),
        );
    } catch {
      setMessage(
        t(
          "Kunne ikke styre enheten. Prøv igjen.",
          "Could not control the device. Please retry.",
        ),
      );
    } finally {
      await query.invalidateQueries({ queryKey: ["home"] });
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <article
      className={`phone-misc-device ${cover ? "phone-misc-cover" : vacuum ? "phone-misc-vacuum" : "phone-misc-toggle"}`}
      data-unavailable={!available}
      aria-busy={busy}
    >
      {cover || vacuum ? (
        <>
          <div className="phone-misc-hero">
            <button
              className="phone-misc-description"
              onClick={onOpen}
              aria-label={`${t("Detaljer", "Details")}: ${c.name}`}
            >
              <strong>
                <CardTitle>{c.name}</CardTitle>
              </strong>
              {subtitle && <small>{subtitle}</small>}
              <span className="phone-misc-state">{state}</span>
            </button>
            <button
              className="phone-misc-art"
              onClick={onOpen}
              aria-label={`${t("Vis enhet", "View device")}: ${c.name}`}
            >
              <MobileCardArtwork {...props} />
            </button>
          </div>
          {cover ? (
            <div className="phone-misc-cover-actions">
              {[
                {
                  action: "open_cover",
                  Icon: ArrowUp,
                  label: t("Åpne", "Open"),
                },
                {
                  action: "stop_cover",
                  Icon: Square,
                  label: t("Stopp", "Stop"),
                },
                {
                  action: "close_cover",
                  Icon: ArrowDown,
                  label: t("Lukk", "Close"),
                },
              ]
                .filter((a) => supports(a.action))
                .map(({ action, Icon, label }) => (
                  <button
                    key={action}
                    data-action={action}
                    data-primary={action === "open_cover"}
                    disabled={blocked}
                    aria-label={`${label}: ${c.name}`}
                    onClick={() =>
                      action === "stop_cover"
                        ? void send(action)
                        : confirm(action as "open_cover" | "close_cover")
                    }
                  >
                    <Icon size={24} />
                    <span>{label}</span>
                  </button>
                ))}
            </div>
          ) : (
            <button className="phone-misc-vacuum-open" onClick={onOpen}>
              {t("Åpne kontroller", "Open controls")}
              <ChevronRight size={21} />
            </button>
          )}
        </>
      ) : (
        <>
          <button
            className="phone-misc-toggle-details"
            onClick={onOpen}
            aria-label={`${t("Detaljer", "Details")}: ${c.name}`}
          >
            <span className="phone-misc-icon">
              {config?.image && cardImageURL(config.image) ? (
                <MobileCardArtwork {...props} />
              ) : (
                <CardIcon fallback={Icon} size={24} />
              )}
            </span>
            <span className="phone-misc-toggle-copy">
              <strong>
                <CardTitle>{c.name}</CardTitle>
              </strong>
              {subtitle && <small>{subtitle}</small>}
              <span className="phone-misc-toggle-state">
                <i data-on={on} />
                {state}
              </span>
            </span>
          </button>
          <button
            className="phone-misc-switch"
            role="switch"
            aria-label={`${c.name}: ${t("av/på", "power")}`}
            aria-checked={on}
            disabled={blocked || !known || !supports(toggleAction)}
            onClick={() => void send(toggleAction)}
          >
            <span />
          </button>
        </>
      )}
      {!permitted && (
        <small className="phone-misc-readonly">
          {t("Kun visning", "View only")}
        </small>
      )}
      {message && (
        <small className="phone-misc-feedback" role="status">
          {message}
        </small>
      )}
      {confirmation && (
        <SettingsDialog
          title={`${confirmation === "open_cover" ? t("Åpne", "Open") : t("Lukk", "Close")} ${c.name}?`}
          compact
          lang={lang}
          onClose={() => confirm(null)}
        >
          <p>
            {t(
              "Kontroller at ingenting er i veien før enheten beveger seg.",
              "Make sure the path is clear before the device moves.",
            )}
          </p>
          <div className="harmony-confirm-actions">
            <button onClick={() => confirm(null)}>
              {t("Avbryt", "Cancel")}
            </button>
            <button
              className="primary"
              disabled={blocked}
              onClick={() => void send(confirmation, true)}
            >
              {t("Bekreft", "Confirm")}
            </button>
          </div>
        </SettingsDialog>
      )}
    </article>
  );
}
