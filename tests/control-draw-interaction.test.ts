// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import { CONTROL_TYPES, getControlSpec, getControlSpecByDrawShortcut } from '../src/domain';
import {
  CONTROL_DRAW_POLICY,
  ControlDrawInteraction,
  createControlDrawFrame,
} from '../src/renderer/editor/control-draw-interaction';
import { createViewportPoint, createWorldPoint } from '../src/renderer/editor/viewport-transform';

const rectangle = getControlSpec(CONTROL_TYPES.rectangle);
if (rectangle === undefined) {
  throw new Error('Rectangle draw fixture is missing.');
}

describe('control draw interaction', () => {
  it('resolves only screenshot-backed registry shortcuts', () => {
    expect(getControlSpecByDrawShortcut('KeyR')?.type).toBe(CONTROL_TYPES.rectangle);
    expect(getControlSpecByDrawShortcut('KeyI')?.type).toBe(CONTROL_TYPES.imagePlaceholder);
    expect(getControlSpecByDrawShortcut('KeyA')).toBeUndefined();
    expect(getControlSpecByDrawShortcut('r')).toBeUndefined();
  });

  it('normalizes either drag direction and enforces definition size bounds', () => {
    expect(
      createControlDrawFrame(rectangle, createWorldPoint(100, 100), createWorldPoint(180, 150)),
    ).toEqual({ x: 100, y: 100, width: 80, height: 50 });
    expect(
      createControlDrawFrame(rectangle, createWorldPoint(100, 100), createWorldPoint(90, 95)),
    ).toEqual({
      x: 100 - rectangle.minimumSize.width,
      y: 100 - rectangle.minimumSize.height,
      width: rectangle.minimumSize.width,
      height: rectangle.minimumSize.height,
    });
    expect(
      createControlDrawFrame(
        { ...rectangle, maximumSize: { width: 60, height: 50 } },
        createWorldPoint(10, 20),
        createWorldPoint(500, 500),
      ),
    ).toEqual({ x: 10, y: 20, width: 60, height: 50 });
  });

  it('commits only one completed drag and retains arming until key release', () => {
    const commit = vi.fn(() => true);
    const interaction = new ControlDrawInteraction({ commit });
    const start = {
      viewportPoint: createViewportPoint(10, 20),
      worldPoint: createWorldPoint(100, 200),
    };
    const end = {
      viewportPoint: createViewportPoint(110, 80),
      worldPoint: createWorldPoint(200, 260),
    };

    expect(interaction.arm('KeyR')).toBe(true);
    expect(interaction.begin(7, start)).toBe(true);
    expect(interaction.update(7, end)).toBe(true);
    expect(interaction.getSnapshot()).toMatchObject({
      controlType: CONTROL_TYPES.rectangle,
      frame: { x: 100, y: 200, width: 100, height: 60 },
      kind: 'drawing',
    });
    expect(interaction.complete(7, end)).toBe(true);

    expect(commit).toHaveBeenCalledOnce();
    expect(commit).toHaveBeenCalledWith(CONTROL_TYPES.rectangle, {
      x: 100,
      y: 200,
      width: 100,
      height: 60,
    });
    expect(interaction.getSnapshot()).toMatchObject({ kind: 'armed', shortcut: 'KeyR' });
    expect(interaction.disarm('KeyR')).toBe(true);
    expect(interaction.getSnapshot()).toEqual({ kind: 'idle' });
  });

  it('cancels tiny, escaped, and wrong-pointer gestures without committing', () => {
    const commit = vi.fn(() => true);
    const interaction = new ControlDrawInteraction({ commit });
    const start = {
      viewportPoint: createViewportPoint(10, 20),
      worldPoint: createWorldPoint(100, 200),
    };
    const tiny = {
      viewportPoint: createViewportPoint(10 + CONTROL_DRAW_POLICY.minimumDragDistancePixels, 20),
      worldPoint: createWorldPoint(104, 200),
    };

    interaction.arm('KeyI');
    interaction.begin(8, start);
    expect(interaction.complete(9, tiny)).toBe(false);
    expect(interaction.complete(8, tiny)).toBe(true);
    expect(commit).not.toHaveBeenCalled();

    interaction.begin(10, start);
    interaction.disarm('KeyI');
    expect(interaction.cancel(10)).toBe(true);
    expect(interaction.getSnapshot()).toEqual({ kind: 'idle' });
    expect(commit).not.toHaveBeenCalled();
  });
});
