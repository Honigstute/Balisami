import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ViewportZoomControls } from '../src/renderer/editor/ViewportZoomControls';
import {
  ViewportCameraStore,
  type AnimationFrameScheduler,
} from '../src/renderer/editor/viewport-camera-store';
import {
  createDeviceScale,
  createViewportSize,
  createViewportTransform,
  createWorldRect,
} from '../src/renderer/editor/viewport-transform';

class TestAnimationFrameScheduler implements AnimationFrameScheduler {
  readonly callbacks = new Map<number, (timestamp: number) => void>();
  #nextId = 1;

  cancel = (requestId: number): void => {
    this.callbacks.delete(requestId);
  };

  request = (callback: (timestamp: number) => void): number => {
    const requestId = this.#nextId;
    this.#nextId += 1;
    this.callbacks.set(requestId, callback);
    return requestId;
  };

  flushNext(): void {
    const entry = this.callbacks.entries().next().value as
      readonly [number, (timestamp: number) => void] | undefined;
    if (entry === undefined) {
      throw new Error('No animation frame is pending.');
    }
    this.callbacks.delete(entry[0]);
    act(() => entry[1](16.67));
  }
}

const createStore = (scheduler: AnimationFrameScheduler, zoom = 1) =>
  new ViewportCameraStore({
    initialDeviceScale: createDeviceScale(1),
    initialTransform: createViewportTransform({ panX: 0, panY: 0, zoom }),
    initialViewport: createViewportSize(1_000, 600),
    scheduler,
  });

describe('viewport zoom controls', () => {
  it('shows a fixed percentage surface and keeps empty-board fit commands disabled', () => {
    const scheduler = new TestAnimationFrameScheduler();
    const camera = createStore(scheduler);
    render(<ViewportZoomControls boardBounds={undefined} camera={camera} platform="darwin" />);

    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    scheduler.flushNext();
    expect(screen.getByRole('button', { name: 'Zoom options, 120 percent' })).toHaveTextContent(
      '120%',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Zoom options, 120 percent' }));
    expect(screen.getByRole('button', { name: /Fit Board/u })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Fit Width/u })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Fit Selection/u })).toBeDisabled();
    expect(screen.getByText('⌘0')).toBeInTheDocument();
    expect(screen.getByText('⇧⌘1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Actual Size/u }));
    scheduler.flushNext();
    expect(screen.queryByRole('dialog', { name: 'Zoom options' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Zoom options, 100 percent' })).toBeInTheDocument();
  });

  it('runs fit commands from an overlay and preserves active framing through resize', () => {
    const scheduler = new TestAnimationFrameScheduler();
    const camera = createStore(scheduler);
    const bounds = createWorldRect(0, 0, 1_000, 1_000);
    render(<ViewportZoomControls boardBounds={bounds} camera={camera} platform="win32" />);

    fireEvent.click(screen.getByRole('button', { name: 'Zoom options, 100 percent' }));
    const fitBoard = screen.getByRole('button', { name: /Fit Board/u });
    expect(fitBoard).toBeEnabled();
    expect(fitBoard).toHaveTextContent('Ctrl+1');
    fireEvent.click(fitBoard);
    scheduler.flushNext();
    expect(camera.getSnapshot()).toMatchObject({
      framing: { kind: 'fit' },
      transform: { pan: { x: 248, y: 48 }, zoom: 0.504 },
    });

    camera.scheduleViewportResize(createViewportSize(1_400, 800));
    scheduler.flushNext();
    expect(camera.getSnapshot()).toMatchObject({
      framing: { kind: 'fit' },
      transform: { pan: { x: 348, y: 48 }, zoom: 0.704 },
    });
  });

  it('handles Ctrl/Cmd shortcuts without stealing keystrokes from editable controls', () => {
    const scheduler = new TestAnimationFrameScheduler();
    const camera = createStore(scheduler);
    const bounds = createWorldRect(0, 0, 1_000, 1_000);
    render(
      <>
        <ViewportZoomControls boardBounds={bounds} camera={camera} platform="win32" />
        <input aria-label="Editable value" />
      </>,
    );

    fireEvent.keyDown(window, { ctrlKey: true, key: '+' });
    scheduler.flushNext();
    expect(camera.getZoomSnapshot()).toBe(1.2);

    const input = screen.getByLabelText('Editable value');
    fireEvent.keyDown(input, { ctrlKey: true, key: '-' });
    expect(scheduler.callbacks.size).toBe(0);
    expect(camera.getZoomSnapshot()).toBe(1.2);

    fireEvent.keyDown(window, { key: '1', metaKey: true });
    scheduler.flushNext();
    expect(camera.getFramingSnapshot()).toMatchObject({ kind: 'fit' });
  });

  it('disables zoom buttons at the canonical camera limits', () => {
    const minimumScheduler = new TestAnimationFrameScheduler();
    const minimumCamera = createStore(minimumScheduler, 0.1);
    const minimumView = render(
      <ViewportZoomControls boardBounds={undefined} camera={minimumCamera} platform="win32" />,
    );
    expect(screen.getByRole('button', { name: 'Zoom out' })).toBeDisabled();
    minimumView.unmount();

    const maximumScheduler = new TestAnimationFrameScheduler();
    const maximumCamera = createStore(maximumScheduler, 4);
    render(
      <ViewportZoomControls boardBounds={undefined} camera={maximumCamera} platform="win32" />,
    );
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeDisabled();
  });
});
