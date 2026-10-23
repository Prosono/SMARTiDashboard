import { useId, useState } from "react";

import { energySensorReading } from "./energySensorReading";

type Sensor = { entity: string; name: string; unit: string; state?: string };
/** Search stays local and only offers compatible measurements supplied by the hub. */
export function EnergySensorPicker({
  label,
  hint,
  sensors,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  sensors: Sensor[];
  value: string;
  onChange: (entity: string) => void;
}) {
  const [search, setSearch] = useState("");
  const id = useId();
  const selected = sensors.find((s) => s.entity === value);
  const matches = sensors.filter((s) =>
    `${s.name} ${s.entity}`
      .toLocaleLowerCase()
      .includes(search.toLocaleLowerCase()),
  );
  return (
    <div className="ep-sensor-picker">
      <label htmlFor={id}>
        <span>{label}</span>
        <small>{hint}</small>
      </label>
      <details>
        <summary>
          {selected
            ? `${selected.name} · ${energySensorReading(selected.state, selected.unit)}`
            : value
              ? "Valgt måler er ikke tilgjengelig"
              : "Velg måling (valgfritt)"}
        </summary>
        <label>
          Søk etter {label.toLocaleLowerCase()}
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Navn på enhet eller måler"
          />
        </label>
        <select
          id={id}
          aria-label={label}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Velg senere / ingen måling</option>
          {value && !matches.some((s) => s.entity === value) && (
            <option value={value}>
              {selected
                ? `${selected.name} · ${energySensorReading(selected.state, selected.unit)}`
                : "Tidligere valgt måler"}
            </option>
          )}
          {matches.map((s) => (
            <option key={s.entity} value={s.entity}>
              {s.name} · {energySensorReading(s.state, s.unit)} · {s.entity}
            </option>
          ))}
        </select>
        {!matches.length && (
          <p>Ingen passende målere funnet. Du kan koble til en måler senere.</p>
        )}
      </details>
    </div>
  );
}
