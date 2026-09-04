# Balsamic troubleshooting library

Purpose: preserve reusable failure mechanics and diagnostic methods without turning individual bug reports into permanent product requirements.

This is not a roadmap, changelog, incident log, or replacement for tests. Roadmap status remains exclusively in `docs/MILESTONES.md`; architecture and interaction contracts remain in `docs/PROJECT_BLUEPRINT.md`. Add an entry here only when it helps diagnose a future class of failures.

## How to use this file

1. Match the observed symptom to a failure class below.
2. Verify the listed invariants at their authoritative boundaries.
3. Reproduce both the normal path and every relevant terminal or interruption path.
4. Fix the ownership boundary rather than masking the visible reset.
5. Add deterministic tests for the newly exposed event ordering.

Each entry should describe:

- observable symptoms, including what changes with speed, timing, focus, or platform;
- the general mechanism, without project- or user-specific details;
- authoritative state and transient state;
- likely failure boundaries and misleading diagnoses;
- a focused diagnostic procedure;
- required regression coverage;
- conditions that would disprove the hypothesis.

## Failure class: transient gesture preview reverts at completion

### Observable pattern

- An object follows the pointer during a drag but returns to its starting geometry at or just after release.
- Slow gestures may succeed more often than fast gestures.
- Releasing over another region, outside the original surface, or near a window boundary may change the result.
- The preview can look correct even though history, persistence, and canonical geometry never receive the final change.

### General mechanism

Interactive transforms commonly have two authorities:

1. A transient preview recomputed from an immutable gesture-start snapshot and the latest pointer sample.
2. Canonical document geometry changed once by a validated command when the gesture completes.

The preview is intentionally disposable. If the completion event is missed, misclassified as cancellation, delivered to a different target, or processed after ownership is cleared, the preview disappears and the unchanged canonical geometry becomes visible again. The apparent “snap back” is therefore often a terminal-event or ownership failure, not a rendering or snapping calculation error.

Fast input exposes this class because promotion, pointer capture, the first movement sample, final movement, release, capture loss, and command dispatch can occur before an animation frame publishes. Correctness must not depend on an intermediate frame or a particular event target receiving every event.

### Required invariants

- A gesture has exactly one pointer owner and one mutually exclusive interaction mode.
- Every preview derives from the immutable start plus the latest absolute pointer delta; previews never accumulate deltas.
- Pointer coordinates cross the viewport-to-world boundary exactly once per sample.
- Completion flushes the final pointer sample synchronously before building the command.
- One completed gesture emits at most one command transaction and one history entry.
- Cancellation restores the start without a command.
- Completion and cancellation are idempotent terminal paths; later duplicate events are harmless.
- Native pointer capture is the primary delivery mechanism, but correctness has a bounded fallback when capture is refused or transferred.
- Button-up capture loss is distinguished from active-button capture loss, explicit `pointercancel`, window blur, Escape, and teardown.
- Capture and release failures do not throw through the renderer or strand an active gesture.
- Session-only preview, selection, guides, and pointer ownership never enter persisted state.

### Likely failure boundaries

- `pointerup` is listened for only on the original surface and capture was not obtained.
- Every `lostpointercapture` is treated as cancellation, including a loss caused by button release.
- The final coordinates are scheduled for a later animation frame, then cancellation clears the pending sample first.
- Pointer ownership is cleared before the final sample is resolved, or cleared too late and a synchronous document reconciliation cancels it.
- A component remount or event-listener replacement silently cancels the gesture.
- Preview and command builders read different camera transforms, selection roots, modifiers, or snap locks.
- Command dispatch is rejected because the project is frozen, a dialog owns input, the target became stale, or the generated command is a semantic no-op; the UI then removes the preview without exposing why.
- A short movement never crosses the deliberate click-to-drag threshold. This can resemble a failure but is a separate policy decision.
- Snapping legitimately resolves near the starting position. Disable snapping through the documented modifier before diagnosing this as event loss.

### Diagnostic procedure

Inspect the complete lifecycle as one trace:

```text
pointer down
  → ownership/capture attempt
  → click-to-drag promotion
  → immutable target capture
  → latest absolute pointer sample
  → preview and snap resolution
  → pointer up or terminal substitute
  → synchronous final-sample flush
  → validated command transaction
  → canonical scene reconciliation
  → preview cleanup and capture release
```

For each transition, record pointer ID, interaction mode, buttons, coordinates, camera revision, selection revision, raw delta, adjusted delta, terminal reason, command result, and history-entry count. Keep diagnostics bounded and development-only; do not log document content or personal paths.

Then compare these cases:

- press and release with no intermediate move event;
- many move events followed by release before the scheduled frame runs;
- ordinary captured release inside the surface;
- capture refusal followed by movement and release elsewhere in the same window;
- capture loss with no buttons pressed;
- capture loss while the initiating button remains pressed;
- explicit pointer cancellation, Escape, window blur, and component teardown;
- release while snapping is active and while snap bypass is held;
- release after crossing a region boundary and at multiple camera zooms;
- accepted command, rejected command, thrown command boundary, and semantic no-op.

If the terminal path reports a successful changed transaction and canonical geometry still reverts, this failure-class hypothesis is disproved; inspect document reconciliation, owner-local/world conversion, or a later undo instead.

### Regression requirements

- Assert exact committed geometry from the release coordinate, not merely that a commit occurred.
- Assert no pending animation-frame callback remains after completion or cancellation.
- Assert 500 or more raw updates still produce one history entry.
- Assert one undo restores byte-equivalent starting geometry.
- Assert duplicate terminal events cannot create a second command.
- Assert refusal or transfer of pointer capture does not lose an in-window release.
- Assert release-signaled capture loss completes, while active-button capture loss and explicit cancellation do not commit.
- Assert nested selections move only canonical roots and retain owner-local frames.
- Assert snapping preview and committed geometry use the same adjusted delta.
- Run the interaction in a packaged build and retain performance and visual geometry gates when shared input code changes.

### Common incomplete fixes

- Adding another delayed state update without fixing terminal ownership.
- Testing only a normal `pointermove` followed by `pointerup` on the same element.
- Treating all capture loss as cancellation.
- Committing every pointer event to avoid preview loss, which breaks history and performance.
- Reading DOM bounds as canonical geometry.
- Disabling snapping globally when the failure is actually missed completion.
- Swallowing command failure and removing the preview without a diagnostic signal.

## Failure class: readiness signal precedes mutation availability

### Observable pattern

- The correct project or screen is visible, but an immediate create/edit action is ignored.
- A deterministic startup or reopen workflow fails while the same action succeeds after a short delay.
- Read-only assertions pass, yet the first validated command returns no result because a transition freeze is still active.

### General mechanism

Asynchronous replacement can publish the new canonical document before its transition-finalizer releases the mutation gate. If the public `ready` signal is derived only from document presence, consumers may act during this intermediate publication. The UI looks ready while the command authority correctly rejects input.

### Required invariants

- Public readiness means both canonical data is installed and the normal command boundary accepts work.
- Transition/freeze state has one owner and is included in the readiness derivation rather than replicated in each consumer.
- Consumers do not use timers or animation frames to guess when a transition has finished.
- The transition publishes again after releasing its freeze.

### Diagnostic procedure

Trace every publication during startup/replacement with document presence, transition ownership, mutation-freeze state, readiness, and one harmless command result. A publication with `ready = true` and a rejected command confirms this class. If the command authority accepts work, inspect stale closures, IDs, validation, or document ownership instead.

### Regression requirements

- Hold the native replacement promise unresolved and assert readiness remains false and commands remain blocked.
- Resolve the transition, then assert readiness becomes true and the same command is accepted.
- Exercise at least one packaged immediate-action workflow without adding delay-based retries.

### Common incomplete fixes

- Delaying only the failing test or consumer.
- Adding a second local `isLoading` flag instead of fixing the authoritative readiness selector.
- Releasing the mutation freeze before the replacement is fully validated and installed.

## Entry template

```markdown
## Failure class: concise mechanical name

### Observable pattern

### General mechanism

### Required invariants

### Likely failure boundaries

### Diagnostic procedure

### Regression requirements

### Common incomplete fixes
```
