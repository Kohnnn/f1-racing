import { getLatestManifest, getSeasonIndex } from "@/lib/data";

interface ReplayLibraryProps {
  aliasMode?: boolean;
}

export async function ReplayLibrary({ aliasMode = false }: ReplayLibraryProps) {
  const [latestManifest, index] = await Promise.all([
    getLatestManifest(),
    getSeasonIndex(),
  ]);

  const latestReplayHref = latestManifest.latest.path.replace(/^\/sessions\//, "/replay/");

  return (
    <div className="page-stack">
      <section className="hero hero--compact replay-hero">
        <p className="eyebrow">Replay library</p>
        <h1>Track playback for exported F1 sessions.</h1>
        <p className="lead">
          {aliasMode
            ? "Sessions has been folded into replay. Use this library to choose a pack, then stay inside the replay workspace for the rest of the flow."
            : "Choose a session pack, open the replay workspace, and keep the track map, leaderboard, and driver telemetry in one place."}
        </p>
        <div className="hero-actions">
          <a className="button" href={latestReplayHref}>Open latest replay</a>
          <a className="button button--secondary" href="/cars/current-spec">Open modelview</a>
          <a className="button button--ghost" href="/learn">Open learn</a>
        </div>
        <div className="replay-meta-row">
          <span className="replay-meta-pill">{latestManifest.latest.season} season pack</span>
          <span className="replay-meta-pill">
            {latestManifest.latest.grandPrixName} · {latestManifest.latest.sessionName}
          </span>
        </div>
      </section>

      <div className="replay-index-grid">
        {index.seasons.map((season) => (
          <section className="panel" key={season.season}>
            <div className="section-header">
              <div>
                <p className="eyebrow">Season</p>
                <h2>{season.season}</h2>
              </div>
            </div>

            <div className="replay-session-grid">
              {season.grandsPrix.map((grandPrix) => (
                <article className="panel panel--nested replay-session-cluster" key={grandPrix.grandPrixSlug}>
                  <div>
                    <p className="eyebrow">Grand Prix</p>
                    <h3>{grandPrix.grandPrixName}</h3>
                  </div>
                  <div className="replay-session-links">
                    {grandPrix.sessions.map((session) => (
                      <a
                        className="replay-session-link"
                        key={session.sessionSlug}
                        href={`/replay/${session.season}/${session.grandPrixSlug}/${session.sessionSlug}`}
                      >
                        <strong>{session.sessionName}</strong>
                        <span>Session key {session.sessionKey}</span>
                      </a>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
