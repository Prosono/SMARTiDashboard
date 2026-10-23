import { useId, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronRight, Search, Activity } from "lucide-react";
import { SettingsDialog } from "./SettingsDialog";
import { energySensorReading } from "./energySensorReading";
import "./energySensorPicker.css";

export type EnergySensor = {
  entity: string;
  name: string;
  unit: string;
  state?: string;
};
type Props = {
  label: string;
  hint: string;
  sensors: EnergySensor[];
  lang?: string;
} & (
  | { multiple?: false; value: string; onChange: (entity: string) => void }
  | { multiple: true; value: string[]; onChange: (entities: string[]) => void }
);
export function EnergySensorPicker(props: Props) {
  const { label, hint, sensors, lang = "nb" } = props;
  const t = (nb: string, en: string) => (lang === "en" ? en : nb);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<string[]>([]);
  const id = useId();
  const values = props.multiple
    ? props.value
    : props.value
      ? [props.value]
      : [];
  const selected = sensors.find((s) => s.entity === values[0]);
  const matches = sensors.filter((s) =>
    `${s.name} ${s.entity} ${s.unit}`
      .toLocaleLowerCase()
      .includes(search.trim().toLocaleLowerCase()),
  );
  const missing = draft.filter(
    (entity) => !sensors.some((s) => s.entity === entity),
  );
  function choose(entity: string) {
    if (props.multiple)
      setDraft((items) =>
        items.includes(entity)
          ? items.filter((item) => item !== entity)
          : [...items, entity],
      );
    else {
      props.onChange(entity);
      setOpen(false);
    }
  }
  return (
    <div className="ep-sensor-picker">
      <span id={id} className="energy-picker-label">
        {label}
      </span>
      {hint && <small>{hint}</small>}
      <button
        type="button"
        className="energy-picker-trigger"
        aria-labelledby={id}
        aria-haspopup="dialog"
        onClick={() => {
          setDraft(values);
          setSearch("");
          setOpen(true);
        }}
      >
        <Activity size={20} aria-hidden="true" />
        <span>
          {props.multiple
            ? values.length
              ? `${values.length} ${t("målinger valgt", "readings selected")}`
              : t("Velg enheter og målinger", "Choose devices and readings")
            : selected
              ? selected.name
              : values.length
                ? t("Valgt måler mangler", "Selected sensor missing")
                : t("Velg måling", "Choose reading")}
          {props.multiple && values.length > 0 && (
            <small>
              {values
                .map(
                  (entity) =>
                    sensors.find((s) => s.entity === entity)?.name ||
                    t("Måler mangler", "Sensor missing"),
                )
                .join(", ")}
            </small>
          )}
          {!props.multiple && selected && (
            <strong>
              {energySensorReading(selected.state, selected.unit, lang)}
            </strong>
          )}
        </span>
        <ChevronRight size={19} aria-hidden="true" />
      </button>
      {open &&
        createPortal(
          <SettingsDialog
            lang={lang}
            title={label}
            compact
            onClose={() => setOpen(false)}
          >
            <div className="energy-picker-dialog">
              <p>
                {props.multiple
                  ? t(
                      "Velg målingene du vil følge. Du kan velge flere enheter.",
                      "Choose the readings you want to track. You can select multiple devices.",
                    )
                  : hint ||
                    t(
                      "Velg måleren som passer. Siste rapporterte verdi vises ved navnet.",
                      "Choose a sensor. Its latest reported reading appears beside the name.",
                    )}
              </p>
              <label className="energy-picker-search">
                <Search size={20} aria-hidden="true" />
                <input
                  autoFocus
                  type="search"
                  aria-label={t("Søk etter måler", "Search sensors")}
                  placeholder={t(
                    "Søk på navn eller enhet …",
                    "Search by name or device …",
                  )}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              <div
                className="energy-picker-list"
                role="group"
                aria-label={t("Tilgjengelige målinger", "Available readings")}
              >
                {!props.multiple && (
                  <button
                    type="button"
                    className="energy-picker-option"
                    onClick={() => choose("")}
                  >
                    <span>
                      {t(
                        "Ingen måling / velg senere",
                        "No reading / choose later",
                      )}
                    </span>
                    {!values.length && <Check size={20} aria-hidden="true" />}
                  </button>
                )}
                {matches.map((sensor) => {
                  const checked = draft.includes(sensor.entity);
                  const content = (
                    <>
                      <span className="energy-picker-name">
                        <strong>{sensor.name}</strong>
                        <small>
                          {["W", "kW"].includes(sensor.unit)
                            ? t("Effekt · akkurat nå", "Power · right now")
                            : ["Wh", "kWh"].includes(sensor.unit)
                              ? t(
                                  "Energi · forbruk over tid",
                                  "Energy · consumption over time",
                                )
                              : sensor.unit}
                        </small>
                        <small>{sensor.entity}</small>
                      </span>
                      <span className="energy-picker-reading">
                        {energySensorReading(sensor.state, sensor.unit, lang)}
                      </span>
                    </>
                  );
                  return props.multiple ? (
                    <label
                      key={sensor.entity}
                      className="energy-picker-option"
                      data-selected={checked}
                    >
                      <input
                        type="checkbox"
                        aria-label={sensor.name}
                        checked={checked}
                        onChange={() => choose(sensor.entity)}
                      />
                      {content}
                    </label>
                  ) : (
                    <button
                      type="button"
                      key={sensor.entity}
                      className="energy-picker-option"
                      data-selected={checked}
                      aria-pressed={checked}
                      onClick={() => choose(sensor.entity)}
                    >
                      {content}
                      {checked && <Check size={20} aria-hidden="true" />}
                    </button>
                  );
                })}
                {!matches.length && (
                  <p className="energy-picker-empty">
                    {sensors.length
                      ? t(
                          "Ingen treff. Prøv et annet navn.",
                          "No matches. Try another name.",
                        )
                      : t(
                          "Ingen passende målere funnet. Du kan legge til målinger senere.",
                          "No compatible sensors found. You can add readings later.",
                        )}
                  </p>
                )}
                {missing.map((entity) => (
                  <button
                    className="energy-picker-option"
                    type="button"
                    key={entity}
                    onClick={() => choose(entity)}
                  >
                    <span>
                      {t("Måler mangler", "Sensor missing")}
                      <small>{entity}</small>
                    </span>
                    <span>
                      {props.multiple
                        ? t("Fjern", "Remove")
                        : t("Behold", "Keep")}
                    </span>
                  </button>
                ))}
              </div>
              <footer className="energy-picker-footer">
                {props.multiple && (
                  <span role="status">
                    {draft.length} {t("valgt", "selected")}
                  </span>
                )}
                <button type="button" onClick={() => setOpen(false)}>
                  {t("Avbryt", "Cancel")}
                </button>
                {props.multiple && (
                  <button
                    type="button"
                    className="primary"
                    onClick={() => {
                      props.onChange(draft);
                      setOpen(false);
                    }}
                  >
                    {t("Bruk valgte", "Use selected")}
                  </button>
                )}
              </footer>
            </div>
          </SettingsDialog>,
          document.body,
        )}
    </div>
  );
}
