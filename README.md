# Balsamic

Balsamic is the working title for a free, offline-first desktop wireframing editor for macOS and Windows. The product target is the speed and clarity of a Balsamiq-style editor, implemented with original branding, artwork, and assets.

The repository is in the application-foundation stage. It contains a secure Electron shell and the guardrails needed to build the editor without starting a premature control catalog. The document model, command history, viewport, interaction state machine, snapping, persistence, and quality harness come first.

## Canonical project documents

Read these in order before changing the project:

1. [AGENTS.md](AGENTS.md) — working rules and continuity protocol.
2. [Project blueprint](docs/PROJECT_BLUEPRINT.md) — product surface, architecture, design system, performance budgets, and quality requirements.
3. [Milestones](docs/MILESTONES.md) — the only authoritative source for roadmap order and progress.

When code exists, each implementation decision must remain traceable to one of those documents or to a focused architecture decision record referenced by the blueprint.

## Product boundaries

- Desktop application built from one shared Electron codebase.
- Native deliverables: signed/notarized macOS application and signed Windows installer.
- Projects work offline and save to a portable, versioned file format.
- macOS and Windows receive the same editor behavior and visual system.
- Balsamiq is a product reference, not the shipped name or source of copied proprietary assets.

## Development

Use the Node.js version pinned in `.nvmrc`, then install the exact lockfile:

```sh
npm ci
```

Common commands:

```sh
npm start                 # launch the development desktop app
npm run verify            # format, lint, boundaries, types, tests, runtime audit
npm run package           # create the unsigned package for the current operating system
npm run verify:fuses      # read hardened fuses back from the packaged executable
npm run smoke:packaged    # launch and verify the packaged application
```

Packaging is native: run or build on macOS for the `.app`/future `.dmg`, and on Windows for the `.exe`/future installer. The cross-platform workflow in `.github/workflows/quality.yml` runs the same source checks and packaged smoke test on both systems.
