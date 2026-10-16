import { useEffect, useState } from "react";
import { CloudSun, MapPin } from "lucide-react";
import type { Control } from "../types";
import { HighlightWeather } from "./HighlightWeather";
import { usable } from "./homeModel";
import "./homeHighlights.css";

type HighlightProps = {
  weather?: Control;
  offline: boolean;
  lang: string;
};

// Keep forecast polling unmounted on phone-sized screens.
export function HomeHighlights({ weather, offline, lang }: HighlightProps) {
  const [visible, setVisible] = useState(
    () => matchMedia("(min-width: 768px)").matches,
  );
  useEffect(() => {
    const viewport = matchMedia("(min-width: 768px)");
    const update = () => setVisible(viewport.matches);
    update();
    viewport.addEventListener("change", update);
    return () => viewport.removeEventListener("change", update);
  }, []);
  const t = (nb: string, en: string) => (lang === "en" ? en : nb);
  if (!visible) return null;
  return (
    <section
      className="home-highlights"
      aria-label={t("Været hjemme", "Weather at home")}
    >
      <div className="highlight-card highlight-weather">
        <header className="highlight-label">
          <span>
            <CloudSun />
            {t("Vær", "Weather")}
          </span>
          {weather && (
            <small title={weather.name}>
              <MapPin size={14} />
              {weather.name}
            </small>
          )}
        </header>
        <div className="highlight-content">
          {offline || !weather || !usable(weather) ? (
            <div className="highlight-summary" role="status">
              <CloudSun size={44} />
              <h2>{t("Været hjemme", "Weather at home")}</h2>
              <p>
                {offline
                  ? t(
                      "Venter på ferske data fra hjemmet.",
                      "Waiting for fresh home data.",
                    )
                  : weather
                    ? t(
                        "Værdata er midlertidig utilgjengelig.",
                        "Weather data is temporarily unavailable.",
                      )
                    : t(
                        "Ingen værmelding er koblet til hjemmet ennå.",
                        "No weather forecast is connected to your home yet.",
                      )}
              </p>
            </div>
          ) : (
            <HighlightWeather c={weather} lang={lang} />
          )}
        </div>
      </div>
    </section>
  );
}
