import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fetchMeetings, fetchSessions } from "./openf1-client.mjs";
import { slugify } from "../../normalize/src/normalize-session.mjs";

const root = path.resolve(process.cwd());
const dataRoot = path.join(root, "data");
const publicRoot = path.join(root, "apps", "web", "public", "data");
const year = 2025;

function sessionRank(sessionName) {
  const order = {
    "Practice 1": 1,
    "Practice 2": 2,
    "Practice 3": 3,
    Qualifying: 4,
    "Sprint Qualifying": 5,
    Sprint: 6,
    Race: 7,
    Testing: 0,
  };
  return order[sessionName] ?? 99;
}

function mapMeetingByKey(meetings) {
  const map = new Map();
  meetings.forEach((meeting) => {
    map.set(Number(meeting.meeting_key), meeting);
  });
  return map;
}

function buildManifest(meetings, sessions) {
  const meetingsByKey = mapMeetingByKey(meetings);
  const grouped = new Map();

  sessions
    .slice()
    .sort((left, right) => {
      const leftMeeting = meetingsByKey.get(Number(left.meeting_key));
      const rightMeeting = meetingsByKey.get(Number(right.meeting_key));
      const leftDate = leftMeeting?.date_start || left.date_start || "";
      const rightDate = rightMeeting?.date_start || right.date_start || "";
      if (leftDate !== rightDate) {
        return leftDate.localeCompare(rightDate);
      }
      return sessionRank(left.session_name) - sessionRank(right.session_name);
    })
    .forEach((session) => {
      const meeting = meetingsByKey.get(Number(session.meeting_key));
      const grandPrixName = meeting?.meeting_name || session.country_name || session.location || "Unknown Grand Prix";
      const grandPrixSlug = slugify(grandPrixName);
      const packSummaryPath = path.join(
        dataRoot,
        "packs",
        "seasons",
        String(year),
        grandPrixSlug,
        slugify(session.session_name || "session"),
        "summary.json",
      );
      const ref = {
        season: year,
        grandPrixSlug,
        sessionSlug: slugify(session.session_name || "session"),
        grandPrixName,
        sessionName: session.session_name || "Session",
        sessionKey: Number(session.session_key),
        trackId: slugify(session.circuit_short_name || meeting?.circuit_short_name || session.location || grandPrixName),
        path: `/sessions/${year}/${grandPrixSlug}/${slugify(session.session_name || "session")}`,
        startDate: session.date_start,
        endDate: session.date_end,
        countryName: session.country_name || meeting?.country_name || "",
        location: session.location || meeting?.location || "",
        source: "openf1",
        buildReady: false,
        _packSummaryPath: packSummaryPath,
      };

      if (!grouped.has(grandPrixSlug)) {
        grouped.set(grandPrixSlug, {
          grandPrixSlug,
          grandPrixName,
          countryName: meeting?.country_name || session.country_name || "",
          circuitShortName: session.circuit_short_name || meeting?.circuit_short_name || "",
          meetingKey: Number(session.meeting_key),
          sessions: [],
        });
      }

      grouped.get(grandPrixSlug).sessions.push(ref);
    });

  const grandsPrix = Array.from(grouped.values());
  const latestSession = grandsPrix.at(-1)?.sessions.at(-1) ?? null;

  return {
    generatedAt: new Date().toISOString(),
    source: "openf1",
    year,
    grandsPrix,
    latest: latestSession,
  };
}

async function markBuildReady(manifest) {
  for (const grandPrix of manifest.grandsPrix) {
    for (const session of grandPrix.sessions) {
      try {
        await access(session._packSummaryPath);
        session.buildReady = true;
      } catch {
        session.buildReady = false;
      }
      delete session._packSummaryPath;
    }
  }

  if (manifest.latest) {
    const latest = manifest.grandsPrix
      .flatMap((grandPrix) => grandPrix.sessions)
      .find((session) => session.sessionKey === manifest.latest.sessionKey);
    if (latest) {
      manifest.latest = latest;
    }
  }

  return manifest;
}

async function writeJson(relativePath, payload) {
  const targets = [path.join(dataRoot, relativePath), path.join(publicRoot, relativePath)];
  await Promise.all(
    targets.map(async (filePath) => {
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
    })
  );
}

async function main() {
  const [meetings, sessions] = await Promise.all([
    fetchMeetings({ year }),
    fetchSessions({ year }),
  ]);

  const manifest = await markBuildReady(buildManifest(meetings, sessions));
  await writeJson(path.join("manifests", "openf1-2025-season.json"), manifest);
  process.stdout.write(`OpenF1 2025 season manifest written with ${manifest.grandsPrix.length} grands prix.\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
