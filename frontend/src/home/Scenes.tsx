import {
  collectionIcons as icons,
  collectionIconName,
  domainIcons,
  domainName,
} from "../collectionIcons";
import { allViews, allControls } from "../access";
import { LightColor } from "../LightColor";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Clapperboard,
  Sofa,
  Plus,
  Play,
  Pencil,
  Star,
  X,
  Trash2,
  ArrowRight,
  Check,
  Search,
} from "lucide-react";
import { api, ApiError } from "../api";
import type { Home, Control } from "../types";
import { usable } from "./homeModel";
import "./scenes.css";
type Scene = {
  id: string | null;
  entity_id: string;
  name: string;
  icon: string;
  available: boolean;
  entities?: string[];
  last_activated: string | null;
};
type Target = {
  state: string;
  volume_level?: number;
  brightness?: number;
  temperature?: number;
  rgb_color?: number[];
  color_temp_kelvin?: number;
};
type Draft = {
  name: string;
  icon: string;
  entities: Record<string, Target>;
  revision: string;
  preserved: string[];
};
const empty: Draft = {
  name: "",
  icon: "mdi:sofa",
  entities: {},
  revision: "",
  preserved: [],
};
function stateLabel(value: string, lang: string) {
  const labels: Record<string, [string, string]> = {
    open: ["Åpen", "Open"],
    closed: ["Lukket", "Closed"],
    playing: ["Spill", "Play"],
    paused: ["Pause", "Pause"],
    idle: ["Stopp", "Stop"],
    on: ["På", "On"],
    off: ["Av", "Off"],
    heat: ["Varme", "Heat"],
    cool: ["Kjøling", "Cool"],
    heat_cool: ["Varme / kjøling", "Heat / cool"],
    auto: ["Automatisk", "Automatic"],
    dry: ["Avfukting", "Dry"],
    fan_only: ["Vifte", "Fan"],
  };
  return labels[value]?.[lang === "en" ? 1 : 0] || value;
}
function statesFor(c: Control): string[] {
  const actions = c.capabilities.flatMap((cap) => cap.actions);
  if (c.domain === "climate")
    return (c.attributes.hvac_modes as string[]) || [];
  if (c.domain === "cover")
    return [
      ["open", "open_cover"],
      ["closed", "close_cover"],
    ]
      .filter(([, a]) => actions.includes(a))
      .map(([s]) => s);
  if (c.domain === "media_player")
    return [
      ["on", "turn_on"],
      ["off", "turn_off"],
      ["playing", "media_play"],
      ["paused", "media_pause"],
      ["idle", "media_stop"],
    ]
      .filter(([, a]) => actions.includes(a))
      .map(([s]) => s);
  return ["on", "off"];
}
function snapshot(c: Control): Target {
  if (["cover", "media_player"].includes(c.domain))
    return {
      state: statesFor(c).includes(c.state) ? c.state : statesFor(c)[0],
      ...(c.domain === "media_player" &&
      c.capabilities.some((cap) => cap.kind === "volume") &&
      typeof c.attributes.volume_level === "number"
        ? { volume_level: c.attributes.volume_level }
        : {}),
    };
  if (c.domain === "climate")
    return {
      state: ((c.attributes.hvac_modes as string[]) || []).includes(c.state)
        ? c.state
        : ((c.attributes.hvac_modes as string[]) || [])[0] || "off",
      ...(typeof c.attributes.temperature === "number"
        ? { temperature: c.attributes.temperature }
        : {}),
    };
  return {
    state: c.state === "on" ? "on" : "off",
    ...(c.domain === "light" && typeof c.attributes.brightness === "number"
      ? { brightness: c.attributes.brightness }
      : {}),
    ...(c.domain === "light" &&
    ["hs", "xy", "rgb", "rgbw", "rgbww"].includes(
      String(c.attributes.color_mode),
    ) &&
    Array.isArray(c.attributes.rgb_color)
      ? { rgb_color: c.attributes.rgb_color as number[] }
      : {}),
    ...(c.domain === "light" &&
    c.attributes.color_mode === "color_temp" &&
    typeof c.attributes.color_temp_kelvin === "number"
      ? { color_temp_kelvin: c.attributes.color_temp_kelvin }
      : {}),
  };
}
export function Scenes({
  home,
  offline,
  admin,
  lang,
  manage = false,
}: {
  home: Home;
  offline: boolean;
  admin: boolean;
  lang: string;
  manage?: boolean;
}) {
  const t = (nb: string, en: string) => (lang === "en" ? en : nb),
    qc = useQueryClient();
  const scenes = useQuery({
    queryKey: ["scenes"],
    queryFn: () => api<Scene[]>("scenes"),
    enabled: !offline && allViews(home),
    refetchInterval: 15000,
  });
  const [editor, setEditor] = useState<{
      id: string | null;
      draft: Draft;
    } | null>(null),
    [all, setAll] = useState(manage),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const rows = scenes.data || [],
    favorites = rows.filter((s) => home.favorites.includes(s.entity_id));
  async function activate(s: Scene) {
    if (busy || offline || !s.available || !allControls(home)) return;
    setBusy(true);
    setMessage("");
    try {
      const r = await api<{ status: string }>(
        `scenes/activate/${encodeURIComponent(s.entity_id)}`,
        "POST",
        { confirmed: true },
      );
      setMessage(
        r.status === "simulated"
          ? t("Simulert i demohjemmet.", "Simulated in the demo home.")
          : t(
              "Scenen er sendt til hjemmet. Utførelse er ikke bekreftet.",
              "Scene sent to your home. Execution is not confirmed.",
            ),
      );
      await qc.invalidateQueries({ queryKey: ["home"] });
    } catch {
      setMessage(
        t(
          "Aktivering kunne ikke bekreftes. Kontroller hjemmet før du prøver igjen.",
          "Activation could not be confirmed. Check your home before retrying.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  async function edit(s: Scene) {
    setBusy(true);
    try {
      const draft = await api<Draft>(
        `scenes/config/${encodeURIComponent(s.id!)}`,
      );
      setEditor({ id: s.id, draft });
    } catch {
      setMessage(
        t(
          "Denne scenen kan ikke redigeres her. Den kan være definert i en integrasjon eller en annen YAML-fil.",
          "This scene cannot be edited here. It may belong to an integration or another YAML file.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  if (!allViews(home)) return null;
  return (
    <section className="home-scenes">
      <header className="home-section-heading">
        <h2>
          <Clapperboard size={20} />
          {t("Scener for hele hjemmet", "Scenes for your whole home")}
        </h2>
        <div className="scene-header-actions">
          {rows.length > 0 && (
            <button onClick={() => setAll(!all)}>
              {all
                ? t("Vis favoritter", "Show favorites")
                : t("Vis alle scener", "Show all scenes")}
            </button>
          )}
          {admin && (
            <button
              disabled={offline || busy}
              onClick={() => setEditor({ id: null, draft: empty })}
            >
              <Plus size={16} />
              {t("Lag scene", "Create scene")}
            </button>
          )}
        </div>
      </header>
      <p className="scene-help">
        {t(
          "Kombiner lys, klima, persienner, brytere og media. Velg en ønsket tilstand for hver enhet, og aktiver alt med ett trykk.",
          "Combine lights, climate, blinds, switches and media. Choose a target state for each device and activate them together.",
        )}
      </p>
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      {scenes.isError && (
        <p role="alert">
          {t("Kunne ikke hente scener.", "Could not load scenes.")}{" "}
          <button onClick={() => scenes.refetch()}>
            {t("Prøv igjen", "Retry")}
          </button>
        </p>
      )}
      {scenes.isLoading ? (
        <p>{t("Henter scener…", "Loading scenes…")}</p>
      ) : rows.length === 0 ? (
        <div className="scene-empty">
          <Sofa size={26} />
          <div>
            <strong>
              {t("En stemning. Ett trykk.", "One mood. One tap.")}
            </strong>
            <p>
              {t(
                "Samle lys, stikkontakter og temperatur i for eksempel Filmkveld eller God morgen.",
                "Combine lights, plugs and temperature into Movie night or Good morning.",
              )}
            </p>
          </div>
        </div>
      ) : (
        <div className="scene-strip">
          {(all ? rows : (favorites.length ? favorites : rows).slice(0, 6)).map(
            (s, i) => {
              const Icon = icons[s.icon as keyof typeof icons] || Sofa;
              return (
                <article
                  className={`scene-card scene-color-${i % 4}`}
                  key={s.entity_id}
                >
                  <div className="scene-card-top">
                    <span className="scene-symbol">
                      <Icon size={23} />
                    </span>
                    <button
                      className="icon-button"
                      aria-label={`${t("Favorittscene", "Favorite scene")}: ${s.name}`}
                      aria-pressed={home.favorites.includes(s.entity_id)}
                      disabled={busy || offline}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await api(
                            `favorites/${encodeURIComponent(s.entity_id)}`,
                            "PUT",
                          );
                          await qc.invalidateQueries({ queryKey: ["home"] });
                        } catch {
                          setMessage(
                            t(
                              "Kunne ikke lagre favoritten.",
                              "Could not save favorite.",
                            ),
                          );
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      <Star
                        size={16}
                        fill={
                          home.favorites.includes(s.entity_id)
                            ? "currentColor"
                            : "none"
                        }
                      />
                    </button>
                  </div>
                  <h3>{s.name}</h3>
                  <small>
                    {s.available
                      ? t("Klar til å aktiveres", "Ready to activate")
                      : t("Utilgjengelig", "Unavailable")}
                  </small>
                  <div className="collection-domains">
                    {Array.from(
                      new Set((s.entities || []).map((e) => e.split(".")[0])),
                    ).map((domain) => {
                      const Icon = domainIcons[domain] || icons["mdi:group"];
                      return (
                        <span key={domain}>
                          <Icon size={14} />
                          {domainName(domain, lang)}
                        </span>
                      );
                    })}
                  </div>
                  <p className="collection-summary">
                    {s.entities?.length
                      ? t(
                          `${s.entities.length} enheter i én scene`,
                          `${s.entities.length} devices in one scene`,
                        )
                      : t(
                          "En samlet handling for hjemmet",
                          "One action for your home",
                        )}
                  </p>
                  <div className="scene-card-actions">
                    <button
                      disabled={
                        offline || busy || !s.available || !allControls(home)
                      }
                      onClick={() => void activate(s)}
                    >
                      <Play size={15} />
                      {t("Aktiver", "Activate")}
                    </button>
                    {admin && s.id && (
                      <button
                        disabled={offline || busy}
                        aria-label={`${t("Rediger scene", "Edit scene")}: ${s.name}`}
                        onClick={() => void edit(s)}
                      >
                        <Pencil size={16} />
                        {t("Rediger", "Edit")}
                      </button>
                    )}
                  </div>
                  {admin && !s.id && (
                    <small>
                      {t(
                        "Styres av integrasjonen – kan aktiveres her, men redigeres i kilden.",
                        "Managed by its integration — activate here, edit at the source.",
                      )}
                    </small>
                  )}
                </article>
              );
            },
          )}
        </div>
      )}
      {editor && (
        <SceneEditor
          initial={editor.draft}
          id={editor.id}
          home={home}
          lang={lang}
          offline={offline}
          close={() => setEditor(null)}
          saved={async (deleted = false) => {
            setEditor(null);
            setAll(true);
            setMessage(
              t(
                deleted
                  ? "Scenen er slettet."
                  : "Scenen er lagret. Den ble ikke aktivert.",
                deleted
                  ? "Scene deleted."
                  : "Scene saved. It was not activated.",
              ),
            );
            await Promise.all([
              qc.invalidateQueries({ queryKey: ["scenes"] }),
              qc.invalidateQueries({ queryKey: ["home"] }),
            ]);
          }}
        />
      )}
    </section>
  );
}
function SceneEditor({
  initial,
  id,
  home,
  lang,
  offline,
  close,
  saved,
}: {
  initial: Draft;
  id: string | null;
  home: Home;
  lang: string;
  offline: boolean;
  close: () => void;
  saved: (deleted?: boolean) => Promise<void>;
}) {
  const t = (nb: string, en: string) => (lang === "en" ? en : nb);
  const [draft, setDraft] = useState(initial),
    [step, setStep] = useState(0),
    [search, setSearch] = useState(""),
    [area, setArea] = useState("*"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const exit = () => {
    if (
      !busy &&
      (!dirty ||
        window.confirm(
          t("Forkaste endringene i scenen?", "Discard scene changes?"),
        ))
    )
      close();
  };
  const candidates = home.controls.filter(
    (c) =>
      !c.diagnostic &&
      ["light", "switch", "climate", "cover", "media_player"].includes(
        c.domain,
      ) &&
      statesFor(c).length > 0,
  );
  const selected = Object.entries(draft.entities);
  const room = (c: Control) =>
    home.areas.find((a) => a.area_id === c.area_id)?.name ||
    t("Uten rom", "No room");
  const patch = (eid: string, value: Partial<Target>) =>
    setDraft((d) => ({
      ...d,
      entities: { ...d.entities, [eid]: { ...d.entities[eid], ...value } },
    }));
  async function save() {
    setBusy(true);
    setError("");
    try {
      const { preserved, ...body } = draft;
      await api(
        id ? `scenes/config/${encodeURIComponent(id)}` : "scenes",
        id ? "PUT" : "POST",
        body,
        AbortSignal.timeout(35000),
      );
      await saved();
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 409
          ? t(
              "Scenen er endret et annet sted. Lukk og åpne den på nytt før du lagrer.",
              "Scene changed elsewhere. Close and reopen before saving.",
            )
          : e instanceof ApiError && e.status === 422
            ? t(
                "En av innstillingene kan ikke lagres. Gå tilbake til Enheter og kontroller tilstand, temperatur, lysstyrke og volum.",
                "One of the settings cannot be saved. Go back to Devices and check state, temperature, brightness and volume.",
              )
            : e instanceof ApiError && e.status === 403
              ? t(
                  "Du har ikke tilgang til å lagre scener.",
                  "You do not have permission to save scenes.",
                )
              : t(
                  "Kunne ikke bekrefte lagringen. Kontroller scenelisten før du prøver igjen.",
                  "Could not confirm the save. Check the scene list before retrying.",
                ),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="scene-editor"
      aria-labelledby="scene-editor-title"
      onCancel={(e) => {
        e.preventDefault();
        exit();
      }}
    >
      <header>
        <div>
          <span className="eyebrow">
            {t("Skap et øyeblikk", "Create a moment")}
          </span>
          <h2 id="scene-editor-title">
            {id
              ? t("Rediger scene", "Edit scene")
              : t("Din nye scene", "Your new scene")}
          </h2>
        </div>
        <button
          className="icon-button"
          aria-label={t("Lukk sceneredigering", "Close scene editor")}
          disabled={busy}
          onClick={exit}
        >
          <X />
        </button>
      </header>
      <ol className="scene-steps">
        {[
          t("Navn og ikon", "Name and icon"),
          t("Enheter", "Devices"),
          t("Se over", "Review"),
        ].map((label, i) => (
          <li
            key={label}
            className={step === i ? "current" : step > i ? "done" : ""}
          >
            <span>{step > i ? <Check size={14} /> : i + 1}</span>
            {label}
          </li>
        ))}
      </ol>
      <div className="scene-editor-body">
        <fieldset disabled={busy || offline}>
          {step === 0 && (
            <>
              <label className="scene-name">
                {t("Hva skal scenen hete?", "What should we call this scene?")}
                <input
                  autoFocus
                  maxLength={80}
                  value={draft.name}
                  placeholder={t(
                    "For eksempel Filmkveld",
                    "For example Movie night",
                  )}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </label>
              <div className="scene-icon-picker">
                {Object.entries(icons).map(([key, Icon], i) => (
                  <button
                    key={key}
                    aria-label={collectionIconName(i, lang)}
                    aria-pressed={draft.icon === key}
                    onClick={() => setDraft({ ...draft, icon: key })}
                  >
                    <Icon size={24} />
                    <span>{collectionIconName(i, lang)}</span>
                  </button>
                ))}
              </div>
              <p className="scene-explainer">
                {t(
                  "Én scene kan dempe lyset, justere temperaturen, lukke persiennene og sette musikken på pause. Velg det som passer hjemmet ditt.",
                  "One scene can dim lights, adjust temperature, close blinds and pause music. Choose what suits your home.",
                )}
              </p>
            </>
          )}
          {step === 1 && (
            <>
              <p className="scene-explainer">
                {t(
                  "Velg enheter og ønsket tilstand. Ingenting i hjemmet endres mens du redigerer.",
                  "Choose devices and target settings. Nothing in your home changes while editing.",
                )}
              </p>
              <div className="scene-search">
                <Search size={18} />
                <input
                  aria-label={t("Søk etter sceneenhet", "Search scene devices")}
                  placeholder={t(
                    "Finn lys, klima, persienner eller media …",
                    "Find lights, climate, blinds or media …",
                  )}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <select
                  aria-label={t("Filtrer scenerom", "Filter scene room")}
                  value={area}
                  onChange={(e) => setArea(e.target.value)}
                >
                  <option value="*">{t("Alle rom", "All rooms")}</option>
                  {home.areas.map((a) => (
                    <option key={a.area_id} value={a.area_id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="scene-device-list">
                {candidates
                  .filter(
                    (c) =>
                      (area === "*" || c.area_id === area) &&
                      `${c.name} ${room(c)}`
                        .toLowerCase()
                        .includes(search.toLowerCase()),
                  )
                  .map((c) => {
                    const DeviceIcon = domainIcons[c.domain] || Sofa;
                    const target = draft.entities[c.entity_id],
                      cap = c.capabilities.find(
                        (x) => x.kind === "temperature",
                      );
                    return (
                      <article className={target ? "selected" : ""} key={c.id}>
                        <label>
                          <input
                            type="checkbox"
                            checked={!!target}
                            disabled={!target && !usable(c)}
                            onChange={() =>
                              setDraft((d) => {
                                const entities = { ...d.entities };
                                if (target) delete entities[c.entity_id];
                                else entities[c.entity_id] = snapshot(c);
                                return { ...d, entities };
                              })
                            }
                          />
                          <span>
                            <strong>
                              <DeviceIcon size={16} aria-hidden="true" />{" "}
                              {c.name}
                            </strong>
                            <small>
                              {room(c)}
                              {!usable(c)
                                ? ` · ${t("Utilgjengelig", "Unavailable")}`
                                : ""}
                            </small>
                          </span>
                        </label>
                        {target && (
                          <div className="scene-target">
                            <label>
                              {t("Tilstand", "State")}
                              <select
                                aria-label={`${c.name}: ${t("Tilstand", "State")}`}
                                value={target.state}
                                onChange={(e) =>
                                  patch(c.entity_id, { state: e.target.value })
                                }
                              >
                                {(c.domain === "climate"
                                  ? Array.from(
                                      new Set([
                                        ...((c.attributes
                                          .hvac_modes as string[]) || []),
                                        target.state,
                                      ]),
                                    )
                                  : statesFor(c)
                                ).map((v) => (
                                  <option value={v} key={v}>
                                    {stateLabel(v, lang)}
                                  </option>
                                ))}
                              </select>
                            </label>
                            {c.domain === "light" &&
                              c.capabilities.some(
                                (x) => x.kind === "brightness",
                              ) && (
                                <label>
                                  {t("Lysstyrke", "Brightness")}
                                  <input
                                    type="range"
                                    aria-label={`${c.name}: ${t("Lysstyrke", "Brightness")}`}
                                    min={1}
                                    max={100}
                                    value={Math.round(
                                      ((target.brightness ?? 255) / 255) * 100,
                                    )}
                                    onChange={(e) =>
                                      patch(c.entity_id, {
                                        brightness: Math.round(
                                          (Number(e.target.value) / 100) * 255,
                                        ),
                                      })
                                    }
                                  />
                                  <span>
                                    {Math.round(
                                      ((target.brightness ?? 255) / 255) * 100,
                                    )}
                                    %
                                  </span>
                                </label>
                              )}
                            {c.domain === "light" && (
                              <LightColor
                                c={{
                                  ...c,
                                  attributes: {
                                    ...c.attributes,
                                    rgb_color: target.rgb_color,
                                    color_temp_kelvin: target.color_temp_kelvin,
                                    color_mode: target.color_temp_kelvin
                                      ? "color_temp"
                                      : "rgb",
                                  },
                                }}
                                lang={lang}
                                disabled={busy || offline}
                                change={(action, value) =>
                                  patch(
                                    c.entity_id,
                                    action === "set_rgb_color"
                                      ? {
                                          rgb_color: value as number[],
                                          color_temp_kelvin: undefined,
                                        }
                                      : {
                                          color_temp_kelvin: value as number,
                                          rgb_color: undefined,
                                        },
                                  )
                                }
                              />
                            )}
                            {c.domain === "media_player" &&
                              target.state !== "off" &&
                              c.capabilities.some(
                                (cap) => cap.kind === "volume",
                              ) && (
                                <label>
                                  {t("Volum", "Volume")}
                                  <input
                                    type="number"
                                    aria-label={`${c.name}: ${t("Volum", "Volume")}`}
                                    min={0}
                                    max={100}
                                    step={1}
                                    placeholder={t(
                                      "Ikke endre",
                                      "Keep current",
                                    )}
                                    value={
                                      target.volume_level === undefined
                                        ? ""
                                        : Math.round(target.volume_level * 100)
                                    }
                                    onChange={(e) =>
                                      patch(c.entity_id, {
                                        volume_level:
                                          e.target.value === ""
                                            ? undefined
                                            : Number(e.target.value) / 100,
                                      })
                                    }
                                  />
                                  <span>%</span>
                                </label>
                              )}
                            {c.domain === "climate" && cap && (
                              <label>
                                {t("Temperatur", "Temperature")}
                                <input
                                  type="number"
                                  aria-label={`${c.name}: ${t("Temperatur", "Temperature")}`}
                                  min={cap.minimum!}
                                  max={cap.maximum!}
                                  step={cap.step!}
                                  value={target.temperature ?? ""}
                                  onChange={(e) =>
                                    patch(c.entity_id, {
                                      temperature: e.target.value
                                        ? Number(e.target.value)
                                        : undefined,
                                    })
                                  }
                                />
                                <span>
                                  {String(c.attributes.temperature_unit || "")}
                                </span>
                              </label>
                            )}
                            <button
                              className="text-button"
                              disabled={!usable(c)}
                              onClick={() => patch(c.entity_id, snapshot(c))}
                            >
                              {t(
                                "Bruk nåværende tilstand",
                                "Use current settings",
                              )}
                            </button>
                          </div>
                        )}
                      </article>
                    );
                  })}
              </div>
            </>
          )}
          {step === 2 && (
            <div className="scene-review">
              <h3>{draft.name}</h3>
              <p>
                {t("Når du aktiverer scenen:", "When you activate this scene:")}
              </p>
              <ul>
                {selected.map(([eid, target]) => (
                  <li key={eid}>
                    <strong>
                      {home.controls.find((c) => c.entity_id === eid)?.name ||
                        eid}
                    </strong>
                    <span>
                      {stateLabel(target.state, lang)}
                      {target.brightness !== undefined
                        ? ` · ${Math.round((target.brightness / 255) * 100)}%`
                        : ""}
                      {target.volume_level !== undefined
                        ? ` · ${Math.round(target.volume_level * 100)}% ${t("volum", "volume")}`
                        : ""}
                      {target.temperature !== undefined
                        ? ` · ${target.temperature}°`
                        : ""}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="scene-explainer">
                {t(
                  "Lagring aktiverer ikke scenen. Andre eksisterende innstillinger, som lysfarger, beholdes.",
                  "Saving does not activate the scene. Other existing settings, such as light colors, are preserved.",
                )}
              </p>
            </div>
          )}
          {!!draft.preserved.length && (
            <p className="scene-explainer">
              {t(
                "Andre enheter beholdes uendret:",
                "Other devices are preserved:",
              )}{" "}
              {draft.preserved.join(", ")}
            </p>
          )}
        </fieldset>
      </div>
      {offline && (
        <p role="alert">
          {t("Hjemmet er frakoblet.", "Home is disconnected.")}
        </p>
      )}
      {busy && (
        <p role="status" aria-live="polite" className="notice">
          {t(
            "Lagrer scenen og venter på bekreftelse fra hjemmesentralen…",
            "Saving the scene and waiting for confirmation from the home hub…",
          )}
        </p>
      )}
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      <footer className="scene-editor-footer">
        {id && (
          <button
            className="scene-delete"
            disabled={busy || offline}
            onClick={async () => {
              if (
                !window.confirm(
                  t(
                    "Slette denne scenen? Enhetene beholdes.",
                    "Delete this scene? Devices are kept.",
                  ),
                )
              )
                return;
              setBusy(true);
              try {
                await api(
                  `scenes/config/${encodeURIComponent(id)}?expected_revision=${draft.revision}`,
                  "DELETE",
                );
                await saved(true);
              } catch {
                setError(
                  t(
                    "Kunne ikke slette scenen. Åpne den på nytt og prøv igjen.",
                    "Could not delete scene. Reopen and retry.",
                  ),
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <Trash2 size={17} />
            {t("Slett", "Delete")}
          </button>
        )}
        <div>
          {step > 0 && (
            <button disabled={busy} onClick={() => setStep(step - 1)}>
              {t("Tilbake", "Back")}
            </button>
          )}
          {step < 2 ? (
            <button
              className="scene-primary"
              disabled={
                busy ||
                offline ||
                !draft.name.trim() ||
                (step === 1 && !selected.length && !draft.preserved.length)
              }
              onClick={() => setStep(step + 1)}
            >
              {t("Neste", "Next")}
              <ArrowRight size={16} />
            </button>
          ) : (
            <button
              className="scene-primary"
              disabled={busy || offline}
              onClick={() => void save()}
            >
              {busy ? t("Lagrer…", "Saving…") : t("Lagre scene", "Save scene")}
              <Check size={16} />
            </button>
          )}
        </div>
      </footer>
    </dialog>
  );
}
