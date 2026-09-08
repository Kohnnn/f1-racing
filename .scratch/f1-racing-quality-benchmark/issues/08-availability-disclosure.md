# Disclose observational availability

Status: ready-for-review
Blocked by: none
Spec: /media/compute_01/New Volume/PersonalWebsite/interactive-note/.scratch/f1-racing-quality-benchmark/spec.md

Implement lines 81–86 and 112 using observed local metadata, not invented data classifications: distinguish provider lineage, whole synthetic empty evidence, recorded, mixed and unknown coverage on discovery and summary. Whole pack differs from loaded window. Preserve existing Replay projected badge and unknown weather unavailable. Reuse existing seams, no dependencies, no full replay fallback/download. Add minimal fixtures proving recorded/mixed/synthetic/unknown classification. Do not change canonical datasets, select candidate membership or claim release readiness.

Implementation: discovery and replay summary separate provider lineage from whole-pack positions, recorded timing, race controls and weather. Server-only coverage reads existing validated metadata and chunks sequentially per pack; only disclosure values reach the client. Missing/invalid chunks prevent whole-pack classification. Existing projected badge retained and scoped to the loaded window. All-zero weather payloads are ambiguous, remain unknown and display unavailable rather than measured zero. No canonical inputs, membership, protected files, dependencies or playback behavior changed.

Checks: network-isolated bwrap with read-only root/original node_modules and only this worktree writable. Availability fixtures, JS syntax, replay-chunks, dashboard source and replay-keyboard source checks passed. Web typecheck passed using compiler path mappings to existing local workspace declarations because the original node_modules/@f1-racing links are absent; normal tsc was blocked by those missing links. Initial replay-chunks check attempted a temporary write outside the worktree and was blocked read-only; rerun passed with TMPDIR inside the worktree.

Read-only local probe observed synthetic positions with empty timing/controls in one pack and mixed positions with both empty and available timing in two others. No session names enter classification. Whole-pack inspection adds server-side local chunk reads, not browser downloads or replay.json fallback.

Pending integration: desktop/mobile browser disclosure, layout and summary assertions; no build/install/ingestion executed. Browser acceptance and release readiness are not claimed.
