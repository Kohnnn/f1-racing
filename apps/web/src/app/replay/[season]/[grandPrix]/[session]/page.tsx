import { ReplayRouteClient } from "@/components/replay/replay-route-client";
import { getReplayFrameChunk, getReplayMetaPack, getSeasonIndex, getSessionManifest, getSessionSummary } from "@/lib/data";

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
      grandPrix.sessions
        .map((s) => ({
          season: String(s.season),
          grandPrix: s.grandPrixSlug,
          session: s.sessionSlug,
        }))
    )
  );
}

export async function generateMetadata({ params }: ReplayPageProps) {
  const { season, grandPrix, session } = await params;
  try {
    const summary = await getSessionSummary(season, grandPrix, session);
    return {
      title: `${summary.grandPrix} · ${summary.session} replay`,
      description: `Replay workspace for ${summary.grandPrix} ${summary.session} with track map, leaderboard, and telemetry.`,
    };
  } catch {
    return {
      title: `${grandPrix} · ${session} replay`,
    };
  }
}

export default async function ReplayPage({ params }: ReplayPageProps) {
  const { season, grandPrix, session } = await params;

  try {
    const [manifest, summary] = await Promise.all([
      getSessionManifest(season, grandPrix, session),
      getSessionSummary(season, grandPrix, session),
    ]);

    const replayMeta = await getReplayMetaPack(season, grandPrix, session);
    const firstChunk = await getReplayFrameChunk(season, grandPrix, session, replayMeta.frameChunkIndex[0]);
    const initialReplay = {
      ...replayMeta,
      frames: firstChunk.frames.slice(0, 1),
    };

    return (
      <ReplayRouteClient
        initialReplay={initialReplay}
        manifest={manifest}
        summary={summary}
        route={{ season, grandPrix, session }}
      />
    );
  } catch {
    return (
      <main className="replay-view replay-view--workspace">
        <section className="panel replay-error-panel" role="alert">
          <p className="eyebrow">Replay unavailable</p>
          <h1>{grandPrix} replay could not be opened</h1>
          <p>Retry this replay or return to the replay library and open another available session.</p>
          <div className="hero-actions">
            <a className="button" href={`/replay/${season}/${grandPrix}/${session}`}>Retry replay</a>
            <a className="button button--secondary" href="/replay">Replay library</a>
          </div>
        </section>
      </main>
    );
  }
}
