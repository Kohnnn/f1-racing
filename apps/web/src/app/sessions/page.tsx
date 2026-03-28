import { getLatestManifest, getOpenF1SeasonManifest, getSeasonIndex } from "@/lib/data";

export default async function SessionsPage() {
  const [manifest, seasonIndex, openF1Season] = await Promise.all([
    getLatestManifest(),
    getSeasonIndex(),
    getOpenF1SeasonManifest().catch(() => null),
  ]);

  return (
    <div className="page-stack">
      <section className="hero hero--compact">
        <p className="eyebrow">Session explorer</p>
        <h1>Browse the first static session pack.</h1>
        <p className="lead">
          This is the first milestone: a session index backed by generated static data packs instead of live
          upstream requests from the browser.
        </p>
        <div className="hero-actions">
          <a className="button" href={manifest.latest.path}>Open latest session</a>
        </div>
      </section>

      {seasonIndex.seasons.map((season) => (
        <section className="panel" key={season.season}>
          <div className="section-header">
            <div>
              <p className="eyebrow">Season</p>
              <h2>{season.season}</h2>
            </div>
          </div>
          <div className="panel-grid panel-grid--two">
            {season.grandsPrix.map((grandPrix) => (
              <article className="panel panel--nested" key={grandPrix.grandPrixSlug}>
                <p className="eyebrow">Grand Prix</p>
                <h3>{grandPrix.grandPrixName}</h3>
                <ul className="summary-list">
                  {grandPrix.sessions.map((session) => (
                    <li key={session.path}>
                      <strong>{session.sessionName}</strong>
                      <a href={session.path}>Open session</a>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>
      ))}

      {openF1Season ? (
        <section className="panel">
          <div className="section-header">
            <div>
              <p className="eyebrow">Real OpenF1 metadata</p>
              <h2>{openF1Season.year} season schedule snapshot</h2>
            </div>
          </div>
          <p>
            This section is driven by a real OpenF1 ingest run for the 2025 season. It tracks discovered sessions even
            when a full static pack has not been exported yet.
          </p>
          <div className="panel-grid panel-grid--two">
            {openF1Season.grandsPrix.slice(0, 10).map((grandPrix) => (
              <article className="panel panel--nested" key={grandPrix.grandPrixSlug}>
                <p className="eyebrow">{grandPrix.countryName}</p>
                <h3>{grandPrix.grandPrixName}</h3>
                <ul className="summary-list">
                  {grandPrix.sessions.map((session) => (
                    <li key={session.sessionKey}>
                      <strong>{session.sessionName}</strong>
                      <span>
                        {session.buildReady ? "Pack exported" : "Metadata ingested"} · {session.trackId}
                      </span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
