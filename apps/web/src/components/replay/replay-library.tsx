import { getLatestManifest, getSeasonIndex, type SessionRef } from "@/lib/data";

interface ReplayLibraryProps {
  aliasMode?: boolean;
}

const SESSION_PRIORITY: Record<string, number> = {
  Race: 0,
  Sprint: 1,
  "Sprint Qualifying": 2,
  Qualifying: 3,
  "Practice 3": 4,
  "Practice 2": 5,
  "Practice 1": 6,
};

function sortSessionNames<T extends { sessionName: string }>(sessions: T[]): T[] {
  return [...sessions].sort((left, right) => {
    const leftPriority = SESSION_PRIORITY[left.sessionName] ?? 99;
    const rightPriority = SESSION_PRIORITY[right.sessionName] ?? 99;
    return leftPriority - rightPriority;
  });
}

function buildCoverageLabel(sessions: Array<{ sessionName: string }>) {
  const present = new Set(sessions.map((session) => session.sessionName));
  const has = (name: string) => present.has(name);
  if (has("Race") && has("Qualifying") && (has("Sprint") || has("Sprint Qualifying"))) {
    return "Sprint weekend - full coverage";
  }
  if (has("Race") && has("Qualifying")) {
    return "Race + qualifying";
  }
  if (has("Race") && (has("Sprint") || has("Sprint Qualifying"))) {
    return "Race + sprint";
  }
  if (has("Race")) {
    return "Race only";
  }
  if (has("Qualifying")) {
    return "Qualifying only";
  }
  if (has("Sprint") || has("Sprint Qualifying")) {
    return "Sprint only";
  }
  return `${sessions.length} session${sessions.length === 1 ? "" : "s"}`;
}

function buildSessionMeta(season: number, sessionName: string) {
  if (season > 2025) {
    return "2026 preview replay";
  }
  return `${sessionName} replay`;
}

function buildCoverageNote(sessionCount: number, label: string) {
  if (label.includes("full coverage") || sessionCount >= 3) {
    return "Race, qualifying, and sprint sessions exported.";
  }
  if (sessionCount >= 2) {
    return "Race and support session exported.";
  }
  return "More sessions become available as the OpenF1 archive opens up.";
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
              {season.grandsPrix.map((grandPrix) => {
                const sortedSessions = sortSessionNames(grandPrix.sessions);
                const coverageLabel = buildCoverageLabel(grandPrix.sessions);
                const coverageNote = buildCoverageNote(grandPrix.sessions.length, coverageLabel);
                return (
                  <article className="panel panel--nested replay-session-cluster" key={grandPrix.grandPrixSlug}>
                    <div>
                      <p className="eyebrow">{coverageLabel}</p>
                      <h3>{grandPrix.grandPrixName}</h3>
                      <p className="replay-session-cluster__note">{coverageNote}</p>
                    </div>
                    <div className="replay-session-links">
                      {sortedSessions.map((session) => (
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
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
