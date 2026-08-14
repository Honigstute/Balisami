import { useState } from 'react';

import { DESIGN_TOKENS } from '../../shared/design-tokens';
import type { VisualFixtureName } from '../../shared/visual-fixture';
import { AppShell } from '../shell/AppShell';
import { AppButton } from './AppButton';
import { AppScroller } from './AppEmptyState';
import { AppInput } from './AppInput';
import { AppModal, AppModalActions, AppModalHeading } from './AppModal';
import { AppNoticeCenter } from './AppNoticeCenter';
import { AppPopover } from './AppPopover';
import { AppSegmentedControl } from './AppSegmentedControl';
import { AppSelect } from './AppSelect';
import { AppSlider } from './AppSlider';
import { AppSwatch } from './AppSwatch';
import { AppTooltip } from './AppTooltip';
import { NoticeCenterStore } from './notice-center';

interface VisualConformanceFixtureProps {
  readonly fixture: VisualFixtureName;
  readonly quickAddShortcut: string;
  readonly runtimeLabel: string;
}

const ControlStates = () => {
  const [point, setPoint] = useState('left');
  return (
    <AppScroller>
      <div className="visual-control-fixture">
        <h3>Control states</h3>
        <AppInput hint="World units" kind="number" label="X" readOnly value={1141} />
        <AppInput
          kind="number"
          label="Width"
          readOnly
          validation="Use a positive width."
          value={0}
        />
        <AppInput label="Shared text" mixed readOnly value="" />
        <AppSelect
          defaultValue="normal"
          label="State"
          options={[
            { label: 'Normal', value: 'normal' },
            { label: 'Disabled', value: 'disabled' },
          ]}
        />
        <AppSegmentedControl
          label="Point"
          onChange={setPoint}
          options={[
            { label: 'Left', value: 'left' },
            { label: 'None', value: 'none' },
            { label: 'Right', value: 'right' },
          ]}
          value={point}
        />
        <AppSlider label="Opacity" max={100} min={0} output="64%" readOnly value={64} />
        <div className="visual-control-fixture__swatches">
          <span>Color</span>
          <AppSwatch
            color={DESIGN_TOKENS.color.accent}
            label="Selection color"
            onClick={() => undefined}
          />
          <AppSwatch
            color={DESIGN_TOKENS.color.canvas}
            disabled
            label="Disabled color"
            onClick={() => undefined}
          />
        </div>
        <AppInput disabled label="Disabled field" readOnly value="Unavailable" />
      </div>
    </AppScroller>
  );
};

const FeedbackOverlay = () => {
  const [store] = useState(() => {
    const noticeStore = new NoticeCenterStore();
    noticeStore.report(
      {
        key: 'fixture:failure',
        message: 'The rest of the editor remains available and stable.',
        title: 'Canvas was isolated',
        tone: 'danger',
      },
      0,
    );
    return noticeStore;
  });
  return <AppNoticeCenter store={store} />;
};

const StaticRegionFailure = () => (
  <div className="region-failure" role="status">
    <strong>Canvas unavailable</strong>
    <AppButton>Retry</AppButton>
  </div>
);

const TooltipFixture = () => (
  <div className="visual-overlay-fixture visual-overlay-fixture--tooltip">
    <AppTooltip content="Full control name stays outside shell layout" defaultOpen>
      {(triggerProps) => <AppButton {...triggerProps}>Hover or focus</AppButton>}
    </AppTooltip>
  </div>
);

const PopoverFixture = () => {
  const [open, setOpen] = useState(true);
  return (
    <div className="visual-overlay-fixture">
      <AppPopover
        label="Color options"
        onOpenChange={setOpen}
        open={open}
        trigger={(triggerProps) => <AppButton {...triggerProps}>Choose color</AppButton>}
      >
        <div className="visual-popover-content">
          <strong>Color options</strong>
          <AppSwatch
            color={DESIGN_TOKENS.color.accent}
            label="Draft blue"
            onClick={() => undefined}
          />
          <AppSwatch
            color={DESIGN_TOKENS.color.canvas}
            label="Canvas white"
            onClick={() => undefined}
          />
        </div>
      </AppPopover>
    </div>
  );
};

const ModalFixture = () => (
  <AppModal describedBy="visual-modal-copy" labelledBy="visual-modal-title">
    <AppModalHeading
      description="The modal overlays the fixed shell and traps focus without moving any region."
      descriptionId="visual-modal-copy"
      eyebrow="Visual fixture"
      title="Confirm a stable decision"
      titleId="visual-modal-title"
    />
    <AppModalActions>
      <AppButton>Cancel</AppButton>
      <AppButton initialFocus tone="primary">
        Continue
      </AppButton>
    </AppModalActions>
  </AppModal>
);

export const VisualConformanceFixture = ({
  fixture,
  quickAddShortcut,
  runtimeLabel,
}: VisualConformanceFixtureProps) => {
  const regionContent =
    fixture === 'controls'
      ? { inspector: <ControlStates /> }
      : fixture === 'feedback'
        ? { canvas: <StaticRegionFailure /> }
        : fixture === 'tooltip'
          ? { canvas: <TooltipFixture /> }
          : fixture === 'popover'
            ? { canvas: <PopoverFixture /> }
            : undefined;
  const projectOverlay =
    fixture === 'feedback' ? (
      <FeedbackOverlay />
    ) : fixture === 'modal' ? (
      <ModalFixture />
    ) : undefined;

  return (
    <AppShell
      projectName={`Visual · ${fixture}`}
      projectOverlay={projectOverlay}
      quickAddShortcut={quickAddShortcut}
      {...(regionContent === undefined ? {} : { regionContent })}
      statusLabel={`Visual fixture · ${fixture}`}
      statusScope={runtimeLabel}
      statusTone="quiet"
      usePersistedLayout={false}
    />
  );
};
