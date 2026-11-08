import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Home } from "../types";
import type { FlowPath } from "./flowStructure";
import {
  createSimulationScenario,
  simulateFlow,
  simulationFrame,
  simulationPath,
  type SimulationResult,
  type SimulationScenario,
  type VirtualStates,
} from "./flowSimulation";

export function useFlowSimulation(
  config: Record<string, any>,
  home: Home,
  lang: string,
  enabled: boolean,
) {
  const [follow, setFollow] = useState(true);
  const [scenario, setScenario] = useState<SimulationScenario | null>(null);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [cursor, setCursor] = useState(0),
    [playing, setPlaying] = useState(false),
    [speed, setSpeed] = useState(1);
  const snapshot = useRef({ config, home });
  useEffect(() => {
    // Capture once per entry. Polling updates must not overwrite virtual inputs.
    snapshot.current = enabled
      ? { config: structuredClone(config), home: structuredClone(home) }
      : { config, home };
    setScenario(
      enabled
        ? createSimulationScenario(
            snapshot.current.config,
            snapshot.current.home,
          )
        : null,
    );
    setResult(null);
    setCursor(0);
    setPlaying(false);
  }, [enabled]);
  useEffect(() => {
    if (!enabled || !playing || !result || cursor >= result.events.length) {
      if (playing) setPlaying(false);
      return;
    }
    const timer = window.setTimeout(() => setCursor((c) => c + 1), 420 / speed);
    return () => window.clearTimeout(timer);
  }, [enabled, playing, result, cursor, speed]);
  useEffect(() => {
    if (!enabled) return;
    const pauseHidden = () => {
      if (document.hidden) setPlaying(false);
    };
    document.addEventListener("visibilitychange", pauseHidden);
    return () => document.removeEventListener("visibilitychange", pauseHidden);
  }, [enabled]);
  const update = (change: (s: SimulationScenario) => SimulationScenario) => {
    setPlaying(false);
    setResult(null);
    setCursor(0);
    setScenario((s) => (s ? change(s) : s));
  };
  const compile = (value = scenario) =>
    value
      ? simulateFlow(
          snapshot.current.config,
          snapshot.current.home,
          value,
          lang,
        )
      : null;
  const start = () => {
    if (result && cursor < result.events.length) {
      setPlaying(true);
      return;
    }
    const next = compile();
    if (!next) return;
    setResult(next);
    setCursor(1);
    setPlaying(true);
  };
  const step = () => {
    setPlaying(false);
    if (result) setCursor((c) => Math.min(c + 1, result.events.length));
    else {
      const next = compile();
      if (next) {
        setResult(next);
        setCursor(1);
      }
    }
  };
  const finish = () => {
    const next = result || compile();
    if (next) {
      setResult(next);
      setCursor(next.events.length);
      setPlaying(false);
    }
  };
  const reset = () => {
    setPlaying(false);
    setResult(null);
    setCursor(0);
  };
  const assume = (path: FlowPath, value: boolean | "continue") => {
    if (!scenario) return;
    const nextScenario = {
      ...scenario,
      decisions: { ...scenario.decisions, [simulationPath(path)]: value },
    };
    const next = compile(nextScenario);
    setScenario(nextScenario);
    setResult(next);
    setPlaying(false);
    setCursor((c) => Math.min(c, next?.events.length || 0));
  };
  const seekNode = useCallback(
    (path: FlowPath) => {
      if (!result) return;
      const key = simulationPath(path.slice(0, 2));
      const index = result.events.findIndex(
        (e) => simulationPath(e.path.slice(0, 2)) === key,
      );
      if (index >= 0) {
        setPlaying(false);
        setCursor(index + 1);
      }
    },
    [result],
  );
  const seek = (index: number) => {
    setPlaying(false);
    setCursor(index);
  };
  const frame = useMemo(
    () => simulationFrame(result?.events || [], enabled ? cursor : 0),
    [result, cursor, enabled],
  );
  const visibleStates = useMemo(() => {
    const values: VirtualStates = { ...scenario?.after };
    for (const e of result?.events.slice(0, cursor) || [])
      Object.assign(values, e.changes);
    return values;
  }, [scenario, result, cursor]);
  return {
    scenario,
    follow,
    setFollow,
    result,
    cursor,
    playing,
    speed,
    frame,
    visibleStates,
    update,
    start,
    step,
    finish,
    reset,
    assume,
    seek,
    seekNode,
    pause: () => setPlaying(false),
    setSpeed,
    refresh: () =>
      update(() =>
        createSimulationScenario(
          snapshot.current.config,
          snapshot.current.home,
        ),
      ),
    config: snapshot.current.config,
    home: snapshot.current.home,
  };
}
export type FlowSimulation = ReturnType<typeof useFlowSimulation>;
