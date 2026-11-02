/** Shared labels and local photographs for both full weather cards and phone tiles. */
export function weatherLabel(state: string, lang: string) {
  const labels: Record<string, [string, string]> = {
    sunny: ["Sol", "Sunny"],
    cloudy: ["Skyet", "Cloudy"],
    partlycloudy: ["Delvis skyet", "Partly cloudy"],
    rainy: ["Regn", "Rain"],
    pouring: ["Kraftig regn", "Heavy rain"],
    snowy: ["Snø", "Snow"],
    "snowy-rainy": ["Sludd", "Sleet"],
    "clear-night": ["Klar natt", "Clear night"],
    fog: ["Tåke", "Fog"],
    windy: ["Vind", "Wind"],
    lightning: ["Torden", "Thunder"],
    "lightning-rainy": ["Tordenbyger", "Thunderstorms"],
    hail: ["Hagl", "Hail"],
    "windy-variant": ["Vind og skyer", "Wind and clouds"],
    exceptional: ["Ekstremvær", "Exceptional weather"],
  };
  return (labels[state] || ["Ukjent", "Unknown"])[lang === "en" ? 1 : 0];
}
export function weatherScene(state: string, night?: boolean) {
  const scenes: Record<string, string> = {
    sunny: "sunny",
    "clear-night": "night",
    cloudy: "cloudy",
    partlycloudy:
      night === true ? "night" : night === false ? "partly-cloudy" : "cloudy",
    rainy: "rain",
    pouring: "rain",
    lightning: "storm",
    "lightning-rainy": "storm",
    fog: "fog",
    snowy: "snow",
    windy: "wind",
    "windy-variant": "wind",
  };
  // Hail, mixed precipitation and unknown states keep precise artwork in full view.
  return scenes[state] || null;
}
