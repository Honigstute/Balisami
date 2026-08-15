// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { parseProjectDocument } from '../src/domain';
import {
  captureResizeTarget,
  createResizeCommand,
  getResizeHandlePositions,
  hitTestResizeHandle,
  RESIZE_HANDLES,
  RESIZE_INTERACTION_POLICY,
  resolveResizeFrame,
  type ResizeTargetCapture,
} from '../src/renderer/editor/resize-geometry';
import {
  createDeviceScale,
  createViewportPoint,
  createViewportRect,
  createViewportTransform,
  createWorldPoint,
  createWorldRect,
  devicePointToViewport,
  viewportPointToDevice,
  worldRectToViewport,
} from '../src/renderer/editor/viewport-transform';
import { createValidProjectDocumentInput, DOCUMENT_FIXTURE_IDS } from './fixtures/project-document';

const createCapture = (): ResizeTargetCapture =>
  Object.freeze({
    elementId: DOCUMENT_FIXTURE_IDS.child,
    frame: Object.freeze({ x: 10, y: 20, width: 100, height: 50 }),
    worldBounds: createWorldRect(210, 320, 100, 50),
  });

describe('resize geometry', () => {
  it('derives eight clockwise fixed-screen handles and deterministic overlapping hit zones', () => {
    const bounds = createViewportRect(10, 20, 100, 40);
    expect(getResizeHandlePositions(bounds)).toEqual([
      { handle: 'northWest', point: { x: 10, y: 20 } },
      { handle: 'north', point: { x: 60, y: 20 } },
      { handle: 'northEast', point: { x: 110, y: 20 } },
      { handle: 'east', point: { x: 110, y: 40 } },
      { handle: 'southEast', point: { x: 110, y: 60 } },
      { handle: 'south', point: { x: 60, y: 60 } },
      { handle: 'southWest', point: { x: 10, y: 60 } },
      { handle: 'west', point: { x: 10, y: 40 } },
    ]);
    expect(hitTestResizeHandle(createViewportPoint(110, 40), bounds)).toBe('east');
    expect(hitTestResizeHandle(createViewportPoint(118, 48), bounds)).toBe('east');
    expect(hitTestResizeHandle(createViewportPoint(118.01, 48), bounds)).toBeUndefined();

    const tinyBounds = createViewportRect(0, 0, 8, 8);
    expect(hitTestResizeHandle(createViewportPoint(2, 0), tinyBounds)).toBe('northWest');
  });

  it('keeps screen hit behavior invariant across zoom and device scale', () => {
    const worldBounds = createWorldRect(40, 60, 120, 48);
    for (const zoom of [0.1, 1, 4]) {
      const bounds = worldRectToViewport(
        worldBounds,
        createViewportTransform({ panX: 17, panY: -9, zoom }),
      );
      for (const scale of [1, 1.25, 2]) {
        const deviceScale = createDeviceScale(scale);
        for (const position of getResizeHandlePositions(bounds)) {
          const roundTrip = devicePointToViewport(
            viewportPointToDevice(position.point, deviceScale),
            deviceScale,
          );
          expect(hitTestResizeHandle(roundTrip, bounds)).toBe(position.handle);
        }
      }
    }
  });

  it('resizes all handles from the immutable frame while retaining opposite anchors', () => {
    const capture = createCapture();
    const start = createWorldPoint(0, 0);
    const current = createWorldPoint(20, 10);
    const expected = {
      northWest: { x: 30, y: 30, width: 80, height: 40 },
      north: { x: 10, y: 30, width: 100, height: 40 },
      northEast: { x: 10, y: 30, width: 120, height: 40 },
      east: { x: 10, y: 20, width: 120, height: 50 },
      southEast: { x: 10, y: 20, width: 120, height: 60 },
      south: { x: 10, y: 20, width: 100, height: 60 },
      southWest: { x: 30, y: 20, width: 80, height: 60 },
      west: { x: 30, y: 20, width: 80, height: 50 },
    } as const;

    for (const handle of RESIZE_HANDLES) {
      expect(resolveResizeFrame(capture, handle, start, current, false).frame).toEqual(
        expected[handle],
      );
    }
  });

  it('clamps before crossing the opposite anchor and preserves aspect from the start frame', () => {
    const capture = createCapture();
    const start = createWorldPoint(0, 0);
    const minimum = resolveResizeFrame(
      capture,
      'northWest',
      start,
      createWorldPoint(500, 500),
      false,
    );
    expect(minimum.frame).toEqual({ x: 102, y: 62, width: 8, height: 8 });
    expect(minimum.frame.x + minimum.frame.width).toBe(110);
    expect(minimum.frame.y + minimum.frame.height).toBe(70);

    const corner = resolveResizeFrame(capture, 'southEast', start, createWorldPoint(50, 25), true);
    expect(corner.frame).toEqual({ x: 10, y: 20, width: 150, height: 75 });
    expect(corner.frame.width / corner.frame.height).toBe(2);

    const edge = resolveResizeFrame(capture, 'east', start, createWorldPoint(50, 999), true);
    expect(edge.frame).toEqual({ x: 10, y: 7.5, width: 150, height: 75 });
    expect(edge.frame.y + edge.frame.height / 2).toBe(45);
  });

  it('preserves ratio and the documented opposite anchor for every Shift handle', () => {
    const capture = createCapture();
    const start = createWorldPoint(0, 0);
    const current = createWorldPoint(50, 25);
    const startRight = capture.frame.x + capture.frame.width;
    const startBottom = capture.frame.y + capture.frame.height;
    const startCenterX = capture.frame.x + capture.frame.width / 2;
    const startCenterY = capture.frame.y + capture.frame.height / 2;

    for (const handle of RESIZE_HANDLES) {
      const frame = resolveResizeFrame(capture, handle, start, current, true).frame;
      expect(frame.width / frame.height).toBeCloseTo(2, 12);
      if (handle === 'northWest' || handle === 'west' || handle === 'southWest') {
        expect(frame.x + frame.width).toBeCloseTo(startRight, 12);
      }
      if (handle === 'northEast' || handle === 'east' || handle === 'southEast') {
        expect(frame.x).toBeCloseTo(capture.frame.x, 12);
      }
      if (handle === 'northWest' || handle === 'north' || handle === 'northEast') {
        expect(frame.y + frame.height).toBeCloseTo(startBottom, 12);
      }
      if (handle === 'southWest' || handle === 'south' || handle === 'southEast') {
        expect(frame.y).toBeCloseTo(capture.frame.y, 12);
      }
      if (handle === 'north' || handle === 'south') {
        expect(frame.x + frame.width / 2).toBeCloseTo(startCenterX, 12);
      }
      if (handle === 'east' || handle === 'west') {
        expect(frame.y + frame.height / 2).toBeCloseTo(startCenterY, 12);
      }
    }
  });

  it('captures nested local and world geometry without mixing their origins', () => {
    const parsed = parseProjectDocument(createValidProjectDocumentInput());
    if (!parsed.ok) {
      throw new Error('Resize capture fixture is invalid.');
    }
    const capture = captureResizeTarget(parsed.value, DOCUMENT_FIXTURE_IDS.child);
    expect(capture).toMatchObject({
      elementId: DOCUMENT_FIXTURE_IDS.child,
      frame: { x: 16, y: 24, width: 120, height: 48 },
      worldBounds: { x: -4, y: 36.5, width: 120, height: 48 },
    });
    if (capture === undefined) {
      throw new Error('Nested resize target was not captured.');
    }
    const resolved = resolveResizeFrame(
      capture,
      'southEast',
      createWorldPoint(116, 84.5),
      createWorldPoint(146, 104.5),
      false,
    );
    expect(resolved.frame).toEqual({ x: 16, y: 24, width: 150, height: 68 });
    expect(resolved.worldBounds).toEqual({ x: -4, y: 36.5, width: 150, height: 68 });
    expect(createResizeCommand(capture, resolved.frame)).toEqual({
      type: 'element.set-frame',
      elementId: DOCUMENT_FIXTURE_IDS.child,
      frame: resolved.frame,
    });
  });

  it('rejects a target whose canonical ancestor is locked', () => {
    const input = createValidProjectDocumentInput();
    input.elementsById[DOCUMENT_FIXTURE_IDS.group]!.locked = true;
    const parsed = parseProjectDocument(input);
    if (!parsed.ok) {
      throw new Error('Ancestor-lock resize fixture is invalid.');
    }
    expect(captureResizeTarget(parsed.value, DOCUMENT_FIXTURE_IDS.child)).toBeUndefined();
  });

  it('keeps explicit minimum and handle dimensions valid', () => {
    expect(RESIZE_INTERACTION_POLICY.minimumWidthWorldUnits).toBeGreaterThan(0);
    expect(RESIZE_INTERACTION_POLICY.minimumHeightWorldUnits).toBeGreaterThan(0);
    expect(RESIZE_INTERACTION_POLICY.handleHitSizePixels).toBeGreaterThanOrEqual(
      RESIZE_INTERACTION_POLICY.handleSizePixels,
    );
  });
});
