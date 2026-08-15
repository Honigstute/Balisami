/**
 * Human-owned semantic curation layered on Lucide's canonical outline set.
 *
 * Lucide already publishes legacy/synonym aliases. These rules remove visual
 * variants that still communicate the same thing in a wireframe icon picker.
 * Variants that change direction, state, severity, or object type stay intact.
 */

export const ICON_SOURCE = Object.freeze({
  license: 'ISC',
  package: 'lucide-static',
  version: '1.31.0',
});

const SAME_MEANING_ALIASES = Object.freeze({
  'book-up-2': 'book-up',
  'calendar-check-2': 'calendar-check',
  'calendar-minus-2': 'calendar-minus',
  'calendar-plus-2': 'calendar-plus',
  'calendar-x-2': 'calendar-x',
  'disc-2': 'disc',
  'flower-2': 'flower',
  'folder-git-2': 'folder-git',
  'folder-search-2': 'folder-search',
  'gamepad-2': 'gamepad',
  'layers-2': 'layers',
  'link-2': 'link',
  'maximize-2': 'maximize',
  'minimize-2': 'minimize',
  'mouse-pointer-2': 'mouse-pointer',
  'music-2': 'music',
  'navigation-2': 'navigation',
  'package-2': 'package',
  'picture-in-picture-2': 'picture-in-picture',
  'plug-2': 'plug',
  'redo-2': 'redo',
  'repeat-2': 'repeat',
  'settings-2': 'settings',
  'share-2': 'share',
  'spell-check-2': 'spell-check',
  'table-2': 'table',
  'trash-2': 'trash',
  'undo-2': 'undo',
  'unlink-2': 'unlink',
});

const addAlias = (aliases, sourceNames, from, to, reason) => {
  if (!sourceNames.has(from) || !sourceNames.has(to)) {
    throw new Error(`Icon curation rule references a missing source icon: ${from} -> ${to}.`);
  }

  if (from !== to) {
    aliases.set(from, Object.freeze({ reason, to }));
  }
};

export const buildSemanticAliases = (names) => {
  const sourceNames = new Set(names);
  const aliases = new Map();

  // A host control can draw its own border, so a generic action does not need
  // separate circle- and square-contained copies in the icon catalog.
  for (const name of names) {
    if (name.startsWith('circle-') && sourceNames.has(name.slice('circle-'.length))) {
      addAlias(aliases, sourceNames, name, name.slice('circle-'.length), 'container-shape');
    }
    if (name.startsWith('square-') && sourceNames.has(name.slice('square-'.length))) {
      addAlias(aliases, sourceNames, name, name.slice('square-'.length), 'container-shape');
    }
  }

  // Clock-face numbers are presentation variations of the same clock meaning.
  for (const name of names.filter((value) => /^clock-(?:[1-9]|1[0-2])$/.test(value))) {
    addAlias(aliases, sourceNames, name, 'clock', 'clock-face');
  }

  // Keep one speech-bubble silhouette when both shapes expose the same state.
  for (const name of names.filter((value) => value.startsWith('message-square'))) {
    const target = name.replace('message-square', 'message-circle');
    if (sourceNames.has(target)) {
      addAlias(aliases, sourceNames, name, target, 'bubble-shape');
    }
  }

  // Round user/contact/key silhouettes do not change the represented concept.
  for (const name of names) {
    let target = null;
    if (name.startsWith('user-round')) {
      target = name.replace('user-round', 'user');
    } else if (name === 'users-round') {
      target = 'users';
    } else if (name === 'contact-round') {
      target = 'contact';
    } else if (name === 'key-round') {
      target = 'key';
    }
    if (target !== null && sourceNames.has(target)) {
      addAlias(aliases, sourceNames, name, target, 'round-style');
    }
  }

  for (const [from, to] of Object.entries(SAME_MEANING_ALIASES)) {
    addAlias(aliases, sourceNames, from, to, 'same-meaning');
  }

  return aliases;
};
