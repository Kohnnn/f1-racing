interface Env {
  ASSET_ORIGIN: string;
}

const CACHE_SECONDS = 300;

function jsonResponse(payload: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(payload, null, 2), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": `public, max-age=${CACHE_SECONDS}`,
      ...init.headers,
    },
  });
}

async function fetchJson(env: Env, path: string) {
  const response = await fetch(new URL(path, env.ASSET_ORIGIN).toString(), {
    cf: {
      cacheEverything: true,
      cacheTtl: CACHE_SECONDS,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${path}: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

function matchesQuery(query: string, values: string[]) {
  const normalized = query.toLowerCase();
  return values.some((value) => value.toLowerCase().includes(normalized));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/latest") {
      const payload = await fetchJson(env, "/data/manifests/latest.json");
      return jsonResponse(payload);
    }

    if (url.pathname === "/api/search") {
      const query = (url.searchParams.get("q") || "").trim();
      const seasonIndex = await fetchJson(env, "/data/manifests/seasons.json") as {
        seasons: Array<{
          season: number;
          grandsPrix: Array<{
            grandPrixSlug: string;
            grandPrixName: string;
            sessions: Array<{
              sessionName: string;
              path: string;
              trackId: string;
            }>;
          }>;
        }>;
      };

      const matches = seasonIndex.seasons.flatMap((season) =>
        season.grandsPrix.flatMap((grandPrix) =>
          grandPrix.sessions
            .filter((session) =>
              !query ||
              matchesQuery(query, [String(season.season), grandPrix.grandPrixName, grandPrix.grandPrixSlug, session.sessionName, session.trackId]),
            )
            .map((session) => ({
              season: season.season,
              grandPrix: grandPrix.grandPrixName,
              session: session.sessionName,
              trackId: session.trackId,
              path: session.path,
            })),
        ),
      );

      return jsonResponse({
        query,
        count: matches.length,
        matches,
      });
    }

    if (url.pathname === "/api/health") {
      return jsonResponse({ ok: true, service: "metadata-api" }, { status: 200 });
    }

    return jsonResponse({ error: "Not found" }, { status: 404 });
  },
};
