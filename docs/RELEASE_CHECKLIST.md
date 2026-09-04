# Balsamic release checklist

This checklist is the operational gate for a signed Balsamic release. `docs/MILESTONES.md` remains the only roadmap/status source.

## Before tagging

- The source tree is clean and `package.json` contains the intended semantic version.
- `npm run verify` and the complete packaged M14 gate pass at that exact commit.
- The immutable compatibility fixtures open, save, recover, and export without document loss.
- macOS and Windows privacy, diagnostics, third-party notices, file association, and uninstall behavior have been checked on clean machines.
- GitHub's `production` environment has required reviewers.
- Apple secrets are configured: `MACOS_CERTIFICATE_BASE64`, `MACOS_CERTIFICATE_PASSWORD`, `MACOS_SIGN_IDENTITY`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID`.
- Windows secrets are configured: `WINDOWS_CERTIFICATE_BASE64` and `WINDOWS_CERTIFICATE_PASSWORD`.

## Build and review

1. Create and push the exact `v<package version>` tag. Release mode rejects a dirty tree, a mismatched tag, or missing platform credentials before packaging.
2. The signed-release workflow builds separate macOS arm64 and x64 update ZIPs and notarized DMGs, plus the signed Windows x64 Squirrel installer/update files.
3. Every artifact receives a JSON manifest containing source commit, tag, version, platform, architecture, byte length, and SHA-256.
4. The workflow verifies hardened Electron fuses, packaged launch, macOS code signatures/notarization, and Windows Authenticode signatures before creating a draft GitHub Release.
5. Download the draft on clean supported machines. Install, create/edit/save, reopen by double-click, export, quit, relaunch, and uninstall. Confirm existing project files remain after uninstall.

## Rollout and halt

- Run **Release rollout control → promote** only after the draft review passes. Electron's public update service ignores drafts and prereleases, so promotion is the explicit rollout boundary.
- Watch update failures and crash/data-loss reports before announcing broadly. The app checks at startup and then every six hours; a downloaded update waits for the next normal quit/relaunch so the tested unsaved-project close flow remains authoritative.
- Run **Release rollout control → halt** to return a problematic release to draft and stop new discovery. Already updated installations are never silently downgraded; ship a corrected higher semantic version using the same gate.
- Recovery data and user `.balsamic` files are outside the application bundle/install directory and must survive update, halt, and uninstall.
