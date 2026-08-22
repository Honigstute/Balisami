import { describe, expect, it } from 'vitest';

import {
  AssetIdSchema,
  CONTROL_TYPES,
  createCustomIconReference,
  getControlSpec,
} from '../src/domain';
import {
  createControlSceneIconProjection,
  syncControlSceneIconElement,
} from '../src/renderer/controls/control-scene-icon';
import { createWorldRect } from '../src/renderer/editor/viewport-transform';

describe('catalog icon scene projection', () => {
  it('projects canonical catalog nodes into deterministic centered button geometry', () => {
    const button = getControlSpec(CONTROL_TYPES.button);
    if (button === undefined) {
      throw new Error('Button definition is missing.');
    }
    const projection = createControlSceneIconProjection(
      button,
      createWorldRect(10, 20, 120, 40),
      { iconId: 'arrow-right', text: 'Go' },
      { fontSize: 16, lines: [], textAnchor: 'middle', width: 20 },
    );
    expect(projection).toMatchObject({
      definition: { id: 'arrow-right' },
      size: 16,
      transform: 'translate(50 32) scale(0.6666666666666666)',
      x: 50,
      y: 32,
    });
  });

  it('creates only curated SVG nodes and reuses them while geometry changes', () => {
    const button = getControlSpec(CONTROL_TYPES.button);
    if (button === undefined) {
      throw new Error('Button definition is missing.');
    }
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const first = createControlSceneIconProjection(
      button,
      createWorldRect(0, 0, 120, 40),
      { iconId: 'arrow-right', text: 'Go' },
      { fontSize: 16, lines: [], textAnchor: 'middle', width: 20 },
    );
    syncControlSceneIconElement(group, first);
    const nodes = [...group.children];
    expect(nodes.length).toBeGreaterThan(0);
    expect(nodes.every((node) => ['line', 'path', 'polyline'].includes(node.localName))).toBe(true);

    const resized = createControlSceneIconProjection(
      button,
      createWorldRect(0, 0, 160, 40),
      { iconId: 'arrow-right', text: 'Go' },
      { fontSize: 16, lines: [], textAnchor: 'middle', width: 20 },
    );
    syncControlSceneIconElement(group, resized);
    expect([...group.children]).toEqual(nodes);
    expect(group).toHaveAttribute('transform', 'translate(60 12) scale(0.6666666666666666)');

    syncControlSceneIconElement(group, undefined);
    expect(group).toHaveAttribute('display', 'none');
  });

  it('projects an authenticated project image through the same fixed icon geometry', () => {
    const button = getControlSpec(CONTROL_TYPES.button);
    const assetId = AssetIdSchema.parse('asset_customicon');
    if (button === undefined) throw new Error('Button definition is missing.');
    const projection = createControlSceneIconProjection(
      button,
      createWorldRect(0, 0, 120, 40),
      { iconId: createCustomIconReference(assetId), text: 'Go' },
      { fontSize: 16, lines: [], textAnchor: 'middle', width: 20 },
    );
    expect(projection).toMatchObject({ assetId, kind: 'asset', size: 16, x: 40, y: 12 });

    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    syncControlSceneIconElement(group, projection, { [assetId]: 'blob:custom-icon' });
    expect(group).toHaveAttribute('data-icon-id', createCustomIconReference(assetId));
    expect(group.firstElementChild).toHaveAttribute('href', 'blob:custom-icon');
    expect(group.firstElementChild).toHaveAttribute('preserveAspectRatio', 'xMidYMid meet');
  });
});
