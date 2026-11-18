// input.js — keyboard and pointer state. The game polls `keys` each frame and uses
// edge-triggered `pressed` for one-shot actions (enter car, punch, pause, accept).

export const keys = new Set();
export const pressed = new Set();
export const pointer = { x: 0, y: 0, down: false, clicked: false };

const GAME_KEYS = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space',
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'KeyF', 'KeyM', 'KeyP', 'KeyJ',
  'ShiftLeft', 'ShiftRight', 'Enter', 'Escape',
]);

export function initInput(canvas) {
  addEventListener('keydown', (e) => {
    if (GAME_KEYS.has(e.code)) e.preventDefault();
    if (!e.repeat) pressed.add(e.code);
    keys.add(e.code);
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => { keys.clear(); pointer.down = false; });
  canvas.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    pointer.x = ((e.clientX - r.left) / r.width) * canvas.width;
    pointer.y = ((e.clientY - r.top) / r.height) * canvas.height;
  });
  canvas.addEventListener('pointerdown', () => { pointer.down = true; pointer.clicked = true; });
  addEventListener('pointerup', () => { pointer.down = false; });
}

export const down = (code) => keys.has(code);
export const hit = (code) => pressed.has(code);
export function endFrame() {
  pressed.clear();
  pointer.clicked = false;
}

// Movement axes from WASD or arrows: x in -1..1, y in -1..1 (up is -1).
export function moveAxes() {
  const x = (down('KeyD') || down('ArrowRight') ? 1 : 0) - (down('KeyA') || down('ArrowLeft') ? 1 : 0);
  const y = (down('KeyS') || down('ArrowDown') ? 1 : 0) - (down('KeyW') || down('ArrowUp') ? 1 : 0);
  return { x, y };
}
