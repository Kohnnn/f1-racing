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

  const entries = [];
  for (const season of index.seasons) {
    for (const grandPrix of season.grandsPrix) {
      for (const session of grandPrix.sessions) {
        entries.push([session.path, await getObservationAvailability(session.season, session.grandPrixSlug, session.sessionSlug)] as const);
      }
    }
  }
  const availability = Object.fromEntries(entries);

  return <ReplayLibraryClient aliasMode={aliasMode} latestManifest={latestManifest} index={index} availability={availability} />;
}
