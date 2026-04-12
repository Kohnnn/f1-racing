import { notFound } from "next/navigation";
import { ReplayRouteClient } from "@/components/replay/replay-route-client";
import { getReplayFrameChunk, getReplayMetaPack, getReplayPack, getSeasonIndex, getSessionManifest, getSessionSummary } from "@/lib/data";

interface ReplayPageProps {
  params: Promise<{
    season: string;
    grandPrix: string;
    session: string;
  }>;
}

export async function generateStaticParams() {
  const index = await getSeasonIndex();

  return index.seasons.flatMap((season) =>
    season.grandsPrix.flatMap((grandPrix) =>
      grandPrix.sessions.map((s) => ({
        season: String(s.season),
        grandPrix: s.grandPrixSlug,
        session: s.sessionSlug,
      }))
    )
  );
}

export default async function ReplayPage({ params }: ReplayPageProps) {
  const { season, grandPrix, session } = await params;

  try {
    const [manifest, summary] = await Promise.all([
      getSessionManifest(season, grandPrix, session),
      getSessionSummary(season, grandPrix, session),
    ]);

    let initialReplay;
    try {
      const replayMeta = await getReplayMetaPack(season, grandPrix, session);
      const firstChunkPath = replayMeta.frameChunkIndex?.[0]?.path;
      if (!firstChunkPath) {
        throw new Error("Missing replay frame chunk index");
      }

      const firstChunk = await getReplayFrameChunk(season, grandPrix, session, firstChunkPath);
      initialReplay = {
        ...replayMeta,
        frames: firstChunk.frames.slice(0, 1),
      };
    } catch {
      initialReplay = await getReplayPack(season, grandPrix, session);
    }

    return (
      <ReplayRouteClient
        initialReplay={initialReplay}
        manifest={manifest}
        summary={summary}
        route={{ season, grandPrix, session }}
      />
    );
  } catch {
    notFound();
  }
}
