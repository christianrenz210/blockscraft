// Keyboard + mouse (desktop) and virtual joystick + touch buttons (phone).
export const isTouchDevice =
  'ontouchstart' in window || navigator.maxTouchPoints > 0 || matchMedia('(pointer: coarse)').matches;

export class Input {
  /**
   * cb: { onBreakStart, onPlace, onPick, onSelect(i), onScroll(dir), onPause,
   *       onInventory, onToggleFly, onToggleDebug, canLook() }
   */
  constructor(canvas, cb) {
    this.canvas = canvas;
    this.cb = cb;
    this.keys = new Set();
    this.lookDX = 0;
    this.lookDY = 0;
    this.sensitivity = 1;
    this.breaking = false;
    this.placing = false;
    // touch state
    this.joy = { id: null, x: 0, y: 0, ox: 0, oy: 0 };
    this.touchJump = false;
    this.touchDown = false;
    this.lastSpace = 0;

    this.bindKeyboardMouse();
    if (isTouchDevice) this.bindTouch();
  }

  get state() {
    const k = this.keys;
    let forward = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    let strafe = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    let sprint = k.has('ControlLeft') || k.has('KeyR');
    if (this.joy.id !== null) {
      forward = -this.joy.y;
      strafe = this.joy.x;
      sprint = Math.hypot(this.joy.x, this.joy.y) > 0.95;
    }
    return {
      forward,
      strafe,
      sprint,
      jump: k.has('Space') || this.touchJump,
      down: k.has('ShiftLeft') || k.has('ShiftRight') || this.touchDown,
    };
  }

  consumeLook() {
    const r = { dx: this.lookDX, dy: this.lookDY };
    this.lookDX = 0;
    this.lookDY = 0;
    return r;
  }

  reset() {
    this.keys.clear();
    this.breaking = false;
    this.placing = false;
    this.touchJump = false;
    this.touchDown = false;
    this.joy.id = null;
    this.joy.x = this.joy.y = 0;
    const stick = document.getElementById('stick');
    if (stick) stick.style.transform = 'translate(-50%, -50%)';
  }

  // ------------------------------------------------------------ desktop
  bindKeyboardMouse() {
    const cb = this.cb;
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'Space') {
        const now = performance.now();
        if (now - this.lastSpace < 280) cb.onToggleFly();
        this.lastSpace = now;
      }
      if (e.code === 'KeyF') cb.onToggleFly();
      if (e.code === 'KeyE') cb.onInventory();
      if (e.code === 'F3' || e.code === 'KeyP') { e.preventDefault(); cb.onToggleDebug(); }
      if (e.code === 'Escape' && !document.pointerLockElement) cb.onPause();
      if (e.code.startsWith('Digit')) {
        const n = parseInt(e.code.slice(5), 10);
        if (n >= 1 && n <= 9) cb.onSelect(n - 1);
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.reset());

    this.canvas.addEventListener('mousedown', (e) => {
      if (isTouchDevice && e.sourceCapabilities?.firesTouchEvents) return;
      if (!document.pointerLockElement) {
        if (cb.canLook()) this.lockPointer();
        return;
      }
      if (e.button === 0) { this.breaking = true; cb.onBreakStart(); }
      if (e.button === 2) { this.placing = true; cb.onPlace(); }
      if (e.button === 1) { e.preventDefault(); cb.onPick(); }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.breaking = false;
      if (e.button === 2) this.placing = false;
    });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== this.canvas) return;
      this.lookDX += e.movementX * 0.0022 * this.sensitivity;
      this.lookDY += e.movementY * 0.0022 * this.sensitivity;
    });
    window.addEventListener('wheel', (e) => {
      if (document.pointerLockElement !== this.canvas) return;
      cb.onScroll(Math.sign(e.deltaY));
    }, { passive: true });
  }

  lockPointer() {
    if (isTouchDevice && !matchMedia('(pointer: fine)').matches) return;
    try {
      const p = this.canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    } catch (e) { /* ignore */ }
  }

  // ------------------------------------------------------------ touch
  bindTouch() {
    const cb = this.cb;
    const joyEl = document.getElementById('joystick');
    const stick = document.getElementById('stick');
    const lookZone = document.getElementById('look-zone');
    const RADIUS = 55;

    // Joystick
    joyEl.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      const r = joyEl.getBoundingClientRect();
      this.joy.id = t.identifier;
      this.joy.ox = r.left + r.width / 2;
      this.joy.oy = r.top + r.height / 2;
      this.moveJoy(t, stick, RADIUS);
    }, { passive: false });
    const joyMove = (e) => {
      for (const t of e.changedTouches) if (t.identifier === this.joy.id) this.moveJoy(t, stick, RADIUS);
    };
    const joyEnd = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.joy.id) {
          this.joy.id = null;
          this.joy.x = this.joy.y = 0;
          stick.style.transform = 'translate(-50%, -50%)';
        }
      }
    };
    joyEl.addEventListener('touchmove', (e) => { e.preventDefault(); joyMove(e); }, { passive: false });
    joyEl.addEventListener('touchend', joyEnd);
    joyEl.addEventListener('touchcancel', joyEnd);

    // Look zone: drag to look, tap to place, hold to break.
    const looks = new Map();
    lookZone.addEventListener('touchstart', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        const info = { x: t.clientX, y: t.clientY, sx: t.clientX, sy: t.clientY, start: performance.now(), moved: 0, holding: false };
        info.timer = setTimeout(() => {
          if (info.moved < 14) { info.holding = true; this.breaking = true; cb.onBreakStart(); }
        }, 320);
        looks.set(t.identifier, info);
      }
    }, { passive: false });
    lookZone.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        const info = looks.get(t.identifier);
        if (!info) continue;
        const dx = t.clientX - info.x, dy = t.clientY - info.y;
        info.x = t.clientX; info.y = t.clientY;
        info.moved = Math.max(info.moved, Math.hypot(t.clientX - info.sx, t.clientY - info.sy));
        this.lookDX += dx * 0.0055 * this.sensitivity;
        this.lookDY += dy * 0.0055 * this.sensitivity;
      }
    }, { passive: false });
    const lookEnd = (e) => {
      for (const t of e.changedTouches) {
        const info = looks.get(t.identifier);
        if (!info) continue;
        clearTimeout(info.timer);
        if (info.holding) this.breaking = [...looks.values()].some((o) => o !== info && o.holding);
        else if (e.type === 'touchend' && info.moved < 14 && performance.now() - info.start < 300) cb.onPlace();
        looks.delete(t.identifier);
      }
    };
    lookZone.addEventListener('touchend', lookEnd);
    lookZone.addEventListener('touchcancel', lookEnd);

    // Buttons
    const hold = (id, down, up) => {
      const el = document.getElementById(id);
      el.addEventListener('touchstart', (e) => { e.preventDefault(); el.classList.add('active'); down(); }, { passive: false });
      const end = (e) => { e.preventDefault(); el.classList.remove('active'); if (up) up(); };
      el.addEventListener('touchend', end, { passive: false });
      el.addEventListener('touchcancel', end, { passive: false });
    };
    hold('btn-jump', () => { this.touchJump = true; }, () => { this.touchJump = false; });
    hold('btn-down', () => { this.touchDown = true; }, () => { this.touchDown = false; });
    hold('btn-break', () => { this.breaking = true; cb.onBreakStart(); }, () => { this.breaking = false; });
    hold('btn-place', () => { this.placing = true; cb.onPlace(); }, () => { this.placing = false; });
    hold('btn-fly', () => cb.onToggleFly());
    hold('btn-pause', () => cb.onPause());
    hold('btn-inv', () => cb.onInventory());
  }

  moveJoy(t, stick, R) {
    let dx = t.clientX - this.joy.ox, dy = t.clientY - this.joy.oy;
    const d = Math.hypot(dx, dy);
    if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
    this.joy.x = dx / R;
    this.joy.y = dy / R;
    stick.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }
}
