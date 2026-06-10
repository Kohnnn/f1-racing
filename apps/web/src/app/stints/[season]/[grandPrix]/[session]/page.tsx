import { notFound } from "next/navigation";
import { StintStory } from "@/components/telemetry/stint-story";
import { getSeasonIndex, getSessionManifest, getSessionSummary, getStintPack } from "@/lib/data";

interface StintsPageProps {
  params: Promise<{
    season: string;
    grandPrix: string;
    session: string;
  }>;
}

export async function generateStaticParams() {
  const index = await getSeasonIndex();
  const params = [];

  for (const season of index.seasons) {
    for (const grandPrix of season.grandsPrix) {
      for (const session of grandPrix.sessions) {
        const manifest = await getSessionManifest(session.season, session.grandPrixSlug, session.sessionSlug);
        if (manifest.stints) {
          params.push({
            season: String(session.season),
            grandPrix: session.grandPrixSlug,
            session: session.sessionSlug,
          });
        }
      }
    }
  }

  return params;
}

export async function generateMetadata({ params }: StintsPageProps) {
  const { season, grandPrix, session } = await params;
  try {
    const summary = await getSessionSummary(season, grandPrix, session);
    return {
      title: `${summary.grandPrix} · ${summary.session} stint story`,
      description: `Tyre windows and stint trends for the ${summary.grandPrix} ${summary.session}.`,
    };
  } catch {
    return {
      title: `${grandPrix} · ${session} stint story`,
    };
  }
}

export default async function StintsPage({ params }: StintsPageProps) {
  const { season, grandPrix, session } = await params;

  try {
    const [summary, stintPack] = await Promise.all([
      getSessionSummary(season, grandPrix, session),
      getStintPack(season, grandPrix, session),
    ]);

    return (
      <div className="page-stack">
        <section className="hero hero--compact">
          <p className="eyebrow">Stint story</p>
          <h1>
            {summary.grandPrix} · {summary.session}
          </h1>
          <p className="lead">
            Review tyre windows and stint trends for this session. The replay workspace also includes this read beside the moving race context.
          </p>
          <div className="hero-actions">
            <a className="button" href={`/replay/${season}/${grandPrix}/${session}`}>Back to replay</a>
          </div>
        </section>

        <StintStory stintPack={stintPack} />
      </div>
    );
  } catch {
    notFound();
  }
}
