import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, Eye, Info } from "lucide-react";
import { api } from "../api";
import { FlowTree } from "./FlowTree";
import { flowNarrative } from "./flowNarrative";
import { kindAtPath } from "./flowPresentation";
import { readFlowPath, type FlowPath } from "./flowStructure";
import { SettingsDialog } from "../home/SettingsDialog";
import type { Home } from "../types";
import { LoadError } from "./shared";

export function BlueprintPreview({
  config,
  entityId,
  home,
  lang,
  onChange,
}: {
  config: Record<string, any>;
  entityId: string | undefined;
  home: Home;
  lang: string;
  onChange: (value: Record<string, any>) => void;
}) {
  const t = (nb: string, en: string) => (lang === "en" ? en : nb);
  const [show, setShow] = useState(false);
  const [selected, setSelected] = useState<FlowPath | null>(null);
  const q = useQuery({
    queryKey: ["manage", "automation-preview", entityId],
    queryFn: () =>
      api<{ config: Record<string, any>; read_only: true }>(
        `manage/automation-preview/${encodeURIComponent(entityId!)}`,
      ),
    enabled: show && !!entityId,
    staleTime: 60_000,
    retry: false,
  });
  const value = q.data?.config;
  const row = value && selected ? readFlowPath(value, selected) : null;
  const summary =
    selected && value
      ? flowNarrative(row, kindAtPath(selected), home, lang)
      : null;
  function input(key: string, next: unknown) {
    onChange({
      ...config,
      use_blueprint: {
        ...config.use_blueprint,
        input: { ...config.use_blueprint.input, [key]: next },
      },
    });
  }
  return (
    <section className="blueprint-preview">
      <div className="blueprint-heading">
        <BookOpen size={28} />
        <div>
          <h2>
            {t("En rutine fra en oppskrift", "A routine from a blueprint")}
          </h2>
          <p>{String(config.use_blueprint.path || "")}</p>
        </div>
      </div>
      <p>
        {t(
          "Oppskriften bestemmer flyten. Dine valg ligger under. Forhåndsvisningen viser hva oppskriften gjør, og beholder koblingen til den.",
          "The blueprint defines the flow. Your choices are below. The preview shows what it does while keeping the blueprint linked.",
        )}
      </p>
      <div className="blueprint-inputs">
        {Object.entries(config.use_blueprint.input || {}).map(([key, v]) => (
          <label key={key}>
            <span>{key.replaceAll("_", " ")}</span>
            {typeof v === "boolean" ? (
              <select
                value={String(v)}
                onChange={(e) => input(key, e.target.value === "true")}
              >
                <option value="true">{t("Ja", "Yes")}</option>
                <option value="false">{t("Nei", "No")}</option>
              </select>
            ) : typeof v === "string" ? (
              <input value={v} onChange={(e) => input(key, e.target.value)} />
            ) : typeof v === "number" ? (
              <input
                type="number"
                value={v}
                onChange={(e) => {
                  if (
                    e.target.value !== "" &&
                    Number.isFinite(e.target.valueAsNumber)
                  )
                    input(key, e.target.valueAsNumber);
                }}
              />
            ) : (
              <details>
                <summary>
                  {t(
                    "Sammensatt verdi · vis innhold",
                    "Structured value · show contents",
                  )}
                </summary>
                <pre>{JSON.stringify(v, null, 2)}</pre>
              </details>
            )}
          </label>
        ))}
      </div>
      <button
        type="button"
        className="blueprint-show"
        disabled={!entityId}
        aria-expanded={show}
        onClick={() => setShow(!show)}
      >
        <Eye size={18} />
        {show
          ? t("Skjul oppskriftens flyt", "Hide blueprint flow")
          : t("Se hva oppskriften gjør", "See what the blueprint does")}
      </button>
      {show && (
        <div className="flow-designer blueprint-flow">
          <p className="quiet-notice">
            <Info size={16} />
            {t(
              "Dette er en forhåndsvisning av oppskriften slik den er lastet i hjemmesentralen. Lagre endrede valg før du henter oppdatert flyt.",
              "This previews the blueprint currently loaded in the hub. Save changed inputs before fetching the updated flow.",
            )}
          </p>
          {q.isPending && (
            <p role="status">{t("Henter flyten …", "Loading flow …")}</p>
          )}
          {q.isError && (
            <LoadError lang={lang} retry={() => void q.refetch()} />
          )}{" "}
          {value &&
            (["triggers", "conditions", "actions"] as const).map((kind, i) => {
              const list =
                value[kind] ??
                value[["trigger", "condition", "action"][i]] ??
                [];
              const path =
                value[kind] !== undefined
                  ? kind
                  : ["trigger", "condition", "action"][i];
              return (
                <section className={`flow-lane flow-${kind}`} key={kind}>
                  <h3>
                    {
                      [
                        t("Når dette skjer", "When this happens"),
                        t("Og dette stemmer", "And this is true"),
                        t("Så gjør hjemmet dette", "Then your home does this"),
                      ][i]
                    }
                  </h3>
                  {(Array.isArray(list) ? list : [list]).map((item, j) => (
                    <FlowTree
                      key={j}
                      row={item}
                      path={Array.isArray(list) ? [path, j] : [path]}
                      kind={kind}
                      home={home}
                      lang={lang}
                      readOnly
                      onSelect={setSelected}
                      onAppend={() => {}}
                    />
                  ))}
                </section>
              );
            })}
        </div>
      )}
      {selected && summary && (
        <SettingsDialog
          title={summary.title}
          lang={lang}
          onClose={() => setSelected(null)}
        >
          <p>{summary.detail}</p>
          <p className="muted">
            {t(
              "Dette steget styres av oppskriften. Endre valgene i oppskriften for å tilpasse rutinen.",
              "This step is defined by the blueprint. Change its inputs to customize the routine.",
            )}
          </p>
          <details>
            <summary>
              {t("Vis oppsettet for steget", "Show step configuration")}
            </summary>
            <pre>{JSON.stringify(row, null, 2)}</pre>
          </details>
        </SettingsDialog>
      )}
    </section>
  );
}
