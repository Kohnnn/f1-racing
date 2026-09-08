import { getReplayFrameChunk, getReplayLaps, getReplayMetaPack, getReplayRaceControl } from "./data";
import { classifyPositions, framePositionSources, hasWeatherEvidence, timingAvailability, type ObservationAvailability } from "./observation-availability";

export async function getObservationAvailability(season: number | string, grandPrix: string, session: string): Promise<ObservationAvailability> {
  const [meta, laps, controls] = await Promise.all([
    getReplayMetaPack(season, grandPrix, session).catch(() => null),
    getReplayLaps(season, grandPrix, session).catch(() => null),
    getReplayRaceControl(season, grandPrix, session).catch(() => null),
  ]);
  const sources = new Set<unknown>();
  let frameCount = 0;
  let weather = false;
  let unknownWeather = false;
  let complete = Boolean(meta);
  for (const entry of meta?.frameChunkIndex ?? []) {
    try {
      const chunk = await getReplayFrameChunk(season, grandPrix, session, entry);
      frameCount += chunk.frames.length;
      for (const source of framePositionSources(chunk.frames)) sources.add(source);
      weather ||= chunk.frames.some((frame) => hasWeatherEvidence(frame.weather));
      unknownWeather ||= chunk.frames.some((frame) => Boolean(frame.weather) && !hasWeatherEvidence(frame.weather));
    } catch {
      complete = false;
    }
  }
  complete &&= frameCount > 0 && frameCount === meta?.frameCount;
  return {
    provider: meta?.source ?? "unknown",
    positions: complete ? classifyPositions(sources) : "unknown",
    timing: timingAvailability(laps),
    controls: Array.isArray(controls) ? (controls.length ? "available" : "unavailable") : "unknown",
    weather: weather ? "available" : complete && !unknownWeather ? "unavailable" : "unknown",
  };
}
