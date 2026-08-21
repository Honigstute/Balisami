export const PROJECT_HOME_REGION_ATTRIBUTE = 'data-project-home-region' as const;

export const PROJECT_HOME_REGIONS = Object.freeze({
  main: 'main',
  recent: 'recent',
  root: 'root',
  start: 'start',
} as const);

export const PROJECT_HOME_ACTION_ATTRIBUTE = 'data-project-home-action' as const;

export const PROJECT_HOME_ACTIONS = Object.freeze({
  newProject: 'new-project',
  openProject: 'open-project',
} as const);
