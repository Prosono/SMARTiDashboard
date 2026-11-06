import { useEffect, useId, useRef, useState } from "react";
import { AppWindow, Blocks } from "lucide-react";
import { useExperience } from "../Experience";
import { Integrations } from "./System";
import { Apps } from "./Apps";
import "./connections.css";

export function Connections({ lang }: { lang: string }) {
  const advanced = useExperience() === "advanced";
  const [tab, setTab] = useState("integrations");
  const id = useId();
  const tabs = useRef<HTMLElement>(null);
  const en = lang === "en";
  const active = advanced ? tab : "integrations";
  const options = [
    {
      key: "integrations",
      label: en ? "Integrations" : "Integrasjoner",
      Icon: Blocks,
    },
    { key: "apps", label: en ? "Apps" : "Apper", Icon: AppWindow },
  ];
  useEffect(() => {
    if (!advanced) setTab("integrations");
  }, [advanced]);
  return (
    <section className="connections-page">
      <header className="page-heading">
        <span className="eyebrow">SMARTi</span>
        <h1>{en ? "Integrations" : "Integrasjoner"}</h1>
        <p>
          {advanced
            ? en
              ? "Connections and apps for your home."
              : "Tilkoblinger og apper i hjemmet ditt."
            : en
              ? "Connect devices and services to your home."
              : "Koble enheter og tjenester til hjemmet ditt."}
        </p>
      </header>
      {advanced && (
        <nav
          className="connections-tabs"
          ref={tabs}
          role="tablist"
          aria-label={en ? "Integrations and apps" : "Integrasjoner og apper"}
          onKeyDown={(event) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
              return;
            event.preventDefault();
            const next =
              event.key === "Home"
                ? "integrations"
                : event.key === "End"
                  ? "apps"
                  : active === "apps"
                    ? "integrations"
                    : "apps";
            setTab(next);
            tabs.current
              ?.querySelector<HTMLButtonElement>(`[data-view="${next}"]`)
              ?.focus();
          }}
        >
          {options.map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              role="tab"
              data-view={key}
              id={`${id}-${key}-tab`}
              aria-selected={active === key}
              aria-controls={`${id}-${key}-panel`}
              tabIndex={active === key ? 0 : -1}
              onClick={() => setTab(key)}
            >
              <Icon size={20} aria-hidden="true" />
              {label}
            </button>
          ))}
        </nav>
      )}
      {options
        .filter((option) => advanced || option.key === "integrations")
        .map(({ key }) => (
          <div
            key={key}
            role={advanced ? "tabpanel" : undefined}
            id={`${id}-${key}-panel`}
            hidden={active !== key}
            aria-labelledby={advanced ? `${id}-${key}-tab` : undefined}
          >
            {active === key &&
              (key === "apps" && advanced ? (
                <Apps lang={lang} embedded />
              ) : (
                <Integrations lang={lang} embedded />
              ))}
          </div>
        ))}
    </section>
  );
}
