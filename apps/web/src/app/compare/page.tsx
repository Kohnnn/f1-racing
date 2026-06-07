import type { Metadata } from "next";
import { getCompareDiscovery } from "@/lib/discovery";
import { formatSessionDate, getCircuitArt, getDriverArt, getSessionDate } from "@/lib/art";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Compare",
  description:
    "Browse every exported Formula 1 session with a lap-compare pack. Pick a driver pair to open section deltas and telemetry traces.",
};

function sessionDateLabel(season: number, grandPrixSlug: string, sessionSlug: string): string | null {
  return formatSessionDate(getSessionDate(season, grandPrixSlug, sessionSlug), { showYear: true });
}

export default async function CompareIndexPage() {
  const seasons = await getCompareDiscovery();
  const totalSessions = seasons.reduce((sum, group) => sum + group.sessions.length, 0);
  const totalPairs = seasons.reduce(
    (sum, group) => sum + group.sessions.reduce((s, session) => s + session.pairs.length, 0),
    0,
  );

  return (
    <div className="page-stack">
      <section className="hero hero--compact">
        <p className="eyebrow">Lap compare</p>
        <h1>Compare two laps, side by side</h1>
        <p className="lead">
          Every session below ships a compare pack with section deltas, speed,
          throttle, brake, gear, and RPM traces. Pick a driver pair to open the
          full read. The same comparison is also embedded in the replay
          workspace for in-context analysis.
        </p>
        <div className="metric-grid">
          <div className="metric-chip">
            <span>Sessions</span>
            <strong>{totalSessions}</strong>
          </div>
          <div className="metric-chip">
            <span>Driver pairs</span>
            <strong>{totalPairs}</strong>
          </div>
          <div className="metric-chip">
            <span>Seasons</span>
            <strong>{seasons.length}</strong>
          </div>
        </div>
      </section>

      {seasons.length === 0 ? (
        <section className="panel">
          <p className="lead">No compare packs are available yet.</p>
        </section>
      ) : (
        seasons.map((group) => (
          <section className="panel" key={group.season}>
            <div className="section-header">
              <div>
                <p className="eyebrow">{group.season} season</p>
                <h2>{group.sessions.length} session{group.sessions.length === 1 ? "" : "s"}</h2>
              </div>
            </div>
            <div className="discovery-grid">
              {group.sessions.map((session) => {
                const { circuit, map } = getCircuitArt(session.trackId);
                const dateLabel = sessionDateLabel(session.season, session.grandPrixSlug, session.sessionSlug);
                return (
                  <article
                    className="discovery-card"
                    key={`${session.grandPrixSlug}-${session.sessionSlug}`}
                  >
                    <div className="discovery-card__head">
                      {map ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img className="discovery-card__map" src={map} alt={`${session.grandPrixName} circuit map`} loading="lazy" />
                      ) : null}
                      <div className="discovery-card__title">
                        <h3>{session.grandPrixName}</h3>
                        <p className="discovery-card__meta">
                          {session.sessionName}
                          {dateLabel ? ` · ${dateLabel}` : ""}
                          {circuit.corners ? ` · ${circuit.corners} corners` : ""}
                        </p>
                      </div>
                    </div>
                    <ul className="discovery-card__pairs">
                      {session.pairs.map((pair) => {
                        const left = getDriverArt(pair.left, { season: session.season });
                        const right = getDriverArt(pair.right, { season: session.season });
                        const href = `/compare/${session.season}/${session.grandPrixSlug}/${session.sessionSlug}/${pair.left}/${pair.right}`;
                        return (
                          <li key={pair.key}>
                            <a className="discovery-pair" href={href}>
                              <span className="discovery-pair__driver">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={left.avatar} alt="" aria-hidden="true" loading="lazy" />
                                {pair.left}
                              </span>
                              <span className="discovery-pair__vs">vs</span>
                              <span className="discovery-pair__driver">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={right.avatar} alt="" aria-hidden="true" loading="lazy" />
                                {pair.right}
                              </span>
                            </a>
                          </li>
                        );
                      })}
                    </ul>
                  </article>
                );
              })}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
