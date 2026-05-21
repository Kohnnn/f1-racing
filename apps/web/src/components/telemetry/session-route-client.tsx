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
      strategy: StrategyPack | null;
    }
  | {
      status: "replay-only";
      missing: string[];
    }
  | {
      status: "error";
      message: string;
    };

function buildPackUrl(route: SessionRouteClientProps["route"], fileName: string | undefined | null) {
  if (typeof fileName !== "string" || !fileName.length) {
    return null;
  }
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

function formatSlugLabel(value: string) {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function findFastestLap(laps: LapRecord[]) {
  return laps
    .filter((lap) => Number.isFinite(lap.lapTime) && lap.lapTime > 0)
    .slice()
    .sort((left, right) => left.lapTime - right.lapTime)[0] ?? null;
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

      const missing: string[] = [];
      if (!manifest.drivers) missing.push("drivers");
      if (!manifest.laps) missing.push("laps");
      if (!manifest.strategy) missing.push("strategy");

      if (missing.length) {
        if (!cancelled) {
          setState({ status: "replay-only", missing });
        }
        return;
      }

      const driversUrl = buildPackUrl(route, manifest.drivers);
      const lapsUrl = buildPackUrl(route, manifest.laps);
      const strategyUrl = buildPackUrl(route, manifest.strategy);

      if (!driversUrl || !lapsUrl) {
        if (!cancelled) {
          setState({ status: "replay-only", missing: ["drivers", "laps"] });
        }
        return;
      }

      try {
        const [drivers, laps, strategy] = await Promise.all([
          fetchJson<DriverSummary[]>(driversUrl),
          fetchJson<LapRecord[]>(lapsUrl),
          strategyUrl ? fetchJson<StrategyPack>(strategyUrl).catch(() => null) : Promise.resolve(null),
        ]);

        if (!cancelled) {
          setState({ status: "ready", drivers, laps, strategy });
        }

        if (compareEntry) {
          const compareUrl = buildPackUrl(route, compareEntry[1]);
          if (compareUrl) {
            fetchJson<ComparePack>(compareUrl)
              .then((payload) => {
                if (!cancelled) {
                  startTransition(() => setCompare(payload));
                }
              })
              .catch(() => {});
          }
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
    return findFastestLap(state.laps);
  }, [state]);

  const fastestByDriver = useMemo(() => {
    if (state.status !== "ready") {
      return new Map<string, LapRecord>();
    }
    const fastest = new Map<string, LapRecord>();
    for (const lap of state.laps) {
      const current = fastest.get(lap.driverCode);
      if (!current || lap.lapTime < current.lapTime) {
        fastest.set(lap.driverCode, lap);
      }
    }
    return fastest;
  }, [state]);

  const lapsByDriver = useMemo(() => {
    if (state.status !== "ready") {
      return new Map<string, LapRecord[]>();
    }
    const map = new Map<string, LapRecord[]>();
    for (const lap of state.laps) {
      const list = map.get(lap.driverCode) ?? [];
      list.push(lap);
      map.set(lap.driverCode, list);
    }
    return map;
  }, [state]);

  if (state.status === "ready") {
    return (
      <div className="page-stack session-summary-page">
        <section className="hero hero--compact">
          <p className="eyebrow">Session summary</p>
          <h1>
            {summary.grandPrix} · {summary.session}
          </h1>
          <p className="lead">
            Driver cards, representative laps, compare, and strategy hydrate from route packs so the page stays fast
            while preserving the race data needed for analysis.
          </p>
          <div className="metric-grid">
            <MetricChip label="Fastest lap" value={fastestLap ? `${fastestLap.driverCode} · ${formatLapTime(fastestLap.lapTime)}` : "-"} />
            <MetricChip label="Track" value={formatSlugLabel(summary.trackId)} />
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
            ) : (
              <span className="button button--ghost button--disabled" aria-disabled="true" title="No compare pack exported for this session">
                Compare route unavailable
              </span>
            )}
            {manifest.stints ? (
              <a className="button button--secondary" href={`/stints/${route.season}/${route.grandPrix}/${route.session}`}>
                Open stint story
              </a>
            ) : (
              <span className="button button--ghost button--disabled" aria-disabled="true" title="No stint pack exported for this session">
                Stint story unavailable
              </span>
            )}
          </div>
        </section>

        <section className="panel-grid panel-grid--two">
          {state.drivers.map((driver) => (
            <DriverCard
              key={driver.driverCode}
              driver={driver}
              fastestLap={fastestByDriver.get(driver.driverCode)}
              driverLaps={lapsByDriver.get(driver.driverCode)}
            />
          ))}
        </section>

        <LapTable laps={state.laps} />
        {compare ? <CompareSummary compare={compare} /> : null}
        {state.strategy ? <StrategySummary strategy={state.strategy} /> : null}
      </div>
    );
  }

  if (state.status === "replay-only") {
    return (
      <div className="page-stack session-summary-page">
        <section className="hero hero--compact">
          <p className="eyebrow">Session summary</p>
          <h1>
            {summary.grandPrix} · {summary.session}
          </h1>
          <p className="lead">
            Telemetry packs for this session have not been exported yet. The replay workspace is fully available with
            track map, leaderboard, race-control, and projected motion.
          </p>
          <div className="metric-grid">
            <MetricChip label="Track" value={formatSlugLabel(summary.trackId)} />
            <MetricChip label="Air / track" value={`${summary.weatherSummary.airTempC}C / ${summary.weatherSummary.trackTempC}C`} />
            <MetricChip label="Rain risk" value={`${summary.weatherSummary.rainRiskPct}%`} />
            <MetricChip label="Drivers" value={`${summary.drivers.length}`} />
          </div>
          <div className="hero-actions">
            <a className="button" href={`/replay/${route.season}/${route.grandPrix}/${route.session}`}>
              Open replay workspace
            </a>
            <a className="button button--secondary" href="/replay">
              Replay library
            </a>
            <a className="button button--ghost" href="/cars/current-spec">
              Modelview
            </a>
          </div>
        </section>

        <section className="panel">
          <div className="section-header">
            <div>
              <p className="eyebrow">Why is this empty</p>
              <h2>Lap, driver, and strategy packs are not exported for this session</h2>
            </div>
          </div>
          <p>
            Replay continues to work because it loads from the timing replay pack. Lap-by-lap analysis, stints,
            compare, and strategy require an OpenF1 session pack export. Run the OpenF1 session pack pipeline to
            populate this view.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="page-stack session-summary-page">
      <section className="hero hero--compact">
          <p className="eyebrow">Session summary</p>
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
            : `Preparing ${route.season} ${summary.grandPrix} ${summary.session.toLowerCase()} data.`}
        </p>
      </section>
    </div>
  );
}
