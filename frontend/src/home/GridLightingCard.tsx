import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Lightbulb, LoaderCircle, Sun } from "lucide-react";
import { api } from "../api";
import type { Home } from "../types";
import { usable } from "./homeModel";

export function GridLightingCard({
  home,
  lang,
  offline,
  open,
}: {
  home: Home;
  lang: string;
  offline: boolean;
  open: () => void;
}) {
  const t = (nb: string, en: string) => (lang === "en" ? en : nb);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const lights = home.controls.filter(
    (c) => c.domain === "light" && !c.diagnostic,
  );
  const on = lights.filter((c) => usable(c) && c.state === "on");
  const levels = on.flatMap((c) =>
    typeof c.attributes.brightness === "number" &&
    Number.isFinite(c.attributes.brightness)
      ? [Math.round((c.attributes.brightness / 255) * 100)]
      : [],
  );
  const level = levels.length
    ? Math.round(levels.reduce((sum, value) => sum + value, 0) / levels.length)
    : 0;
  const [draft, setDraft] = useState(level);
  useEffect(() => setDraft(level), [level]);
  const permitted =
    !home.permissions || home.permissions.includes("lights.control");
  const blocked = offline || !home.connected || !permitted || busy;
  const power = on.length ? "turn_off" : "turn_on";
  const supports = (action: string) =>
    lights.filter(
      (c) =>
        usable(c) && c.capabilities.some((cap) => cap.actions.includes(action)),
    );
  const dimmable = supports("set_brightness");
  async function command(action: string, value?: number) {
    if (blocked) return;
    setBusy(true);
    setMessage("");
    const targets = supports(action);
    let failed = false,
      pending = false;
    try {
      for (let index = 0; index < targets.length; index += 4) {
        const results = await Promise.allSettled(
          targets
            .slice(index, index + 4)
            .map((c) =>
              api<{ status: string }>(
                `controls/${encodeURIComponent(c.entity_id)}/commands`,
                "POST",
                { action, ...(value === undefined ? {} : { value }) },
              ),
            ),
        );
        failed ||= results.some(
          (result) =>
            result.status === "rejected" || result.value.status === "failed",
        );
        pending ||= results.some(
          (result) =>
            result.status === "fulfilled" &&
            result.value.status === "accepted_unconfirmed",
        );
      }
      setMessage(
        failed
          ? t(
              "Noen lys kunne ikke bekreftes. Kontroller lysene.",
              "Some lights could not be confirmed. Check your lights.",
            )
          : pending
            ? t(
                "Sendt. Venter på bekreftelse fra lysene.",
                "Sent. Waiting for the lights to confirm.",
              )
            : "",
      );
      await qc.invalidateQueries({ queryKey: ["home"] });
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="grid-lighting-card">
      <img
        src={new URL("home/home-lighting.webp", document.baseURI).href}
        alt=""
      />
      <button className="grid-card-heading" onClick={open}>
        <Lightbulb size={23} />
        <strong>{t("Lys i hjemmet", "Home lighting")}</strong>
        <ChevronRight size={18} />
      </button>
      <div className="grid-lighting-reading">
        <div>
          <strong>{offline ? "—" : on.length}</strong>
          <span>
            {t("av", "of")} {lights.length}
          </span>
          <small>{t("lys på", "lights on")}</small>
        </div>
        <button
          className="harmony-power"
          role="switch"
          aria-label={t("Alle lys i hjemmet", "All home lights")}
          aria-checked={!offline && on.length > 0}
          disabled={blocked || !supports(power).length}
          onClick={() => void command(power)}
        >
          {busy ? (
            <LoaderCircle size={18} className="spin" />
          ) : (
            <i aria-hidden="true" />
          )}
        </button>
      </div>
      {dimmable.length > 0 && (
        <label className="grid-lighting-range">
          <Sun size={21} />
          <input
            type="range"
            aria-label={t("Lysstyrke i hjemmet", "Home brightness")}
            min={0}
            max={100}
            value={draft}
            disabled={blocked}
            onChange={(event) => setDraft(Number(event.target.value))}
            onPointerUp={() => void command("set_brightness", draft)}
            onKeyUp={(event) => {
              if (
                [
                  "ArrowLeft",
                  "ArrowRight",
                  "ArrowUp",
                  "ArrowDown",
                  "Home",
                  "End",
                  "PageUp",
                  "PageDown",
                ].includes(event.key)
              )
                void command("set_brightness", draft);
            }}
          />
          <span>{draft}%</span>
        </label>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
