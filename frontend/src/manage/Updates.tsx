import { useEffect, useId, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { AppWindow, Blocks, DownloadCloud, Search } from "lucide-react";
import { useExperience } from "../Experience";
import { usePageSearch } from "../PageSearch";
import { Apps } from "./Apps";
import { SelfUpdate } from "./SelfUpdate";
import { UpdateList } from "./System";
import type { UpdateCounts } from "./updateModel";
import "./connections.css";

export function Updates({
  lang,
  counts,
}: {
  lang: string;
  counts: UpdateCounts;
}) {
  const advanced = useExperience() === "advanced";
  const en = lang === "en";
  const [tab, setTab] = useState<keyof UpdateCounts>("smarti");
  const [appsVisited, setAppsVisited] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searches, setSearches] = useState({ smarti: "", extensions: "" });
  const searchInput = useRef<HTMLInputElement>(null);
  const id = useId();
  const tabs = useRef<HTMLElement>(null);
  const allOptions = [
    { key: "smarti", label: "SMARTi", Icon: DownloadCloud },
    {
      key: "extensions",
      label: en ? "Extensions" : "Utvidelser",
      Icon: Blocks,
    },
    { key: "apps", label: en ? "Apps" : "Apper", Icon: AppWindow },
  ] as const;
  const options = advanced ? allOptions : allOptions.slice(0, 2);
  const active = tab === "apps" && !advanced ? "smarti" : tab;
  const searchLabel = en ? "Search updates" : "Søk i oppdateringer";
  usePageSearch({
    label: searchLabel,
    active: active !== "apps",
    open: () => {
      if (!showSearch) flushSync(() => setShowSearch(true));
      searchInput.current?.focus();
    },
  });
  useEffect(() => {
    if (!advanced) {
      setTab((previous) => (previous === "apps" ? "smarti" : previous));
      setAppsVisited(false);
    }
  }, [advanced]);
  function choose(key: keyof UpdateCounts) {
    setTab(key);
    if (key === "apps") setAppsVisited(true);
  }
  return (
    <section className="updates-page">
      <header className="page-heading">
        <span className="eyebrow">SMARTi</span>
        <h1 data-phone-page-title>{en ? "Updates" : "Oppdateringer"}</h1>
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
        {options.map(({ key, label, Icon }) => {
          const count = counts[key];
          const description = `${id}-${key}-count`;
          return (
            <button
              type="button"
              role="tab"
              key={key}
              data-update-view={key}
              id={`${id}-${key}-tab`}
              aria-controls={`${id}-${key}-panel`}
              aria-describedby={count ? description : undefined}
              aria-selected={active === key}
              tabIndex={active === key ? 0 : -1}
              onClick={() => choose(key)}
            >
              <Icon size={20} aria-hidden="true" />
              {label}
              {count > 0 && (
                <>
                  <span className="update-tab-count" aria-hidden="true">
                    {count}
                  </span>
                  <span id={description} hidden>
                    {en
                      ? `${count} ${count === 1 ? "update" : "updates"} available`
                      : `${count} ${count === 1 ? "oppdatering" : "oppdateringer"} tilgjengelig`}
                  </span>
                </>
              )}
            </button>
          );
        })}
      </nav>
      {showSearch && active !== "apps" && (
        <label className="apps-search">
          <Search size={19} aria-hidden="true" />
          <input
            ref={searchInput}
            type="search"
            aria-label={searchLabel}
            placeholder={searchLabel}
            value={searches[active]}
            onChange={(event) =>
              setSearches({ ...searches, [active]: event.target.value })
            }
          />
        </label>
      )}
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
              <SelfUpdate
                lang={lang}
                active={active === key}
                search={searches.smarti}
              />
              <UpdateList
                lang={lang}
                category="smarti"
                active={active === key}
                search={searches.smarti}
              />
            </>
          ) : key === "extensions" ? (
            <UpdateList
              lang={lang}
              category="extensions"
              active={active === key}
              search={searches.extensions}
            />
          ) : appsVisited && advanced ? (
            <Apps lang={lang} embedded updatesOnly active={active === key} />
          ) : null}
        </div>
      ))}
    </section>
  );
}
