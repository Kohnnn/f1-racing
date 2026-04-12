"use client";

import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import type { ComparePack, ReplayFrameChunk, ReplayLap, ReplayPack, ReplayRaceControlMessage, SessionManifest, SessionSummary, StintPack } from "@/lib/data";
import { buildClientDataUrl, buildClientWebSocketUrl } from "@/lib/client-data";
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

type ReplayRouteState =
  | {
      status: "loading";
    }
  | {
      status: "ready";
      replay: ReplayPack;
    }
  | {
      status: "error";
      message: string;
    };

interface ReplayInsightsState {
  compare: ComparePack | null;
  stintPack: StintPack | null;
}

const BUFFER_LOOKAHEAD_CHUNKS = 2;
const BUFFER_HISTORY_CHUNKS = 1;

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

function getReplayMetaFile(replayFile: string) {
  return replayFile.replace(/\.json$/i, ".meta.json");
}

function buildReplayMetaUrl(route: ReplayRouteClientProps["route"], replayFile: string) {
  return buildClientDataUrl(
    buildPackUrl(route, getReplayMetaFile(replayFile)),
    `/api/replay/${route.season}/${route.grandPrix}/${route.session}/meta`,
  );
}

function buildReplayFullUrl(route: ReplayRouteClientProps["route"], replayFile: string) {
  return buildClientDataUrl(
    buildPackUrl(route, replayFile),
    `/api/replay/${route.season}/${route.grandPrix}/${route.session}/full`,
  );
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
    .sort((left, right) => left.index - right.index);

  if (!keptEntries.length) {
    return frames;
  }

  const minTime = keptEntries[0].fromTime;
  const maxTime = keptEntries.at(-1)?.toTime ?? keptEntries[0].toTime;
  return frames.filter((frame) => frame.t >= minTime && frame.t <= maxTime);
}

export function ReplayRouteClient({ initialReplay, manifest, summary, route }: ReplayRouteClientProps) {
  const [state, setState] = useState<ReplayRouteState>({
    status: "ready",
    replay: initialReplay,
  });
  const [insights, setInsights] = useState<ReplayInsightsState>({ compare: null, stintPack: null });
  const [reloadKey, setReloadKey] = useState(0);
  const chunkEntriesRef = useRef<NonNullable<ReplayPack["frameChunkIndex"]>>([]);
  const loadedChunksRef = useRef<Set<number>>(new Set());
  const requestedChunksRef = useRef<Set<number>>(new Set());
  const socketRef = useRef<WebSocket | null>(null);
  const socketChunkResolversRef = useRef<Map<number, { resolve: (chunk: ReplayFrameChunk) => void; reject: (error: Error) => void }>>(new Map());
  const routeVersionRef = useRef(0);

  const rejectSocketChunkRequests = useCallback((message: string) => {
    for (const pending of socketChunkResolversRef.current.values()) {
      pending.reject(new Error(message));
    }
    socketChunkResolversRef.current.clear();
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
      socketChunkResolversRef.current.set(chunkIndex, { resolve, reject });
      socket.send(JSON.stringify({ type: "chunk", index: chunkIndex }));
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

    const currentVersion = routeVersionRef.current;
    requestedChunksRef.current.add(chunkIndex);

    try {
      const chunk = socketRef.current?.readyState === WebSocket.OPEN
        ? await requestChunkOverSocket(chunkIndex)
        : await fetchJson<ReplayFrameChunk>(buildReplayChunkUrl(route, chunkEntry));

      if (routeVersionRef.current !== currentVersion) {
        return;
      }

      loadedChunksRef.current.add(chunkIndex);
      startTransition(() => {
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
          };
        });
      });
    } catch {
      requestedChunksRef.current.delete(chunkIndex);
      return;
    }

    requestedChunksRef.current.delete(chunkIndex);
  }, [requestChunkOverSocket, route]);

  const trimChunkCache = useCallback((anchorChunkIndex: number) => {
    const minChunkIndex = Math.max(0, anchorChunkIndex - BUFFER_HISTORY_CHUNKS);
    const maxChunkIndex = anchorChunkIndex + BUFFER_LOOKAHEAD_CHUNKS;
    const nextLoadedChunks = new Set(
      Array.from(loadedChunksRef.current).filter((index) => index >= minChunkIndex && index <= maxChunkIndex),
    );

    if (nextLoadedChunks.size === loadedChunksRef.current.size) {
      return;
    }

    loadedChunksRef.current = nextLoadedChunks;
    startTransition(() => {
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
        };
      });
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

    for (let offset = 0; offset <= BUFFER_LOOKAHEAD_CHUNKS; offset += 1) {
      void ensureChunkLoaded(activeEntry.index + offset);
    }

    trimChunkCache(activeEntry.index);
  }, [ensureChunkLoaded, trimChunkCache]);

  useEffect(() => {
    routeVersionRef.current += 1;
    chunkEntriesRef.current = initialReplay.frameChunkIndex ?? [];
    requestedChunksRef.current = new Set();

    if (initialReplay.frameChunkIndex?.length) {
      loadedChunksRef.current = new Set();
      for (let offset = 0; offset <= BUFFER_LOOKAHEAD_CHUNKS; offset += 1) {
        void ensureChunkLoaded(offset);
      }
    } else {
      loadedChunksRef.current = new Set();
    }

    setState({
      status: "ready",
      replay: initialReplay,
    });
    setInsights({ compare: null, stintPack: null });
  }, [ensureChunkLoaded, initialReplay]);

  useEffect(() => {
    let cancelled = false;
    const compareFile = Object.values(manifest.compare ?? {})[0] ?? null;

    async function loadReplayRoute() {
      try {
        Promise.all([
          compareFile ? fetchJson<ComparePack>(buildPackUrl(route, compareFile)).catch(() => null) : Promise.resolve(null),
          manifest.stints ? fetchJson<StintPack>(buildPackUrl(route, manifest.stints)).catch(() => null) : Promise.resolve(null),
        ]).then(([compare, stintPack]) => {
          if (cancelled) {
            return;
          }

          startTransition(() => {
            setInsights({ compare, stintPack });
          });
        });

        Promise.all([
          fetchJson<ReplayLap[]>(buildReplayLapsUrl(route)).catch(() => []),
          fetchJson<ReplayRaceControlMessage[]>(buildReplayRaceControlUrl(route)).catch(() => []),
        ]).then(([laps, raceControlMessages]) => {
          if (cancelled) {
            return;
          }

          startTransition(() => {
            setState((previous) => {
              if (previous.status !== "ready") {
                return previous;
              }
              return {
                status: "ready",
                replay: {
                  ...previous.replay,
                  laps,
                  raceControlMessages,
                },
              };
            });
          });
        });
      } catch (error) {
        if (!cancelled) {
          setState({
            status: "ready",
            replay: initialReplay,
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
        <ReplayView
          replay={state.replay}
          manifest={manifest}
          summary={summary}
          compare={insights.compare}
          route={route}
          stintPack={insights.stintPack}
          onEnsureTimeLoaded={ensureTimeLoaded}
        />
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
