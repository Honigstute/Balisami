// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  VIEWPORT_INPUT_POLICY,
  VIEWPORT_EDIT_COMMANDS,
  isViewportDeleteKey,
  isViewportDuplicateShortcut,
  isViewportSnapBypassed,
  normalizeViewportWheel,
  resolveViewportEditShortcut,
  type ViewportWheelInput,
} from '../src/renderer/editor/viewport-input';

const wheelInput = (overrides: Partial<ViewportWheelInput> = {}): ViewportWheelInput => ({
  clientX: 400,
  clientY: 300,
  ctrlKey: false,
  deltaMode: 0,
  deltaX: 0,
  deltaY: 0,
  metaKey: false,
  shiftKey: false,
  ...overrides,
});

describe('viewport wheel normalization', () => {
  it('recognizes only the platform-neutral Delete and Backspace codes', () => {
    expect(isViewportDeleteKey('Delete')).toBe(true);
    expect(isViewportDeleteKey('Backspace')).toBe(true);
    expect(isViewportDeleteKey('KeyD')).toBe(false);
  });

  it('maps duplicate to the exact primary modifier for each supported platform', () => {
    const input = {
      altKey: false,
      code: 'KeyD',
      ctrlKey: false,
      metaKey: true,
      shiftKey: false,
    };

    expect(isViewportDuplicateShortcut(input, 'darwin')).toBe(true);
    expect(isViewportDuplicateShortcut(input, 'win32')).toBe(false);
    expect(isViewportDuplicateShortcut({ ...input, ctrlKey: true, metaKey: false }, 'win32')).toBe(
      true,
    );
    expect(isViewportDuplicateShortcut({ ...input, ctrlKey: true, metaKey: false }, 'darwin')).toBe(
      false,
    );
    expect(isViewportDuplicateShortcut({ ...input, altKey: true }, 'darwin')).toBe(false);
    expect(isViewportDuplicateShortcut({ ...input, shiftKey: true }, 'darwin')).toBe(false);
    expect(isViewportDuplicateShortcut({ ...input, code: 'KeyC' }, 'darwin')).toBe(false);
  });

  it('resolves exact edit and grouping commands without accepting alternate modifiers', () => {
    const macInput = {
      altKey: false,
      code: 'KeyC',
      ctrlKey: false,
      metaKey: true,
      shiftKey: false,
    };

    expect(resolveViewportEditShortcut(macInput, 'darwin')).toBe(VIEWPORT_EDIT_COMMANDS.copy);
    expect(resolveViewportEditShortcut({ ...macInput, code: 'KeyX' }, 'darwin')).toBe(
      VIEWPORT_EDIT_COMMANDS.cut,
    );
    expect(resolveViewportEditShortcut({ ...macInput, code: 'KeyV' }, 'darwin')).toBe(
      VIEWPORT_EDIT_COMMANDS.paste,
    );
    expect(resolveViewportEditShortcut({ ...macInput, code: 'KeyG' }, 'darwin')).toBe(
      VIEWPORT_EDIT_COMMANDS.group,
    );
    expect(
      resolveViewportEditShortcut({ ...macInput, code: 'KeyG', shiftKey: true }, 'darwin'),
    ).toBe(VIEWPORT_EDIT_COMMANDS.ungroup);
    expect(resolveViewportEditShortcut({ ...macInput, code: 'ArrowUp' }, 'darwin')).toBe(
      VIEWPORT_EDIT_COMMANDS.bringForward,
    );
    expect(
      resolveViewportEditShortcut({ ...macInput, code: 'ArrowUp', shiftKey: true }, 'darwin'),
    ).toBe(VIEWPORT_EDIT_COMMANDS.bringToFront);
    expect(resolveViewportEditShortcut({ ...macInput, code: 'ArrowDown' }, 'darwin')).toBe(
      VIEWPORT_EDIT_COMMANDS.sendBackward,
    );
    expect(
      resolveViewportEditShortcut({ ...macInput, code: 'ArrowDown', shiftKey: true }, 'darwin'),
    ).toBe(VIEWPORT_EDIT_COMMANDS.sendToBack);
    expect(resolveViewportEditShortcut({ ...macInput, code: 'Digit2' }, 'darwin')).toBe(
      VIEWPORT_EDIT_COMMANDS.lockSelection,
    );
    expect(resolveViewportEditShortcut({ ...macInput, code: 'Digit3' }, 'darwin')).toBe(
      VIEWPORT_EDIT_COMMANDS.unlockAll,
    );
    expect(
      resolveViewportEditShortcut({ ...macInput, altKey: true, code: 'Digit1' }, 'darwin'),
    ).toBe(VIEWPORT_EDIT_COMMANDS.alignLeft);
    expect(
      resolveViewportEditShortcut({ ...macInput, altKey: true, code: 'Digit2' }, 'darwin'),
    ).toBe(VIEWPORT_EDIT_COMMANDS.alignCenter);
    expect(
      resolveViewportEditShortcut({ ...macInput, altKey: true, code: 'Digit3' }, 'darwin'),
    ).toBe(VIEWPORT_EDIT_COMMANDS.alignRight);
    expect(
      resolveViewportEditShortcut({ ...macInput, altKey: true, code: 'Digit4' }, 'darwin'),
    ).toBe(VIEWPORT_EDIT_COMMANDS.alignTop);
    expect(
      resolveViewportEditShortcut({ ...macInput, altKey: true, code: 'Digit5' }, 'darwin'),
    ).toBe(VIEWPORT_EDIT_COMMANDS.alignMiddle);
    expect(
      resolveViewportEditShortcut({ ...macInput, altKey: true, code: 'Digit6' }, 'darwin'),
    ).toBe(VIEWPORT_EDIT_COMMANDS.alignBottom);
    expect(
      resolveViewportEditShortcut(
        { ...macInput, code: 'KeyC', ctrlKey: true, metaKey: false },
        'win32',
      ),
    ).toBe(VIEWPORT_EDIT_COMMANDS.copy);
    expect(resolveViewportEditShortcut({ ...macInput, ctrlKey: true }, 'darwin')).toBeUndefined();
    expect(resolveViewportEditShortcut({ ...macInput, metaKey: false }, 'darwin')).toBeUndefined();
    expect(resolveViewportEditShortcut({ ...macInput, shiftKey: true }, 'darwin')).toBeUndefined();
    expect(
      resolveViewportEditShortcut({ ...macInput, code: 'Digit2', shiftKey: true }, 'darwin'),
    ).toBeUndefined();
    expect(
      resolveViewportEditShortcut(
        { ...macInput, altKey: true, code: 'Digit1', shiftKey: true },
        'darwin',
      ),
    ).toBeUndefined();
    expect(
      resolveViewportEditShortcut({ ...macInput, altKey: true, code: 'KeyC' }, 'darwin'),
    ).toBeUndefined();
    expect(
      resolveViewportEditShortcut(
        { ...macInput, code: 'KeyG', ctrlKey: true, metaKey: false },
        'win32',
      ),
    ).toBe(VIEWPORT_EDIT_COMMANDS.group);
    expect(
      resolveViewportEditShortcut(
        { ...macInput, altKey: true, code: 'Digit6', ctrlKey: true, metaKey: false },
        'win32',
      ),
    ).toBe(VIEWPORT_EDIT_COMMANDS.alignBottom);
    expect(resolveViewportEditShortcut({ ...macInput, code: 'KeyA' }, 'darwin')).toBeUndefined();
  });

  it('maps temporary snap bypass to the exact platform primary modifier', () => {
    expect(isViewportSnapBypassed({ altKey: false, ctrlKey: false, metaKey: true }, 'darwin')).toBe(
      true,
    );
    expect(isViewportSnapBypassed({ altKey: false, ctrlKey: true, metaKey: false }, 'win32')).toBe(
      true,
    );
    expect(isViewportSnapBypassed({ altKey: false, ctrlKey: true, metaKey: false }, 'darwin')).toBe(
      false,
    );
    expect(isViewportSnapBypassed({ altKey: false, ctrlKey: true, metaKey: true }, 'win32')).toBe(
      false,
    );
    expect(isViewportSnapBypassed({ altKey: true, ctrlKey: false, metaKey: true }, 'darwin')).toBe(
      false,
    );
  });

  it('normalizes pixel, line, and page wheel units into viewport-pixel pan', () => {
    expect(normalizeViewportWheel(wheelInput({ deltaX: 8, deltaY: 20 }), 600)).toEqual({
      deltaX: -8,
      deltaY: -20,
      kind: 'pan',
    });
    expect(normalizeViewportWheel(wheelInput({ deltaMode: 1, deltaY: 3 }), 600)).toEqual({
      deltaX: 0,
      deltaY: -3 * VIEWPORT_INPUT_POLICY.lineHeightPixels,
      kind: 'pan',
    });
    expect(normalizeViewportWheel(wheelInput({ deltaMode: 2, deltaY: 1 }), 600)).toEqual({
      deltaX: 0,
      deltaY: -600,
      kind: 'pan',
    });
  });

  it('maps shift-wheel onto horizontal pan only when native horizontal input is absent', () => {
    expect(normalizeViewportWheel(wheelInput({ deltaY: 24, shiftKey: true }), 600)).toEqual({
      deltaX: -24,
      deltaY: 0,
      kind: 'pan',
    });
    expect(
      normalizeViewportWheel(wheelInput({ deltaX: 5, deltaY: 24, shiftKey: true }), 600),
    ).toEqual({ deltaX: -5, deltaY: -24, kind: 'pan' });
  });

  it('turns Chromium pinch and command/control wheel into bounded exponential zoom factors', () => {
    const controlZoom = normalizeViewportWheel(wheelInput({ ctrlKey: true, deltaY: -100 }), 600);
    const commandZoom = normalizeViewportWheel(wheelInput({ deltaY: 100, metaKey: true }), 600);
    const boundedZoom = normalizeViewportWheel(
      wheelInput({ ctrlKey: true, deltaY: -1_000_000 }),
      600,
    );

    expect(controlZoom).toEqual({ factor: Math.exp(0.2), kind: 'zoom' });
    expect(commandZoom).toEqual({ factor: Math.exp(-0.2), kind: 'zoom' });
    expect(boundedZoom).toEqual({
      factor: Math.exp(
        VIEWPORT_INPUT_POLICY.maximumWheelDeltaPixels * VIEWPORT_INPUT_POLICY.zoomSensitivity,
      ),
      kind: 'zoom',
    });
  });

  it('ignores zero, malformed, and unknown-mode input without destabilizing the editor', () => {
    expect(normalizeViewportWheel(wheelInput(), 600)).toBeUndefined();
    expect(normalizeViewportWheel(wheelInput({ ctrlKey: true, deltaY: 0 }), 600)).toBeUndefined();
    expect(normalizeViewportWheel(wheelInput({ deltaMode: 99, deltaY: 10 }), 600)).toBeUndefined();
    expect(normalizeViewportWheel(wheelInput({ deltaY: Number.NaN }), 600)).toBeUndefined();
    expect(normalizeViewportWheel(wheelInput({ deltaY: 10 }), 0)).toBeUndefined();
  });
});
