import { Search } from "lucide-react";
import { useContext, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  deviceWorkspaceNetworkProviders,
  deviceWorkspaceSearch,
  isDeviceWorkspaceControl,
} from "../deviceWorkspaceModel";
import type { Home } from "../types";
import { MetricDeviceRenderer } from "./MetricDetails";
import { OverviewDeviceList } from "./OverviewDeviceList";
import { SettingsDialog } from "./SettingsDialog";
import "./homeDeviceSearch.css";

const resultsPerPage = 12;

export function HomeDeviceSearch({
  home,
  lang,
  offline,
  onClose,
}: {
  home: Home;
  lang: string;
  offline: boolean;
  onClose: () => void;
}) {
  const en = lang === "en";
  const renderDevice = useContext(MetricDeviceRenderer);
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(resultsPerPage);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const controls = useMemo(
    () => home.controls.filter(isDeviceWorkspaceControl),
    [home.controls],
  );
  const providers = useMemo(
    () => deviceWorkspaceNetworkProviders(home.controls),
    [home.controls],
  );
  const matching = useMemo(
    () => controls.filter(deviceWorkspaceSearch(home, lang, query, providers)),
    [controls, home, lang, query, providers],
  );
  const selected = controls.find(({ id }) => id === selectedId);
  useLayoutEffect(() => input.current?.focus({ preventScroll: true }), []);

  return (
    <SettingsDialog
      title={en ? "Search devices" : "Søk etter enheter"}
      lang={lang}
      compact
      phoneSafeArea
      presentation="search"
      onClose={onClose}
    >
      <label className="home-device-search-field">
        <Search size={20} aria-hidden="true" />
        <input
          ref={input}
          type="search"
          value={query}
          aria-label={en ? "Find a device" : "Finn en enhet"}
          placeholder={
            en ? "Search by device or room" : "Søk etter enhet eller rom"
          }
          onChange={(event) => {
            setQuery(event.target.value);
            setLimit(resultsPerPage);
          }}
        />
      </label>
      <div className="home-device-search-results">
        {matching.length ? (
          <OverviewDeviceList
            home={home}
            lang={lang}
            offline={offline}
            kind="search"
            controls={matching.slice(0, limit)}
            onSelect={(device) => setSelectedId(device.id)}
          />
        ) : (
          <p role="status">
            {query.trim()
              ? en
                ? "No devices match your search."
                : "Ingen enheter passer med søket."
              : en
                ? "No devices available."
                : "Ingen enheter tilgjengelig."}
          </p>
        )}
        {matching.length > limit && (
          <button
            type="button"
            className="ghost home-device-search-more"
            onClick={() => setLimit((count) => count + resultsPerPage)}
          >
            {en ? "Show more devices" : "Vis flere enheter"}
          </button>
        )}
      </div>
      {selected && renderDevice && (
        <SettingsDialog
          title={selected.name}
          lang={lang}
          presentation="device"
          onClose={() => setSelectedId(null)}
        >
          <div className="metric-device-detail">{renderDevice(selected)}</div>
        </SettingsDialog>
      )}
    </SettingsDialog>
  );
}
