"use client";

import { useMemo, useState } from "react";
import type { LatestManifest, SeasonIndex } from "@/lib/data";
import { getCircuitArt, getRaceWeekend, getSessionDate, formatSessionDate, formatWeekendRange } from "@/lib/art";

interface ReplayLibraryClientProps {
  aliasMode: boolean;
  latestManifest: LatestManifest;
  index: SeasonIndex;
}

const SESSION_PRIORITY: Record<string, number> = {
  Race: 0,
  Sprint: 1,
  "Sprint Qualifying": 2,
  Qualifying: 3,
  "Practice 3": 4,
  "Practice 2": 5,
  "Practice 1": 6,
};

function sortSessionNames<T extends { sessionName: string }>(sessions: T[]): T[] {
  return [...sessions].sort((left, right) => {
    const leftPriority = SESSION_PRIORITY[left.sessionName] ?? 99;
    const rightPriority = SESSION_PRIORITY[right.sessionName] ?? 99;
    return leftPriority - rightPriority;
  });
}

function buildCoverageLabel(sessions: Array<{ sessionName: string }>) {
  const present = new Set(sessions.map((session) => session.sessionName));
  const has = (name: string) => present.has(name);
  if (has("Race") && has("Qualifying") && (has("Sprint") || has("Sprint Qualifying"))) {
    return "Sprint weekend - full coverage";
  }
  if (has("Race") && has("Qualifying")) {
    return "Race + qualifying";
  }
  if (has("Race") && (has("Sprint") || has("Sprint Qualifying"))) {
    return "Race + sprint";
  }
  if (has("Race")) {
    return "Race only";
  }
  if (has("Qualifying")) {
    return "Qualifying only";
  }
  if (has("Sprint") || has("Sprint Qualifying")) {
    return "Sprint only";
  }
  return `${sessions.length} session${sessions.length === 1 ? "" : "s"}`;
}

function buildSessionMeta(season: number, sessionName: string) {
  if (season > 2025) {
    return `${season} ${sessionName.toLowerCase()} · exported OpenF1 replay pack`;
  }
  return `${sessionName} replay`;
}

function buildCoverageNote(label: string, names: string[]) {
  if (label.includes("full coverage")) {
    return `${names.join(", ")} all exported.`;
  }
  if (label === "Race + qualifying") {
    return "Race and qualifying sessions exported.";
  }
  if (label === "Race + sprint") {
    return "Race and sprint sessions exported.";
  }
  if (label === "Race only") {
    return "Race exported. Qualifying and sprint are not in this archive.";
  }
  if (label === "Qualifying only") {
    return "Qualifying exported. Race is not in this archive.";
  }
  if (label === "Sprint only") {
    return "Sprint exported. Other sessions are not in this archive.";
  }
  return "Coverage reflects the current exported OpenF1 archive.";
}

export function ReplayLibraryClient({ aliasMode, latestManifest, index }: ReplayLibraryClientProps) {
  const latestReplayHref = latestManifest.latest
    ? latestManifest.latest.path.replace(/^\/sessions\//, "/replay/")
    : null;
  const [search, setSearch] = useState("");
  const [order, setOrder] = useState<"newest" | "oldest">("newest");

  const filteredSeasons = useMemo(() => {
    const query = search.trim().toLowerCase();
    return index.seasons
      .map((season) => {
        const grandsPrix = season.grandsPrix.filter((grandPrix) => {
          if (!query) return true;
          return grandPrix.grandPrixName.toLowerCase().includes(query)
            || grandPrix.grandPrixSlug.toLowerCase().includes(query)
            || grandPrix.sessions.some((session) => session.sessionName.toLowerCase().includes(query));
        });
        const orderedGrandsPrix = order === "oldest" ? [...grandsPrix].reverse() : grandsPrix;
        return { ...season, grandsPrix: orderedGrandsPrix };
      })
      .filter((season) => season.grandsPrix.length > 0);
  }, [index, search, order]);

  const totalGrandsPrix = filteredSeasons.reduce((acc, season) => acc + season.grandsPrix.length, 0);

  return (
    <div className="page-stack">
      <section className="hero hero--compact replay-hero">
        <p className="eyebrow">Discover and replay</p>
        <h1>Find an exported F1 session and open the race workspace.</h1>
        <p className="lead">
          {aliasMode
            ? "Sessions has been folded into Discover and Replay. Choose a pack here, then stay inside the replay workspace for track map, leaderboard, telemetry, and strategy context."
            : "Choose a session pack, open the replay workspace, and keep the track map, leaderboard, telemetry, race-control context, and driver analysis in one place."}
        </p>
        <div className="discover-action-grid" aria-label="Discover shortcuts">
          {latestManifest.latest && latestReplayHref ? (
            <a className="discover-action-card" href={latestReplayHref}>
              <span>Featured Replay</span>
              <strong>{latestManifest.latest.grandPrixName}</strong>
              <small>{latestManifest.latest.sessionName} replay workspace</small>
            </a>
          ) : (
            <div className="discover-action-card">
              <span>Featured Replay</span>
              <strong>Unavailable</strong>
              <small>No current featured race pack. Browse verified historical sessions below.</small>
            </div>
          )}
          <a className="discover-action-card" href="/compare">
            <span>Lap Compare</span>
            <strong>Driver vs driver</strong>
            <small>Section deltas and telemetry traces per session.</small>
          </a>
          <a className="discover-action-card" href="/stints">
            <span>Stint Story</span>
            <strong>Tyre windows</strong>
            <small>Stint length and pace evolution across the race.</small>
          </a>
          <a className="discover-action-card" href="/race-desk">
            <span>Race Desk</span>
            <strong>Historical simulation</strong>
            <small>Review the featured static pack as a control-room simulation.</small>
          </a>
          <a className="discover-action-card" href="/cars/current-spec">
            <span>Modelview</span>
            <strong>Current-spec cars</strong>
            <small>Inspect local GLB race models and focus overlays.</small>
          </a>
        </div>
        <div className="replay-meta-row">
          {latestManifest.latest ? (
            <>
              <span className="replay-meta-pill">{latestManifest.latest.season} season pack</span>
              <span className="replay-meta-pill">
                {latestManifest.latest.grandPrixName} · {latestManifest.latest.sessionName}
              </span>
              <span className="replay-meta-pill">Featured selection · browse all seasons below</span>
            </>
          ) : (
            <span className="replay-meta-pill">Historical library · no current featured race pack</span>
          )}
        </div>
      </section>

      <section className="replay-library-toolbar">
        <input
          type="search"
          className="replay-library-search"
          placeholder="Search by Grand Prix, circuit, or session"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label="Search the replay library"
        />
        <div className="replay-library-sort" role="tablist" aria-label="Sort order">
          <button
            type="button"
            className={`replay-library-sort__button${order === "newest" ? " replay-library-sort__button--active" : ""}`}
            onClick={() => setOrder("newest")}
          >
            Newest first
          </button>
          <button
            type="button"
            className={`replay-library-sort__button${order === "oldest" ? " replay-library-sort__button--active" : ""}`}
            onClick={() => setOrder("oldest")}
          >
            Oldest first
          </button>
        </div>
        <span className="replay-library-count">{totalGrandsPrix} grand prix</span>
      </section>

      <div className="replay-index-grid">
        {filteredSeasons.map((season) => (
          <section className="panel" key={season.season}>
            <div className="section-header">
              <div>
                <p className="eyebrow">Season</p>
                <h2>{season.season}</h2>
              </div>
            </div>

            <div className="replay-session-grid">
              {season.grandsPrix.map((grandPrix) => {
                const sortedSessions = sortSessionNames(grandPrix.sessions);
                const coverageLabel = buildCoverageLabel(grandPrix.sessions);
                const sessionNames = sortedSessions.map((session) => session.sessionName);
                const coverageNote = buildCoverageNote(coverageLabel, sessionNames);
                const sessionCount = grandPrix.sessions.length;
                const trackId = grandPrix.sessions[0]?.trackId ?? grandPrix.grandPrixSlug;
                const circuitArt = getCircuitArt(trackId);
                const weekend = getRaceWeekend(season.season, grandPrix.grandPrixSlug);
                const weekendRange = formatWeekendRange(weekend);
                const raceDate = formatSessionDate(weekend?.sessions.race ?? null);
                return (
                  <article className="panel panel--nested replay-session-cluster" key={grandPrix.grandPrixSlug}>
                    {circuitArt.map ? (
                      <figure className="replay-session-cluster__art" aria-hidden="true">
                        <img src={circuitArt.map} alt="" loading="lazy" />
                      </figure>
                    ) : null}
                    <div>
                      <p className="eyebrow">{coverageLabel}</p>
                      <h3>
                        {grandPrix.grandPrixName}
                        <span className="replay-session-cluster__badge">{sessionCount} session{sessionCount === 1 ? "" : "s"}</span>
                      </h3>
                      {weekendRange ? (
                        <p className="replay-session-cluster__weekend">
                          <span className="replay-session-cluster__weekend-tag">Race weekend</span>
                          <span>{weekendRange}</span>
                          {raceDate ? <em>· Race {raceDate}</em> : null}
                        </p>
                      ) : null}
                      {circuitArt.circuit.lengthKm > 0 ? (
                        <p className="replay-session-cluster__circuit">
                          {circuitArt.circuit.displayName} · {circuitArt.circuit.lengthKm.toFixed(3)} km · {circuitArt.circuit.corners} corners
                        </p>
                      ) : null}
                      <p className="replay-session-cluster__note">{coverageNote}</p>
                    </div>
                    <div className="replay-session-links">
                      {sortedSessions.map((session) => {
                        const sessionDate = formatSessionDate(getSessionDate(session.season, session.grandPrixSlug, session.sessionSlug));
                        return (
                          <a
                            className="replay-session-link"
                            key={session.sessionSlug}
                            href={`/replay/${session.season}/${session.grandPrixSlug}/${session.sessionSlug}`}
                          >
                            <strong>{session.sessionName}</strong>
                            <span>{buildSessionMeta(session.season, session.sessionName)}</span>
                            {sessionDate ? <span className="replay-session-link__date">{sessionDate}</span> : null}
                          </a>
                        );
                      })}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ))}

        {!filteredSeasons.length ? (
          <section className="panel">
            <p>No grand prix matched <strong>{search}</strong>. Clear the search to see the full library.</p>
          </section>
        ) : null}
      </div>
    </div>
  );
}
