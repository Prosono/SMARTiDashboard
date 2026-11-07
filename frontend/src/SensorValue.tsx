import type { Control } from "./types";
import { sensorDisplayValue } from "./sensorValueModel";

export function SensorValue({ c, lang }: { c: Control; lang: string }) {
  const display = sensorDisplayValue(c, lang);
  const raw = `${c.state}${c.attributes.unit_of_measurement ? ` ${c.attributes.unit_of_measurement}` : ""}`;
  return (
    <span
      className="big-value sensor-value"
      data-kind={display.kind}
      title={raw}
    >
      {display.kind === "timestamp" ? (
        <time dateTime={c.state}>
          <span>{display.value}</span>
          {display.secondary && <small>{display.secondary}</small>}
        </time>
      ) : (
        <>
          <span>{display.value}</span>
          {display.unit && <small>{display.unit}</small>}
        </>
      )}
    </span>
  );
}
