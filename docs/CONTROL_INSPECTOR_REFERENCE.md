# Control catalog and inspector evidence

Status: screenshot evidence captured on 2026-08-15. This is an implementation
reference, not a second source of truth. The control definition registry remains
authoritative for defaults, capabilities, rendering, search metadata, inspector
fields, and serialization.

## How to use this reference

- Treat the element-specific inspector fields as the primary evidence.
- Treat captured canvas appearance and dimensions as examples, not guaranteed
  defaults.
- Keep field order consistent with the tables below.
- A field listed as dynamic is generated from parsed control content. The same
  parsed model must drive rendering, links, icons, and selection.
- Do not implement fields that were absent from a selected-control screenshot.
- Preserve unresolved visual choices as explicit enum values until their product
  names or behavior are confirmed.
- Shared fields are omitted from each row: control header, Position X/Y, Size
  Width/Height, and Layering Back/Front/Backward/Forward.

## Coverage and palette mapping

The panoramic palette contains 94 entries. Eight entries are presets of another
control schema, leaving 86 underlying schemas. Selected-control screenshots
confirm 80 schemas. Six schemas remain unconfirmed.

### Palette presets that share a schema

| Palette entry           | Shared schema | Preset difference             |
| ----------------------- | ------------- | ----------------------------- |
| Alert Box alternate     | Alert Box     | Alert-button presentation     |
| H.Slider alternate      | H.Slider      | Thumb shape                   |
| List with Icons         | List          | Per-row icons populated       |
| Pointy Button alternate | Pointy Button | Point direction/border preset |
| Progress Bar alternate  | Progress Bar  | Style preset                  |
| Search Box alternate    | Search Box    | Shape/icon toggles            |
| Text Input alternate    | Text Input    | Full border versus underline  |
| V.Slider alternate      | V.Slider      | Thumb shape                   |

### Unconfirmed schemas

| Control       | Available evidence                                  | Required follow-up                    |
| ------------- | --------------------------------------------------- | ------------------------------------- |
| Chart: Column | Palette thumbnail only                              | Selected-control inspector screenshot |
| iPad          | Palette thumbnail; original screenshot file missing | Selected-control inspector screenshot |
| iPhone        | Palette thumbnail; original screenshot file missing | Selected-control inspector screenshot |
| Shape         | Circle canvas reference; project Notes panel shown  | Selected-control inspector screenshot |
| Squiggly Line | Palette thumbnail only                              | Selected-control inspector screenshot |
| Tag Cloud     | Canvas reference; project Notes panel shown         | Selected-control inspector screenshot |

## Confirmed inspector contracts

`Auto` means the Auto-Size action was visible. `No` means it was not visible in
the supplied screenshot; it does not prove that future product behavior cannot
support auto-sizing.

### A–C

| Control        | Auto | Element-specific inspector fields, in order                                                                                      | Evidence notes                                                               |
| -------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Accordion      | Yes  | Links (dynamic per item); Scrollbar; Selection; Text (B/I/U, size)                                                               | Parsed items drive links and selection.                                      |
| Alert Box      | Yes  | Alert Buttons: Type (2 visual modes); Border: Show Border; Text Color; Links (No, Yes); Text (B/I/U, alignment, size)            | Both alert-button presentations use this schema.                             |
| App Bar        | No   | Color; Icons (ordered icon controls, search/add); Links (dynamic per icon); Text (size)                                          | Icon identities drive link rows.                                             |
| Arrow          | No   | Arrow Options (routing/curve, start/end arrowheads); Label Position; Color; Opacity; Stroke; Text (B/I/U, size)                  | Stroke includes solid/dashed/dotted. Exact routing names unresolved.         |
| Breadcrumbs    | No   | Links (dynamic per segment); Text (B/I/U, size)                                                                                  | Parsed segments drive links.                                                 |
| Browser Window | No   | Border (2 visual modes); Color; Scrollbar                                                                                        | No text or state fields shown.                                               |
| Button         | Yes  | Color; Icon; Links; Menu; State; Text (B/I/U, alignment, size)                                                                   | Icon utilities are visual evidence; secondary utility semantics unresolved.  |
| Button Bar     | Yes  | Links (dynamic per segment); Selection; Text (B/I/U, size)                                                                       | Parsed segments drive links and selection.                                   |
| Calendar       | No   | None                                                                                                                             | Geometry/layering only.                                                      |
| Callout        | Yes  | Color; Opacity; Text (B/I/U, size)                                                                                               | Numbered circular callout.                                                   |
| Chart: Bar     | No   | None                                                                                                                             | Geometry/layering only.                                                      |
| Chart: Line    | No   | None                                                                                                                             | Geometry/layering only.                                                      |
| Chart: Pie     | No   | None                                                                                                                             | Geometry/layering only.                                                      |
| Checkbox       | Yes  | Text Color; Icon; Links (Whole Control); State; Text (B/I/U, size)                                                               | No border field shown.                                                       |
| Checkbox Group | Yes  | Text Color; Links (dynamic per row); Text (B/I/U, size)                                                                          | Parsed rows encode selected, indeterminate, disabled, and plain-text states. |
| Circle Button  | No   | Border: Show Border; Color; Icon; Icon Size (XS–XXL); Label Position (3 modes); Links (Whole Control); State; Text (B/I/U, size) | Label-position enum is visual.                                               |
| Color Picker   | No   | Color                                                                                                                            | Geometry/layering plus color only.                                           |
| ComboBox       | Yes  | Color; Border Color; Text Color; Icon; Links; Scrollbar; Selection; State; Text (B/I/U, size)                                    | No alignment shown.                                                          |
| Comment        | No   | Color; Text (B/I/U, alignment, size)                                                                                             | Sticky-note presentation.                                                    |
| Cover Flow     | No   | Image selector and asset actions; Scrollbar                                                                                      | Native asset actions stay behind typed preload/main APIs.                    |

### D–H

| Control       | Auto | Element-specific inspector fields, in order                                                                                                                                 | Evidence notes                                                         |
| ------------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Data Grid     | Yes  | Border: Show Border; Color (Background, Alternate Row); Data Grid (Header Row, Row Style, Row Height); Links (dynamic); Scrollbar; Selection; Text (B/I/U, alignment, size) | Parsed grid content drives links.                                      |
| Date Chooser  | Yes  | Border Color; State; Text (B/I/U, size)                                                                                                                                     | Compact input with calendar affordance.                                |
| Date Picker   | No   | Kind (Month/Year); Links (CANCEL, OK)                                                                                                                                       | Material-style date picker.                                            |
| Field Set     | No   | Color; Opacity; Text (B/I/U, size)                                                                                                                                          | No links or state shown.                                               |
| H.Curly Brace | No   | Text Color; Direction (2 modes); Text (B/I/U, size)                                                                                                                         | Direction enum is visual.                                              |
| H.Rule        | Yes  | Border Color; Opacity; Stroke (visual modes)                                                                                                                                | Solid/dashed/dotted confirmed; two additional icons remain unresolved. |
| H.Scroll Bar  | No   | Value                                                                                                                                                                       | Range and thumb geometry unresolved.                                   |
| H.Slider      | No   | Color; Slider: Shape (3 modes), Value; State                                                                                                                                | Alternate palette entry is a thumb-shape preset.                       |
| H.Splitter    | No   | None                                                                                                                                                                        | Thin divider with centered grip.                                       |
| Help Button   | No   | Links                                                                                                                                                                       | No color, state, or text fields shown.                                 |

### I–M

| Control             | Auto | Element-specific inspector fields, in order                                                                                                                  | Evidence notes                                                                        |
| ------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Icon                | No   | Border: Show Border; Color; Icon search/browser/utilities; Links                                                                                             | Icon browser is an overlay with internal scrolling. Link row label was obscured.      |
| Icon and Text Label | Yes  | Border: Show Border; Color; Icon; Label Position (below/left/right); Links (Whole Control); State; Text (B/I/U, size)                                        | No alignment shown.                                                                   |
| Image               | Yes  | Border: Show Border; Crop or Split actions; Image selector and asset actions; Links; Text (B/I/U, size)                                                      | Crop/split semantics unresolved. Quick-draw key: I.                                   |
| iOS Keyboard        | Yes  | iOS Keyboard: Device (2 modes), Orientation (2 modes)                                                                                                        | Phone-like device and landscape keyboard selected in evidence.                        |
| iOS Menu            | Yes  | Border: Show Border; Links (dynamic per parsed row); Text (B/I/U, size)                                                                                      | Structural row syntax controls icons, submenus, labels, toggles, and blank rows.      |
| iOS Picker          | No   | None                                                                                                                                                         | Geometry/layering only.                                                               |
| Link                | No   | Links; State; Text (B/I/U, size)                                                                                                                             | Underline selected in evidence.                                                       |
| Link Bar            | No   | Color (Separator and Selected Text, Text Color); Links (dynamic); Selection; Text (B/I/U, size)                                                              | Parsed segments drive links and selection.                                            |
| List                | Yes  | Border: Show Border; Color, Alternate Row; Links (dynamic); List (Header Row, Row Height); per-row Icon assignment; Scrollbar; Selection; Text (B/I/U, size) | List with Icons is a populated preset of this schema.                                 |
| Menu                | No   | Links (dynamic per source line); Selection; Text (B/I/U, size)                                                                                               | Parser supports shortcuts, submenu rows, separators, radio/toggle, and disabled rows. |
| Menu Bar            | Yes  | Border: Show Border; Icon; Links (dynamic); Selection; Text (B/I/U, size)                                                                                    | Parsed menu names drive links.                                                        |
| Modal Screen        | No   | Links                                                                                                                                                        | No opacity or color field was shown.                                                  |
| Multiline Button    | Yes  | Color; Opacity; Icon; Links (Whole Control); Text (B/I/U, size)                                                                                              | No border, menu, or state shown.                                                      |

### N–S

| Control                | Auto | Element-specific inspector fields, in order                                                                                   | Evidence notes                                                                             |
| ---------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Num. Stepper           | Yes  | Border Color; State; Text (B/I/U, size)                                                                                       | No link field shown.                                                                       |
| ON/OFF Switch          | No   | Color; Links; State (Off/On)                                                                                                  | State is a 2-option segmented control.                                                     |
| Playback               | No   | None                                                                                                                          | Previous/play/next are visual only in current evidence.                                    |
| Pointy Button          | Yes  | Border: Show Border; Color; Icon; Links; Menu; Point (left/none/right); State; Text (B/I/U, size)                             | Left/right palette entries are presets. Menu control semantics unresolved.                 |
| Popover                | Yes  | Color; Popover: Direction (top/right/bottom/left), Position; Text (B/I/U, size)                                               | Position moves the pointer along its selected edge.                                        |
| Progress Bar           | No   | Color; Progress Bar: Type (2 modes), Style (2 modes), Value                                                                   | Alternate palette entry is a style preset. Exact type names unresolved.                    |
| Radio Button           | Yes  | Text Color; Icon; Links (Whole Control); State; Text (B/I/U, size)                                                            | No border field shown.                                                                     |
| Radio Button Group     | Yes  | Text Color; Links (dynamic per row); Text (B/I/U, size)                                                                       | Parsed rows encode selected, indeterminate, disabled, and plain text.                      |
| Rectangle              | No   | Border (6 visual modes); Color; Border Color; Opacity; Links; Scrollbar                                                       | Quick-draw key: R. Border-mode names unresolved.                                           |
| Red X                  | No   | None                                                                                                                          | Appearance is fixed by current evidence.                                                   |
| Scratch-Out            | No   | Color; Opacity                                                                                                                | No links, text, border, or state shown.                                                    |
| Search Box             | Yes  | Text Color; Links; Search: Shape (rounded/rectangular), Search Icon toggle, Microphone Icon toggle; State; Text (B/I/U, size) | Icon toggles are independent and may both be enabled. Alternate palette entry is a preset. |
| Site Map               | No   | Links (dynamic per hierarchy node); Site Map layout (2 modes); Populate from Project; Text (B/I/U, size)                      | Populate is an explicit undoable command.                                                  |
| Smartphone             | Yes  | Smartphone: Orientation (2 modes), Resizing (2 modes), Background toggle, Top Bar toggle                                      | Background and Top Bar are independent. Resize-mode names unresolved.                      |
| Squiggly Block of Text | No   | None                                                                                                                          | Quick-draw key: T.                                                                         |
| Street Map             | No   | None                                                                                                                          | No map-provider or asset configuration shown.                                              |

### T–W

| Control        | Auto | Element-specific inspector fields, in order                                                                                                      | Evidence notes                                                                                      |
| -------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Tab Bar        | No   | Border: Show Border; Color; Opacity; Links (dynamic); Scrollbar; Selection; Tabs Position (top/bottom and left/center/right); Text (B/I/U, size) | Parsed tabs drive links and selection.                                                              |
| Text Area      | No   | Color; Border Color; Text Color; Opacity; Links (Whole Control); Scrollbar; State; Text (B/I/U, alignment, size)                                 | No separate border-style selector shown.                                                            |
| Text Input     | Yes  | Border (full/underline); Color; Border Color; Text Color; Opacity; State; Text (B/I/U, alignment, size)                                          | Alternate palette entry is the underline preset. No links shown.                                    |
| Text Label     | Yes  | Text Color; Links (Whole Control); Orientation (4 modes); State; Text (B/I/U, alignment, size)                                                   | Orientation angles/names unresolved.                                                                |
| Text Paragraph | No   | Text Color; Links (dynamic inline links plus Whole Control); State; Text (B/I/U, alignment, size)                                                | One rich-text parser drives formatting, icons, and link rows.                                       |
| Text Subtitle  | Yes  | Text Color; Links; Text (B/I/U, alignment, size 24 shown)                                                                                        | No state shown.                                                                                     |
| Text Title     | Yes  | Text Color; Links; Text (B/I/U, alignment, size 40 shown)                                                                                        | No state shown.                                                                                     |
| Time Picker    | No   | Links (CANCEL, OK)                                                                                                                               | No Kind, state, text, or color fields shown.                                                        |
| Toolbar        | No   | None                                                                                                                                             | Individual toolbar actions are visual only in current evidence.                                     |
| Tooltip        | No   | Direction (4 modes); Text (B/I/U, alignment, size)                                                                                               | Center alignment selected in evidence.                                                              |
| Tree Pane      | Yes  | Border: Show Border; Color; Opacity; Links (dynamic); Scrollbar; Selection; State; Text (B/I/U, size)                                            | Parser handles hierarchy, folders, files, disclosures, and checkbox-like rows.                      |
| V.Curly Brace  | No   | Text Color; Direction (2 modes); Text (B/I/U, size)                                                                                              | Second direction selected in evidence.                                                              |
| V.Rule         | Yes  | Border Color; Opacity; Stroke (solid/dashed/dotted)                                                                                              | Solid selected in evidence.                                                                         |
| V.Scroll Bar   | No   | Value                                                                                                                                            | Range and thumb geometry unresolved.                                                                |
| V.Slider       | No   | Color; Slider: Shape (3 modes), Value; State                                                                                                     | Alternate palette entry is a thumb-shape preset.                                                    |
| V.Splitter     | No   | None                                                                                                                                             | Thin divider with centered grip.                                                                    |
| V.Tabs         | No   | Border: Show Border; Color; Opacity; Links (dynamic); Scrollbar; Selection; Tabs Position (left/right); Text (B/I/U, size)                       | Parsed tabs drive links and selection.                                                              |
| Video Player   | No   | None                                                                                                                                             | Media controls are visual only in current evidence.                                                 |
| Volume Slider  | No   | None                                                                                                                                             | A Value field was not exposed.                                                                      |
| Webcam         | No   | None                                                                                                                                             | Geometry/layering only.                                                                             |
| Window         | No   | Scrollbar; Text (B/I/U, size); Window custom graphical editor                                                                                    | Custom editor shows title controls, resize handle, and two marker rows; exact semantics unresolved. |

## Cross-control implementation requirements

1. **Registry ownership:** Every row above becomes registry metadata or a
   registry-owned renderer/inspector adapter. Do not add palette, renderer,
   inspector, serializer, and search switch statements.
2. **Parsed content identity:** Accordion, breadcrumbs, button bars, checkbox and
   radio groups, data grids, iOS menus, link bars, lists, menus, menu bars, site
   maps, tab bars, text paragraphs, tree panes, and vertical tabs require stable
   parsed item identities. Editing text must not silently move links, icons, or
   selection to a different logical row.
3. **Preset mapping:** Palette variants insert the shared schema with explicit
   initial properties. They are not separate serializers or renderers.
4. **Inspector widgets:** Reuse typed field primitives for booleans, colors,
   numeric inputs, continuous sliders, enum segments, text formatting, links,
   icon search, asset selection, and dynamic item lists.
5. **Mutation boundary:** Inspector edits, auto-size, Populate from Project, and
   asset changes are validated commands. Continuous sliders create one undo
   entry per gesture.
6. **Overlay behavior:** Icon browsers, color pickers, menus, and transient help
   overlay the shell and never add sidebar height or move the canvas.
7. **Native boundary:** Image/file/cloud actions use the typed preload/main
   boundary; renderer code never imports Node.js or Electron.
8. **Unknowns:** Keep unresolved option labels and custom-editor semantics
   explicit. Do not convert a screenshot assumption into persisted schema.
9. **Icon catalog:** Icon-capable controls and direct icon insertion use the
   single curated outline catalog defined in
   [`ICON_LIBRARY_REFERENCE.md`](./ICON_LIBRARY_REFERENCE.md).
