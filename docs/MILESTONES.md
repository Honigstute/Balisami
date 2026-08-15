# Balsamic milestones

Status: MVP alpha active
Last reviewed: 2026-08-15

This file is the only source of truth for roadmap order and progress. Do not mirror its checklist elsewhere.

## Status legend

- `[ ]` Not started
- `[~]` Active — exactly one milestone may have this state
- `[x]` Complete — every exit gate passed
- `[!]` Blocked — blocker and owner recorded directly below the item
- `[>]` Paused — verified partial delivery is frozen and the remaining scope is explicitly deferred

## Foundation and MVP-cut rule

Milestones M0 through M7 form the complete editor foundation. On 2026-08-15 the product owner explicitly chose a testable-alpha cut after the verified equal-gap slice of M7. The unfinished M7 targets are paused, not silently treated as complete. MVP-A may build a narrow registry-backed vertical slice on the verified foundation; broad catalog production, presentation polish, and release distribution still wait for the post-alpha roadmap.

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

Current progress (2026-08-15):

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

### [x] M5 — Viewport, coordinate system, pan, zoom, and scene layers

Depends on: M2, M4

Objective: provide a deterministic, high-performance workspace before object editing.

Completion evidence (2026-08-14):

- The first pure editor coordinate module defines incompatible branded client, viewport, world, and device points/vectors/rectangles plus validated viewport bounds, device scale, zoom, and immutable camera transforms. Browser client offsets are converted exactly once; pan remains in viewport CSS pixels; world geometry stays floating-point and no conversion rounds model values.
- One explicit 10–400% zoom policy distinguishes strict persisted/session transform validation from clamped user requests. World↔viewport, client↔viewport, viewport↔device, vector, and rectangle conversions share the same contract; translating pan and changing zoom around a viewport anchor return frozen values without mutating inputs.
- Actual, fit, width, and selection framing now share one pure calculation path with validated padding and clamped zoom. Manual and actual-mode viewport resizing preserve the world point under the viewport center, while fit-derived modes recalculate from their canonical world bounds without accumulating camera drift.
- One immutable external camera store owns transform, viewport size, device scale, and revision. Producers may schedule every raw update, but one animation-frame queue publishes only the latest semantic state; queued zooms and resize calculations build from pending rather than stale state, selector identities survive unrelated changes, and gesture completion can flush deterministically.
- The camera now retains one normalized framing intent alongside its derived transform. Actual, fit-board, and fit-width modes therefore recompute from canonical bounds after viewport or pane resize, while wheel, toolbar zoom, and committed pan switch explicitly to manual mode. Cancelling a pan restores both its exact starting transform and its prior framing intent instead of leaving a hidden fit-mode mismatch.
- The live canvas now mounts explicit SVG background, document, and fixed-screen interaction layers beside a DOM editing overlay. A single imperative matrix subscription updates the SVG world group without committing React state or rerendering scene children; initial measurement, subsequent resize, DPR changes, observer cleanup, and React Strict Mode effect replay have explicit lifecycle paths.
- Wheel input now normalizes Chromium pixel, line, and page deltas into one platform-neutral contract. Native two-axis trackpad motion remains two-axis, Shift remaps a vertical wheel only when no native horizontal delta exists, and Chromium pinch plus Cmd/Ctrl-wheel use a capped exponential zoom factor. Consecutive wheel events build on pending camera state, so they neither drop motion nor force extra frames.
- A DOM adapter connects the contract to pointer-centered zoom plus space/primary-button and middle-button pan. Pan recomputes from one immutable gesture start, pointer capture owns out-of-bounds movement, pointer-up flushes the exact final position, and Escape, pointer cancellation, capture loss, window blur, or teardown restores the start. Cursor state is geometry-neutral, and editable overlay controls retain native keyboard behavior.
- Stable viewport commands now expose Zoom In, Zoom Out, Actual Size, Fit Board, and Fit Width through the same camera authority. Board bounds are the union of active renderable scene geometry, empty-board availability is explicit, Fit Selection remains predictably disabled until M6 owns selection, and the keyboard adapter accepts exactly one platform modifier while leaving inputs and editable overlays untouched. The command bar uses a fixed-width percentage control plus native macOS/Windows shortcut labels; its menu is a portal overlay and cannot resize the command row, canvas, or side panes.
- Seeded sketch lines now derive a stable 32-bit seed from element identity and primitive salt, emit two exact-endpoint cubic passes, and serialize render-only path numbers through one three-decimal policy. Rectangle edges use explicit stable salts, so reopen and export can reproduce byte-identical geometry without OS randomness.
- One incremental uniform-grid spatial index owns broad-phase world bounds without taking ownership of document stacking. Results use locale-independent stable ID order for callers to reconcile with canonical `childIds`; updates remove stale cells, rebuild is atomic, huge shapes use a bounded global bucket, and huge sparse queries scan existing entries instead of allocating work proportional to empty space. Visible-world bounds and overscan derive purely from the camera, with overscan remaining constant in CSS pixels at every zoom.
- The active-board scene adapter now flattens canonical nested ownership once into derived world bounds, renders only the existing foundation rectangle control, and restores `childIds` stacking after spatial lookup. Its keyed SVG presenter reuses unchanged DOM nodes, regenerates a seeded path only when geometry changes, applies order-only changes without geometry churn, and mounts/unmounts overscanned items imperatively as the external camera moves; React does not render individual document nodes.
- A dedicated packaged-production performance mode validates a fixed 1,000-rectangle document for a real ten-second pan/zoom run. It wraps the browser animation-frame scheduler to measure camera publication plus visibility query and SVG work, measures input-to-final-listener latency, observes long tasks and keyed DOM additions/removals, and uses a React Profiler around the entire canvas to reject any motion-driven commit. The native harness strictly parses one bounded renderer result, enforces p95 frame work ≤16.7 ms, maximum frame work ≤50 ms, p95 input latency ≤50 ms, minimum sample count, exact duration, and zero React commits, then stores per-platform JSON with the ordinary CI artifacts.
- Seventy-eight focused viewport/scene cases include 10,000 deterministic seeded coordinate round trips, framing normalization and resize invariants, 1,000 raw camera updates coalesced into one publication, cursor-anchor preservation, platform shortcut resolution, explicit command availability, keyboard isolation, camera bounds, cancel-safe pointer paths, deterministic sketch goldens, spatial-index failure/oversize cases, fixed 1,000/5,000-element source-level performance fixtures, nested world bounds, incremental scene reconciliation, canonical stacking, keyed DOM reuse, culling, and strict performance-result validation. The full local 56-file/316-test source gate, package, fuse readback, ordinary smoke, eleven-launch packaged visual matrix, create/edit/save/close/reopen workflow, and forced-crash ordinary-launch recovery all pass. The latest local packaged 10.03-second run measured 599 camera frames, 0.70 ms p95/1.90 ms maximum camera work, 18.60 ms p95 input-to-visible latency, zero long tasks, and zero React commits. The deterministic native scene and open zoom-menu artifacts were reviewed at original resolution with crisp seeded outlines, aligned command labels/shortcuts, explicit disabled state, and unchanged shell anchors. The first camera/scene slice also passed [push run 31833568347](https://github.com/Honigstute/Balisami/actions/runs/31833568347) and independent [PR run 31833593703](https://github.com/Honigstute/Balisami/actions/runs/31833593703) on native macOS 26 arm64 and Windows 2025 x64.
- The final command slice passed [push run 31837546787](https://github.com/Honigstute/Balisami/actions/runs/31837546787) and independent [PR run 31837549667](https://github.com/Honigstute/Balisami/actions/runs/31837549667) at commit `ed0332a` on native macOS 26 arm64 and Windows 2025 x64. Both operating systems passed source, package, fuse, smoke, eleven-state visual, project workflow, crash recovery, and ten-second performance gates. The PR artifacts were inspected at original resolution: platform shortcut labels and menu columns remain aligned with identical shell anchors. macOS measured 0.50 ms p95 frame work and 22.10 ms p95 input latency; Windows measured 0.60 ms and 16.60 ms respectively, with zero long tasks and zero React commits on both.

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

### [x] M6 — Selection, gestures, hit testing, and transforms

Depends on: M5

Objective: make manipulation correct and undoable before adding smart assistance.

Current progress (2026-08-15):

- The first M6 slice introduces one immutable external selection store for session-only selected IDs, primary ID, revision, subscriptions, semantic no-ops, ordered Shift-toggle behavior, and stale-ID reconciliation. It has no document or history mutation dependency; selection-only click, toggle, empty-space, and cancelled gestures leave canonical document identity, history state ID, and both history stacks unchanged.
- The existing spatial index now has an exact inclusive point query that returns stable geometry-only IDs without acquiring stacking responsibility. The shared document scene model adds locked metadata, canonical topmost hit stacks, incremental metadata reconciliation, and subscriptions for derived overlays. Normal pointer selection clicks through locked controls; an explicit inspection option can include them. Candidate hits are sorted rather than scanning the full scene order, and a 5,000-element scene fixture enforces the 20-ms p95 hit-test budget.
- The viewport's existing input controller remains the sole pointer owner. Primary click selection, Shift-toggle, screen-pixel click slop, empty-space clearing, and Escape established the initial `idle -> pressed -> idle` contract beside space/primary and middle-button panning. Pointer completion commits selection once; pointer cancellation, capture loss, window blur, teardown, or Escape discards the press without reconstructing state.
- The live document renderer and interaction path now share one scene model instead of building duplicate geometry/index caches. Selection bounds and four token-sized handles render in the fixed-screen SVG interaction layer and update imperatively from camera, scene, and selection subscriptions. Zoom changes world bounds while handles remain eight CSS pixels; selection and camera publications do not trigger React rerenders.
- A deterministic packaged `selection` visual state joins the native shell matrix and proves the outline/handles do not resize or move navigator, canvas, or inspector tracks. The local macOS artifact was reviewed at native resolution. The full local gate passes 59 files / 332 tests, zero high-severity runtime audit findings, package/fuse/smoke, twelve visual launches, real project workflow, forced-crash recovery, and the existing ten-second camera performance probe. That run measured 0.90 ms p95 frame work, 18.60 ms p95 input latency, and zero React commits.
- [Push quality run 31841723444](https://github.com/Honigstute/Balisami/actions/runs/31841723444) and independent [PR quality run 31841726213](https://github.com/Honigstute/Balisami/actions/runs/31841726213) passed commit `e7477d3` on native macOS 26 arm64 and Windows 2025 x64. Both hosts passed the 59-file/332-test source gate, package and fuse verification, smoke launch, twelve-state visual matrix, project workflow, forced-crash recovery, and ten-second performance probe. The selected-scene artifacts were inspected at original resolution with fixed handles and unchanged shell tracks. macOS measured 0.40 ms p95 frame work and 24.20 ms p95 input latency; Windows measured 0.50 ms and 16.50 ms respectively, with zero long tasks and zero React commits on both.
- Empty-space movement now promotes the explicit selection state from pressed to marquee only after the four-screen-pixel click threshold. Left-to-right regions require full containment; right-to-left regions select intersections and use a dashed visual cue. Shift-marquee adds candidates in canonical order, while cancellation restores the exact pre-gesture selection. Region candidate lookup reuses the spatial index, excludes locked items, and passes the 5,000-element 20-ms p95 source budget.
- Alt/Option-click deterministically cycles the canonical topmost overlap stack, and exactly one Ctrl/Cmd modifier plus A selects every unlocked renderable item. The canvas is keyboard-focusable with a geometry-neutral focus ring; editable overlays retain native Select All. Space/middle pan, pointer selection, and wheel/pinch are mutually exclusive while a gesture owns input. External document replacement, pointer cancellation, capture loss, blur, Escape, and teardown all cancel pressed or promoted marquee state through one path.
- A token-owned translucent marquee renders imperatively in the fixed-screen interaction layer and subscribes to the gesture authority without React commits. A separate packaged marquee fixture locks the intersecting visual grammar. Fit Selection is now enabled from the union of live scene bounds for session-selected IDs; only the compact zoom control subscribes to scene/selection revisions, and moving derived geometry refreshes its command target without rerendering the workspace or scene.
- The expanded local gate passes 60 files / 342 tests, package/fuse/smoke, fourteen visual launches, real project workflow, forced-crash recovery, and the ten-second viewport performance probe. The reviewed local marquee and enabled-command artifacts retain the shell tracks and compact menu geometry. The performance run measured 0.80 ms p95 frame work, 17.80 ms p95 input latency, zero long tasks, and zero React commits.
- [Push quality run 31843869377](https://github.com/Honigstute/Balisami/actions/runs/31843869377) and independent [PR quality run 31843872395](https://github.com/Honigstute/Balisami/actions/runs/31843872395) passed commit `21fda12` on native macOS 26 arm64 and Windows 2025 x64. Both hosts passed the 60-file/342-test source gate, package and fuse verification, smoke launch, fourteen-state visual matrix, project workflow, forced-crash recovery, and ten-second performance probe. Artifact review caught that the first deterministic marquee capture was off-canvas despite its DOM assertion; the fixture now keeps exact endpoints inside the minimum viewport and its corrected dashed region plus enabled Fit Selection menu were inspected at original resolution on both platforms with unchanged shell tracks. macOS measured 0.40 ms p95/1.10 ms maximum frame work and 18.80 ms p95 input latency, with one bounded 50-ms long task and zero React commits. Windows measured 0.60 ms p95/1.20 ms maximum frame work and 16.50 ms p95 input latency, with zero long tasks and zero React commits.
- Selected-element movement now promotes through the same pointer owner into an explicit `moving` state after screen-space click slop. One pure capture removes selected descendants from the command roots while retaining every affected descendant for preview, so nested local frames receive one world delta rather than double movement. Shift locks to the dominant original world axis with a deterministic horizontal tie, and modifier changes always recompute from the immutable gesture start.
- A dedicated external move authority coalesces arbitrary raw updates to one publication per animation frame. The keyed SVG scene applies temporary world translations only to affected nodes, while the selection overlay applies the same delta in fixed screen space; neither path writes the document, regenerates sketch paths, rerenders React, or touches unrelated nodes. Escape, pointer cancellation, capture loss, blur, teardown, or external scene replacement clears pending work and restores the pre-drag selected IDs and primary item.
- Pointer-up flushes the exact final delta and sends one validated `element.set-frame` transaction through `ProjectSession`. Selected ancestors receive the command while descendants keep their original local frames. A 500-update nested drag produces one undo entry, undo restores the byte-equivalent starting document, and failed/cancelled gestures produce no command or recovery write. The local gate passes 63 files / 353 tests, package/fuse/smoke, fifteen visual launches, project workflow, forced-crash recovery, and the ten-second viewport probe. The reviewed moving-state artifact keeps the transient object and token-sized handles aligned with unchanged shell tracks; the local performance run measured 0.20 ms p95/0.50 ms maximum frame work, 18.00 ms p95 input latency, zero long tasks, and zero React commits.
- [Push quality run 31845301038](https://github.com/Honigstute/Balisami/actions/runs/31845301038) and independent [PR quality run 31845305726](https://github.com/Honigstute/Balisami/actions/runs/31845305726) passed commit `8a2649c` on native macOS 26 arm64 and Windows 2025 x64. Both hosts passed source, package and fuse verification, smoke launch, fifteen-state visual matrix, project workflow, forced-crash recovery, and the ten-second performance probe. The PR move artifacts were inspected at original resolution on both operating systems with matching transient geometry and stable navigator/canvas/inspector tracks. macOS measured 0.50 ms p95/1.90 ms maximum frame work and 18.50 ms p95 input latency; Windows measured 0.40 ms p95/0.80 ms maximum frame work and 16.90 ms p95 input latency, with zero long tasks and zero React commits on both.
- Single-selection resizing now starts immediately from eight clockwise handles derived from the live selection bounds. The visible squares are token-owned eight-screen-pixel geometry while pure nearest-center hit zones remain sixteen screen pixels at every zoom and device scale; overlapping zones prefer corners and then stable clockwise order. Multi-selection retains its outline but hides inactive resize handles, and the same hit contract supplies native directional cursor feedback without treating DOM layout as geometry.
- One pure resize module captures an unlocked element's immutable local frame plus its derived world origin once. Every west/east/north/south or corner result is recomputed from that snapshot, clamps at an explicit eight-world-unit foundation minimum without crossing the opposite anchor, and keeps the opposite edge or corner fixed. Shift preserves the starting aspect ratio for all eight handles; edge handles keep the opposite-edge midpoint, while corners project onto the immutable starting diagonal to avoid axis-switch jitter. The fallback minimum is isolated for replacement by the M8 per-control definition contract rather than expanding the early control registry.
- A dedicated external resize authority coalesces arbitrary raw pointer updates to one publication per animation frame. Only the selected keyed SVG element regenerates transient seeded geometry; its canonical revision stays untouched, unrelated paths and revisions retain identity, the fixed-screen outline and handles follow the same preview, and cancellation restores the cached canonical node. Pointer-up releases the shared gesture owner before sending one validated `element.set-frame` command through `ProjectSession`; nested parent origins never enter the local frame.
- All eight non-aspect and Shift-anchor cases, minimum clamping, tiny overlapping hit zones, 10–400% zoom, 1–2× DPR conversion, nested local/world coordinates, live modifier changes, hover cursors, 500-update coalescing, every Escape/pointer-cancel/capture-loss/blur/teardown path, command failure, exact selection restoration, one-entry history, byte-equivalent undo, constant handle size, multi-selection handle suppression, and unrelated-node render isolation are automated. The local source gate passes 66 files / 369 tests, zero high-severity runtime findings, package/fuse/smoke, sixteen packaged visual launches, project save/reopen, forced-crash recovery, and the ten-second viewport probe. The reviewed local resize artifact has eight aligned fixed-screen handles and unchanged shell tracks; the performance run measured 0.90 ms p95/1.60 ms maximum frame work, 17.60 ms p95 input latency, zero long tasks, and zero React commits. The first local visual sequence timed out once on the existing `viewportZoom` state after already capturing resize; that state then completed directly in 0.61 seconds and the unchanged complete matrix passed, so no retry or timeout exception was added.
- [Push quality run 31847450058](https://github.com/Honigstute/Balisami/actions/runs/31847450058) and independent [PR quality run 31847452921](https://github.com/Honigstute/Balisami/actions/runs/31847452921) passed commit `a810f3f` on native macOS 26 arm64 and Windows 2025 x64. All four jobs passed the 66-file/369-test source gate, package/fuse/smoke, sixteen-state visual matrix, performance, project workflow, and forced-crash recovery. Both PR resize artifacts were inspected at original resolution with matching eight-handle geometry and stable shell tracks. The push run measured 0.40 ms p95/0.90 ms maximum frame work and 19.40 ms input latency on macOS, and 0.60/1.10 ms plus 16.60 ms on Windows, with zero long tasks and zero React commits. The independent PR Windows result was likewise clean at 0.50/1.00 ms and 16.60 ms; its macOS host retained budgeted editor work at 1.00 ms p95/11.60 ms maximum and 31.60 ms input latency but observed two non-reproduced long tasks up to 126 ms. The independent push and local runs did not reproduce them; future native evidence must continue to report rather than hide this host variance.
- Keyboard nudge now has one platform-neutral held-arrow contract at the viewport input owner. The first accepted keydown captures the current movable selection once, every ordinary repeat adds one world unit and every Shift repeat adds ten, multiple held arrows share one burst, and only release of the final held arrow crosses the command boundary. Alt/Ctrl/Cmd input and editable overlays remain native; pan, pointer gestures, wheel navigation, and keyboard translation remain mutually exclusive; zoom and device scale never enter the world-step calculation.
- A dedicated external nudge authority reuses the proven move-root capture and command builder, so selected descendants follow an ancestor once, nested elements retain local frames, and locked-only selections do not begin. Repeats coalesce to one animation-frame preview publication; the keyed scene and fixed-screen selection overlay consume the same translation path as pointer move without regenerating sketch geometry, rerendering React, or touching unrelated nodes. Escape, selection revision change, window blur, external scene replacement, or teardown clears pending work and publishes the exact canonical geometry without a command.
- Final keyup sends one validated transaction through `ProjectSession`: a 500-repeat nested gesture creates one history entry and one recovery schedule only at completion, while cancellation creates neither; one undo restores the byte-equivalent starting document. Multiple held keys, live Shift step changes, exact modified/editable isolation, locked capture, nested ownership, selection-change/blur/Escape/teardown cancellation, 10–400% zoom and 1–2× DPR independence, command failure, stable eight-pixel handles, and unrelated-node render isolation are automated. The local source gate passes 67 files/377 tests with zero high-severity runtime findings; package/fuse/smoke, seventeen visual launches, project save/reopen, forced-crash recovery, and the ten-second viewport probe pass. The reviewed local nudge artifact retains aligned object/outline/handles and unchanged shell tracks; performance measured 0.90 ms p95/1.60 ms maximum frame work, 18.60 ms input latency, zero long tasks, and zero React commits.
- [Push quality run 31848975385](https://github.com/Honigstute/Balisami/actions/runs/31848975385) and independent [PR quality run 31848978263](https://github.com/Honigstute/Balisami/actions/runs/31848978263) passed commit `79d6e50` on native macOS 26 arm64 and Windows 2025 x64. All four jobs passed source, package/fuse/smoke, seventeen-state visual matrix, performance, project workflow, and forced-crash recovery. Both PR nudge artifacts were inspected at original resolution with matching transient object/outline/handle geometry and stable navigator/canvas/inspector tracks. The independent PR measured 0.60 ms p95/2.10 ms maximum frame work and 19.50 ms input latency on macOS, and 0.50/1.00 ms plus 16.50 ms on Windows, with zero long tasks and zero React commits on both.
- Exact unmodified Delete and Backspace now belong to the viewport input owner only while it is idle. Editable targets, Alt/Ctrl/Cmd/Shift combinations, repeated keydown, held Space, pointer pan/selection gestures, and an active keyboard nudge remain isolated; an accepted key prevents browser navigation without allowing a repeat to cross the command boundary.
- One pure all-or-nothing delete planner evaluates the starting document, deduplicates the selection into canonical scene order, and reuses command-registry availability. Empty, stale, locked, non-empty-container, or inconsistent canonical input rejects the complete plan, so no partial deletion or premature recursive group policy can leak in before M7. Valid siblings become one ordered command transaction.
- `ProjectSession` commits a valid multi-delete once, schedules recovery once, and reconciles session selection only from the accepted document. Rejected planning or commit preserves the exact selection object; accepted deletion removes only the affected keyed scene nodes, preserves unrelated paths/revisions, and one domain undo restores the byte-equivalent document and exact sibling order. Session selection remains deliberately outside document history rather than being silently rewritten on undo. The local gate passes 68 files/386 tests, package/fuse/smoke, eighteen visual launches, project save/reopen, forced-crash recovery, and the ten-second viewport probe. The reviewed deleted-state artifact shows the target absent, selection empty, and unchanged shell tracks; local performance measured 0.90 ms p95/1.60 ms maximum frame work and 18.60 ms input latency with zero long tasks and zero React commits.
- [Push quality run 31850291525](https://github.com/Honigstute/Balisami/actions/runs/31850291525) and independent [PR quality run 31850293858](https://github.com/Honigstute/Balisami/actions/runs/31850293858) passed commit `1808078` on native macOS 26 arm64 and Windows 2025 x64. All four jobs passed source, package/fuse/smoke, eighteen-state visual matrix, performance, project workflow, and forced-crash recovery. Both PR delete artifacts were inspected with matching deletion/empty-selection state and stable navigator/canvas/inspector tracks. The independent PR measured 0.50 ms p95/2.40 ms maximum frame work and 18.00 ms input latency on macOS, and 0.40/0.60 ms plus 16.70 ms on Windows, with zero long tasks and zero React commits on both.
- Duplicate now has exact platform shortcut ownership: `Cmd+D` on macOS and `Ctrl+D` on Windows. The alternate primary modifier, Alt/Shift combinations, editable overlays, repeated keydown, held Space, pointer pan/selection gestures, and active keyboard nudge remain untouched; an exact accepted shortcut suppresses browser behavior and invokes the edit once.
- One pure duplicate planner validates the complete childless selection before emitting a command. It deduplicates into canonical scene order, rejects stale/locked/non-empty-container input, runtime-validates injected IDs, rejects existing or repeated IDs and unrepresentable offsets, preserves local dimensions/properties/links/assets, applies one explicit ten-world-unit X/Y offset, and computes deterministic adjacent insertion indexes independently for each canonical owner. Recursive subtree cloning remains an M7 grouping decision.
- `ProjectSession` commits valid clones in one transaction, schedules recovery once, and selects only clone IDs proven present in the accepted document while mapping the prior primary selection to its clone. Rejected planning, transaction, or accepted output preserves the exact selection. The incremental scene adds only new keyed nodes while source/unrelated paths and revisions keep identity; one undo restores the byte-equivalent document and exact sibling order. The local gate passes 69 files/396 tests across 125 source modules with zero runtime vulnerabilities, package/fuse/smoke, nineteen visual launches, project save/reopen, forced-crash recovery, and the ten-second viewport probe. The reviewed duplicate artifact shows the original plus the ten-unit-offset clone, clone-only fixed-screen handles, and unchanged shell tracks; local performance measured 0.30 ms p95 frame work and 17.30 ms input latency with zero long tasks and zero React commits.
- [Push quality run 31851403605](https://github.com/Honigstute/Balisami/actions/runs/31851403605) and independent [PR quality run 31851405040](https://github.com/Honigstute/Balisami/actions/runs/31851405040) passed commit `af612cc` on native macOS 26 arm64 and Windows 2025 x64. All four jobs passed source, package/fuse/smoke, nineteen-state visual matrix, performance, project workflow, and forced-crash recovery. Both PR duplicate artifacts were inspected with matching original/clone geometry, clone-only selection, and stable navigator/canvas/inspector tracks. The independent PR measured 0.40 ms p95/1.00 ms maximum frame work and 19.70 ms input latency on macOS, and 0.60/1.00 ms plus 16.90 ms on Windows, with zero long tasks and zero React commits on both.
- Exact idle `Cmd/Ctrl+C`, `Cmd/Ctrl+X`, and `Cmd/Ctrl+V` now share the platform-aware viewport edit resolver with duplicate. Editable targets, the alternate primary modifier, Alt/Shift combinations, repeated keydown, held Space, pointer gestures, and keyboard nudge remain isolated. A session-only clipboard authority owns one runtime-validated versioned payload and successive-paste count outside the project document, history, recovery, and selection stores; the project ID deliberately prevents this M6 slice from claiming M12 cross-project or operating-system clipboard interoperability.
- Copy captures a canonical childless, unlocked selection snapshot without history, recovery, or selection changes. Cut prepares that complete snapshot first and publishes it only after one accepted all-or-nothing delete. Paste revalidates the untrusted payload, project, owners, assets, board links, live source ownership, paste count, and every injected ID before emitting commands. It preserves local geometry/properties/links/assets and canonical sibling order, applies a deterministic ten-world-unit copied-paste cascade while restoring the first cut paste at its stored position, commits once through `ProjectSession`, increments its session counter only after success, and selects only pasted IDs proven present in the accepted document with mapped primary identity. Failed capture, planning, ID allocation, or commit preserves the exact clipboard and selection; one undo restores each mutating transaction exactly.
- The local gate for commit `fd2a793` passes 70 files/406 tests across 126 source modules with zero runtime vulnerabilities, package/fuse/smoke, twenty visual launches, project save/reopen, forced-crash recovery, and the ten-second viewport probe. The local paste artifact was reviewed at original resolution with original/ten-unit-offset clone geometry, pasted-clone-only handles, and unchanged shell tracks; performance measured 0.20 ms p95 frame work and 17.30 ms input latency with zero long tasks and zero React commits. [Push quality run 31852557224](https://github.com/Honigstute/Balisami/actions/runs/31852557224) and independent [PR quality run 31852560110](https://github.com/Honigstute/Balisami/actions/runs/31852560110) passed the same source, package, fuse, smoke, twenty-state visual, performance, project-workflow, and forced-crash-recovery gates on native macOS 26 arm64 and Windows 2025 x64. Both PR paste artifacts were inspected at original resolution with matching content/selection and stable navigator/canvas/inspector tracks. The independent PR measured 0.40 ms p95/2.50 ms maximum frame work and 19.60 ms input latency on macOS, and 0.60/1.00 ms plus 16.50 ms on Windows, with zero long tasks and zero React commits on both.
- One external text-edit authority now owns a validated canonical target, session-only draft, composition state, and revision without giving the DOM or document store competing authority. Exact unmodified Enter edits one selected text-capable target and exact unmodified double-click resolves through the shared camera/hit-test path. Escape and teardown cancel; single-line Enter commits; multiline text retains native Enter and uses the exact platform primary modifier plus Enter; blur commits once; a rejected or throwing commit restores the exact draft for retry. Selection replacement and changed/missing canonical capture cancel deterministically. Single-line pasted line breaks normalize at the authority boundary, while multiline content remains exact.
- One always-mounted textarea in the fixed-screen DOM scene layer uses the canonical `worldRectToViewport` transform and bundled wireframe font. Camera and interaction publications update its bounds, font size, value, focus, and IME state imperatively, so draft changes and camera motion do not rerender the document scene or shell. Editable-target routing is checked before every canvas shortcut, preserving native selection, clipboard, composition, and text deletion while suppressing pan/nudge/delete/duplicate/clipboard leakage. Draft edits perform no document, history, or recovery work; one accepted completion produces exactly one `element.set-properties` history entry and one recovery schedule, and undo restores the exact prior document. The generic adapter is intentionally not wired to production rectangles: Text/Button/Input schemas, measurement, and canonical rendering remain M8 registry work.
- Commit `5caf174` closes the M6 source gate at 72 files/424 tests across 128 source modules with zero runtime vulnerabilities. Local package/fuse/smoke, project save/reopen, forced-crash recovery, twenty-one visual fixtures plus the default 125/150/200% scale matrix, and the ten-second viewport probe pass; the reviewed local text-edit artifact retains focused editor/selection alignment and unchanged shell tracks. Local performance measured 0.20 ms p95 frame work and 17.30 ms input latency with zero long tasks and zero React commits. [Push quality run 31853877124](https://github.com/Honigstute/Balisami/actions/runs/31853877124) and independent [PR quality run 31853880785](https://github.com/Honigstute/Balisami/actions/runs/31853880785) passed source, package, fuse, smoke, the complete visual/scale matrix, performance, project workflow, and forced-crash recovery on native macOS 26 arm64 and Windows 2025 x64. Both text-edit artifacts were inspected at original resolution with matching fixed-screen alignment, bundled-font containment, and stable navigator/canvas/inspector tracks. The push run measured 0.40 ms p95/5.30 ms maximum frame work and 18.70 ms input latency on macOS, and 0.40/0.80 ms plus 16.60 ms on Windows, with zero long tasks and zero React commits on both.

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

### [>] M7 — Smart guides, snapping, grouping, and arrangement

Depends on: M6

Objective: complete the geometry foundation that every future control relies on.

Deliverables:

- Pure candidate generation/resolution engine for grid, edges, centers, baselines, container targets, and equal gaps.
- Zoom-independent tolerance, acquire/release hysteresis, stable priority/tie-break rules, bypass modifier, and guide overlay.
- Group/ungroup, lock/unlock, z-order, align, and distribute commands.
- Multi-selection bounds and nested-transform rules.
- Dense-board snapping benchmark using the spatial index.

Verified progress:

- The first M7 slice now owns one pure, runtime-validated snap vocabulary and resolver. Object/container bounds expose start/center/end lines on both axes, grid lines are deterministic across negative coordinates, the six-CSS-pixel acquisition tolerance is converted once by zoom, X/Y score independently, distance and explicit object→container→grid priority precede canonical order/stable-ID ties, and a 1.5× release lock prevents threshold jitter. Bypass returns the exact raw delta and clears locks; inactive Shift axes cannot be reintroduced.
- The disposable scene model queries locked alignment geometry in canonical order while excluding every moved root and descendant. Candidate lookup uses narrow X/Y alignment bands with a 1,200-screen-pixel perpendicular reach, then discards lines outside acquisition/retention tolerance before resolver allocation. The initial square-query implementation was rejected by native CI at 41.98 ms macOS / 84.75 ms Windows p95 on 5,000 nodes; the banded implementation passes the unchanged 20 ms source budget on both native runners.
- Move capture now includes canonical root-union world bounds. Raw pointer updates still coalesce to one animation-frame resolution, transient previews consume only the snapped delta and ephemeral guide descriptors, cancellation commits nothing, and pointer-up emits the same single existing frame-command transaction. Resolver failure safely clears locks and falls back to raw movement. Holding exact `Command` on macOS or `Control` on Windows temporarily bypasses snapping; alternate/cross-platform chords do not.
- Smart guides render as a fixed-screen, pointer-transparent SVG overlay with a dedicated design token. Camera and move publications update two stable line nodes imperatively, so guide strokes remain one CSS pixel, never enter React frame state, never affect shell geometry, and disappear on bypass/cancel. A deterministic `smartGuides` packaged fixture covers the guide/selection/scene relationship.
- The complete local source gate passes 75 files / 460 tests, including ambiguous ties, negative grid lines, all tested zoom bounds, hysteresis, bypass, Shift-axis isolation, selected-subtree exclusion, locked sources, rAF coalescing, fallback safety, guide projection, and the 5,000-node budget. The repackaged macOS app passes the 19-primary-fixture plus three-scale visual matrix and the viewport probe at 0.30 ms p95 frame work / 17.3 ms p95 input latency; one preceding visual launch emitted a transient macOS `TASK_SUPPRESSION_POLICY` warning despite exit 0 and both success markers, and the unchanged complete matrix then passed without an allowlist or retry exception.
- Push run `31855586527` and independent PR run `31855588658` both pass the full native matrix on macOS 26 arm64 and Windows 2025 x64: source, package, fuses, smoke, 22 visual screenshots, packaged performance, save/reopen, and forced-crash recovery. Reviewed original-resolution `smartGuides` artifacts match in geometry, guide alignment, stable shell tracks, clipping, and error-free presentation. The PR-run probes measured 0.5 ms p95 frame work on both systems, 4.8 ms macOS / 1.1 ms Windows maximum frame work, 18.9 ms / 16.5 ms p95 input latency, zero long tasks, and zero React commits.
- Resize snapping now reuses the same resolver vocabulary and indexed scene adapter. One explicit profile maps every clockwise handle to only its moving start/end edge and active axes, so a fixed opposite edge can never become an accidental snap probe. Query regions collapse to those exposed edges; the same six-pixel acquisition, 1.5× release hysteresis, object priority, canonical ties, and exact platform-primary bypass apply without a second snapping implementation.
- Ordinary corner resize resolves both active axes. Shift edge handles retain their existing opposite-edge midpoint, while Shift corners choose exactly one aspect-scale driver: a still-valid hysteresis lock first, otherwise the closest axis with X as the final tie. Minimum-size-inaccessible matches are discarded, and final guide locks are retained only if the clamped world frame actually reaches the target. All eight handles preserve their established opposite anchors and aspect ratio across tested 10–400% zoom and 1–2× DPR routes.
- The resize authority now stores raw pointer input rather than precomputed previews, so candidate generation and resolution run at most once per animation frame. Snapped geometry remains transient; cancellation, scene replacement, bypass, or a throwing resolver clears locks and guides and falls back to exact raw geometry. Pointer-up still emits the existing single `element.set-frame` command, and one undo restores byte-equivalent nested local/world geometry. The shared fixed-screen overlay consumes mutually exclusive move or resize guide snapshots through the same two stable SVG line nodes.
- The source gate passes 76 files / 489 tests across 132 modules. Coverage includes exposed-anchor validation, all eight ordinary and Shift handles, live modifier recomposition, minimum clamp, hysteresis, zoom/DPR, exact bypass routing, 500-update rAF coalescing, resolver failure, cancellation, one-command completion, exact undo, shared guide projection, and the unchanged 5,000-node 20-ms p95 budget. The final local macOS package passes fuses, smoke, all 22 visual captures, performance, save/reopen, and forced-crash recovery at 0.20 ms p95 frame work / 17.6 ms p95 input latency.
- Artifact review caught that the first resize target was clipped behind the inspector on the smaller Windows viewport even though DOM assertions passed. The fixture was corrected to visible field-center and side-bottom targets, the unchanged complete local matrix passed again, and no viewport-specific exception was added. Final push run `31857057795` and independent PR run `31857059615` pass source, package, fuses, smoke, 22 screenshots, performance, save/reopen, and forced-crash recovery on native macOS 26 arm64 and Windows 2025 x64. Corrected original-resolution resize artifacts show both red guide spans, aligned blue handles, and unchanged shell tracks on both systems. The PR probes measured 0.4 ms p95 / 1.2 ms maximum frame work and 19.4 ms input latency on macOS, and 0.6 / 1.0 ms plus 16.5 ms on Windows, with zero long tasks and zero React commits.
- Grouping now has dedicated runtime-validated `element.group` and `element.ungroup` commands. The command pair reparents only through canonical `childIds`, carries exact target child frames in history rather than persisting a second geometry source, preserves dimensions, validates translation, and restores original decimal frames and arbitrary non-contiguous sibling order byte-for-byte on inverse replay. Group, undo, and redo each remain one atomic history operation.
- The pure selection planners require at least two unique unlocked same-owner siblings for group and exactly one unlocked non-empty foundation group with unlocked direct children for ungroup. Group children are canonical bottom-to-top, the frame is their owner-local union, the collapsed group takes the former topmost selected position, and injected IDs are runtime validated. Empty, stale, locked, cross-owner, colliding-ID, overflow, malformed-frame, and malformed-order input reject without document or selection changes. Normal ungroup splices canonical children at the group position while retaining selected-child and unaffected-sibling relative order.
- Exact idle `Cmd/Ctrl+G` and `Cmd/Ctrl+Shift+G` routes commit once through `ProjectSession` and reconcile selection only from accepted output. A transparent scene container keeps a selected group movable, fit-capable, and available as a container snap source without drawing fake control chrome; the fixed-screen overlay shows its bounds without resize handles. Artifact review caught that the first `groupSelection` outline was clipped by the inspector at minimum Windows width even though the matrix passed. The deterministic fixture was reduced to a complete in-viewport group union, the unchanged full matrix passed again, and the corrected local original-resolution image shows every outline edge, unchanged child drawings, and stable shell tracks without a platform exception.
- The local gate passes 77 files / 497 tests across 133 source modules, including 200 seeded nested/non-contiguous fixtures, floating-point inverse restoration, invalid structural payloads, one-transaction selection reconciliation, both platform shortcut mappings, transparent scene presentation, container snapping, and handle suppression. The final macOS package passes fuses, smoke, all 23 visual captures, performance at 0.60 ms p95 frame work / 17.90 ms p95 input latency, save/reopen, and forced-crash recovery while preserving the prior user file byte-for-byte.
- Corrected push run `31858732517` and independent PR run `31858734693` pass the complete source, package, fuse, smoke, 23-image visual/scale, performance, save/reopen, and forced-crash-recovery matrix at commit `4292aee` on native macOS 26 arm64 and Windows 2025 x64. Both final `groupSelection` artifacts were inspected at original resolution: the complete group outline remains inside the canvas, child drawings are unchanged, and navigator/canvas/inspector tracks remain stable. The independent PR measured 0.50 ms p95 / 7.00 ms maximum frame work and 19.30 ms input latency on macOS, and 0.50 / 1.00 ms plus 16.40 ms on Windows, with zero long tasks and zero React commits on both. This supersedes the earlier clipped native artifact rather than accepting a platform exception.
- Locking now has one persisted direct bit and one derived effective-state selector that follows canonical ancestors. Lock Selected reduces live unlocked selection to canonical roots and sets only those bits; Unlock All clears every direct bit on the active board in canonical pre-order. Selection, move, resize, group/ungroup, delete, duplicate, clipboard capture, hit testing, and scene reconciliation consume effective state, so a locked group cannot expose mutable descendants. Accepted lock/unlock actions cross `ProjectSession` once, schedule recovery once, and reconcile selection only after verifying accepted output.
- Multi-selection z-order now owns one runtime-validated complete sibling permutation rather than a sequence of local swaps. All four transforms require live, effectively unlocked canonical roots with one owner; selected and unaffected relative order remain stable, adjacent movement shifts each selected block once, and boundary results are semantic no-ops. Exact inverse commands restore byte-identical nested and flat sibling order. Idle-only `Cmd/Ctrl+2`, `Cmd/Ctrl+3`, primary-arrow, and primary-Shift-arrow routing is editable-safe and repeat-safe on both platforms.
- The local source gate passes 79 files / 512 tests across 136 modules, including 200 seeded nested lock history fixtures, 200 seeded flat/nested sibling permutations, direct/inherited lock boundaries, exact undo/redo, malformed complete-order payloads, shortcut routing, one-transaction/recovery behavior, and accepted-output selection reconciliation. The packaged macOS app passes fuses, smoke, all 23 visual/scale captures, performance, save/reopen, and forced-crash recovery while preserving the prior file byte-for-byte. Original-resolution selection and group artifacts retain aligned bounds and unchanged shell tracks; the ten-second probe measured 0.60 ms p95 / 1.30 ms maximum frame work and 18.30 ms input latency, with zero long tasks and zero React commits.
- Push run `31860123251` and independent PR run `31860126797` pass the complete source, package, fuse, smoke, 23-image visual/scale, performance, save/reopen, and forced-crash-recovery matrix at commit `5e30943` on native macOS 26 arm64 and Windows 2025 x64. The PR selection and group artifacts were inspected at original resolution on both systems: handle geometry and complete outlines remain aligned within unchanged navigator/canvas/inspector tracks, with no clipping or error surface. The independent PR measured 0.70 ms p95 / 6.10 ms maximum frame work and 20.90 ms input latency on macOS, and 0.40 / 1.20 ms plus 16.50 ms on Windows, with zero long tasks and zero React commits on both.
- Align/distribute now shares one pure same-owner selection-root planner with z-order. Alignment requires two live, effectively unlocked canonical roots and holds the primary canonical root fixed for left, center, right, top, middle, or bottom; descendant primary identity resolves to its selected root and missing identity falls back to the topmost root. Horizontal/vertical distribution requires three roots, sorts by geometric leading edge with canonical ties, keeps the outer pair fixed, and creates equal nonnegative edge gaps. Insufficient span, stale/cross-owner/locked input, invalid output, and semantic no-ops reject without history or selection changes. Nested world targets convert back to owner-local frames and every accepted action remains one exact `element.set-frame` transaction with byte-equivalent undo/redo.
- Exact idle `Cmd/Ctrl+Alt/Option+1…6` routes the six documented alignment actions on both platforms without stealing editable, repeat, Shift, alternate, or cross-platform chords. Distribution intentionally exposes the same planner/availability/action API without inventing an undocumented shortcut, ready for the later multi-selection toolbar or menu. One accepted multi-command alignment crosses `ProjectSession` once, schedules recovery once, and canonicalizes selection only after exact accepted-output verification. The deterministic `alignSelection` fixture is generated through the real planner rather than hand-positioned.
- Commit `377965f` passes the local source gate at 80 files / 520 tests across 137 source modules with zero runtime vulnerabilities. Coverage includes all six primary-anchor alignments, both equal-gap axes, outer-pair identity, no-op and rejection boundaries, 200 seeded flat/nested exact undo/redo fixtures, exact platform shortcut routing, accepted-output reconciliation, one history/recovery boundary, and stable visual geometry. The final local macOS package passes fuses, smoke, all 24 visual/scale captures, performance, save/reopen, and forced-crash recovery while preserving the prior file byte-for-byte; the ten-second probe measured 0.90 ms p95 / 1.50 ms maximum frame work and 17.90 ms input latency, with zero long tasks and zero React commits.
- Native artifact review caught that the first alignment composition placed its common right edge under the inspector boundary at the minimum runner viewport even though DOM geometry assertions passed. Commit `bb81377` keeps the same real planner and three-element selection but uses the smaller primary root so the entire outline and common edge remain visible; the unchanged complete local matrix passed again without a viewport-specific exception. Corrected push run `31861896573` and independent PR run `31861898150` pass source, package, fuses, smoke, 24 visual/scale captures, performance, save/reopen, and forced-crash recovery on native macOS 26 arm64 and Windows 2025 x64. Both corrected `alignSelection` artifacts were inspected at original resolution: all three differently sized controls terminate on the same visible primary edge inside a complete selection outline, with matching geometry, stable navigator/canvas/inspector tracks, and no error surface. The independent PR measured 0.40 ms p95 / 1.60 ms maximum frame work and 22.40 ms input latency on macOS, and 0.40 / 0.90 ms plus 16.70 ms on Windows, with zero long tasks and zero React commits on both.
- Equal-gap snapping now extends the existing move resolver for same-owner selection roots without adding a parallel gesture or history path. Bounded row/column corridors inspect adjacent stationary siblings only, support bridge/repeat-before/repeat-after relations, retain the existing zoom-independent hysteresis and bypass behavior, and render two constant-screen dimension spans through the fixed overlay. Cross-owner movement and resize deliberately retain ordinary snapping rather than claiming undefined spacing semantics.
- Commit `403f491` passes the local 81-file / 543-test source gate across 138 source modules with zero runtime vulnerabilities, then passes package, fuse, smoke, 25 visual/scale captures, performance, save/reopen, and forced-crash recovery. Independent [PR run 31872033178](https://github.com/Honigstute/Balisami/actions/runs/31872033178) passes the same complete matrix on native macOS 26 arm64 and Windows 2025 x64. Both original-resolution `equalGaps` artifacts were inspected with complete selected geometry, matching red dimension spans, stable navigator/canvas/inspector tracks, and no error surface. The PR measured 0.40 ms p95 / 0.90 ms maximum frame work and 18.90 ms input latency on macOS, and 0.70 / 1.20 ms plus 16.50 ms on Windows, with zero long tasks and zero React commits on both.
- Push run `31872031489` independently passed the complete macOS matrix, but its Windows source job measured one 20.66-ms snap-query p95 against the 20-ms source budget and stopped before packaging; the same commit's independent Windows PR job passed source and every packaged gate. This is recorded as a timing-gate stability issue to fix during MVP-A rather than hidden with a retry or used to invalidate the separate successful native evidence.

Paused after the verified MVP foundation cut (2026-08-15):

- Text-baseline snapping until the canonical control text-layout service exposes real baselines.
- Parent/container-padding and board/content edge/center targets.
- Equal-size resize suggestions and any further advanced snap-target vocabulary.
- Final M7 exit-gate consolidation across those deferred target classes.

Exit gate:

- Golden geometry tests cover ambiguous candidates, negative coordinates, nested groups, all zoom bounds, and modifier changes.
- Guide visuals never enter persisted state, history, hit testing, thumbnails, or export.
- Snap/hit-test performance meets the 5,000-element p95 budget.

### [~] MVP-A — Testable wireframing alpha

Depends on: M0–M6 and the verified M7 slices recorded above

Objective: deliver the shortest honest desktop workflow that a user can install and test now, then use that feedback to prioritize the paused and later milestones.

Committed alpha scope:

- Expand the existing control registry, not a parallel catalog, for Rectangle, Text Label, Button, and Text Input with validated defaults, minimum sizes, scene rendering, text capability, and compact inspector metadata.
- Replace the loading shelf with a stable fixed-slot library and click-to-insert; add deterministic insertion position/offset and select the accepted new element.
- Replace navigator and inspector placeholders with the active Wireframe 1 card plus a schema-driven selection inspector for position, size, and representative text properties.
- Expose working undo/redo in the command surface and preserve existing move, resize, snap, keyboard, duplicate/delete, clipboard, group, lock, layer, align, save, Save As, Open, recovery, and pane behavior.
- Add one packaged alpha acceptance flow that creates each representative control, edits text and geometry through the production command surface, undoes/redoes, saves, closes, reopens, and verifies the same document without console or shell-layout errors. The existing packaged move/resize/snap fixtures remain part of the same required matrix.
- Produce unsigned test artifacts suitable for immediate trusted-tester use: a macOS application ZIP and a Windows x64 installer. Signing, notarization, automatic update, polished icons, and public distribution remain M13.

Explicitly outside this alpha cut:

- Drag-from-shelf creation, Quick Add ranking, full category/search behavior, thumbnails, multi-board CRUD, notes editing, links, alternates, presentation, assets, symbols, broad catalog parity, export, public file association, signing/notarization, and automatic updates.
- The paused advanced M7 targets listed above. These resume from the same resolver after alpha feedback; they are not reimplemented inside controls.

Acceptance flow:

1. Launch the packaged app and see the active Wireframe 1 in the navigator.
2. Insert Rectangle, Text Label, Button, and Text Input from the shelf.
3. Select, move, resize, snap, edit representative text/geometry in the inspector, and use undo/redo.
4. Save As, close, reopen, and confirm control type, text, geometry, and stacking are unchanged.
5. Complete the flow on native macOS arm64 and Windows x64 with stable shell anchors, no uncaught/console errors, and recovery still passing.

Current progress (2026-08-15):

- One canonical registry now owns the five structural/alpha control types, validated defaults and properties, default/minimum sizes, palette metadata, text capability, and visual kind. The scene presenter, insertion path, inspector, resize minima, and document invariants consume that registry instead of duplicating control facts.
- The live shell exposes four fixed insertion slots, the real Wireframe 1 card, stable no/single/multi-selection inspector states, position/size/text editing, inline text editing, and enabled history controls. Selection changes replace only inspector content; the shell, navigator, canvas, notification, and inspector tracks remain fixed.
- The packaged alpha probe uses the production insertion and history boundaries to create all four controls, lays out a representative card, changes button geometry/text, undoes and redoes the transaction, saves through the real native workflow, waits for a settled clean state, closes, reopens through the production codec, and verifies exact type/order/frame/text. It also emits a durable original-resolution alpha screenshot.
- Source verification passes 84 files / 550 tests across 143 source modules with strict formatting, lint, boundary, and type checks plus zero runtime vulnerabilities. The snap microbenchmark now excludes 20 explicitly documented warmup frames while retaining the same measured 100-frame/20-ms steady-state budget; packaged input latency continues to protect startup behavior.
- The latest local macOS arm64 package passes fuse readback, launch smoke, all 26 visual/scale captures, the alpha create/edit/undo/redo/save/close/reopen probe, forced-crash recovery, and performance at 0.60-ms p95 frame work / 9.80-ms p95 input latency. Both the deterministic `mvpAlpha` artifact and live saved-project alpha artifact were inspected at original resolution with complete controls, stable shell tracks, and no error surface.
- Native run `31873792383` passed every source, package, visual, performance, project, recovery, maker, and upload step on macOS and Windows, but original-resolution review caught the shared alpha composition extending under the narrower Windows inspector boundary. That artifact is rejected rather than accepted as a platform exception. One shared acceptance-layout contract now drives renderer setup, main-process verification, and the deterministic fixture, with a source assertion that every frame plus a 24-unit margin fits the minimum canonical canvas.
- Corrected native run `31874438920` passed the complete matrix and proved the new composition fully visible on Windows, but the live screenshot exposed a separate render-timing race: the domain session was already clean while React could still show the prior `Saving captured changes…` and project-name labels. That artifact is also rejected. The packaged ready marker now waits for the existing two-frame renderer presentation barrier after save resolution, so capture requires both clean model state and painted clean UI.
- `npm run make` produces `out/make/zip/darwin/arm64/Balsamic-darwin-arm64-0.1.0.zip`, a corrected 120,274,879-byte archive containing `Balsamic.app`. Native CI runs the same maker after all gates and uploads separate macOS arm64 and Windows x64 tester artifacts; signatures and public trust remain intentionally deferred.

Exit gate:

- The complete acceptance flow passes locally in a packaged build and in native macOS/Windows CI.
- Original-resolution alpha artifacts are reviewed on both platforms; selecting every representative control leaves the navigator, canvas, and inspector tracks fixed.
- A tester can install or unpack the provided platform-specific artifact and complete the documented flow without development tools.

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

Push the coherent MVP-A slice, run the complete native macOS arm64 and Windows x64 matrix, inspect both live alpha screenshots and distributable contents, and publish the exact artifact links/test instructions. Mark MVP-A complete only after both native jobs and tester artifacts pass; otherwise keep its active status and fix the failing boundary without expanding scope.
