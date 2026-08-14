// @vitest-environment node

import path from 'node:path';

import { describe, expect, it } from 'vitest';

import projectWorkflowProbeContract from '../project-workflow-probe-contract.json';
import { createProjectWorkflowProbeDialogs } from '../src/main/projects/project-workflow-packaged-probe';
import { parseProjectWorkflowProbeInvocation } from '../src/main/projects/project-workflow-probe-contract';

describe('packaged project-workflow probe', () => {
  it('requires exactly one dedicated mode and one absolute isolated root argument', () => {
    const root = path.resolve('/tmp/balsamic-packaged-project-workflow-test');
    expect(
      parseProjectWorkflowProbeInvocation(
        [
          '/app/Balsamic',
          projectWorkflowProbeContract.argument,
          `${projectWorkflowProbeContract.rootArgument}=${root}`,
        ],
        projectWorkflowProbeContract,
      ),
    ).toMatchObject({ kind: 'probe', root });
    expect(
      parseProjectWorkflowProbeInvocation(['/app/Balsamic'], projectWorkflowProbeContract),
    ).toEqual({ kind: 'none' });
    expect(
      parseProjectWorkflowProbeInvocation(
        [projectWorkflowProbeContract.argument, `${projectWorkflowProbeContract.rootArgument}=.`],
        projectWorkflowProbeContract,
      ),
    ).toMatchObject({ kind: 'invalid' });
    expect(
      parseProjectWorkflowProbeInvocation(
        [
          projectWorkflowProbeContract.argument,
          projectWorkflowProbeContract.argument,
          `${projectWorkflowProbeContract.rootArgument}=${root}`,
        ],
        projectWorkflowProbeContract,
      ),
    ).toMatchObject({ kind: 'invalid' });
  });

  it('uses only the authorized fixed user file and an explicit save close choice', async () => {
    const root = path.resolve('/tmp/balsamic-packaged-project-workflow-test');
    const dialogs = createProjectWorkflowProbeDialogs(
      root,
      projectWorkflowProbeContract.userFileName,
    );
    await expect(dialogs.chooseSaveProject('ignored-name')).resolves.toEqual({
      status: 'selected',
      filePath: path.join(root, projectWorkflowProbeContract.userFileName),
    });
    await expect(dialogs.chooseUnsavedClose('ignored-project')).resolves.toEqual({
      status: 'selected',
      choice: 'save',
    });
  });
});
