import { useEffect, useState } from 'react';

import m11PerformanceContract from '../../../m11-performance-contract.json';
import {
  createM11PerformanceFixtures,
  type M11ProjectPerformanceFixture,
} from '../../domain/performance/m11-project-fixtures';
import type { M11RenderPerformanceResult } from '../../shared/m11-performance';
import { AppShell } from '../shell/AppShell';
import { getBrowserControlTextMeasurementService } from '../controls/control-text-measurement';
import type { ProjectAssetUrls } from '../projects/project-asset-urls';
import { DocumentScene } from './DocumentScene';
import { DocumentSceneModel } from './document-scene-model';
import { createBrowserAnimationFrameScheduler, ViewportCameraStore } from './viewport-camera-store';
import {
  createDeviceScale,
  createViewportSize,
  createViewportTransform,
} from './viewport-transform';

interface M11PerformanceFixtureProps {
  readonly quickAddShortcut: string;
  readonly runtimeLabel: string;
}

interface ActiveRender {
  readonly assetUrls: ProjectAssetUrls;
  readonly fixture: M11ProjectPerformanceFixture;
  readonly index: number;
  readonly model: DocumentSceneModel;
  readonly startedAt: number;
  readonly textMeasurementService: Awaited<
    ReturnType<typeof getBrowserControlTextMeasurementService>
  >;
}

const TRANSPARENT_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+Av5X9QAAAABJRU5ErkJggg==';

const createFixtureAssetUrls = (fixture: M11ProjectPerformanceFixture): ProjectAssetUrls =>
  Object.freeze(
    Object.fromEntries(
      Object.keys(fixture.document.assetsById).map((assetId) => [
        assetId,
        TRANSPARENT_PNG_DATA_URL,
      ]),
    ),
  );

const createCamera = (): ViewportCameraStore =>
  new ViewportCameraStore({
    initialDeviceScale: createDeviceScale(
      Number.isFinite(window.devicePixelRatio) && window.devicePixelRatio > 0
        ? window.devicePixelRatio
        : 1,
    ),
    initialTransform: createViewportTransform({ panX: 0, panY: 0, zoom: 1 }),
    // The fixture intentionally exposes every object to the presenter instead of
    // measuring culling. The ordinary viewport probe owns camera/culling budgets.
    initialViewport: createViewportSize(100_000, 100_000),
    scheduler: createBrowserAnimationFrameScheduler(),
  });

/** Measures the real registry projection and keyed SVG presenter in the packaged renderer. */
export const M11PerformanceFixture = ({
  quickAddShortcut,
  runtimeLabel,
}: M11PerformanceFixtureProps) => {
  const [camera] = useState(createCamera);
  const [fixtures] = useState(createM11PerformanceFixtures);
  const [activeRender, setActiveRender] = useState<ActiveRender | undefined>(undefined);
  const [measurements, setMeasurements] = useState<Partial<M11RenderPerformanceResult> | undefined>(
    undefined,
  );

  useEffect(() => {
    let disposed = false;
    const prepare = async (): Promise<void> => {
      if (document.fonts !== undefined) {
        await document.fonts.ready;
      }
      const textMeasurementService = await getBrowserControlTextMeasurementService(document);
      const fixture = fixtures[0];
      if (!disposed && fixture !== undefined) {
        setActiveRender({
          assetUrls: createFixtureAssetUrls(fixture),
          fixture,
          index: 0,
          model: new DocumentSceneModel(),
          startedAt: performance.now(),
          textMeasurementService,
        });
      }
    };
    void prepare();
    return () => {
      disposed = true;
      camera.cancelPending();
    };
  }, [camera, fixtures]);

  useEffect(() => {
    if (activeRender === undefined) {
      return;
    }
    let disposed = false;
    let firstFrame = 0;
    let secondFrame = 0;
    firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        if (disposed) {
          return;
        }
        const root = document.querySelector(
          `[data-m11-scenario="${activeRender.fixture.scenario}"] [data-scene-content="document-elements"]`,
        );
        if (root === null) {
          throw new Error('The M11 performance scene did not mount.');
        }
        const measurement = Object.freeze({
          renderMs: performance.now() - activeRender.startedAt,
          renderedElementCount: root.childElementCount,
        });
        const nextMeasurements = Object.freeze({
          ...measurements,
          ...(activeRender.fixture.scenario === 'asset-heavy'
            ? { assetHeavy: measurement }
            : { componentHeavy: measurement }),
        });
        const nextFixture = fixtures[activeRender.index + 1];
        if (nextFixture !== undefined) {
          setMeasurements(nextMeasurements);
          setActiveRender({
            assetUrls: createFixtureAssetUrls(nextFixture),
            fixture: nextFixture,
            index: activeRender.index + 1,
            model: new DocumentSceneModel(),
            startedAt: performance.now(),
            textMeasurementService: activeRender.textMeasurementService,
          });
          return;
        }
        setMeasurements(nextMeasurements);
        setActiveRender(undefined);
      });
    });
    return () => {
      disposed = true;
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, [activeRender, fixtures, measurements]);

  const completeResult =
    measurements?.assetHeavy === undefined || measurements.componentHeavy === undefined
      ? undefined
      : (Object.freeze({
          assetHeavy: measurements.assetHeavy,
          componentHeavy: measurements.componentHeavy,
        }) satisfies M11RenderPerformanceResult);

  return (
    <AppShell
      projectName="M11 performance"
      {...(completeResult === undefined
        ? {}
        : {
            projectProbeState: {
              attributeName: m11PerformanceContract.resultAttribute,
              value: JSON.stringify(completeResult),
            },
          })}
      quickAddShortcut={quickAddShortcut}
      regionContent={{
        canvas:
          activeRender === undefined ? undefined : (
            <svg
              aria-label={`${activeRender.fixture.scenario} performance scene`}
              data-m11-scenario={activeRender.fixture.scenario}
              height="100%"
              role="img"
              width="100%"
            >
              <DocumentScene
                activeBoardId={activeRender.fixture.boardId}
                assetUrls={activeRender.assetUrls}
                camera={camera}
                document={activeRender.fixture.document}
                key={activeRender.fixture.scenario}
                model={activeRender.model}
                textMeasurementService={activeRender.textMeasurementService}
              />
            </svg>
          ),
      }}
      statusLabel={
        activeRender === undefined
          ? 'M11 performance measurements complete'
          : `Measuring ${activeRender.fixture.scenario} project…`
      }
      statusScope={runtimeLabel}
      statusTone="quiet"
      usePersistedLayout={false}
    />
  );
};
