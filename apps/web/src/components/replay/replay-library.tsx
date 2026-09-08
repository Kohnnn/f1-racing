import { getLatestManifest, getSeasonIndex } from "@/lib/data";
import { getObservationAvailability } from "@/lib/observation-availability-server";
import { ReplayLibraryClient } from "./replay-library-client";

interface ReplayLibraryProps {
  aliasMode?: boolean;
}

export async function ReplayLibrary({ aliasMode = false }: ReplayLibraryProps) {
  const [latestManifest, index] = await Promise.all([
    getLatestManifest(),
    getSeasonIndex(),
  ]);

  const availability = Object.fromEntries(await Promise.all(index.seasons.flatMap((season) =>
    season.grandsPrix.flatMap((grandPrix) => grandPrix.sessions.map(async (session) => [
      session.path,
      await getObservationAvailability(session.season, session.grandPrixSlug, session.sessionSlug),
    ] as const))
  )));

  return <ReplayLibraryClient aliasMode={aliasMode} latestManifest={latestManifest} index={index} availability={availability} />;
}
