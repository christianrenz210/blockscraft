// localStorage persistence for the world save and settings.
const WORLD_KEY = 'blockscraft.world.v1';
const SETTINGS_KEY = 'blockscraft.settings.v1';

function read(key) {
  try {
    const s = localStorage.getItem(key);
    return s ? JSON.parse(s) : null;
  } catch (e) {
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.warn('Save failed', e);
    return false;
  }
}

export const loadWorld = () => read(WORLD_KEY);
export const saveWorld = (data) => write(WORLD_KEY, data);
export function deleteWorld() {
  try { localStorage.removeItem(WORLD_KEY); } catch (e) { /* ignore */ }
}

export function loadSettings(defaults) {
  return { ...defaults, ...(read(SETTINGS_KEY) || {}) };
}
export const saveSettings = (s) => write(SETTINGS_KEY, s);
