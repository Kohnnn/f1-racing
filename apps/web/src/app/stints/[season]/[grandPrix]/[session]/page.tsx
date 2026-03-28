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
            This route turns static stint packs into a compact degradation and tyre-window story. It is the bridge
            between the raw telemetry compare view and the broader strategy product surface.
          </p>
        </section>

        <StintStory stintPack={stintPack} />
      </div>
    );
  } catch {
    notFound();
  }
}
