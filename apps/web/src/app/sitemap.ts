import type { MetadataRoute } from "next";
import { getSeasonIndex, getSessionManifest } from "@/lib/data";
import { learnModules } from "./learn/modules";

export const dynamic = "force-static";

const BASE_URL = "https://f1-demo.netlify.app";

const STATIC_ROUTES = [
  "/",
  "/race-desk",
  "/replay",
  "/compare",
  "/stints",
  "/learn",
  "/cars/current-spec",
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = STATIC_ROUTES.map((route) => ({
    url: `${BASE_URL}${route}`,
  }));

  for (const module of learnModules) {
    entries.push({ url: `${BASE_URL}/learn/${module.slug}` });
  }

  const index = await getSeasonIndex();

  for (const season of index.seasons) {
    for (const grandPrix of season.grandsPrix) {
      for (const session of grandPrix.sessions) {
        const sessionPath = `${session.season}/${session.grandPrixSlug}/${session.sessionSlug}`;
        entries.push({ url: `${BASE_URL}/replay/${sessionPath}` });

        const manifest = await getSessionManifest(session.season, session.grandPrixSlug, session.sessionSlug);
        if (manifest.stints) {
          entries.push({ url: `${BASE_URL}/stints/${sessionPath}` });
        }

        for (const key of Object.keys(manifest.compare ?? {})) {
          const [left, right] = key.split("-");
          entries.push({ url: `${BASE_URL}/compare/${sessionPath}/${left}/${right}` });
        }
      }
    }
  }

  return entries;
}
