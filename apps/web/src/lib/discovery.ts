import { getSeasonIndex, getSessionManifest } from "@/lib/data";

/**
 * Discovery helpers for the `/compare` and `/stints` index surfaces.
 *
 * The deep telemetry routes (`/compare/.../[left]/[right]` and
 * `/stints/.../[session]`) are fully built but were previously only reachable
 * from inside a replay/session workspace. These helpers scan the season index
 * and per-session manifests at build time so the index pages can list every
 * session that actually ships the relevant pack — and nothing that would
 * `notFound()`.
 */

export interface CompareSessionEntry {
  season: number;
  grandPrixSlug: string;
  grandPrixName: string;
  sessionSlug: string;
  sessionName: string;
  trackId: string;
  pairs: Array<{ left: string; right: string; key: string }>;
}

export interface StintSessionEntry {
  season: number;
  grandPrixSlug: string;
  grandPrixName: string;
  sessionSlug: string;
  sessionName: string;
  trackId: string;
}

export interface DiscoverySeason<T> {
  season: number;
  sessions: T[];
}

function splitPairKey(key: string): { left: string; right: string; key: string } {
  const [left, right] = key.split("-");
  return { left: (left ?? "").toUpperCase(), right: (right ?? "").toUpperCase(), key };
}

/**
 * Collect every session that publishes at least one compare pack, grouped by
 * season (newest first) and ordered by grand prix within each season.
 */
export async function getCompareDiscovery(): Promise<Array<DiscoverySeason<CompareSessionEntry>>> {
  const index = await getSeasonIndex();
  const bySeason = new Map<number, CompareSessionEntry[]>();

  for (const season of index.seasons) {
    for (const grandPrix of season.grandsPrix) {
      for (const session of grandPrix.sessions) {
        let manifest;
        try {
          manifest = await getSessionManifest(session.season, session.grandPrixSlug, session.sessionSlug);
        } catch {
          continue;
        }
        const keys = Object.keys(manifest.compare ?? {});
        if (keys.length === 0) continue;
        const entry: CompareSessionEntry = {
          season: session.season,
          grandPrixSlug: session.grandPrixSlug,
          grandPrixName: session.grandPrixName,
          sessionSlug: session.sessionSlug,
          sessionName: session.sessionName,
          trackId: session.trackId,
          pairs: keys.map(splitPairKey),
        };
        const list = bySeason.get(session.season) ?? [];
        list.push(entry);
        bySeason.set(session.season, list);
      }
    }
  }

  return toSortedSeasons(bySeason);
}

/**
 * Collect every session that publishes a stint pack, grouped by season.
 */
export async function getStintDiscovery(): Promise<Array<DiscoverySeason<StintSessionEntry>>> {
  const index = await getSeasonIndex();
  const bySeason = new Map<number, StintSessionEntry[]>();

  for (const season of index.seasons) {
    for (const grandPrix of season.grandsPrix) {
      for (const session of grandPrix.sessions) {
        let manifest;
        try {
          manifest = await getSessionManifest(session.season, session.grandPrixSlug, session.sessionSlug);
        } catch {
          continue;
        }
        if (!manifest.stints) continue;
        const entry: StintSessionEntry = {
          season: session.season,
          grandPrixSlug: session.grandPrixSlug,
          grandPrixName: session.grandPrixName,
          sessionSlug: session.sessionSlug,
          sessionName: session.sessionName,
          trackId: session.trackId,
        };
        const list = bySeason.get(session.season) ?? [];
        list.push(entry);
        bySeason.set(session.season, list);
      }
    }
  }

  return toSortedSeasons(bySeason);
}

function toSortedSeasons<T>(bySeason: Map<number, T[]>): Array<DiscoverySeason<T>> {
  return [...bySeason.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([season, sessions]) => ({ season, sessions }));
}
