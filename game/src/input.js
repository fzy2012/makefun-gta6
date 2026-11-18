// Keyboard and mouse, read fresh every frame. Keys are tracked by code so the
// layout does not matter; the mouse is tracked in canvas pixels for aiming.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_INTERACT = 4;
export const ACTION_PUNCH = 8;
export const ACTION_MUTE = 16;

const GAME_KEYS = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space',
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'KeyM', 'Enter', 'Escape',
]);

export function createInput(canvas) {
  const down = new Set();
  const pressed = new Set();
  const mouse = { x: 0, y: 0, clicked: false, down: false };

  function onKeyDown(event) {
    if (GAME_KEYS.has(event.code)) event.preventDefault();
    if (!event.repeat) pressed.add(event.code);
    down.add(event.code);
  }
  function onKeyUp(event) {
    down.delete(event.code);
  }
  function onMouseMove(event) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * canvas.width;
    mouse.y = ((event.clientY - rect.top) / rect.height) * canvas.height;
  }
  function onMouseDown(event) {
    onMouseMove(event);
    mouse.down = true;
    mouse.clicked = true;
  }
  function onMouseUp() {
    mouse.down = false;
  }
  function onBlur() {
    down.clear();
    mouse.down = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);

  return {
    /** -1, 0 or 1 on each axis, from WASD or the arrow keys. */
    axes() {
      const x = (down.has('KeyD') || down.has('ArrowRight') ? 1 : 0)
        - (down.has('KeyA') || down.has('ArrowLeft') ? 1 : 0);
      const y = (down.has('KeyS') || down.has('ArrowDown') ? 1 : 0)
        - (down.has('KeyW') || down.has('ArrowUp') ? 1 : 0);
      return { x, y };
    },
    /** True while the mouse button is held (for holding fire). */
    mouseDown() {
      return mouse.down;
    },
    mouse() {
      return { x: mouse.x, y: mouse.y };
    },
    /** Edge-triggered actions pressed since the last call; clears them. */
    takeActions() {
      let actions = 0;
      if (pressed.has('Enter') || pressed.has('Space')) actions |= ACTION_CONFIRM;
      if (pressed.has('Escape') || pressed.has('KeyP')) actions |= ACTION_PAUSE;
      if (pressed.has('KeyE')) actions |= ACTION_INTERACT;
      if (pressed.has('Space')) actions |= ACTION_PUNCH;
      if (pressed.has('KeyM')) actions |= ACTION_MUTE;
      if (mouse.clicked) {
        actions |= ACTION_CONFIRM;
        mouse.clicked = false;
      }
      pressed.clear();
      return actions;
    },
    /** True once if the key was pressed since the last check. */
    consume(code) {
      if (pressed.has(code)) {
        pressed.delete(code);
        return true;
      }
      return false;
    },
    destroy() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
    },
  };
}
