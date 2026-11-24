import "./style.css";
import { GroanVoice, PRESETS, createAudioContext, type Preset } from "./audio";
import { Slider, TERMINAL_SPEED } from "./physics";
import { Stats } from "./stats";
import { mountStatsView } from "./stats-view";

type PermissionFn = () => Promise<"granted" | "denied">;
type OrientationCtor = typeof DeviceOrientationEvent & { requestPermission?: PermissionFn };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const tubeEl = $("tube");
const bodyEl = $("tube-body");
const sliderEl = $("slider");
const startEl = $("start");
const startBtn = $<HTMLButtonElement>("start-btn");
const startNote = $("start-note");
const presetsEl = $("presets");
const fallbackEl = $("fallback");
const flipBtn = $<HTMLButtonElement>("flip");
const motionBtn = $<HTMLButtonElement>("enable-motion");
const hintEl = $("fallback-hint");
const rTilt = $("r-tilt");
const rFlow = $("r-flow");
const rPitch = $("r-pitch");
const diagEl = $("diag");

const STORAGE_KEY = "groan-tubes:preset";
const stats = new Stats();
const statsView = mountStatsView(stats, PRESETS);
document.querySelector("footer")!.prepend(statsView.strip);
const slider = new Slider();
let voice: GroanVoice | null = null;
let audio: AudioContext | null = null;
let preset: Preset = loadPreset();

// Tilt sources. With a sensor we use the device's beta (front-to-back rotation);
// sin(beta) is the gravity component along the phone's long axis, whatever the
// side-to-side roll. Without one, a virtual angle you drag or flip.
let sensorActive = false;
let beta = 90;
let gravity = 1; // smoothed
let virtualAngle = 0; // degrees, 0 = upright
let flipAnim: { from: number; to: number; t0: number } | null = null;

// ---------- presets ----------

function loadPreset(): Preset {
  try {
    const id = localStorage.getItem(STORAGE_KEY);
    return PRESETS.find((p) => p.id === id) ?? PRESETS[0];
  } catch {
    return PRESETS[0];
  }
}

function renderPresets() {
  document.body.dataset.skin = preset.id;
  presetsEl.replaceChildren(
    ...PRESETS.map((p) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip";
      b.textContent = p.name;
      b.setAttribute("role", "radio");
      b.setAttribute("aria-checked", String(p.id === preset.id));
      b.addEventListener("click", () => {
        preset = p;
        voice?.setPreset(p);
        try {
          localStorage.setItem(STORAGE_KEY, p.id);
        } catch {
          /* private mode */
        }
        renderPresets();
      });
      return b;
    }),
  );
}
renderPresets();

// ---------- start / permissions ----------

const Orientation = (window as unknown as { DeviceOrientationEvent?: OrientationCtor })
  .DeviceOrientationEvent;
if (!window.isSecureContext) {
  startNote.textContent = "Motion sensors need HTTPS — open the https:// link.";
}

type MotionState = "granted" | "denied" | "not-needed";

/**
 * iOS only shows the motion prompt if requestPermission() is called synchronously
 * inside a tap. Any `await` before it ends the gesture and the call is rejected
 * without a prompt, so this must run before anything async.
 */
function requestMotionPermission(): Promise<MotionState> {
  if (!Orientation || typeof Orientation.requestPermission !== "function") {
    return Promise.resolve("not-needed");
  }
  return Orientation.requestPermission().catch(() => "denied" as const);
}

startBtn.addEventListener("click", () => {
  startBtn.disabled = true;
  const permission = requestMotionPermission(); // first, while the tap is still live

  // iOS: let Web Audio play even when the ringer switch is on silent.
  const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
  if (session) session.type = "playback";

  let ctx: AudioContext;
  try {
    ctx = audio = createAudioContext();
    void ctx.resume(); // inside the tap, so iOS unlocks audio
  } catch (err) {
    startNote.textContent = "Couldn't start audio on this device.";
    startBtn.disabled = false;
    console.error(err);
    return;
  }
  GroanVoice.create(ctx)
    .then((v) => {
      if (audio !== ctx) return v.kill(); // page was hidden while loading
      v.setPreset(preset);
      voice = v;
      measureClock(ctx, v);
    })
    .catch((err) => {
      console.error(err);
      stopAudio();
      startNote.textContent = "Couldn't load the sound engine on this browser.";
    });

  window.addEventListener("deviceorientation", onOrientation);
  startEl.classList.add("hidden");
  requestWakeLock();
  void permission.then(watchForSensor);
});

/** After permission settles, fall back to touch if no readings arrive. */
function watchForSensor(state: MotionState) {
  if (state === "denied") {
    enableFallback("Motion access is off — tap Enable motion, or quit and reopen Safari");
    return;
  }
  setTimeout(() => {
    if (!sensorActive) enableFallback("No motion sensor — drag or ← → to tilt");
  }, 1200);
}

function onOrientation(e: DeviceOrientationEvent) {
  if (e.beta == null) return;
  if (!sensorActive) {
    sensorActive = true;
    fallbackEl.hidden = true;
    document.body.classList.remove("virtual");
  }
  beta = e.beta;
}

// ---------- fallback controls (desktop / no sensor) ----------

function enableFallback(message: string) {
  if (sensorActive) return;
  hintEl.textContent = message;
  motionBtn.hidden = !Orientation || typeof Orientation.requestPermission !== "function";
  fallbackEl.hidden = false;
  document.body.classList.add("virtual");
}

// A second chance at the iOS prompt, from a fresh tap.
motionBtn.addEventListener("click", () => {
  void requestMotionPermission().then(watchForSensor);
});

let dragX: number | null = null;
const stage = $("stage");
stage.addEventListener("pointerdown", (e) => {
  if (sensorActive) return;
  dragX = e.clientX;
  stage.setPointerCapture(e.pointerId);
});
stage.addEventListener("pointermove", (e) => {
  if (dragX == null) return;
  virtualAngle += (e.clientX - dragX) * 0.6;
  dragX = e.clientX;
  flipAnim = null;
});
const endDrag = () => (dragX = null);
stage.addEventListener("pointerup", endDrag);
stage.addEventListener("pointercancel", endDrag);

function flip() {
  const base = flipAnim ? flipAnim.to : virtualAngle;
  flipAnim = { from: virtualAngle, to: base + 180, t0: performance.now() };
}
flipBtn.addEventListener("click", flip);
window.addEventListener("keydown", (e) => {
  if (sensorActive || !voice) return;
  if (e.key === " " || e.key === "Enter") {
    e.preventDefault();
    flip();
  } else if (e.key === "ArrowLeft") {
    virtualAngle -= 15;
  } else if (e.key === "ArrowRight") {
    virtualAngle += 15;
  }
});

// ---------- main loop ----------

let last = 0;
let lastReadout = 0;

function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (flipAnim) {
    const t = Math.min(1, (now - flipAnim.t0) / 380);
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    virtualAngle = flipAnim.from + (flipAnim.to - flipAnim.from) * e;
    if (t >= 1) flipAnim = null;
  }

  const raw = sensorActive
    ? Math.sin((beta * Math.PI) / 180)
    : Math.cos((virtualAngle * Math.PI) / 180);
  gravity += (raw - gravity) * (1 - Math.exp(-dt / 0.04));

  const impact = slider.step(dt, gravity);
  if (voice) {
    voice.update(slider.flow, slider.travel, slider.direction);
    if (impact > 0.2) {
      voice.thunk(impact);
      stats.impact(impact * TERMINAL_SPEED * preset.tube);
      navigator.vibrate?.(Math.round(10 + impact * 25));
    }
  }
  // Only count while the app is actually running (after Tap to start).
  stats.tick(
    dt,
    now / 1000,
    !!voice && voice.pitchHz > 0,
    voice ? Math.abs(slider.vel) * dt * preset.tube : 0,
    preset.id,
  );

  render(now);
  requestAnimationFrame(frame);
}
requestAnimationFrame((t) => {
  last = t;
  frame(t);
});

function render(now: number) {
  const travelPx = bodyEl.clientHeight - sliderEl.offsetHeight;
  sliderEl.style.transform = `translate(-50%, ${slider.pos * travelPx}px)`;
  sliderEl.style.setProperty("--glow", slider.flow.toFixed(3));
  tubeEl.style.transform = sensorActive ? "" : `rotate(${virtualAngle}deg)`;

  if (now - lastReadout > 90) {
    lastReadout = now;
    const tilt = (Math.asin(Math.max(-1, Math.min(1, gravity))) * 180) / Math.PI;
    rTilt.textContent = `${tilt >= 0 ? "+" : "−"}${Math.abs(tilt).toFixed(0)}°`;
    rFlow.textContent = `${Math.round(slider.flow * 100)}%`;
    rPitch.textContent = voice && voice.pitchHz > 0 ? `${voice.pitchHz.toFixed(0)} Hz` : "—";
    statsView.update();
  }
}

// ---------- lifecycle ----------

let wakeLock: { release(): Promise<void> } | null = null;
async function requestWakeLock() {
  try {
    const wl = (navigator as unknown as { wakeLock?: { request(t: "screen"): Promise<{ release(): Promise<void> }> } }).wakeLock;
    wakeLock = (await wl?.request("screen")) ?? null;
  } catch {
    /* not supported or denied */
  }
}

/**
 * Some iOS setups run the audio hardware at a different rate than the AudioContext
 * reports, which plays everything slowed down (lower) or sped up. The context clock
 * advances with the hardware, so comparing it with the wall clock reveals the true
 * ratio. Re-checked a few times since iOS can switch rates (e.g. Bluetooth).
 */
function measureClock(ctx: AudioContext, v: GroanVoice) {
  const samples: [number, number][] = [];
  let applied = 1;
  const tick = () => {
    if (audio !== ctx || ctx.state !== "running") return;
    samples.push([performance.now() / 1000, ctx.currentTime]);
    if (samples.length > 20) samples.shift();
    if (samples.length >= 5) {
      const [w0, a0] = samples[0];
      const [w1, a1] = samples[samples.length - 1];
      if (w1 - w0 > 1.5) {
        const ratio = (a1 - a0) / (w1 - w0);
        const fix = Math.abs(ratio - 1) > 0.03 ? ratio : 1;
        if (Math.abs(fix - applied) > 0.01) {
          applied = fix;
          v.setPlaybackRate(fix);
        }
        diagEl.textContent = `${(ctx.sampleRate / 1000).toFixed(1)} kHz · clock ${ratio.toFixed(2)}×${fix !== 1 ? " (corrected)" : ""}`;
      }
    }
    setTimeout(tick, 250);
  };
  setTimeout(tick, 250);
}

/**
 * Tear audio down completely whenever the page is hidden, backgrounded or unloaded.
 * Only suspending the context mid-groan froze the voice at full volume, and iOS can
 * keep a suspended (or reloading) page's audio running. A closed context can't
 * restart, so coming back needs a tap to build a new one.
 */
function stopAudio() {
  if (!audio) return;
  voice?.kill();
  void audio.close().catch(() => {});
  audio = null;
  voice = null;
  void wakeLock?.release().catch(() => {});
  wakeLock = null;

  startBtn.textContent = "Tap to resume";
  startBtn.disabled = false;
  startEl.classList.remove("hidden");
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    stopAudio();
    stats.save();
  }
});
window.addEventListener("pagehide", () => {
  stopAudio();
  stats.save();
});
document.addEventListener("freeze", stopAudio);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
