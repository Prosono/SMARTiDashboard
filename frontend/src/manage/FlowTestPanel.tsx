import { useId, useMemo, useState } from "react";
import {
  FlaskConical,
  Play,
  Pause,
  StepForward,
  RotateCcw,
  FastForward,
  Check,
  X,
  Minus,
  Clock3,
  AlertCircle,
  SlidersHorizontal,
  ListTree,
} from "lucide-react";
import { DeviceArtwork } from "../home/DeviceArtwork";
import { entityState } from "./entityWords";
import { FlowArtwork } from "./FlowArtwork";
import { flowNarrative } from "./flowNarrative";
import { readFlowPath } from "./flowStructure";
import {
  simulationInputs,
  type SimStatus,
  type VirtualState,
} from "./flowSimulation";
import type { FlowSimulation } from "./useFlowSimulation";
import "./flowSimulation.css";
export function simulationStatus(status: SimStatus | undefined, lang: string) {
  const words: Record<SimStatus, [string, string]> = {
    running: ["Kjører", "Running"],
    passed: ["Oppfylt", "Met"],
    failed: ["Ikke oppfylt", "Not met"],
    done: ["Simulert", "Simulated"],
    skipped: ["Hoppet over", "Skipped"],
    blocked: ["Trenger svar", "Needs input"],
    stopped: ["Stoppet", "Stopped"],
    assumed: ["Antatt", "Assumed"],
  };
  return status
    ? words[status][lang === "en" ? 1 : 0]
    : lang === "en"
      ? "Not run"
      : "Ikke kjørt";
}
const text = (v: unknown): string =>
  v === undefined || v === null
    ? ""
    : typeof v === "object"
      ? JSON.stringify(v)
      : String(v);
const elapsed = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `+${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};
export function FlowTestPanel({
  sim,
  lang,
}: {
  sim: FlowSimulation;
  lang: string;
}) {
  const t = (nb: string, en: string) => (lang === "en" ? en : nb);
  const [tab, setTab] = useState<"scenario" | "trace">("scenario");
  const [search, setSearch] = useState("");
  const [logCount, setLogCount] = useState(80);
  const inputId = useId();
  const inputs = useMemo(
    () => simulationInputs(sim.config, sim.home),
    [sim.config, sim.home],
  );
  const s = sim.scenario;
  if (!s)
    return (
      <aside
        className="flow-test-panel"
        aria-label={t("Virtuell test", "Virtual test")}
      />
    );
  const current = sim.result?.events[sim.cursor - 1];
  const complete = !!sim.result && sim.cursor === sim.result.events.length;
  const blocked = complete && sim.result?.status === "blocked" ? current : null;
  const visible = inputs.filter((i) =>
    `${i.id} ${i.control?.name}`.toLowerCase().includes(search.toLowerCase()),
  );
  const trigger = sim.config.triggers?.[s.triggerIndex];
  const manualEvent = ["sun", "event", "homeassistant"].includes(
    trigger?.trigger || trigger?.platform,
  );
  const setValue = (
    id: string,
    side: "before" | "after",
    attribute: string | null,
    value: string,
  ) =>
    sim.update((old) => {
      const state = old[side][id];
      let parsed: unknown = value;
      if (attribute) {
        try {
          parsed = JSON.parse(value);
        } catch {
          /* plain text */
        }
      }
      return {
        ...old,
        [side]: {
          ...old[side],
          [id]: attribute
            ? {
                ...state,
                attributes: { ...state.attributes, [attribute]: parsed },
              }
            : { ...state, state: value, heldFor: 0 },
        },
      };
    });
  const traceTitle = (index: number) => {
    const event = sim.result!.events[index];
    return flowNarrative(
      readFlowPath(sim.config, event.path),
      event.kind,
      sim.home,
      lang,
    ).title;
  };
  const StatusIcon =
    current?.status === "blocked"
      ? AlertCircle
      : current?.status === "failed" || current?.status === "stopped"
        ? X
        : current?.status === "running"
          ? Clock3
          : current?.status === "skipped"
            ? Minus
            : Check;
  return (
    <aside
      className="flow-test-panel"
      aria-label={t("Virtuell test", "Virtual test")}
    >
      <header>
        <span className="test-mode-icon">
          <FlaskConical size={22} />
        </span>
        <div>
          <strong>{t("Virtuell test", "Virtual test")}</strong>
          <p>
            {t(
              "Prøv flyten uten å styre hjemmet.",
              "Try the flow without controlling your home.",
            )}
          </p>
        </div>
      </header>
      <div className="test-playback">
        <button
          type="button"
          className="test-start"
          onClick={() => (sim.playing ? sim.pause() : sim.start())}
          disabled={!sim.config.triggers?.length}
        >
          {sim.playing ? <Pause size={18} /> : <Play size={18} />}
          {sim.playing
            ? t("Pause", "Pause")
            : sim.result && !complete
              ? t("Fortsett", "Resume")
              : sim.result
                ? t("Kjør på nytt", "Run again")
                : t("Kjør test", "Run test")}
        </button>
        <button
          type="button"
          onClick={sim.step}
          disabled={complete}
          aria-label={t("Neste teststeg", "Next test step")}
          title={t("Neste teststeg", "Next test step")}
        >
          <StepForward size={20} />
        </button>
        <button
          type="button"
          onClick={sim.finish}
          disabled={complete}
          aria-label={t("Vis hele testresultatet", "Show full test result")}
          title={t("Vis hele testresultatet", "Show full test result")}
        >
          <FastForward size={20} />
        </button>
        <button
          type="button"
          onClick={sim.reset}
          aria-label={t("Nullstill testkjøring", "Reset test run")}
          title={t("Nullstill testkjøring", "Reset test run")}
        >
          <RotateCcw size={18} />
        </button>
      </div>
      <div className="test-clock">
        <span>
          <Clock3 size={14} />
          {elapsed(current?.at || 0)} <small>{t("virtuelt", "virtual")}</small>
        </span>
        <label>
          {t("Fart", "Speed")}
          <select
            aria-label={t("Avspillingsfart", "Playback speed")}
            value={sim.speed}
            onChange={(e) => sim.setSpeed(Number(e.target.value))}
          >
            <option value={0.5}>0,5×</option>
            <option value={1}>1×</option>
            <option value={2}>2×</option>
            <option value={4}>4×</option>
          </select>
        </label>
      </div>
      <label className="test-follow">
        <input
          type="checkbox"
          checked={sim.follow}
          onChange={(e) => sim.setFollow(e.target.checked)}
        />
        {t("Følg aktivt kort i flyten", "Follow the active card")}
      </label>
      <div
        className="test-current"
        data-status={current?.status}
        role="status"
        aria-live="polite"
      >
        <StatusIcon size={18} />
        <div>
          <strong>
            {complete
              ? sim.result!.detail
              : current
                ? traceTitle(sim.cursor - 1)
                : t("Klar til å teste", "Ready to test")}
          </strong>
          <span>
            {current
              ? current.detail
              : t(
                  "Tilpass scenarioet og start en virtuell hendelse.",
                  "Set up a scenario and start a virtual event.",
                )}
          </span>
        </div>
      </div>
      {blocked?.decision && (
        <div className="test-assumption">
          <p>
            {t(
              "Velg et eksplisitt testresultat for dette steget:",
              "Choose an explicit test result for this step:",
            )}
          </p>
          {blocked.decision === "condition" ? (
            <>
              <button
                type="button"
                onClick={() => sim.assume(blocked.path, true)}
              >
                {t("Anta oppfylt", "Assume met")}
              </button>
              <button
                type="button"
                onClick={() => sim.assume(blocked.path, false)}
              >
                {t("Anta ikke oppfylt", "Assume not met")}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => sim.assume(blocked.path, "continue")}
            >
              {t(
                "Anta utført uten verdiendringer",
                "Assume complete without value changes",
              )}
            </button>
          )}
        </div>
      )}
      {Object.keys(s.decisions).length > 0 && (
        <div className="test-assumption-summary">
          <small>
            {Object.keys(s.decisions).length}{" "}
            {t("manuelle testresultater", "manual test results")}
          </small>
          <button
            type="button"
            onClick={() => sim.update((old) => ({ ...old, decisions: {} }))}
          >
            {t("Fjern antakelser", "Clear assumptions")}
          </button>
        </div>
      )}
      {sim.result?.parallel && (
        <p className="test-note">
          {t(
            "Parallelle grener viser én mulig rekkefølge. Enhetssvar og kjøretid kan variere i hjemmet.",
            "Parallel branches show one possible order. Device responses and runtime can differ in your home.",
          )}
        </p>
      )}
      <div
        className="test-tabs"
        role="group"
        aria-label={t("Testvisning", "Test view")}
      >
        <button
          type="button"
          aria-pressed={tab === "scenario"}
          onClick={() => setTab("scenario")}
        >
          <SlidersHorizontal size={16} />
          {t("Scenario", "Scenario")}
        </button>
        <button
          type="button"
          aria-pressed={tab === "trace"}
          onClick={() => setTab("trace")}
        >
          <ListTree size={16} />
          {t("Kjørelogg", "Run log")}
          {sim.cursor > 0 && <small>{sim.cursor}</small>}
        </button>
      </div>
      <div className="test-panel-body">
        {tab === "scenario" ? (
          <>
            <label className="test-field">
              {t("Hendelse som skal prøves", "Event to test")}
              <select
                aria-label={t("Testhendelse", "Test event")}
                value={s.triggerIndex}
                disabled={sim.playing}
                onChange={(e) =>
                  sim.update((old) => ({
                    ...old,
                    triggerIndex: Number(e.target.value),
                  }))
                }
              >
                {(sim.config.triggers || []).map((row: any, i: number) => (
                  <option key={i} value={i} disabled={row.enabled === false}>
                    {flowNarrative(row, "triggers", sim.home, lang).title}
                    {row.enabled === false ? t(" (av)", " (off)") : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="test-field">
              {t("Dato og tid i scenarioet", "Scenario date and time")}
              <input
                type="datetime-local"
                value={s.now}
                disabled={sim.playing}
                onChange={(e) =>
                  sim.update((old) => ({ ...old, now: e.target.value }))
                }
              />
            </label>
            {manualEvent && (
              <p className="test-note">
                {t(
                  "Denne hendelsen sendes inn manuelt på testtidspunktet. Soltidene under brukes av solvilkår.",
                  "This event is injected manually at the test time. The sun times below are used by sun conditions.",
                )}
              </p>
            )}
            <details className="test-sun">
              <summary>
                {t("Soltider og varighet", "Sun times and duration")}
              </summary>
              <div className="test-field-pair">
                <label>
                  {t("Soloppgang", "Sunrise")}
                  <input
                    type="time"
                    value={s.sunrise}
                    disabled={sim.playing}
                    onChange={(e) =>
                      sim.update((old) => ({ ...old, sunrise: e.target.value }))
                    }
                  />
                </label>
                <label>
                  {t("Solnedgang", "Sunset")}
                  <input
                    type="time"
                    value={s.sunset}
                    disabled={sim.playing}
                    onChange={(e) =>
                      sim.update((old) => ({ ...old, sunset: e.target.value }))
                    }
                  />
                </label>
              </div>
              <p className="test-note">
                {t(
                  "Ventetid spoles frem på den virtuelle klokken. Soltidene er testverdier, ikke en astronomisk beregning.",
                  "Waits advance the virtual clock. Sun times are test values, not an astronomical calculation.",
                )}
              </p>
            </details>
            <div className="test-input-heading">
              <strong>{t("Virtuelle enheter", "Virtual devices")}</strong>
              <button
                type="button"
                onClick={sim.refresh}
                disabled={sim.playing}
                title={t(
                  "Tilbakestill til kopierte verdier",
                  "Reset to copied values",
                )}
                aria-label={t(
                  "Tilbakestill virtuelle verdier",
                  "Reset virtual values",
                )}
              >
                <RotateCcw size={15} />
              </button>
            </div>
            {inputs.length > 5 && (
              <input
                className="test-input-search"
                type="search"
                aria-label={t("Søk i testverdier", "Search test values")}
                placeholder={t("Finn enhet …", "Find device …")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            )}
            {visible.map(({ id, control, attributes }, i) => (
              <section className="test-virtual-device" key={id}>
                <header>
                  {control ? (
                    <DeviceArtwork
                      c={control}
                      size={30}
                      fallback={SlidersHorizontal}
                    />
                  ) : (
                    <SlidersHorizontal size={24} />
                  )}
                  <div>
                    <strong>{control?.name || id}</strong>
                    <small>{id}</small>
                  </div>
                </header>
                <div className="test-field-pair">
                  {(["before", "after"] as const).map((side) => (
                    <label key={side}>
                      {side === "before"
                        ? t("Før", "Before")
                        : t("Testverdi", "Test value")}
                      {[
                        "binary_sensor",
                        "light",
                        "switch",
                        "input_boolean",
                      ].includes(control?.domain || "") ? (
                        <select
                          aria-label={`${control?.name || id} · ${side === "before" ? t("før", "before") : t("testverdi", "test value")}`}
                          value={s[side][id]?.state || "unknown"}
                          disabled={sim.playing}
                          onChange={(e) =>
                            setValue(id, side, null, e.target.value)
                          }
                        >
                          {[
                            ...new Set([
                              "on",
                              "off",
                              "unknown",
                              "unavailable",
                              s[side][id]?.state || "unknown",
                            ]),
                          ].map((state) => (
                            <option key={state} value={state}>
                              {entityState(id, state, sim.home, lang)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          list={`${inputId}-${i}`}
                          aria-label={`${control?.name || id} · ${side === "before" ? t("før", "before") : t("testverdi", "test value")}`}
                          value={s[side][id]?.state || ""}
                          disabled={sim.playing}
                          onChange={(e) =>
                            setValue(id, side, null, e.target.value)
                          }
                        />
                      )}
                    </label>
                  ))}
                </div>
                <datalist id={`${inputId}-${i}`}>
                  <option value="on" />
                  <option value="off" />
                  <option value="home" />
                  <option value="not_home" />
                  <option value="unknown" />
                  <option value="unavailable" />
                  {Array.isArray(control?.attributes.options) &&
                    control.attributes.options.map((v) => (
                      <option key={String(v)} value={String(v)} />
                    ))}
                </datalist>
                {attributes.map((attribute) => (
                  <div className="test-attribute" key={attribute}>
                    <small>{attribute.replaceAll("_", " ")}</small>
                    <div className="test-field-pair">
                      {(["before", "after"] as const).map((side) => (
                        <label key={side} className="test-attribute-field">
                          <span className="sr-only">
                            {side === "before"
                              ? t("Før", "Before")
                              : t("Testverdi", "Test value")}
                          </span>
                          <input
                            aria-label={`${control?.name || id} · ${attribute} · ${side}`}
                            value={text(s[side][id]?.attributes[attribute])}
                            disabled={sim.playing}
                            onChange={(e) =>
                              setValue(id, side, attribute, e.target.value)
                            }
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
                <details className="test-held">
                  <summary>
                    {t("Tid i testtilstanden", "Time in test state")}
                  </summary>
                  <label>
                    {t("Sekunder før hendelsen", "Seconds before event")}
                    <input
                      type="number"
                      min={0}
                      value={s.after[id]?.heldFor || 0}
                      disabled={sim.playing}
                      onChange={(e) =>
                        sim.update((old) => ({
                          ...old,
                          after: {
                            ...old.after,
                            [id]: {
                              ...old.after[id],
                              heldFor: Math.max(0, Number(e.target.value) || 0),
                            },
                          },
                        }))
                      }
                    />
                  </label>
                </details>
              </section>
            ))}
            {!inputs.length && (
              <p className="test-note">
                {t(
                  "Ingen direkte enhetsverdier i denne flyten. Du kan teste tidspunkt og hendelser likevel.",
                  "This flow has no direct device values. You can still test times and events.",
                )}
              </p>
            )}
            <p className="test-note">
              {t(
                "Verdiene er kopier fra da testmodusen ble åpnet. Endringer starter en ny test og lagres ikke i hjemmet.",
                "Values are copies from when test mode opened. Changes start a new test and are not saved to your home.",
              )}
            </p>
          </>
        ) : (
          <>
            {!sim.cursor && (
              <div className="test-log-empty">
                <ListTree size={28} />
                <p>
                  {t(
                    "Kjør eller gå ett steg for å se forløpet her.",
                    "Run or step forward to see the trace here.",
                  )}
                </p>
              </div>
            )}
            {sim.cursor > logCount && (
              <button type="button" onClick={() => setLogCount((n) => n + 80)}>
                {t("Vis eldre steg", "Show earlier steps")}
              </button>
            )}
            <ol className="test-log">
              {sim.result?.events
                .slice(Math.max(0, sim.cursor - logCount), sim.cursor)
                .map((event, offset) => {
                  const index = Math.max(0, sim.cursor - logCount) + offset;
                  return event.status === "running" &&
                    index < sim.cursor - 1 ? null : (
                    <li key={index} data-status={event.status}>
                      <button
                        type="button"
                        aria-current={
                          index === sim.cursor - 1 ? "step" : undefined
                        }
                        onClick={() => sim.seek(index + 1)}
                      >
                        <FlowArtwork
                          row={readFlowPath(sim.config, event.path)}
                          kind={event.kind}
                          home={sim.home}
                          size={26}
                        />
                        <span>
                          <strong>{traceTitle(index)}</strong>
                          <small>{event.detail}</small>
                        </span>
                        <time>{elapsed(event.at)}</time>
                      </button>
                    </li>
                  );
                })}
            </ol>
            <h4>
              {t(
                "Verdier i denne delen av testen",
                "Values at this point in the test",
              )}
            </h4>
            <div className="test-state-results">
              {inputs.map(({ id, control }) => (
                <div key={id}>
                  <strong>{control?.name || id}</strong>
                  <span>
                    {entityState(
                      id,
                      sim.visibleStates[id]?.state,
                      sim.home,
                      lang,
                    )}
                  </span>
                  {resultAttributes(s.after[id], sim.visibleStates[id]).map(
                    ([key, value]) => (
                      <small key={key}>
                        {key.replaceAll("_", " ")}: {text(value)}
                      </small>
                    ),
                  )}
                </div>
              ))}
            </div>
            {sim.result && (
              <p className="test-note">
                {t(
                  "Klikk et loggsteg eller et kort i flyten for å gå til det punktet. Loggen viser bare den delen som er spilt av.",
                  "Select a log step or canvas card to jump to that point. The log shows only the played portion.",
                )}
              </p>
            )}
          </>
        )}
      </div>
      <footer>
        <FlaskConical size={14} />
        {t(
          "Kun simulering · ingen kommandoer sendes",
          "Simulation only · no commands sent",
        )}
      </footer>
    </aside>
  );
}
function resultAttributes(
  before: VirtualState | undefined,
  after: VirtualState | undefined,
) {
  return Object.entries(after?.attributes || {}).filter(
    ([key, value]) =>
      JSON.stringify(value) !== JSON.stringify(before?.attributes[key]),
  );
}
