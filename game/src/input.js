// Keyboard and mouse state for Neon Palms. Held controls are polled from
// `keys` each frame; one-shot presses land in `pressed`, which the main loop
// clears at the end of every frame so a tap is seen exactly once. Mouse
// position is tracked in canvas pixels (the stage is a fixed 1280x720 and
// CSS scales it), so aiming stays true at any window size.

export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.pressed = new Set();
    this.mouseX = 640;
    this.mouseY = 360;
    this.mouseDown = false;
    this.mouseClicked = false;

    window.addEventListener('keydown', (e) => {
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseDown = false;
    });
    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      this.mouseX = ((e.clientX - rect.left) / rect.width) * canvas.width;
      this.mouseY = ((e.clientY - rect.top) / rect.height) * canvas.height;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.mouseDown = true;
        this.mouseClicked = true;
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
    });
  }

  /** True while any of the given keys is held. */
  down(...codes) {
    return codes.some((c) => this.keys.has(c));
  }

  /** True only on the frame a given key was first pressed. */
  hit(...codes) {
    return codes.some((c) => this.pressed.has(c));
  }

  /** Called by the main loop after each frame's update has consumed input. */
  endFrame() {
    this.pressed.clear();
    this.mouseClicked = false;
  }
}
