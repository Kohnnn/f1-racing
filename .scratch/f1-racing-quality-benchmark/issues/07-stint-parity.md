# Verify recorded stint attribution parity

Status: resolved
Blocked by: none
Spec: /media/compute_01/New Volume/PersonalWebsite/interactive-note/.scratch/f1-racing-quality-benchmark/spec.md

Implement source acceptance in lines 65–71, 108–109: recorded distinct-compound shared-boundary fixture, unique lap attribution and recomputed arrays/means/trends, deeper overlap rejection. Exercise actual Replay raw-stint path. Only if fixture proves inconsistent reuse existing normalizer at the seam; do not invent a second algorithm. No generated dataset edits, ingestion, fabricated provenance or release ownership transfer. Actual ten-pack repair remains a separate blocked release dependency.

## Source implementation evidence

- Branch: `fix/f1-quality-stints`, based on `11e6448`; worktree `/tmp/opencode/f1-quality-stints`.
- Added assertions to the existing `pipeline/export/src/build-openf1-session-pack.test.mjs`; no new test runner or package script is needed. Existing `test:session-pack` and `quality:source` include this coverage.
- Fixture source is the preserved benchmark snapshot, not a newly captured upstream response: `/tmp/opencode/f1-quality-20260908/workspace/data/packs/seasons/2025/australian-grand-prix/race/`.
- `stints.json` SHA256: `7a71d371fec6a095d2a393deb97cecf91a13cb5ac2345a85f7f1e27bef005204`. VER's stints 4 and 5 at lines 48–113 retain INTERMEDIATE/MEDIUM, inclusive boundary 34 and tyre age 0. Stint 2 at lines 22–34 supplies the nonzero tyre-age preservation check (2).
- `laps.json` SHA256: `51efcb412738e254bb723dd31b3c36a4e1c4546adb6e88b217518dda7d3b1d0c`. VER laps 31–36 are the bounded timing sample: `88.127, 88.208, 88.046, 128.598, 124.508, 116.334` (time fields at lines 6150, 6354, 6558, 6750, 6942, 7134). Pack field names are mapped to the existing raw normalizer input contract; no claim of original raw-response provenance is made. Compounds and stint numbers are deliberately absent from lap inputs to exercise raw-stint attribution.
- Session output assigns lap 34 exactly once to stint 5; sample arrays recompute to means `88.127/123.147` and trends `-0.04/-6.132`. These are six-lap fixture aggregates, not full-session repaired outputs.
- Red run: after exporting the existing functions for testing, before changing normalization, the actual Replay timeline/enrichment path failed at lap 34: actual `INTERMEDIATE`, expected `MEDIUM` (exit 1). Session aggregation assertions had passed before that assertion.
- Minimal fix: `buildStintTimelines` consumes `normalizeStints(stintsRaw)` from the session pipeline. No second algorithm, `data.ts`, UI, playback or package changes. Existing functions are exported without changing their behavior otherwise.
- Green run: session-pack suite passed, including Replay/session ownership parity, unchanged source records, reversed input order, normalized-input idempotence and used-tyre age. Deliberately extending the earlier stint end to 35 or 36 is a negative mutation, not recorded evidence; both normalizer and actual Replay seam reject it.

## Verification and isolation

All executable tests and typechecking used bubblewrap with `--ro-bind / / --unshare-net --die-with-parent`, the original installed `node_modules` mounted read-only, and only this worktree writable. No install, build, upstream ingestion or canonical/generated pack writes occurred. Test temporary files stayed under this worktree via `TMPDIR`; Node's incidental compile cache was also confined here and is not part of the commit.

Passed: syntax checks for all three changed JS files; `node pipeline/export/src/build-openf1-session-pack.test.mjs`; `node pipeline/export/src/split-replay-packs.test.mjs`; web `tsc --noEmit --incremental false`; `git diff --check`. No standalone lint script exists. Initial typecheck could not resolve the two workspace packages; namespace-only read-only mounts fixed that environment issue without changing installed dependencies. No full build, browser suite or release gate was run.

Reproduce from the owned worktree (replace the final Node command for syntax checks or the session/split tests):

```sh
bwrap --ro-bind / / --unshare-net --die-with-parent \
  --bind /tmp/opencode/f1-quality-stints /tmp/opencode/f1-quality-stints \
  --ro-bind "/media/compute_01/New Volume/PersonalWebsite/interactive-note/f1-racing/node_modules" /tmp/opencode/f1-quality-stints/node_modules \
  --tmpfs /tmp/opencode/f1-quality-stints/node_modules/@f1-racing \
  --ro-bind /tmp/opencode/f1-quality-stints/packages/schemas /tmp/opencode/f1-quality-stints/node_modules/@f1-racing/schemas \
  --ro-bind /tmp/opencode/f1-quality-stints/packages/telemetry-utils /tmp/opencode/f1-quality-stints/node_modules/@f1-racing/telemetry-utils \
  --setenv TMPDIR /tmp/opencode/f1-quality-stints --unsetenv F1_CANDIDATE_ROOT \
  -- node node_modules/typescript/bin/tsc --project apps/web/tsconfig.json --noEmit --incremental false
```

## Remaining release dependency

Source acceptance passed review and the merged session-pack rerun at 77fee324; this ticket is resolved only for its source fixture/parity scope, not release completion. All ten stale packs still need authorized private-candidate regeneration using legitimately captured source evidence, recomputed dependent strategy outputs, exact indexed membership checks and release provenance. This fixture does not establish that the 753 recorded violations have been repaired, nor transfer release ownership. No integration-script change is required.
