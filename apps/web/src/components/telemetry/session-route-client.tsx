"use client";

import { formatLapTime } from "@f1-racing/telemetry-utils";
import { startTransition, useEffect, useMemo, useState } from "react";
import type { ComparePack, DriverSummary, LapRecord, SessionManifest, SessionSummary, StrategyPack } from "@/lib/data";
import { buildClientDataUrl } from "@/lib/client-data";
import { CompareSummary } from "./compare-summary";
import { DriverCard } from "./driver-card";
import { LapTable } from "./lap-table";
import { MetricChip } from "./metric-chip";
import { StrategySummary } from "./strategy-summary";

interface SessionRouteClientProps {
  manifest: SessionManifest;
  summary: SessionSummary;
  route: {
    season: string;
    grandPrix: string;
    session: string;
  };
}

type SessionRouteState =
  | { status: "loading" }
  | {
      status: "ready";
      drivers: DriverSummary[];
      laps: LapRecord[];
      strategy: StrategyPack;
    }
  | {
      status: "error";
      message: string;
    };

function buildPackUrl(route: SessionRouteClientProps["route"], fileName: string) {
  const staticPath = `/data/packs/seasons/${route.season}/${route.grandPrix}/${route.session}/${fileName}`;

  if (fileName === "drivers.json") {
    return buildClientDataUrl(staticPath, `/api/sessions/${route.season}/${route.grandPrix}/${route.session}/drivers`);
  }
  if (fileName === "laps.json") {
    return buildClientDataUrl(staticPath, `/api/sessions/${route.season}/${route.grandPrix}/${route.session}/laps`);
  }
  if (fileName === "strategy.json") {
    return buildClientDataUrl(staticPath, `/api/sessions/${route.season}/${route.grandPrix}/${route.session}/strategy`);
  }
  if (fileName === "stints.json") {
    return buildClientDataUrl(staticPath, `/api/sessions/${route.season}/${route.grandPrix}/${route.session}/stints`);
  }
  if (fileName.startsWith("compare/") && fileName.endsWith(".json")) {
    const compareKey = fileName.slice("compare/".length, -".json".length);
    return buildClientDataUrl(staticPath, `/api/sessions/${route.season}/${route.grandPrix}/${route.session}/compare/${compareKey}`);
  }

  return staticPath;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed for ${url} (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export function SessionRouteClient({ manifest, summary, route }: SessionRouteClientProps) {
  const [state, setState] = useState<SessionRouteState>({ status: "loading" });
  const [compare, setCompare] = useState<ComparePack | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const compareEntry = useMemo(() => Object.entries(manifest.compare ?? {})[0] ?? null, [manifest.compare]);
  const compareHref = compareEntry
    ? `/compare/${route.season}/${route.grandPrix}/${route.session}/${compareEntry[0].split("-")[0]}/${compareEntry[0].split("-")[1]}`
    : null;

  useEffect(() => {
    let cancelled = false;

    async function loadSessionRoute() {
      setState({ status: "loading" });
      setCompare(null);

      try {
        const [drivers, laps, strategy] = await Promise.all([
          fetchJson<DriverSummary[]>(buildPackUrl(route, manifest.drivers)),
          fetchJson<LapRecord[]>(buildPackUrl(route, manifest.laps)),
          fetchJson<StrategyPack>(buildPackUrl(route, manifest.strategy)),
        ]);

        if (!cancelled) {
          setState({ status: "ready", drivers, laps, strategy });
        }

        if (compareEntry) {
          fetchJson<ComparePack>(buildPackUrl(route, compareEntry[1]))
            .then((payload) => {
              if (!cancelled) {
                startTransition(() => setCompare(payload));
              }
            })
            .catch(() => {});
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            status: "error",
            message: error instanceof Error ? error.message : "Session data could not be loaded.",
          });
        }
      }
    }

    loadSessionRoute();

    return () => {
      cancelled = true;
    };
  }, [compareEntry, manifest.drivers, manifest.laps, manifest.strategy, reloadKey, route]);

  const fastestLap = useMemo(() => {
    if (state.status !== "ready") {
      return null;
    }
    return state.laps.find((lap) => lap.isFastest) ?? state.laps[0] ?? null;
  }, [state]);

  const fastestByDriver = useMemo(() => {
    if (state.status !== "ready") {
      return new Map<string, LapRecord>();
    }
    return new Map(state.laps.filter((lap) => lap.isFastest).map((lap) => [lap.driverCode, lap]));
  }, [state]);

  if (state.status === "ready") {
    return (
      <div className="page-stack">
        <section className="hero hero--compact">
          <p className="eyebrow">Sample session</p>
          <h1>
            {summary.grandPrix} · {summary.session}
          </h1>
          <p className="lead">
            Session summary stays static, while driver cards, laps, compare, and strategy now hydrate from route packs
            after first paint so the session page behaves more like the reference replay shell.
          </p>
          <div className="metric-grid">
            <MetricChip label="Fastest lap" value={fastestLap ? `${fastestLap.driverCode} · ${formatLapTime(fastestLap.lapTime)}` : "-"} />
            <MetricChip label="Track" value={summary.trackId} />
            <MetricChip label="Air / track" value={`${summary.weatherSummary.airTempC}C / ${summary.weatherSummary.trackTempC}C`} />
            <MetricChip label="Rain risk" value={`${summary.weatherSummary.rainRiskPct}%`} />
          </div>
          <div className="hero-actions">
            <a className="button button--secondary" href={`/replay/${route.season}/${route.grandPrix}/${route.session}`}>
              Open replay
            </a>
            {compareHref ? (
              <a className="button button--secondary" href={compareHref}>
                Open compare route
              </a>
            ) : null}
            {manifest.stints ? (
              <a className="button button--secondary" href={`/stints/${route.season}/${route.grandPrix}/${route.session}`}>
                Open stint story
              </a>
            ) : null}
          </div>
        </section>

        <section className="panel-grid panel-grid--two">
          {state.drivers.map((driver) => (
            <DriverCard key={driver.driverCode} driver={driver} fastestLap={fastestByDriver.get(driver.driverCode)} />
          ))}
        </section>

        <LapTable laps={state.laps} />
        {compare ? <CompareSummary compare={compare} /> : null}
        <StrategySummary strategy={state.strategy} />
      </div>
    );
  }

  return (
    <div className="page-stack">
      <section className="hero hero--compact">
        <p className="eyebrow">Sample session</p>
        <h1>
          {summary.grandPrix} · {summary.session}
        </h1>
        <p className="lead">
          {state.status === "error"
            ? "Session packs failed to load."
            : "Loading session packs after the route shell so this page no longer ships all lap rows inside prerendered HTML."}
        </p>
        <div className="hero-actions">
          {state.status === "error" ? (
            <button className="button" type="button" onClick={() => setReloadKey((value) => value + 1)}>
              Retry session load
            </button>
          ) : null}
          <a className="button button--secondary" href={`/replay/${route.season}/${route.grandPrix}/${route.session}`}>
            Open replay
          </a>
        </div>
      </section>

      <section className="panel">
        <div className="section-header">
          <div>
            <p className="eyebrow">{state.status === "error" ? "Session unavailable" : "Loading session packs"}</p>
            <h2>{state.status === "error" ? "Session data could not be loaded" : "Fetching drivers, laps, and strategy"}</h2>
          </div>
        </div>
        <p>
          {state.status === "error"
            ? state.message
            : `Preparing session key ${summary.sessionKey} for ${route.season} ${summary.grandPrix}.`}
        </p>
      </section>
    </div>
  );
}
