# Balsamic milestones

Status: M5 active
Last reviewed: 2026-08-14

This file is the only source of truth for roadmap order and progress. Do not mirror its checklist elsewhere.

## Status legend

- `[ ]` Not started
- `[~]` Active — exactly one milestone may have this state
- `[x]` Complete — every exit gate passed
- `[!]` Blocked — blocker and owner recorded directly below the item

## Foundation rule

Milestones M0 through M7 form the editor foundation. Do not begin broad catalog production, presentation polish, or distribution work until M7 is complete. A narrow vertical slice is built earlier only to prove the architecture.

## Roadmap

### [x] M0 — Canonical blueprint and reference inventory

Objective: preserve product and engineering intent independently of conversation context.

Deliverables:

- Canonical project blueprint covering screenshots, architecture, state ownership, controls, visual stability, errors, performance, and testing.
- Single roadmap and agent continuity protocol.
- Reference feature/control inventory separated into observed and inferred behavior.
- Initial decisions recorded with explicit rationale.

Exit gate:

- A new developer can identify the source of truth for every major subsystem without chat history.
- No implementation milestone depends on an undocumented ownership or coordinate decision.

### [x] M1 — Cross-platform application skeleton and guardrails

Depends on: M0

Objective: prove that the application can be developed, tested, and packaged on both desktop targets without weakening security.

Deliverables:

- Electron + React + TypeScript + Vite application with `main`, `preload`, `renderer`, `domain`, and `persistence` boundaries.
- Sandboxed renderer, context isolation, restrictive navigation/content policy, and typed allowlisted IPC.
- Design-token entry point and empty stable shell regions.
- Formatting, linting, strict type checking, unit test runner, component test runner, and production logging foundation.
- CI jobs for macOS and Windows plus unsigned development packaging and launch smoke test.
- Dependency-boundary checks preventing renderer access to Node/Electron.

Exit gate:

- Development and packaged builds launch on macOS and Windows.
- Type/lint/test/package/smoke checks pass with no uncaught errors or unexpected production console noise.
- Renderer cannot access filesystem or arbitrary IPC.

Completion evidence (2026-08-14):

- [Quality run 31805206981](https://github.com/Honigstute/Balisami/actions/runs/31805206981) passed on native macOS 26 arm64 and Windows 2025 x64 hosts. Both jobs installed from the lockfile, verified source, packaged the application, read back Electron fuses, launched the packaged binary, and uploaded a rendered smoke screenshot.
- The uploaded `balsamic-smoke-macos-26-arm64` and `balsamic-smoke-windows-2025-x64` artifacts were reviewed at original resolution. Both show the same fixed shell geometry without clipping, error UI, or selection-driven movement. The visible runtime state is fully hydrated and platform-correct: `macOS · arm64 · v0.1.0 · Packaged` with `⌘ K`, and `Windows · x64 · v0.1.0 · Packaged` with `Ctrl K`.
- Packaged smoke waits for a trusted renderer-ready IPC acknowledgement only after runtime IPC succeeds, fonts settle, and the committed UI crosses two animation frames. Load/preload failures, renderer crashes/unresponsiveness, console warnings/errors, stderr output, timeout, an empty screenshot, or a malformed acknowledgement fail the run. Each CI host uploads its rendered window for review.
- A strict post-package hook configures every Electron 43 fuse, and a separate readback check verifies the native binary rather than trusting build configuration. macOS arm64 and cross-packaged Windows x64 both pass; `RunAsNode`, `NODE_OPTIONS`, CLI inspection, and extra `file://` privileges are disabled, while ASAR integrity and ASAR-only loading are enabled.
- Source verification covers formatting, lint, 24-file dependency-boundary enforcement, strict TypeScript, 25 tests, and a production-dependency audit with zero vulnerabilities. Repository line endings are fixed to LF through `.gitattributes`, so macOS and Windows enforce the same formatting result.
- Local macOS verification independently passes `npm run verify`, `npm run package`, `npm run verify:fuses`, and `npm run smoke:packaged`. Cross-packaged Windows x64 independently produces a valid PE32+ `Balsamic.exe` and passes fuse readback before the native CI launch.

### [x] M2 — Document model, commands, selectors, and undo/redo

Depends on: M1

Objective: establish the single authoritative document state before editor gestures exist.

Deliverables:

- Runtime-validated project, board, element, asset-reference, note, and link schemas with stable IDs.
- Normalized document store with one canonical `childIds` source for parent/stack order and a narrow read/dispatch interface.
- Minimal control-type/spec contract for placeholder nodes; the complete authoring registry arrives in M8.
- Typed command registry for board and element CRUD, properties, geometry, and order.
- Bounded undo/redo history with transaction grouping, deterministic command labels, and exact saved-state identity.
- Derived selectors for board order, element order, selection-ready bounds, and command enablement.
- Fixture builders and invariant/property tests.

Exit gate:

- Every persisted mutation in tests travels through a command.
- A randomized sequence of at least 10,000 valid commands can undo to its exact initial document and redo to its exact final document.
- Invalid IDs, non-finite geometry, malformed properties, and illegal group/order operations fail predictably without partial mutation.

Current progress (2026-08-14):

- The first canonical schema slice defines versioned projects, branded stable IDs, boards, notes, elements, local world-space rectangles, JSON-safe properties, child and asset ordering, board/HTTP(S) links, and content-addressed image references. Persisted parent IDs, z-index copies, selection, viewport, and other session state are rejected.
- Cross-record validation rejects duplicate or missing order entries, map-key/record-ID disagreement, missing board/element/asset targets, zero or multiple element owners, and hierarchy cycles. Successful parser output is readonly; user-facing validation results are capped at 50 stable paths with an omitted-count summary.
- The minimal control registry owns the stable `foundation.group` and `foundation.rectangle` types plus child-container capability. Unknown controls and children attached to leaf controls are document validation failures.
- Derived selectors rebuild owner/sibling locations exclusively from `childIds`, return ordered canonical records, accumulate nested local frames into selection-ready world bounds, and expose board/element command availability without synchronized state.
- The command registry supports board CRUD/order/notes plus element create, childless delete, sibling reorder, complete JSON-safe property replacement, and local-frame geometry. Commands are runtime validated and return semantic failures, deep no-ops, or frozen structurally shared documents with validated exact inverses; invalid operations preserve the exact input document.
- Immutable bounded history provides atomic transactions, explicit coalescing, deterministic labels, monotonic non-reused state IDs, branch-safe undo/redo, and token-protected asynchronous save snapshots. Failed transactions and corrupt replay attempts cannot expose partial state.
- A seeded randomized sequence of 10,000 valid commands spanning create, reorder, geometry, properties, names, and notes undoes to byte-identical initial JSON and redoes to byte-identical final JSON in the history gate.
- Forty-six focused document/registry/selector/command/history tests pass inside the full 13-file/71-test suite. `npm run verify`, native macOS package/fuse/smoke, and Windows x64 cross-package/fuse verification all pass locally.

Completion evidence (2026-08-14):

- [Quality run 31810778303](https://github.com/Honigstute/Balisami/actions/runs/31810778303) passed on native macOS 26 arm64 and Windows 2025 x64 hosts for commit `adc7c06`. Both jobs ran the 71-test source gate, packaged the application, verified Electron fuses, launched the packaged binary, and uploaded a rendered smoke screenshot.
- The history gate applies exactly 10,000 deterministic seeded valid commands through the public history/dispatcher boundary, retains the configured bounded entry count, undoes to state ID `0` and byte-identical initial JSON, then redoes to the exact final state ID and JSON. The sequence covers element creation/order/geometry/properties plus board names and notes.
- Focused failure tests prove malformed commands, invalid IDs/geometry/properties, illegal child ownership/order, late transaction failure, and corrupt history replay preserve the exact input document/history without partial mutation. Save-token tests prove edits during an asynchronous save remain dirty and that undoing to the captured state becomes clean.

### [x] M3 — Versioned file format, atomic save, autosave, and recovery

Depends on: M2

Objective: make work safe before the editor becomes valuable enough to lose.

Deliverables:

- Portable container manifest, project JSON schema version, and asset layout.
- Sequential pure migration runner and golden files for every supported schema version.
- Main-process open/save/save-as APIs with runtime limits and clear error contracts.
- Atomic user-file save, debounced autosave, recovery journal/snapshot, recent files, and unsaved-close state machine.
- Save snapshots paired with history state IDs so edits made during an asynchronous save remain dirty.
- Save-state indicator in a reserved shell slot.
- Corruption, interruption, newer-version, and crash-recovery tests.

Exit gate:

- A killed process recovers the last accepted edit without corrupting the user's last valid file.
- Round trips are deterministic and migrations preserve all supported data.
- Failed parses/migrations/saves retain the source and in-memory document and produce one actionable, deduplicated message.

Completion evidence (2026-08-14):

- The brand-neutral version-1 logical envelope fixes `manifest.json`, canonical `project.json`, and content-addressed raw asset entries without coupling the domain to a product name, extension, or archive library. Equivalent JSON sorts keys recursively, preserves array order, uses two-space indentation, and ends with one newline.
- Decode treats every envelope as untrusted: exact entry shapes and paths, duplicate/missing entries, per-entry and total byte limits, fatal UTF-8, malformed/truncated JSON, nesting/value complexity, strict manifest fields, file-format compatibility, domain invariants, asset length, and SHA-256 are checked before a project is accepted.
- Asset bytes are copied at both boundaries and identical digests occupy one logical entry while retaining separate asset IDs in the document. Failures use typed, actionable error codes and never return a partial document or asset map.
- A pinned, zero-dependency asynchronous ZIP adapter produces fixed-metadata archives: JSON is compressed, already-compressed digest assets are stored, and entry order/timestamps/attributes are deterministic. ZIP metadata is preflighted for path, duplicates, count, per-entry expansion, and total expansion before decompression.
- The version router owns current/older/newer/malformed compatibility outcomes. Version 1 has an intentionally empty migration route and one immutable binary golden; no unreleased legacy format is invented. Future format versions must register complete consecutive pure steps before the router accepts them.
- Main-process storage opens a bounded fixed file snapshot, validates/encodes before write, flushes a randomly named exclusive sibling temporary, uses atomic replace plus directory fsync where supported, and has a regular-file-only Windows backup/restore fallback. Restore failure preserves both recovery paths; ordinary failures leave the prior user file untouched and remove temporary debris.
- Saving a history snapshot returns the exact immutable state/token identity that reached durable storage. The caller resolves that identity against the then-current history, so an edit made while archive encoding or disk I/O is in flight remains dirty; reopening proves the file contains the captured snapshot rather than the later edit.
- Recovery is a separate content-addressed journal under `userData`: it captures document/state without a user-save token, flushes an immutable archive before atomically advancing a strict 64-KiB pointer, preserves corrupt evidence, rejects tampering by length/SHA-256, bounds stale snapshots, and treats the chosen user-file path as inert metadata.
- Recovery discovery streams at most 1,000 journal entries, caps isolated issue reporting at 50, validates cheap pointer/archive metadata without inflating every project, and refuses per-project cleanup above 128 entries. Clear is idempotent and conditional on the exact observed pointer, so a stale discard cannot remove a newer recovery; corrupt and unrecognized evidence is retained.
- A 750-ms main-process scheduler captures state IDs and copied asset bytes, coalesces rapid edits to the latest state, prevents concurrent writes, retains one failed state for explicit retry, and flushes active plus latest pending work during normal shutdown. It never allocates user-save tokens or performs archive/filesystem work in the renderer.
- A per-window main-process lifecycle permits one active persistence session while leaving document/history authority in the editor. It validates new/opened/restored input, rejects stale recovery selections, serializes user saves, returns exact state/token/archive receipts, preserves a newer recovery when an older save completes, and clears recovery only when the identical deterministic archive is durable in the user file.
- Retain-close flushes recovery and stays retryable after failure; explicit discard cancels pending recovery, waits for in-flight work, and clears only the known pointer. Close refuses to race a user-file save, recovery cleanup cannot turn a successful user save into a false failure, and repeated/open-project transitions are explicit rather than hidden.
- Native open, save, and Save As use one window-owned Electron dialog adapter with platform-safe bounded filename suggestions while intentionally deferring the public extension/filter decision. Cancellation is a normal result, invalid dialog output changes nothing, and one exclusive workflow prevents duplicate file or close operations.
- The workflow exposes only completed/cancelled/stable-failure results with at most three deduplicated warnings. Project paths, recovery paths, archive internals, raw Electron responses, and technical exceptions stay in the main process; recent entries cross only as opaque IDs plus display metadata.
- Unsaved close is an explicit Save/Cancel/Don't Save state machine. Cancel and cancelled Save As keep the session open, Save closes only after durable success, and Don't Save invokes the bounded recovery-discard path.
- Recent-project metadata is a canonical, versioned, at-most-64-KiB main-process file capped at 20 newest-first entries. Mutations are serialized and atomic, duplicate paths collapse, missing targets are forgotten after a typed file-not-found result, convenience-update failure cannot turn open/save into failure, and corrupt metadata is preserved instead of overwritten.
- A packaged two-process crash probe saves a prior project, accepts a newer note edit through command/history, makes that state durable through the production scheduler/journal, and then waits without invoking close. An external harness forcibly kills the writer, launches the same packaged binary as a verifier, restores the exact state through lifecycle discovery, confirms Save As remains required, and compares the prior user file byte-for-byte. Its write mode is restricted to a fresh real-path-resolved directory beneath the OS temp root.
- One renderer `ProjectSession` now owns the live domain history and save tokens. It accepts later commands during an in-flight save, resolves only the exact returned receipt, keeps later edits dirty, schedules recovery after accepted commands, replaces bridge exceptions with bounded user problems, and gives React one stable external-store view.
- The preload/main project transport is allowlisted and validated twice without duplicating the project schema: shared DTOs keep documents opaque; main re-parses the canonical domain document, brands state/token IDs, bounds and copies the exact asset set, and rejects extra keys before native workflow state changes. Paths, raw Electron responses, archive details, and thrown bridge text remain in main.
- The native close handshake freezes renderer commands before capturing dirty history, permits only one request/dialog, resolves the exact pending token on cancellation/failure, and closes only after the native workflow succeeds. Renderer loss flushes and retains the last accepted recovery before close. Native Cmd/Ctrl+S and Save As route as semantic commands, while project/save/recovery state occupies the existing fixed status strip without changing shell geometry.
- Ordinary startup now discovers recovery before creating a blank project. Main maps exact recovery pointers to random window-scoped IDs and returns only bounded display metadata, recent summaries, and an ignored-evidence count; the stable renderer overlay requires Restore, exact Discard, or Start New while retaining recovery. Failed/stale choices keep evidence and one actionable status problem without remounting the shell.
- Native Open and Open Recent now reach the renderer as semantic commands. The selected file is bounded and decoded before the current project is frozen or prompted; cancellation/failure restores the exact renderer history and rejects its temporary save token, while success installs the validated file as one clean new history. Selecting the already-open file is refused before save/close so stale staged bytes cannot replace newer work.
- A second packaged acceptance gate uses the real renderer, preload, IPC, history, workflow, and close coordinator in a fresh authorized OS-temp root. It creates a project, applies a board-note command, saves, closes through the handshake, reopens through a new lifecycle, verifies the exact edit, requires empty stderr, and leaves a non-empty local project. The ordinary packaged smoke, fuse readback, and independent forced-crash probe remain green afterward.
- One hundred sixteen focused M3 tests pass inside the full 31-file/187-test suite. They cover logical and physical determinism/corruption/limits, the hostile 10,003-entry archive, version routing, real filesystem round trips, sparse oversize rejection, atomic replacement, Windows fallback order, restore failure, non-file protection, save-before-touch behavior, edits during save, recovery pointer interruption, bounded discovery/cleanup, exact-pointer clear races, evidence preservation, tamper detection, rapid-edit coalescing, retry, in-flight shutdown, one-active-project lifecycle, stale restore, overlapping saves, archive-identity cleanup, close recovery, native dialog cancellation/options, failed save-before-close retention, duplicate-operation rejection, bounded user problems/warnings, path-free results, recent-file corruption, cross-window recent-file concurrency/capping, opaque startup recovery, exact restore/discard choice behavior, staged project replacement, same-file refusal, cancelled replacement history restoration, packaged-probe argument/root confinement, exact recovery restore, missing-evidence refusal, exact renderer save receipts, close freezing/cancellation, rejected bridge redaction, cross-realm DTO validation, main transport copying/limits, controller retries, and packaged-workflow argument confinement.
- [Quality run 31817635967](https://github.com/Honigstute/Balisami/actions/runs/31817635967) passed all 135 tests for the project persistence lifecycle on native macOS 26 arm64 and Windows 2025 x64, then packaged, verified fuses, launched, and captured the application on both hosts.
- [Push quality run 31819690480](https://github.com/Honigstute/Balisami/actions/runs/31819690480) and independent [PR quality run 31819693969](https://github.com/Honigstute/Balisami/actions/runs/31819693969) passed all 155 tests for commit `33ac327` on native macOS 26 arm64 and Windows 2025 x64. Both runs also packaged the app, verified the native Electron fuses, launched it, and uploaded a rendered screenshot on each host.
- [Push quality run 31821474635](https://github.com/Honigstute/Balisami/actions/runs/31821474635) and independent [PR quality run 31821478069](https://github.com/Honigstute/Balisami/actions/runs/31821478069) passed all 159 tests for commit `071a79c` on native macOS 26 arm64 and Windows 2025 x64. On both hosts the packaged writer was forcibly terminated without close, the same binary relaunched and restored state ID `1`, and the prior 531-byte project file remained byte-identical; package, fuse, normal smoke, and screenshot gates also passed.
- [Push quality run 31824190767](https://github.com/Honigstute/Balisami/actions/runs/31824190767) and independent [PR quality run 31824194152](https://github.com/Honigstute/Balisami/actions/runs/31824194152) passed the 31-file/174-test gate for commit `9f621fc` on native macOS 26 arm64 and Windows 2025 x64. All four native jobs packaged the app, verified Electron fuses, launched without console/stderr failures, passed the real-renderer create/edit/save/close/reopen workflow, passed the separate forced-crash exact-recovery/byte-preservation probe, and uploaded the stable shell screenshot.
- [Push quality run 31826551480](https://github.com/Honigstute/Balisami/actions/runs/31826551480) and independent [PR quality run 31826555949](https://github.com/Honigstute/Balisami/actions/runs/31826555949) passed the 31-file/187-test gate for commit `1600bd4` on native macOS 26 arm64 and Windows 2025 x64. All four jobs independently packaged the app, verified Electron fuses, launched and captured the stable shell, passed real-renderer create/edit/save/close/reopen, then forcibly killed a writer and restored its exact note through the ordinary preload/startup-overlay/renderer-history path while leaving the prior 531-byte user file byte-identical and the recovered session Save-As-only. No packaged console/stderr failure was accepted.

### [x] M4 — Stable application shell and design system

Depends on: M1; integrates with M3 status

Objective: freeze layout grammar early so later features cannot make the interface jump or visually drift.

Current progress (2026-08-14):

- The shared visual contract now owns semantic application colors, the two bundled font roles and weights, four-pixel spacing, compact control geometry, pane defaults and bounds, reduced-motion timing, opacity, shadow, and ordered overlay tiers. Renderer CSS consumes those variables; an automated source guard rejects feature-local colors, numeric font weights, and numeric z-indexes.
- The startup recovery, recent-project, and startup-failure chooser now uses reusable token-owned button, modal, heading, notice, bounded-list, row, and action primitives. Required decisions cannot be dismissed accidentally; dismissible dialogs handle Escape; modal focus enters deterministically, remains trapped, and returns to its prior owner.
- Every fixed shell region has one stable semantic marker. A pure shared geometry contract derives its expected border box from the same tokens used by CSS and native window setup. The packaged smoke test requests the 1024×680 native minimum and then 1440×900 bounded by the host display's available work area, allows only the documented two-DIP native-frame quantization seen under fractional Windows scaling, waits for the platform-specific content viewport to settle, and rejects any renderer anchor error above 0.5 CSS pixel before capturing its screenshot; native title/frame insets never become renderer magic numbers.
- Navigator and inspector layout preferences now have one strict, versioned, at-most-1-KiB renderer profile record under Electron's per-user application data. Explicit collapse retains the last expanded width and keeps the pane mounted as a 32-px rail; pointer previews are transient and cancellable; pointer, keyboard, and reset commits clamp to token bounds and persist. The resizer hit targets overlay existing boundaries, so they add no grid track or layout shift.
- Shelf, navigator, canvas, and inspector content now mount behind region-local error boundaries. A failure replaces only that region with a fixed-track retry state and reports a path-free plain-language notice through a store that validates input, deduplicates stable keys, rate-limits recurrence, and caps the overlay at three messages. Notices and failures do not enter document/history state or shell layout.
- The compact application-control set now includes reserved-message field frames, text/number inputs, selects with a bundled SVG affordance, segmented controls, a Chromium-normalized slider, validated color swatches, buttons, bounded internal scrollers, empty states, tooltips, popovers, modals, and capped notices. Disabled, selected, mixed, invalid, help, and overlay states retain one token-owned border box; number spinners, range tracks, and select arrows no longer vary with the host OS. Anchored overlays portal outside shell flow, flip above when needed, clamp to the viewport, and expose explicit focus/Escape/outside-dismiss semantics.
- A deterministic packaged visual-conformance mode now owns six named states: default/loading, representative controls, bounded failure plus capped notice, tooltip, popover, and modal. Every state launches the production package in a separate process, waits for renderer readiness, proves the same minimum/normal shell geometry contract, rejects stderr or health-monitor failures, and captures a non-empty review artifact. The default state also runs at forced 100%, 125%, 150%, and 200% display scales. Fixture-only state disables user preference reads so existing pane settings cannot contaminate baselines.
- The palette now carries an explicit accessible control-boundary token. Automated contrast cases lock compact text and selected states to at least 4.5:1 and control borders, selection cues, and focus indicators to at least 3:1; the quiet command-bar text case is checked after alpha compositing. The darker product blue owns text-bearing selected surfaces, while the brighter blue remains a non-text accent.
- Focused coverage proves unique shell anchors, default/resized/collapsed center-column geometry, display-bounded/native-frame-aware viewport sizing, invalid viewport rejection, recovery/startup-error overlays that leave the canvas mounted, two-font and token ownership, compact control states, modal/tooltip/popover accessibility and focus behavior, strict preference fallback/persistence, bounded keyboard and pointer resizing/cancellation, regional isolation/retry, capped notice behavior, stable button tones, deterministic fixture dispatch, and semantic contrast floors. The full local 41-file/236-test source gate, package, fuse readback, geometry-aware smoke, six-state packaged visual matrix, create/edit/save/close/reopen workflow, and forced-crash ordinary-launch recovery all pass; the prior 531-byte user file remains byte-identical.

Deliverables:

- Tokenized typography, palette, spacing, controls, icons, pane sizes, motion, states, and overlay tiers.
- Fixed command/status/category/shelf rows and navigator/viewport/inspector columns.
- Resizable/collapsible side panes with persisted user preference and stable gutters.
- Reusable compact controls: fields, buttons, segments, selects, slider, swatch, tooltip, popover, modal, toast, empty state, and internal scroller.
- Regional error boundaries and capped/deduplicated feedback system.
- Visual regression stories for empty, loading, selected, mixed, disabled, invalid, error, and overlay states.

Exit gate:

- Switching among representative inspector placeholders changes shell/viewport edges by no more than 1 CSS pixel and produces zero post-ready layout shift.
- The UI uses at most the two approved bundled font families and contains no platform emoji or feature-local visual constants.
- Keyboard focus, contrast, reduced motion, 100–200% display scaling, minimum window size, and both platforms pass review.

Completion evidence (2026-08-14):

- One shared visual contract owns every renderer color, the two approved bundled font roles, the four-pixel spacing grid, compact controls, shell/pane geometry, motion, opacity, shadows, and ordered overlay tiers. Source tests reject feature-local raw colors, numeric font weights, and numeric z-indexes in CSS and TypeScript/React.
- The fixed shell, persisted/collapsible panes, internal scrollers, compact control grammar, modal/tooltip/popover layers, region-level error isolation, and capped notice center preserve their border boxes across empty, loading, selected, mixed, disabled, invalid, failure, and overlay states. Keyboard/focus behavior and reduced-motion fallback are automated; text, focus, selection, and control-boundary contrast floors are calculated from the actual tokens.
- The packaged geometry probe verifies every renderer shell anchor at minimum and display-bounded normal sizes to within 0.5 CSS pixel. Fractional Windows scaling may quantize the requested native frame by at most two DIPs, but the renderer remains subject to the stricter CSS contract. Separate production processes capture default at forced 100%, 125%, 150%, and 200% plus controls, feedback, tooltip, popover, and modal without accepting stderr, console errors, malformed geometry, or empty artifacts.
- The final local gate passes 41 files / 236 tests, zero high-severity runtime audit findings, packaging, Electron fuse readback, ordinary smoke, all nine packaged visual launches, real create/edit/save/close/reopen, and forced-crash ordinary-launch recovery; the prior 531-byte user project remains byte-identical.
- [Push quality run 31831856599](https://github.com/Honigstute/Balisami/actions/runs/31831856599) and independent [PR quality run 31831862197](https://github.com/Honigstute/Balisami/actions/runs/31831862197) passed commit `037e456` on native macOS 26 arm64 and Windows 2025 x64. Both hosts completed source, package, fuse, smoke, nine-state visual, real project-workflow, and crash-recovery gates. The uploaded semantic and 100/125/150/200% artifacts were inspected at native resolution on both platforms with stable tracks, bundled-font metrics, internal inspector overflow, and non-reflowing overlays.

### [~] M5 — Viewport, coordinate system, pan, zoom, and scene layers

Depends on: M2, M4

Objective: provide a deterministic, high-performance workspace before object editing.

Current progress (2026-08-14):

- The first pure editor coordinate module defines incompatible branded client, viewport, world, and device points/vectors/rectangles plus validated viewport bounds, device scale, zoom, and immutable camera transforms. Browser client offsets are converted exactly once; pan remains in viewport CSS pixels; world geometry stays floating-point and no conversion rounds model values.
- One explicit 10–400% zoom policy distinguishes strict persisted/session transform validation from clamped user requests. World↔viewport, client↔viewport, viewport↔device, vector, and rectangle conversions share the same contract; translating pan and changing zoom around a viewport anchor return frozen values without mutating inputs.
- Actual, fit, width, and selection framing now share one pure calculation path with validated padding and clamped zoom. Manual and actual-mode viewport resizing preserve the world point under the viewport center, while fit-derived modes recalculate from their canonical world bounds without accumulating camera drift.
- One immutable external camera store owns transform, viewport size, device scale, and revision. Producers may schedule every raw update, but one animation-frame queue publishes only the latest semantic state; queued zooms and resize calculations build from pending rather than stale state, selector identities survive unrelated changes, and gesture completion can flush deterministically.
- The live canvas now mounts explicit SVG background, document, and fixed-screen interaction layers beside a DOM editing overlay. A single imperative matrix subscription updates the SVG world group without committing React state or rerendering scene children; initial measurement, subsequent resize, DPR changes, observer cleanup, and React Strict Mode effect replay have explicit lifecycle paths.
- Wheel input now normalizes Chromium pixel, line, and page deltas into one platform-neutral contract. Native two-axis trackpad motion remains two-axis, Shift remaps a vertical wheel only when no native horizontal delta exists, and Chromium pinch plus Cmd/Ctrl-wheel use a capped exponential zoom factor. Consecutive wheel events build on pending camera state, so they neither drop motion nor force extra frames.
- A DOM adapter connects the contract to pointer-centered zoom plus space/primary-button and middle-button pan. Pan recomputes from one immutable gesture start, pointer capture owns out-of-bounds movement, pointer-up flushes the exact final position, and Escape, pointer cancellation, capture loss, window blur, or teardown restores the start. Cursor state is geometry-neutral, and editable overlay controls retain native keyboard behavior.
- Seeded sketch lines now derive a stable 32-bit seed from element identity and primitive salt, emit two exact-endpoint cubic passes, and serialize render-only path numbers through one three-decimal policy. Rectangle edges use explicit stable salts, so reopen and export can reproduce byte-identical geometry without OS randomness.
- One incremental uniform-grid spatial index owns broad-phase world bounds without taking ownership of document stacking. Results use locale-independent stable ID order for callers to reconcile with canonical `childIds`; updates remove stale cells, rebuild is atomic, huge shapes use a bounded global bucket, and huge sparse queries scan existing entries instead of allocating work proportional to empty space. Visible-world bounds and overscan derive purely from the camera, with overscan remaining constant in CSS pixels at every zoom.
- The active-board scene adapter now flattens canonical nested ownership once into derived world bounds, renders only the existing foundation rectangle control, and restores `childIds` stacking after spatial lookup. Its keyed SVG presenter reuses unchanged DOM nodes, regenerates a seeded path only when geometry changes, applies order-only changes without geometry churn, and mounts/unmounts overscanned items imperatively as the external camera moves; React does not render individual document nodes.
- A dedicated packaged-production performance mode validates a fixed 1,000-rectangle document for a real ten-second pan/zoom run. It wraps the browser animation-frame scheduler to measure camera publication plus visibility query and SVG work, measures input-to-final-listener latency, observes long tasks and keyed DOM additions/removals, and uses a React Profiler around the entire canvas to reject any motion-driven commit. The native harness strictly parses one bounded renderer result, enforces p95 frame work ≤16.7 ms, maximum frame work ≤50 ms, p95 input latency ≤50 ms, minimum sample count, exact duration, and zero React commits, then stores per-platform JSON with the ordinary CI artifacts.
- Sixty-six focused viewport/scene cases include 10,000 deterministic seeded coordinate round trips, framing and resize invariants, 1,000 raw camera updates coalesced into one publication, cursor-anchor preservation, input-unit normalization, cancel-safe pointer paths, deterministic sketch goldens, spatial-index failure/oversize cases, fixed 1,000/5,000-element source-level performance fixtures, nested world bounds, incremental scene reconciliation, canonical stacking, keyed DOM reuse, culling, and strict performance-result validation. The full local 54-file/303-test source gate, package, fuse readback, ordinary smoke, ten-launch packaged visual matrix, create/edit/save/close/reopen workflow, and forced-crash ordinary-launch recovery all pass. The local packaged 10.03-second run measured 599 camera frames, 0.60 ms p95/1.40 ms maximum camera work, 18.40 ms p95 input-to-visible latency, zero long tasks, and zero React commits. The deterministic native scene artifact was reviewed at original resolution with crisp seeded outlines, correct nested geometry, and unchanged shell anchors. The first camera/scene slice also passed [push run 31833568347](https://github.com/Honigstute/Balisami/actions/runs/31833568347) and independent [PR run 31833593703](https://github.com/Honigstute/Balisami/actions/runs/31833593703) on native macOS 26 arm64 and Windows 2025 x64.

Deliverables:

- Single viewport-transform module and unit-tested world/screen/device conversions.
- SVG scene root with background, document, interaction overlay, and DOM editing overlay.
- Pointer-centered zoom, pinch/wheel behavior, pan gestures, actual/fit/width/selection zoom modes, bounds, and optional scrollbars.
- Resize/DPR handling, bundled-font readiness, stable seeded sketch primitive, and animation-frame scheduler.
- Spatial-index and visible-range interfaces with benchmark fixtures.

Exit gate:

- World→screen→world round trips remain within the documented epsilon across zoom/DPR/property-based cases.
- Zoom retains the point beneath the cursor; no jump occurs during resize or pane toggle.
- Ten-second pan/zoom runs meet the 1,000-element frame budget without React/global-store updates per raw pointer event.

### [ ] M6 — Selection, gestures, hit testing, and transforms

Depends on: M5

Objective: make manipulation correct and undoable before adding smart assistance.

Deliverables:

- Tested gesture state machine with pointer capture and cancellation.
- Exact/broad-phase hit testing, topmost/cycle behavior, click, shift/toggle, marquee, select all, and escape.
- Move, resize, aspect/axis modifiers, keyboard nudge, duplicate, delete, copy/cut/paste, and in-place text-edit overlay.
- Fixed-screen selection bounds/handles and accessible keyboard route.
- Transient gesture preview with one command commit per completed gesture.

Exit gate:

- Pointer cancellation/Escape restores exact starting state.
- A 500-event drag yields one history entry and undo restores exact prior geometry.
- Selecting or transforming one item does not rerender unrelated scene nodes and meets the 1,000-element gesture budget.
- Interaction matrix passes on mouse and trackpad paths for macOS and Windows shortcut mappings.

### [ ] M7 — Smart guides, snapping, grouping, and arrangement

Depends on: M6

Objective: complete the geometry foundation that every future control relies on.

Deliverables:

- Pure candidate generation/resolution engine for grid, edges, centers, baselines, container targets, and equal gaps.
- Zoom-independent tolerance, acquire/release hysteresis, stable priority/tie-break rules, bypass modifier, and guide overlay.
- Group/ungroup, lock/unlock, z-order, align, and distribute commands.
- Multi-selection bounds and nested-transform rules.
- Dense-board snapping benchmark using the spatial index.

Exit gate:

- Golden geometry tests cover ambiguous candidates, negative coordinates, nested groups, all zoom bounds, and modifier changes.
- Guide visuals never enter persisted state, history, hit testing, thumbnails, or export.
- Snap/hit-test performance meets the 5,000-element p95 budget.

### [ ] M8 — Control registry and representative vertical slice

Depends on: M7

Objective: prove that controls are data-driven and extensible before building the catalog.

Deliverables:

- Validated `ControlDefinition` contract and registry consumed by rendering, defaults, search, inspector schema, thumbnail, file validation, and migrations.
- Reusable scene and inspector primitives.
- Representative controls: Rectangle, Text Label, Button, Text Input, Checkbox, Image placeholder, Browser/container, and Arrow.
- Deterministic auto-size and bundled-font measurement service.
- Registry compliance tests and control visual matrix.

Exit gate:

- A normal new control is registered once and automatically becomes searchable, insertable, renderable, inspectable, serializable, migratable, thumbnail-capable, and exportable.
- Representative controls round-trip without data loss and retain identical seeded sketch geometry across reopen.

### [ ] M9 — Library, quick add, drag-create, and schema-driven inspector

Depends on: M8

Objective: deliver the primary fast-create/edit loop visible in the references.

Deliverables:

- Fixed-slot horizontal shelf, category filters, tooltips, keyboard navigation, search/aliases, loading placeholders, and end reachability.
- Quick Add with ranked deterministic results and recent/favorite controls.
- Click insert, drag-to-place, and supported draw gestures.
- Inspector common modules and control-specific schema renderer with mixed values and batched multi-edit.
- Numeric field keyboard behavior and overlay-based selects/colors/icons.

Exit gate:

- A user can find, place, edit, move, resize, snap, undo, save, reopen, and delete every representative control without console errors.
- Shelf slots and viewport bounds are unchanged by long names, missing previews, active category, selection type, validation, or open overlays.

### [ ] M10 — Boards, notes, links, alternates, and presentation

Depends on: M9

Objective: turn the single-board editor into a useful wireframing project.

Deliverables:

- Navigator CRUD, rename, reorder, duplicate, thumbnails, keyboard navigation, and recoverable trash/delete behavior.
- Board notes with stable inspector/document-level state.
- Element-to-board/external links with validation and link hints.
- Alternate versions with create, select, rename, promote, duplicate, merge/discard rules documented before implementation.
- Full-screen presentation with working navigation history and selected alternate behavior.

Exit gate:

- Board selection changes only navigator styling and document content; shell geometry remains fixed.
- Links and alternates survive save/reopen and behave consistently in presentation and export fixtures.
- Thumbnails update asynchronously without degrading active-canvas performance budget.

### [ ] M11 — Assets, icons, reusable components, and catalog expansion

Depends on: M9, M10

Objective: expand capability without weakening registry, file safety, or performance.

Deliverables:

- Image import/drop with type, size, decode, scaling, orientation, transparency, and corruption handling.
- Content-addressed asset storage, unused-asset management, and custom icon conversion.
- Searchable bundled icon library using vector assets rather than emoji/font glyphs.
- Reusable component definitions and instances with override semantics and cycle prevention.
- Remaining control catalog implemented category-by-category through the registry.
- A maintained catalog matrix tracking visual states, properties, auto-size, hit shape, accessibility, migration, and tests.

Exit gate:

- Asset-heavy and component-heavy fixtures meet open/save/render budgets.
- Updating a component definition updates instances deterministically; invalid cycles are rejected without document damage.
- Every promoted catalog control passes the same registry contract and visual matrix; there are no one-off inspector branches.

### [ ] M12 — Clipboard, import/export, print, and interoperability

Depends on: M10, M11

Objective: make projects easy to move and share while keeping export faithful to the editor.

Deliverables:

- Internal clipboard format plus safe plain-text/image fallbacks across applications.
- PNG export at explicit scale, SVG export where supported, and PDF export with one board per page and link annotations.
- Export selection/all/subset and active-alternate rules.
- Print/presentation-safe bounds, deterministic fonts, and missing-asset behavior.
- Public project-format documentation and compatibility fixtures.

Exit gate:

- Golden exports match scene geometry within documented raster tolerance on macOS and Windows.
- Copy/paste within and between projects remaps IDs/assets/links without collisions or loss.
- Export failures preserve the document and produce one actionable message.

### [ ] M13 — Native desktop integration and release pipeline

Depends on: M12

Objective: ship a normal, trustworthy application on both operating systems.

Deliverables:

- Native menus and platform shortcut labels, dock/taskbar integration, app icon set, file association, recent documents, open-with, and single-instance behavior.
- macOS arm64 and x64/universal decision validated; signed/notarized `.dmg` pipeline.
- Windows x64 installer, uninstall behavior, file association, signed executable/installer; Windows ARM promoted only after test coverage exists.
- Signed automatic updates with staged rollout, rollback, and update/recovery tests.
- License notices, privacy/offline statement, diagnostics access, and release checklist.

Exit gate:

- Clean macOS and Windows machines can install, launch, create, save, reopen by file association, update, and uninstall without security or data-loss surprises.
- CI produces traceable signed artifacts from a version tag and verifies their signatures and smoke tests.

### [ ] M14 — Performance, accessibility, visual, and beta hardening

Depends on: M13

Objective: validate that the complete product still meets the foundation promises.

Deliverables:

- Full benchmark suite and profiles for large, asset-heavy, grouped, and multi-board projects.
- Complete screenshot/geometry matrix at supported scaling and operating-system combinations.
- Keyboard-only audit, focus/accessibility-tree review of chrome, reduced motion, and contrast review.
- Error/telemetry-free soak tests, corrupted-file drills, forced-crash recovery, update rollback, and low-disk tests.
- Reference-parity audit against the explicit interaction/control catalog; unresolved gaps categorized, not hidden.
- User beta feedback triaged into correctness, usability, visual, performance, and later-scope groups.

Exit gate:

- All blueprint performance and layout budgets pass in packaged builds.
- No known data-loss, crash-loop, notification-storm, shell-shift, or blocker accessibility defect remains.
- Release candidate passes the complete create→edit→save→crash/recover→reopen→export→update workflow on macOS and Windows.

## Next action

Expose the existing camera/framing contract through stable Zoom In, Zoom Out, Actual Size, Fit Board, and Fit Width commands with native shortcut mappings and a fixed-width percentage readout. Derive board bounds from the scene model, keep command availability explicit for empty boards, and prove toolbar/shortcut use cannot shift shell geometry or bypass camera bounds; Fit Selection remains disabled until M6 owns selection.
