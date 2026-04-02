import { notFound } from "next/navigation";
import { getReplayPack, getSeasonIndex, getSessionManifest } from "@/lib/data";
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
    const [manifest, replay] = await Promise.all([
      getSessionManifest(season, grandPrix, session),
      getReplayPack(season, grandPrix, session),
    ]);

    return <ReplayView replay={replay} />;
  } catch {
    notFound();
  }
}
