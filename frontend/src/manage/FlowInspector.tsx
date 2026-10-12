import { EntityPicker } from "./EntityPicker";
import { has, structureSummary } from "./flowStructure";
import type { Home } from "../types";
export function FlowInspector({
  row,
  home,
  lang,
  onChange,
  onAdvanced,
}: {
  row: any;
  home: Home;
  lang: string;
  onChange: (v: any) => void;
  onAdvanced: () => void;
}) {
  const t = (nb: string, en: string) => (lang === "en" ? en : nb);
  const patch = (v: any) => onChange({ ...row, ...v });
  if (!row || typeof row !== "object" || Array.isArray(row))
    return (
      <>
        <p>
          {t(
            "Dette uttrykket beholdes ordrett.",
            "This expression is preserved verbatim.",
          )}
        </p>
        <pre>{JSON.stringify(row, null, 2)}</pre>
        <button type="button" onClick={onAdvanced}>
          {t(
            "Rediger uttrykket i konfigurasjonen",
            "Edit expression in configuration",
          )}
        </button>
      </>
    );
  const action = row.action || row.service;
  return (
    <div className="flow-inspector">
      <p>{structureSummary(row, lang)?.detail}</p>
      <label>
        {t("Navn på steget", "Step name")}
        <input
          value={row.alias || ""}
          onChange={(e) => patch({ alias: e.target.value })}
        />
      </label>
      <label className="flow-enabled">
        <input
          type="checkbox"
          checked={row.enabled !== false}
          onChange={(e) => patch({ enabled: e.target.checked })}
        />
        {t("Steget er aktivt", "Step is enabled")}
      </label>
      {has(row, "delay") && ["number", "string"].includes(typeof row.delay) && (
        <label>
          {t(
            "Ventetid (sekunder eller tt:mm:ss)",
            "Delay (seconds or hh:mm:ss)",
          )}
          <input
            value={row.delay}
            onChange={(e) =>
              patch({
                delay:
                  typeof row.delay === "number" &&
                  e.target.value !== "" &&
                  Number.isFinite(Number(e.target.value))
                    ? Number(e.target.value)
                    : e.target.value,
              })
            }
          />
        </label>
      )}
      {typeof row.repeat?.count === "number" && (
        <label>
          {t("Antall gjentakelser", "Repeat count")}
          <input
            type="number"
            min="1"
            step="1"
            value={row.repeat.count}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isInteger(n) && n > 0)
                patch({ repeat: { ...row.repeat, count: n } });
            }}
          />
        </label>
      )}
      {typeof row.stop === "string" && (
        <label>
          {t("Årsak til stopp", "Stop reason")}
          <input
            value={row.stop}
            onChange={(e) => patch({ stop: e.target.value })}
          />
        </label>
      )}
      {typeof action === "string" &&
        typeof row.target?.entity_id === "string" && (
          <EntityPicker
            value={row.target.entity_id}
            onChange={(v) => patch({ target: { ...row.target, entity_id: v } })}
            choices={home.controls.filter(
              (c) => c.domain === action.split(".")[0],
            )}
            home={home}
            lang={lang}
            label={t("Velg mål for steget", "Choose step target")}
          />
        )}
      {typeof row.entity_id === "string" && (
        <EntityPicker
          value={row.entity_id}
          onChange={(v) => patch({ entity_id: v })}
          choices={home.controls}
          home={home}
          lang={lang}
          label={t("Velg sensor for steget", "Choose step sensor")}
        />
      )}
      {["state", "numeric_state"].includes(row.condition) && (
        <>
          {row.condition === "state" ? (
            <label>
              {t("Tilstand", "State")}
              <input
                value={row.state ?? ""}
                onChange={(e) => patch({ state: e.target.value })}
              />
            </label>
          ) : (
            ["above", "below"]
              .filter((k) => has(row, k))
              .map((k) => (
                <label key={k}>
                  {k === "above" ? t("Over", "Above") : t("Under", "Below")}
                  <input
                    value={row[k]}
                    onChange={(e) =>
                      patch({
                        [k]:
                          e.target.value !== "" &&
                          Number.isFinite(Number(e.target.value))
                            ? Number(e.target.value)
                            : e.target.value,
                      })
                    }
                  />
                </label>
              ))
          )}
        </>
      )}
      <details>
        <summary>
          {t("Alle innstillinger for steget", "All step settings")}
        </summary>
        <pre>{JSON.stringify(row, null, 2)}</pre>
        <button type="button" onClick={onAdvanced}>
          {t("Rediger hele konfigurasjonen", "Edit full configuration")}
        </button>
      </details>
    </div>
  );
}
