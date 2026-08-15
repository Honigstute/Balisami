# Balsamic

Balsamic is the working title for a free, offline-first desktop wireframing editor for macOS and Windows. The product target is the speed and clarity of a Balsamiq-style editor, implemented with original branding, artwork, and assets.

The repository now contains a testable MVP alpha on top of the editor foundation. The current vertical slice can insert Rectangle, Text Label, Button, and Text Input controls; select, move, resize, snap, and edit them; undo/redo; and save/reopen a portable local project. The deliberately deferred catalog and product features remain listed in the canonical milestones.

## Test the MVP alpha

Open the latest successful [Quality workflow](https://github.com/Honigstute/Balisami/actions/workflows/quality.yml) and download the artifact for your computer:

- `balsamic-alpha-macos-26-arm64` contains a ZIP with `Balsamic.app` for Apple-silicon Macs.
- `balsamic-alpha-windows-2025-x64` contains the Windows x64 `Setup.exe` installer and its update metadata.

These are unsigned trusted-tester builds. On macOS, unzip the application and use Control-click → Open the first time; macOS may instead require **System Settings → Privacy & Security → Open Anyway**. On Windows, SmartScreen may show **Unknown publisher**; proceed only when the file came from this repository's successful workflow artifact. Signing, notarization, polished icons, and public distribution are later release work.

Suggested five-minute test:

1. Launch Balsamic and confirm `Wireframe 1` is selected.
2. Insert all four controls from the shelf.
3. Select a control, drag/resize it, edit its position, size, or text in the inspector, and try undo/redo.
4. Use Save As, close the app, reopen the saved project, and confirm the controls are unchanged.
5. Report the operating system and exact action sequence with any problem.

macOS and Windows run the same application code and project format, but desktop software needs a separate native deliverable for each operating system: a macOS `.app` distributed in a ZIP now (a `.dmg` later), and a Windows installer.

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
npm run make              # create the native ZIP or installer for the current operating system
npm run verify:fuses      # read hardened fuses back from the packaged executable
npm run smoke:packaged    # launch and verify the packaged application
npm run verify:project-workflow:packaged # create/edit/undo/save/reopen alpha acceptance
```

Packaging is native: run or build on macOS for the `.app`/ZIP and on Windows for the `.exe` installer. The cross-platform workflow in `.github/workflows/quality.yml` runs the same source, packaged, visual, performance, save/reopen, and crash-recovery gates on both systems before uploading the tester artifacts.
