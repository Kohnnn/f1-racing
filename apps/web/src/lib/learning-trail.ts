export const LEARNING_TRAIL_STORAGE_KEY = "f1-racing.learning-trail.v1";
export const LEARNING_TRAIL_CHANGE_EVENT = "f1-racing-learning-trail-change";
export const LEGACY_LEARN_PROGRESS_KEY = "f1-racing.learn.progress.v1";
export const LEARNING_TRAIL_MAX_BYTES = 8 * 1024;
export const LEARNING_TRAIL_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export const PILOT_BRIEF_IDS = ["monza-braking", "mexico-aero", "zandvoort-strategy-tyres"] as const;
export const LEARN_MODULE_IDS = ["car", "aero", "tyres", "braking", "setup", "strategy"] as const;
export const MODELVIEW_FOCUS_IDS = ["front-wing", "floor", "rear-wing", "brakes", "tyres"] as const;

const LEARN_ANCHORS = ["check"] as const;
const PILOT_REPLAY_PATHS = [
  "/replay/2025/italian-grand-prix/qualifying",
  "/replay/2025/mexico-city-grand-prix/race",
  "/replay/2025/dutch-grand-prix/race",
] as const;
const MODELVIEW_CONSTRUCTORS_BY_SEASON = {
  "2025": ["red-bull", "mclaren", "ferrari", "mercedes", "aston-martin", "alpine"],
  "2026": ["fia-2026"],
} as const;
const REPLAY_TABS = ["telemetry", "compare", "stints", "strategy", "pitcycles", "track", "racecontrol", "waterfall", "battle", "corners", "sectors"] as const;
const TRAIL_KEYS = new Set(["updatedAt", "briefId", "learn", "modelviewHref", "replayHref"]);
const DOCUMENT_KEYS = new Set(["schemaVersion", "updatedAt", "trail", "modules"]);
const MODULE_STATE_KEYS = new Set(["readAt", "completedAt"]);
const LEARN_KEYS = new Set(["slug", "anchor"]);

export type PilotBriefId = (typeof PILOT_BRIEF_IDS)[number];
export type LearnModuleId = (typeof LEARN_MODULE_IDS)[number];

export interface LearningTrailInput {
  briefId: PilotBriefId;
  learn: { slug: LearnModuleId; anchor?: (typeof LEARN_ANCHORS)[number] };
  modelviewHref?: string;
  replayHref?: string;
}

export interface LearningTrailSnapshot extends LearningTrailInput {
  updatedAt: string;
}

export interface LearningModuleProgress {
  readAt: string;
  completedAt?: string;
}

export interface LearningTrailDocument {
  schemaVersion: 1;
  updatedAt: string;
  trail?: LearningTrailSnapshot;
  modules: Partial<Record<LearnModuleId, LearningModuleProgress>>;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function getBrowserStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: Set<string>) {
  return Object.keys(value).every((key) => allowed.has(key));
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

function isAllowed<T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

function hasDuplicateParams(url: URL) {
  return Array.from(new Set(url.searchParams.keys())).some((key) => url.searchParams.getAll(key).length !== 1);
}

export function validateModelviewHref(value: unknown): value is string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return false;
  try {
    const url = new URL(value, "https://local.invalid");
    if (url.origin !== "https://local.invalid" || url.pathname !== "/cars/current-spec" || url.hash || hasDuplicateParams(url)) return false;
    if (Array.from(url.searchParams.keys()).some((key) => !["season", "constructor", "focus"].includes(key))) return false;
    const season = url.searchParams.get("season");
    const constructor = url.searchParams.get("constructor");
    const focus = url.searchParams.get("focus");
    if ((season === null) !== (constructor === null)) return false;
    if (season !== null) {
      const constructors = MODELVIEW_CONSTRUCTORS_BY_SEASON[season as keyof typeof MODELVIEW_CONSTRUCTORS_BY_SEASON];
      if (!constructors || !(constructors as readonly string[]).includes(constructor ?? "")) return false;
    }
    return focus === null || isAllowed(MODELVIEW_FOCUS_IDS, focus);
  } catch {
    return false;
  }
}

export function validateReplayHref(value: unknown): value is string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return false;
  try {
    const url = new URL(value, "https://local.invalid");
    if (url.origin !== "https://local.invalid" || !isAllowed(PILOT_REPLAY_PATHS, url.pathname) || hasDuplicateParams(url)) return false;
    if (url.hash && url.hash !== "#analysis") return false;
    if (Array.from(url.searchParams.keys()).some((key) => !["t", "tab", "drivers", "focus"].includes(key))) return false;
    const time = url.searchParams.get("t");
    const tab = url.searchParams.get("tab");
    const drivers = url.searchParams.get("drivers");
    const focus = url.searchParams.get("focus");
    if (time !== null && (time.trim() === "" || !Number.isFinite(Number(time)) || Number(time) < 0)) return false;
    if (tab !== null && !isAllowed(REPLAY_TABS, tab)) return false;
    if (drivers !== null) {
      const codes = drivers.split(",");
      if (codes.length < 1 || codes.length > 4 || new Set(codes).size !== codes.length || codes.some((code) => !/^[A-Z0-9]{2,4}$/.test(code))) return false;
    }
    return focus === null || isAllowed(MODELVIEW_FOCUS_IDS, focus);
  } catch {
    return false;
  }
}

function parseModuleState(value: unknown, now: number): LearningModuleProgress | null {
  if (!isRecord(value) || !hasOnlyKeys(value, MODULE_STATE_KEYS) || !isTimestamp(value.readAt) || Date.parse(value.readAt) > now) return null;
  if (value.completedAt !== undefined && (!isTimestamp(value.completedAt) || Date.parse(value.completedAt) > now || Date.parse(value.completedAt) < Date.parse(value.readAt))) return null;
  return { readAt: value.readAt, ...(value.completedAt ? { completedAt: value.completedAt } : {}) };
}

function parseTrail(value: unknown, now: number): LearningTrailSnapshot | null {
  if (!isRecord(value) || !hasOnlyKeys(value, TRAIL_KEYS) || !isTimestamp(value.updatedAt)) return null;
  if (Date.parse(value.updatedAt) > now || now - Date.parse(value.updatedAt) >= LEARNING_TRAIL_TTL_MS) return null;
  if (!isAllowed(PILOT_BRIEF_IDS, value.briefId) || !isRecord(value.learn) || !hasOnlyKeys(value.learn, LEARN_KEYS)) return null;
  if (!isAllowed(LEARN_MODULE_IDS, value.learn.slug)) return null;
  if (value.learn.anchor !== undefined && !isAllowed(LEARN_ANCHORS, value.learn.anchor)) return null;
  if (value.modelviewHref !== undefined && !validateModelviewHref(value.modelviewHref)) return null;
  if (value.replayHref !== undefined && !validateReplayHref(value.replayHref)) return null;
  return {
    updatedAt: value.updatedAt,
    briefId: value.briefId,
    learn: { slug: value.learn.slug, ...(value.learn.anchor ? { anchor: value.learn.anchor } : {}) },
    ...(value.modelviewHref ? { modelviewHref: value.modelviewHref } : {}),
    ...(value.replayHref ? { replayHref: value.replayHref } : {}),
  };
}

export function parseLearningTrail(raw: string | null, now = Date.now()): LearningTrailDocument | null {
  if (raw === null || new TextEncoder().encode(raw).byteLength > LEARNING_TRAIL_MAX_BYTES) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || !hasOnlyKeys(value, DOCUMENT_KEYS) || value.schemaVersion !== 1 || !isTimestamp(value.updatedAt) || Date.parse(value.updatedAt) > now || !isRecord(value.modules)) return null;
    const modules: LearningTrailDocument["modules"] = {};
    let latestChild = 0;
    for (const [key, moduleValue] of Object.entries(value.modules)) {
      if (!isAllowed(LEARN_MODULE_IDS, key)) continue;
      const parsed = parseModuleState(moduleValue, now);
      if (!parsed) return null;
      latestChild = Math.max(latestChild, Date.parse(parsed.readAt), Date.parse(parsed.completedAt ?? parsed.readAt));
      modules[key] = parsed;
    }
    const trail = value.trail === undefined ? undefined : parseTrail(value.trail, now);
    if (trail) latestChild = Math.max(latestChild, Date.parse(trail.updatedAt));
    if (Date.parse(value.updatedAt) < latestChild) return null;
    return { schemaVersion: 1, updatedAt: value.updatedAt, ...(trail ? { trail } : {}), modules };
  } catch {
    return null;
  }
}

export function serializeLearningTrail(value: LearningTrailDocument, now = Date.now()): string | null {
  const parsed = parseLearningTrail(JSON.stringify(value), now);
  if (!parsed) return null;
  const raw = JSON.stringify(parsed);
  return new TextEncoder().encode(raw).byteLength <= LEARNING_TRAIL_MAX_BYTES ? raw : null;
}

function moduleTimestamp(value: LearningModuleProgress) {
  return Date.parse(value.completedAt ?? value.readAt);
}

export function mergeLearningTrails(current: LearningTrailDocument, incoming: LearningTrailDocument): LearningTrailDocument {
  if (Date.parse(incoming.updatedAt) === Date.parse(current.updatedAt)) return current;
  const modules: LearningTrailDocument["modules"] = {};
  for (const moduleId of LEARN_MODULE_IDS) {
    const previous = current.modules[moduleId];
    const next = incoming.modules[moduleId];
    if (previous && next) modules[moduleId] = moduleTimestamp(next) > moduleTimestamp(previous) ? next : previous;
    else if (previous && Date.parse(incoming.updatedAt) <= moduleTimestamp(previous)) modules[moduleId] = previous;
    else if (next && Date.parse(current.updatedAt) <= moduleTimestamp(next)) modules[moduleId] = next;
  }
  let trail: LearningTrailSnapshot | undefined;
  if (current.trail && incoming.trail) trail = Date.parse(incoming.trail.updatedAt) > Date.parse(current.trail.updatedAt) ? incoming.trail : current.trail;
  else if (current.trail && Date.parse(incoming.updatedAt) <= Date.parse(current.trail.updatedAt)) trail = current.trail;
  else if (incoming.trail && Date.parse(current.updatedAt) <= Date.parse(incoming.trail.updatedAt)) trail = incoming.trail;
  return {
    schemaVersion: 1,
    updatedAt: Date.parse(incoming.updatedAt) > Date.parse(current.updatedAt) ? incoming.updatedAt : current.updatedAt,
    ...(trail ? { trail } : {}),
    modules,
  };
}

export function markModuleRead(document: LearningTrailDocument, moduleId: LearnModuleId, read: boolean, at: string): LearningTrailDocument | null {
  if (!isTimestamp(at) || !isAllowed(LEARN_MODULE_IDS, moduleId) || Date.parse(at) < Date.parse(document.updatedAt)) return null;
  const modules = { ...document.modules };
  if (read) modules[moduleId] = { readAt: at };
  else delete modules[moduleId];
  return { ...document, updatedAt: at, modules };
}

export function recordModuleCompletion(document: LearningTrailDocument, moduleId: LearnModuleId, successful: boolean, at: string): LearningTrailDocument | null {
  if (!successful) return document;
  if (!isTimestamp(at) || !isAllowed(LEARN_MODULE_IDS, moduleId) || Date.parse(at) < Date.parse(document.updatedAt)) return null;
  const previous = document.modules[moduleId];
  const trail = document.trail?.learn.slug === moduleId
    ? { ...document.trail, updatedAt: at, learn: { slug: moduleId, anchor: "check" as const } }
    : document.trail;
  return {
    ...document,
    updatedAt: at,
    ...(trail ? { trail } : {}),
    modules: {
      ...document.modules,
      [moduleId]: { readAt: previous?.readAt ?? at, completedAt: at },
    },
  };
}

export function recordApprovedBrief(document: LearningTrailDocument, input: LearningTrailInput, at: string): LearningTrailDocument | null {
  const candidate = { ...document, updatedAt: at, trail: { ...input, updatedAt: at } };
  return parseLearningTrail(JSON.stringify(candidate), Date.parse(at));
}

export function migrateLegacyProgress(raw: string | null, migrationTime: string): LearningTrailDocument | null {
  if (!isTimestamp(migrationTime) || raw === null || new TextEncoder().encode(raw).byteLength > LEARNING_TRAIL_MAX_BYTES) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value)) return null;
    const modules: LearningTrailDocument["modules"] = {};
    for (const moduleId of LEARN_MODULE_IDS) if (value[moduleId] === true) modules[moduleId] = { readAt: migrationTime };
    return { schemaVersion: 1, updatedAt: migrationTime, modules };
  } catch {
    return null;
  }
}

function isUnknownVersion(raw: string) {
  try {
    const value: unknown = JSON.parse(raw);
    return isRecord(value) && Number.isInteger(value.schemaVersion) && value.schemaVersion !== 1;
  } catch {
    return false;
  }
}

export function readLearningTrail(storage: StorageLike, now = new Date()): LearningTrailDocument | null {
  try {
    const raw = storage.getItem(LEARNING_TRAIL_STORAGE_KEY);
    if (raw !== null) {
      const parsed = parseLearningTrail(raw, now.getTime());
      if (!parsed) {
        if (!isUnknownVersion(raw)) storage.removeItem(LEARNING_TRAIL_STORAGE_KEY);
        return null;
      }
      const normalized = serializeLearningTrail(parsed, now.getTime());
      if (normalized && normalized !== raw) storage.setItem(LEARNING_TRAIL_STORAGE_KEY, normalized);
      return parsed;
    }
    const migrated = migrateLegacyProgress(storage.getItem(LEGACY_LEARN_PROGRESS_KEY), now.toISOString());
    if (!migrated) return null;
    const serialized = serializeLearningTrail(migrated, now.getTime());
    if (!serialized) return null;
    storage.setItem(LEARNING_TRAIL_STORAGE_KEY, serialized);
    storage.removeItem(LEGACY_LEARN_PROGRESS_KEY);
    return migrated;
  } catch {
    return null;
  }
}

function emptyDocument(at: string): LearningTrailDocument {
  return { schemaVersion: 1, updatedAt: at, modules: {} };
}

export function writeLearningTrail(storage: StorageLike, incoming: LearningTrailDocument, now = new Date()): LearningTrailDocument | null {
  try {
    const currentRaw = storage.getItem(LEARNING_TRAIL_STORAGE_KEY);
    if (currentRaw !== null && isUnknownVersion(currentRaw)) return null;
    const current = parseLearningTrail(currentRaw, now.getTime());
    const writeTime = new Date(Math.max(now.getTime(), current ? Date.parse(current.updatedAt) + 1 : now.getTime()));
    const validated = parseLearningTrail(JSON.stringify(incoming), writeTime.getTime());
    if (!validated) return null;
    const stamped = { ...validated, updatedAt: writeTime.toISOString() };
    if (stamped.trail && Date.parse(stamped.trail.updatedAt) === Date.parse(validated.updatedAt)) stamped.trail = { ...stamped.trail, updatedAt: writeTime.toISOString() };
    const merged = current ? mergeLearningTrails(current, stamped) : stamped;
    const serialized = serializeLearningTrail(merged, writeTime.getTime());
    if (!serialized) return null;
    storage.setItem(LEARNING_TRAIL_STORAGE_KEY, serialized);
    return merged;
  } catch {
    return null;
  }
}

export function updateModuleRead(storage: StorageLike, moduleId: LearnModuleId, read: boolean, now = new Date()): LearningTrailDocument | null {
  const current = readLearningTrail(storage, now) ?? emptyDocument(now.toISOString());
  const next = markModuleRead(current, moduleId, read, now.toISOString());
  return next ? writeLearningTrail(storage, next, now) : null;
}

export function updateModuleCompletion(storage: StorageLike, moduleId: LearnModuleId, successful: boolean, now = new Date()): LearningTrailDocument | null {
  const current = readLearningTrail(storage, now) ?? emptyDocument(now.toISOString());
  if (!successful) return current;
  const next = recordModuleCompletion(current, moduleId, true, now.toISOString());
  return next ? writeLearningTrail(storage, next, now) : null;
}

export function saveApprovedBrief(storage: StorageLike, input: LearningTrailInput, now = new Date()): LearningTrailDocument | null {
  const current = readLearningTrail(storage, now) ?? emptyDocument(now.toISOString());
  const next = recordApprovedBrief(current, input, now.toISOString());
  return next ? writeLearningTrail(storage, next, now) : null;
}

export function saveApprovedBriefInBrowser(input: LearningTrailInput, now = new Date()): LearningTrailDocument | null {
  const storage = getBrowserStorage();
  if (!storage) return null;
  const saved = saveApprovedBrief(storage, input, now);
  if (saved) window.dispatchEvent(new Event(LEARNING_TRAIL_CHANGE_EVENT));
  return saved;
}

const PILOT_REPLAY_PATH_BY_BRIEF: Record<PilotBriefId, string> = {
  "monza-braking": "/replay/2025/italian-grand-prix/qualifying",
  "mexico-aero": "/replay/2025/mexico-city-grand-prix/race",
  "zandvoort-strategy-tyres": "/replay/2025/dutch-grand-prix/race",
};

function saveActiveTrailHref(kind: "modelviewHref" | "replayHref", href: string, now: Date) {
  const storage = getBrowserStorage();
  if (!storage) return null;
  const current = readLearningTrail(storage, now);
  if (!current?.trail) return null;
  if (kind === "modelviewHref" && !validateModelviewHref(href)) return null;
  if (kind === "replayHref") {
    if (!validateReplayHref(href)) return null;
    const pathname = new URL(href, "https://local.invalid").pathname;
    if (pathname !== PILOT_REPLAY_PATH_BY_BRIEF[current.trail.briefId]) return null;
  }
  return saveApprovedBriefInBrowser({
    briefId: current.trail.briefId,
    learn: current.trail.learn,
    ...(current.trail.modelviewHref ? { modelviewHref: current.trail.modelviewHref } : {}),
    ...(current.trail.replayHref ? { replayHref: current.trail.replayHref } : {}),
    [kind]: href,
  }, now);
}

export function saveActiveModelviewHrefInBrowser(href: string, now = new Date()) {
  return saveActiveTrailHref("modelviewHref", href, now);
}

export function saveActiveReplayHrefInBrowser(href: string, now = new Date()) {
  return saveActiveTrailHref("replayHref", href, now);
}

export function clearLearningTrail(storage: StorageLike): boolean {
  try {
    storage.removeItem(LEARNING_TRAIL_STORAGE_KEY);
    storage.removeItem(LEGACY_LEARN_PROGRESS_KEY);
    return true;
  } catch {
    return false;
  }
}

export function getLearningTrailResumeHrefs(value: LearningTrailDocument) {
  if (!value.trail) return null;
  return {
    briefId: value.trail.briefId,
    learnHref: `/learn/${value.trail.learn.slug}${value.trail.learn.anchor ? `#${value.trail.learn.anchor}` : ""}`,
    modelviewHref: value.trail.modelviewHref,
    replayHref: value.trail.replayHref,
  };
}
