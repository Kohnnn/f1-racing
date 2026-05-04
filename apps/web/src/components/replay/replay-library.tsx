import { getLatestManifest, getSeasonIndex } from "@/lib/data";

interface ReplayLibraryProps {
  aliasMode?: boolean;
}

function buildCoverageLabel(sessionCount: number) {
  if (sessionCount >= 2) {
    return `${sessionCount} sessions available`;
  }
  return "Limited coverage";
}

function buildSessionMeta(season: number, sessionName: string) {
  if (season > 2025) {
    return "2026 preview replay";
  }
  return `${sessionName} replay`;
}

function buildCoverageNote(sessionCount: number) {
  if (sessionCount >= 2) {
    return "Race and support sessions exported.";
  }
  return "Only exported sessions are shown; more sessions can be added when packs are generated.";
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
        <p className="eyebrow">Discover and replay</p>
        <h1>Find an exported F1 session and open the race workspace.</h1>
        <p className="lead">
          {aliasMode
            ? "Sessions has been folded into Discover and Replay. Choose a pack here, then stay inside the replay workspace for track map, leaderboard, telemetry, and strategy context."
            : "Choose a session pack, open the replay workspace, and keep the track map, leaderboard, telemetry, race-control context, and driver analysis in one place."}
        </p>
        <div className="hero-actions">
          <a className="button" href={latestReplayHref}>Open latest replay</a>
          <a className="button button--secondary" href="/live">Open live feed</a>
          <a className="button button--ghost" href="/cars/current-spec">Open modelview</a>
          <a className="button button--ghost" href="/learn">Open learn</a>
        </div>
        <div className="discover-action-grid" aria-label="Discover shortcuts">
          <a className="discover-action-card" href={latestReplayHref}>
            <span>Latest Pack</span>
            <strong>{latestManifest.latest.grandPrixName}</strong>
            <small>{latestManifest.latest.sessionName} replay workspace</small>
          </a>
          <a className="discover-action-card" href="/live">
            <span>Live Desk</span>
            <strong>Socket or simulator</strong>
            <small>Use the OCI feed when available, with static fallback.</small>
          </a>
          <a className="discover-action-card" href="/cars/current-spec">
            <span>Modelview</span>
            <strong>Current-spec cars</strong>
            <small>Inspect local GLB race models and focus overlays.</small>
          </a>
        </div>
        <div className="replay-meta-row">
          <span className="replay-meta-pill">{latestManifest.latest.season} season pack</span>
          <span className="replay-meta-pill">
            {latestManifest.latest.grandPrixName} · {latestManifest.latest.sessionName}
          </span>
          <span className="replay-meta-pill">Coverage varies by available exported data</span>
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
                    <p className="eyebrow">{buildCoverageLabel(grandPrix.sessions.length)}</p>
                    <h3>{grandPrix.grandPrixName}</h3>
                    <p className="replay-session-cluster__note">{buildCoverageNote(grandPrix.sessions.length)}</p>
                  </div>
                  <div className="replay-session-links">
                    {grandPrix.sessions.map((session) => (
                      <a
                        className="replay-session-link"
                        key={session.sessionSlug}
                        href={`/replay/${session.season}/${session.grandPrixSlug}/${session.sessionSlug}`}
                      >
                        <strong>{session.sessionName}</strong>
                        <span>{buildSessionMeta(session.season, session.sessionName)}</span>
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
