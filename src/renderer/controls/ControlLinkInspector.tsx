import {
  getControlSpec,
  type ElementId,
  type ElementLink,
  type ElementNode,
  type ProjectDocument,
} from '../../domain';
import { areControlLinksEqual } from './control-link-equality';
import { ControlLinkFields } from './ControlLinkFields';

export interface ControlInspectorLinkUpdate {
  readonly elementId: ElementId;
  readonly link: ElementLink | null;
}

interface ControlLinkInspectorProps {
  readonly document: ProjectDocument;
  readonly elements: readonly ElementNode[];
  readonly onSetLinks: (updates: readonly ControlInspectorLinkUpdate[]) => boolean;
  readonly selectionRevision: number;
}

const getSharedLink = (elements: readonly ElementNode[]): ElementLink | null | undefined => {
  const first = elements[0]?.link;
  return first !== undefined &&
    elements.every((element) => areControlLinksEqual(element.link, first))
    ? first
    : undefined;
};

/** Common capability wrapper; row links reuse the exact same field lifecycle. */
export const ControlLinkInspector = ({
  document,
  elements,
  onSetLinks,
  selectionRevision,
}: ControlLinkInspectorProps) => {
  if (
    elements.length === 0 ||
    !elements.every((element) => getControlSpec(element.controlType)?.capabilities.link === true)
  ) {
    return null;
  }
  const sharedLink = getSharedLink(elements);
  return (
    <section className="inspector-section" data-control-link-inspector="true">
      <h3>Link</h3>
      <ControlLinkFields
        document={document}
        link={sharedLink}
        onCommit={(link) =>
          (sharedLink !== undefined && areControlLinksEqual(sharedLink, link)) ||
          onSetLinks(elements.map((element) => Object.freeze({ elementId: element.id, link })))
        }
        revisionKey={selectionRevision}
      />
    </section>
  );
};
