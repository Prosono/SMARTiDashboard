import { useId, useState } from "react";
import { Eye, EyeOff, Plus, Trash2 } from "lucide-react";
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
export function fieldName(key: string, lang: string) {
  const names: Record<string, [string, string]> = {
    username: ["Brukernavn", "Username"],
    password: ["Passord", "Password"],
    port: ["Port", "Port"],
    host: ["Vert / adresse", "Host / address"],
    server: ["Server", "Server"],
    log_level: ["Loggnivå", "Log level"],
    ssl: ["Kryptert tilkobling (SSL)", "Encrypted connection (SSL)"],
    certfile: ["Sertifikatfil", "Certificate file"],
    keyfile: ["Nøkkelfil", "Key file"],
    enabled: ["Aktivert", "Enabled"],
    token: ["Tilgangsnøkkel", "Access token"],
  };
  return (
    names[key]?.[lang === "en" ? 1 : 0] ||
    key.replace(/[_-]/g, " ").replace(/^./, (c) => c.toUpperCase())
  );
}
function initial(schema: unknown): unknown {
  if (Array.isArray(schema)) return [];
  if (object(schema)) return {};
  const kind = String(schema || "str").replace(/\?$/, "");
  if (kind === "bool") return false;
  if (/^(int|float|port)/.test(kind)) return 0;
  const choices = kind.match(/^list\((.*)\)$/)?.[1].split("|");
  return choices?.[0] || "";
}
export function AppConfigFields({
  value,
  schema,
  change,
  lang,
  depth = 0,
}: {
  value: Record<string, unknown>;
  schema: unknown;
  change: (value: Record<string, unknown>) => void;
  lang: string;
  depth?: number;
}) {
  const shape = object(schema) ? schema : {};
  const keys = [...new Set([...Object.keys(value), ...Object.keys(shape)])];
  return (
    <div className="app-option-fields">
      {keys.map((key) => {
        const present = Object.hasOwn(value, key);
        const optional =
          typeof shape[key] === "string" &&
          (shape[key] as string).endsWith("?");
        return (
          <div className="app-option-field" key={key}>
            {!present ? (
              <div className="app-option-unset">
                <span>
                  <strong>{fieldName(key, lang)}</strong>
                  <small>
                    {lang === "en" ? "Not configured" : "Ikke konfigurert"}
                    {optional
                      ? lang === "en"
                        ? " · Optional"
                        : " · Valgfritt"
                      : ""}
                  </small>
                </span>
                <button
                  type="button"
                  onClick={() =>
                    change({ ...value, [key]: initial(shape[key]) })
                  }
                >
                  <Plus size={16} />
                  {lang === "en" ? "Configure" : "Sett opp"}
                </button>
              </div>
            ) : (
              <>
                <OptionField
                  name={key}
                  value={value[key]}
                  schema={shape[key]}
                  change={(v) => change({ ...value, [key]: v })}
                  lang={lang}
                  depth={depth}
                />
                {optional && (
                  <button
                    type="button"
                    className="app-option-remove"
                    onClick={() => {
                      const next = { ...value };
                      delete next[key];
                      change(next);
                    }}
                  >
                    {lang === "en"
                      ? "Remove optional setting"
                      : "Fjern valgfritt felt"}
                  </button>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
function OptionField({
  name,
  value,
  schema,
  change,
  lang,
  depth,
}: {
  name: string;
  value: unknown;
  schema: unknown;
  change: (v: unknown) => void;
  lang: string;
  depth: number;
}) {
  const id = useId();
  const [reveal, show] = useState(false);
  const label = fieldName(name, lang);
  const kind = typeof schema === "string" ? schema.replace(/\?$/, "") : "";
  const [numeric] = useState(
    typeof value === "number" || /^(int|float|port)(\(|$)/.test(kind),
  );
  const secret =
    kind === "password" ||
    /password|secret|token|api_key|private_key/i.test(name);
  if (depth < 6 && object(value))
    return (
      <details className="app-option-group" open={depth === 0}>
        <summary>
          {label}
          <small>
            {Object.keys(value).length} {lang === "en" ? "fields" : "felt"}
          </small>
        </summary>
        <AppConfigFields
          value={value}
          schema={schema}
          change={change}
          lang={lang}
          depth={depth + 1}
        />
      </details>
    );
  if (depth < 6 && Array.isArray(value))
    return (
      <section className="app-option-list">
        <header>
          <strong>{label}</strong>
          <span>{value.length}</span>
        </header>
        {value.map((item, index) => (
          <div className="app-option-list-item" key={index}>
            <OptionField
              name={`${name} ${index + 1}`}
              value={item}
              schema={Array.isArray(schema) ? schema[0] : undefined}
              change={(v) =>
                change(value.map((old, i) => (i === index ? v : old)))
              }
              lang={lang}
              depth={depth + 1}
            />
            <button
              type="button"
              aria-label={`${lang === "en" ? "Remove" : "Fjern"} ${label} ${index + 1}`}
              onClick={() => change(value.filter((_, i) => i !== index))}
            >
              <Trash2 size={17} />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            change([
              ...value,
              initial(Array.isArray(schema) ? schema[0] : undefined),
            ])
          }
        >
          <Plus size={16} />
          {lang === "en" ? "Add item" : "Legg til rad"}
        </button>
      </section>
    );
  if (typeof value === "boolean")
    return (
      <label className="app-option-switch">
        <span>
          <strong>{label}</strong>
          <small>{name}</small>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={value}
          onChange={(e) => change(e.target.checked)}
        />
      </label>
    );
  if (value === null || typeof value === "object")
    return (
      <div>
        <strong>{label}</strong>
        <p className="muted">
          {lang === "en"
            ? "Edit this value in Advanced (JSON)."
            : "Dette feltet kan endres under Avansert (JSON)."}
        </p>
      </div>
    );
  const choices = kind.match(/^list\((.*)\)$/)?.[1].split("|");

  const bounds = kind.match(/^(?:int|float)\(([^,]*),([^)]*)\)$/);
  return (
    <div className="app-option-input">
      <label htmlFor={id}>
        {label}
        <small>{name}</small>
      </label>
      <div className="app-option-input-row">
        {choices ? (
          <select
            id={id}
            value={String(value)}
            onChange={(e) => change(e.target.value)}
          >
            {!choices.includes(String(value)) && (
              <option value={String(value)}>{String(value)}</option>
            )}
            {choices.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        ) : (
          <input
            id={id}
            type={secret && !reveal ? "password" : numeric ? "number" : "text"}
            autoComplete="off"
            spellCheck={false}
            value={String(value ?? "")}
            min={bounds?.[1] || (kind === "port" ? 1 : undefined)}
            max={bounds?.[2] || (kind === "port" ? 65535 : undefined)}
            step={
              numeric
                ? kind.startsWith("int") || kind === "port"
                  ? 1
                  : "any"
                : undefined
            }
            required={numeric}
            onChange={(e) => {
              if (numeric) {
                if (e.target.value === "") change("");
                else if (Number.isFinite(e.target.valueAsNumber))
                  change(e.target.valueAsNumber);
              } else change(e.target.value);
            }}
          />
        )}
        {secret && (
          <button
            type="button"
            aria-label={`${reveal ? (lang === "en" ? "Hide" : "Skjul") : lang === "en" ? "Show" : "Vis"} ${label}`}
            onClick={() => show(!reveal)}
          >
            {reveal ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        )}
      </div>
    </div>
  );
}
