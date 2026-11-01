import {
  createContext,
  useContext,
  useEffect,
  useId,
  useState,
  type ReactNode,
} from "react";
import { readPreference, writePreference } from "./preferences";
import "./atmosphere.css";

const Motion = createContext({
  mode: "flow",
  change: (_mode: string) => {},
  hidden: false,
});

export function AtmosphereProvider({ children }: { children: ReactNode }) {
  const [mode, change] = useState(() =>
    readPreference("smarti-background-motion", "flow", ["flow", "still"]),
  );
  const [hidden, setHidden] = useState(() => document.hidden);
  useEffect(() => {
    writePreference("smarti-background-motion", mode);
  }, [mode]);
  useEffect(() => {
    const visibility = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", visibility);
    return () => document.removeEventListener("visibilitychange", visibility);
  }, []);
  return (
    <Motion.Provider value={{ mode, change, hidden }}>
      {children}
    </Motion.Provider>
  );
}

// Broad, continuous wave envelopes. Only their containing layers move;
// the SVG geometry/gradients stay still, with no per-frame JS or audio input.
const wave =
  "M-200 330 C0 330 70 130 300 130 S600 450 850 340 S1160 100 1380 220 S1650 420 1800 260";

export function Atmosphere({ embedded = false }: { embedded?: boolean }) {
  const id = useId().replaceAll(":", ""),
    motion = useContext(Motion);
  return (
    <div
      className={`atmosphere${embedded ? " atmosphere-embedded" : ""}`}
      aria-hidden="true"
      inert
      data-paused={motion.hidden || motion.mode === "still"}
    >
      {["red", "green", "blue"].map((color) => (
        <div className={`atmosphere-wave atmosphere-${color}`} key={color}>
          <svg viewBox="0 0 1600 600" preserveAspectRatio="none">
            <defs>
              <linearGradient id={`${id}-${color}-fade`}>
                <stop stopColor="currentColor" stopOpacity="0" />
                <stop offset=".22" stopColor="currentColor" />
                <stop offset=".78" stopColor="currentColor" />
                <stop offset="1" stopColor="currentColor" stopOpacity="0" />
              </linearGradient>
              <filter
                id={`${id}-${color}-soft`}
                x="-15%"
                y="-70%"
                width="130%"
                height="240%"
                colorInterpolationFilters="sRGB"
              >
                <feGaussianBlur stdDeviation="32" />
              </filter>
            </defs>
            <path
              d={wave}
              fill="none"
              stroke={`url(#${id}-${color}-fade)`}
              strokeWidth="115"
              filter={`url(#${id}-${color}-soft)`}
            />
            <path
              d={wave}
              fill="none"
              stroke={`url(#${id}-${color}-fade)`}
              strokeWidth="1.2"
              opacity=".18"
            />
          </svg>
        </div>
      ))}
    </div>
  );
}

export function BackgroundMotionSetting({ lang }: { lang: string }) {
  const motion = useContext(Motion),
    en = lang === "en";
  return (
    <>
      <label>
        {en ? "Background motion" : "Bakgrunnsbevegelse"}
        <select
          value={motion.mode}
          onChange={(event) => motion.change(event.target.value)}
        >
          <option value="flow">
            {en ? "Gentle RGB waves" : "Rolige RGB-bølger"}
          </option>
          <option value="still">{en ? "Still" : "Stillestående"}</option>
        </select>
      </label>
      <p className="note">
        {en
          ? "Soft color waves follow your theme throughout the app. Your device’s reduced motion setting is respected."
          : "Myke fargebølger følger temaet ditt i hele appen. Enhetens valg for redusert bevegelse respekteres."}
      </p>
    </>
  );
}
