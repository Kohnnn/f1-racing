# Expose replay speed selection

Status: claimed
Blocked by: coordinator integrated artifact for browser acceptance
Spec: /media/compute_01/New Volume/PersonalWebsite/interactive-note/.scratch/f1-racing-quality-benchmark/spec.md

Implement spec lines 88–92 and 113: native aria-pressed from existing visual speed state; preserve labels/focus/layout. Extend existing browser probe for initial state, all nine speeds, keyboard activation and shortcut state. No custom controls or dependencies. Existing benchmark is partial; this independently verified slice does not close it.

Implementation: `fix/f1-quality-speed`, based on `11e6448`, in `/tmp/opencode/f1-quality-speed`. Added only the native speed buttons' `aria-pressed` binding to the existing visual-state comparison. Extended the existing browser probe for initial 1x state, all nine presets by click/Enter/Space, unchanged labels/titles, exactly one pressed and visually active preset, retained focus, paused playback, ignored speed shortcuts on focused buttons, and all five global speed shortcuts with retained heading focus.

Validation: `npm run check:replay-keyboard` failed on the new source assertion before implementation, then passed; `node --check tools/replay-keyboard-probe.mjs` passed. `npm run typecheck` initially failed to resolve workspace packages through the original dependency links, then passed after local workspace-only links were added under `apps/web/node_modules/@f1-racing`. No lint script is configured.

Checks ran with `bwrap --ro-bind / / --unshare-net --tmpfs /tmp --bind /tmp/opencode/f1-quality-speed /tmp/opencode/f1-quality-speed --chdir /tmp/opencode/f1-quality-speed --setenv npm_config_cache /tmp/npm-cache`; installed original dependencies were read-only through a local symlink, and incremental output stayed in this worktree. No installs, builds, original-tree edits, dependency writes, pushes or deployments.

Review validation reproduced the prior mobile click instability: unchanged button transform, continuously growing document scroll and a canvas reaching 17,026px. Pointer reset did not resolve it. Taking the canvas out of normal flow stopped the ResizeObserver/intrinsic-height feedback; applied absolute positioning inside the existing sized relative container. This is a verified product sizing bug, not a reason to force browser clicks. No base comparison establishes when it began.

The retained tools/quality-review-browser.test.mjs ran against changed-source Next dev under offline bwrap with read-only original dependencies: 240 assertions passed across 1280x900 and 390x844, including all nine presets by click/Enter/Space, focus/paused state, ignored focused-button shortcuts, five heading shortcuts, canvas stability, discovery and summary. No forced click or reduced-motion override. Existing full artifact-bound browser suites and release acceptance remain pending; missing FastAPI still blocks aggregate quality. No full build or install.
