// Progress saved between visits: cash, missions done, and where the player
// stood. A save never holds a car: the player wakes up on foot at the garage.

import { SAVE_KEY } from './config.js';

export function saveGame(state) {
  try {
    const data = {
      cash: state.cash,
      missionsDone: state.missionsDone,
      storyDone: state.storyDone,
      player: { x: state.player.x, y: state.player.y },
      kills: state.stats.copsDown,
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data.cash !== 'number' || !Array.isArray(data.missionsDone)) return null;
    return data;
  } catch {
    return null;
  }
}

export function hasSave() {
  return loadGame() !== null;
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // ignore
  }
}
