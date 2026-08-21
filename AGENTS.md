# Agent working agreement

This file is the durable entry point for every developer or AI agent working on Balsamic. Its purpose is to prevent quality loss across long-running work and context resets.

## Start-of-task protocol

Before editing code:

1. Read this file completely.
2. Read `docs/PROJECT_BLUEPRINT.md` completely.
3. Read `docs/MILESTONES.md` completely.
4. Locate the single active milestone and work only inside its stated scope.
5. Consult `docs/TROUBLESHOOTING.md` when the reported symptom matches a recorded failure class.
6. Inspect the existing implementation and tests instead of reconstructing intent from chat history.

If the documents and code disagree, stop expanding the feature. Resolve the discrepancy in the canonical document and implementation together.

## Sources of truth

Each concept has exactly one authoritative owner:

| Concept                                                                         | Authoritative owner            |
| ------------------------------------------------------------------------------- | ------------------------------ |
| Roadmap progress and current milestone                                          | `docs/MILESTONES.md`           |
| Product, interaction, architecture, visual, and quality rules                   | `docs/PROJECT_BLUEPRINT.md`    |
| Persisted project state                                                         | Domain document store          |
| Undoable mutations                                                              | Command registry               |
| Viewport conversion                                                             | Viewport transform module      |
| Control defaults, capabilities, renderer, search metadata, and inspector fields | Control definition registry    |
| Colors, spacing, typography, control dimensions, and z-index                    | Design token module            |
| Native filesystem and operating-system access                                   | Electron main/preload boundary |

Do not duplicate these values in feature components, fixtures, or platform-specific code. Derived caches are disposable and must be reproducible from their source.

## Non-negotiable engineering rules

- The renderer never imports Node.js or Electron directly. It uses a narrow, typed preload API.
- Persisted state is never mutated from React components. All document changes are validated commands.
- A continuous pointer gesture creates one undo-history entry, not one entry per pointer event.
- Canvas geometry lives in world coordinates. Pointer conversion goes through the viewport transform once.
- Selection, hover, guides, open popovers, and viewport position are session state, not document data.
- Do not use DOM measurements as canonical document geometry.
- Add controls through the control registry. A control must not require separate switch statements in the palette, renderer, inspector, serializer, and search.
- Use design tokens. Do not introduce arbitrary colors, fonts, spacing, radii, control heights, or z-index values in feature CSS.
- Use no more than one bundled application UI family and one bundled wireframe-content family. Iconography does not count as a font and must not use platform emoji.
- Popup menus, tooltips, color pickers, transient errors, and notices overlay the shell; they do not insert layout height.
- Sidebars scroll internally. Selecting a different element must not resize or remount the application shell or canvas viewport.
- User-facing errors are deduplicated and actionable. Never surface repeated raw exceptions or developer stack traces.
- Keep functions and modules focused. Add abstractions only when the active milestone needs them.

## Change protocol

Every implementation change must include proportionate verification:

- Domain behavior: unit tests and invariants.
- Interaction behavior: deterministic gesture tests.
- Visual behavior: screenshot or geometry regression tests when layout can change.
- Persistence behavior: round-trip, migration, corruption, and atomic-write tests.
- Native behavior: packaged-app smoke tests on the affected operating system.
- Performance-sensitive behavior: benchmark fixture and recorded result.

Do not mark a milestone complete when tests are skipped, the packaged application emits uncaught errors, or its exit gate is only partially satisfied.

## End-of-task handoff

Before ending a substantial task:

1. Run the checks required by the active milestone.
2. Update only the status/checklist in `docs/MILESTONES.md`; do not create competing progress files.
3. Record any changed architectural decision in the blueprint decision log or a referenced ADR.
4. Leave code comments for non-obvious invariants, workarounds, and performance constraints.
5. Report what changed, verification performed, remaining risks, and the exact next milestone item.
