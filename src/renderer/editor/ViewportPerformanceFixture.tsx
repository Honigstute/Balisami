import { Profiler, useEffect, useRef, useState } from 'react';

import viewportPerformanceContract from '../../../viewport-performance-contract.json';
import {
  BoardIdSchema,
  ElementIdSchema,
  FOUNDATION_CONTROL_TYPES,
  PROJECT_DOCUMENT_SCHEMA_VERSION,
  getControlSpec,
  parseProjectDocument,
  ProjectIdSchema,
  type ElementId,
  type ProjectDocument,
} from '../../domain';
import type { ViewportPerformanceResult } from '../../shared/viewport-performance';
import { AppShell } from '../shell/AppShell';
import { DocumentScene } from './DocumentScene';
import { DocumentSceneModel } from './document-scene-model';
import { ViewportCameraStore, type AnimationFrameScheduler } from './viewport-camera-store';
import {
  createDeviceScale,
  createViewportSize,
  createViewportTransform,
} from './viewport-transform';
import { ViewportScene } from './ViewportScene';

interface ViewportPerformanceFixtureProps {
  readonly quickAddShortcut: string;
  readonly runtimeLabel: string;
}

interface PerformanceFixtureDocument {
  readonly boardId: ReturnType<typeof BoardIdSchema.parse>;
  readonly document: ProjectDocument;
}

const RECTANGLE_CONTROL_VERSION = (() => {
  const definition = getControlSpec(FOUNDATION_CONTROL_TYPES.rectangle);
  if (definition === undefined) {
    throw new Error('Viewport performance fixture Rectangle is not registered.');
  }
  return definition.fileVersion;
})();

class MeasuringAnimationFrameScheduler implements AnimationFrameScheduler {
  #enabled = false;
  #samples: number[] = [];

  cancel = (requestId: number): void => window.cancelAnimationFrame(requestId);

  request = (callback: (timestamp: number) => void): number =>
    window.requestAnimationFrame((timestamp) => {
      const startedAt = performance.now();
      callback(timestamp);
      if (this.#enabled) {
        this.#samples.push(performance.now() - startedAt);
      }
    });

  beginMeasurement(): void {
    this.#samples = [];
    this.#enabled = true;
  }

  endMeasurement(): readonly number[] {
    this.#enabled = false;
    return Object.freeze([...this.#samples]);
  }
}

const createPerformanceFixtureDocument = (): PerformanceFixtureDocument => {
  const projectId = ProjectIdSchema.parse('project_viewport_performance');
  const boardId = BoardIdSchema.parse('board_viewport_performance');
  const childIds: ElementId[] = [];
  const elementsById: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  const columnCount = 50;

  for (let index = 0; index < 1_000; index += 1) {
    const elementId = ElementIdSchema.parse(`element_perf${String(index).padStart(6, '0')}`);
    const column = index % columnCount;
    const row = Math.floor(index / columnCount);
    childIds.push(elementId);
    elementsById[elementId] = {
      id: elementId,
      controlType: FOUNDATION_CONTROL_TYPES.rectangle,
      controlVersion: RECTANGLE_CONTROL_VERSION,
      frame: { x: column * 160 - 400, y: row * 120 - 300, width: 120, height: 80 },
      locked: false,
      properties: {},
      childIds: [],
      assetIds: [],
      link: null,
    };
  }

  const parsed = parseProjectDocument({
    schemaVersion: PROJECT_DOCUMENT_SCHEMA_VERSION,
    id: projectId,
    name: 'Viewport performance fixture',
    boardIds: [boardId],
    componentIds: [],
    trashedBoardIds: [],
    boardsById: {
      [boardId]: {
        id: boardId,
        name: '1,000 element scene',
        note: { text: '' },
        childIds,
        alternateIds: [],
        selectedAlternateId: null,
      },
    },
    elementsById,
    assetsById: {},
  });
  if (!parsed.ok) {
    throw new Error('The packaged viewport performance fixture is invalid.');
  }
  return Object.freeze({ boardId, document: parsed.value });
};

const percentile95 = (samples: readonly number[]): number => {
  if (samples.length === 0) {
    return 0;
  }
  const ordered = [...samples].sort((first, second) => first - second);
  return ordered[Math.ceil(ordered.length * 0.95) - 1] ?? 0;
};

const getDeviceScale = (): number => {
  const scale = window.devicePixelRatio;
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
};

/** Production-renderer performance gate; activated only by the packaged probe argument. */
export const ViewportPerformanceFixture = ({
  quickAddShortcut,
  runtimeLabel,
}: ViewportPerformanceFixtureProps) => {
  const [fixture] = useState(createPerformanceFixtureDocument);
  const [model] = useState(() => new DocumentSceneModel());
  const [harness] = useState(() => {
    const scheduler = new MeasuringAnimationFrameScheduler();
    const camera = new ViewportCameraStore({
      initialDeviceScale: createDeviceScale(getDeviceScale()),
      initialTransform: createViewportTransform({ panX: 400, panY: 300, zoom: 1 }),
      initialViewport: createViewportSize(1, 1),
      scheduler,
    });
    return Object.freeze({ camera, scheduler });
  });
  const [result, setResult] = useState<ViewportPerformanceResult | undefined>(undefined);
  const reactCommitCount = useRef(0);

  useEffect(() => {
    let active = true;
    let driverFrameId: number | undefined;
    let unsubscribeCamera: (() => void) | undefined;
    let mutationObserver: MutationObserver | undefined;
    let longTaskObserver: PerformanceObserver | undefined;
    const waitFrameIds = new Set<number>();
    const inputLatencies: number[] = [];
    const longTasks: number[] = [];
    let pendingInputStartedAt: number | undefined;
    let addedNodeCount = 0;
    let removedNodeCount = 0;

    const waitForFrame = (): Promise<void> =>
      new Promise((resolve) => {
        const frameId = window.requestAnimationFrame(() => {
          waitFrameIds.delete(frameId);
          resolve();
        });
        waitFrameIds.add(frameId);
      });

    const run = async (): Promise<void> => {
      if (document.fonts !== undefined) {
        await document.fonts.ready;
      }
      await waitForFrame();
      await waitForFrame();
      if (!active) {
        return;
      }
      harness.camera.flushPending();
      const sceneRoot = document.querySelector('[data-scene-content="document-elements"]');
      if (sceneRoot === null) {
        throw new Error('The viewport performance scene did not mount.');
      }
      mutationObserver = new MutationObserver((records) => {
        for (const record of records) {
          addedNodeCount += record.addedNodes.length;
          removedNodeCount += record.removedNodes.length;
        }
      });
      mutationObserver.observe(sceneRoot, { childList: true });
      if (PerformanceObserver.supportedEntryTypes.includes('longtask')) {
        longTaskObserver = new PerformanceObserver((list) => {
          longTasks.push(...list.getEntries().map((entry) => entry.duration));
        });
        longTaskObserver.observe({ entryTypes: ['longtask'] });
      }
      unsubscribeCamera = harness.camera.subscribe(() => {
        if (pendingInputStartedAt !== undefined) {
          inputLatencies.push(performance.now() - pendingInputStartedAt);
          pendingInputStartedAt = undefined;
        }
      });
      const baselineReactCommits = reactCommitCount.current;
      harness.scheduler.beginMeasurement();
      const startedAt = performance.now();

      await new Promise<void>((resolve) => {
        const drive = (): void => {
          const elapsed = performance.now() - startedAt;
          if (!active || elapsed >= viewportPerformanceContract.durationMs) {
            resolve();
            return;
          }
          const progress = elapsed / viewportPerformanceContract.durationMs;
          const zoom = 1 + Math.sin(progress * Math.PI * 4) * 0.2;
          pendingInputStartedAt = performance.now();
          harness.camera.scheduleTransform(
            createViewportTransform({
              panX: 400 - progress * 7_000,
              panY: 300 - Math.sin(progress * Math.PI * 2) * 600,
              zoom,
            }),
          );
          driverFrameId = window.requestAnimationFrame(drive);
        };
        driverFrameId = window.requestAnimationFrame(drive);
      });
      await waitForFrame();
      await waitForFrame();
      if (!active) {
        return;
      }
      unsubscribeCamera();
      unsubscribeCamera = undefined;
      mutationObserver.disconnect();
      longTaskObserver?.disconnect();
      const frameWork = harness.scheduler.endMeasurement();
      const durationMs = performance.now() - startedAt;
      const measuredResult = Object.freeze({
        addedNodeCount,
        durationMs,
        frameSampleCount: frameWork.length,
        frameWorkMaximumMs: Math.max(0, ...frameWork),
        frameWorkP95Ms: percentile95(frameWork),
        inputLatencyP95Ms: percentile95(inputLatencies),
        longTaskCount: longTasks.length,
        maximumLongTaskMs: Math.max(0, ...longTasks),
        reactCommitsDuringRun: reactCommitCount.current - baselineReactCommits,
        removedNodeCount,
      }) satisfies ViewportPerformanceResult;
      setResult(measuredResult);
    };

    void run().catch(() => {
      if (active) {
        setResult(
          Object.freeze({
            addedNodeCount: 0,
            durationMs: 1,
            frameSampleCount: 0,
            frameWorkMaximumMs: viewportPerformanceContract.maximumFrameWorkMs + 1,
            frameWorkP95Ms: viewportPerformanceContract.maximumFrameWorkP95Ms + 1,
            inputLatencyP95Ms: viewportPerformanceContract.maximumInputLatencyP95Ms + 1,
            longTaskCount: 1,
            maximumLongTaskMs: viewportPerformanceContract.maximumFrameWorkMs + 1,
            reactCommitsDuringRun: 1,
            removedNodeCount: 0,
          }),
        );
      }
    });

    return () => {
      active = false;
      if (driverFrameId !== undefined) {
        window.cancelAnimationFrame(driverFrameId);
      }
      for (const frameId of waitFrameIds) {
        window.cancelAnimationFrame(frameId);
      }
      unsubscribeCamera?.();
      mutationObserver?.disconnect();
      longTaskObserver?.disconnect();
      harness.camera.cancelPending();
    };
  }, [harness]);

  return (
    <AppShell
      projectName="Viewport performance"
      {...(result === undefined
        ? {}
        : {
            projectProbeState: {
              attributeName: viewportPerformanceContract.resultAttribute,
              value: JSON.stringify(result),
            },
          })}
      quickAddShortcut={quickAddShortcut}
      regionContent={{
        canvas: (
          <Profiler id="viewport-canvas" onRender={() => (reactCommitCount.current += 1)}>
            <ViewportScene
              camera={harness.camera}
              worldChildren={
                <DocumentScene
                  activeBoardId={fixture.boardId}
                  camera={harness.camera}
                  document={fixture.document}
                  model={model}
                />
              }
            />
          </Profiler>
        ),
      }}
      statusLabel="Measuring 1,000-element pan and zoom…"
      statusScope={runtimeLabel}
      statusTone="quiet"
      usePersistedLayout={false}
    />
  );
};
