import { describe, expect, it } from 'vitest';

import { migrateProjectDocumentV1ToV2 } from '../src/domain';
import { createValidProjectDocumentInput, DOCUMENT_FIXTURE_IDS } from './fixtures/project-document';

describe('project document migrations', () => {
  it('adds durable source control versions without mutating released v1 input', () => {
    const current = createValidProjectDocumentInput();
    const legacy = {
      ...current,
      schemaVersion: 1,
      elementsById: Object.fromEntries(
        Object.entries(current.elementsById).map(([elementId, value]) => {
          const { controlVersion, ...element } = value;
          void controlVersion;
          return [elementId, element];
        }),
      ),
    };
    const before = structuredClone(legacy);
    const migrated = migrateProjectDocumentV1ToV2(legacy);

    expect(migrated).toMatchObject({ ok: true });
    if (!migrated.ok) {
      throw new Error(migrated.message);
    }
    expect(migrated.value.schemaVersion).toBe(2);
    expect(migrated.value.elementsById[DOCUMENT_FIXTURE_IDS.group]?.controlVersion).toBe(1);
    expect(migrated.value.elementsById[DOCUMENT_FIXTURE_IDS.child]?.controlVersion).toBe(1);
    expect(legacy).toEqual(before);
  });

  it('rejects malformed legacy input instead of guessing a migration', () => {
    expect(migrateProjectDocumentV1ToV2({ schemaVersion: 1 })).toEqual({
      ok: false,
      message: 'Version 1 project document has an invalid structure.',
    });
  });
});
