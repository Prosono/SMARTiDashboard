/** Latest reported reading; missing values must never look like measured zero. */
export function energySensorReading(
  state: string | undefined,
  unit: string,
  lang = "nb",
) {
  const norwegian = lang !== "en";
  if (state === "unavailable")
    return norwegian ? "Utilgjengelig" : "Unavailable";
  if (!state?.trim() || !Number.isFinite(Number(state)))
    return norwegian ? "Ingen måling" : "No reading";
  return `${new Intl.NumberFormat(norwegian ? "nb-NO" : "en-GB", { maximumFractionDigits: 3 }).format(Number(state))} ${unit}`;
}
