import { describe, expect, it } from 'vitest';

import {
  migrateProjectDocumentV1ToV2,
  migrateProjectDocumentV2ToV3,
  migrateProjectDocumentV3ToV4,
  migrateProjectDocumentV4ToV5,
  migrateProjectDocumentV5ToV6,
} from '../src/domain';
import { createValidProjectDocumentInput, DOCUMENT_FIXTURE_IDS } from './fixtures/project-document';

describe('project document migrations', () => {
  const withoutAlternateFields = (
    boardsById: ReturnType<typeof createValidProjectDocumentInput>['boardsById'],
  ) =>
    Object.fromEntries(
      Object.entries(boardsById).map(([boardId, board]) => {
        const { alternateIds, selectedAlternateId, ...releasedBoard } = board;
        void alternateIds;
        void selectedAlternateId;
        return [boardId, releasedBoard];
      }),
    );

  const withoutRowData = (
    elementsById: ReturnType<typeof createValidProjectDocumentInput>['elementsById'],
  ) =>
    Object.fromEntries(
      Object.entries(elementsById).map(([elementId, value]) => {
        const { rowData, ...releasedElement } = value;
        void rowData;
        return [elementId, releasedElement];
      }),
    );

  it('adds durable source control versions without mutating released v1 input', () => {
    const current = createValidProjectDocumentInput();
    const { componentIds, componentsById, trashedBoardIds, ...v2Fields } = current;
    void componentIds;
    void componentsById;
    void trashedBoardIds;
    const legacy = {
      ...v2Fields,
      boardsById: withoutAlternateFields(current.boardsById),
      schemaVersion: 1,
      elementsById: Object.fromEntries(
        Object.entries(current.elementsById).map(([elementId, value]) => {
          const { controlVersion, rowData, ...element } = value;
          void controlVersion;
          void rowData;
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

  it('adds an empty durable trash partition without mutating released v2 input', () => {
    const current = createValidProjectDocumentInput();
    const { componentIds, componentsById, trashedBoardIds, ...v2Fields } = current;
    void componentIds;
    void componentsById;
    void trashedBoardIds;
    const released = {
      ...v2Fields,
      boardsById: withoutAlternateFields(current.boardsById),
      schemaVersion: 2,
      elementsById: withoutRowData(current.elementsById),
    };
    const before = structuredClone(released);
    const migrated = migrateProjectDocumentV2ToV3(released);

    expect(migrated).toMatchObject({ ok: true });
    if (!migrated.ok) {
      throw new Error(migrated.message);
    }
    expect(migrated.value.schemaVersion).toBe(3);
    expect(migrated.value.trashedBoardIds).toEqual([]);
    expect(Object.isFrozen(migrated.value.trashedBoardIds)).toBe(true);
    expect(released).toEqual(before);
  });

  it('adds empty alternate families without mutating released v3 input', () => {
    const current = createValidProjectDocumentInput();
    const { componentIds, componentsById, ...v4Fields } = current;
    void componentIds;
    void componentsById;
    const released = {
      ...v4Fields,
      boardsById: withoutAlternateFields(current.boardsById),
      schemaVersion: 3,
      elementsById: withoutRowData(current.elementsById),
    };
    const before = structuredClone(released);
    const migrated = migrateProjectDocumentV3ToV4(released);

    expect(migrated).toMatchObject({ ok: true });
    if (!migrated.ok) {
      throw new Error(migrated.message);
    }
    expect(migrated.value.schemaVersion).toBe(4);
    expect(migrated.value.boardsById[DOCUMENT_FIXTURE_IDS.board]).toMatchObject({
      alternateIds: [],
      selectedAlternateId: null,
    });
    expect(
      Object.isFrozen(migrated.value.boardsById[DOCUMENT_FIXTURE_IDS.board]?.alternateIds),
    ).toBe(true);
    expect(released).toEqual(before);
  });

  it('adds an empty ordered component library without mutating released v4 input', () => {
    const current = createValidProjectDocumentInput();
    const { componentIds, componentsById, ...v4Fields } = current;
    void componentIds;
    void componentsById;
    const released = {
      ...v4Fields,
      elementsById: withoutRowData(current.elementsById),
      schemaVersion: 4,
    };
    const before = structuredClone(released);
    const migrated = migrateProjectDocumentV4ToV5(released);

    expect(migrated).toMatchObject({ ok: true });
    if (!migrated.ok) {
      throw new Error(migrated.message);
    }
    expect(migrated.value.schemaVersion).toBe(5);
    expect(migrated.value.componentIds).toEqual([]);
    expect(migrated.value.componentsById).toEqual({});
    expect(Object.isFrozen(migrated.value.componentIds)).toBe(true);
    expect(Object.isFrozen(migrated.value.componentsById)).toBe(true);
    expect(released).toEqual(before);
  });

  it('adds exact empty row bindings without mutating released v5 input', () => {
    const current = createValidProjectDocumentInput();
    const released = {
      ...current,
      elementsById: withoutRowData(current.elementsById),
      schemaVersion: 5,
    };
    const before = structuredClone(released);
    const migrated = migrateProjectDocumentV5ToV6(released);

    expect(migrated).toMatchObject({ ok: true });
    if (!migrated.ok) throw new Error(migrated.message);
    expect(migrated.value.schemaVersion).toBe(6);
    for (const element of Object.values(migrated.value.elementsById)) {
      expect(element.rowData).toEqual({ version: 1, nextId: 0, bindings: [] });
      expect(Object.isFrozen(element.rowData)).toBe(true);
    }
    expect(released).toEqual(before);
  });

  it('rejects malformed legacy input instead of guessing a migration', () => {
    expect(migrateProjectDocumentV1ToV2({ schemaVersion: 1 })).toEqual({
      ok: false,
      message: 'Version 1 project document has an invalid structure.',
    });
    expect(migrateProjectDocumentV2ToV3({ schemaVersion: 2 })).toEqual({
      ok: false,
      message: 'Version 2 project document has an invalid structure.',
    });
    expect(migrateProjectDocumentV3ToV4({ schemaVersion: 3 })).toEqual({
      ok: false,
      message: 'Version 3 project document has an invalid structure.',
    });
    expect(migrateProjectDocumentV4ToV5({ schemaVersion: 4 })).toEqual({
      ok: false,
      message: 'Version 4 project document has an invalid structure.',
    });
    expect(migrateProjectDocumentV5ToV6({ schemaVersion: 5 })).toEqual({
      ok: false,
      message: 'Version 5 project document has an invalid structure.',
    });
  });
});
