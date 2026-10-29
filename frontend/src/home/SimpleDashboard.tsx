import { useContext, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  ChevronRight,
  Lightbulb,
  Thermometer,
} from "lucide-react";
import type { Home, Control } from "../types";
import { api } from "../api";
import { Thermostat } from "../Thermostat";
import { Weather } from "./Weather";
import { Calendar } from "./Calendar";
import { MediaCard } from "./Multimedia";
import { VacuumCard } from "./Cleaning";
import { SettingsDialog } from "./SettingsDialog";
import { MetricDeviceRenderer } from "./MetricDetails";
import { homeAsset } from "./HomeOverview";
import "./simpleDashboard.css";

export function SimpleDashboard({
  home,
  lang,
  offline,
}: {
  home: Home;
  lang: string;
  offline: boolean;
}) {
  const en = lang === "en",
    t = (nb: string, eng: string) => (en ? eng : nb);
  const qc = useQueryClient();
  const render = useContext(MetricDeviceRenderer);
  const [panel, setPanel] = useState<"lights" | "calendar" | null>(null),
    [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const controls = home.controls.filter((c) => !c.diagnostic);
  const preferred = (domain: string) =>
    controls
      .filter((c) => c.domain === domain)
      .sort(
        (a, b) =>
          Number(home.favorites.includes(b.entity_id)) -
          Number(home.favorites.includes(a.entity_id)),
      )[0];
  const climate = preferred("climate"),
    media = preferred("media_player"),
    vacuum = preferred("vacuum"),
    weather = preferred("weather");
  const lights = controls.filter((c) => c.domain === "light");
  const on = lights.filter(
    (c) => c.availability === "available" && c.state === "on",
  );
  const active = controls.find((c) => c.id === selected);
  const room = (c: Control) =>
    home.areas.find((a) => a.area_id === c.area_id)?.name ||
    t("Hjemmet", "Home");
  async function change(action: string, value: number | string) {
    if (!climate || busy || offline || climate.availability !== "available")
      return;
    setBusy(true);
    setMessage("");
    try {
      const result = await api<{ status: string }>(
        `controls/${encodeURIComponent(climate.entity_id)}/commands`,
        "POST",
        {
          action,
          ...(action === "set_hvac_mode" ? { hvac_mode: value } : { value }),
        },
      );
      if (result.status === "accepted_unconfirmed")
        setMessage(
          t("Sendt. Venter på bekreftelse.", "Sent. Waiting for confirmation."),
        );
      await qc.invalidateQueries({ queryKey: ["home"] });
    } catch {
      setMessage(
        t(
          "Kunne ikke endre temperaturen. Prøv igjen.",
          "Could not update the thermostat. Try again.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  const now = new Date();
  return (
    <>
      <div
        className="simple-dashboard-grid"
        aria-label={t("Hjemmet med et blikk", "Home at a glance")}
      >
        {weather && (
          <div className="simple-dashboard-weather">
            <Weather
              c={
                offline
                  ? {
                      ...weather,
                      availability: "unavailable",
                      attributes: { ...weather.attributes, temperature: null },
                    }
                  : weather
              }
              lang={lang}
            />
          </div>
        )}
        {(!home.permissions || home.permissions.includes("calendar.view")) && (
          <button
            className="simple-dashboard-date simple-dashboard-tile"
            onClick={() => setPanel("calendar")}
            aria-haspopup="dialog"
          >
            <div className="simple-dashboard-card-heading">
              <CalendarDays size={23} />
              <span>{t("Kalender", "Calendar")}</span>
              <ChevronRight size={18} />
            </div>
            <strong>{now.getDate()}</strong>
            <span>
              {now.toLocaleDateString(en ? "en-GB" : "nb-NO", {
                weekday: "long",
                month: "long",
              })}
            </span>
            <small>{t("Se dagens planer", "See today's plans")}</small>
          </button>
        )}
        {lights.length > 0 && (
          <button
            className="simple-dashboard-tile simple-dashboard-lights"
            onClick={() => setPanel("lights")}
            aria-haspopup="dialog"
          >
            <img src={homeAsset("home-lighting")} alt="" />
            <div className="simple-dashboard-card-heading">
              <Lightbulb size={23} />
              <span>{t("Lys i hjemmet", "Home lighting")}</span>
              <ChevronRight size={18} />
            </div>
            <strong>
              {offline ? "—" : on.length}
              <small> / {lights.length}</small>
            </strong>
            <span>{t("lys er på", "lights are on")}</span>
            <small>
              {t("Trykk for å styre lysene", "Tap to control your lights")}
            </small>
          </button>
        )}
        {media && (
          <div className="simple-dashboard-media">
            <MediaCard
              c={media}
              home={home}
              lang={lang}
              offline={offline}
              photo={homeAsset("home-multimedia")}
            />
          </div>
        )}
        {climate && (
          <section className="simple-dashboard-tile simple-dashboard-climate">
            <button
              className="simple-dashboard-card-heading"
              onClick={() => setSelected(climate.id)}
              aria-label={`${t("Åpne", "Open")} ${climate.name}`}
            >
              <Thermometer size={23} />
              <span>
                {climate.name}
                <small>{room(climate)}</small>
              </span>
              <ChevronRight size={18} />
            </button>
            <Thermostat
              c={climate}
              lang={lang}
              disabled={offline || busy}
              change={(v) => void change("set_temperature", v)}
              changeMode={(v) => void change("set_hvac_mode", v)}
            />
            {message && <p role="status">{message}</p>}
          </section>
        )}
        {vacuum && (
          <div className="simple-dashboard-vacuum">
            <VacuumCard c={vacuum} home={home} lang={lang} offline={offline} />
          </div>
        )}
      </div>
      {panel && (
        <SettingsDialog
          title={
            panel === "calendar"
              ? t("Kalender", "Calendar")
              : t("Lys i hjemmet", "Home lighting")
          }
          lang={lang}
          onClose={() => setPanel(null)}
        >
          {panel === "calendar" ? (
            <Calendar lang={lang} offline={offline} />
          ) : (
            <div className="simple-dashboard-light-list">
              {home.areas
                .concat({ area_id: "", name: t("Uten rom", "No room") })
                .map((a) => {
                  const items = lights.filter(
                    (c) =>
                      (home.areas.some((r) => r.area_id === c.area_id)
                        ? c.area_id
                        : "") === a.area_id,
                  );
                  return items.length ? (
                    <section key={a.area_id}>
                      <h3>{a.name}</h3>
                      {items.map((c) => (
                        <button key={c.id} onClick={() => setSelected(c.id)}>
                          <Lightbulb size={20} />
                          <strong>{c.name}</strong>
                          <span>
                            {offline || c.availability !== "available"
                              ? t("Utilgjengelig", "Unavailable")
                              : c.state === "on"
                                ? t("På", "On")
                                : t("Av", "Off")}
                          </span>
                          <ChevronRight size={18} />
                        </button>
                      ))}
                    </section>
                  ) : null;
                })}
            </div>
          )}
          {active && render && (
            <SettingsDialog
              title={active.name}
              lang={lang}
              onClose={() => setSelected(null)}
            >
              {render(active)}
            </SettingsDialog>
          )}
        </SettingsDialog>
      )}
      {!panel && active && render && (
        <SettingsDialog
          title={active.name}
          lang={lang}
          onClose={() => setSelected(null)}
        >
          {render(active)}
        </SettingsDialog>
      )}
    </>
  );
}
