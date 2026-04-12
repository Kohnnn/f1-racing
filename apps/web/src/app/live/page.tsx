import { notFound } from "next/navigation";
import { LiveRouteClient, type LiveSessionRef } from "@/components/live/live-route-client";
import { getLatestManifest, getReplayFrameChunk, getReplayMetaPack, getReplayPack, getSessionSummary } from "@/lib/data";

export default async function LivePage() {
  try {
    const latest = (await getLatestManifest()).latest;
    const initialSession: LiveSessionRef = {
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

    const initialSummary = await getSessionSummary(latest.season, latest.grandPrixSlug, latest.sessionSlug);

    let initialReplayMeta;
    let initialFrame = null;

    try {
      const replayMeta = await getReplayMetaPack(latest.season, latest.grandPrixSlug, latest.sessionSlug);
      const firstChunkPath = replayMeta.frameChunkIndex?.[0]?.path;
      if (!firstChunkPath) {
        throw new Error("Missing replay frame chunk index");
      }

      const firstChunk = await getReplayFrameChunk(latest.season, latest.grandPrixSlug, latest.sessionSlug, firstChunkPath);
      initialReplayMeta = replayMeta;
      initialFrame = firstChunk.frames[0] ?? null;
    } catch {
      const replay = await getReplayPack(latest.season, latest.grandPrixSlug, latest.sessionSlug);
      initialReplayMeta = replay;
      initialFrame = replay.frames[0] ?? null;
    }

    return (
      <LiveRouteClient
        initialSession={initialSession}
        initialSummary={initialSummary}
        initialReplayMeta={initialReplayMeta}
        initialFrame={initialFrame}
        initialSpeed={8}
      />
    );
  } catch {
    notFound();
  }
}
