export function slugify(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function normalizeSessionRecord(record) {
  return {
    season: Number(record.year),
    grandPrixSlug: slugify(record.meeting_name || record.country_name || "unknown-grand-prix"),
    sessionSlug: slugify(record.session_name || "session"),
    grandPrixName: record.meeting_name || record.country_name || "Unknown Grand Prix",
    sessionName: record.session_name || "Session",
    sessionKey: Number(record.session_key),
    trackId: slugify(record.circuit_short_name || record.location || "unknown-track"),
    path: `/sessions/${record.year}/${slugify(record.meeting_name || record.country_name || "unknown-grand-prix")}/${slugify(record.session_name || "session")}`,
  };
}
