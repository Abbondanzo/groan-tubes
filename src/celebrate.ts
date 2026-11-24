// Milestone celebrations: confetti, a banner and (if audio is on) a fanfare.
// Three tiers, each bigger than the last. Respects prefers-reduced-motion by
// skipping the confetti and keeping the banner.
import type { Milestone } from "./stats";

interface Tier {
  message: string;
  emoji: string;
  /** Confetti launches: [x origin 0..1, y origin 0..1, angle (deg, 0 = up), pieces, delay ms] */
  bursts: [number, number, number, number, number][];
  /** Extra confetti raining from the top for this many ms. */
  rainMs: number;
  colors: string[];
  vibrate: number[];
  bannerMs: number;
}

const PARTY = ["#f5a524", "#ff5fa2", "#2dd4bf", "#8b5cf6", "#ffffff", "#facc15"];
const GOLD = ["#facc15", "#fde68a", "#f5a524", "#fff7cc", "#d4a017"];

const TIERS: Record<Milestone, Tier> = {
  100: {
    message: "100 groans!",
    emoji: "💯",
    bursts: [[0.5, 1.02, 0, 130, 0]],
    rainMs: 0,
    colors: PARTY,
    vibrate: [30, 40, 30],
    bannerMs: 2600,
  },
  1000: {
    message: "1,000 groans!",
    emoji: "🎉",
    bursts: [
      [0, 1.02, 35, 160, 0],
      [1, 1.02, -35, 160, 0],
      [0.5, 1.02, 0, 140, 350],
    ],
    rainMs: 0,
    colors: PARTY,
    vibrate: [40, 50, 40, 50, 120],
    bannerMs: 3400,
  },
  10000: {
    message: "10,000 groans.\nLegendary.",
    emoji: "🏆",
    bursts: [
      [0, 1.02, 35, 200, 0],
      [1, 1.02, -35, 200, 0],
      [0.5, 1.02, 0, 200, 400],
      [0, 1.02, 30, 160, 900],
      [1, 1.02, -30, 160, 900],
    ],
    rainMs: 3500,
    colors: [...GOLD, ...PARTY],
    vibrate: [60, 60, 60, 60, 60, 60, 300],
    bannerMs: 5200,
  },
};

interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  w: number;
  h: number;
  color: string;
  wobble: number;
  life: number;
}

let canvas: HTMLCanvasElement | null = null;
let ctx2d: CanvasRenderingContext2D | null = null;
let pieces: Piece[] = [];
let running = false;
let rainUntil = 0;
let rainColors: string[] = PARTY;
let banner: HTMLElement | null = null;
let bannerTimer: number | undefined;

const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

export function tierIndex(n: Milestone): number {
  return n === 100 ? 0 : n === 1000 ? 1 : 2;
}

/** Celebrate reaching `n` groans. `fanfare` plays the sound if audio is running. */
export function celebrate(n: Milestone, fanfare?: (tier: number) => void) {
  const tier = TIERS[n];
  showBanner(`${tier.emoji} ${tier.message}`, tier.bannerMs, n === 10000);
  navigator.vibrate?.(tier.vibrate);
  fanfare?.(tierIndex(n));
  if (reducedMotion()) return;

  ensureCanvas();
  for (const [ox, oy, angle, count, delay] of tier.bursts) {
    window.setTimeout(() => launch(ox, oy, angle, count, tier.colors), delay);
  }
  if (tier.rainMs) {
    rainUntil = performance.now() + tier.rainMs;
    rainColors = tier.colors;
  }
  start();
}

function showBanner(text: string, ms: number, big: boolean) {
  if (!banner) {
    banner = document.createElement("div");
    banner.className = "milestone-banner";
    banner.setAttribute("role", "status");
    banner.setAttribute("aria-live", "polite");
    document.body.append(banner);
  }
  banner.textContent = text;
  banner.classList.toggle("big", big);
  banner.classList.remove("show");
  void banner.offsetWidth; // restart the entrance animation
  banner.classList.add("show");
  clearTimeout(bannerTimer);
  bannerTimer = window.setTimeout(() => banner?.classList.remove("show"), ms);
}

function ensureCanvas() {
  if (canvas) return;
  canvas = document.createElement("canvas");
  canvas.className = "confetti";
  canvas.setAttribute("aria-hidden", "true");
  document.body.append(canvas);
  ctx2d = canvas.getContext("2d");
  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas!.width = Math.round(innerWidth * dpr);
    canvas!.height = Math.round(innerHeight * dpr);
    ctx2d?.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  window.addEventListener("resize", resize);
}

function piece(x: number, y: number, vx: number, vy: number, colors: string[]): Piece {
  const size = 6 + Math.random() * 7;
  return {
    x,
    y,
    vx,
    vy,
    rot: Math.random() * Math.PI * 2,
    vr: (Math.random() - 0.5) * 14,
    w: size,
    h: size * (0.4 + Math.random() * 0.5),
    color: colors[(Math.random() * colors.length) | 0],
    wobble: Math.random() * Math.PI * 2,
    life: 0,
  };
}

function launch(ox: number, oy: number, angleDeg: number, count: number, colors: string[]) {
  const x = ox * innerWidth;
  const y = oy * innerHeight;
  // Fast enough to reach about 80% of the way up the screen.
  const speed = Math.sqrt(2 * 900 * innerHeight * 0.8);
  for (let i = 0; i < count; i++) {
    const a = ((angleDeg + (Math.random() - 0.5) * 50) * Math.PI) / 180;
    const v = speed * (0.55 + Math.random() * 0.5);
    pieces.push(piece(x, y, Math.sin(a) * v, -Math.cos(a) * v, colors));
  }
  start();
}

function start() {
  if (running) return;
  running = true;
  let last = performance.now();
  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (now < rainUntil) {
      for (let i = 0; i < 4; i++) {
        pieces.push(piece(Math.random() * innerWidth, -20, (Math.random() - 0.5) * 60, 60 + Math.random() * 120, rainColors));
      }
    }
    step(dt);
    if (pieces.length || now < rainUntil) requestAnimationFrame(frame);
    else {
      running = false;
      ctx2d?.clearRect(0, 0, innerWidth, innerHeight);
    }
  };
  requestAnimationFrame(frame);
}

function step(dt: number) {
  const c = ctx2d;
  if (!c) return;
  c.clearRect(0, 0, innerWidth, innerHeight);
  const keep: Piece[] = [];
  for (const p of pieces) {
    p.life += dt;
    p.vy += 900 * dt; // gravity
    p.vx *= Math.exp(-1.8 * dt); // air drag
    p.vy *= Math.exp(-1.2 * dt);
    p.wobble += dt * 8;
    p.x += (p.vx + Math.sin(p.wobble) * 30) * dt;
    p.y += p.vy * dt;
    p.rot += p.vr * dt;
    if (p.y > innerHeight + 40 || p.life > 8) continue;
    keep.push(p);
    c.save();
    c.translate(p.x, p.y);
    c.rotate(p.rot);
    c.scale(1, Math.cos(p.wobble)); // flutter as it tumbles
    c.fillStyle = p.color;
    c.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    c.restore();
  }
  pieces = keep;
}
