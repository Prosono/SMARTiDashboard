import {
  type PointerEvent,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  RefreshCw,
} from "lucide-react";
import { api } from "../api";
import "./powerGuardHistory.css";

type Period = "hour" | "today";
type Series = "power_kw" | "projected_kw" | "limit_kw";
type HistoryPoint = { at: string } & Record<Series, number | null>;
type HistoryAction = {
  id: string;
  name: string;
  at: string;
  command: "turn_off" | "turn_on";
  watts: number | null;
};
type TimedPoint = Omit<HistoryPoint, "at"> & { at: number };
type PlotPoint = { at: number; value: number };
type HistoryData = {
  period: Period;
  start: string;
  end: string;
  step_seconds: number;
  points: HistoryPoint[];
  actions: HistoryAction[];
  counts: { paused: number; restored: number };
  devices?: { id: string; points: { at: string; watts: number | null }[] }[];
};
type Labels = ReturnType<typeof historyLabels>;

export const powerGuardHistoryQueryKey = ["power-guard-history"] as const;

const chartSeries = [
  { field: "power_kw", tone: "power" },
  { field: "projected_kw", tone: "projection" },
  { field: "limit_kw", tone: "limit" },
] as const;
const hourMs = 3_600_000;
const validReading = (value: number | null | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value);

function usePowerGuardHistory(
  period: Period,
  available: boolean,
  active: boolean,
) {
  return useQuery({
    queryKey: [...powerGuardHistoryQueryKey, period],
    queryFn: ({ signal }) =>
      api<HistoryData>(
        `home/energy/power-guard/history?period=${period}`,
        "GET",
        undefined,
        signal,
      ),
    enabled: available,
    retry: false,
    staleTime: 25_000,
    refetchInterval:
      active && available ? (period === "hour" ? 30_000 : 90_000) : false,
  });
}

export function usePowerGuardHistoryHour(offline: boolean, active = true) {
  return usePowerGuardHistory("hour", !offline, active);
}

function historyLabels(lang: string) {
  const english = lang === "en";
  const t = (nb: string, en: string) => (english ? en : nb);
  const locale = english ? "en-GB" : "nb-NO";
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const time = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Oslo",
  });
  return {
    t,
    time: (stamp: number | string) => time.format(new Date(stamp)),
    quantity: (kw: number | null) =>
      validReading(kw) ? `${number.format(kw)} kW` : "—",
    series: {
      power_kw: t("Målt effekt", "Measured power"),
      projected_kw: t("Anslått timesnitt", "Estimated hourly average"),
      limit_kw: t("Grense", "Limit"),
    },
  };
}

/** Samples separated by a missing value or interval never share a line or fill. */
function segments<T>(
  points: T[],
  time: (point: T) => number,
  reading: (point: T) => number | null,
  maxGap: number,
) {
  let group: PlotPoint[] = [];
  const groups: PlotPoint[][] = [];
  for (const point of points) {
    const at = time(point);
    const value = reading(point);
    if (!validReading(value) || at - (group.at(-1)?.at ?? at) > maxGap) {
      if (group.length) groups.push(group);
      group = [];
    }
    if (Number.isFinite(at) && validReading(value)) group.push({ at, value });
  }
  if (group.length) groups.push(group);
  return groups;
}

function lineFor(
  points: PlotPoint[],
  x: (at: number) => number,
  y: (value: number) => number,
  stepped = false,
) {
  const first = points[0];
  return (
    `M${x(first.at)},${y(first.value)}` +
    points
      .slice(1)
      .map(({ at, value }) =>
        stepped ? `H${x(at)}V${y(value)}` : `L${x(at)},${y(value)}`,
      )
      .join("")
  );
}

function axisValues(points: TimedPoint[]) {
  const readings = points.flatMap((point) =>
    chartSeries.map(({ field }) => point[field]).filter(validReading),
  );
  const low = Math.min(0, ...readings);
  const high = Math.max(1, ...readings);
  const targetStep = (high - low) * 0.27;
  const magnitude = 10 ** Math.floor(Math.log10(targetStep));
  const spacing =
    ([1, 2, 2.5, 5, 10].find((n) => n * magnitude >= targetStep) ?? 10) *
    magnitude;
  const minimum = Math.floor(low / spacing) * spacing;
  const maximum = Math.ceil(high / spacing) * spacing;
  return Array.from(
    { length: Math.round((maximum - minimum) / spacing) + 1 },
    (_, i) => minimum + i * spacing,
  );
}

function timeTicks(
  period: Period,
  start: number,
  end: number,
  width: number,
  labels: Labels,
  cached: boolean,
) {
  const { t, time } = labels;
  const final = { at: end, label: cached ? time(end) : t("Nå", "Now") };
  if (period === "hour") {
    return [
      { at: start, label: "−60 min" },
      { at: (start + end) / 2, label: "−30 min" },
      final,
    ];
  }
  const duration = end - start;
  const spacing =
    ([0.5, 1, 2, 3, 4, 6, 8, 12].find(
      (hours) => hours * hourMs >= duration / (width >= 500 ? 4 : 3),
    ) ?? 12) * hourMs;
  const ticks = [{ at: start, label: time(start) }];
  for (let at = start + spacing; at < end - duration * 0.15; at += spacing) {
    ticks.push({ at, label: time(at) });
  }
  return [...ticks, final];
}

function HistoryPlot({
  data,
  points,
  cached,
  labels,
}: {
  data: HistoryData;
  points: TimedPoint[];
  cached: boolean;
  labels: Labels;
}) {
  const { t, time, quantity } = labels;
  const id = useId();
  const frame = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(480);
  const [activeAt, setActiveAt] = useState<number | null>(null);
  useLayoutEffect(() => {
    const node = frame.current;
    if (!node) return;
    const resize = () => setWidth(Math.max(160, Math.round(node.clientWidth)));
    const observer = new ResizeObserver(resize);
    observer.observe(node);
    resize();
    return () => observer.disconnect();
  }, []);
  const start = Date.parse(data.start);
  const end = Date.parse(data.end);
  const height = width < 360 ? 182 : 250;
  const left = width < 360 ? 45 : 51;
  const right = width - 9;
  const top = 13;
  const bottom = height - 28;
  const ticks = axisValues(points);
  const minimum = ticks[0];
  const maximum = ticks[ticks.length - 1];
  const plotX = (at: number) =>
    left + ((at - start) / (end - start)) * (right - left);
  const plotY = (kw: number) =>
    bottom - ((kw - minimum) / (maximum - minimum)) * (bottom - top);
  const traces = chartSeries.map(({ field, tone }) => ({
    field,
    tone,
    groups: segments(
      points,
      ({ at }) => at,
      (point) => point[field],
      data.step_seconds * 2_000,
    ),
  }));
  const latest =
    [...points]
      .reverse()
      .find(
        ({ power_kw, projected_kw }) =>
          validReading(power_kw) || validReading(projected_kw),
      ) ?? points[points.length - 1];
  const current = points.find(({ at }) => at === activeAt) ?? latest;
  const currentIndex = points.indexOf(current);

  function pick(event: PointerEvent<SVGSVGElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const pointer = ((event.clientX - bounds.left) / bounds.width) * width;
    if (pointer < left - 8 || pointer > right + 8) return;
    const at = start + ((pointer - left) / (right - left)) * (end - start);
    const nearest = points.reduce((best, point) =>
      Math.abs(point.at - at) < Math.abs(best.at - at) ? point : best,
    );
    setActiveAt(nearest.at);
  }

  return (
    <figure className="pg-history-figure">
      <p className="pg-history-sr" id={`${id}-instructions`}>
        {t(
          "Bruk venstre og høyre piltast for å se verdiene for ulike tidspunkter.",
          "Use the left and right arrow keys to read values at different times.",
        )}
      </p>
      <div
        ref={frame}
        className="pg-history-frame"
        tabIndex={0}
        role="group"
        aria-label={t("Effektgraf", "Power chart")}
        aria-describedby={`${id}-instructions ${id}-readout`}
        onKeyDown={(event) => {
          const shift = {
            ArrowLeft: -1,
            ArrowRight: 1,
            Home: -Infinity,
            End: Infinity,
          }[event.key];
          if (shift === undefined) return;
          event.preventDefault();
          const index = Math.max(
            0,
            Math.min(points.length - 1, currentIndex + shift),
          );
          setActiveAt(points[index].at);
        }}
      >
        <svg
          className="pg-history-chart"
          viewBox={`0 0 ${width} ${height}`}
          aria-hidden="true"
          onPointerDown={pick}
          onPointerMove={(event) => {
            if (event.pointerType === "mouse") pick(event);
          }}
          onPointerLeave={() => {
            if (document.activeElement !== frame.current) setActiveAt(null);
          }}
        >
          <defs>
            <linearGradient id={`${id}-fill`} x2="0" y2="1">
              <stop stopColor="var(--pg-chart-power)" stopOpacity=".22" />
              <stop
                offset="1"
                stopColor="var(--pg-chart-power)"
                stopOpacity=".028"
              />
            </linearGradient>
          </defs>
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                className="pg-history-gridline"
                x1={left}
                x2={right}
                y1={plotY(tick)}
                y2={plotY(tick)}
              />
              <text x={left - 8} y={plotY(tick) + 4} textAnchor="end">
                {quantity(tick)}
              </text>
            </g>
          ))}
          {timeTicks(data.period, start, end, width, labels, cached).map(
            ({ at, label }) => (
              <g key={at}>
                <line
                  className="pg-history-gridline"
                  x1={plotX(at)}
                  x2={plotX(at)}
                  y1={top}
                  y2={bottom}
                />
                <text
                  x={plotX(at)}
                  y={height - 8}
                  textAnchor={
                    at === start ? "start" : at === end ? "end" : "middle"
                  }
                >
                  {label}
                </text>
              </g>
            ),
          )}
          {traces[0].groups
            .filter((group) => group.length > 1)
            .map((group) => (
              <path
                key={group[0].at}
                fill={`url(#${id}-fill)`}
                d={`${lineFor(group, plotX, plotY)}V${plotY(0)}H${plotX(group[0].at)}Z`}
              />
            ))}
          {[...traces].reverse().map(({ field, tone, groups }) => (
            <g key={field} data-series={tone}>
              {groups.map((group) =>
                group.length > 1 ? (
                  <path
                    key={group[0].at}
                    className="pg-history-line"
                    d={lineFor(group, plotX, plotY, field === "limit_kw")}
                  />
                ) : (
                  <circle
                    key={group[0].at}
                    className="pg-history-dot"
                    cx={plotX(group[0].at)}
                    cy={plotY(group[0].value)}
                    r={2.6}
                  />
                ),
              )}
            </g>
          ))}
          <line
            className="pg-history-marker"
            x1={plotX(current.at)}
            x2={plotX(current.at)}
            y1={top}
            y2={bottom}
          />
          {chartSeries.map(({ field, tone }) =>
            validReading(current[field]) ? (
              <circle
                key={field}
                data-series={tone}
                className="pg-history-marker-dot"
                cx={plotX(current.at)}
                cy={plotY(current[field])}
                r={3.6}
              />
            ) : null,
          )}
        </svg>
      </div>
      <figcaption
        className="pg-history-readout"
        id={`${id}-readout`}
        aria-live="polite"
      >
        <time dateTime={new Date(current.at).toISOString()}>
          {time(current.at)}
        </time>
        <dl>
          {chartSeries.map(({ field, tone }) => (
            <div key={field} data-series={tone}>
              <dt className="pg-history-sr">{labels.series[field]}</dt>
              <dd>{quantity(current[field])}</dd>
            </div>
          ))}
        </dl>
      </figcaption>
    </figure>
  );
}

function HistoryInsights({
  data,
  points,
  labels,
}: {
  data: HistoryData;
  points: TimedPoint[];
  labels: Labels;
}) {
  const { t, time, quantity } = labels;
  const [showAll, setShowAll] = useState(false);
  const actions = data.actions
    .filter(({ at }) => Number.isFinite(Date.parse(at)))
    .slice()
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const { paused, restored } = data.counts;
  const readings = points.map(({ power_kw }) => power_kw).filter(validReading);
  const peak = readings.length ? Math.max(...readings) : null;

  return (
    <details className="pg-history-insights">
      <summary>
        <Activity size={16} aria-hidden="true" />
        <span>{t("Innsikt og hendelser", "Insights and events")}</span>
        <ChevronDown size={17} aria-hidden="true" />
      </summary>
      <div className="pg-history-insights-body">
        <dl className="pg-history-insights-metrics">
          <div>
            <dt>{t("Topp i grafen", "Chart peak")}</dt>
            <dd>{quantity(peak)}</dd>
          </div>
          <div>
            <dt>{t("Pauser", "Pauses")}</dt>
            <dd>{paused}</dd>
          </div>
          <div>
            <dt>{t("Innkoblet", "Restored")}</dt>
            <dd>{restored}</dd>
          </div>
        </dl>
        {actions.length ? (
          <ol className="pg-history-events">
            {(showAll ? actions : actions.slice(0, 8)).map((action) => {
              const paused = action.command === "turn_off";
              const Icon = paused ? ArrowDown : ArrowUp;
              return (
                <li
                  key={`${action.at}-${action.id}-${action.command}`}
                  data-paused={paused}
                >
                  <Icon size={16} aria-hidden="true" />
                  <div>
                    <strong>{action.name}</strong>
                    <span>
                      {paused
                        ? t("Satt på pause", "Paused")
                        : t("Koblet inn", "Reconnected")}
                    </span>
                  </div>
                  <div>
                    <time dateTime={action.at}>{time(action.at)}</time>
                    {validReading(action.watts) && (
                      <strong
                        title={t(
                          "Effekt brukt i beregningen",
                          "Power used in the calculation",
                        )}
                      >
                        {quantity(action.watts / 1000)}
                      </strong>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        ) : (
          <p>
            {t(
              "Ingen bekreftede handlinger i perioden.",
              "No confirmed actions in this period.",
            )}
          </p>
        )}
        {actions.length > 8 && (
          <button
            type="button"
            className="pg-history-more"
            onClick={() => setShowAll(!showAll)}
          >
            {showAll
              ? t("Vis færre", "Show fewer")
              : t(`Vis alle ${actions.length}`, `Show all ${actions.length}`)}
          </button>
        )}
        {paused + restored > actions.length && (
          <p>
            {t(
              `Viser de ${actions.length} nyeste hendelsene.`,
              `Showing the ${actions.length} most recent events.`,
            )}
          </p>
        )}
      </div>
    </details>
  );
}

export function PowerGuardHistory({
  lang,
  offline,
  enabled,
  hour,
}: {
  lang: string;
  offline: boolean;
  enabled: boolean;
  hour: ReturnType<typeof usePowerGuardHistoryHour>;
}) {
  const [period, setPeriod] = useState<Period>("hour");
  const today = usePowerGuardHistory(
    "today",
    !offline && period === "today",
    enabled,
  );
  const query = period === "hour" ? hour : today;
  const data = query.data;
  const labels = useMemo(() => historyLabels(lang), [lang]);
  const { t } = labels;
  const id = useId();
  const cached = !!data && (offline || query.isError);
  const points = useMemo(() => {
    if (!data) return [];
    const start = Date.parse(data.start);
    const end = Date.parse(data.end);
    return data.points
      .map((point) => ({ ...point, at: Date.parse(point.at) }))
      .filter(({ at }) => at >= start && at <= end)
      .sort((a, b) => a.at - b.at);
  }, [data]);
  const hasReadings = points.some(
    ({ power_kw, projected_kw }) =>
      validReading(power_kw) || validReading(projected_kw),
  );
  const hasPlot =
    !!data && hasReadings && Date.parse(data.start) < Date.parse(data.end);
  return (
    <section
      className="pg-history"
      aria-labelledby={`${id}-heading`}
      aria-busy={query.isLoading}
    >
      <header className="pg-history-header">
        <h4 id={`${id}-heading`}>
          {t("Effekt og timesnitt", "Power and hourly average")}
        </h4>
        <div
          className="pg-history-period"
          role="group"
          aria-label={t("Periode", "Period")}
        >
          <button
            type="button"
            aria-pressed={period === "hour"}
            onClick={() => setPeriod("hour")}
          >
            {t("Siste time", "Last hour")}
          </button>
          <button
            type="button"
            aria-pressed={period === "today"}
            onClick={() => setPeriod("today")}
          >
            {t("I dag", "Today")}
          </button>
        </div>
      </header>
      {cached && (
        <p className="pg-history-status" role="status">
          {offline
            ? t(
                "Frakoblet. Viser lagret historikk.",
                "Offline. Showing saved history.",
              )
            : t(
                "Oppdateringen feilet. Viser lagret historikk.",
                "Refresh failed. Showing saved history.",
              )}
        </p>
      )}
      {hasPlot && data ? (
        <>
          <ul className="pg-history-legend">
            {chartSeries.map(({ field, tone }) => (
              <li key={field} data-series={tone}>
                <i aria-hidden="true" />
                {labels.series[field]}
              </li>
            ))}
          </ul>
          <HistoryPlot
            key={period}
            data={data}
            points={points}
            cached={cached}
            labels={labels}
          />
          <p className="pg-history-note">
            {t(
              "Grensen gjelder timesnittet. Tidspunktene vises i Oslo-tid.",
              "The limit applies to the hourly average. Times are shown in Oslo time.",
            )}
          </p>
        </>
      ) : (
        <div className="pg-history-empty" role="status">
          <Activity size={25} aria-hidden="true" />
          <p>
            {query.isLoading
              ? t("Henter historikk …", "Loading history…")
              : offline
                ? t(
                    "Historikken vises når hjemmet er tilkoblet.",
                    "History is available when the home is connected.",
                  )
                : query.isError
                  ? t("Kunne ikke hente historikk.", "Couldn’t load history.")
                  : enabled
                    ? t(
                        "Målinger vises etter hvert som PowerGuard samler data.",
                        "Readings appear as PowerGuard collects data.",
                      )
                    : t(
                        "Aktiver PowerGuard for å samle effekthistorikk.",
                        "Enable PowerGuard to collect power history.",
                      )}
          </p>
          {query.isError && !offline && (
            <button type="button" onClick={() => void query.refetch()}>
              <RefreshCw size={15} aria-hidden="true" />{" "}
              {t("Prøv igjen", "Try again")}
            </button>
          )}
        </div>
      )}
      {data && (hasReadings || data.actions.length > 0) && (
        <HistoryInsights
          key={period}
          data={data}
          points={points}
          labels={labels}
        />
      )}
    </section>
  );
}

export function PowerGuardLoadTrend({
  id,
  history,
}: {
  id: string;
  history?: HistoryData;
}) {
  if (!history) return null;
  const points = history.devices?.find((device) => device.id === id)?.points;
  if (!points?.length) return null;
  const timed = points.map(({ at, watts }) => ({ at: Date.parse(at), watts }));
  const groups = segments(
    timed,
    ({ at }) => at,
    ({ watts }) => watts,
    120_000,
  ).filter((group) => group.length > 1);
  if (!groups.length) return null;
  const measured = groups.flat();
  const max = Math.max(1, ...measured.map(({ value }) => value));
  const start = Date.parse(history.start);
  const end = Date.parse(history.end);
  if (!(end > start)) return null;
  const x = (at: number) => 1 + 98 * ((at - start) / (end - start));
  const y = (value: number) => 23 - 20 * (value / max);
  return (
    <svg className="pg-load-trend" viewBox="0 0 100 25" aria-hidden="true">
      {groups.map((group) => (
        <path key={group[0].at} d={lineFor(group, x, y)} />
      ))}
    </svg>
  );
}
