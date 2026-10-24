import { createPortal } from "react-dom";
import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Radio,
  ChevronRight,
  ArrowLeft,
  Zap,
  Filter,
  Play,
  Search,
} from "lucide-react";
import type { Home } from "../types";
import { api } from "../api";
import { SettingsDialog } from "../home/SettingsDialog";
import { flowIcon, type FlowKind } from "./flowPresentation";
import { entityState } from "./entityWords";
import {
  flowDevices,
  deviceFeatures,
  deviceFeatureStep,
  type DeviceGroup,
  type DeviceFeature,
} from "./flowDevices";
type Field = {
  name?: string;
  required?: boolean;
  default?: unknown;
  selector?: Record<string, any>;
  fields?: Record<string, Field>;
};
type Service = { action: string; name: string; fields: Record<string, Field> };
function fieldsOf(fields: Record<string, Field>): [string, Field][] {
  return Object.entries(fields)
    .flatMap(([key, f]) =>
      f.fields ? fieldsOf(f.fields) : [[key, f] as [string, Field]],
    )
    .filter(([key]) => key !== "entity_id");
}
export function FlowDeviceLibrary({
  home,
  lang,
  onCreate,
  canDrop,
  disabled = false,
}: {
  home: Home;
  lang: string;
  onCreate: (
    kind: FlowKind,
    row: Record<string, any>,
    point?: { x: number; y: number },
  ) => void;
  disabled?: boolean;
  canDrop: (x: number, y: number) => boolean;
}) {
  const t = (nb: string, en: string) => (lang === "en" ? en : nb);
  const groups = useMemo(() => flowDevices(home), [home]);
  const [search, setSearch] = useState("");
  const [chosenGroup, setGroup] = useState<DeviceGroup | null>(null);
  const group = chosenGroup
    ? groups.find((g) => g.id === chosenGroup.id) || chosenGroup
    : null;
  const [chosenFeature, setFeature] = useState<DeviceFeature | null>(null);
  const feature =
    chosenFeature && group
      ? deviceFeatures(group, lang).find(
          (f) =>
            f.control.entity_id === chosenFeature.control.entity_id &&
            f.attribute === chosenFeature.attribute,
        ) || chosenFeature
      : null;
  const [showAllFields, setShowAllFields] = useState(false);
  const [featureSearch, setFeatureSearch] = useState("");
  const [service, setService] = useState<Service | null>(null);
  const [jsonErrors, setJsonErrors] = useState<Record<string, boolean>>({});
  const [rawValues, setRawValues] = useState<Record<string, string>>({});
  const [values, setValues] = useState<Record<string, any>>({});
  const [ghost, setGhost] = useState<{
    name: string;
    x: number;
    y: number;
  } | null>(null);
  const gesture = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const skipClick = useRef(false),
    drop = useRef<{ x: number; y: number } | undefined>(undefined);
  const services = useQuery({
    queryKey: ["manage", "automation-services", feature?.control.entity_id],
    queryFn: () =>
      api<Service[]>(
        `manage/automation-services?entity_id=${encodeURIComponent(feature!.control.entity_id)}`,
      ),
    enabled: !!feature && !feature.attribute,
    staleTime: 60_000,
    retry: false,
  });
  function open(g: DeviceGroup, point?: { x: number; y: number }) {
    drop.current = point;
    setFeature(null);
    setService(null);
    setFeatureSearch("");
    setGroup(g);
  }
  function finish(kind: FlowKind, row: Record<string, any>) {
    onCreate(kind, row, drop.current);
    setGroup(null);
    setFeature(null);
    setService(null);
  }
  const visible = groups.filter((g) =>
    [g.name, g.room, ...g.controls.map((c) => c.name)]
      .join(" ")
      .toLocaleLowerCase()
      .includes(search.toLocaleLowerCase()),
  );
  return (
    <>
      <label className="flow-device-search">
        <Search size={16} />
        <input
          aria-label={t("Søk etter enhet", "Search devices")}
          placeholder={t(
            "Enhet, rom eller måling …",
            "Device, room or measurement …",
          )}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      <p className="muted">
        {t(
          "Dra inn en enhet. Velg deretter funksjon og Når, Og eller Så.",
          "Drag in a device, then choose a function and When, And or Then.",
        )}
      </p>
      {disabled && (
        <p role="status">
          {t(
            "Fullfør eller avbryt steget du redigerer først.",
            "Finish or cancel the step you are editing first.",
          )}
        </p>
      )}
      <div className="canvas-library-list flow-device-list">
        {visible.map((g) => (
          <button
            type="button"
            key={g.id}
            className="canvas-palette-card"
            draggable={false}
            disabled={disabled}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              skipClick.current = false;
              gesture.current = { x: e.clientX, y: e.clientY, moved: false };
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              const d = gesture.current;
              if (!d) return;
              if (!(e.buttons & 1)) {
                gesture.current = null;
                setGhost(null);
                return;
              }
              if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 8)
                return;
              d.moved = true;
              skipClick.current = true;
              setGhost({ name: g.name, x: e.clientX, y: e.clientY });
            }}
            onPointerUp={(e) => {
              const d = gesture.current;
              gesture.current = null;
              setGhost(null);
              if (d?.moved && canDrop(e.clientX, e.clientY))
                open(g, { x: e.clientX, y: e.clientY });
            }}
            onPointerCancel={() => {
              gesture.current = null;
              setGhost(null);
              skipClick.current = true;
            }}
            onLostPointerCapture={() => {
              gesture.current = null;
              setGhost(null);
            }}
            onClick={() => {
              if (skipClick.current) {
                skipClick.current = false;
                return;
              }
              open(g);
            }}
          >
            <Radio size={20} />
            <span>
              <strong>{g.name}</strong>
              <small>
                {g.room ? `${g.room} · ` : ""}
                {g.controls.length} {t("funksjoner", "functions")}
              </small>
            </span>
            <ChevronRight size={15} />
          </button>
        ))}
        {!visible.length && (
          <p className="muted">
            {t("Ingen enheter passer søket.", "No matching devices.")}
          </p>
        )}
      </div>
      {ghost && (
        <div
          className="canvas-new-card-preview"
          style={{ left: ghost.x + 16, top: ghost.y + 16 }}
          aria-hidden="true"
        >
          <Radio size={18} />
          {ghost.name}
        </div>
      )}
      {group &&
        createPortal(
          <SettingsDialog
            title={group.name}
            lang={lang}
            onClose={() => setGroup(null)}
          >
            <div className="flow-device-picker">
              {feature ? (
                <>
                  <button
                    type="button"
                    className="flow-device-back"
                    onClick={() => {
                      setFeature(null);
                      setService(null);
                    }}
                  >
                    <ArrowLeft size={16} />
                    {t("Alle funksjoner", "All functions")}
                  </button>
                  <h3>{feature.name}</h3>
                  <p className="muted">
                    {feature.control.name}
                    {feature.attribute ? ` · ${feature.attribute}` : ""}
                  </p>
                  <div className="flow-device-current">
                    <span>{t("Akkurat nå", "Right now")}</span>
                    <strong>
                      {feature.attribute
                        ? String(feature.value)
                        : entityState(
                            feature.control.entity_id,
                            feature.value,
                            home,
                            lang,
                          )}{" "}
                      {feature.unit}
                    </strong>
                  </div>
                  <h4>
                    {t(
                      "Hvordan vil du bruke denne?",
                      "How would you like to use this?",
                    )}
                  </h4>
                  <div className="flow-device-roles">
                    <button
                      type="button"
                      className="library-triggers"
                      onClick={() =>
                        finish(
                          "triggers",
                          deviceFeatureStep(feature, "triggers"),
                        )
                      }
                    >
                      <Zap />
                      <span>
                        <strong>{t("Når", "When")}</strong>
                        <small>
                          {feature.numeric
                            ? t(
                                "En verdi går over eller under en grense",
                                "A value crosses a threshold",
                              )
                            : t(
                                "Tilstanden eller verdien endrer seg",
                                "The state or value changes",
                              )}
                        </small>
                      </span>
                      <ChevronRight />
                    </button>
                    <button
                      type="button"
                      className="library-conditions"
                      onClick={() =>
                        finish(
                          "conditions",
                          deviceFeatureStep(feature, "conditions"),
                        )
                      }
                    >
                      <Filter />
                      <span>
                        <strong>{t("Og", "And")}</strong>
                        <small>
                          {t(
                            "Denne verdien må stemme",
                            "This value must match",
                          )}
                        </small>
                      </span>
                      <ChevronRight />
                    </button>
                  </div>
                  {!feature.attribute && (
                    <section className="flow-device-actions">
                      <h4>
                        <Play size={18} />
                        {t(
                          "Så – styr funksjonen",
                          "Then – control this function",
                        )}
                      </h4>
                      {services.isPending && (
                        <p role="status">
                          {t(
                            "Henter tilgjengelige handlinger …",
                            "Loading available actions …",
                          )}
                        </p>
                      )}
                      {services.isError && (
                        <p role="alert">
                          {t(
                            "Kunne ikke hente handlinger.",
                            "Could not load actions.",
                          )}{" "}
                          <button
                            type="button"
                            onClick={() => services.refetch()}
                          >
                            {t("Prøv igjen", "Retry")}
                          </button>
                        </p>
                      )}
                      {services.data?.length === 0 && (
                        <p className="muted">
                          {t(
                            "Ingen styrbare handlinger er tilgjengelige for denne funksjonen. Du kan fortsatt bruke den under Når og Og.",
                            "No controllable actions are available for this function. You can still use When and And.",
                          )}
                        </p>
                      )}
                      {!!services.data?.length && (
                        <label>
                          {t("Handling", "Action")}
                          <select
                            value={service?.action || ""}
                            onChange={(e) => {
                              const s =
                                services.data.find(
                                  (v) => v.action === e.target.value,
                                ) || null;
                              setService(s);
                              setShowAllFields(false);
                              setJsonErrors({});
                              setRawValues({});
                              setValues(
                                s
                                  ? Object.fromEntries(
                                      fieldsOf(s.fields)
                                        .filter(
                                          ([, f]) => f.default !== undefined,
                                        )
                                        .map(([k, f]) => [k, f.default]),
                                    )
                                  : {},
                              );
                            }}
                          >
                            <option value="">
                              {t("Velg handling …", "Choose action …")}
                            </option>
                            {services.data.map((s) => (
                              <option key={s.action} value={s.action}>
                                {s.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      {service && (
                        <>
                          <button
                            type="button"
                            className="flow-device-back"
                            onClick={() => setShowAllFields((v) => !v)}
                            aria-expanded={showAllFields}
                          >
                            {showAllFields
                              ? t("Færre innstillinger", "Fewer settings")
                              : t(
                                  "Alle innstillinger for handlingen",
                                  "All action settings",
                                )}
                          </button>
                          {fieldsOf(service.fields)
                            .filter(
                              ([key, f]) =>
                                showAllFields ||
                                f.required ||
                                [
                                  "brightness_pct",
                                  "temperature",
                                  "hvac_mode",
                                  "option",
                                  "value",
                                  "percentage",
                                  "position",
                                  "volume_level",
                                  "duration",
                                  "tone",
                                ].includes(key),
                            )
                            .map(([key, f]) => {
                              const complex =
                                [
                                  "object",
                                  "color_rgb",
                                  "color_rgbw",
                                  "color_rgbww",
                                  "location",
                                  "target",
                                ].some((k) => k in (f.selector || {})) ||
                                (f.default !== null &&
                                  typeof f.default === "object");
                              const number = f.selector?.number,
                                options =
                                  f.selector?.select?.options ||
                                  (key === "option"
                                    ? feature.control.attributes.options
                                    : undefined) ||
                                  (key === "hvac_mode"
                                    ? feature.control.attributes.hvac_modes
                                    : undefined);
                              return (
                                <label key={key}>
                                  {f.name || key.replaceAll("_", " ")}
                                  {f.required
                                    ? " *"
                                    : ` (${t("valgfritt", "optional")})`}
                                  {complex ? (
                                    <>
                                      <textarea
                                        aria-label={f.name || key}
                                        placeholder={t(
                                          "Verdi som JSON, for eksempel [255, 120, 0]",
                                          "JSON value, for example [255, 120, 0]",
                                        )}
                                        value={
                                          rawValues[key] ??
                                          (values[key] === undefined
                                            ? ""
                                            : JSON.stringify(values[key]))
                                        }
                                        onChange={(e) => {
                                          const raw = e.target.value;
                                          setRawValues({
                                            ...rawValues,
                                            [key]: raw,
                                          });
                                          try {
                                            const value = raw
                                              ? JSON.parse(raw)
                                              : undefined;
                                            setValues({
                                              ...values,
                                              [key]: value,
                                            });
                                            setJsonErrors({
                                              ...jsonErrors,
                                              [key]: false,
                                            });
                                          } catch {
                                            setJsonErrors({
                                              ...jsonErrors,
                                              [key]: true,
                                            });
                                          }
                                        }}
                                      />
                                      {jsonErrors[key] && (
                                        <small role="alert">
                                          {t(
                                            "Kontroller JSON-formatet.",
                                            "Check the JSON format.",
                                          )}
                                        </small>
                                      )}
                                    </>
                                  ) : options ? (
                                    <select
                                      value={values[key] ?? ""}
                                      onChange={(e) =>
                                        setValues({
                                          ...values,
                                          [key]: e.target.value,
                                        })
                                      }
                                    >
                                      <option value="">
                                        {t("Velg …", "Choose …")}
                                      </option>
                                      {(options as any[]).map((o) => (
                                        <option
                                          key={
                                            typeof o === "object" ? o.value : o
                                          }
                                          value={
                                            typeof o === "object" ? o.value : o
                                          }
                                        >
                                          {typeof o === "object" ? o.label : o}
                                        </option>
                                      ))}
                                    </select>
                                  ) : f.selector?.boolean !== undefined ? (
                                    <select
                                      value={
                                        values[key] === undefined
                                          ? ""
                                          : String(values[key])
                                      }
                                      onChange={(e) =>
                                        setValues({
                                          ...values,
                                          [key]:
                                            e.target.value === ""
                                              ? undefined
                                              : e.target.value === "true",
                                        })
                                      }
                                    >
                                      <option value="">—</option>
                                      <option value="true">
                                        {t("Ja", "Yes")}
                                      </option>
                                      <option value="false">
                                        {t("Nei", "No")}
                                      </option>
                                    </select>
                                  ) : (
                                    <input
                                      type={number ? "number" : "text"}
                                      min={number?.min}
                                      max={number?.max}
                                      step={number?.step || "any"}
                                      value={values[key] ?? ""}
                                      onChange={(e) =>
                                        setValues({
                                          ...values,
                                          [key]:
                                            number && e.target.value !== ""
                                              ? Number(e.target.value)
                                              : e.target.value,
                                        })
                                      }
                                    />
                                  )}
                                </label>
                              );
                            })}
                          <button
                            type="button"
                            className="primary"
                            disabled={
                              Object.values(jsonErrors).some(Boolean) ||
                              fieldsOf(service.fields).some(
                                ([k, f]) =>
                                  f.required &&
                                  (values[k] === undefined || values[k] === ""),
                              )
                            }
                            onClick={(e) => {
                              const inputs = e.currentTarget
                                .closest("section")
                                ?.querySelectorAll<HTMLInputElement>("input");
                              if (
                                inputs &&
                                Array.from(inputs).some(
                                  (input) => !input.reportValidity(),
                                )
                              )
                                return;
                              finish("actions", {
                                action: service.action,
                                target: {
                                  entity_id: feature.control.entity_id,
                                },
                                data: Object.fromEntries(
                                  Object.entries(values).filter(
                                    ([, v]) => v !== undefined && v !== "",
                                  ),
                                ),
                              });
                            }}
                          >
                            {t("Legg til handling", "Add action")}
                          </button>
                        </>
                      )}
                    </section>
                  )}
                </>
              ) : (
                <>
                  <p>
                    {t(
                      "Velg målingen, tilstanden eller funksjonen du vil bruke.",
                      "Choose the measurement, state or function to use.",
                    )}
                  </p>
                  <input
                    aria-label={t("Søk i funksjoner", "Search functions")}
                    placeholder={t(
                      "Temperatur, batteri, lys …",
                      "Temperature, battery, lights …",
                    )}
                    value={featureSearch}
                    onChange={(e) => setFeatureSearch(e.target.value)}
                  />
                  <div className="flow-device-features">
                    {deviceFeatures(group, lang)
                      .filter((f) =>
                        (f.name + " " + f.control.name)
                          .toLocaleLowerCase()
                          .includes(featureSearch.toLocaleLowerCase()),
                      )
                      .map((f) => {
                        const Icon = flowIcon(
                          { trigger: "state", entity_id: f.control.entity_id },
                          "triggers",
                          home,
                        );
                        return (
                          <button
                            type="button"
                            key={
                              f.control.entity_id + ":" + (f.attribute || "")
                            }
                            onClick={() => {
                              setFeature(f);
                              setService(null);
                            }}
                          >
                            <Icon size={22} />
                            <span>
                              <strong>{f.name}</strong>
                              <small>
                                {f.attribute ? f.control.name : group.room}
                              </small>
                            </span>
                            <b>
                              {f.attribute
                                ? String(f.value)
                                : entityState(
                                    f.control.entity_id,
                                    f.value,
                                    home,
                                    lang,
                                  )}{" "}
                              {f.unit}
                            </b>
                            <ChevronRight size={17} />
                          </button>
                        );
                      })}
                  </div>
                </>
              )}
            </div>
          </SettingsDialog>,
          document.body,
        )}
    </>
  );
}
