export const reportLocale = (lang = "nb") =>
  lang === "en" ? "en-GB" : "nb-NO";
export function reportValue(value: unknown): number | null {
  if (
    (typeof value !== "number" && typeof value !== "string") ||
    (typeof value === "string" && !value.trim())
  )
    return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
export const reportNumber = (value: unknown, lang = "nb", digits = 1) => {
  const n = reportValue(value);
  return n === null
    ? "—"
    : n.toLocaleString(reportLocale(lang), { maximumFractionDigits: digits });
};
export const reportDuration = (hours: number | null, lang = "nb") => {
  if (hours === null || !Number.isFinite(hours)) return "—";
  const minutes = Math.max(0, Math.round(hours * 60));
  return `${Math.floor(minutes / 60)} ${lang === "en" ? "h" : "t"} ${minutes % 60} min`;
};
export const reportDay = (value: string | Date) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Oslo" }).format(
    new Date(value),
  );
export const shiftReportDay = (day: string, delta: number) => {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return reportDay(date);
};
/** Energy covers the calendar days touched before the requested end instant. */
export function reportCalendarSpan(start: string, end: string) {
  const last = reportDay(new Date(Date.parse(end) - 1));
  return { from: reportDay(start), to: last, end: shiftReportDay(last, 1) };
}
export function comparisonChange(
  current: unknown,
  previous: unknown,
  complete: boolean,
) {
  const now = reportValue(current),
    before = reportValue(previous);
  return complete && now !== null && before !== null && before > 0
    ? (now / before - 1) * 100
    : null;
}
export function priceSummary(
  prices: { time_start: string; time_end: string; NOK_per_kWh: number }[],
) {
  const valid = prices.filter(
    (p) =>
      reportValue(p.NOK_per_kWh) !== null &&
      Date.parse(p.time_end) > Date.parse(p.time_start),
  );
  const hours = valid.reduce(
    (sum, p) =>
      sum + (Date.parse(p.time_end) - Date.parse(p.time_start)) / 3600000,
    0,
  );
  return {
    hours,
    average: hours
      ? (valid.reduce(
          (sum, p) =>
            sum +
            (p.NOK_per_kWh *
              (Date.parse(p.time_end) - Date.parse(p.time_start))) /
              3600000,
          0,
        ) /
          hours) *
        100
      : null,
    low: valid.length
      ? Math.min(...valid.map((p) => p.NOK_per_kWh)) * 100
      : null,
    high: valid.length
      ? Math.max(...valid.map((p) => p.NOK_per_kWh)) * 100
      : null,
  };
}
export function reportCSV(rows: unknown[][]) {
  return (
    "\ufeff" +
    rows
      .map((row) =>
        row
          .map((value) => {
            let cell = value == null ? "" : String(value);
            // Treat real numbers as numbers; neutralize formula-like user-supplied names.
            if (
              typeof value !== "number" &&
              /^\s*[=+@-]/.test(cell) &&
              !/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(cell)
            )
              cell = "'" + cell;
            return '"' + cell.replaceAll('"', '""') + '"';
          })
          .join(","),
      )
      .join("\r\n")
  );
}
export function downloadReportCSV(rows: unknown[][], filename: string) {
  const url = URL.createObjectURL(
    new Blob([reportCSV(rows)], { type: "text/csv;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function printReport() {
  const closed = Array.from(
    document.querySelectorAll<HTMLDetailsElement>(
      ".er-document details:not([open])",
    ),
  );
  closed.forEach((detail) => (detail.open = true));
  const clear = () => {
    document.body.classList.remove("printing-energy-report");
    closed.forEach((detail) => (detail.open = false));
  };
  document.body.classList.add("printing-energy-report");
  window.addEventListener("afterprint", clear, { once: true });
  try {
    window.print();
  } catch {
    clear();
    window.removeEventListener("afterprint", clear);
  }
}
