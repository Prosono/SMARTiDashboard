import "./temperatureValue.css";

/** Separate the unit from the reading; animate only when the real reported value changes. */
export function TemperatureValue({
  value,
  unit = "°C",
  lang,
}: {
  value: number | null;
  unit?: string;
  lang: string;
}) {
  const known = value !== null && Number.isFinite(value);
  const parts = known
    ? new Intl.NumberFormat(lang === "en" ? "en-GB" : "nb-NO", {
        maximumFractionDigits: 1,
      }).formatToParts(value)
    : [];
  const formatted = known ? parts.map((p) => p.value).join("") : "—";
  return (
    <span
      className="temperature-value"
      role="img"
      aria-label={
        known
          ? `${formatted} ${unit}`
          : lang === "en"
            ? "No temperature reading"
            : "Ingen temperaturmåling"
      }
      data-temperature-tone={
        !known ? "unknown" : value <= 5 ? "cool" : value >= 22 ? "warm" : "mild"
      }
    >
      <span key={formatted} className="temperature-number" aria-hidden="true">
        {known
          ? parts.map((p, index) => (
              <span
                key={index}
                className={
                  p.type === "fraction" || p.type === "decimal"
                    ? "temperature-fraction"
                    : undefined
                }
              >
                {p.value}
              </span>
            ))
          : "—"}
      </span>
      {known && (
        <span className="temperature-unit" aria-hidden="true">
          {unit}
        </span>
      )}
    </span>
  );
}
