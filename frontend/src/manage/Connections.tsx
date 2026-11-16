import { useEffect, useId, useRef, useState } from "react";
import { AppWindow, Blocks, Store } from "lucide-react";
import { useExperience } from "../Experience";
import { Integrations } from "./System";
import { Apps } from "./Apps";
import { Marketplace } from "./Marketplace";
import "./connections.css";

export function Connections({ lang }: { lang: string }) {
  const advanced = useExperience() === "advanced";
  const [tab, setTab] = useState("integrations");
  const id = useId();
  const tabs = useRef<HTMLElement>(null);
  const en = lang === "en";
  const active = !advanced && tab === "apps" ? "integrations" : tab;
  const options = [
    {
      key: "integrations",
      label: en ? "Integrations" : "Integrasjoner",
      Icon: Blocks,
    },
    {
      key: "marketplace",
      label: en ? "Marketplace" : "Markedsplass",
      Icon: Store,
    },
    ...(advanced
      ? [{ key: "apps", label: en ? "Apps" : "Apper", Icon: AppWindow }]
      : []),
  ];
  useEffect(() => {
    if (!advanced)
      setTab((previous) => (previous === "apps" ? "integrations" : previous));
  }, [advanced]);
  return (
    <section className="connections-page">
      <header className="page-heading">
        <span className="eyebrow">SMARTi</span>
        <h1>{en ? "Extensions" : "Utvidelser"}</h1>
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
      <nav
        className="connections-tabs"
        ref={tabs}
        role="tablist"
        aria-label={en ? "Integrations and apps" : "Integrasjoner og apper"}
        onKeyDown={(event) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
            return;
          event.preventDefault();
          const index = options.findIndex((option) => option.key === active);
          const next =
            options[
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? options.length - 1
                  : (index +
                      (event.key === "ArrowRight" ? 1 : -1) +
                      options.length) %
                    options.length
            ].key;
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
      {options.map(({ key }) => (
        <div
          key={key}
          role="tabpanel"
          id={`${id}-${key}-panel`}
          hidden={active !== key}
          aria-labelledby={`${id}-${key}-tab`}
        >
          {active === key &&
            (key === "apps" ? (
              <Apps lang={lang} embedded />
            ) : key === "marketplace" ? (
              <Marketplace lang={lang} />
            ) : (
              <Integrations lang={lang} embedded />
            ))}
        </div>
      ))}
    </section>
  );
}
