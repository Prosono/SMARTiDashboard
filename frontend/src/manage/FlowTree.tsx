import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  GitBranch,
  Clock,
  Repeat,
  Layers,
  Pencil,
} from "lucide-react";
import type { Home } from "../types";
import {
  flowGroups,
  has,
  structureSummary,
  type FlowPath,
} from "./flowStructure";
import { flowSummary, type FlowKey } from "./AutomationFlow";
export function FlowTree({
  row,
  path,
  kind,
  home,
  lang,
  onSelect,
  onAppend,
  depth = 0,
}: {
  row: any;
  path: FlowPath;
  kind: FlowKey;
  home: Home;
  lang: string;
  onSelect: (p: FlowPath) => void;
  onAppend: (p: FlowPath, kind: FlowKey) => void;
  depth?: number;
}) {
  const t = (nb: string, en: string) => (lang === "en" ? en : nb);
  const [open, setOpen] = useState(depth < 3);
  const summary =
    structureSummary(row, lang) || flowSummary(row, kind, home, lang);
  const groups = flowGroups(row, path, lang);
  const Icon = has(row, "repeat")
    ? Repeat
    : has(row, "delay") ||
        has(row, "wait_template") ||
        has(row, "wait_for_trigger")
      ? Clock
      : has(row, "parallel")
        ? Layers
        : GitBranch;
  const extras = [
    "for",
    "from",
    "attribute",
    "timeout",
    "continue_on_error",
  ].filter((k) => has(row, k));
  const display = (v: any) => (typeof v === "string" ? v : JSON.stringify(v));
  return (
    <article
      className={
        "flow-tree-node" + (row?.enabled === false ? " flow-node-disabled" : "")
      }
    >
      <div className="flow-node-heading">
        <Icon size={18} />
        <button
          type="button"
          className="flow-node-title"
          onClick={() => onSelect(path)}
        >
          <strong>{row?.alias || summary.title}</strong>
          <span>
            {row?.alias ? summary.title + " · " : ""}
            {summary.detail}
          </span>
        </button>
        <button
          type="button"
          aria-label={
            t("Rediger steg: ", "Edit step: ") + (row?.alias || summary.title)
          }
          onClick={() => onSelect(path)}
        >
          <Pencil size={16} />
        </button>
        {groups.length > 0 && (
          <button
            type="button"
            aria-label={
              (open ? t("Skjul", "Hide") : t("Vis", "Show")) +
              " " +
              summary.title
            }
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
          </button>
        )}
      </div>
      {row?.enabled === false && (
        <small className="flow-node-note">
          {t("Deaktivert · kjøres ikke", "Disabled · will not run")}
        </small>
      )}
      {extras.length > 0 && (
        <details className="flow-node-notes">
          <summary>
            {t(
              "Flere vilkår og innstillinger",
              "Additional requirements and settings",
            )}
          </summary>
          {extras.map((k) => (
            <p key={k}>
              {k}: {display(row[k])}
            </p>
          ))}
        </details>
      )}
      {open && groups.length > 0 && depth < 12 && (
        <div className="flow-branches">
          {groups.map((g) => (
            <div
              className={"flow-branch flow-branch-" + g.kind}
              key={JSON.stringify(g.path)}
            >
              <h4>{g.label}</h4>
              {Array.isArray(g.value) ? (
                g.value.length ? (
                  g.value.map((child, i) => (
                    <FlowTree
                      key={i}
                      row={child}
                      path={[...g.path, i]}
                      kind={g.kind}
                      home={home}
                      lang={lang}
                      onSelect={onSelect}
                      onAppend={onAppend}
                      depth={depth + 1}
                    />
                  ))
                ) : (
                  <p className="flow-branch-empty">
                    {g.kind === "conditions"
                      ? t("Ingen ekstra krav", "No additional requirements")
                      : t(
                          "Ingen steg i denne grenen",
                          "No steps in this branch",
                        )}
                  </p>
                )
              ) : (
                <FlowTree
                  row={g.value}
                  path={g.path}
                  kind={g.kind}
                  home={home}
                  lang={lang}
                  onSelect={onSelect}
                  onAppend={onAppend}
                  depth={depth + 1}
                />
              )}
              {Array.isArray(g.value) && (
                <button
                  className="flow-branch-add"
                  type="button"
                  onClick={() => onAppend(g.path, g.kind)}
                >
                  {g.kind === "conditions"
                    ? t("+ Legg til krav", "+ Add requirement")
                    : g.kind === "triggers"
                      ? t("+ Legg til hendelse", "+ Add event")
                      : t("+ Legg til steg", "+ Add step")}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {depth >= 12 && groups.length > 0 && (
        <button type="button" onClick={() => onSelect(path)}>
          {t(
            "Åpne detaljer for dypere nivåer",
            "Open details for deeper levels",
          )}
        </button>
      )}
    </article>
  );
}
