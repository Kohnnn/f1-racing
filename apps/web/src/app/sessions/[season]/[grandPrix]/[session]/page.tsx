import { notFound } from "next/navigation";
import { SessionRouteClient } from "@/components/telemetry/session-route-client";
import { getSeasonIndex, getSessionManifest, getSessionSummary } from "@/lib/data";

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
    const [manifest, summary] = await Promise.all([
      getSessionManifest(season, grandPrix, session),
      getSessionSummary(season, grandPrix, session),
    ]);

    return (
      <SessionRouteClient manifest={manifest} summary={summary} route={{ season, grandPrix, session }} />
    );
  } catch {
    notFound();
  }
}
