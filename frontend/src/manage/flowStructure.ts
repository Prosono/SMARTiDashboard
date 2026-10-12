export type FlowPath = (string | number)[];
export type FlowGroup = {
  label: string;
  path: FlowPath;
  value: unknown;
  kind: "actions" | "conditions" | "triggers";
};
const record = (v: any) =>
  v !== null && typeof v === "object" && !Array.isArray(v);
export const has = (v: any, key: string) => record(v) && Object.hasOwn(v, key);
export function readFlowPath(root: any, path: FlowPath): any {
  return path.reduce((v, k) => v?.[k], root);
}
export function replaceFlowPath(root: any, path: FlowPath, value: any): any {
  if (!path.length) return value;
  const [key, ...rest] = path;
  if (
    ["__proto__", "constructor", "prototype"].includes(String(key)) ||
    root == null ||
    !Object.hasOwn(root, key)
  )
    throw new Error("Invalid flow path");
  const copy = Array.isArray(root) ? [...root] : { ...root };
  copy[key as any] = replaceFlowPath(root[key], rest, value);
  return copy;
}
export function flowGroups(
  row: any,
  path: FlowPath,
  lang: string,
): FlowGroup[] {
  const t = (nb: string, en: string) => (lang === "en" ? en : nb);
  const groups: FlowGroup[] = [];
  const add = (label: string, keys: FlowPath, kind: FlowGroup["kind"]) => {
    const value = readFlowPath(row, keys);
    if (value !== undefined)
      groups.push({ label, path: [...path, ...keys], value, kind });
  };
  if (!record(row)) return groups;
  if (Array.isArray(row.choose)) {
    row.choose.forEach((branch: any, i: number) => {
      add(
        `${t("Valg", "Option")} ${i + 1} · ${branch?.alias || t("hvis", "if")}`,
        ["choose", i, "conditions"],
        "conditions",
      );
      add(
        `${t("Valg", "Option")} ${i + 1} · ${t("gjør", "then")}`,
        ["choose", i, "sequence"],
        "actions",
      );
    });
    add(
      t("Ellers · når ingen valg passer", "Otherwise · when no option matches"),
      ["default"],
      "actions",
    );
  }
  if (has(row, "if")) {
    add(
      t("Hvis · alle krav må stemme", "If · all requirements must match"),
      ["if"],
      "conditions",
    );
    add(t("Ja · gjør dette", "Yes · do this"), ["then"], "actions");
    add(
      t("Nei · gjør dette i stedet", "No · do this instead"),
      ["else"],
      "actions",
    );
  }
  if (record(row.repeat)) {
    add(
      t("Sjekk før hver runde", "Check before each iteration"),
      ["repeat", "while"],
      "conditions",
    );
    add(
      t("Gjenta disse stegene", "Repeat these steps"),
      ["repeat", "sequence"],
      "actions",
    );
    add(
      t(
        "Stopp når · sjekkes etter hver runde",
        "Stop when · checked after each iteration",
      ),
      ["repeat", "until"],
      "conditions",
    );
  }
  if (has(row, "parallel"))
    add(
      t(
        "Samtidige løp · ingen bestemt rekkefølge",
        "Concurrent runs · no defined order",
      ),
      ["parallel"],
      "actions",
    );
  if (has(row, "sequence"))
    add(t("I denne rekkefølgen", "In this order"), ["sequence"], "actions");
  if (has(row, "wait_for_trigger"))
    add(
      t(
        "Fortsett ved én av disse hendelsene",
        "Continue on any of these events",
      ),
      ["wait_for_trigger"],
      "triggers",
    );
  if (["and", "or", "not"].includes(row.condition))
    add(
      row.condition === "and"
        ? t("Alle må stemme", "All must match")
        : row.condition === "or"
          ? t("Minst én må stemme", "At least one must match")
          : t("Ingen må stemme", "None may match"),
      ["conditions"],
      "conditions",
    );
  for (const key of ["and", "or", "not"])
    if (has(row, key))
      add(
        key === "and"
          ? t("Alle må stemme", "All must match")
          : key === "or"
            ? t("Minst én må stemme", "At least one must match")
            : t("Ingen må stemme", "None may match"),
        [key],
        "conditions",
      );
  return groups;
}
export function structureSummary(
  row: any,
  lang: string,
): { title: string; detail: string } | null {
  const t = (nb: string, en: string) => (lang === "en" ? en : nb),
    value = (v: any) => (typeof v === "string" ? v : JSON.stringify(v));
  if (typeof row === "string")
    return { title: t("Malbetingelse", "Template condition"), detail: row };
  if (!record(row)) return null;
  if (has(row, "trigger") || has(row, "platform")) return null;
  if (has(row, "choose"))
    return {
      title: t("Velg en vei", "Choose a path"),
      detail: t(
        "Første valg som passer kjøres. Ellers brukes reserveveien.",
        "The first matching option runs. Otherwise the fallback runs.",
      ),
    };
  if (has(row, "if"))
    return {
      title: t("Hvis / ellers", "If / otherwise"),
      detail: t(
        "Betingelsene avgjør hvilken vei som kjøres.",
        "The conditions determine which path runs.",
      ),
    };
  if (has(row, "repeat"))
    return {
      title: has(row.repeat, "count")
        ? t("Gjenta ", "Repeat ") +
          value(row.repeat.count) +
          t(" ganger", " times")
        : has(row.repeat, "for_each")
          ? t("For hvert element", "For each item")
          : has(row.repeat, "until")
            ? t("Gjenta til", "Repeat until")
            : t("Gjenta så lenge", "Repeat while"),
      detail: has(row.repeat, "for_each")
        ? value(row.repeat.for_each)
        : t(
            "Stegene kjøres samlet for hver runde.",
            "The steps run together on each iteration.",
          ),
    };
  if (has(row, "parallel"))
    return {
      title: t("Kjør samtidig", "Run concurrently"),
      detail: t(
        "Alle løp starter, uten garantert rekkefølge.",
        "All runs start with no guaranteed order.",
      ),
    };
  if (has(row, "sequence"))
    return {
      title: t("Kjør i rekkefølge", "Run in sequence"),
      detail: t(
        "Neste steg venter på det forrige.",
        "Each step waits for the previous one.",
      ),
    };
  if (has(row, "delay"))
    return {
      title: t("Vent", "Wait"),
      detail:
        typeof row.delay === "number"
          ? `${row.delay} ${t("sekunder", "seconds")}`
          : value(row.delay),
    };
  if (has(row, "wait_template") || has(row, "wait_for_trigger"))
    return {
      title: t("Vent til", "Wait until"),
      detail:
        (row.wait_template
          ? value(row.wait_template)
          : t("En hendelse inntreffer", "An event occurs")) +
        (has(row, "timeout")
          ? " · " +
            t("Tidsgrense: ", "Timeout: ") +
            value(row.timeout) +
            " · " +
            (row.continue_on_timeout === false
              ? t("stopp ved tidsgrensen", "stop on timeout")
              : t("fortsett ved tidsgrensen", "continue on timeout"))
          : ""),
    };
  if (has(row, "stop"))
    return {
      title: row.error
        ? t("Stopp med feil", "Stop with error")
        : t("Stopp her", "Stop here"),
      detail: value(row.stop),
    };
  if (has(row, "variables"))
    return {
      title: t("Sett verdier", "Set variables"),
      detail: Object.keys(row.variables || {}).join(", "),
    };
  if (has(row, "event"))
    return {
      title: t("Send hendelse", "Send event"),
      detail: value(row.event),
    };
  if (has(row, "scene"))
    return {
      title: t("Aktiver scene", "Activate scene"),
      detail: value(row.scene),
    };
  if (
    ["and", "or", "not", "template"].includes(row.condition) ||
    ["and", "or", "not"].some((k) => has(row, k))
  )
    return {
      title: t("Sjekk betingelser", "Check conditions"),
      detail:
        row.value_template || t("Se kravene under", "See requirements below"),
    };
  return null;
}
