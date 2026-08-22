import { z } from 'zod';

import m11PerformanceContract from '../../m11-performance-contract.json';

const ScenarioResultSchema = z
  .strictObject({
    archiveBytes: z.number().int().positive(),
    openMs: z.number().finite().nonnegative(),
    renderMs: z.number().finite().nonnegative(),
    renderedElementCount: z.number().int().positive(),
    saveMs: z.number().finite().nonnegative(),
  })
  .readonly();

const RenderScenarioResultSchema = z
  .strictObject({
    renderMs: z.number().finite().nonnegative(),
    renderedElementCount: z.number().int().positive(),
  })
  .readonly();

export const M11RenderPerformanceResultSchema = z
  .strictObject({
    assetHeavy: RenderScenarioResultSchema,
    componentHeavy: RenderScenarioResultSchema,
  })
  .readonly();

export const M11PerformanceResultSchema = z
  .strictObject({
    assetHeavy: ScenarioResultSchema,
    componentHeavy: ScenarioResultSchema,
  })
  .readonly();

export type M11PerformanceResult = z.infer<typeof M11PerformanceResultSchema>;
export type M11PerformanceScenarioResult = z.infer<typeof ScenarioResultSchema>;
export type M11RenderPerformanceResult = z.infer<typeof M11RenderPerformanceResultSchema>;

export interface M11PerformanceBudgets {
  readonly expectedAssetRenderedElements: number;
  readonly expectedComponentRenderedElements: number;
  readonly maximumOpenMs: number;
  readonly maximumRenderMs: number;
  readonly maximumSaveMs: number;
  readonly minimumAssetArchiveBytes: number;
}

export const isM11PerformanceProbeRequested = (search: string): boolean =>
  new URLSearchParams(search).get(m11PerformanceContract.queryKey) ===
  m11PerformanceContract.queryValue;

export const parseM11PerformanceResult = (input: unknown): M11PerformanceResult | undefined => {
  if (typeof input !== 'string' || input.length > 8_192) {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(input);
    const result = M11PerformanceResultSchema.safeParse(parsed);
    return result.success ? result.data : undefined;
  } catch {
    return undefined;
  }
};

export const parseM11RenderPerformanceResult = (
  input: unknown,
): M11RenderPerformanceResult | undefined => {
  if (typeof input !== 'string' || input.length > 4_096) {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(input);
    const result = M11RenderPerformanceResultSchema.safeParse(parsed);
    return result.success ? result.data : undefined;
  } catch {
    return undefined;
  }
};

export const getM11PerformanceFailures = (
  result: M11PerformanceResult,
  budgets: M11PerformanceBudgets,
): readonly string[] => {
  const failures: string[] = [];
  for (const [label, scenario] of [
    ['Asset-heavy', result.assetHeavy],
    ['Component-heavy', result.componentHeavy],
  ] as const) {
    if (scenario.saveMs > budgets.maximumSaveMs) {
      failures.push(`${label} save exceeded its budget.`);
    }
    if (scenario.openMs + scenario.renderMs > budgets.maximumOpenMs) {
      failures.push(`${label} open-to-render exceeded its budget.`);
    }
    if (scenario.renderMs > budgets.maximumRenderMs) {
      failures.push(`${label} render exceeded its budget.`);
    }
  }
  if (result.assetHeavy.archiveBytes < budgets.minimumAssetArchiveBytes) {
    failures.push('The asset-heavy archive is smaller than the representative fixture floor.');
  }
  if (result.assetHeavy.renderedElementCount !== budgets.expectedAssetRenderedElements) {
    failures.push('The asset-heavy renderer did not present the complete fixture.');
  }
  if (result.componentHeavy.renderedElementCount !== budgets.expectedComponentRenderedElements) {
    failures.push('The component-heavy renderer did not present the complete fixture.');
  }
  return Object.freeze(failures.slice(0, 8));
};
