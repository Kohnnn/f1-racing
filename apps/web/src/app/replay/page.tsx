import Link from "next/link";
import { getSeasonIndex } from "@/lib/data";

export default async function ReplayIndexPage() {
  const index = await getSeasonIndex();

  return (
    <div className="page-stack" style={{ padding: "24px", maxWidth: "1200px", margin: "0 auto" }}>
      <section className="hero hero--compact">
        <p className="eyebrow">Replay</p>
        <h1>Race Replay</h1>
        <p className="lead">
          Watch F1 sessions with real-time car positions, leaderboard, and telemetry.
          Select a session below to start the replay.
        </p>
      </section>

      {index.seasons.map((season) => (
        <section key={season.season} style={{ marginBottom: "48px" }}>
          <h2 style={{ fontSize: "24px", marginBottom: "16px" }}>{season.season} Season</h2>

          {season.grandsPrix.map((gp) => (
            <div key={gp.grandPrixSlug} style={{ marginBottom: "24px" }}>
              <h3 style={{ fontSize: "18px", color: "#888", marginBottom: "12px" }}>
                {gp.grandPrixName}
              </h3>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "8px" }}>
                {gp.sessions.map((s) => (
                  <Link
                    key={s.sessionSlug}
                    href={`/replay/${s.season}/${s.grandPrixSlug}/${s.sessionSlug}`}
                    className="card-link"
                    style={{
                      display: "block",
                      padding: "12px 16px",
                      background: "#1a1a2e",
                      borderRadius: "8px",
                      textDecoration: "none",
                      color: "inherit",
                      border: "1px solid #2a2a4a",
                      transition: "border-color 0.15s",
                    }}
                  >
                    <div style={{ fontWeight: "600", marginBottom: "4px" }}>{s.sessionName}</div>
                    <div style={{ fontSize: "12px", color: "#888" }}>
                      Session key: {s.sessionKey}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
