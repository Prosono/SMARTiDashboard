import { useEffect, useId, useRef, useState } from "react";
import { AppWindow, Blocks, DownloadCloud } from "lucide-react";
import { useExperience } from "../Experience";
import { Apps } from "./Apps";
import { SelfUpdate } from "./SelfUpdate";
import { UpdateList } from "./System";
import "./connections.css";

export function Updates({ lang }: { lang: string }) {
  const advanced = useExperience() === "advanced";
  const en = lang === "en";
  const [tab, setTab] = useState("smarti");
  const [appsVisited, setAppsVisited] = useState(false);
  const id = useId();
  const tabs = useRef<HTMLElement>(null);
  const options = [
    { key: "smarti", label: "SMARTi", Icon: DownloadCloud },
    {
      key: "extensions",
      label: en ? "Extensions" : "Utvidelser",
      Icon: Blocks,
    },
    ...(advanced
      ? [{ key: "apps", label: en ? "Apps" : "Apper", Icon: AppWindow }]
      : []),
  ];
  const active = tab === "apps" && !advanced ? "smarti" : tab;
  useEffect(() => {
    if (!advanced) {
      setTab((previous) => (previous === "apps" ? "smarti" : previous));
      setAppsVisited(false);
    }
  }, [advanced]);
  function choose(key: string) {
    setTab(key);
    if (key === "apps") setAppsVisited(true);
  }
  return (
    <section className="updates-page">
      <header className="page-heading">
        <span className="eyebrow">SMARTi</span>
        <h1>{en ? "Updates" : "Oppdateringer"}</h1>
        <p>{en ? "Keep your home up to date." : "Hold hjemmet oppdatert."}</p>
      </header>
      <nav
        className="connections-tabs updates-tabs"
        role="tablist"
        ref={tabs}
        aria-label={en ? "Update types" : "Oppdateringstyper"}
        onKeyDown={(event) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
            return;
          event.preventDefault();
          const current = options.findIndex((option) => option.key === active);
          const next =
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? options.length - 1
                : (current +
                    (event.key === "ArrowRight" ? 1 : -1) +
                    options.length) %
                  options.length;
          choose(options[next].key);
          tabs.current
            ?.querySelector<HTMLButtonElement>(
              `[data-update-view="${options[next].key}"]`,
            )
            ?.focus();
        }}
      >
        {options.map(({ key, label, Icon }) => (
          <button
            type="button"
            role="tab"
            key={key}
            data-update-view={key}
            id={`${id}-${key}-tab`}
            aria-controls={`${id}-${key}-panel`}
            aria-selected={active === key}
            tabIndex={active === key ? 0 : -1}
            onClick={() => choose(key)}
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
          aria-labelledby={`${id}-${key}-tab`}
          hidden={active !== key}
        >
          {key === "smarti" ? (
            <>
              <SelfUpdate lang={lang} active={active === key} />
              <UpdateList
                lang={lang}
                category="smarti"
                active={active === key}
              />
            </>
          ) : key === "extensions" ? (
            <UpdateList
              lang={lang}
              category="extensions"
              active={active === key}
            />
          ) : appsVisited && advanced ? (
            <Apps lang={lang} embedded updatesOnly active={active === key} />
          ) : null}
        </div>
      ))}
    </section>
  );
}
