import { notFound } from "next/navigation";
import { formatLapTime } from "@f1-racing/telemetry-utils";
import { CompareSummary } from "@/components/telemetry/compare-summary";
import { DriverCard } from "@/components/telemetry/driver-card";
import { LapTable } from "@/components/telemetry/lap-table";
import { MetricChip } from "@/components/telemetry/metric-chip";
import { StrategySummary } from "@/components/telemetry/strategy-summary";
import {
  getComparePack,
  getDriverSummaries,
  getLapRecords,
  getSeasonIndex,
  getSessionManifest,
  getSessionSummary,
  getStrategyPack,
} from "@/lib/data";

interface SessionPageProps {
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
      grandPrix.sessions.map((session) => ({
        season: String(session.season),
        grandPrix: session.grandPrixSlug,
        session: session.sessionSlug,
      }))
    )
  );
}

export default async function SessionPage({ params }: SessionPageProps) {
  const { season, grandPrix, session } = await params;

  try {
    const [manifest, summary, drivers, laps, strategy] = await Promise.all([
      getSessionManifest(season, grandPrix, session),
      getSessionSummary(season, grandPrix, session),
      getDriverSummaries(season, grandPrix, session),
      getLapRecords(season, grandPrix, session),
      getStrategyPack(season, grandPrix, session),
    ]);

    const compareEntries = Object.entries(manifest.compare);
    const compare = compareEntries.length
      ? await getComparePack(season, grandPrix, session, compareEntries[0][1].replace(/^compare\//, "").replace(/\.json$/, ""))
      : null;

    const fastestLap = laps.find((lap) => lap.isFastest) ?? laps[0];
    const fastestByDriver = new Map(laps.filter((lap) => lap.isFastest).map((lap) => [lap.driverCode, lap]));

    return (
      <div className="page-stack">
        <section className="hero hero--compact">
          <p className="eyebrow">Sample session</p>
          <h1>
            {summary.grandPrix} · {summary.session}
          </h1>
          <p className="lead">
            Static pack for session key <code>{summary.sessionKey}</code>, generated as if it were coming from an
            offline OpenF1 pipeline and served from edge storage.
          </p>
          <div className="metric-grid">
            <MetricChip label="Fastest lap" value={`${fastestLap.driverCode} · ${formatLapTime(fastestLap.lapTime)}`} />
            <MetricChip label="Track" value={summary.trackId} />
            <MetricChip label="Air / track" value={`${summary.weatherSummary.airTempC}C / ${summary.weatherSummary.trackTempC}C`} />
            <MetricChip label="Rain risk" value={`${summary.weatherSummary.rainRiskPct}%`} />
          </div>
          {compare ? (
            <div className="hero-actions">
              <a className="button button--secondary" href={`/compare/${season}/${grandPrix}/${session}/${compare.drivers[0]}/${compare.drivers[1]}`}>
                Open {compare.drivers[0]} vs {compare.drivers[1]} compare
              </a>
              {manifest.stints ? (
                <a className="button button--secondary" href={`/stints/${season}/${grandPrix}/${session}`}>
                  Open stint story
                </a>
              ) : null}
            </div>
          ) : null}
        </section>

        <section className="panel-grid panel-grid--two">
          {drivers.map((driver) => (
            <DriverCard
              key={driver.driverCode}
              driver={driver}
              fastestLap={fastestByDriver.get(driver.driverCode)}
            />
          ))}
        </section>

        <LapTable laps={laps} />

        {compare ? <CompareSummary compare={compare} /> : null}
        <StrategySummary strategy={strategy} />
      </div>
    );
  } catch {
    notFound();
  }
}
