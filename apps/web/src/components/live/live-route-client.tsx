"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  LatestManifest,
  ReplayFrame,
  ReplayPack,
  ReplayRaceControlMessage,
  SessionSummary,
} from "@/lib/data";
import { buildClientDataUrl, buildClientWebSocketUrl, getClientApiOrigin } from "@/lib/client-data";
import { Leaderboard, type ReplayLeaderboardRow } from "@/components/replay/Leaderboard";
import { ReplayTelemetryStrip } from "@/components/replay/replay-telemetry-strip";
import { TrackCanvas } from "@/components/replay/TrackCanvas";

interface LiveSessionRef {
  season: number;
  grandPrix: string;
  grandPrixName: string;
  session: string;
  sessionName: string;
  trackId: string;
  sessionKey: number;
  path: string;
  source: string;
}

interface LiveStatusResponse {
  live: {
    season: number;
    grandPrixSlug: string;
    grandPrixName: string;
    sessionSlug: string;
    sessionName: string;
    trackId: string;
    sessionKey: number;
    path: string;
    source: string;
  } | null;
}

interface LiveFeedState {
  loading: boolean;
  connected: boolean;
  finished: boolean;
  sourceLabel: string;
  frame: ReplayFrame | null;
  rcMessages: ReplayRaceControlMessage[];
  error: string | null;
}

function intervalLabel(interval: number | null) {
  if (interval === null) {
    return "-";
  }
  if (interval === 0) {
    return "Leader";
  }
  return `+${interval.toFixed(3)}`;
}

function formatSeconds(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

function formatSlugLabel(value: string) {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function buildSessionBasePath(route: Pick<LiveSessionRef, "season" | "grandPrix" | "session">) {
  return `/data/packs/seasons/${route.season}/${route.grandPrix}/${route.session}`;
}

function buildSummaryUrl(route: Pick<LiveSessionRef, "season" | "grandPrix" | "session">) {
  const staticPath = `${buildSessionBasePath(route)}/summary.json`;
  return buildClientDataUrl(staticPath, `/api/sessions/${route.season}/${route.grandPrix}/${route.session}/summary`);
}

function buildReplayMetaUrl(route: Pick<LiveSessionRef, "season" | "grandPrix" | "session">) {
  const staticPath = `${buildSessionBasePath(route)}/replay.meta.json`;
  return buildClientDataUrl(staticPath, `/api/replay/${route.season}/${route.grandPrix}/${route.session}/meta`);
}

function buildReplayFullUrl(route: Pick<LiveSessionRef, "season" | "grandPrix" | "session">) {
  const staticPath = `${buildSessionBasePath(route)}/replay.json`;
  return buildClientDataUrl(staticPath, `/api/replay/${route.season}/${route.grandPrix}/${route.session}/full`);
}

function buildLiveSocketUrl(route: Pick<LiveSessionRef, "season" | "grandPrix" | "session">, speed: number) {
  return buildClientWebSocketUrl(`/ws/live/${route.season}/${route.grandPrix}/${route.session}?speed=${speed}`);
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed for ${url} (${response.status})`);
  }
  return response.json() as Promise<T>;
}

function latestToLiveRef(latest: LatestManifest["latest"]): LiveSessionRef {
  return {
    season: latest.season,
    grandPrix: latest.grandPrixSlug,
    grandPrixName: latest.grandPrixName,
    session: latest.sessionSlug,
    sessionName: latest.sessionName,
    trackId: latest.trackId,
    sessionKey: latest.sessionKey,
    path: latest.path,
    source: "static-latest",
  };
}

function liveStatusToRef(status: NonNullable<LiveStatusResponse["live"]>): LiveSessionRef {
  return {
    season: status.season,
    grandPrix: status.grandPrixSlug,
    grandPrixName: status.grandPrixName,
    session: status.sessionSlug,
    sessionName: status.sessionName,
    trackId: status.trackId,
    sessionKey: status.sessionKey,
    path: status.path,
    source: status.source,
  };
}

export function LiveRouteClient() {
  const searchParams = useSearchParams();
  const apiOrigin = getClientApiOrigin();
  const [activeSession, setActiveSession] = useState<LiveSessionRef | null>(null);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [replayMeta, setReplayMeta] = useState<ReplayPack | null>(null);
  const [feed, setFeed] = useState<LiveFeedState>({
    loading: true,
    connected: false,
    finished: false,
    sourceLabel: apiOrigin ? "Connecting to OCI live feed" : "Static live simulator",
    frame: null,
    rcMessages: [],
    error: null,
  });
  const [selectedDrivers, setSelectedDrivers] = useState<string[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  const timerRef = useRef<number | null>(null);

  const speed = useMemo(() => {
    const raw = Number(searchParams.get("speed") || "8");
    if (!Number.isFinite(raw)) {
      return 8;
    }
    return Math.max(0.5, Math.min(32, raw));
  }, [searchParams]);

  const closeTimer = useCallback(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function resolveSession() {
      const season = searchParams.get("season");
      const grandPrix = searchParams.get("grandPrix");
      const session = searchParams.get("session");
      const grandPrixName = searchParams.get("grandPrixName");
      const sessionName = searchParams.get("sessionName");
      const trackId = searchParams.get("trackId");
      const sessionKey = Number(searchParams.get("sessionKey") || "0");

      if (season && grandPrix && session) {
        if (!cancelled) {
          setActiveSession({
            season: Number(season),
            grandPrix,
            grandPrixName: grandPrixName || formatSlugLabel(grandPrix),
            session,
            sessionName: sessionName || formatSlugLabel(session),
            trackId: trackId || grandPrix,
            sessionKey,
            path: `/sessions/${season}/${grandPrix}/${session}`,
            source: apiOrigin ? "oci-live" : "static-latest",
          });
        }
        return;
      }

      try {
        if (apiOrigin) {
          const status = await fetchJson<LiveStatusResponse>(`${apiOrigin}/api/live/status`);
          if (!cancelled && status.live) {
            setActiveSession(liveStatusToRef(status.live));
            return;
          }
        }

        const latestManifest = await fetchJson<LatestManifest>("/data/manifests/latest.json");
        if (!cancelled) {
          setActiveSession(latestToLiveRef(latestManifest.latest));
        }
      } catch (error) {
        if (!cancelled) {
          setFeed((previous) => ({
            ...previous,
            loading: false,
            error: error instanceof Error ? error.message : "Live session could not be resolved.",
          }));
        }
      }
    }

    resolveSession();

    return () => {
      cancelled = true;
    };
  }, [apiOrigin, reloadKey, searchParams]);

  useEffect(() => {
    if (!activeSession) {
      return;
    }

    const sessionRef = activeSession;
    let cancelled = false;

    async function loadSessionMetadata() {
      setFeed((previous) => ({ ...previous, loading: true, error: null }));

      try {
        const [nextSummary, nextReplayMeta] = await Promise.all([
          fetchJson<SessionSummary>(buildSummaryUrl(sessionRef)),
          fetchJson<ReplayPack>(buildReplayMetaUrl(sessionRef)),
        ]);

        if (!cancelled) {
          setSummary(nextSummary);
          setReplayMeta(nextReplayMeta);
        }
      } catch (error) {
        if (!cancelled) {
          setFeed((previous) => ({
            ...previous,
            loading: false,
            error: error instanceof Error ? error.message : "Live metadata could not be loaded.",
          }));
        }
      }
    }

    loadSessionMetadata();

    return () => {
      cancelled = true;
    };
  }, [activeSession]);

  useEffect(() => {
    if (!activeSession || !replayMeta) {
      return;
    }

    const sessionRef = activeSession;
    let cancelled = false;
    let socket: WebSocket | null = null;

    closeTimer();
    setFeed({
      loading: true,
      connected: false,
      finished: false,
      sourceLabel: apiOrigin ? "OCI live feed" : "Static live simulator",
      frame: null,
      rcMessages: [],
      error: null,
    });

    async function startStaticSimulation() {
      try {
        const replay = await fetchJson<ReplayPack>(buildReplayFullUrl(sessionRef));
        if (cancelled) {
          return;
        }

        const frames = replay.frames;
        const raceControlMessages = replay.raceControlMessages ?? [];
        let index = 0;
        let rcIndex = 0;
        const visibleMessages: ReplayRaceControlMessage[] = [];

        setFeed((previous) => ({
          ...previous,
          loading: false,
          connected: true,
          sourceLabel: apiOrigin ? "Static fallback simulator" : "Static live simulator",
        }));

        const tick = () => {
          if (cancelled) {
            return;
          }

          const frame = frames[index];
          if (!frame) {
            setFeed((previous) => ({ ...previous, finished: true, connected: false }));
            return;
          }

          while (rcIndex < raceControlMessages.length && raceControlMessages[rcIndex].t <= frame.t) {
            visibleMessages.push(raceControlMessages[rcIndex]);
            rcIndex += 1;
          }

          setFeed((previous) => ({
            ...previous,
            frame,
            rcMessages: visibleMessages.slice(-6),
          }));

          if (index >= frames.length - 1) {
            setFeed((previous) => ({ ...previous, finished: true, connected: false }));
            return;
          }

          const nextFrame = frames[index + 1];
          const delayMs = Math.max(50, Math.min(1250, ((nextFrame.t - frame.t) * 1000) / speed));
          index += 1;
          timerRef.current = window.setTimeout(tick, delayMs);
        };

        tick();
      } catch (error) {
        if (!cancelled) {
          setFeed((previous) => ({
            ...previous,
            loading: false,
            connected: false,
            error: error instanceof Error ? error.message : "Static live simulation failed.",
          }));
        }
      }
    }

    const socketUrl = buildLiveSocketUrl(sessionRef, speed);
    if (!socketUrl) {
      void startStaticSimulation();
      return () => {
        cancelled = true;
        closeTimer();
      };
    }

    socket = new WebSocket(socketUrl);
    socket.addEventListener("open", () => {
      if (!cancelled) {
        setFeed((previous) => ({ ...previous, connected: true }));
      }
    });
    socket.addEventListener("message", (event) => {
      if (cancelled) {
        return;
      }

      try {
        const message = JSON.parse(event.data) as {
          type?: string;
          frame?: ReplayFrame;
          rcMessages?: ReplayRaceControlMessage[];
          source?: string;
          message?: string;
        };

        if (message.type === "status") {
          setFeed((previous) => ({
            ...previous,
            loading: true,
            sourceLabel: message.source ? formatSlugLabel(message.source) : previous.sourceLabel,
          }));
          return;
        }

        if (message.type === "ready") {
          setFeed((previous) => ({
            ...previous,
            loading: false,
            finished: false,
            sourceLabel: message.source ? formatSlugLabel(message.source) : previous.sourceLabel,
          }));
          return;
        }

        if (message.type === "frame" && message.frame) {
          setFeed((previous) => ({
            ...previous,
            loading: false,
            frame: message.frame || null,
            rcMessages: message.rcMessages || [],
          }));
          return;
        }

        if (message.type === "finished") {
          setFeed((previous) => ({ ...previous, finished: true, connected: false }));
          return;
        }

        if (message.type === "error") {
          void startStaticSimulation();
        }
      } catch {
        return;
      }
    });
    socket.addEventListener("error", () => {
      if (!cancelled) {
        void startStaticSimulation();
      }
    });
    socket.addEventListener("close", () => {
      if (!cancelled) {
        setFeed((previous) => ({ ...previous, connected: false }));
      }
    });

    return () => {
      cancelled = true;
      closeTimer();
      socket?.close();
    };
  }, [activeSession, apiOrigin, closeTimer, replayMeta, speed]);

  const currentFrame = feed.frame;
  const currentTime = currentFrame?.t ?? 0;
  const trackStatus = currentFrame?.trackStatus || "GREEN";
  const currentLap = currentFrame?.lap || null;
  const totalTime = replayMeta?.totalTime ?? 0;
  const totalLaps = Math.max(...(replayMeta?.laps.map((lap) => lap.lapNumber) ?? [0]), 0);

  const driverInfoByCode = useMemo(
    () => new Map((replayMeta?.drivers ?? []).map((driver) => [driver.driverCode, driver])),
    [replayMeta?.drivers],
  );

  const lapHistoryByDriver = useMemo(() => {
    const history = new Map<string, NonNullable<ReplayPack["laps"]>>();
    for (const lap of replayMeta?.laps ?? []) {
      const entry = history.get(lap.driverCode) || [];
      entry.push(lap);
      history.set(lap.driverCode, entry);
    }
    for (const laps of history.values()) {
      laps.sort((left, right) => left.lapNumber - right.lapNumber);
    }
    return history;
  }, [replayMeta?.laps]);

  const displayedDrivers = useMemo<ReplayLeaderboardRow[]>(() => {
    if (!currentFrame) {
      return [];
    }

    return Object.values(currentFrame.drivers)
      .filter((driver) => driver.position > 0)
      .sort((left, right) => left.position - right.position)
      .map((driver) => {
        const info = driverInfoByCode.get(driver.driverCode);
        const lastLap = (lapHistoryByDriver.get(driver.driverCode) || [])
          .filter((lap) => lap.lapNumber < (driver.lap || 0) && lap.lapTime !== null)
          .at(-1);

        return {
          abbr: driver.driverCode,
          fullName: info?.fullName || driver.driverCode,
          team: info?.team || driver.team,
          color: info?.teamColor || "#9ca3af",
          position: driver.position,
          intervalLabel: intervalLabel(driver.interval),
          compound: driver.tyreCompound,
          tyreAge: driver.tyreAge,
          lap: driver.lap,
          speed: driver.speed,
          throttle: driver.throttle,
          brake: driver.brake,
          gear: driver.gear,
          rpm: driver.rpm,
          drs: driver.drs,
          lastLapLabel: lastLap?.lapTime ? `${lastLap.lapTime.toFixed(3)}s` : null,
        };
      });
  }, [currentFrame, driverInfoByCode, lapHistoryByDriver]);

  useEffect(() => {
    if (selectedDrivers.length || !displayedDrivers[0]) {
      return;
    }
    setSelectedDrivers([displayedDrivers[0].abbr]);
  }, [displayedDrivers, selectedDrivers.length]);

  const selectedTelemetryDrivers = displayedDrivers.filter((driver) => selectedDrivers.includes(driver.abbr));
  const leadDriver = displayedDrivers[0] || null;
  const trackLabel = activeSession ? formatSlugLabel(activeSession.trackId) : "Track";
  const weatherLabel = currentFrame?.weather
    ? `${currentFrame.weather.airTempC}C air · ${currentFrame.weather.trackTempC}C track`
    : summary
      ? `${summary.weatherSummary.airTempC}C air · ${summary.weatherSummary.trackTempC}C track`
      : "Weather loading";
  const windLabel = currentFrame?.weather
    ? `${currentFrame.weather.windSpeedMps.toFixed(1)} m/s · ${Math.round(currentFrame.weather.windDirectionDeg)}°`
    : summary
      ? `Rain risk ${summary.weatherSummary.rainRiskPct}%`
      : "Waiting for weather";

  function handleDriverSelect(driverCode: string | null, append: boolean) {
    if (!driverCode) {
      setSelectedDrivers([]);
      return;
    }

    setSelectedDrivers((previous) => {
      if (append) {
        return previous.includes(driverCode)
          ? previous.filter((entry) => entry !== driverCode)
          : [...previous, driverCode].slice(-4);
      }

      if (previous.length === 1 && previous[0] === driverCode) {
        return [];
      }

      return [driverCode];
    });
  }

  if (feed.error) {
    return (
      <div className="page-stack">
        <section className="hero hero--compact">
          <p className="eyebrow">Live workspace</p>
          <h1>Live feed unavailable</h1>
          <p className="lead">{feed.error}</p>
          <div className="hero-actions">
            <button className="button" type="button" onClick={() => setReloadKey((value) => value + 1)}>
              Retry live feed
            </button>
            <a className="button button--secondary" href="/replay">Replay library</a>
          </div>
        </section>
      </div>
    );
  }

  if (!activeSession || !summary || !replayMeta || feed.loading) {
    return (
      <div className="page-stack">
        <section className="hero hero--compact">
          <p className="eyebrow">Live workspace</p>
          <h1>{activeSession?.grandPrixName || "Resolving latest session"}</h1>
          <p className="lead">
            Loading the current live surface. When the backend is configured this route uses OCI WebSockets; otherwise it
            simulates the feed from the latest replay pack.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="replay-view replay-view--workspace">
      <section className="replay-session-banner">
        <div className="replay-session-banner__identity">
          <p className="eyebrow">Live workspace</p>
          <h1>{activeSession.grandPrixName}</h1>
          <p>
            {activeSession.sessionName} live surface at {trackLabel}. This route shares the replay map, leaderboard, and
            telemetry shell, but drives them from a socket-first live feed or a local replay-backed simulator.
          </p>
        </div>
        <div className="replay-session-banner__facts">
          <article className="replay-session-banner__fact">
            <span>Feed</span>
            <strong>{feed.sourceLabel}</strong>
          </article>
          <article className="replay-session-banner__fact">
            <span>Status</span>
            <strong>{feed.finished ? "Finished" : feed.connected ? "LIVE" : "Buffering"}</strong>
          </article>
          <article className="replay-session-banner__fact">
            <span>Replay clock</span>
            <strong>{formatSeconds(currentTime)} / {formatSeconds(totalTime)}</strong>
          </article>
          <article className="replay-session-banner__fact">
            <span>Lap</span>
            <strong>{currentLap ? `${currentLap}${totalLaps ? ` / ${totalLaps}` : ""}` : totalLaps ? `- / ${totalLaps}` : "-"}</strong>
          </article>
          <article className="replay-session-banner__fact">
            <span>Weather</span>
            <strong>{weatherLabel}</strong>
          </article>
          <article className="replay-session-banner__fact">
            <span>{currentFrame?.weather ? "Wind" : "Forecast"}</span>
            <strong>{windLabel}</strong>
          </article>
        </div>
        <div className="replay-session-banner__footer">
          <p className="replay-session-banner__note">
            Simulated live from session key {summary.sessionKey} · speed {speed.toFixed(1)}x
          </p>
          <div className="replay-session-banner__actions">
            <a className="replay-session-banner__action replay-session-banner__action--primary" href={`/replay/${activeSession.season}/${activeSession.grandPrix}/${activeSession.session}`}>Replay route</a>
            <a className="replay-session-banner__action" href={`/sessions/${activeSession.season}/${activeSession.grandPrix}/${activeSession.session}`}>Session summary</a>
            <a className="replay-session-banner__action" href="/cars/current-spec">Modelview</a>
            <a className="replay-session-banner__action" href="/learn">Learn</a>
          </div>
        </div>
      </section>

      <div className="replay-workspace-grid">
        <section className="replay-track-panel">
          <div className="replay-track-panel__header">
            <div className="replay-track-panel__title">
              <p className="eyebrow">Track stage</p>
              <h2>{trackLabel}</h2>
              <p>
                Select cars from the map or leaderboard to pin them into the live telemetry deck. Socket-backed feeds pull
                chunks from OCI; static mode simulates the same surface from the replay pack.
              </p>
            </div>
            <div className="replay-track-panel__stats">
              <div>
                <span>Track status</span>
                <strong>{trackStatus}</strong>
              </div>
              <div>
                <span>Selected</span>
                <strong>{selectedDrivers.length || 0}</strong>
              </div>
              <div>
                <span>Messages</span>
                <strong>{feed.rcMessages.length || 0}</strong>
              </div>
            </div>
          </div>

          <div className="replay-track-panel__canvas">
            <TrackCanvas
              trackPath={replayMeta.trackPath}
              drivers={replayMeta.drivers}
              currentFrame={currentFrame}
              nextFrame={null}
              selectedDrivers={selectedDrivers}
              onDriverClick={handleDriverSelect}
            />

            {feed.rcMessages.length ? (
              <div className="replay-race-control">
                <p>Race control</p>
                <ul>
                  {feed.rcMessages.map((message) => (
                    <li key={`${message.t}-${message.message}`}>
                      <strong>{message.flag || message.category}</strong>
                      <span>
                        T+{Math.floor(message.t)}s{message.lapNumber ? ` · Lap ${message.lapNumber}` : ""} · {message.message}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </section>

        <aside className="replay-side-column">
          <section className="replay-side-card">
            <p className="eyebrow">Live read</p>
            <h3>{selectedTelemetryDrivers.length ? `Telemetry on ${selectedTelemetryDrivers.map((driver) => driver.abbr).join(" · ")}` : leadDriver ? `${leadDriver.abbr} leads the live feed` : "Waiting for drivers"}</h3>
            <p>
              This surface mirrors the replay workspace but lets you keep an always-on live board while the backend streams
              session frames. Use replay afterward for fine-grained scrubbing.
            </p>
            <dl className="replay-side-card__stats">
              <div>
                <dt>Leader</dt>
                <dd>{leadDriver ? `${leadDriver.abbr} · ${leadDriver.team}` : "-"}</dd>
              </div>
              <div>
                <dt>Feed source</dt>
                <dd>{feed.sourceLabel}</dd>
              </div>
              <div>
                <dt>Session</dt>
                <dd>{activeSession.sessionName}</dd>
              </div>
              <div>
                <dt>Speed</dt>
                <dd>{speed.toFixed(1)}x</dd>
              </div>
            </dl>
          </section>

          <Leaderboard drivers={displayedDrivers} selectedDrivers={selectedDrivers} onDriverSelect={handleDriverSelect} />
        </aside>
      </div>

      <section className="replay-telemetry-panel">
        <div className="section-header replay-telemetry-panel__header">
          <div>
            <p className="eyebrow">Driver telemetry</p>
            <h2>{selectedTelemetryDrivers.length ? "Selected live telemetry strips" : "Select drivers from the leaderboard"}</h2>
          </div>
        </div>
        {selectedTelemetryDrivers.length ? (
          <div className="replay-telemetry-stack">
            {selectedTelemetryDrivers.map((driver) => (
              <ReplayTelemetryStrip key={driver.abbr} driver={driver} />
            ))}
          </div>
        ) : (
          <p className="replay-empty-copy">
            Choose one driver for a focused live read, or shift-click several drivers to compare telemetry strips side by side.
          </p>
        )}
      </section>
    </div>
  );
}
