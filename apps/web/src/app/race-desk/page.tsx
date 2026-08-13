import { LiveRouteClient, type LiveSessionRef } from "@/components/live/live-route-client";
import { getLatestManifest, getReplayFrameChunk, getReplayMetaPack, getSessionSummary } from "@/lib/data";

export const metadata = {
  title: "Race Desk",
  description: "Historical replay simulation with track map, leaderboard, and driver telemetry.",
};

export default async function RaceDeskPage() {
  try {
    const latest = (await getLatestManifest()).latest;
    if (!latest) {
      return (
        <div className="page-stack">
          <section className="hero hero--compact">
            <p className="eyebrow">Historical Race Desk</p>
            <h1>No current featured race pack.</h1>
            <p className="lead">Race Desk needs a verified featured race. Historical sessions remain available in Replay.</p>
            <a className="button" href="/replay">Browse historical Replay</a>
          </section>
        </div>
      );
    }
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

    const initialReplayMeta = await getReplayMetaPack(latest.season, latest.grandPrixSlug, latest.sessionSlug);
    const firstChunk = await getReplayFrameChunk(
      latest.season,
      latest.grandPrixSlug,
      latest.sessionSlug,
      initialReplayMeta.frameChunkIndex[0],
    );
    const initialFrame = firstChunk.frames[0] ?? null;

    return (
      <LiveRouteClient
        initialSession={initialSession}
        initialSummary={initialSummary}
        initialReplayMeta={initialReplayMeta}
        initialFrame={initialFrame}
        initialSpeed={8}
        mode="race-desk"
      />
    );
  } catch {
    return (
      <div className="page-stack">
        <section className="hero hero--compact" role="alert">
          <p className="eyebrow">Race Desk</p>
          <h1>Historical replay unavailable</h1>
          <p className="lead">The featured race pack could not be opened. Retry the page or browse another verified session.</p>
          <div className="hero-actions">
            <a className="button" href="/race-desk">Retry historical replay</a>
            <a className="button button--secondary" href="/replay">Replay library</a>
          </div>
        </section>
      </div>
    );
  }
}
