import { ReplayFrameChunkSchema } from "@f1-racing/schemas";
import type { ReplayFrameChunk, ReplayPack } from "@/lib/data";

type ReplayChunkEntry = NonNullable<ReplayPack["frameChunkIndex"]>[number];

export const FULL_RACE_CHUNK_CONCURRENCY = 4;

export function validateReplayFrameChunk(payload: unknown, entry: ReplayChunkEntry): ReplayFrameChunk {
  const chunk = ReplayFrameChunkSchema.parse(payload) as ReplayFrameChunk;
  const firstTime = chunk.frames[0]?.t;
  const lastTime = chunk.frames.at(-1)?.t;
  if (
    chunk.index !== entry.index
    || chunk.fromTime !== entry.fromTime
    || chunk.toTime !== entry.toTime
    || firstTime !== entry.fromTime
    || lastTime !== entry.toTime
  ) {
    throw new Error(`Replay chunk ${entry.index} does not match its index metadata`);
  }
  return chunk;
}

export async function loadReplayChunkQueue(
  chunkIndexes: number[],
  loadChunk: (chunkIndex: number) => Promise<void>,
  concurrency = FULL_RACE_CHUNK_CONCURRENCY,
  getActiveCount = () => 0,
) {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error("Replay chunk concurrency must be a positive integer");
  }
  let cursor = 0;
  async function worker() {
    while (true) {
      while (cursor < chunkIndexes.length && getActiveCount() >= concurrency) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      if (cursor >= chunkIndexes.length) {
        return;
      }
      const chunkIndex = chunkIndexes[cursor];
      cursor += 1;
      await loadChunk(chunkIndex);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, chunkIndexes.length) }, () => worker()),
  );
}
