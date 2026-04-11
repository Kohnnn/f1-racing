"use client";

import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import type { ComparePack, ReplayFrameChunk, ReplayPack, SessionManifest, SessionSummary, StintPack } from "@/lib/data";
import { buildClientDataUrl, buildClientWebSocketUrl } from "@/lib/client-data";
import { ReplayView } from "./ReplayView";

interface ReplayRouteClientProps {
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

export function ReplayRouteClient({ manifest, summary, route }: ReplayRouteClientProps) {
  const [state, setState] = useState<ReplayRouteState>({ status: "loading" });
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

  const ensureTimeLoaded = useCallback((time: number) => {
    const chunkEntries = chunkEntriesRef.current;
    if (!chunkEntries.length) {
      return;
    }

    const activeEntry = chunkEntries.find((entry) => time <= entry.toTime) ?? chunkEntries.at(-1);
    if (!activeEntry) {
      return;
    }

    void ensureChunkLoaded(activeEntry.index);

    if (time >= activeEntry.toTime - 12) {
      void ensureChunkLoaded(activeEntry.index + 1);
    }
  }, [ensureChunkLoaded]);

  useEffect(() => {
    let cancelled = false;
    const compareFile = Object.values(manifest.compare ?? {})[0] ?? null;

    async function loadReplayRoute() {
      routeVersionRef.current += 1;
      chunkEntriesRef.current = [];
      loadedChunksRef.current = new Set();
      requestedChunksRef.current = new Set();
      setState({ status: "loading" });
      setInsights({ compare: null, stintPack: null });

      try {
        const replayFile = manifest.replay ?? "replay.json";
        let replay: ReplayPack;

        try {
          const replayMeta = await fetchJson<ReplayPack>(buildReplayMetaUrl(route, replayFile));
          const chunkEntries = replayMeta.frameChunkIndex ?? [];
          const firstChunkEntry = chunkEntries[0];

          if (!firstChunkEntry) {
            throw new Error("Replay metadata is missing frame chunks.");
          }

          const firstChunk = await fetchJson<ReplayFrameChunk>(buildReplayChunkUrl(route, firstChunkEntry));
          chunkEntriesRef.current = chunkEntries;
          loadedChunksRef.current.add(firstChunkEntry.index);
          replay = {
            ...replayMeta,
            frames: firstChunk.frames,
          };
        } catch {
          replay = await fetchJson<ReplayPack>(buildReplayFullUrl(route, replayFile));
        }

        if (!cancelled) {
          setState({
            status: "ready",
            replay,
          });
        }

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
      } catch (error) {
        if (!cancelled) {
          setState({
            status: "error",
            message: error instanceof Error ? error.message : "Replay data could not be loaded.",
          });
        }
      }
    }

    loadReplayRoute();

    return () => {
      cancelled = true;
      closeReplaySocket();
    };
  }, [closeReplaySocket, manifest, reloadKey, route]);

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

  return (
    <div className="replay-view replay-view--workspace">
      <section className="hero hero--compact replay-hero">
        <p className="eyebrow">Replay workspace</p>
        <h1>{summary.grandPrix}</h1>
        <p className="lead">
          {summary.session} is loading as a route-specific static pack so the page stays light on first paint and only
          pulls the replay data when this workspace is actually opened. If chunk metadata is available, the first frame
          window loads first and the rest of the replay streams in behind it.
        </p>
      </section>

      <section className="panel">
        <div className="section-header">
          <div>
            <p className="eyebrow">{state.status === "error" ? "Replay unavailable" : "Loading pack"}</p>
            <h2>{state.status === "error" ? "Replay data could not be loaded" : "Fetching the session pack"}</h2>
          </div>
        </div>
        <p>
          {state.status === "error"
            ? state.message
            : `Preparing session key ${summary.sessionKey} for ${route.season} ${summary.grandPrix}.`}
        </p>
        <div className="hero-actions">
          {state.status === "error" ? (
            <button className="button" type="button" onClick={() => setReloadKey((value) => value + 1)}>
              Retry replay load
            </button>
          ) : null}
          <a className="button button--secondary" href="/replay">Replay library</a>
          <a className="button button--ghost" href="/cars/current-spec">Modelview</a>
        </div>
      </section>
    </div>
  );
}
