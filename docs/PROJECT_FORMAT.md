# Balsamic project format

Balsamic projects are portable, deterministic ZIP containers. The native file picker owns the user-facing file name; readers must identify a project from its manifest rather than its extension.

## Current container contract

The current file-format version is `6`. Every archive contains these entries and no others:

| Entry                    | Purpose                                                                                                                                                   |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `manifest.json`          | Strict format descriptor with `format: "wireframe-project"`, `formatVersion: 6`, `documentEntry: "project.json"`, and `assetDirectory: "assets/sha256/"`. |
| `project.json`           | Canonical JSON for the version-6 project document.                                                                                                        |
| `assets/sha256/<digest>` | Raw asset bytes named by their lowercase SHA-256 digest. Identical assets share one entry.                                                                |

Canonical JSON recursively sorts object keys, preserves array order, uses two-space indentation, and ends with one newline. ZIP entry order is manifest, project document, then asset paths in lexical order. ZIP timestamps and platform attributes are fixed, so the same logical project produces byte-identical archives on supported platforms.

## Compatibility policy

- Versions `1` through `5` are read through complete, sequential, pure migrations to version `6`.
- A file with a newer version is rejected without modifying it.
- A missing migration step, malformed manifest/document, unknown entry, duplicate path, damaged asset, digest mismatch, or partial archive is rejected without exposing partial project state.
- Saving always writes the current version; opening an older project never rewrites the source file until the user explicitly saves.
- Selection, viewport, open overlays, guides, and other session state are intentionally absent from the project format.

Immutable compatibility fixtures and migration goldens live under `tests/fixtures` and are exercised by the project codec/archive test suites. Any future version must add the next strict manifest/document schema, a sequential migration, immutable source and migrated goldens, corruption coverage, and deterministic round-trip evidence before it can replace version `6`.

## Security and size limits

Readers enforce limits before and after expansion:

- 10,002 entries maximum
- 64 KiB manifest maximum
- 32 MiB project JSON maximum
- 64 MiB per asset
- 256 MiB total expanded content
- JSON depth of 64 and 250,000 parsed values

Archive paths are allowlisted. Main-process reads require a regular file and an unchanged fixed-size snapshot. Saves encode and validate the complete archive before touching the destination, then use an exclusive sibling temporary file, flush, and atomic replacement with recovery-safe Windows fallback behavior.

## Asset references

The document stores stable asset IDs and metadata: SHA-256 digest, media type, byte length, and optional original name. The binary source of truth is the digest-named archive entry. Runtime object URLs are transient and are never serialized.

## Interoperability boundary

The project container is the lossless editable format. PNG, SVG, and PDF exports are derived presentation artifacts and cannot be reopened as equivalent projects. The operating-system clipboard uses a separate bounded, versioned selection graph designed for collision-safe cross-project transfer; it is not a project archive.
