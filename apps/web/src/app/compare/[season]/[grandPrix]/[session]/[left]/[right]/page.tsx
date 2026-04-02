import { notFound } from "next/navigation";
import { formatDeltaMs, formatLapTime } from "@f1-racing/telemetry-utils";
import { CompareSummary } from "@/components/telemetry/compare-summary";
import { TelemetryTraces } from "@/components/telemetry/telemetry-traces";
import { getComparePack, getLapRecords, getSeasonIndex, getSessionManifest } from "@/lib/data";

interface ComparePageProps {
  params: Promise<{
    season: string;
    grandPrix: string;
    session: string;
    left: string;
    right: string;
  }>;
}

export async function generateStaticParams() {
  const index = await getSeasonIndex();
  const params = [];

  for (const season of index.seasons) {
    for (const grandPrix of season.grandsPrix) {
      for (const session of grandPrix.sessions) {
        const manifest = await getSessionManifest(session.season, session.grandPrixSlug, session.sessionSlug);
        for (const key of Object.keys(manifest.compare ?? {})) {
          const [left, right] = key.split("-");
          params.push({
            season: String(session.season),
            grandPrix: session.grandPrixSlug,
            session: session.sessionSlug,
            left,
            right,
          });
        }
      }
    }
  }

  return params;
}

export default async function ComparePage({ params }: ComparePageProps) {
  const { season, grandPrix, session, left, right } = await params;
  const compareKey = `${left.toLowerCase()}-${right.toLowerCase()}`;

  try {
    const [compare, laps] = await Promise.all([
      getComparePack(season, grandPrix, session, compareKey),
      getLapRecords(season, grandPrix, session),
    ]);

    const leftLap = laps.find((lap) => lap.driverCode === left && lap.lapNumber === compare.laps[0]);
    const rightLap = laps.find((lap) => lap.driverCode === right && lap.lapNumber === compare.laps[1]);

    return (
      <div className="page-stack">
        <section className="hero hero--compact">
          <p className="eyebrow">Lap compare</p>
          <h1>
            {left} vs {right}
          </h1>
          <p className="lead">
            This is the first compare surface driven by static packs. The route is intentionally compact and
            focuses on delta sections plus derived notes rather than shipping raw telemetry everywhere.
          </p>
          <div className="metric-grid">
            <div className="metric-chip">
              <span>{left} lap</span>
              <strong>{leftLap ? formatLapTime(leftLap.lapTime) : "-"}</strong>
            </div>
            <div className="metric-chip">
              <span>{right} lap</span>
              <strong>{rightLap ? formatLapTime(rightLap.lapTime) : "-"}</strong>
            </div>
            <div className="metric-chip">
              <span>Net gap</span>
              <strong>
                {leftLap && rightLap ? formatDeltaMs((rightLap.lapTime - leftLap.lapTime) * 1000) : "-"}
              </strong>
            </div>
          </div>
        </section>

        <TelemetryTraces compare={compare} />
        <CompareSummary compare={compare} />

        <section className="panel">
          <div className="section-header">
            <div>
              <p className="eyebrow">Next iteration</p>
              <h2>Planned compare upgrades</h2>
            </div>
          </div>
          <ul className="summary-list">
            <li>
              <strong>Telemetry traces</strong>
              <span>Speed, throttle, and brake traces now come from the compare pack. Gear and RPM can follow in the next iteration.</span>
            </li>
            <li>
              <strong>Corner explorer</strong>
              <span>Turn delta sections into corner-specific narratives with braking and throttle pickup summaries.</span>
            </li>
            <li>
              <strong>Track overlay</strong>
              <span>Render a lightweight SVG or canvas track map showing which driver led each section.</span>
            </li>
          </ul>
        </section>
      </div>
    );
  } catch {
    notFound();
  }
}
