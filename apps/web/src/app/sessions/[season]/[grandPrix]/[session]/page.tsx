import { redirect } from "next/navigation";
import { getSeasonIndex } from "@/lib/data";

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
  redirect(`/replay/${season}/${grandPrix}/${session}`);
}
