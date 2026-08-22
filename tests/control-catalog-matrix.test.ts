import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { listPaletteControlSpecs, type ControlDefinition } from '../src/domain';

const TEST_EVIDENCE_BY_TYPE: Readonly<Record<string, string>> = Object.freeze({
  'foundation.rectangle': 'common harness; registry visual fixture; control hit-shape',
  'wireframe.arrow': 'common harness; registry visual fixture; line hit-shape and scene geometry',
  'wireframe.browser':
    'common harness; registry visual fixture; scene geometry and inspector controls',
  'wireframe.button': 'common harness; registry visual fixture; icon, migration, and auto-size',
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
  'wireframe.squiggly-block-of-text':
    'common harness; registry visual fixture; deterministic Markup scene geometry',
  'wireframe.street-map':
    'common harness; registry visual fixture; deterministic Asset scene geometry',
  'wireframe.text-input': 'common harness; registry visual fixture; control auto-size',
  'wireframe.text-label': 'common harness; registry visual fixture; control auto-size',
  'wireframe.toolbar':
    'common harness; registry visual fixture; deterministic Toolbar scene geometry',
  'wireframe.video-player':
    'common harness; registry visual fixture; deterministic Media scene geometry',
  'wireframe.volume-slider':
    'common harness; registry visual fixture; deterministic Media scene geometry',
  'wireframe.v-splitter':
    'common harness; registry visual fixture; deterministic Layout scene geometry',
  'wireframe.v-rule':
    'common harness; intrinsic auto-size; range inspector; deterministic Rule geometry',
  'wireframe.webcam': 'common harness; registry visual fixture; deterministic Media scene geometry',
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
