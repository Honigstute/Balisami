# Curated outline icon library

Status: product requirement captured from the 2026-08-15 icon-library
screenshots. This is an implementation reference. The eventual icon registry is
the runtime source of truth.

## Prepared catalog

The concrete catalog is generated from `lucide-static@1.31.0`, a consistent
ISC-licensed outline family:

- 1,767 canonical source icons inspected;
- 258 source synonym/legacy aliases collapsed;
- 135 additional same-meaning visual variants collapsed;
- **1,632 selectable outline icons remain**;
- all 393 removed names remain searchable aliases of a retained icon.

The complete surviving ID list and every explicit curation mapping are in
[`ICON_CATALOG.generated.md`](./ICON_CATALOG.generated.md). Bundled geometry is
stored in `src/shared/icons/icon-catalog.generated.json`; lookup and ranked
search live in `src/shared/icons/icon-catalog.ts`. Regenerate all derived files
with `npm run generate:icons`.

The remaining set spans general UI actions, arrows and navigation,
accessibility, people, communication, files and folders, devices, layout,
text-editing, media, charts and data, commerce, time, transport, weather,
nature, health, science, tools, and common objects. Brand/logo families are not
included.

## Product decision

Balsamic does not need the complete mixed-style icon library visible in the
reference application. It needs one coherent, outline-only library after exact
duplicates and icons with duplicate meanings are removed.

Every icon that remains after this curation must be available in all of these
places:

1. The Icon control's inspector search and browser.
2. Every other control inspector that exposes an Icon field.
3. The main control search when the `Icons` category is active. Choosing a
   result there inserts an Icon control already configured with that icon.

All three entry points use the same registry and search index. They must never
maintain separate icon lists.

## Curation rules

Apply these rules in order so the output is deterministic and reviewable.

1. **Use one outline family.** Include only icons from one bundled,
   license-cleared outline family. Do not mix regular, solid, duotone, brand,
   emoji, or platform-symbol families.
2. **Remove filled variants.** When the source exposes `Regular` and `Solid`
   versions, retain the outline/regular version and remove the solid version.
   Solid-only icons are excluded because they break the outline-only decision.
3. **Remove exact visual duplicates.** Normalize SVG geometry and remove icons
   whose normalized vector output is identical. Pick one canonical ID and keep
   the discarded names as search aliases.
4. **Remove semantic duplicates.** When multiple icons communicate the same
   action or object, retain the simplest and most recognizable outline glyph.
   Examples include duplicate concepts such as trash/delete, cog/settings, and
   question/help. Discarded names become aliases of the retained icon.
5. **Keep meaningful variants.** Do not collapse icons whose difference changes
   intent: direction, state, severity, media action, device type, file type, or
   accessibility meaning. For example, arrow-left and arrow-right are not
   duplicates; volume-off and volume-high are not duplicates.
6. **Exclude branding by default.** Logos and trademarks are excluded unless a
   later product requirement and asset license explicitly include them.
7. **Prefer legibility at wireframe sizes.** Reject outline glyphs that become
   ambiguous or illegible at the Icon control's XS/S sizes.

The screenshots are visual and interaction references only. Do not trace or
redistribute glyphs from screenshots. Source vector data must come from an icon
package whose license permits bundling in this application.

## Canonical registry record

Each retained icon has one stable record:

```ts
type IconDefinition = {
  id: string;
  label: string;
  category: string;
  keywords: readonly string[];
  aliases: readonly string[];
  viewBox: string;
  pathData: string;
};
```

- `id` is stable and persisted in project documents. It must not depend on list
  position, a Unicode code point, or a display label.
- `label` is the single user-facing canonical name.
- `keywords` cover the icon's visible object and actions.
- `aliases` include removed duplicate names and common synonyms. Searching an
  alias returns the canonical icon, not another result.
- Vector geometry is bundled locally so search and rendering work offline.

If the chosen library requires multiple SVG paths, extend the geometry type in
one place rather than embedding renderer-specific markup in each control.

## Search and browsing behavior

- Search is case-insensitive and matches label, keywords, aliases, and category.
- Results contain each canonical icon exactly once, even when several aliases
  match.
- Exact label matches rank first, followed by alias and keyword matches.
- Category browsing and free-text search use the same filtered registry.
- The browser opens as an overlay and scrolls internally; it does not add height
  to the inspector or move the canvas.
- The currently selected icon remains visibly selected when the query changes
  or the browser reopens.
- Clearing the field removes the icon without deleting the host control.
- Direct insertion from the main `Icons` category creates an Icon control with
  the selected canonical `iconId` in one undoable command.

## Generated catalog and tests

The curated list should be generated from pinned source metadata plus a small,
reviewed curation manifest. Do not hand-copy thousands of icon definitions.

The manifest owns:

- excluded non-outline styles;
- exact-duplicate canonical mappings;
- semantic-duplicate canonical mappings and aliases;
- explicitly retained meaningful variants;
- category overrides and extra search keywords.

Required verification:

1. Every output icon is from the approved outline family.
2. No two output records have the same stable ID or normalized geometry.
3. Every removed semantic duplicate resolves to exactly one canonical icon.
4. Alias searches return one result, not duplicate cards.
5. Inspector search and main `Icons` search return the same canonical IDs.
6. Direct insertion persists and round-trips the canonical `iconId`.
7. Missing or retired IDs render an actionable fallback without crashing or
   corrupting the document.
8. A screenshot fixture covers browsing, searching, selecting, clearing, and
   direct insertion without shell layout movement.
