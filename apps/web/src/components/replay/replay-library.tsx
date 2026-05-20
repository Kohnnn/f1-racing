import { getLatestManifest, getSeasonIndex } from "@/lib/data";
import { ReplayLibraryClient } from "./replay-library-client";

interface ReplayLibraryProps {
  aliasMode?: boolean;
}

export async function ReplayLibrary({ aliasMode = false }: ReplayLibraryProps) {
  const [latestManifest, index] = await Promise.all([
    getLatestManifest(),
    getSeasonIndex(),
  ]);

  return <ReplayLibraryClient aliasMode={aliasMode} latestManifest={latestManifest} index={index} />;
}
