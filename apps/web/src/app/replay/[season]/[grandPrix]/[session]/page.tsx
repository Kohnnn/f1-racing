import { notFound } from "next/navigation";
import { getComparePack, getReplayPack, getSeasonIndex, getSessionManifest, getSessionSummary, getStintPack } from "@/lib/data";
import { ReplayView } from "@/components/replay/ReplayView";

interface ReplayPageProps {
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
      grandPrix.sessions.map((s) => ({
        season: String(s.season),
        grandPrix: s.grandPrixSlug,
        session: s.sessionSlug,
      }))
    )
  );
}

export default async function ReplayPage({ params }: ReplayPageProps) {
  const { season, grandPrix, session } = await params;

  try {
    const [replay, manifest, summary] = await Promise.all([
      getReplayPack(season, grandPrix, session),
      getSessionManifest(season, grandPrix, session),
      getSessionSummary(season, grandPrix, session),
    ]);

    const compareKey = Object.values(manifest.compare ?? {})[0]?.replace(/^compare\//, "").replace(/\.json$/, "") ?? null;
    const [compare, stintPack] = await Promise.all([
      compareKey ? getComparePack(season, grandPrix, session, compareKey).catch(() => null) : Promise.resolve(null),
      manifest.stints ? getStintPack(season, grandPrix, session).catch(() => null) : Promise.resolve(null),
    ]);

    return (
      <ReplayView
        replay={replay}
        manifest={manifest}
        summary={summary}
        compare={compare}
        route={{ season, grandPrix, session }}
        stintPack={stintPack}
      />
    );
  } catch {
    notFound();
  }
}
