// Groan tube voice, modelled on real recordings.
//
// What a groan tube actually does (measured from recordings of real ones): a reed in
// the sliding weight buzzes at a nearly fixed, bright pitch (~300-330 Hz, harmonics up
// to ~5 kHz). The "groan" is the tube's air column changing length as the weight
// slides, which sweeps its resonances across the reed's harmonics. One way the column
// shrinks and the resonances climb; the other way it grows and they fall, and the
// pitch drifts a few percent up or down with them. A full fall takes under a second.
//
// The model itself runs in an AudioWorklet (public/groan-processor.js). This file
// drives it from the weight's position and speed.

export interface Preset {
  id: string;
  name: string;
  /** Reed pitch (Hz) at the start of a fall. */
  pitch: number;
  /** Tube length in metres (a real groan tube is ~40 cm). */
  tube: number;
  /** How resonant the tube is (0..0.98); higher is a stronger, more vowel-like sweep. */
  resonance: number;
  /** Wall damping (0..1); higher is darker. */
  damping: number;
  /** Brightness of the reed: harmonic roll-off exponent. */
  rolloff: number;
  level: number;
  /** Flipping back (air through the reed the other way). */
  reverse: { pitch: number; level: number };
  /** Pitch drift over a fall, as a fraction: forward climbs, reverse sags. */
  drift: number;
}

export const PRESETS: Preset[] = [
  {
    id: "groan",
    name: "Groan",
    pitch: 318,
    tube: 0.4,
    resonance: 0.82,
    damping: 0.12,
    rolloff: 0.2,
    level: 1,
    reverse: { pitch: 0.96, level: 0.85 },
    drift: 0.035,
  },
  {
    id: "big",
    name: "Big tube",
    pitch: 205,
    tube: 0.65,
    resonance: 0.84,
    damping: 0.18,
    rolloff: 0.3,
    level: 1,
    reverse: { pitch: 0.96, level: 0.85 },
    drift: 0.035,
  },
  {
    id: "moo",
    name: "Moo",
    pitch: 150,
    tube: 0.5,
    resonance: 0.78,
    damping: 0.45,
    rolloff: 0.9,
    level: 1.2,
    // A moo can only sounds one way.
    reverse: { pitch: 1, level: 0 },
    drift: -0.12,
  },
];

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
/**
 * The air column never gets very short: the weight and end caps take up room, and
 * measured recordings stay roughly within 7-25 cm in a 40 cm tube. Fractions of the tube length.
 */
const MIN_COLUMN = 0.17;
const MAX_COLUMN = 0.6;

export function createAudioContext(): AudioContext {
  const Ctx: typeof AudioContext =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  return new Ctx({ latencyHint: "interactive" });
}

export class GroanVoice {
  readonly ctx: BaseAudioContext;
  private preset: Preset = PRESETS[0];
  private node: AudioWorkletNode;
  private f0: AudioParam;
  private length: AudioParam;
  private level: AudioParam;
  private master: GainNode;
  private noise: AudioBuffer;
  private jitter = 0;

  /** Last pitch sent to the reed, for the readout. */
  pitchHz = 0;

  /** Loads the worklet; the context must support AudioWorklet (iOS 14.5+). */
  static async create(ctx: BaseAudioContext): Promise<GroanVoice> {
    await ctx.audioWorklet.addModule(`${import.meta.env.BASE_URL}groan-processor.js`);
    return new GroanVoice(ctx);
  }

  private constructor(ctx: BaseAudioContext) {
    this.ctx = ctx;
    this.noise = makeNoise(ctx, 1);
    this.node = new AudioWorkletNode(ctx, "groan-processor", {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    });
    const p = this.node.parameters;
    this.f0 = p.get("f0")!;
    this.length = p.get("length")!;
    this.level = p.get("level")!;

    // Phone speakers can't do much down low; trimming it keeps them clean.
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 110;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.knee.value = 10;
    comp.ratio.value = 4;
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.node.connect(hp).connect(comp).connect(this.master).connect(ctx.destination);

    this.setPreset(this.preset);
  }

  setPreset(p: Preset) {
    this.preset = p;
    const now = this.ctx.currentTime;
    this.node.parameters.get("feedback")!.setValueAtTime(-p.resonance, now);
    this.node.parameters.get("damping")!.setValueAtTime(p.damping, now);
    this.f0.setValueAtTime(p.pitch, now);
    this.length.setValueAtTime(p.tube, now);

    // Reed spectrum: weak fundamental, strong low harmonics, bright up to ~6 kHz.
    const top = p.pitch * 1.1;
    const count = Math.max(4, Math.floor(8000 / top));
    const harmonics: number[] = [];
    for (let k = 1; k <= count; k++) {
      const shelf = 1 / (1 + Math.pow((k * top) / 4600, 6));
      harmonics.push((k === 1 ? 0.25 : k === 2 ? 0.45 : 1 / Math.pow(k, p.rolloff)) * shelf);
    }
    this.node.port.postMessage({ harmonics });
  }

  get current() {
    return this.preset;
  }

  /**
   * @param flow 0..1, how fast air is moving through the reed
   * @param travel 0..1, how far the weight is through its current fall
   * @param direction -1 falling toward the top of the phone (forward), +1 toward the bottom
   */
  update(flow: number, travel: number, direction: number) {
    const p = this.preset;
    const now = this.ctx.currentTime;
    const t = clamp01(travel);
    const reverse = direction > 0;

    let level = flow < 0.03 ? 0 : Math.pow(clamp01(flow), 0.8) * p.level;
    if (reverse) level *= p.reverse.level;

    if (level === 0) {
      // Let it die away at its last pitch and length.
      this.level.setTargetAtTime(0, now, 0.025);
      this.pitchHz = 0;
      return;
    }

    // Forward: the air column ahead of the weight shrinks, resonances climb.
    // Reverse: the column behind it grows, resonances fall.
    const frac = reverse ? t : 1 - t;
    const column = p.tube * (MIN_COLUMN + (MAX_COLUMN - MIN_COLUMN) * frac);

    this.jitter += (Math.random() - 0.5) * 0.002 - this.jitter * 0.1;
    const pitch =
      p.pitch *
      (reverse ? p.reverse.pitch * (1 - p.drift * t) : 1 + p.drift * t) *
      (0.98 + 0.02 * flow) *
      (1 + this.jitter);
    this.pitchHz = pitch;

    this.f0.setTargetAtTime(pitch, now, 0.02);
    this.length.setTargetAtTime(column, now, 0.012);
    this.level.setTargetAtTime(level * 1.3, now, 0.015);
  }

  /** The weight hitting the end cap. */
  thunk(strength: number) {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const s = clamp01(strength);

    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1800;
    bp.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.35 * s + 0.01, now + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
    src.connect(bp).connect(g).connect(this.master);
    src.start(now, Math.random() * 0.5);
    src.stop(now + 0.07);

    const knock = ctx.createOscillator();
    knock.frequency.setValueAtTime(260, now);
    knock.frequency.exponentialRampToValueAtTime(120, now + 0.05);
    const kg = ctx.createGain();
    kg.gain.setValueAtTime(0.0001, now);
    kg.gain.exponentialRampToValueAtTime(0.3 * s + 0.01, now + 0.002);
    kg.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
    knock.connect(kg).connect(this.master);
    knock.start(now);
    knock.stop(now + 0.08);
  }

  /** Cut the sound instantly and unhook it from the speakers. */
  kill() {
    const now = this.ctx.currentTime;
    for (const g of [this.master.gain, this.level]) {
      g.cancelScheduledValues(now);
      g.setValueAtTime(0, now);
    }
    this.node.port.postMessage("stop");
    this.master.disconnect();
    this.pitchHz = 0;
  }
}

function makeNoise(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}
