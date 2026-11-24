// localStorage persistence for Neon Palms: cash, story progress, hidden
// packages found, race best time and settings survive a reload. The save is
// versioned so an old shape never breaks a new build.

const SAVE_KEY = 'neon-palms-save-v1';

export function defaultSave() {
  return {
    money: 250,
    missionIndex: 0, // next story mission to offer; 7 = campaign complete
    packagesFound: [],
    racesWon: 0,
    raceBestMs: 0,
    totalEarned: 0,
    muted: false,
  };
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultSave();
    const parsed = JSON.parse(raw);
    const base = defaultSave();
    for (const key of Object.keys(base)) {
      if (parsed[key] !== undefined) base[key] = parsed[key];
    }
    return base;
  } catch {
    return defaultSave();
  }
}

export function storeSave(save) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // Private mode or quota: the game simply runs unsaved.
  }
}

export function wipeSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // Nothing to wipe.
  }
}
