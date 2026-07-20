import { notFound } from "next/navigation";
import { SessionRouteClient } from "@/components/telemetry/session-route-client";
import { getSeasonIndex, getSessionManifest, getSessionSummary, type SessionSummary } from "@/lib/data";

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
      grandPrix.sessions
        .map((session) => ({
          season: String(session.season),
          grandPrix: session.grandPrixSlug,
          session: session.sessionSlug,
        }))
    )
  );
}

function buildFallbackSummary(season: string, grandPrix: string, session: string, sessionKey: number): SessionSummary {
  const grandPrixLabel = grandPrix
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  const sessionLabel = session
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

  return {
    season: Number(season),
    grandPrix: grandPrixLabel,
    session: sessionLabel,
    sessionKey,
    trackId: grandPrix,
    generatedAt: new Date(0).toISOString(),
    source: "openf1",
    drivers: [],
    weatherSummary: {
      airTempC: null,
      trackTempC: null,
      rainRiskPct: null,
    },
  };
}

export async function generateMetadata({ params }: SessionPageProps) {
  const { season, grandPrix, session } = await params;
  try {
    const summary = await getSessionSummary(season, grandPrix, session);
    return {
      title: `${summary.grandPrix} · ${summary.session}`,
      description: `Session summary, lap times, and replay shortcut for ${summary.grandPrix} ${summary.session}.`,
    };
  } catch {
    return {
      title: `${grandPrix} · ${session}`,
    };
  }
}

export default async function SessionPage({ params }: SessionPageProps) {
  const { season, grandPrix, session } = await params;

  let manifest;
  try {
    manifest = await getSessionManifest(season, grandPrix, session);
  } catch {
    notFound();
  }

  let summary: SessionSummary;
  try {
    summary = await getSessionSummary(season, grandPrix, session);
  } catch {
    summary = buildFallbackSummary(season, grandPrix, session, manifest.sessionKey);
  }

  return (
    <SessionRouteClient manifest={manifest} summary={summary} route={{ season, grandPrix, session }} />
  );
}
