export function slugify(value) {
  return String(value)
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function normalizeTimestamp(value, label) {
  const match = typeof value === "string"
    ? value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/)
    : null;
  if (!match) throw new Error(`${label} requires an RFC 3339 timestamp with an explicit UTC offset.`);
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, offset] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const offsetParts = offset === "Z" ? null : offset.slice(1).split(":").map(Number);
  const daysInMonth = month >= 1 && month <= 12 ? new Date(Date.UTC(year, month, 0)).getUTCDate() : 0;
  if (day < 1 || day > daysInMonth || hour > 23 || minute > 59 || second > 59
    || (offsetParts && (offsetParts[0] > 23 || offsetParts[1] > 59)) || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${label} requires a valid calendar timestamp.`);
  }
  return new Date(value).toISOString();
}

export function generationTimestamp(value, now = new Date()) {
  return value === undefined ? now.toISOString() : normalizeTimestamp(value, "Generation time");
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
