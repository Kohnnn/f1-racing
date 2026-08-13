"use client";

import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import type { ComparePack, DriverSummary, LapRecord, ReplayFrameChunk, ReplayLap, ReplayPack, ReplayRaceControlMessage, SessionManifest, SessionSummary, StintPack, StrategyPack } from "@/lib/data";
import { buildClientDataUrl, buildClientWebSocketUrl } from "@/lib/client-data";
import { loadReplayChunkQueue, validateReplayFrameChunk } from "./replay-chunks";
import { ReplayView } from "./ReplayView";

interface ReplayRouteClientProps {
  initialReplay: ReplayPack;
  manifest: SessionManifest;
  summary: SessionSummary;
  route: {
    season: string;
    grandPrix: string;
    session: string;
  };
}

interface ChunkFailure {
  chunkIndex: number;
  fromTime: number;
  toTime: number;
  message: string;
}

type ReplayRouteState =
  | {
      status: "loading";
    }
  | {
      status: "ready";
      replay: ReplayPack;
      chunkFailures: ChunkFailure[];
    }
  | {
      status: "error";
      message: string;
    };

interface ReplayInsightsState {
  status: "loading" | "ready" | "unavailable";
  compare: ComparePack | null;
  stintPack: StintPack | null;
  driverSummaries: DriverSummary[] | null;
  lapRecords: LapRecord[] | null;
  strategy: StrategyPack | null;
}

type OptionalPack<T> = {
  status: "ready" | "unavailable";
  value: T | null;
};

const BUFFER_LOOKAHEAD_CHUNKS = 2;
const BUFFER_HISTORY_CHUNKS = 1;
const SOCKET_CHUNK_TIMEOUT_MS = 5000;

function normalizeRaceControlMessages(messages: ReplayRaceControlMessage[], totalTime: number) {
  const msThreshold = totalTime > 0 ? totalTime * 1.5 : 7200;
  return messages
    .map((message) => ({
      ...message,
      t: message.t > msThreshold ? message.t / 1000 : message.t,
    }))
    .sort((left, right) => left.t - right.t);
}

function normalizeReplayRaceControl(replay: ReplayPack): ReplayPack {
  if (!replay.raceControlMessages?.length) {
    return replay;
  }
  const totalTime = replay.totalTime ?? replay.frames.at(-1)?.t ?? 0;
  return {
    ...replay,
    raceControlMessages: normalizeRaceControlMessages(replay.raceControlMessages, totalTime),
  };
}

function buildPackUrl(route: ReplayRouteClientProps["route"], fileName: string) {
  const staticPath = `/data/packs/seasons/${route.season}/${route.grandPrix}/${route.session}/${fileName}`;
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

async function fetchOptionalPack<T>(url: string | null): Promise<OptionalPack<T>> {
  if (!url) {
    return { status: "unavailable", value: null };
  }
  try {
    return { status: "ready", value: await fetchJson<T>(url) };
  } catch {
    return { status: "unavailable", value: null };
  }
}

function buildReplayChunkUrl(
  route: ReplayRouteClientProps["route"],
  chunkEntry: NonNullable<ReplayPack["frameChunkIndex"]>[number],
) {
  return buildClientDataUrl(
    buildPackUrl(route, chunkEntry.path),
    `/api/replay/${route.season}/${route.grandPrix}/${route.session}/chunk/${chunkEntry.index}`,
  );
}

function buildReplaySocketUrl(route: ReplayRouteClientProps["route"]) {
  return buildClientWebSocketUrl(`/ws/replay/${route.season}/${route.grandPrix}/${route.session}`);
}

function buildReplayLapsUrl(route: ReplayRouteClientProps["route"]) {
  return `/data/packs/seasons/${route.season}/${route.grandPrix}/${route.session}/replay.laps.json`;
}

function buildReplayRaceControlUrl(route: ReplayRouteClientProps["route"]) {
  return `/data/packs/seasons/${route.season}/${route.grandPrix}/${route.session}/replay.race-control.json`;
}

function mergeReplayFrames(existingFrames: ReplayPack["frames"], nextFrames: ReplayPack["frames"]) {
  const frameMap = new Map<number, ReplayPack["frames"][number]>();
  for (const frame of existingFrames) {
    frameMap.set(frame.t, frame);
  }
  for (const frame of nextFrames) {
    frameMap.set(frame.t, frame);
  }
  return Array.from(frameMap.values()).sort((left, right) => left.t - right.t);
}

function pruneReplayFrames(
  frames: ReplayPack["frames"],
  chunkEntries: NonNullable<ReplayPack["frameChunkIndex"]>,
  loadedChunkIndexes: Set<number>,
) {
  if (!chunkEntries.length || !loadedChunkIndexes.size) {
    return frames;
  }

  const keptEntries = chunkEntries
    .filter((entry) => loadedChunkIndexes.has(entry.index))
    .sort((left, right) => left.fromTime - right.fromTime || left.index - right.index);
  if (!keptEntries.length) {
    return frames;
  }

  const minTime = keptEntries[0].fromTime;
  const maxTime = keptEntries.at(-1)?.toTime ?? keptEntries[0].toTime;
  return frames.filter((frame) => frame.t >= minTime && frame.t <= maxTime);
}

function hasCompleteReplayFrames(replay: ReplayPack) {
  return replay.frames.length > 0
    && (!replay.frameCount || replay.frames.length === replay.frameCount)
    && replay.frames.at(-1)!.t >= (replay.totalTime ?? 0);
}

function getChunkWindow(
  chunkEntries: NonNullable<ReplayPack["frameChunkIndex"]>,
  anchorChunkIndex: number,
) {
  const anchorPosition = chunkEntries.findIndex((entry) => entry.index === anchorChunkIndex);
  if (anchorPosition === -1) {
    return new Set<number>();
  }
  return new Set(
    chunkEntries
      .slice(
        Math.max(0, anchorPosition - BUFFER_HISTORY_CHUNKS),
        anchorPosition + BUFFER_LOOKAHEAD_CHUNKS + 1,
      )
      .map((entry) => entry.index),
  );
}

export function ReplayRouteClient({ initialReplay, manifest, summary, route }: ReplayRouteClientProps) {
  const [state, setState] = useState<ReplayRouteState>({
    status: "ready",
    replay: normalizeReplayRaceControl(initialReplay),
    chunkFailures: [],
  });
  const [insights, setInsights] = useState<ReplayInsightsState>({ status: "loading", compare: null, stintPack: null, driverSummaries: null, lapRecords: null, strategy: null });
  const [fullLoadProgress, setFullLoadProgress] = useState(0);
  const [fullRaceLoaded, setFullRaceLoaded] = useState(() => hasCompleteReplayFrames(initialReplay));
  const [reloadKey, setReloadKey] = useState(0);
  const [retryingChunkIndex, setRetryingChunkIndex] = useState<number | null>(null);
  const retryingChunkIndexRef = useRef<number | null>(null);
  const pendingRetryFocusRef = useRef<{ chunkIndex: number; recovered: boolean } | null>(null);
  const retryChunkButtonRefs = useRef<Map<number, HTMLButtonElement>>(new Map());
  const chunkEntriesRef = useRef<NonNullable<ReplayPack["frameChunkIndex"]>>([]);
  const loadedChunksRef = useRef<Set<number>>(new Set());
  const requestedChunksRef = useRef<Set<number>>(new Set());
  const keepAllChunksLoadedRef = useRef(false);
  const socketRef = useRef<WebSocket | null>(null);
  const socketChunkResolversRef = useRef<Map<number, {
    resolve: (chunk: ReplayFrameChunk) => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
  }>>(new Map());

  useEffect(() => {
    const pendingFocus = pendingRetryFocusRef.current;
    if (!pendingFocus || retryingChunkIndex !== null || state.status !== "ready") {
      return;
    }
    pendingRetryFocusRef.current = null;
    const retryButton = retryChunkButtonRefs.current.get(pendingFocus.chunkIndex);
    if (retryButton) {
      retryButton.focus();
      return;
    }
    const nextRetryButton = retryChunkButtonRefs.current.values().next().value;
    if (nextRetryButton) {
      nextRetryButton.focus();
      return;
    }
    if (pendingFocus.recovered) {
      document.getElementById("replay-session-title")?.focus();
    }
  }, [retryingChunkIndex, state]);

  const rejectSocketChunkRequests = useCallback((message: string) => {
    for (const pending of socketChunkResolversRef.current.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error(message));
    }
    socketChunkResolversRef.current.clear();
  }, []);

  const clearSocketChunkRequest = useCallback((chunkIndex: number) => {
    const pending = socketChunkResolversRef.current.get(chunkIndex);
    if (pending) {
      clearTimeout(pending.timeout);
      socketChunkResolversRef.current.delete(chunkIndex);
    }
  }, []);

  const closeReplaySocket = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
    rejectSocketChunkRequests("Replay socket closed");
  }, [rejectSocketChunkRequests]);

  const requestChunkOverSocket = useCallback((chunkIndex: number) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      throw new Error("Replay socket is not ready");
    }

    return new Promise<ReplayFrameChunk>((resolve, reject) => {
      const timeout = setTimeout(() => {
        socketChunkResolversRef.current.delete(chunkIndex);
        reject(new Error(`Replay socket request timed out for chunk ${chunkIndex}`));
      }, SOCKET_CHUNK_TIMEOUT_MS);
      socketChunkResolversRef.current.set(chunkIndex, { resolve, reject, timeout });
      try {
        socket.send(JSON.stringify({ type: "chunk", index: chunkIndex }));
      } catch (error) {
        clearTimeout(timeout);
        socketChunkResolversRef.current.delete(chunkIndex);
        reject(error instanceof Error ? error : new Error("Replay socket request failed"));
      }
    });
  }, []);

  useEffect(() => {
    const socketUrl = buildReplaySocketUrl(route);
    if (!socketUrl) {
      closeReplaySocket();
      return;
    }

    const socket = new WebSocket(socketUrl);
    socketRef.current = socket;

    function handleMessage(event: MessageEvent<string>) {
      let message: { type?: string; index?: number; payload?: ReplayFrameChunk; message?: string };
      try {
        message = JSON.parse(event.data) as { type?: string; index?: number; payload?: ReplayFrameChunk; message?: string };
      } catch {
        return;
      }

      if (message.type === "chunk" && typeof message.index === "number" && message.payload) {
        const pending = socketChunkResolversRef.current.get(message.index);
        if (pending) {
          clearTimeout(pending.timeout);
          socketChunkResolversRef.current.delete(message.index);
          pending.resolve(message.payload);
        }
        return;
      }

      if (message.type === "error") {
        rejectSocketChunkRequests(message.message || "Replay socket error");
      }
    }

    function handleClose() {
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
      rejectSocketChunkRequests("Replay socket closed");
    }

    function handleError() {
      rejectSocketChunkRequests("Replay socket error");
    }

    socket.addEventListener("message", handleMessage);
    socket.addEventListener("close", handleClose);
    socket.addEventListener("error", handleError);

    return () => {
      socket.removeEventListener("message", handleMessage);
      socket.removeEventListener("close", handleClose);
      socket.removeEventListener("error", handleError);
      if (socketRef.current === socket) {
        socket.close();
        socketRef.current = null;
      }
      rejectSocketChunkRequests("Replay socket disconnected");
    };
  }, [closeReplaySocket, rejectSocketChunkRequests, reloadKey, route]);

  const ensureChunkLoaded = useCallback(async (chunkIndex: number) => {
    const chunkEntry = chunkEntriesRef.current.find((entry) => entry.index === chunkIndex);
    if (!chunkEntry || loadedChunksRef.current.has(chunkIndex) || requestedChunksRef.current.has(chunkIndex)) {
      return;
    }

    requestedChunksRef.current.add(chunkIndex);
    try {
      let chunk: ReplayFrameChunk;
      try {
        chunk = validateReplayFrameChunk(
          await requestChunkOverSocket(chunkIndex),
          chunkEntry,
        );
      } catch {
        chunk = validateReplayFrameChunk(
          await fetchJson<ReplayFrameChunk>(buildReplayChunkUrl(route, chunkEntry)),
          chunkEntry,
        );
      }
      loadedChunksRef.current.add(chunkIndex);
      if (keepAllChunksLoadedRef.current) {
        const totalChunks = chunkEntriesRef.current.length;
        const loadedChunks = loadedChunksRef.current.size;
        const complete = loadedChunks >= totalChunks;
        setFullLoadProgress(complete ? 0 : Math.max(0.01, loadedChunks / totalChunks));
        if (complete) {
          setFullRaceLoaded(true);
        }
      }
      setState((previous) => {
        if (previous.status !== "ready") {
          return previous;
        }
        return {
          status: "ready",
          replay: {
            ...previous.replay,
            frames: mergeReplayFrames(previous.replay.frames, chunk.frames),
          },
          chunkFailures: previous.chunkFailures.filter((failure) => failure.chunkIndex !== chunkIndex),
        };
      });
    } catch (error) {
      setState((previous) => {
        if (previous.status !== "ready") {
          return previous;
        }
        const failure = {
          chunkIndex,
          fromTime: chunkEntry.fromTime,
          toTime: chunkEntry.toTime,
          message: error instanceof Error ? error.message : "Replay chunk request failed",
        };
        return {
          ...previous,
          chunkFailures: [
            ...previous.chunkFailures.filter((entry) => entry.chunkIndex !== chunkIndex),
            failure,
          ].sort((left, right) => left.chunkIndex - right.chunkIndex),
        };
      });
    } finally {
      clearSocketChunkRequest(chunkIndex);
      requestedChunksRef.current.delete(chunkIndex);
    }
  }, [clearSocketChunkRequest, requestChunkOverSocket, route]);

  const trimChunkCache = useCallback((anchorChunkIndex: number) => {
    if (keepAllChunksLoadedRef.current) {
      return;
    }

    const window = getChunkWindow(chunkEntriesRef.current, anchorChunkIndex);
    const nextLoadedChunks = new Set(
      Array.from(loadedChunksRef.current).filter((index) => window.has(index)),
    );

    if (nextLoadedChunks.size === loadedChunksRef.current.size) {
      return;
    }

    loadedChunksRef.current = nextLoadedChunks;
    setState((previous) => {
      if (previous.status !== "ready") {
        return previous;
      }

      return {
        status: "ready",
        replay: {
          ...previous.replay,
          frames: pruneReplayFrames(previous.replay.frames, chunkEntriesRef.current, nextLoadedChunks),
        },
        chunkFailures: previous.chunkFailures,
      };
    });
  }, []);

  const ensureTimeLoaded = useCallback((time: number) => {
    const chunkEntries = chunkEntriesRef.current;
    if (!chunkEntries.length) {
      return;
    }

    const activeEntry = chunkEntries.find((entry) => time <= entry.toTime) ?? chunkEntries.at(-1);
    if (!activeEntry) {
      return;
    }

    const window = getChunkWindow(chunkEntries, activeEntry.index);
    for (const chunkIndex of window) {
      void ensureChunkLoaded(chunkIndex);
    }
    trimChunkCache(activeEntry.index);
  }, [ensureChunkLoaded, trimChunkCache]);

  const loadFullRace = useCallback(() => {
    const totalChunks = chunkEntriesRef.current.length;
    if (!totalChunks) {
      return;
    }
    keepAllChunksLoadedRef.current = true;
    if (loadedChunksRef.current.size >= totalChunks) {
      setFullLoadProgress(0);
      setFullRaceLoaded(true);
      return;
    }
    setFullLoadProgress(Math.max(0.01, loadedChunksRef.current.size / totalChunks));
    const missingChunkIndexes = chunkEntriesRef.current
      .filter((entry) => !loadedChunksRef.current.has(entry.index))
      .map((entry) => entry.index);
    void loadReplayChunkQueue(
      missingChunkIndexes,
      ensureChunkLoaded,
      undefined,
      () => requestedChunksRef.current.size,
    );
  }, [ensureChunkLoaded]);

  useEffect(() => {
    chunkEntriesRef.current = initialReplay.frameChunkIndex ?? [];
    loadedChunksRef.current = new Set();
    requestedChunksRef.current = new Set();
    keepAllChunksLoadedRef.current = false;
    setFullLoadProgress(0);
    setFullRaceLoaded(hasCompleteReplayFrames(initialReplay));

    setState({
      status: "ready",
      replay: normalizeReplayRaceControl(initialReplay),
      chunkFailures: [],
    });
    setInsights({ status: "loading", compare: null, stintPack: null, driverSummaries: null, lapRecords: null, strategy: null });

    const firstTime = initialReplay.frames[0]?.t ?? chunkEntriesRef.current[0]?.fromTime;
    if (firstTime !== undefined) {
      ensureTimeLoaded(firstTime);
    }
  }, [ensureTimeLoaded, initialReplay]);

  useEffect(() => {
    let cancelled = false;
    const compareFile = Object.values(manifest.compare ?? {})[0] ?? null;

    async function loadReplayRoute() {
      try {
        Promise.all([
          fetchOptionalPack<ComparePack>(compareFile ? buildPackUrl(route, compareFile) : null),
          fetchOptionalPack<StintPack>(manifest.stints ? buildPackUrl(route, manifest.stints) : null),
          fetchOptionalPack<DriverSummary[]>(manifest.drivers ? buildPackUrl(route, manifest.drivers) : null),
          fetchOptionalPack<LapRecord[]>(manifest.laps ? buildPackUrl(route, manifest.laps) : null),
          fetchOptionalPack<StrategyPack>(manifest.strategy ? buildPackUrl(route, manifest.strategy) : null),
        ]).then(([compare, stintPack, driverSummaries, lapRecords, strategy]) => {
          if (cancelled) {
            return;
          }

          startTransition(() => {
            setInsights({
              status: [compare, stintPack, driverSummaries, lapRecords, strategy].every((pack) => pack.status === "ready") ? "ready" : "unavailable",
              compare: compare.value,
              stintPack: stintPack.value,
              driverSummaries: driverSummaries.value,
              lapRecords: lapRecords.value,
              strategy: strategy.value,
            });
          });
        });

        Promise.all([
          fetchJson<ReplayLap[]>(buildReplayLapsUrl(route)).catch(() => []),
          fetchJson<ReplayRaceControlMessage[]>(buildReplayRaceControlUrl(route)).catch(() => []),
        ]).then(([laps, raceControlMessages]) => {
          if (cancelled) {
            return;
          }

          setState((previous) => {
            if (previous.status !== "ready") {
              return previous;
            }
            return {
              status: "ready",
              replay: {
                ...previous.replay,
                laps,
                raceControlMessages: normalizeRaceControlMessages(
                  raceControlMessages,
                  previous.replay.totalTime ?? previous.replay.frames.at(-1)?.t ?? 0,
                ),
              },
              chunkFailures: previous.chunkFailures,
            };
          });
        });
      } catch (error) {
        if (!cancelled) {
          setState({
            status: "ready",
            replay: normalizeReplayRaceControl(initialReplay),
            chunkFailures: [],
          });
        }
      }
    }

    loadReplayRoute();

    return () => {
      cancelled = true;
      closeReplaySocket();
    };
  }, [closeReplaySocket, initialReplay, manifest, reloadKey, route]);

  if (state.status === "ready") {
    return (
      <>
        {state.chunkFailures.map((failure) => (
          <section key={failure.chunkIndex} className="panel replay-error-panel" role="alert" aria-live="assertive">
            <p>Replay chunk {failure.chunkIndex} ({failure.fromTime.toFixed(1)}s–{failure.toTime.toFixed(1)}s) could not load. Playback remains on the cached window.</p>
            <p>{failure.message}</p>
            <button
              ref={(node) => {
                if (node) {
                  retryChunkButtonRefs.current.set(failure.chunkIndex, node);
                } else {
                  retryChunkButtonRefs.current.delete(failure.chunkIndex);
                }
              }}
              className="button"
              type="button"
              aria-busy={retryingChunkIndex === failure.chunkIndex}
              aria-disabled={retryingChunkIndex !== null}
              onClick={async () => {
                if (retryingChunkIndexRef.current !== null) {
                  return;
                }
                const chunkIndex = failure.chunkIndex;
                retryingChunkIndexRef.current = chunkIndex;
                setRetryingChunkIndex(chunkIndex);
                let recovered = false;
                try {
                  await ensureChunkLoaded(chunkIndex);
                  recovered = loadedChunksRef.current.has(chunkIndex);
                } finally {
                  pendingRetryFocusRef.current = { chunkIndex, recovered };
                  retryingChunkIndexRef.current = null;
                  setRetryingChunkIndex(null);
                }
              }}
            >
              {retryingChunkIndex === failure.chunkIndex ? `Retrying chunk ${failure.chunkIndex}` : `Retry chunk ${failure.chunkIndex}`}
            </button>
          </section>
        ))}
        <ReplayView
          replay={state.replay}
          manifest={manifest}
          summary={summary}
          compare={insights.compare}
          insightsReady={insights.status !== "loading"}
          insightsStatus={insights.status}
          route={route}
          stintPack={insights.stintPack}
          driverSummaries={insights.driverSummaries}
          lapRecords={insights.lapRecords}
          strategy={insights.strategy}
          fullLoadProgress={fullLoadProgress}
          fullRaceLoaded={fullRaceLoaded}
          onEnsureTimeLoaded={ensureTimeLoaded}
          onLoadFullRace={loadFullRace}
        />
      </>
    );
  }

  if (state.status !== "error") {
    return null;
  }

  return (
    <div className="replay-view replay-view--workspace">
      <section className="panel replay-error-panel">
        <div className="section-header">
          <div>
            <p className="eyebrow">Replay degraded</p>
            <h2>Replay data could not be refreshed</h2>
          </div>
        </div>
        <p>{state.message}</p>
        <div className="hero-actions">
          <button className="button" type="button" onClick={() => setReloadKey((value) => value + 1)}>
            Retry replay load
          </button>
          <a className="button button--secondary" href="/replay">Replay library</a>
          <a className="button button--ghost" href="/cars/current-spec">Modelview</a>
        </div>
      </section>
    </div>
  );
}
