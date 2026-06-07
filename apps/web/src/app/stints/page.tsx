import type { Metadata } from "next";
import { getStintDiscovery } from "@/lib/discovery";
import { formatSessionDate, getCircuitArt, getSessionDate } from "@/lib/art";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Stints",
  description:
    "Browse every exported Formula 1 session with a stint pack. Open a session to read tyre windows and stint pace evolution.",
};

function sessionDateLabel(season: number, grandPrixSlug: string, sessionSlug: string): string | null {
  return formatSessionDate(getSessionDate(season, grandPrixSlug, sessionSlug), { showYear: true });
}

export default async function StintsIndexPage() {
  const seasons = await getStintDiscovery();
  const totalSessions = seasons.reduce((sum, group) => sum + group.sessions.length, 0);

  return (
    <div className="page-stack">
      <section className="hero hero--compact">
        <p className="eyebrow">Stint story</p>
        <h1>Tyre windows and stint pace</h1>
        <p className="lead">
          Every session below ships a stint pack. Open one to read tyre
          compound windows, stint length, and pace evolution across the race.
          The same read is embedded in the replay workspace beside the moving
          race context.
        </p>
        <div className="metric-grid">
          <div className="metric-chip">
            <span>Sessions</span>
            <strong>{totalSessions}</strong>
          </div>
          <div className="metric-chip">
            <span>Seasons</span>
            <strong>{seasons.length}</strong>
          </div>
        </div>
      </section>

      {seasons.length === 0 ? (
        <section className="panel">
          <p className="lead">No stint packs are available yet.</p>
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
                const href = `/stints/${session.season}/${session.grandPrixSlug}/${session.sessionSlug}`;
                return (
                  <a
                    className="discovery-card discovery-card--link"
                    key={`${session.grandPrixSlug}-${session.sessionSlug}`}
                    href={href}
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
                    <span className="discovery-card__cta">Open stint story →</span>
                  </a>
                );
              })}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
