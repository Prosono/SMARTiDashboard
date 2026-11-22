import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CalendarDays, Monitor, Play, X } from "lucide-react";
import { readPreference, writePreference } from "../preferences";
import type { Control, Home } from "../types";
import { SimpleAgenda } from "./SimpleDashboard";
import { TemperatureValue } from "./TemperatureValue";
import { WeatherArtwork, useWeatherNight } from "./WeatherArtwork";
import { weatherLabel } from "./weatherPresentation";
import "./screensaver.css";

const delays = ["0", "1", "3", "5", "10", "15", "30"];
const keys = {
  delay: "smarti-screensaver-delay",
  weather: "smarti-screensaver-weather",
  calendar: "smarti-screensaver-calendar",
};

export function useScreensaver(enabled: boolean) {
  const [delay, setDelay] = useState(() =>
    readPreference(keys.delay, "0", delays),
  );
  const [weather, setWeather] = useState(
    () => readPreference(keys.weather, "on", ["on", "off"]) === "on",
  );
  const [calendar, setCalendar] = useState(
    () => readPreference(keys.calendar, "off", ["on", "off"]) === "on",
  );
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!enabled || delay === "0" || active) return;
    const idleTime = Number(delay) * 60000;
    let lastActivity = Date.now();
    let timer: number | undefined;
    const trackActivity = () => {
      lastActivity = Date.now();
    };
    function checkIdle() {
      const remaining = lastActivity + idleTime - Date.now();
      if (remaining > 0) {
        timer = window.setTimeout(checkIdle, remaining);
      } else if (
        document.querySelector(
          'dialog[open], .home-canvas[data-editing="true"]',
        )
      ) {
        lastActivity = Date.now();
        timer = window.setTimeout(checkIdle, idleTime);
      } else if (!document.hidden) {
        setActive(true);
      }
    }
    function visible() {
      window.clearTimeout(timer);
      if (document.hidden) return;
      trackActivity();
      timer = window.setTimeout(checkIdle, idleTime);
    }
    const activity = [
      "pointerdown",
      "pointermove",
      "keydown",
      "wheel",
      "scroll",
      "focusin",
    ];
    activity.forEach((type) =>
      document.addEventListener(type, trackActivity, {
        capture: true,
        passive: true,
      }),
    );
    document.addEventListener("visibilitychange", visible);
    visible();
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", visible);
      activity.forEach((type) =>
        document.removeEventListener(type, trackActivity, true),
      );
    };
  }, [active, delay, enabled]);

  // Keep the app display on through the idle period, where the host allows it.
  const keepAwake = enabled && (delay !== "0" || active);
  useEffect(() => {
    if (!keepAwake || !navigator.wakeLock) return;
    let stopped = false;
    let requesting = false;
    let lock: WakeLockSentinel | undefined;
    async function acquire() {
      if (document.hidden || requesting || (lock && !lock.released)) return;
      requesting = true;
      try {
        const acquired = await navigator.wakeLock.request("screen");
        if (stopped || document.hidden) await acquired.release();
        else lock = acquired;
      } catch {
        // The screensaver still works if the browser or OS disallows a lock.
      } finally {
        requesting = false;
      }
    }
    document.addEventListener("visibilitychange", acquire);
    void acquire();
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", acquire);
      void lock?.release().catch(() => {});
    };
  }, [keepAwake]);

  return {
    delay,
    weather,
    calendar,
    active: enabled && active,
    changeDelay(value: string) {
      setDelay(value);
      writePreference(keys.delay, value);
    },
    changeWeather(value: boolean) {
      setWeather(value);
      writePreference(keys.weather, value ? "on" : "off");
    },
    changeCalendar(value: boolean) {
      setCalendar(value);
      writePreference(keys.calendar, value ? "on" : "off");
    },
    preview() {
      setActive(true);
    },
    close() {
      setActive(false);
    },
  };
}

type ScreensaverState = ReturnType<typeof useScreensaver>;

export function ScreensaverSettings({
  state,
  lang,
}: {
  state: ScreensaverState;
  lang: string;
}) {
  const en = lang === "en";
  return (
    <section className="settings-panel screensaver-settings">
      <h2>
        <Monitor size={21} aria-hidden="true" />{" "}
        {en ? "Screensaver" : "Skjermsparer"}
      </h2>
      <p>
        {en
          ? "Show the time and date when SMARTi is idle. These choices apply to this device."
          : "Vis klokkeslett og dato når SMARTi står ubrukt. Valgene gjelder denne enheten."}
      </p>
      <label>
        {en ? "Start after" : "Start etter"}
        <select
          value={state.delay}
          onChange={(event) => state.changeDelay(event.target.value)}
        >
          {delays.map((value) => (
            <option key={value} value={value}>
              {value === "0" ? (en ? "Off" : "Av") : `${value} min`}
            </option>
          ))}
        </select>
      </label>
      <fieldset>
        <legend>
          {en ? "Show on the screensaver" : "Vis på skjermspareren"}
        </legend>
        <label>
          <input
            type="checkbox"
            checked={state.weather}
            onChange={(event) => state.changeWeather(event.target.checked)}
          />
          {en ? "Weather" : "Vær"}
        </label>
        <label>
          <input
            type="checkbox"
            checked={state.calendar}
            onChange={(event) => state.changeCalendar(event.target.checked)}
          />
          {en ? "Today's calendar" : "Dagens kalender"}
        </label>
      </fieldset>
      <button type="button" onClick={state.preview}>
        <Play size={17} aria-hidden="true" /> {en ? "Preview" : "Forhåndsvis"}
      </button>
    </section>
  );
}

function ScreensaverWeather({
  weather,
  lang,
}: {
  weather: Control;
  lang: string;
}) {
  const night = useWeatherNight(weather);
  const value = weather.attributes.temperature;
  return (
    <div className="screensaver-weather">
      <WeatherArtwork condition={weather.state} night={night} />
      <div>
        <TemperatureValue
          value={typeof value === "number" ? value : null}
          unit={String(weather.attributes.temperature_unit || "°C")}
          lang={lang}
        />
        <span>{weatherLabel(weather.state, lang)}</span>
      </div>
    </div>
  );
}

export function Screensaver({
  state,
  home,
  offline,
  lang,
}: {
  state: ScreensaverState;
  home: Home;
  offline: boolean;
  lang: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [time, setTime] = useState(() => new Date());
  const en = lang === "en";
  const locale = en ? "en-GB" : "nb-NO";
  useLayoutEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);
  useEffect(() => {
    let timer: number;
    function tick() {
      const now = new Date();
      setTime(now);
      timer = window.setTimeout(tick, 60000 - (now.getTime() % 60000));
    }
    tick();
    document.addEventListener("visibilitychange", resume);
    function resume() {
      window.clearTimeout(timer);
      if (!document.hidden) tick();
    }
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", resume);
    };
  }, []);
  const availableWeather = home.controls.filter(
    (item) =>
      item.domain === "weather" &&
      !item.diagnostic &&
      item.availability === "available",
  );
  const weather =
    availableWeather.find((item) => home.favorites.includes(item.entity_id)) ??
    availableWeather[0];
  const closeLabel = en ? "Close screensaver" : "Lukk skjermsparer";
  return (
    <dialog
      ref={dialog}
      className="home-screensaver"
      aria-label={en ? "Screensaver" : "Skjermsparer"}
      onClick={state.close}
      onCancel={(event) => {
        event.preventDefault();
        state.close();
      }}
    >
      <button
        type="button"
        className="screensaver-close"
        aria-label={closeLabel}
        onClick={(event) => {
          event.stopPropagation();
          state.close();
        }}
      >
        <X size={22} aria-hidden="true" />
      </button>
      <div
        className="screensaver-content"
        data-agenda={state.calendar || undefined}
      >
        <div className="screensaver-now">
          <div className="screensaver-date">
            {time.toLocaleDateString(locale, {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </div>
          <time dateTime={time.toISOString()}>
            {time.toLocaleTimeString(locale, {
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            })}
          </time>
          {state.weather &&
            (weather && !offline ? (
              <ScreensaverWeather weather={weather} lang={lang} />
            ) : (
              <p>{en ? "Weather unavailable" : "Været er utilgjengelig"}</p>
            ))}
        </div>
        {state.calendar && (
          <section
            className="screensaver-agenda"
            aria-label={en ? "Today's calendar" : "Dagens kalender"}
          >
            <h2>
              <CalendarDays size={19} aria-hidden="true" />{" "}
              {en ? "Today's calendar" : "Dagens kalender"}
            </h2>
            <SimpleAgenda lang={lang} offline={offline} live />
          </section>
        )}
      </div>
      <span className="screensaver-hint">
        {en
          ? "Tap anywhere to return"
          : "Trykk hvor som helst for å gå tilbake"}
      </span>
    </dialog>
  );
}
