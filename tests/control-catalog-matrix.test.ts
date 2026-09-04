import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { listPaletteControlSpecs, type ControlDefinition } from '../src/domain';

const TEST_EVIDENCE_BY_TYPE: Readonly<Record<string, string>> = Object.freeze({
  'foundation.rectangle': 'common harness; registry visual fixture; control hit-shape',
  'wireframe.arrow': 'common harness; registry visual fixture; line hit-shape and scene geometry',
  'wireframe.browser':
    'common harness; registry visual fixture; scene geometry and inspector controls',
  'wireframe.breadcrumbs':
    'common harness; parsed-row identity, inspector, clone, scene, and presentation geometry',
  'wireframe.button': 'common harness; registry visual fixture; icon, migration, and auto-size',
  'wireframe.button-bar':
    'common harness; stable row selection, clone, inspector, and segmented scene geometry',
  'wireframe.calendar':
    'common harness; registry visual fixture; deterministic Calendar scene geometry',
  'wireframe.chart-bar':
    'common harness; registry visual fixture; deterministic Chart scene geometry',
  'wireframe.chart-line':
    'common harness; registry visual fixture; deterministic Chart scene geometry',
  'wireframe.chart-pie':
    'common harness; registry visual fixture; deterministic Chart scene geometry',
  'wireframe.checkbox':
    'common harness; registry visual fixture; hit-shape, accessibility, and auto-size',
  'wireframe.checkbox-group':
    'common harness; exact marker grammar, stable row identity, inspector, and stacked scene geometry',
  'wireframe.field-set':
    'common harness; exact inspector isolation and measured legend frame geometry',
  'wireframe.image-placeholder':
    'common harness; registry visual fixture; image and thumbnail projection',
  'wireframe.h-splitter':
    'common harness; registry visual fixture; deterministic Layout scene geometry',
  'wireframe.h-rule':
    'common harness; intrinsic auto-size; range inspector; deterministic Rule geometry',
  'wireframe.ios-picker':
    'common harness; registry visual fixture; deterministic iOS Picker scene geometry',
  'wireframe.playback':
    'common harness; registry visual fixture; deterministic Media scene geometry',
  'wireframe.red-x': 'common harness; registry visual fixture; deterministic Markup scene geometry',
  'wireframe.scratch-out':
    'common harness; range inspector; deterministic Scratch-Out scene geometry',
  'wireframe.search-box':
    'common harness; base/preset authoring identity, inspector, auto-size, and cross-surface geometry',
  'wireframe.help-button':
    'common harness; shared link inspector; deterministic Help Button geometry',
  'wireframe.modal-screen':
    'common harness; shared link inspector; deterministic Modal Screen geometry',
  'wireframe.color-picker':
    'common harness; registry color target; deterministic Color Picker geometry',
  'wireframe.on-off-switch':
    'common harness; shared link and state inspector; deterministic Switch geometry',
  'wireframe.radio-button-group':
    'common harness; exact marker grammar, stable row identity, inspector, and stacked scene geometry',
  'wireframe.squiggly-block-of-text':
    'common harness; registry visual fixture; deterministic Markup scene geometry',
  'wireframe.street-map':
    'common harness; registry visual fixture; deterministic Asset scene geometry',
  'wireframe.text-input': 'common harness; registry visual fixture; control auto-size',
  'wireframe.text-area':
    'common harness; exact inspector, multiline, persistence, and cross-surface geometry',
  'wireframe.text-label': 'common harness; registry visual fixture; control auto-size',
  'wireframe.text-subtitle':
    'common harness; exact defaults, inspector isolation, auto-size, persistence, and cross-surface geometry',
  'wireframe.text-title':
    'common harness; exact defaults, inspector isolation, auto-size, persistence, and cross-surface geometry',
  'wireframe.toolbar':
    'common harness; registry visual fixture; deterministic Toolbar scene geometry',
  'wireframe.tree-pane':
    'common harness; exact hierarchy grammar, stable row selection, inspector, and stacked adornment geometry',
  'wireframe.video-player':
    'common harness; registry visual fixture; deterministic Media scene geometry',
  'wireframe.volume-slider':
    'common harness; registry visual fixture; deterministic Media scene geometry',
  'wireframe.v-splitter':
    'common harness; registry visual fixture; deterministic Layout scene geometry',
  'wireframe.v-rule':
    'common harness; intrinsic auto-size; range inspector; deterministic Rule geometry',
  'wireframe.webcam': 'common harness; registry visual fixture; deterministic Media scene geometry',
  'wireframe.link-bar':
    'common harness; optional stable row selection, links, inspector, and measured scene geometry',
  'wireframe.link':
    'common harness; exact default, state, link activation, persistence, and text projection',
  'wireframe.multiline-button':
    'common harness; exact two-tier text, icon, auto-size, inspector, and cross-surface projection',
  'wireframe.circle-button':
    'common harness; exact circle, icon scale, label positions, state, inspector, and projection',
  'wireframe.comment':
    'common harness; exact sticky default, multiline text, fixed tape, inspector, and projection',
});

const code = (value: string): string => `\`${value}\``;

const createVisualCell = (definition: ControlDefinition): string =>
  `${code(definition.scene.kind)} · ${
    definition.scene.propertyKeys.length === 0
      ? 'static'
      : definition.scene.propertyKeys.map(code).join(', ')
  }`;

const createInspectorCell = (definition: ControlDefinition): string => {
  const fields = definition.inspector.flatMap((section) => section.fields);
  return fields.length === 0
    ? 'none'
    : fields.map((field) => code(`${field.kind}:${field.property}`)).join(', ');
};

const createHitShapeCell = (definition: ControlDefinition): string => {
  const hitShape = definition.scene.hitShape;
  if (hitShape.kind === 'line') {
    return `line ±${String(hitShape.tolerance)}`;
  }
  return hitShape.kind;
};

const createAccessibilityCell = (definition: ControlDefinition): string =>
  [
    code(definition.accessibility.role),
    definition.accessibility.nameProperty === null
      ? 'fallback label'
      : `name ${code(definition.accessibility.nameProperty)}`,
    ...(definition.accessibility.checkedProperty === null
      ? []
      : [`checked ${code(definition.accessibility.checkedProperty)}`]),
  ].join(' · ');

const createMigrationCell = (definition: ControlDefinition): string =>
  `v${String(definition.fileVersion)} · ${
    definition.migrations.length === 0
      ? 'none'
      : `${String(definition.migrations.length)} migrations`
  }`;

const createExpectedRow = (definition: ControlDefinition): string => {
  const palette = definition.palette;
  const testEvidence = TEST_EVIDENCE_BY_TYPE[definition.type];
  if (palette === null || testEvidence === undefined) {
    throw new Error(`Catalog matrix evidence is missing for '${definition.type}'.`);
  }
  return `| ${palette.label} | ${code(definition.type)} | ${createVisualCell(definition)} | ${createInspectorCell(definition)} | ${definition.autoSize?.axis ?? 'manual'} | ${createHitShapeCell(definition)} | ${createAccessibilityCell(definition)} | ${createMigrationCell(definition)} | ${testEvidence} |`;
};

describe('control catalog conformance matrix', () => {
  it('tracks every promoted registry control without duplicating behavioral metadata', async () => {
    const markdown = await readFile(
      path.join(process.cwd(), 'docs', 'CONTROL_CATALOG_MATRIX.md'),
      'utf8',
    );
    const rows = markdown
      .split(/\r?\n/u)
      .filter((line) => line.startsWith('| '))
      .map((line) =>
        line
          .split('|')
          .slice(1, -1)
          .map((cell) => cell.trim()),
      )
      .filter(([firstCell]) => firstCell !== 'Control' && !firstCell?.startsWith('-'))
      .map((cells) => `| ${cells.join(' | ')} |`);
    expect(rows).toEqual(listPaletteControlSpecs().map(createExpectedRow));
    expect(Object.keys(TEST_EVIDENCE_BY_TYPE).sort()).toEqual(
      listPaletteControlSpecs()
        .map((definition) => definition.type)
        .sort(),
    );
  });
});
