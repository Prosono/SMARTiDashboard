import { useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Clapperboard,
  EyeOff,
  Layers,
  LayoutGrid,
  Plus,
  Radar,
  Search,
  Wifi,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { HiddenControls } from "./ControlVisibility";
import { DeviceWorkspaceDetail } from "./DeviceWorkspaceDetail";
import {
  deviceWorkspaceRoom,
  deviceWorkspaceRoomId,
  deviceWorkspaceStatus,
  deviceWorkspaceNetworkProviders,
} from "./deviceWorkspaceModel";
import { ClimateOverview } from "./home/ClimateOverview";
import { DeviceArtwork } from "./home/DeviceArtwork";
import { deviceName } from "./home/deviceMetadata";
import { LightOverview } from "./home/LightOverview";
import { MetricDeviceRenderer } from "./home/MetricDetails";
import { Scenes } from "./home/Scenes";
import { SettingsDialog } from "./home/SettingsDialog";
import {
  DiscoveredDevices,
  useDiscoveries,
  type Discovery,
} from "./manage/DiscoveredDevices";
import { IntegrationSetup } from "./manage/IntegrationSetup";
import { Groups } from "./Groups";
import { CONTROL_PAGE_SIZE } from "./PagedControls";
import { ProtocolDevices } from "./ProtocolDevices";
import { ProtocolLogo } from "./ProtocolLogo";
import { RadioAdvanced } from "./RadioAdvanced";
import { integrationName, smartiName } from "./branding";
import { en, nb } from "./i18n";
import type { Control, Home } from "./types";
import "./devicesPage.css";

const mobileQuery =
  "(max-width: 760px), (max-height: 500px) and (pointer: coarse)";
const phonePageSize = 16;
const deviceTypes = [
  { id: "light", nb: "Lys", en: "Lights", domains: ["light"] },
  {
    id: "climate",
    nb: "Klima",
    en: "Climate",
    domains: ["climate", "water_heater", "fan", "humidifier"],
  },
  {
    id: "switch",
    nb: "Brytere",
    en: "Switches",
    domains: ["switch", "input_boolean"],
  },
  {
    id: "sensors",
    nb: "Sensorer",
    en: "Sensors",
    domains: ["sensor", "binary_sensor"],
  },
  {
    id: "security",
    nb: "Sikkerhet",
    en: "Security",
    domains: ["lock", "camera", "alarm_control_panel"],
  },
  { id: "media", nb: "Multimedia", en: "Media", domains: ["media_player"] },
  { id: "cover", nb: "Solskjerming", en: "Shades", domains: ["cover"] },
  {
    id: "vacuum",
    nb: "Robotstøvsugere",
    en: "Robot vacuums",
    domains: ["vacuum"],
  },
] as const;

type PairedDevice = { id?: string; name?: string; provider: string };

export function DevicesPage({
  home,
  lang,
  admin,
  offline,
  protocol,
  selectProtocol,
  pairedDevice,
  add,
}: {
  home: Home;
  lang: string;
  admin: boolean;
  offline: boolean;
  protocol: string;
  selectProtocol: (value: string) => void;
  pairedDevice: PairedDevice | null;
  add: () => void;
}) {
  const english = lang === "en";
  const t = (norwegian: string, englishText: string) =>
    english ? englishText : norwegian;
  const words = english ? en : nb;
  const l10n = english ? "en-GB" : "nb-NO";
  const queryClient = useQueryClient();
  const renderControl = useContext(MetricDeviceRenderer);
  const discoveries = useDiscoveries(admin);
  const [mobile, setMobile] = useState(() => matchMedia(mobileQuery).matches);
  const [search, setSearch] = useState("");
  const [room, setRoom] = useState("*");
  const [type, setType] = useState("all");
  const [overview, setOverview] = useState(false);
  const [requestedPage, setPage] = useState(0);
  const [selectedId, select] = useState<string | null>(null);
  const [mobileOpen, openMobile] = useState(false);
  const [commandId, setCommand] = useState<string | null>(null);
  const [setup, setSetup] = useState<Discovery | "network" | null>(null);
  const list = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const screen = matchMedia(mobileQuery);
    const sync = () => {
      setMobile(screen.matches);
      if (!screen.matches) openMobile(false);
    };
    screen.addEventListener("change", sync);
    return () => screen.removeEventListener("change", sync);
  }, []);

  const controls = useMemo(
    () =>
      home.controls.filter(
        (control) =>
          !control.diagnostic &&
          control.domain !== "automation" &&
          !control.attributes.smarti_hidden,
      ),
    [home.controls],
  );
  const availableProtocol =
    !admin && ["discovered", "hidden"].includes(protocol) ? "all" : protocol;
  const networkView = availableProtocol === "network";
  const networkProviders = useMemo(
    () => deviceWorkspaceNetworkProviders(home.controls),
    [home.controls],
  );
  const categoryControls = useMemo(
    () =>
      networkView
        ? controls.filter((control) => networkProviders.has(control.id))
        : controls,
    [controls, networkProviders, networkView],
  );
  const domains = useMemo(
    () => new Set(categoryControls.map(({ domain }) => domain)),
    [categoryControls],
  );
  const filtered = useMemo(() => {
    const terms = search
      .trim()
      .toLocaleLowerCase(l10n)
      .split(/\s+/)
      .filter(Boolean);
    const kind = deviceTypes.find(({ id }) => id === type)?.domains;
    return categoryControls.filter((control) => {
      if (kind && !(kind as readonly string[]).includes(control.domain))
        return false;
      if (room !== "*" && deviceWorkspaceRoomId(control, home) !== room)
        return false;
      if (!terms.length) return true;
      const name = [
        control.name,
        deviceName(control, home),
        deviceWorkspaceRoom(control, home, lang),
        networkProviders.get(control.id),
        control.integration && integrationName(control.integration),
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase(l10n);
      return terms.every((term) => name.includes(term));
    });
  }, [
    categoryControls,
    home,
    l10n,
    lang,
    networkProviders,
    room,
    search,
    type,
  ]);
  const pageSize = mobile ? phonePageSize : CONTROL_PAGE_SIZE;
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(requestedPage, pages - 1);
  const start = page * pageSize;
  const visible = filtered.slice(start, start + pageSize);
  const selectedControl = categoryControls.find(({ id }) => id === selectedId);
  const selected = selectedControl || (!mobile ? visible[0] : null) || null;
  const command = controls.find(({ id }) => id === commandId);
  const discovered =
    admin && !discoveries.isError ? discoveries.data || [] : [];
  const discovery = discovered[0];
  const radio = ["zigbee2mqtt", "zwave_js"].includes(availableProtocol);
  const split = (availableProtocol === "all" || networkView) && !overview;

  useEffect(() => {
    if (selectedId === null || selectedControl) return;
    select(null);
    openMobile(false);
  }, [selectedControl, selectedId]);

  const primary = [
    {
      id: "all",
      label: t("Alle kontroller", "All controls"),
      icon: <LayoutGrid size={19} />,
    },
    { id: "groups", label: t("Grupper", "Groups"), icon: <Layers size={19} /> },
    {
      id: "scenes",
      label: t("Scener", "Scenes"),
      icon: <Clapperboard size={19} />,
    },
  ];
  const network = [
    {
      id: "zigbee2mqtt",
      label: "Zigbee",
      icon: <ProtocolLogo provider="zigbee2mqtt" label="" />,
    },
    {
      id: "zwave_js",
      label: "Z-Wave",
      icon: <ProtocolLogo provider="zwave_js" label="" />,
    },
    {
      id: "network",
      label: t("Wi-Fi og LAN", "Wi-Fi and LAN"),
      icon: <Wifi size={19} />,
    },
  ];
  const management = admin
    ? [
        {
          id: "discovered",
          label: t("Oppdaget", "Discovered"),
          icon: <Radar size={19} />,
        },
        {
          id: "hidden",
          label: t("Skjulte enheter", "Hidden devices"),
          icon: <EyeOff size={19} />,
        },
      ]
    : [];
  const categories = [...primary, ...network, ...management];
  const category =
    categories.find(({ id }) => id === availableProtocol) || primary[0];

  function resetPosition() {
    setPage(0);
    select(null);
    openMobile(false);
    list.current?.scrollTo({ top: 0 });
  }

  function changeProtocol(value: string) {
    if (networkView || value === "network") {
      setSearch("");
      setRoom("*");
      setType("all");
      resetPosition();
    }
    selectProtocol(value);
    setOverview(false);
    openMobile(false);
  }

  function turnPage(value: number) {
    if (value < 0 || value >= pages) return;
    setPage(value);
    select(null);
    openMobile(false);
    if (mobile) {
      window.requestAnimationFrame(() => {
        list.current?.scrollIntoView({ block: "start" });
        list.current?.querySelector("button")?.focus({ preventScroll: true });
      });
    } else {
      list.current?.scrollTo({ top: 0 });
    }
  }

  function categoryButton(entry: (typeof primary)[number]) {
    return (
      <button
        key={entry.id}
        type="button"
        aria-pressed={availableProtocol === entry.id}
        onClick={() => changeProtocol(entry.id)}
      >
        <span className="devices-category-icon" aria-hidden="true">
          {entry.icon}
        </span>
        <span>{entry.label}</span>
        {entry.id === "discovered" && discovered.length > 0 && (
          <span className="devices-discovery-count">{discovered.length}</span>
        )}
      </button>
    );
  }

  const addLabel = networkView
    ? t("Legg til integrasjon", "Add integration")
    : t("Legg til ny enhet", "Add new device");
  const addButton = admin && (
    <button
      type="button"
      className="primary compact devices-add"
      onClick={networkView ? () => setSetup("network") : add}
      aria-label={addLabel}
    >
      <Plus size={19} aria-hidden="true" />{" "}
      <span>{networkView ? addLabel : t("Legg til enhet", "Add device")}</span>
    </button>
  );

  return (
    <section
      className="devices-page"
      data-mobile={mobile}
      aria-labelledby="devices-page-title"
    >
      <header className="devices-page-heading">
        <div>
          <span className="eyebrow">{words.overview}</span>
          <h1 id="devices-page-title">{words.devices}</h1>
          <p>
            {controls.length.toLocaleString(l10n)} {words.controls} ·{" "}
            {home.areas.length} {t("rom", "rooms")}
          </p>
        </div>
        <div className="devices-desktop-action">{addButton}</div>
      </header>

      <div className="devices-compact-menu">
        <div className="devices-category-select">
          <span className="devices-category-icon" aria-hidden="true">
            {category.icon}
          </span>
          <select
            value={category.id}
            aria-label={t("Enhetskategori", "Device category")}
            onChange={(event) => changeProtocol(event.target.value)}
          >
            {categories.map(({ id, label }) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
          <ChevronDown size={17} aria-hidden="true" />
        </div>
        {addButton}
      </div>

      <div className="devices-workspace" data-split={split}>
        <aside className="devices-workspace-nav">
          <nav
            className="devices-category-nav"
            aria-label={t("Enhetskategorier", "Device categories")}
          >
            <div>{primary.map(categoryButton)}</div>
            <div>
              <h2>{t("Nettverk", "Network")}</h2>
              {network.map(categoryButton)}
            </div>
            {management.length > 0 && (
              <div>{management.map(categoryButton)}</div>
            )}
          </nav>
          {discovery && availableProtocol !== "discovered" && (
            <section className="devices-discovery-callout">
              <Radar size={25} aria-hidden="true" />
              <div>
                <strong>
                  {discovered.length === 1
                    ? t("1 ny enhet funnet", "1 new device found")
                    : t(
                        `${discovered.length} nye enheter funnet`,
                        `${discovered.length} new devices found`,
                      )}
                </strong>
                <small>
                  {smartiName(
                    discovery.name === discovery.domain
                      ? integrationName(discovery.domain)
                      : discovery.name,
                  )}{" "}
                  · {integrationName(discovery.domain)}
                </small>
              </div>
              <button
                type="button"
                className="primary compact"
                onClick={() =>
                  discovered.length === 1
                    ? setSetup(discovery)
                    : changeProtocol("discovered")
                }
              >
                {discovered.length === 1
                  ? t("Sett opp", "Set up")
                  : t("Se enheter", "View devices")}
                <ArrowRight size={17} aria-hidden="true" />
              </button>
            </section>
          )}
        </aside>

        <div className="devices-workspace-main">
          {availableProtocol === "scenes" ? (
            <Scenes
              home={home}
              lang={lang}
              admin={admin}
              offline={offline}
              manage
            />
          ) : availableProtocol === "groups" ? (
            <Groups home={home} lang={lang} admin={admin} />
          ) : availableProtocol === "discovered" && admin ? (
            <DiscoveredDevices lang={lang} />
          ) : availableProtocol === "hidden" && admin ? (
            <HiddenControls lang={lang} />
          ) : radio ? (
            <>
              {admin && (
                <div className="devices-radio-action">
                  <RadioAdvanced
                    provider={availableProtocol}
                    lang={english ? "en" : "nb"}
                  />
                </div>
              )}
              <ProtocolDevices
                key={availableProtocol}
                provider={availableProtocol}
                controls={home.controls}
                pairedDevice={
                  pairedDevice?.provider === availableProtocol
                    ? pairedDevice
                    : null
                }
                lang={english ? "en" : "nb"}
                admin={admin}
              />
            </>
          ) : overview ? (
            <>
              <button
                type="button"
                className="compact devices-overview-toggle"
                onClick={() => setOverview(false)}
              >
                <ArrowLeft size={17} aria-hidden="true" />{" "}
                {t("Tilbake til enhetslisten", "Back to device list")}
              </button>
              {type === "light" ? (
                <LightOverview home={home} offline={offline} lang={lang} />
              ) : (
                <ClimateOverview home={home} offline={offline} lang={lang} />
              )}
            </>
          ) : (
            <>
              <div className="devices-list-tools">
                <label className="devices-search">
                  <Search size={18} aria-hidden="true" />
                  <input
                    type="search"
                    value={search}
                    onChange={(event) => {
                      setSearch(event.target.value);
                      resetPosition();
                    }}
                    aria-label={t(
                      "Søk etter kontroll eller rom",
                      "Search for a control or room",
                    )}
                    placeholder={t(
                      "Søk etter kontroll eller rom",
                      "Search for a control or room",
                    )}
                  />
                </label>
                <select
                  aria-label={t("Rom", "Room")}
                  value={room}
                  onChange={(event) => {
                    setRoom(event.target.value);
                    resetPosition();
                  }}
                >
                  <option value="*">{t("Rom", "Room")}</option>
                  {home.areas.map(({ area_id, name }) => (
                    <option key={area_id} value={area_id}>
                      {name}
                    </option>
                  ))}
                  {categoryControls.some(
                    (control) => !deviceWorkspaceRoomId(control, home),
                  ) && <option value="">{words.unassigned}</option>}
                </select>
                <select
                  aria-label={t("Type", "Type")}
                  value={type}
                  onChange={(event) => {
                    setType(event.target.value);
                    resetPosition();
                  }}
                >
                  <option value="all">{t("Type", "Type")}</option>
                  {deviceTypes
                    .filter(
                      ({ id, domains: types }) =>
                        ["light", "climate", "switch", "sensors"].includes(
                          id,
                        ) || types.some((domain) => domains.has(domain)),
                    )
                    .map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry[english ? "en" : "nb"]}
                      </option>
                    ))}
                </select>
              </div>
              {!networkView && ["light", "climate"].includes(type) && (
                <button
                  type="button"
                  className="compact devices-overview-toggle"
                  onClick={() => setOverview(true)}
                >
                  {type === "light"
                    ? t("Lysstyring", "Lighting controls")
                    : t("Klimastyring", "Climate controls")}
                  <ChevronRight size={15} aria-hidden="true" />
                </button>
              )}
              {visible.length > 0 ? (
                <>
                  <ul
                    className="devices-control-list"
                    ref={list}
                    role="list"
                    aria-label={words.devices}
                  >
                    {visible.map((control) => {
                      const status = deviceWorkspaceStatus(
                        control,
                        lang,
                        offline,
                      );
                      const active =
                        selected?.id === control.id && (!mobile || mobileOpen);
                      const physicalName = networkView
                        ? deviceName(control, home)
                        : "";
                      const networkLabel =
                        networkView &&
                        (physicalName && physicalName !== control.name
                          ? physicalName
                          : networkProviders.get(control.id));
                      return (
                        <li key={control.id}>
                          <button
                            type="button"
                            className="devices-control-row"
                            data-selected={active}
                            aria-pressed={mobile ? undefined : active}
                            aria-haspopup={mobile ? "dialog" : undefined}
                            onClick={() => {
                              select(control.id);
                              if (mobile) openMobile(true);
                            }}
                          >
                            <span className="devices-row-art">
                              <DeviceArtwork
                                c={control}
                                available={!offline}
                                size={mobile ? 42 : 48}
                              />
                            </span>
                            <span className="devices-row-name">
                              <strong>{control.name}</strong>
                              <small>
                                {[
                                  deviceWorkspaceRoom(control, home, lang),
                                  networkLabel,
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </small>
                            </span>
                            <span
                              className="devices-row-status"
                              data-tone={status.tone}
                            >
                              {status.label}
                            </span>
                            <ChevronRight
                              className="devices-row-arrow"
                              size={17}
                              aria-hidden="true"
                            />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  <nav
                    className="devices-pagination"
                    aria-label={t("Enhetssider", "Device pages")}
                  >
                    <span role="status">
                      {start + 1}–{Math.min(start + pageSize, filtered.length)}{" "}
                      {t("av", "of")} {filtered.length.toLocaleString(l10n)}
                    </span>
                    <div>
                      <button
                        type="button"
                        disabled={page === 0}
                        onClick={() => turnPage(page - 1)}
                      >
                        {t("Forrige", "Previous")}
                      </button>
                      <button
                        type="button"
                        disabled={page === pages - 1}
                        onClick={() => turnPage(page + 1)}
                      >
                        {t("Neste", "Next")}
                      </button>
                    </div>
                  </nav>
                </>
              ) : (
                <div className="devices-empty">
                  {networkView && !categoryControls.length ? (
                    <>
                      <Wifi size={23} aria-hidden="true" />
                      <p>
                        {t(
                          "Ingen nettverksenheter med synlige kontroller ennå.",
                          "No network devices with visible controls yet.",
                        )}
                      </p>
                    </>
                  ) : (
                    <>
                      <Search size={23} aria-hidden="true" />
                      <p>
                        {categoryControls.length
                          ? words.noResults
                          : words.emptyHint}
                      </p>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {split && (
          <DeviceWorkspaceDetail
            control={selected}
            home={home}
            lang={lang}
            admin={admin}
            offline={offline}
            openControl={(control) => setCommand(control.id)}
            mobileOpen={mobile && mobileOpen && Boolean(selectedControl)}
            close={() => openMobile(false)}
          />
        )}
      </div>

      {command && renderControl && (
        <SettingsDialog
          title={command.name}
          presentation="device"
          lang={lang}
          onClose={() => setCommand(null)}
        >
          <div className="metric-device-detail">{renderControl(command)}</div>
        </SettingsDialog>
      )}
      {setup && admin && (
        <IntegrationSetup
          lang={lang}
          discovery={setup === "network" ? undefined : setup}
          close={() => {
            setSetup(null);
            void discoveries.refetch();
            void queryClient.invalidateQueries({
              queryKey: ["manage", "integrations"],
            });
          }}
        />
      )}
    </section>
  );
}
