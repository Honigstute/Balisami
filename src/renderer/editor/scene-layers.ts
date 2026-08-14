export const SCENE_LAYER_ATTRIBUTE = 'data-scene-layer' as const;

export const SCENE_LAYERS = Object.freeze({
  background: 'background',
  document: 'document',
  dom: 'dom',
  interaction: 'interaction',
  world: 'world',
} as const);
