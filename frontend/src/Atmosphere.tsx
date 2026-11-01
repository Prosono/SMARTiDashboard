import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
  type CSSProperties,
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

// Softness is baked into three small masks; only bounded HTML layers animate.
const ribbons = ["a", "b", "c"] as const;

export function Atmosphere({ embedded = false }: { embedded?: boolean }) {
  const motion = useContext(Motion);
  return (
    <div
      className={`atmosphere${embedded ? " atmosphere-embedded" : ""}`}
      aria-hidden="true"
      inert
      data-paused={motion.hidden || motion.mode === "still"}
    >
      {ribbons.map((ribbon) => (
        <div
          className={`atmosphere-wave atmosphere-${ribbon}`}
          key={ribbon}
          style={
            {
              "--ribbon-mask": `url("${new URL(`atmosphere/ribbon-${ribbon}.webp`, document.baseURI).href}")`,
            } as CSSProperties
          }
        />
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
          ? "Flowing RGB ribbons follow your theme throughout the app. Your device’s reduced motion setting is respected."
          : "Flytende RGB-fargebånd følger temaet ditt i hele appen. Enhetens valg for redusert bevegelse respekteres."}
      </p>
    </>
  );
}
