// The sliding weight inside the tube.
//
// Position runs 0 (top of the phone) to 1 (bottom). Gravity along the tube is
// g·sin(tilt): +1 when the phone is upright, −1 when it's upside down, 0 when level.
// Air drag in the tube means the weight quickly reaches a terminal speed, so we model
// velocity as easing toward (terminal speed × gravity component).

/** Tube lengths per second when the tube is vertical. */
export const TERMINAL_SPEED = 1.25;
/** How quickly the weight gets up to speed (seconds). */
const RESPONSE = 0.09;
/** Below this gravity component the weight sticks (static friction). */
const STICTION = 0.12;

export class Slider {
  pos = 1;
  vel = 0;

  /**
   * Advance the simulation.
   * @param gravity component of gravity along the tube, −1..1 (positive pulls toward the bottom)
   * @returns impact speed (0..1) if the weight hit an end cap this step, else 0
   */
  step(dt: number, gravity: number): number {
    const g = Math.abs(gravity) < STICTION && Math.abs(this.vel) < 0.05 ? 0 : gravity;
    const target = g * TERMINAL_SPEED;
    this.vel += (target - this.vel) * (1 - Math.exp(-dt / RESPONSE));
    this.pos += this.vel * dt;

    let impact = 0;
    if (this.pos >= 1) {
      this.pos = 1;
      if (this.vel > 0) {
        impact = this.vel / TERMINAL_SPEED;
        this.vel = 0;
      }
    } else if (this.pos <= 0) {
      this.pos = 0;
      if (this.vel < 0) {
        impact = -this.vel / TERMINAL_SPEED;
        this.vel = 0;
      }
    }
    return impact;
  }

  /** Air flow through the reed, 0..1. */
  get flow() {
    return Math.min(1, Math.abs(this.vel) / TERMINAL_SPEED);
  }

  /** +1 falling toward the bottom, −1 toward the top, 0 at rest. */
  get direction() {
    return Math.sign(this.vel);
  }

  /**
   * How far through the fall the weight is, 0..1. Measured against the whole tube so
   * a full flip always sweeps the full groan, and a partial tilt only part of it.
   */
  get travel() {
    if (this.vel > 0) return this.pos;
    if (this.vel < 0) return 1 - this.pos;
    return 0;
  }
}
