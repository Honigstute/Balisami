# Balsamic project blueprint

Status: Canonical foundation specification
Last reviewed: 2026-08-14

This document is the durable source of truth for product behavior, architecture, editor interaction, visual quality, performance, and testing. It deliberately separates reference observations from implementation decisions so later work does not silently turn assumptions into requirements.

## 1. Product objective

Build a fast, calm, offline-first desktop wireframing editor for macOS and Windows. It should preserve the low-friction workflow people value in Balsamiq: find a control quickly, place it, edit it in context, align it precisely, link screens, and share the result.

“Reference parity” means matching useful behavior and workflow quality. Public releases must use an original name, application icon, illustrations, component drawings, and other brand assets. Do not ship Balsamiq trademarks or copied proprietary resources.

### First-release principles

- One shared editor implementation and one portable project format.
- Local work never requires an account or network connection.
- Every interaction is predictable, undoable, keyboard-accessible where practical, and recoverable after a crash.
- The editor feels identical on macOS and Windows while respecting platform shortcut labels and native dialogs.
- Foundation quality takes priority over the number of controls.
- The shell remains visually stable as selection, content, errors, and asynchronous assets change.

### Explicit non-goals for the foundation

- Real-time collaboration, accounts, cloud storage, AI generation, and plugin APIs.
- Mobile and browser releases.
- Importing Balsamiq's private project format without a separately validated legal and technical decision.
- A large control catalog before the registry and editor primitives pass their quality gates.

## 2. Reference evidence

The initial evidence set consists of seven screenshots supplied on 2026-08-14:

| Reference                               | Dimensions | Evidence                                              |
| --------------------------------------- | ---------: | ----------------------------------------------------- |
| `Screenshot 2026-08-14 at 13.27.36.png` |  3840×2125 | Full desktop shell and empty project                  |
| `Screenshot 2026-08-14 at 13.27.50.png` |   3834×246 | Middle section of control library                     |
| `Screenshot 2026-08-14 at 13.27.58.png` |   2445×156 | End section of control library                        |
| `Screenshot 2026-08-14 at 13.28.18.png` |    300×433 | Wireframe navigator with selected and unselected rows |
| `Screenshot 2026-08-14 at 13.29.02.png` |    346×683 | Search Box inspector                                  |
| `Screenshot 2026-08-14 at 13.29.07.png` |    358×627 | Rectangle inspector                                   |
| `Screenshot 2026-08-14 at 13.29.30.png` |    287×822 | Pointy Button inspector                               |

The screenshots establish spatial structure and property grammar. They do not prove every feature, keyboard shortcut, state, or control. Unobserved behavior must be entered into the control/interaction inventory and verified before being called reference parity.

Official product documentation confirms that the broader reference workflow includes quick-add search, UI libraries, boards, notes, alternate versions, symbols/components, links, presentation, custom images/icons, undo/redo, zoom modes, PNG/PDF export, autosave, and backup recovery. Research links are recorded in section 15.

## 3. Surface inventory

### 3.1 Stable application shell

The desktop window is a fixed shell around a flexible center viewport:

```text
┌─ native title/menu surface ───────────────────────────────────────────┐
├─ project + command bar ───────────────────────────────────────────────┤
├─ reserved status strip ───────────────────────────────────────────────┤
├─ library categories ──────────────────────────────────────────────────┤
├─ horizontally scrollable control shelf ──────────────────────────────┤
├──────────────┬────────────────────────────────────┬───────────────────┤
│ Wireframes   │                                    │ Inspector         │
│ navigator    │ Canvas viewport                    │                   │
│              │                                    │ internal scroll   │
├──────────────┴────────────────────────────────────┴───────────────────┤
│ Overlay portal: menus, dialogs, color pickers, toasts, tooltips       │
└───────────────────────────────────────────────────────────────────────┘
```

Only the center column consumes remaining width. Navigator and inspector widths are tokenized, resizable within defined limits, and persistent. Their scrollbar gutters are stable. Collapsing a pane is an explicit user action, never a side effect of selection or validation.

The command surface must eventually contain project identity, undo/redo, zoom/view actions, quick add, presentation, and utilities. During early milestones, unavailable actions remain absent or predictably disabled; they must not generate placeholder errors.

### 3.2 Control library

Observed categories are `All`, `Android`, `Assets`, `Big`, `Buttons`, `Common`, `Containers`, `Forms`, `Icons`, `iOS`, `Layout`, `Markup`, `Media`, `Symbols`, and `Text`.

The shelf uses fixed-size thumbnail slots with a preview, one-line ellipsized label, tooltip for the full name, and stable loading placeholder. It supports category filtering, horizontal wheel/trackpad movement, keyboard navigation, click-to-insert, drag-to-place, and quick-add search.

Observed catalog examples include:

- Navigation/layout: Accordion, App Bar, Breadcrumbs, Browser, Cover Flow, Field Set, splitters, rules, scrollbars, Tab Bar, Toolbar, Tree Pane, V.Tabs, Window.
- Inputs/actions: Button, Button Bar, Checkbox, Circle Button, Color Picker, ComboBox, Date Picker, Numeric Stepper, On/Off Switch, Pointy Button, Radio Button, Search Box, sliders, Text Area, Text Input, Time Picker.
- Content/data: Calendar, charts, Data Grid, Icon, Icon and Text, Image, Link, Link Bar, List, Menu, Tag Cloud, text label/paragraph/subtitle/title.
- Devices/media: iPad, iPhone, Smartphone, Video Player, Volume Slider, Webcam and iOS-specific controls.
- Markup/shapes: Arrow, Callout, Comment, curly braces, Help Button, Rectangle, Red X, Scratch Out, Shape, Site Map, Squiggly Line, Street Map, Tooltip.

This list is an inventory seed, not permission to implement each item independently. Every catalog item must be an instance of the registry contract in section 7.

### 3.3 Wireframe navigator

The left pane owns ordered boards/wireframes. Each row has a fixed thumbnail frame and title. Selection changes color and affordances without changing row geometry, type metrics, or thumbnail dimensions.

Required behavior includes create, select, rename, reorder, duplicate, delete with confirmation/recovery, context menu, thumbnail generation, keyboard navigation, notes, and alternate versions. Thumbnails are caches derived from board data and generated outside the interaction-critical path.

### 3.4 Inspector

The right pane swaps a schema-driven property body for the selected control while the pane itself remains mounted. Its common modules are:

- Object type/header and optional variant menu.
- Position: X and Y.
- Size: width and height, plus auto-size when supported.
- Layering: back, front, backward, forward.
- Border and fill/color controls.
- Opacity.
- Links.
- State/variant.
- Text style: bold, italic, underline, and size.

Control-specific modules observed in the references include border style, scrollbar presence, search-shape/icon mode, icon search and utilities, menu affordance, point direction, and contextual help.

Inspector fields bind to validated commands, not directly to mutable state. Multi-selection displays shared values and an explicit mixed state. Popovers overlay; validation messages use reserved field space or a tooltip. Switching selection follows one deterministic scroll policy, initially reset-to-top.

### 3.5 Canvas interaction inventory

- Pan: space-drag, middle-button drag, trackpad gestures, and scrollbars when enabled.
- Zoom: pointer-centered wheel/pinch, actual size, fit, fit width, fit selection, bounded percentage.
- Create: shelf click, shelf drag, quick add, paste, image drop, and supported draw shortcuts.
- Select: click, shift-add, toggle, marquee, select all, cycle/ignore overlapping items, escape.
- Transform: move, keyboard nudge, resize, aspect lock, axis lock, duplicate-drag, numeric position/size.
- Arrange: group/ungroup, lock/unlock, z-order, align, and distribute.
- Edit: in-place text, inspector properties, copy/cut/paste/duplicate/delete.
- Assist: grid, edge/center/baseline snapping, equal-gap suggestions, smart guides, and bypass modifier.
- Navigate: boards, links, presentation back/forward.
- History: undo/redo at semantic command granularity.

## 4. Technology and module boundaries

### 4.1 Platform decision

Use Electron with TypeScript, React, and Vite. Electron is selected because both desktop targets receive the same bundled Chromium engine. Rendering consistency is more important for this canvas-heavy product than Tauri's smaller binary.

Use the operating system's standard window frame initially. A custom title bar adds platform-specific dragging, traffic-light, snap-layout, accessibility, and full-screen complexity without improving the editor foundation.

The foundation toolchain is pinned rather than ranged:

| Tool           | Version |
| -------------- | ------: |
| Node.js        | 22.22.3 |
| npm            |  10.9.8 |
| Electron       |  43.4.0 |
| Electron Forge |  7.11.2 |
| Electron Fuses |   2.1.3 |
| React          |  19.2.8 |
| Vite           |   7.3.6 |
| TypeScript     |   6.0.3 |
| Zod            |   4.4.3 |

`package.json`, `package-lock.json`, and `.nvmrc` are authoritative for executable versions. Electron Forge still labels its Vite plugin experimental, so its exact version is pinned and upgrades require a verified package/build/smoke cycle on macOS and Windows. Vite 7 is intentional: Forge 7's integration still emits deprecated Rollup options under Vite 8.

Runtime dependencies must pass `npm audit --omit=dev --audit-level=high`. As of 2026-08-14, Electron Forge's development-only packager chain still depends on `extract-zip@2.0.1`, for which GHSA-jmr9-qjv8-65gv has no patched release. Balsamic accepts this narrowly scoped, temporary build-time risk because Packager consumes checksummed Electron release archives rather than user project files. The vulnerable package is never shipped in the application. Remove this exception as soon as Forge/Packager publishes a fixed chain; do not add any use of `extract-zip` or process untrusted archives through the build toolchain.

### 4.2 Initial source structure

Keep one application repository and enforce module boundaries before extracting packages:

```text
src/
  main/          Electron lifecycle, menus, dialogs, files, updates
  preload/       narrow typed bridge; no feature logic
  renderer/
    shell/       persistent desktop layout and panels
    editor/      viewport, gestures, selection, guides, scene layers
    controls/    registry and control implementations
    inspector/   schema-driven property UI
    design/      tokens and reusable application UI primitives
  domain/        project model, commands, history, validation, selectors
  persistence/   file format, migrations, atomic save, recovery
  shared/        IPC contracts and truly cross-boundary value types
tests/
  fixtures/      versioned project and performance fixtures
```

Dependency direction is explicit:

```text
main ──uses──> persistence/domain contracts
preload ──exposes──> shared IPC contract
renderer UI ──uses──> editor + domain public interfaces
editor ──uses──> domain selectors and control registry
persistence ──uses──> domain schema and migrations
domain ──uses──> no Electron, React, DOM, or filesystem APIs
```

Circular imports and renderer imports from `main` or Node built-ins fail CI.

## 5. Domain and state model

### 5.1 Persisted document state

The normalized model contains `Project`, ordered `Board` records, `ElementNode` records, content-addressed assets, symbols/components, links, notes, and alternates. Every record has a stable identifier. Every stored number and enum is validated and finite.

`ProjectDocumentSchema` is the authoritative runtime structure, while `parseProjectDocument` is the public untrusted-input boundary. It returns stable field paths and caps surfaced issues so one malformed document cannot create an error-message storm. Cross-record ownership, ordering, identity, link, asset, and cycle rules are validated with the shape rather than repaired silently.

Each board or group owns one ordered `childIds` list. That list alone defines parent membership and stacking order; parent indexes and z-order values are derived at runtime and are never persisted as competing copies.

The M2 read contract derives an `ElementLocation` index from those lists, containing only owner and sibling index. Commands may carry the same discriminated board/element owner value, but nodes never persist it. Ordered record selectors return the canonical board/element records, and selection-ready world bounds accumulate ancestor frame origins from local geometry. These indexes and bounds are disposable and must be rebuilt from the document after a revision.

An element contains identity, `controlType`, local world-space geometry, lock state, and control properties. Child geometry is local to its owning container; world bounds are derived. Defaults come from the control registry and are materialized or normalized at one defined boundary.

Persisted state excludes selection, hover, guides, pointer gestures, open UI, viewport position unless explicitly saved as user preference, generated thumbnails, render caches, and error notifications.

### 5.2 Session and interaction state

Session state is split by responsibility:

- Viewport: pan, zoom, viewport dimensions, device scale.
- Selection: selected IDs, primary ID, hover target, text-edit target.
- Gesture: state-machine mode, start snapshot, pointer ownership, transient delta.
- Shell: pane visibility/width, active tool/category, open overlay.
- Diagnostics: deduplicated notices and recoverable region failures.

Derived values such as selection bounds, enabled commands, inspector mixed values, and visible elements are selectors. They are not separately synchronized state.

### 5.3 Commands and history

All document mutations use typed commands with validation, apply, inverse/restore information, and human-readable labels. Commands include create/delete, set properties, move/resize, reorder, group/ungroup, board operations, and asset operations.

`dispatchDocumentCommand` is the public mutation boundary. It runtime-validates command input, returns the original document reference for failures and semantic no-ops, and returns a frozen structurally shared revision plus a validated inverse for changes. Each candidate is checked against the authoritative project invariants before it can escape the dispatcher; unchanged maps and records retain identity for fine-grained selectors and rendering.

Foundation element commands cover insertion, childless deletion, sibling order, complete JSON-safe property replacement, and local-frame geometry. Insertions are initially childless and deletion rejects containers with children; M7 grouping commands will own subtree/group semantics instead of embedding an implicit recursive policy in basic CRUD. Command-availability selectors expose the same current order and child constraints to UI surfaces without persisting enabled flags.

A gesture owns transient preview state and commits exactly one command on completion. Escape or pointer cancellation restores the start snapshot. Text entry and repeated keyboard nudges may coalesce within explicit time/identity rules. Undo/redo restores exact document state and never stores renderer objects.

History uses monotonically distinct state identifiers rather than a loose dirty boolean. A save captures both a document snapshot and its state identifier; only that identifier becomes the saved state when the asynchronous write succeeds. Edits made while saving therefore remain dirty, while undoing exactly back to a saved state becomes clean.

`DocumentHistoryState` is an immutable session value containing the current document, bounded undo/redo entry stacks, current/saved/next state identities, and in-flight save identities. New branches never reuse abandoned IDs. Undo and redo replay the same validated command boundary and restore the entry's prior or subsequent state ID; a failed or unexpected no-op replay leaves the complete history unchanged and reports corruption.

Multi-command transactions apply to a temporary document and either commit one entry or expose no partial result. Semantic no-ops are omitted. Coalescing requires an explicit stable key from the interaction owner, never occurs across an undo branch, and is blocked when the current state is saved or captured by an in-flight save. This keeps async save snapshots reachable and gives input/gesture code deterministic grouping without time-dependent behavior in the domain layer.

## 6. Viewport and interaction engine

### 6.1 Coordinate contract

World coordinates are the only canonical element geometry. Branded/named `WorldPoint`, `WorldRect`, `ViewportPoint`, and related types prevent accidental mixing. The viewport module exclusively implements:

```text
screenPoint = worldPoint × zoom + pan
worldPoint  = (screenPoint − pan) ÷ zoom
```

It also owns clamping, pointer-centered zoom, fit calculations, device-pixel conversion, and rounding policy. No feature reimplements these formulas.

The model retains floating-point precision. Only inspector display values and intentional snap results are rounded under one documented policy. Each gesture preview is recomputed from its start snapshot plus the current pointer delta, never accumulated from the previous preview frame.

Snap tolerance and handle size are specified in screen pixels and converted at query time so they feel constant at every zoom level. Persisted element geometry never includes viewport transforms.

### 6.2 Scene layers

The first implementation uses SVG for the document scene because it provides deterministic vectors, simple hit-testing, crisp scaling, and shared geometry for export. It is not rendered as thousands of independently subscribed React components.

Layers are explicit:

1. Background/grid.
2. Document elements under one viewport transform.
3. Selection, handles, smart guides, and marquee overlay.
4. DOM overlay for in-place text editing and popovers.

Selection handles and guide strokes retain screen-space thickness. Text is measured only after bundled fonts are ready. Rough/sketch paths use a stable seed derived from element identity and are cached until geometry/style inputs change.

During move/resize/pan, animation-frame scheduling updates only the affected scene/overlay transform. The domain store is committed at gesture end. React does not process every raw pointer event through a global state update.

### 6.3 Gesture state machine

Input modes are explicit and mutually exclusive: `idle`, `marquee`, `moving`, `resizing`, `panning`, `creating`, and `editingText`. Pointer capture, modifier interpretation, cancellation, focus ownership, and allowed transitions have unit tests.

This avoids hidden interaction conflicts such as beginning a marquee while text editing, losing a drag outside the viewport, or allowing a space-pan gesture to commit an element move.

### 6.4 Hit testing and visibility

Use broad-phase spatial indexing for visible-element queries, hit testing, and snapping candidates, followed by exact control hit shapes. Query topmost elements by document order. Locked elements remain renderable but follow explicit selection rules.

Viewport culling and index updates are incremental. Correctness is proven before optimization, but the public interfaces must not assume a full scan.

## 7. Control definition registry

The registry is the primary extension boundary and must be established before catalog expansion. Each `ControlDefinition` owns:

- Stable type identifier and file-format version.
- Display name, category, aliases, tags, and keyboard/draw shortcut.
- Default, minimum, maximum, and auto-size behavior.
- Validated property schema and default properties.
- Capability flags: text, border, fill, icon, link, state, resize axes, grouping behavior.
- Inspector field/section schema.
- Scene renderer and precise hit shape.
- Thumbnail renderer.
- Property migrations.
- Optional accessibility label and export behavior.

The palette, quick add, inspector, serialization validator, thumbnail service, and renderer consume this same record. Adding a normal control must not require editing parallel type switches elsewhere.

M2 begins with the deliberately narrow `ControlSpec` subset needed to validate persisted structure: stable type identity and whether a control can own children. Its only entries are the foundation group and rectangle placeholders. M8 expands this same registry contract with rendering and authoring metadata; it does not introduce a competing registry.

Reusable scene primitives include text, rough rectangle, line, ellipse, icon, image, list/table, container chrome, selection-safe padding, and seeded sketch stroke. Reusable inspector primitives include number pair, segmented choice, checkbox, select, color, slider, text style, link, icon search, help, and mixed-value handling.

## 8. Smart guides and arrangement

The snap engine is a pure module. It receives moving bounds, nearby indexed bounds, board/grid targets, zoom-derived tolerance, active axes, and modifiers; it returns adjusted delta plus guide descriptions.

Candidate classes are:

- Grid points/lines.
- Element left/center/right and top/middle/bottom edges.
- Text baseline when the control exposes one.
- Parent/container padding targets.
- Equal horizontal or vertical gaps.
- Board/content center and edges.

Resolution is deterministic: explicit grid setting, closest distance, candidate priority, stable element/order tie-break. X and Y resolve independently. Acquire/release hysteresis prevents a guide from flickering near the threshold. A documented modifier bypasses snapping without changing the committed pointer delta unexpectedly.

The M7 move implementation acquires within six CSS pixels and retains the current lock through a 1.5× release threshold. Candidate discovery converts both values exactly once by zoom and queries two narrow spatial-index bands: an X-alignment band and a Y-alignment band, each extending at most 1,200 CSS pixels in the perpendicular direction. It never uses a dense square scan. Locked controls remain valid alignment geometry, while moved roots and all affected descendants are excluded. Object candidates win container candidates, which win grid candidates only after geometric distance; canonical scene order and stable IDs resolve remaining ties. Holding the exact platform primary modifier (`Command` on macOS, `Control` on Windows) bypasses snapping and clears hysteresis locks without changing the raw pointer delta. Move resolution runs at most once per animation frame, and resolver failure falls back to raw movement without crossing or disabling the existing command boundary.

Guides are ephemeral overlays and never export or enter history. Align/distribute actions use the same geometry vocabulary but execute as commands.

## 9. Persistence and recovery

The project file is a portable container with a manifest, versioned project JSON, and deduplicated assets. Exact extension/name is decided before public alpha; internal code does not depend on marketing naming.

The version-1 logical container contract is deliberately independent of its eventual extension:

| Entry                    | Contract                                                                                                                           |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `manifest.json`          | Canonical JSON with technical format ID `wireframe-project`, file-format version `1`, and the fixed document/asset entry locations |
| `project.json`           | The runtime-validated `ProjectDocument` in canonical JSON                                                                          |
| `assets/sha256/<digest>` | Raw bytes named by their lowercase 64-character SHA-256 digest; multiple asset IDs with identical bytes share one entry            |

Canonical JSON recursively sorts object keys, preserves array order, uses two-space indentation, and
ends with one newline. The codec copies binary input/output and orders metadata first, followed by
asset entries in lexical digest order. This makes equivalent documents deterministic without making
the domain model aware of archive or marketing details.

The initial uncompressed input limits are 10,002 entries, 64 KiB for the manifest, 32 MiB for project
JSON, 64 MiB per asset, and 256 MiB total. Parsed JSON is additionally capped at 64 nesting levels and
250,000 values before domain validation. These are codec-owned security limits, not document or UI
constants. Decode errors distinguish invalid envelopes/entries, invalid UTF-8, malformed or truncated
JSON, unsupported formats, older versions without a migration, newer versions, invalid documents,
and missing/unexpected/damaged assets. A physical container reader must enforce compressed-input and
expansion limits before handing this same logical entry set to the codec.

The physical version-1 container is a deterministic ZIP archive produced asynchronously with the
exactly pinned, zero-dependency `fflate` adapter. JSON entries use DEFLATE level 6; digest-named assets
use ZIP store mode because supported images are normally compressed already. Entries use fixed DOS
epoch metadata (1980-01-01), neutral OS/attribute fields, and logical entry order, so the same project
produces byte-identical archives on macOS and Windows. The complete archive is capped at the logical
256 MiB ceiling plus a bounded 512-byte-per-entry/64-KiB ZIP-overhead allowance. Before inflate, the
reader checks archive size, entry count, path allowlist, duplicates, each declared expanded size, and
the declared expanded total; the logical codec then revalidates the materialized entries and content.

Main-process reads open one file descriptor, reject non-files and oversized metadata before
allocation, and accept bytes only when a fixed-size read plus one-byte probe proves the file did not
change mid-read. Saves validate and encode the complete archive before touching the destination,
write a randomly named exclusive sibling temporary file, loop through partial writes, flush and close
it, then replace the destination. POSIX uses atomic rename plus parent-directory fsync. If Windows
rejects replace-on-rename, the prior regular file moves to a unique sibling backup; a failed promotion
restores it, and a failed restore preserves and reports both old/new recovery paths. Non-file targets
are never moved aside, ordinary failed writes clean their temporary file, and backup cleanup failure
is a successful-save warning rather than a false loss report.

Recovery lives only under Electron `userData/recovery-v1/<projectId>`. It does not reuse the user-save
token flow: a frozen recovery capture contains the current document reference and history state ID
without changing dirty state, pending saves, or coalescing. Each accepted recovery point consists of
an immutable content-addressed `snapshots/<sha256>.zip` plus a strict, canonical, at-most-64-KiB
`current.json` pointer containing state/time/source metadata, archive length, and digest. The archive
is written and flushed first; the pointer advances atomically last. A crash before pointer promotion
therefore leaves the prior recovery current, while a crash after promotion selects the new verified
snapshot. Recognized orphans are cleaned without deleting the currently referenced digest, cleanup
is bounded to the project recovery directory, and corrupt pointer/source evidence is preserved rather
than silently overwritten. Loading verifies pointer schema, project identity, byte length, SHA-256,
archive limits, and the full project codec before exposing a document. The optional chosen-file path
is metadata only; recovery never reads from or writes to it.

Startup discovery streams at most 1,000 entries from `recovery-v1`, reports at most 50 isolated
issues, and reads only each strict pointer plus the referenced archive's regular-file metadata. It
does not inflate every archive merely to build a chooser; the full length, digest, ZIP, envelope,
document, and asset checks run only when a recovery is selected. Per-project orphan cleanup inspects
at most 128 snapshot-directory entries. Exceeding either limit is a typed refusal, never an unbounded
scan or a partial deletion.

Recovery points are retained until an explicit accepted action clears them. Clear requires the exact
pointer identity observed by the caller and is serialized with writes for that project; a newer or
different pointer wins and remains untouched. Clearing removes the pointer first, then only its
recognized digest archive and empty directories. Missing points are idempotent, unrecognized files
and corrupt evidence are preserved, and post-pointer cleanup failures are successful-clear warnings.

One main-process autosave scheduler exists per open project. It captures immutable document/state
identity and copies asset bytes at schedule time, waits 750 ms after the latest edit, keeps only the
latest pending state, and allows only one journal write in flight. A state/file-path identity already
durable or currently writing is not duplicated. Failed writes remain available for one explicit
flush or a later edit but never self-loop into an error storm. Normal shutdown stops new schedules,
waits for the active write, and flushes the latest pending state; an explicit discard mode cancels
only work that has not begun. Archive encoding and filesystem work remain in the main process.

One `ProjectLifecycleController` exists per editor window and permits only one active persistence
session. It validates new documents, opens user files through the bounded codec, discovers recovery
metadata, restores only the exact pointer the user selected, and rejects a stale selection if the
pointer changes before load. History and live document mutation remain in the renderer/domain layer;
the controller retains only project identity, chosen file path, save-in-progress state, recovery
identity, and the scheduler. Starting another project always requires an explicit close.
Restoring never promotes the pointer's source-file metadata into an authorized destination: the
restored session has no chosen file path until the user completes Save As.

One renderer `ProjectSession` is the live document/history authority for its window. It creates or
accepts a domain-validated document, owns save-token allocation and resolution, schedules immutable
recovery snapshots after accepted commands, and exposes a stable external-store view to React.
Project documents remain opaque in the shared/preload contract so the domain parser stays their only
schema owner. Preload checks exact path-free DTO shapes; main parses the document again, brands state
and token IDs, bounds and copies asset bytes, and rejects unexpected keys before invoking native
workflow code. No filesystem path, raw Electron response, or technical rejection crosses back.

User saves still begin in domain history and cross the main boundary as immutable
`{document,stateId,tokenId}` snapshots. A successful write returns the same receipt plus the exact
archive length and SHA-256 from the bytes that reached disk. The session then flushes pending
recovery. It clears recovery only when that exact deterministic archive identity is now present in
the user file, which also handles a restored history whose local state IDs restarted. If an older
save completes after a newer edit, the newer recovery digest differs and remains. Recovery refresh
or cleanup failure is a bounded warning on an otherwise successful user save, never a false save
failure.

Electron owns project path selection through one window-scoped native-dialog adapter. Open and Save
As cancellations are ordinary outcomes, not errors; malformed native responses fail without changing
the active session. Suggested names are bounded and safe on macOS and Windows, but the dialog does not
invent a public extension or file filter before that product decision is recorded. One exclusive
main-process workflow coordinates open, save, Save As, recent projects, and close. Its renderer-facing
result vocabulary contains completed, cancelled, or one stable problem plus at most three deduplicated
warnings. It never returns filesystem paths, native exceptions, archive details, or recovery paths;
technical causes go only to the structured main-process reporter.

Recent projects are non-authoritative versioned metadata under `userData`. The canonical file is
bounded to 64 KiB and 20 newest-first entries, uses opaque path-derived IDs outside the main process,
serializes mutations, and is replaced atomically. A successful open or save remains successful if
this convenience list cannot update. Missing recent targets are forgotten only after an actual
file-not-found result. Malformed metadata is preserved and reported rather than silently overwritten.

Ordinary renderer startup asks main for one bounded, path-free choice set before creating a project.
Main retains exact recovery pointers behind random window-scoped IDs and exposes only capture time,
a bounded display name, recent-project summaries, and a count of ignored damaged evidence. The user
must explicitly restore one point, discard one exact point, or start a new project while retaining
the recovery evidence. A failed or stale choice keeps the evidence and the same focused overlay open;
technical pointer, digest, project identity, and path data never cross preload.

Open and recent-project replacement validate and decode the selected file into one immutable
main-process candidate before the current project is asked to close. The renderer freezes commands,
captures one exact history/save-token snapshot when dirty, and sends only that path-free replacement
context. Cancellation or failure rejects the temporary token and restores the same renderer history;
success closes the native persistence session before installing the already-validated candidate as
the renderer's sole new history. Selecting the already-open file is refused before save/close so a
staged older copy can never replace newly saved work.

Unsaved close has exactly three native decisions: Save, Cancel, and Don't Save. Cancel, including a
cancelled Save As, leaves the session active. Save must durably complete before close; a save failure
also leaves the session active. Don't Save explicitly discards the known recovery point before the
session is released. The window close coordinator sends one opaque request ID; the renderer freezes
new commands before capturing dirty state and its save token, then unlocks and rejects that exact
token only if main reports cancellation or failure. Duplicate close attempts cannot open duplicate
dialogs. If the renderer is gone, main flushes the last snapshot it accepted and retains recovery
before authorizing the native window to close.

Normal close flushes and retains the latest recovery; a failed flush reopens scheduling so close can
be retried rather than stranding a half-closed session. Explicit discard cancels work not yet begun,
waits for any active write, and conditionally clears the exact known pointer. Cleanup residue is a
warning because the project/recovery safety decision has already completed. User-file saves are
serialized per session, and close refuses to race an active user-file save.

The packaged crash-recovery acceptance probe uses two launches of the real binary and an external
process owner. Its writer saves a prior user project, applies one edit through document history,
waits until the production scheduler/journal can read that exact state, and then waits without
calling a close or shutdown path. The harness kills that process forcibly, snapshots the prior file
bytes, and relaunches the binary through the ordinary window, preload, startup-choice, and renderer
history path. The verifier selects the opaque recovery choice, confirms the exact recovered note is
live, dirty, and recovery-sourced (therefore Save As is still required), and proves the prior file is
still byte-identical. The test-only writer is confined after real-path resolution to an initially
empty, contract-named directory beneath the operating system temp root; it cannot be pointed at
ordinary project or user-data directories.

Rules:

- Parse untrusted project files with runtime schemas and size limits.
- Migrate sequentially through pure, fixture-tested migrations.
- Never overwrite the only valid copy in place. Save to a sibling temporary file, flush/close it, then atomically replace when supported.
- Maintain a recovery journal/snapshot separate from the user's file.
- Autosave recovery state promptly; debounce writes to the user's chosen file.
- Detect newer unsupported schema versions and open read-only or fail with a clear recovery path.
- Preserve the failed source file when migration or parsing fails.
- Content-address assets and generate thumbnails/previews as disposable caches.

Save status occupies a reserved shell location and does not shift the layout. The application restores unsaved work after a forcibly terminated packaged process as an acceptance test on macOS and Windows.

## 10. Visual system and layout stability

### 10.1 Direction

The application chrome is a quiet precision tool: dense, neutral, legible, and subordinate to the wireframe. Its signature—and the one deliberate visual risk—is the contrast between disciplined desktop chrome and seeded hand-drawn controls on the canvas. Decorative gradients, glass effects, oversized typography, and gratuitous animation do not belong.

Use bundled **IBM Plex Sans** for the entire application UI and bundled **Comic Neue** for wireframe content. Both are available under the SIL Open Font License; exact font files and license notices are frozen and checked into the repository during M4. Feature code uses semantic font tokens rather than family names.

### 10.2 Token contract

The design module owns, at minimum:

- Neutral canvas/chrome palette, one blue selection/accent family, semantic warning/error/success colors.
- A 4 px spacing grid with a small documented exception list.
- Compact type scale and allowed weights.
- Application control heights, border widths, radii, shadows, icon sizes, pane widths, toolbar rows, and thumbnail sizes.
- Focus, hover, selected, pressed, disabled, mixed, invalid, and loading states.
- Overlay z-index tiers.
- Motion durations and reduced-motion behavior.

Feature CSS may consume semantic tokens only. Border/weight changes between interaction states must not alter the outer box.

The initial core palette is deliberately small:

| Token name | Value     | Role                                           |
| ---------- | --------- | ---------------------------------------------- |
| Ink        | `#202428` | Primary text and strong icons                  |
| Muted ink  | `#67717A` | Captions and secondary actions                 |
| Chrome     | `#F3F4F5` | Toolbar and application background             |
| Panel      | `#E4E6E8` | Inspector fields and selected neutral surfaces |
| Divider    | `#C8CDD2` | Borders, separators, and disabled outlines     |
| Canvas     | `#FFFFFF` | Board and high-contrast field surface          |
| Draft blue | `#2E9DDF` | Selection, focus, active category, and guides  |

Semantic error, warning, and success colors are separate accessibility tokens, not alternative accents. M4 may tune these starting values only through a full-shell visual review on both platforms; feature work may not invent additional accent families.

### 10.3 Initial shell metrics

These are implementation starting points and will be frozen by screenshot review, not duplicated as local constants:

| Metric                          |                                       Initial target |
| ------------------------------- | ---------------------------------------------------: |
| Base spacing unit               |                                                 4 px |
| UI body size                    |                                                13 px |
| Caption size                    |                                                11 px |
| Standard control height         |                                                24 px |
| Compact control radius          |                                                 6 px |
| Navigator default/min/max width |                                   224 / 180 / 360 px |
| Inspector default/min/max width |                                   320 / 288 / 420 px |
| Inspector horizontal inset      |                                                16 px |
| Control shelf height            |                                                84 px |
| Selection/guide accent          | tokenized blue; final value after visual calibration |

### 10.4 No-layout-shift rules

- The shell uses explicit grid rows/columns; only the viewport track flexes.
- Inspector and navigator own their scrolling and stable scrollbar gutters.
- Inspector selection changes only the body schema; the outer pane and canvas bounding boxes remain fixed.
- Menus, select lists, tooltips, color pickers, toasts, and dialogs render in an overlay portal.
- Async icons/images use fixed aspect-ratio placeholders.
- Labels truncate or wrap inside predetermined bounds.
- Errors never add repeated banners. Field errors have reserved space; global notices use a capped, deduplicated overlay or reserved status strip.
- Region error boundaries isolate navigator, shelf, viewport, and inspector failures without recursively remounting or repeating notifications.

The automated geometry gate is strict: switching among no selection, single-control schemas, and multi-selection may not move the viewport or shell region edges by more than 1 CSS pixel. Cumulative layout shift after initial ready state is zero for ordinary editor operations.

## 11. Error, diagnostics, and safety UX

Classify errors as field validation, recoverable operation, persistent project problem, or fatal startup failure. Each class has one presentation surface.

- Field validation: inline reserved slot; no toast.
- Recoverable operation: one deduplicated toast with corrective action.
- Persistent project problem: stable status center entry.
- Destructive/fatal decision: focused dialog with plain-language options.

Notifications are keyed, capped, rate-limited, and dismissible. The same failure cannot create thousands of messages. Production logs are structured, bounded, redact file content and personal paths where possible, and are available through “Open diagnostics folder.” Developer stacks remain in logs, not user dialogs.

Save/export/import failures never destroy the current in-memory document. Closing with unsaved work follows a tested state machine and native platform conventions.

## 12. Performance budgets

Benchmarks run against versioned fixtures and a recorded reference-machine profile. Budgets are measured in packaged production builds.

| Scenario                                        | Foundation budget                                            |
| ----------------------------------------------- | ------------------------------------------------------------ |
| Pan, move, or resize with 1,000 simple elements | p95 frame work ≤ 16.7 ms; no task > 50 ms in a 10 s gesture  |
| Pointer input to visual feedback                | p95 ≤ 50 ms                                                  |
| Select/hit-test in a 5,000-element board        | p95 ≤ 20 ms                                                  |
| Undo/redo a 1,000-element multi-move            | p95 ≤ 50 ms                                                  |
| Open a representative 5 MB local project        | ≤ 2 s to interactive on reference hardware                   |
| Autosave                                        | no renderer task > 16.7 ms; filesystem work outside renderer |
| Selection changes                               | zero shell layout shift; no full scene rerender              |

If a budget fails, profile before changing rendering technology. Caching, culling, spatial indexing, selector granularity, and interaction-local transforms are the first tools. A Canvas/WebGL rewrite requires measured evidence and an architecture decision record.

## 13. Testing and quality gates

### 13.1 Test layers

- Domain unit/property tests: geometry, validation, commands, history, grouping, ordering, migrations.
- Interaction tests: state-machine transitions, pointer capture/cancel, modifier combinations, zoom anchoring, snapping priorities.
- Component tests: inspector fields, mixed values, library search, keyboard navigation, errors.
- Visual regression: complete shell and representative control/inspector states.
- Packaged-app E2E: create, edit, save, close, reopen, recover, export on macOS and Windows.
- Performance fixtures: small, 1,000-element, 5,000-element, asset-heavy, deep-group projects.

Packaged smoke readiness is an explicit renderer-to-main handshake through the allowlisted preload API. A smoke pass requires the React shell to mount, runtime IPC to validate, the trusted renderer to report ready, and a short stabilization interval to remain free of load failures, preload failures, renderer crashes/unresponsiveness, and console warnings/errors. The passing run captures the rendered window, and CI uploads it per operating system for visual review. Merely resolving `BrowserWindow.loadURL()` is not sufficient evidence.

The packaged project-workflow probe uses the real renderer, preload, trusted IPC, history session,
main controller, persistence workflow, and native close handshake. Inside a fresh real-path-confined
OS-temp `userData` root, the renderer creates a project, accepts a command, saves to one fixed safe
probe file through injected dialogs, and closes normally. Main then reopens that file through a new
lifecycle and verifies the exact edit. The external owner requires a clean exit, exact marker, empty
stderr, and non-empty file; the test hook cannot target an ordinary user or project directory.

### 13.2 Required visual matrix

- No selection, each representative inspector schema, and multi-selection.
- Navigator selected/unselected/context state.
- Every library category, horizontal end position, loading, and missing preview.
- Menus, dropdowns, tooltip, color picker, modal, toast cap, and region failure.
- 100%, 125%, 150%, and 200% display scaling where supported.
- Minimum window size, common laptop size, and large display.
- macOS Intel/Apple Silicon builds and Windows x64; Windows ARM when promoted to supported.

Screenshot tests include bounding-box assertions for shell regions so a visually subtle canvas shift cannot be approved accidentally.

### 13.3 Definition of done

A feature is done only when:

- Acceptance behavior and failure behavior are implemented.
- Type checking, linting, unit tests, and affected visual/E2E tests pass.
- No uncaught renderer/main errors or unexpected console noise occur in the tested flow.
- Keyboard and pointer paths are covered.
- Layout remains within geometry gates.
- Performance-sensitive changes meet their fixture budget.
- Canonical docs and control/command schemas are updated in the same change.

## 14. Decision log

| ID    | Decision                                                   | Rationale                                                                                                             | Status                                    |
| ----- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| D-001 | Electron, React, TypeScript, and Vite                      | One Chromium engine across macOS/Windows; mature desktop packaging                                                    | Accepted                                  |
| D-002 | Standard OS window frame initially                         | Avoid premature platform-specific title-bar complexity                                                                | Accepted                                  |
| D-003 | World-space geometry plus one viewport transform           | Prevent coordinate drift and duplicate conversion logic                                                               | Accepted                                  |
| D-004 | Command-only persisted mutations                           | Deterministic undo/redo, validation, and tracing                                                                      | Accepted                                  |
| D-005 | SVG scene with separate overlays first                     | Correct vector behavior and export path; optimize based on measurement                                                | Accepted                                  |
| D-006 | Schema-driven control definition registry                  | One source for catalog, rendering, inspector, search, and persistence                                                 | Accepted                                  |
| D-007 | Fixed shell plus overlay feedback                          | Eliminate selection/error-driven layout movement                                                                      | Accepted                                  |
| D-008 | Portable versioned container with atomic save/recovery     | Offline reliability and safe evolution                                                                                | Accepted                                  |
| D-009 | Pin the Forge Vite integration exactly                     | Contain the migration risk of Forge's experimental Vite plugin                                                        | Accepted                                  |
| D-010 | Temporarily accept Forge's dev-only `extract-zip` advisory | No patched upstream release exists; production dependency audit is clean and packaging input is trusted/checksummed   | Temporary; review every dependency update |
| D-011 | Configure and read back every packaged Electron fuse       | Forge 7's fuse plugin pins an older schema; a strict post-package hook prevents new Electron fuses being ignored      | Accepted                                  |
| D-012 | Derive document types from pinned Zod runtime schemas      | Keep persisted TypeScript types and untrusted-input validation aligned without parallel hand-maintained contracts     | Accepted                                  |
| D-013 | Brand-neutral deterministic v1 logical file entries        | Keep schema, assets, tests, and future archive adapters stable while the public product name and extension can change | Accepted                                  |
| D-014 | Pinned asynchronous `fflate` ZIP adapter                   | Produce portable deterministic archives without blocking the renderer or implementing security-sensitive ZIP logic    | Accepted                                  |
| D-015 | Renderer-owned project history with opaque validated IPC   | Keep one live document authority while main exclusively owns paths, dialogs, durability, recovery, and native close   | Accepted                                  |

Replace or substantially revise an accepted decision only through a focused ADR that records evidence, migration impact, and rollback plan.

## 15. Research references

- [Electron introduction](https://www.electronjs.org/docs/latest/)
- [Electron security recommendations](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron distribution overview](https://www.electronjs.org/docs/latest/tutorial/distribution-overview)
- [Electron fuse reference](https://www.electronjs.org/docs/latest/tutorial/fuses)
- [GitHub advisory for the unpatched `extract-zip` build-time dependency](https://github.com/advisories/GHSA-jmr9-qjv8-65gv)
- [IBM Plex Sans license](https://github.com/IBM/plex/blob/master/LICENSE.txt)
- [Comic Neue project and license](https://github.com/crozynski/comicneue)
- [Balsamiq editor toolbars](https://balsamiq.com/support/docs/creating-and-editing/editor-overview/toolbars/)
- [Balsamiq keyboard and interaction reference](https://balsamiq.com/support/docs/creating-and-editing/shortcuts/)
- [Balsamiq alternate versions](https://balsamiq.com/support/docs/creating-and-editing/alternates/)
- [Balsamiq reusable components](https://balsamiq.com/support/docs/wireframing/symbols/using/)
- [Balsamiq images and icons](https://balsamiq.com/support/docs/creating-and-editing/images-and-icons/)
- [Balsamiq autosave behavior](https://balsamiq.com/support/docs/account-management/desktop/autosave/)
- [Balsamiq backup and recovery](https://balsamiq.com/support/docs/account-management/desktop/backups/)
- [Balsamiq PDF export](https://community.balsamiq.com/support/docs/sharing/exporting/pdf/)
